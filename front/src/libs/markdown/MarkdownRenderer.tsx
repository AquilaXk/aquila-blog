import { FC, useEffect, useMemo, useRef } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  extractCodeMetaFromPreChildren,
  hashString,
  isMermaidSource,
  normalizeContentHtmlForMermaid,
  normalizeMarkdownForRender,
  parseMarkdownSegments,
  shouldPreferMarkdownPipeline,
} from "src/libs/markdown/rendering"
import { extractNormalizedMermaidSource } from "src/libs/markdown/mermaid"
import useMermaidEffect from "src/libs/markdown/hooks/useMermaidEffect"
import useInlineColorEffect from "src/libs/markdown/hooks/useInlineColorEffect"
import usePrismEffect from "src/libs/markdown/hooks/usePrismEffect"
import PrettyCodeBlock from "src/libs/markdown/components/PrettyCodeBlock"
import MarkdownRendererRoot from "src/libs/markdown/components/MarkdownRendererRoot"

export { markdownGuide } from "src/libs/markdown/rendering"

type Props = {
  content?: string
  contentHtml?: string
}

const MarkdownRenderer: FC<Props> = ({ content, contentHtml }) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const imageRenderOrderRef = useRef(0)
  const normalizedContent = useMemo(() => normalizeMarkdownForRender(content || ""), [content])
  const normalizedContentHtml = useMemo(() => contentHtml?.trim() || "", [contentHtml])
  const sanitizedContentHtml = useMemo(
    () => normalizeContentHtmlForMermaid(normalizedContentHtml),
    [normalizedContentHtml]
  )
  const preferMarkdownPipeline = useMemo(
    () => shouldPreferMarkdownPipeline(normalizedContent),
    [normalizedContent]
  )
  const resolvedContentHtml = useMemo(() => {
    // 상세/미리보기 일관성을 위해 markdown 원문이 있으면 항상 markdown 파이프라인을 우선한다.
    // contentHtml 경로에서 간헐적으로 mermaid fence가 plain code로 남는 케이스를 차단한다.
    if (normalizedContent.trim()) return ""
    return preferMarkdownPipeline ? "" : sanitizedContentHtml
  }, [normalizedContent, preferMarkdownPipeline, sanitizedContentHtml])
  const segments = useMemo(
    () => (resolvedContentHtml ? [] : parseMarkdownSegments(normalizedContent)),
    [normalizedContent, resolvedContentHtml]
  )
  const renderKeySeed = useMemo(
    () => (resolvedContentHtml ? `html:${resolvedContentHtml}` : `md:${normalizedContent}`),
    [normalizedContent, resolvedContentHtml]
  )
  const renderKey = useMemo(
    () => `${renderKeySeed.length}:${hashString(renderKeySeed)}`,
    [renderKeySeed]
  )

  useMermaidEffect(rootRef, renderKey)
  useInlineColorEffect(rootRef, renderKey)
  usePrismEffect(rootRef, renderKey, true)

  useEffect(() => {
    imageRenderOrderRef.current = 0
  }, [renderKey])

  const renderMarkdown = (markdown: string, key: string, inCallout = false) => (
    // 코드블록이 없는 세그먼트에는 무거운 syntax-highlight 플러그인을 생략한다.
    <ReactMarkdown
      key={key}
      remarkPlugins={[remarkGfm]}
      components={{
        p({ children }) {
          if (!inCallout) return <p>{children}</p>
          return <p className="aq-markdown-text">{children}</p>
        },
        img({ src, alt }) {
          const imageSrc = typeof src === "string" ? src : ""
          if (!imageSrc) return null
          const isFirstImage = imageRenderOrderRef.current === 0
          imageRenderOrderRef.current += 1

          return (
            <figure className="aq-image-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageSrc}
                alt={alt || ""}
                loading={isFirstImage ? "eager" : "lazy"}
                fetchPriority={isFirstImage ? "high" : "auto"}
                decoding="async"
              />
              {alt ? <figcaption>{alt}</figcaption> : null}
            </figure>
          )
        },
        code({ className, children, ...props }) {
          const raw = typeof children === "string" ? children : String(children ?? "")
          const isInlineCode = !className && !raw.includes("\n")

          if (isInlineCode) {
            return (
              <code className="aq-inline-code" {...props}>
                {children}
              </code>
            )
          }

          return (
            <code className={className} {...props}>
              {children}
            </code>
          )
        },
        pre({ children, className, ...props }) {
          const { language, rawCode } = extractCodeMetaFromPreChildren(children)
          const mermaidSource = extractNormalizedMermaidSource(rawCode)
          const shouldRenderMermaid = language === "mermaid" || isMermaidSource(rawCode)

          if (shouldRenderMermaid) {
            return (
              <pre
                className="aq-mermaid"
                data-aq-mermaid="true"
                data-mermaid-rendered="pending"
                data-mermaid-source={mermaidSource || rawCode}
              >
                <code className="language-mermaid">{mermaidSource || rawCode}</code>
              </pre>
            )
          }

          const mergedClassName = ["aq-code", "aq-pretty-pre", className].filter(Boolean).join(" ")

          return (
            <PrettyCodeBlock
              language={language}
              rawCode={rawCode}
              preElement={
                <pre className={mergedClassName} {...props}>
                  {children}
                </pre>
              }
            />
          )
        },
      }}
    >
      {markdown}
    </ReactMarkdown>
  )

  if (resolvedContentHtml) {
    return (
      <MarkdownRendererRoot
        ref={rootRef}
        className="aq-markdown"
        dangerouslySetInnerHTML={{ __html: resolvedContentHtml }}
      />
    )
  }

  if (!normalizedContent) return <MarkdownRendererRoot>본문이 없습니다.</MarkdownRendererRoot>

  return (
    <MarkdownRendererRoot ref={rootRef} className="aq-markdown">
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
              className={`aq-callout aq-callout-box aq-admonition aq-admonition-${segment.kind}`}
            >
              <div className="aq-callout-box-text" data-admonition-title={segment.title}>
                {renderMarkdown(segment.content, `callout-body-${index}`, true)}
              </div>
            </div>
          )
        }

        return renderMarkdown(segment.content, `markdown-${index}`)
      })}
    </MarkdownRendererRoot>
  )
}

export default MarkdownRenderer
