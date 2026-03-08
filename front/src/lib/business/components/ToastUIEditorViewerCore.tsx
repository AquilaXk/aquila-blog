"use client";

import "@toast-ui/editor/dist/toastui-editor.css";
import "@toast-ui/editor/dist/theme/toastui-editor-dark.css";

import chartPlugin from "@toast-ui/editor-plugin-chart";
// @ts-expect-error - 타입 정보 없음
import codeSyntaxHighlight from "@toast-ui/editor-plugin-code-syntax-highlight/dist/toastui-editor-plugin-code-syntax-highlight-all";
import tableMergedCell from "@toast-ui/editor-plugin-table-merged-cell";

import "@toast-ui/chart/dist/toastui-chart.css";
import "@toast-ui/editor-plugin-table-merged-cell/dist/toastui-editor-plugin-table-merged-cell.css";

import { forwardRef, useEffect, useMemo } from "react";

import { Viewer } from "@toast-ui/react-editor";

import {
  convertCodeBlocksToDiagramSyntax,
  processMarkdownContent,
} from "../markdownUtils";
import { filterObjectKeys, getParamsFromUrl, isExternalUrl } from "../utils";

// ─── PlantUML 인코딩 함수 ───────────────────────────────
function encodePlantUML(text: string): string {
  // PlantUML uses a custom encoding: deflate -> base64 variant
  // 간단한 방식: hex encoding 사용 (~h prefix)
  const hex = Array.from(new TextEncoder().encode(text))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return "~h" + hex;
}

// ─── Mermaid 인코딩 함수 (mermaid.ink 서버용) ───────────
function encodeMermaid(text: string): string {
  const json = JSON.stringify({
    code: text,
    mermaid: { theme: "default" },
  });
  const bytes = new TextEncoder().encode(json);
  const binary = Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join("");
  return btoa(binary);
}

// ─── 플러그인: $$uml ... $$ → PlantUML 이미지 ──────────
function umlPlugin() {
  const toHTMLRenderers = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    uml(node: any) {
      const encoded = encodePlantUML(node.literal);
      const imgUrl = `https://www.plantuml.com/plantuml/svg/${encoded}`;
      return [
        {
          type: "openTag",
          tagName: "div",
          outerNewLine: true,
          attributes: { class: "diagram-container my-4" },
        },
        {
          type: "html",
          content: `<img src="${imgUrl}" alt="PlantUML Diagram" style="max-width: 100%;" />`,
        },
        { type: "closeTag", tagName: "div", outerNewLine: true },
      ];
    },
  };

  return { toHTMLRenderers };
}

// ─── 플러그인: $$mermaid ... $$ → Mermaid 이미지 ────────
// mermaid.ink SVG 버그 보정:
// foreignObject의 width가 실제 텍스트보다 좁게 계산되어 마지막 글자가 잘리는 문제를
// SVG fetch → foreignObject width 패치로 해결
function resolveMermaidWidths() {
  if (typeof document === "undefined") return;
  const imgs = document.querySelectorAll<HTMLImageElement>(
    "img[data-mermaid-png]",
  );
  imgs.forEach(async (svgImg) => {
    if (svgImg.dataset.mermaidResolved) return;
    svgImg.dataset.mermaidResolved = "1";

    try {
      const resp = await fetch(svgImg.src);
      let svgText = await resp.text();
      const viewBoxMatch = svgText.match(/viewBox="([^"]+)"/);
      if (!viewBoxMatch) throw new Error("no viewBox");

      const [, , vbW] = viewBoxMatch[1].split(/\s+/).map(Number);

      // 1) SVG inline max-width 제거 (중앙정렬 시 치우침 방지)
      svgText = svgText.replace(
        /style="[^"]*max-width:\s*[\d.]+px;?[^"]*"/,
        'style=""',
      );

      // 2) nodeLabel foreignObject width가 텍스트보다 좁은 버그 보정
      // width를 4px 넓혀서 마지막 글자가 잘리지 않도록 함
      const foWidthBump = 4;
      svgText = svgText.replace(
        /<foreignObject\s+width="([\d.]+)"\s+height="([\d.]+)">/g,
        (match, w, h) => {
          const nw = parseFloat(w);
          if (nw > 0) {
            return `<foreignObject width="${nw + foWidthBump}" height="${h}">`;
          }
          return match;
        },
      );

      const blob = new Blob([svgText], { type: "image/svg+xml" });
      const prevSrc = svgImg.src;
      svgImg.src = URL.createObjectURL(blob);
      if (prevSrc.startsWith("blob:")) URL.revokeObjectURL(prevSrc);
      svgImg.width = Math.round(vbW);
    } catch {
      // SVG fetch/파싱 실패 시 PNG 프로브로 폴백
      const pngUrl = svgImg.dataset.mermaidPng;
      if (pngUrl) {
        const probe = new Image();
        probe.onload = () => {
          svgImg.width = probe.naturalWidth;
        };
        probe.src = pngUrl;
      }
    }
  });
}

function mermaidPlugin() {
  const toHTMLRenderers = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mermaid(node: any) {
      const encoded = encodeMermaid(node.literal);
      const svgUrl = `https://mermaid.ink/svg/${encoded}`;
      const pngUrl = `https://mermaid.ink/img/${encoded}`;
      return [
        {
          type: "openTag",
          tagName: "div",
          outerNewLine: true,
          attributes: { class: "diagram-container my-4" },
        },
        {
          type: "html",
          content: `<img src="${svgUrl}" alt="Mermaid Diagram" data-mermaid-png="${pngUrl}" width="500" style="max-width: 100%; max-height: 100%;" />`,
        },
        { type: "closeTag", tagName: "div", outerNewLine: true },
      ];
    },
  };

  return { toHTMLRenderers };
}

// ─── 플러그인: $$youtube ... $$ → YouTube 임베드 ────────
// (원본 slog_2025_04에서 포팅, URL 파라미터 지원: margin-left, margin-right, max-width)
function youtubePlugin() {
  const toHTMLRenderers = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    youtube(node: any) {
      const html = renderYoutube(node.literal);
      return [
        { type: "openTag", tagName: "div", outerNewLine: true },
        { type: "html", content: html },
        { type: "closeTag", tagName: "div", outerNewLine: true },
      ];
    },
  };

  function renderYoutube(url: string) {
    url = url.replace("https://www.youtube.com/watch?v=", "");
    url = url.replace("http://www.youtube.com/watch?v=", "");
    url = url.replace("www.youtube.com/watch?v=", "");
    url = url.replace("youtube.com/watch?v=", "");
    url = url.replace("https://youtu.be/", "");
    url = url.replace("http://youtu.be/", "");
    url = url.replace("youtu.be/", "");

    const urlParams = getParamsFromUrl(url);

    const ratio = "aspect-[16/9]";
    let marginLeft = "auto";

    if (urlParams["margin-left"]) {
      marginLeft = urlParams["margin-left"];
    }

    let marginRight = "auto";

    if (urlParams["margin-right"]) {
      marginRight = urlParams["margin-right"];
    }

    let maxWidth = "800";
    if (urlParams["max-width"]) {
      maxWidth = urlParams["max-width"];
    }

    let youtubeId = url;

    if (youtubeId.indexOf("?") !== -1) {
      const pos = url.indexOf("?");
      youtubeId = youtubeId.substring(0, pos);
    }

    return (
      '<div style="max-width:' +
      maxWidth +
      "px; margin-left:" +
      marginLeft +
      "; margin-right:" +
      marginRight +
      ';" class="' +
      ratio +
      ' relative my-4"><iframe class="absolute top-0 left-0 w-full h-full" src="https://www.youtube.com/embed/' +
      youtubeId +
      '" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>'
    );
  }

  return { toHTMLRenderers };
}

// ─── 플러그인: $$codepen ... $$ → CodePen 임베드 ────────
// (원본 slog_2025_04에서 포팅, URL 파라미터 지원: height, width)
function codepenPlugin() {
  const toHTMLRenderers = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    codepen(node: any) {
      const html = renderCodepen(node.literal);
      return [
        { type: "openTag", tagName: "div", outerNewLine: true },
        { type: "html", content: html },
        { type: "closeTag", tagName: "div", outerNewLine: true },
      ];
    },
  };

  function renderCodepen(url: string) {
    const urlParams = getParamsFromUrl(url);

    let height = "400";

    if (urlParams.height) {
      height = urlParams.height;
    }

    let width = "100%";

    if (urlParams.width) {
      width = urlParams.width;
    }

    if (!width.includes("px") && !width.includes("%")) {
      width += "px";
    }

    let iframeUri = url;

    if (iframeUri.indexOf("#") !== -1) {
      const pos = iframeUri.indexOf("#");
      iframeUri = iframeUri.substring(0, pos);
    }

    return (
      '<iframe class="my-4" height="' +
      height +
      '" style="width: ' +
      width +
      ';" title="" src="' +
      iframeUri +
      '" allowtransparency="true" allowfullscreen="true"></iframe>'
    );
  }
  return { toHTMLRenderers };
}

// ─── 플러그인: $$katex ... $$ → 수식 이미지 ────────────
// KaTeX 서버사이드 렌더링 (외부 의존성 없이 이미지로 처리)
function katexPlugin() {
  const toHTMLRenderers = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    katex(node: any) {
      const expression = (node.literal || "").trim();
      const encoded = encodeURIComponent(expression);
      const imgUrl = `https://math.vercel.app?from=${encoded}`;
      return [
        {
          type: "openTag",
          tagName: "div",
          outerNewLine: true,
          attributes: { class: "diagram-container katex-container my-4" },
        },
        {
          type: "html",
          content: `<img src="${imgUrl}" alt="Math: ${expression.replace(/"/g, "&quot;").slice(0, 100)}" style="max-width: 100%;" />`,
        },
        { type: "closeTag", tagName: "div", outerNewLine: true },
      ];
    },
  };

  return { toHTMLRenderers };
}

// ─── 플러그인: $$hide ... $$ → 콘텐츠 숨김 ─────────────
function hidePlugin() {
  const toHTMLRenderers = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
    hide(node: any) {
      return [
        { type: "openTag", tagName: "div", outerNewLine: true },
        { type: "html", content: "" },
        { type: "closeTag", tagName: "div", outerNewLine: true },
      ];
    },
  };

  return { toHTMLRenderers };
}

// ─── 플러그인: $$ppt ... $$ → PPT 블록 숨김 ────────────
function pptPlugin() {
  const toHTMLRenderers = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
    ppt(node: any) {
      return [
        { type: "openTag", tagName: "div", outerNewLine: true },
        { type: "html", content: "" },
        { type: "closeTag", tagName: "div", outerNewLine: true },
      ];
    },
  };

  return { toHTMLRenderers };
}

// ─── 플러그인: $$config ... $$ → 설정 블록 숨김 ─────────
function configPlugin() {
  const toHTMLRenderers = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
    config(node: any) {
      return [
        { type: "openTag", tagName: "div", outerNewLine: true },
        { type: "html", content: "" },
        { type: "closeTag", tagName: "div", outerNewLine: true },
      ];
    },
  };

  return { toHTMLRenderers };
}

// ─── 컴포넌트 ───────────────────────────────────────────

export interface ToastUIEditorViewerCoreProps {
  initialValue: string;
  theme: "dark" | "light";
  postId?: string | number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ToastUIEditorViewerCore = forwardRef<any, ToastUIEditorViewerCoreProps>(
  (props, ref) => {
    // 1. 코드 블록 다이어그램 문법 변환 (```uml -> $$uml$$, ```youtube -> $$youtube$$ 등)
    // 2. surl: 링크 처리
    const processedContent = useMemo(() => {
      let content = convertCodeBlocksToDiagramSyntax(props.initialValue);
      if (props.postId) {
        content = processMarkdownContent(content, props.postId);
      }
      return content;
    }, [props.initialValue, props.postId]);

    // Mermaid SVG에 PNG 기반 실제 너비 세팅
    useEffect(() => {
      // Viewer 렌더링 후 약간의 딜레이를 주어 DOM에 img가 생긴 뒤 실행
      const timer = setTimeout(resolveMermaidWidths, 100);
      return () => clearTimeout(timer);
    }, [processedContent]);

    return (
      <Viewer
        theme={props.theme}
        plugins={[
          youtubePlugin,
          codepenPlugin,
          katexPlugin,
          umlPlugin,
          mermaidPlugin,
          hidePlugin,
          pptPlugin,
          configPlugin,
          [
            chartPlugin,
            {
              minWidth: 100,
              maxWidth: 800,
              minHeight: 100,
              maxHeight: 400,
            },
          ],
          codeSyntaxHighlight,
          tableMergedCell,
        ]}
        ref={ref}
        initialValue={processedContent}
        customHTMLRenderer={{
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          heading(node: any, { entering, getChildrenText }: any) {
            return {
              type: entering ? "openTag" : "closeTag",
              tagName: `h${node.level}`,
              attributes: {
                id: getChildrenText(node).trim().replaceAll(" ", "-"),
              },
            };
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          link(node: any, { entering }: any) {
            return {
              type: entering ? "openTag" : "closeTag",
              tagName: `a`,
              attributes: {
                href: node.destination,
                target: isExternalUrl(node.destination) ? "_blank" : "_self",
              },
            };
          },
          htmlBlock: {
            // iframe 속성 필터링 (보안)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            iframe(node: any) {
              const newAttrs = filterObjectKeys(node.attrs, [
                "src",
                "width",
                "height",
                "allow",
                "allowfullscreen",
                "frameborder",
                "scrolling",
                "class",
              ]);
              return [
                {
                  type: "openTag",
                  tagName: "iframe",
                  outerNewLine: true,
                  attributes: newAttrs,
                },
                { type: "html", content: node.childrenHTML },
                { type: "closeTag", tagName: "iframe", outerNewLine: false },
              ];
            },
          },
        }}
      />
    );
  },
);

ToastUIEditorViewerCore.displayName = "ToastUIEditorViewerCore";

export default ToastUIEditorViewerCore;
