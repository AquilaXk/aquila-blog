import styled from "@emotion/styled"
import { FC, useMemo, useRef } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import usePrismEffect from "./usePrismEffect"
import useMermaidEffect from "../../hooks/useMermaidEffect"

type Props = {
  content?: string
  recordMap?: unknown
}

type CalloutKind = "tip" | "info" | "warning" | "outline" | "example" | "summary"

type MarkdownSegment =
  | { type: "markdown"; content: string }
  | { type: "toggle"; title: string; content: string }
  | { type: "callout"; kind: CalloutKind; title: string; content: string }

const MARKDOWN_GUIDE = `### 작성 가이드
- 코드블록: \`\`\`ts
const x = 1
\`\`\`
- 머메이드: \`\`\`mermaid
graph TD
  A[Start] --> B{Check}
\`\`\`
- 토글:
  :::toggle 토글 제목
  접기/펼치기 본문
  :::
- 콜아웃:
  > [!TIP]
  > 내용
  지원 타입: TIP, INFO, WARNING, OUTLINE, EXAMPLE, SUMMARY
- 테이블:
  | name | value |
  | --- | --- |
  | a | 1 |`

const CALLOUT_KIND_MAP: Record<string, CalloutKind> = {
  TIP: "tip",
  INFO: "info",
  NOTE: "info",
  WARNING: "warning",
  CAUTION: "warning",
  OUTLINE: "outline",
  EXAMPLE: "example",
  SUMMARY: "summary",
  IMPORTANT: "summary",
}

const CALLOUT_TITLE_MAP: Record<CalloutKind, string> = {
  tip: "Tip",
  info: "Info",
  warning: "Warning",
  outline: "모범 개요",
  example: "예시답안",
  summary: "핵심 개념 정리",
}

const parseMarkdownSegments = (content: string): MarkdownSegment[] => {
  const lines = content.split("\n")
  const segments: MarkdownSegment[] = []
  let markdownBuffer: string[] = []

  const flushMarkdown = () => {
    const text = markdownBuffer.join("\n").trim()
    if (text) segments.push({ type: "markdown", content: text })
    markdownBuffer = []
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith(":::toggle")) {
      const title = line.replace(/^:::toggle\s*/, "").trim() || "토글"
      const bodyLines: string[] = []
      let closed = false

      for (let j = i + 1; j < lines.length; j += 1) {
        if (lines[j].trim() === ":::") {
          flushMarkdown()
          segments.push({
            type: "toggle",
            title,
            content: bodyLines.join("\n").trim() || "내용을 입력하세요.",
          })
          i = j
          closed = true
          break
        }
        bodyLines.push(lines[j])
      }

      if (!closed) {
        markdownBuffer.push(line)
        markdownBuffer.push(...bodyLines)
      }

      i += 1
      continue
    }

    if (line.trimStart().startsWith(">")) {
      const blockStart = i
      const quoteLines: string[] = []

      while (i < lines.length && lines[i].trimStart().startsWith(">")) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ""))
        i += 1
      }

      const firstContentIndex = quoteLines.findIndex((row) => row.trim().length > 0)
      if (firstContentIndex >= 0) {
        const firstLine = quoteLines[firstContentIndex].trim()
        const match = firstLine.match(/^\[!([A-Za-z]+)\](?:\s*(.*))?$/)
        const rawKind = match?.[1]?.toUpperCase() || ""
        const mappedKind = CALLOUT_KIND_MAP[rawKind]

        if (mappedKind) {
          const customTitle = match?.[2]?.trim() || ""
          const body = quoteLines
            .slice(firstContentIndex + 1)
            .join("\n")
            .trim()

          flushMarkdown()
          segments.push({
            type: "callout",
            kind: mappedKind,
            title: customTitle || CALLOUT_TITLE_MAP[mappedKind],
            content: body || "내용을 입력하세요.",
          })
          continue
        }
      }

      markdownBuffer.push(lines.slice(blockStart, i).join("\n"))
      continue
    }

    markdownBuffer.push(line)
    i += 1
  }

  flushMarkdown()
  return segments
}

const NotionRenderer: FC<Props> = ({ content, recordMap }) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const normalizedContent = useMemo(() => content?.trim() || "", [content])
  const segments = useMemo(
    () => parseMarkdownSegments(normalizedContent),
    [normalizedContent]
  )
  const renderKey = useMemo(
    () => `${normalizedContent.length}:${normalizedContent.slice(0, 64)}`,
    [normalizedContent]
  )

  usePrismEffect(rootRef, renderKey)
  useMermaidEffect(rootRef, renderKey)

  const renderMarkdown = (markdown: string, key: string, inCallout = false) => (
    <ReactMarkdown
      key={key}
      remarkPlugins={[remarkGfm]}
      components={{
        p({ children }) {
          if (!inCallout) return <p>{children}</p>
          return <p className="notion-text">{children}</p>
        },
        img({ src, alt }) {
          const imageSrc = typeof src === "string" ? src : ""
          if (!imageSrc) return null

          return (
            <figure className="aq-image-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageSrc} alt={alt || ""} loading="lazy" />
              {alt ? <figcaption>{alt}</figcaption> : null}
            </figure>
          )
        },
        code({ className, children, ...props }) {
          const rawCode = String(children).replace(/\n$/, "")
          const lang = className?.replace("language-", "").trim() || ""

          if (!lang) {
            return (
              <code className="aq-inline-code" {...props}>
                {children}
              </code>
            )
          }

          if (lang === "mermaid") {
            return (
              <pre className="aq-mermaid">
                <code className="language-mermaid">{rawCode}</code>
              </pre>
            )
          }

          return (
            <pre className="aq-code">
              <code className={className}>{rawCode}</code>
            </pre>
          )
        },
      }}
    >
      {markdown}
    </ReactMarkdown>
  )

  if (!normalizedContent) {
    if (recordMap) {
      return (
        <StyledWrapper>
          <EmptyNotice>
            기존 Notion 페이지 콘텐츠는 현재 백엔드 본문(`content`) 기반 렌더링으로 전환되었습니다.
          </EmptyNotice>
        </StyledWrapper>
      )
    }

    return <StyledWrapper>본문이 없습니다.</StyledWrapper>
  }

  return (
    <StyledWrapper ref={rootRef} className="aq-markdown">
      {segments.map((segment, index) => {
        if (segment.type === "toggle") {
          return (
            <details className="aq-toggle" key={`toggle-${index}`}>
              <summary>{segment.title}</summary>
              {renderMarkdown(segment.content, `toggle-body-${index}`)}
            </details>
          )
        }

        if (segment.type === "callout") {
          return (
            <div
              key={`callout-${index}`}
              className={`aq-callout notion-callout notion-admonition notion-admonition-${segment.kind}`}
            >
              <div className="notion-callout-text" data-admonition-title={segment.title}>
                {renderMarkdown(segment.content, `callout-body-${index}`, true)}
              </div>
            </div>
          )
        }

        return renderMarkdown(segment.content, `markdown-${index}`)
      })}
    </StyledWrapper>
  )
}

export default NotionRenderer

const StyledWrapper = styled.div`
  margin-top: 1.5rem;
  word-break: break-word;
  color: ${({ theme }) => theme.colors.gray12};
  line-height: 1.75;
  font-size: 1rem;

  h1,
  h2,
  h3,
  h4 {
    line-height: 1.35;
    letter-spacing: -0.01em;
    margin-top: 1.4rem;
    margin-bottom: 0.55rem;
  }

  p {
    margin: 0.5rem 0;
  }

  figure {
    margin: 1rem 0;
  }

  .aq-image-frame {
    width: min(100%, 860px);
  }

  .aq-image-frame img {
    display: block;
    width: 100%;
    max-width: 100%;
    height: auto;
    max-height: min(78vh, 920px);
    object-fit: contain;
    border-radius: 18px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  }

  .aq-image-frame figcaption {
    margin-top: 0.55rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.8rem;
    line-height: 1.5;
    text-align: center;
  }

  ul,
  ol {
    margin: 0.55rem 0;
    padding-left: 1.15rem;
  }

  li + li {
    margin-top: 0.22rem;
  }

  hr {
    border: 0;
    border-top: 1px solid ${({ theme }) => theme.colors.gray6};
    margin: 1rem 0;
  }

  .aq-inline-code {
    border-radius: 6px;
    padding: 0.12rem 0.34rem;
    background: ${({ theme }) => theme.colors.gray4};
    font-size: 0.92em;
  }

  .aq-code,
  pre[class*="language-"],
  .aq-mermaid {
    margin: 0.85rem 0;
    border-radius: 12px;
    padding: 0.9rem 1rem;
    overflow-x: auto;
    background: ${({ theme }) => (theme.scheme === "dark" ? "#1f232a" : "#f5f7fa")};
    border: 1px solid
      ${({ theme }) =>
        theme.scheme === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(17, 24, 39, 0.08)"};
  }

  .aq-code code,
  pre code {
    font-size: 0.9rem;
    line-height: 1.6;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New",
      monospace;
  }

  .aq-toggle {
    margin: 0.9rem 0;
  }

  .aq-toggle > summary {
    cursor: pointer;
    font-weight: 700;
    list-style: none;
    padding: 0;
  }

  .aq-toggle[open] > *:not(summary) {
    margin-top: 0.5rem;
  }

  .aq-toggle > summary::-webkit-details-marker {
    display: none;
  }

  .aq-toggle > summary::before {
    content: "▸";
    margin-right: 0.45rem;
  }

  .aq-toggle[open] > summary::before {
    content: "▾";
  }

  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    border-radius: 12px;
    overflow: hidden;
    margin: 1rem 0;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
  }

  thead th {
    background: ${({ theme }) => theme.colors.gray3};
    font-weight: 700;
    border-bottom: 2px solid
      ${({ theme }) => (theme.scheme === "dark" ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.16)")};
  }

  th,
  td {
    padding: 0.72rem 0.9rem;
    border-right: 1px solid ${({ theme }) => theme.colors.gray6};
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
    vertical-align: top;
  }

  tr td:last-child,
  tr th:last-child {
    border-right: 0;
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }

  .aq-callout.notion-admonition {
    --ad-header-h: 52px;
    --ad-accent: #10acc6;
    --ad-header-bg: #d8e8ee;
    --ad-body-bg: #eceff1;
    --ad-border: #dde2e7;
    --ad-text: #4e5e68;
    --ad-strip-w: 8px;
    --ad-icon-svg: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Ccircle cx='24' cy='24' r='21' fill='%2310acc6'/%3E%3Crect x='22' y='19' width='4' height='14' rx='2' fill='white'/%3E%3Ccircle cx='24' cy='13' r='3' fill='white'/%3E%3C/svg%3E");
    position: relative;
    display: block;
    border: 0;
    border-radius: 8px;
    overflow: hidden;
    padding: 0;
    margin: 0.9rem 0;
    background: linear-gradient(
      to right,
      var(--ad-accent) 0 var(--ad-strip-w),
      var(--ad-body-bg) var(--ad-strip-w) 100%
    );
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    color: var(--ad-text);
  }

  .aq-callout.notion-admonition::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    right: 0;
    height: var(--ad-header-h);
    background-image:
      linear-gradient(
        to right,
        transparent 0 var(--ad-strip-w),
        var(--ad-header-bg) var(--ad-strip-w) 100%
      ),
      linear-gradient(
        to right,
        transparent 0 var(--ad-strip-w),
        var(--ad-border) var(--ad-strip-w) 100%
      );
    background-repeat: no-repeat;
    background-size:
      100% calc(100% - 1px),
      100% 1px;
    background-position:
      left top,
      left bottom;
    z-index: 1;
  }

  .aq-callout.notion-admonition::after {
    content: "";
    position: absolute;
    left: var(--ad-strip-w);
    top: 0;
    right: 0;
    bottom: 0;
    border: 1px solid var(--ad-border);
    border-left: 0;
    border-radius: 0 8px 8px 0;
    z-index: 0;
  }

  .aq-callout.notion-admonition > * {
    position: relative;
    z-index: 2;
  }

  .aq-callout.notion-admonition .notion-callout-text {
    margin-left: 0;
    padding: 64px 32px 18px 32px;
    color: var(--ad-text);
  }

  .aq-callout.notion-admonition .notion-callout-text::before {
    content: attr(data-admonition-title);
    position: absolute;
    left: 58px;
    top: calc(var(--ad-header-h) / 2);
    transform: translateY(-50%);
    color: var(--ad-accent);
    font-size: 1.2rem;
    font-weight: 600;
    line-height: 1.1;
  }

  .aq-callout.notion-admonition .notion-callout-text::after {
    content: "";
    position: absolute;
    left: 24px;
    top: calc(var(--ad-header-h) / 2);
    transform: translateY(-50%);
    width: 24px;
    height: 24px;
    background-image: var(--ad-icon-svg);
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
  }

  .aq-callout.notion-admonition .notion-text {
    color: var(--ad-text);
    font-size: 0.98rem;
    line-height: 1.6;
  }

  .aq-callout.notion-admonition-tip {
    --ad-accent: #e08600;
    --ad-header-bg: #ebe2d4;
    --ad-body-bg: #ececec;
    --ad-icon-svg: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Ccircle cx='24' cy='24' r='21' fill='%23f39200'/%3E%3Cpath d='M24 10c-6 0-10 4.6-10 10.2 0 3.3 1.5 5.4 3.5 7.3 1.4 1.3 2.5 2.8 2.5 4.8h8c0-2 1.1-3.5 2.5-4.8 2-1.9 3.5-4 3.5-7.3C34 14.6 30 10 24 10z' fill='white'/%3E%3Crect x='20' y='33' width='8' height='3' rx='1.5' fill='white'/%3E%3Crect x='21' y='37' width='6' height='2.5' rx='1.25' fill='white'/%3E%3C/svg%3E");
  }

  .aq-callout.notion-admonition-info {
    --ad-accent: #1098b0;
    --ad-header-bg: #d8e8ee;
    --ad-body-bg: #eceff1;
    --ad-icon-svg: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Ccircle cx='24' cy='24' r='21' fill='%2310acc6'/%3E%3Crect x='22' y='19' width='4' height='14' rx='2' fill='white'/%3E%3Ccircle cx='24' cy='13' r='3' fill='white'/%3E%3C/svg%3E");
  }

  .aq-callout.notion-admonition-warning {
    --ad-accent: #c86a73;
    --ad-header-bg: #f0dee2;
    --ad-body-bg: #f1eaec;
    --ad-icon-svg: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Cpolygon points='24,4 45,41 3,41' fill='%23d96c77'/%3E%3Crect x='22' y='16' width='4' height='14' rx='2' fill='white'/%3E%3Ccircle cx='24' cy='34' r='2.5' fill='white'/%3E%3C/svg%3E");
  }

  .aq-callout.notion-admonition-outline {
    --ad-accent: #6e94ad;
    --ad-header-bg: #dfe8ef;
    --ad-body-bg: #e8eef3;
    --ad-icon-svg: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Crect x='7' y='5' width='34' height='38' rx='4' fill='%236e94ad'/%3E%3Crect x='13' y='14' width='22' height='2.8' rx='1.4' fill='white'/%3E%3Crect x='13' y='21' width='22' height='2.8' rx='1.4' fill='white'/%3E%3Crect x='13' y='28' width='16' height='2.8' rx='1.4' fill='white'/%3E%3Crect x='17' y='2.5' width='14' height='6' rx='3' fill='%235b7f96'/%3E%3C/svg%3E");
  }

  .aq-callout.notion-admonition-example {
    --ad-accent: #2d9b56;
    --ad-header-bg: #deefdf;
    --ad-body-bg: #eaf4eb;
    --ad-icon-svg: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Crect x='5' y='5' width='38' height='38' rx='8' fill='%232d9b56'/%3E%3Cpath d='M14 25.5l6.2 6.3L34.5 17.5' fill='none' stroke='white' stroke-width='4.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  }

  .aq-callout.notion-admonition-summary {
    --ad-accent: #7a6fb2;
    --ad-header-bg: #e5e2f0;
    --ad-body-bg: #edebf5;
    --ad-icon-svg: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Cpath d='M8 11h22v28H8z' fill='%237a6fb2'/%3E%3Cpath d='M18 8h22v28H18z' fill='%238a80c2'/%3E%3Cpath d='M23 16h12M23 22h12M23 28h8' stroke='white' stroke-width='2.4' stroke-linecap='round'/%3E%3C/svg%3E");
  }
`

const EmptyNotice = styled.p`
  margin: 0;
  border-radius: 10px;
  padding: 0.75rem 0.9rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray3};
  color: ${({ theme }) => theme.colors.gray11};
  line-height: 1.55;
`

export const markdownGuide = MARKDOWN_GUIDE
