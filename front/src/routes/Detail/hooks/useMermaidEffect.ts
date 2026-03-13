import { RefObject, useEffect } from "react"
import useScheme from "src/hooks/useScheme"

const useMermaidEffect = (rootRef?: RefObject<HTMLElement>, contentKey?: string) => {
  const [scheme] = useScheme()

  useEffect(() => {
    const root = rootRef?.current
    if (!root) return

    let disposed = false
    let running = false
    const isDark = scheme === "dark"

    const mermaidThemeVariables = isDark
      ? {
          fontFamily: "Pretendard, Inter, system-ui, sans-serif",
          fontSize: "16px",
          primaryColor: "#111827",
          primaryBorderColor: "#334155",
          primaryTextColor: "#E5E7EB",
          secondaryColor: "#0F172A",
          tertiaryColor: "#0B1220",
          lineColor: "#94A3B8",
          clusterBkg: "#121A27",
          clusterBorder: "#334155",
          edgeLabelBackground: "#0F172A",
          mainBkg: "#111827",
          nodeBorder: "#475569",
        }
      : {
          fontFamily: "Pretendard, Inter, system-ui, sans-serif",
          fontSize: "16px",
          primaryColor: "#FFFFFF",
          primaryBorderColor: "#CBD5E1",
          primaryTextColor: "#0F172A",
          secondaryColor: "#F8FAFC",
          tertiaryColor: "#EEF2FF",
          lineColor: "#64748B",
          clusterBkg: "#F8FAFC",
          clusterBorder: "#CBD5E1",
          edgeLabelBackground: "#FFFFFF",
          mainBkg: "#FFFFFF",
          nodeBorder: "#CBD5E1",
        }

    const renderMermaidBlocks = async () => {
      const codeBlocks = Array.from(
        root.querySelectorAll<HTMLElement>(
          "pre > code.language-mermaid, pre.aq-mermaid > code.language-mermaid"
        )
      )
      if (!codeBlocks.length) return

      const mermaid = (await import("mermaid")).default
      const theme = scheme === "dark" ? "dark" : "default"

      mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        themeVariables: mermaidThemeVariables,
        flowchart: {
          htmlLabels: true,
          curve: "basis",
          useMaxWidth: true,
          rankSpacing: 54,
          nodeSpacing: 36,
        },
        themeCSS: `
          svg {
            font-family: Pretendard, Inter, system-ui, sans-serif;
          }
          .node rect {
            rx: 16px;
            ry: 16px;
          }
          .edgeLabel rect {
            fill: ${isDark ? "#0F172A" : "#FFFFFF"} !important;
            stroke: none !important;
            rx: 10px;
            ry: 10px;
          }
          .node polygon {
            stroke-width: 1.6px;
          }
          .label foreignObject div {
            line-height: 1.45;
            font-size: 15px;
            font-weight: 600;
            padding: 0.12rem 0.22rem;
          }
          .edgePath path {
            stroke-width: 1.8px;
          }
          .node rect,
          .node polygon,
          .cluster rect {
            stroke-width: 1.6px;
          }
          .cluster rect {
            rx: 22px;
            ry: 22px;
          }
          .label {
            color: ${isDark ? "#E5E7EB" : "#0F172A"};
          }
        `,
      })

      for (let i = 0; i < codeBlocks.length; i += 1) {
        if (disposed) return
        const codeBlock = codeBlocks[i]
        const block = codeBlock.closest<HTMLElement>("pre")
        if (!block) continue
        const source =
          block.dataset.mermaidSource || codeBlock.textContent?.trim() || ""
        if (!source) continue

        const alreadyRendered =
          (block.dataset.mermaidRendered === "true" ||
            block.dataset.mermaidRendered === "error") &&
          block.dataset.mermaidSource === source &&
          block.dataset.mermaidTheme === theme
        if (alreadyRendered) continue

        try {
          const id = `mermaid-${i}-${Math.random().toString(36).slice(2)}`
          const { svg } = await mermaid.render(id, source)
          if (disposed) return

          const parser = new DOMParser()
          const svgDocument = parser.parseFromString(svg, "image/svg+xml")
          const renderedSvg = svgDocument.documentElement
          const rawWidth = Number.parseFloat(renderedSvg.getAttribute("width") || "")
          const rawHeight = Number.parseFloat(renderedSvg.getAttribute("height") || "")

          if (!renderedSvg.getAttribute("viewBox") && rawWidth > 0 && rawHeight > 0) {
            renderedSvg.setAttribute("viewBox", `0 0 ${rawWidth} ${rawHeight}`)
          }

          renderedSvg.removeAttribute("width")
          renderedSvg.removeAttribute("height")

          const targetWidth = Math.min(Math.max(rawWidth || 0, 520), 920)
          const wrappedSvg = `
            <div class="aq-mermaid-stage" style="--aq-mermaid-target-width:${targetWidth}px;">
              ${renderedSvg.outerHTML}
            </div>
          `

          block.dataset.mermaidSource = source
          block.dataset.mermaidTheme = theme
          block.dataset.mermaidRendered = "true"
          block.innerHTML = wrappedSvg
        } catch (error) {
          const escapedSource = source
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")

          block.dataset.mermaidSource = source
          block.dataset.mermaidTheme = theme
          block.dataset.mermaidRendered = "error"
          block.innerHTML = `
            <div style="color:#b42318;font-weight:600;margin-bottom:0.5rem;">
              Mermaid 문법 오류: 다이어그램 코드를 확인하세요.
            </div>
            <code style="white-space:pre-wrap;display:block;">${escapedSource}</code>
          `
          console.warn("[mermaid] render failed", error)
        }
      }
    }

    const run = async () => {
      if (running || disposed) return
      running = true
      try {
        await renderMermaidBlocks()
      } catch (error) {
        console.warn(error)
      } finally {
        running = false
      }
    }

    run()

    const observer = new MutationObserver(() => {
      if (disposed) return
      run()
    })

    observer.observe(root, { childList: true, subtree: true })

    return () => {
      disposed = true
      observer.disconnect()
    }
  }, [contentKey, rootRef, scheme])

  return
}

export default useMermaidEffect
