import { type FC, memo, useEffect, useMemo, useRef } from "react"
import ReactMarkdown from "react-markdown"
import rehypeKatex from "rehype-katex"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import {
  extractCodeMetaFromPreChildren,
  extractTextFromCodeAst,
  isMermaidSource,
  resolveMarkdownRenderModel,
} from "src/libs/markdown/rendering"
import { extractNormalizedMermaidSource } from "src/libs/markdown/mermaid"
import useMermaidEffect from "src/libs/markdown/hooks/useMermaidEffect"
import useResponsiveTableEffect from "src/libs/markdown/hooks/useResponsiveTableEffect"
import useInlineColorEffect from "src/libs/markdown/hooks/useInlineColorEffect"
import usePrismEffect from "src/libs/markdown/hooks/usePrismEffect"
import PrettyCodeBlock from "src/libs/markdown/components/PrettyCodeBlock"
import MarkdownRendererRoot from "src/libs/markdown/components/MarkdownRendererRoot"
import { renderImmediateCodeToHtml } from "src/libs/markdown/prismRuntime"
import {
  MarkdownBlockquote,
  MarkdownParagraph,
  extractTextFromMarkdownNode,
} from "src/libs/markdown/MarkdownRendererInline"
import {
  MarkdownTableCellRenderer,
  MarkdownTableRenderer,
  MarkdownTableRowRenderer,
} from "src/libs/markdown/MarkdownRendererTable"
import { renderMarkdownSegment } from "src/libs/markdown/MarkdownRendererSegments"
import { normalizeSafeMarkdownImageSrc } from "src/libs/markdown/safeMarkdownUrl"
import type { MarkdownRendererProps } from "src/libs/markdown/MarkdownRenderer.types"

export { markdownGuide } from "src/libs/markdown/rendering"

const resolveMarkdownTableCellAlignment = (node: unknown, propAlignment: unknown, style: unknown) => {
  const nodeProperties = (node as { properties?: { align?: unknown; style?: unknown } } | null)?.properties
  const nodeAlignment = nodeProperties?.align
  const styleAlignment =
    typeof style === "object" && style && "textAlign" in style
      ? (style as { textAlign?: unknown }).textAlign
      : undefined
  const serializedStyle = typeof nodeProperties?.style === "string" ? nodeProperties.style : ""
  const serializedStyleAlignment = serializedStyle
    .match(/text-align:\s*(left|center|right)/i)?.[1]
    ?.toLowerCase()
  const alignment = propAlignment || nodeAlignment || styleAlignment || serializedStyleAlignment
  return typeof alignment === "string" ? alignment : undefined
}

const MarkdownRendererComponent: FC<MarkdownRendererProps> = ({
  content,
  contentHtml,
  disableMermaid = false,
  editableImages = false,
  onImageWidthCommit,
}) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const imageRenderOrderRef = useRef(0)
  const renderModel = useMemo(
    () => resolveMarkdownRenderModel({ content, contentHtml }),
    [content, contentHtml]
  )
  const { normalizedContent, renderKey, resolvedContentHtml, segments } = renderModel
  const { tableLayouts } = renderModel

  useMermaidEffect(rootRef, renderKey, !disableMermaid, {
    observeMutations: false,
  })
  useResponsiveTableEffect(rootRef, renderKey)
  useInlineColorEffect(rootRef, renderKey)
  usePrismEffect(rootRef, renderKey, true, {
    mutationDebounceMs: 96,
  })

  useEffect(() => {
    imageRenderOrderRef.current = 0
  }, [renderKey])

  let tableRenderIndex = 0

  const renderMarkdown = (markdown: string, key: string, inCallout = false, inlineOnly = false) => (
    <ReactMarkdown
      key={key}
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p({ children }) {
          if (inlineOnly) return <>{children}</>
          return <MarkdownParagraph inCallout={inCallout}>{children}</MarkdownParagraph>
        },
        blockquote({ children }) {
          return <MarkdownBlockquote>{children}</MarkdownBlockquote>
        },
        table({ children, ...props }) {
          const layout = tableLayouts[tableRenderIndex] || null
          tableRenderIndex += 1
          return (
            <MarkdownTableRenderer layout={layout} {...props}>
              {children}
            </MarkdownTableRenderer>
          )
        },
        tr({ children, ...props }) {
          return <MarkdownTableRowRenderer {...props}>{children}</MarkdownTableRowRenderer>
        },
        th({ children, node, ...props }) {
          return (
            <MarkdownTableCellRenderer
              as="th"
              alignment={resolveMarkdownTableCellAlignment(node, props.align, props.style)}
              className={props.className}
            >
              {children}
            </MarkdownTableCellRenderer>
          )
        },
        td({ children, node, ...props }) {
          return (
            <MarkdownTableCellRenderer
              as="td"
              alignment={resolveMarkdownTableCellAlignment(node, props.align, props.style)}
              className={props.className}
            >
              {children}
            </MarkdownTableCellRenderer>
          )
        },
        img({ src, alt }) {
          const imageSrc = normalizeSafeMarkdownImageSrc(typeof src === "string" ? src : "")
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
        code({ node, className, children, ...props }) {
          const rawFromChildren =
            typeof children === "string"
              ? children
              : Array.isArray(children)
                ? children.map((child) => (typeof child === "string" || typeof child === "number" ? String(child) : "")).join("\n")
                : extractTextFromMarkdownNode(children)
          const raw = rawFromChildren || extractTextFromCodeAst(node)
          const isInlineCode = !className && !raw.includes("\n")

          if (isInlineCode) {
            return (
              <code className="aq-inline-code" {...props}>
                {children}
              </code>
            )
          }

          return (
            <code className={className} data-raw-code={raw} {...props}>
              {children}
            </code>
          )
        },
        pre({ node, children, className: _className, ...props }) {
          const { language, rawCode } = extractCodeMetaFromPreChildren(children, node)
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

          const mergedClassName = "aq-code aq-pretty-pre"
          const initialCodePresentation = renderImmediateCodeToHtml({
            source: rawCode,
            language,
          })

          return (
            <PrettyCodeBlock
              language={initialCodePresentation.language}
              rawCode={rawCode}
              preElement={
                <pre {...props} className={mergedClassName}>
                  <code
                    className={`language-${initialCodePresentation.language}`}
                    data-language={initialCodePresentation.language}
                    data-prism-language={initialCodePresentation.language}
                    data-prism-source={rawCode}
                    data-raw-code={rawCode}
                    dangerouslySetInnerHTML={{ __html: initialCodePresentation.html }}
                  />
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

  let standaloneImageIndex = -1

  return (
    <MarkdownRendererRoot ref={rootRef} className="aq-markdown">
      {segments.map((segment, index) => {
        const imageIndex = segment.type === "image" ? (standaloneImageIndex += 1) : -1
        return renderMarkdownSegment({
          segment,
          index,
          imageIndex,
          editableImages,
          onImageWidthCommit,
          renderMarkdown,
        })
      })}
    </MarkdownRendererRoot>
  )
}

MarkdownRendererComponent.displayName = "MarkdownRenderer"

const MarkdownRenderer = memo(MarkdownRendererComponent)

MarkdownRenderer.displayName = "MarkdownRendererMemo"

export default MarkdownRenderer
