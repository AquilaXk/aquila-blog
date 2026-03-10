import styled from "@emotion/styled"
import { FC, useMemo, useRef } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkGithubBlockquoteAlert from "remark-github-blockquote-alert"
import usePrismEffect from "./usePrismEffect"
import useMermaidEffect from "../../hooks/useMermaidEffect"

type Props = {
  content?: string
  recordMap?: unknown
}

type MarkdownSegment =
  | { type: "markdown"; content: string }
  | { type: "toggle"; title: string; content: string }

const MARKDOWN_GUIDE = `### 작성 가이드
- 제목1: # 제목
- 제목2: ## 제목
- 제목3: ### 제목
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
- 콜아웃: > [!TIP] 제목
  > 본문
- 테이블:
  | name | value |
  | --- | --- |
  | a | 1 |`

const parseMarkdownSegments = (content: string): MarkdownSegment[] => {
  const lines = content.split("\n")
  const segments: MarkdownSegment[] = []
  let markdownBuffer: string[] = []

  const flushMarkdown = () => {
    const text = markdownBuffer.join("\n").trim()
    if (text) segments.push({ type: "markdown", content: text })
    markdownBuffer = []
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (!line.startsWith(":::toggle")) {
      markdownBuffer.push(line)
      continue
    }

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
      break
    }
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
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkGithubBlockquoteAlert]}
                components={{
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
                {segment.content}
              </ReactMarkdown>
            </details>
          )
        }

        return (
          <ReactMarkdown
            key={`markdown-${index}`}
            remarkPlugins={[remarkGfm, remarkGithubBlockquoteAlert]}
            components={{
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
            {segment.content}
          </ReactMarkdown>
        )
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
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    border-radius: 10px;
    background: ${({ theme }) => theme.colors.gray2};
    padding: 0.55rem 0.75rem;
  }

  .aq-toggle > summary {
    cursor: pointer;
    font-weight: 700;
    list-style: none;
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

  .markdown-alert {
    --ad-header-h: 52px;
    --ad-accent: #10acc6;
    --ad-header-bg: #d8e8ee;
    --ad-body-bg: #eceff1;
    --ad-border: #dde2e7;
    --ad-text: #4e5e68;
    --ad-strip-w: 8px;
    position: relative;
    display: block;
    border: 0;
    border-radius: 8px;
    overflow: hidden;
    padding: 64px 24px 16px 24px;
    margin: 0.9rem 0;
    color: var(--ad-text);
    background: linear-gradient(
      to right,
      var(--ad-accent) 0 var(--ad-strip-w),
      var(--ad-body-bg) var(--ad-strip-w) 100%
    );
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }

  .markdown-alert::before {
    content: "Info";
    position: absolute;
    left: 58px;
    top: 26px;
    transform: translateY(-50%);
    color: var(--ad-accent);
    font-size: 1.2rem;
    font-weight: 600;
    line-height: 1.1;
  }

  .markdown-alert::after {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    right: 0;
    height: var(--ad-header-h);
    background: linear-gradient(
      to right,
      transparent 0 var(--ad-strip-w),
      var(--ad-header-bg) var(--ad-strip-w) 100%
    );
    border-bottom: 1px solid var(--ad-border);
  }

  .markdown-alert p {
    margin: 0.45rem 0;
  }

  .markdown-alert-note {
    --ad-accent: #1098b0;
    --ad-header-bg: #d8e8ee;
    --ad-body-bg: #eceff1;
  }

  .markdown-alert-tip {
    --ad-accent: #e08600;
    --ad-header-bg: #ebe2d4;
    --ad-body-bg: #ececec;
  }

  .markdown-alert-important {
    --ad-accent: #7a6fb2;
    --ad-header-bg: #e5e2f0;
    --ad-body-bg: #edebf5;
  }

  .markdown-alert-warning,
  .markdown-alert-caution {
    --ad-accent: #c86a73;
    --ad-header-bg: #f0dee2;
    --ad-body-bg: #f1eaec;
  }

  .markdown-alert-note::before {
    content: "Info";
  }

  .markdown-alert-tip::before {
    content: "Tip";
  }

  .markdown-alert-important::before {
    content: "Summary";
  }

  .markdown-alert-warning::before,
  .markdown-alert-caution::before {
    content: "Warning";
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
