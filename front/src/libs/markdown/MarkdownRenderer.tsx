import {
  createContext,
  CSSProperties,
  FC,
  memo,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  extractCodeMetaFromPreChildren,
  isMermaidSource,
  resolveMarkdownRenderModel,
} from "src/libs/markdown/rendering"
import { extractNormalizedMermaidSource } from "src/libs/markdown/mermaid"
import {
  TABLE_MIN_COLUMN_WIDTH_PX,
  TABLE_MIN_ROW_HEIGHT_PX,
  type MarkdownTableLayout,
} from "src/libs/markdown/tableMetadata"
import useMermaidEffect from "src/libs/markdown/hooks/useMermaidEffect"
import useResponsiveTableEffect from "src/libs/markdown/hooks/useResponsiveTableEffect"
import useInlineColorEffect from "src/libs/markdown/hooks/useInlineColorEffect"
import usePrismEffect from "src/libs/markdown/hooks/usePrismEffect"
import PrettyCodeBlock from "src/libs/markdown/components/PrettyCodeBlock"
import MarkdownRendererRoot from "src/libs/markdown/components/MarkdownRendererRoot"

export { markdownGuide } from "src/libs/markdown/rendering"

type Props = {
  content?: string
  contentHtml?: string
  disableMermaid?: boolean
  editableImages?: boolean
  onImageWidthCommit?: (payload: { src: string; alt: string; index: number; widthPx: number }) => void
}

type MarkdownImageFigureProps = {
  alt: string
  src: string
  widthPx?: number
  eager?: boolean
  editable?: boolean
  imageIndex: number
  onWidthCommit?: (payload: { src: string; alt: string; index: number; widthPx: number }) => void
}

const MarkdownImageFigure = memo(
  ({ alt, src, widthPx, eager = false, editable = false, imageIndex, onWidthCommit }: MarkdownImageFigureProps) => {
    const frameRef = useRef<HTMLElement>(null)
    const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null)
    const liveWidthRef = useRef<number | null>(null)
    const [draftWidthPx, setDraftWidthPx] = useState<number | null>(null)

    useEffect(() => {
      setDraftWidthPx(null)
      liveWidthRef.current = null
    }, [src, widthPx])

    const effectiveWidthPx = draftWidthPx ?? widthPx
    const frameStyle = effectiveWidthPx
      ? ({ "--aq-image-width": `${effectiveWidthPx}px` } as CSSProperties)
      : undefined

    return (
      <figure
        ref={frameRef}
        className="aq-image-frame"
        data-width-mode={effectiveWidthPx ? "custom" : "default"}
        data-editable={editable ? "true" : "false"}
        style={frameStyle}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt || ""}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
          draggable={false}
        />
        {editable ? (
          <button
            type="button"
            className="aq-image-resize-handle"
            aria-label="이미지 폭 조절"
            onPointerDown={(event) => {
              if (!frameRef.current) return
              const containerWidth = frameRef.current.parentElement?.clientWidth ?? frameRef.current.clientWidth
              const currentWidth =
                draftWidthPx ??
                widthPx ??
                Math.min(frameRef.current.getBoundingClientRect().width, containerWidth || 960)

              dragStateRef.current = {
                startX: event.clientX,
                startWidth: currentWidth,
              }

              const handlePointerMove = (moveEvent: PointerEvent) => {
                const activeDrag = dragStateRef.current
                if (!activeDrag) return
                const nextWidth = Math.min(
                  Math.max(activeDrag.startWidth + (moveEvent.clientX - activeDrag.startX), 180),
                  Math.max(240, containerWidth || activeDrag.startWidth)
                )
                liveWidthRef.current = Math.round(nextWidth)
                setDraftWidthPx(Math.round(nextWidth))
              }

              const handlePointerUp = () => {
                window.removeEventListener("pointermove", handlePointerMove)
                window.removeEventListener("pointerup", handlePointerUp)
                const nextWidth = liveWidthRef.current ?? widthPx ?? currentWidth
                dragStateRef.current = null
                liveWidthRef.current = null
                setDraftWidthPx(null)
                onWidthCommit?.({ src, alt, index: imageIndex, widthPx: nextWidth })
              }

              window.addEventListener("pointermove", handlePointerMove)
              window.addEventListener("pointerup", handlePointerUp, { once: true })
            }}
          >
            <span />
          </button>
        ) : null}
        {alt ? <figcaption>{alt}</figcaption> : null}
      </figure>
    )
  }
)

MarkdownImageFigure.displayName = "MarkdownImageFigure"

type MarkdownTableRenderContextValue = {
  rowHeights: Array<number | null>
  allocateRowIndex: () => number
}

const MarkdownTableRenderContext = createContext<MarkdownTableRenderContextValue | null>(null)

const MarkdownTableRenderer = ({
  children,
  className,
  layout,
}: {
  children?: ReactNode
  className?: string
  layout?: MarkdownTableLayout | null
}) => {
  const rowCursorRef = useRef(0)
  const columnWidths = layout?.columnWidths || []
  rowCursorRef.current = 0
  const contextValue = useMemo<MarkdownTableRenderContextValue>(
    () => ({
      rowHeights: layout?.rowHeights || [],
      allocateRowIndex: () => {
        const currentIndex = rowCursorRef.current
        rowCursorRef.current += 1
        return currentIndex
      },
    }),
    [layout?.rowHeights]
  )

  return (
    <MarkdownTableRenderContext.Provider value={contextValue}>
      <div className="aq-table-shell">
        <div className="aq-table-scroll">
          <table className={["aq-table", className].filter(Boolean).join(" ")}>
            {columnWidths.some((width) => typeof width === "number" && width > 0) ? (
              <colgroup>
                {columnWidths.map((width, index) => {
                  if (!width) return <col key={`table-col-${index}`} />
                  return (
                    <col
                      key={`table-col-${index}`}
                      style={{ width: `${Math.max(TABLE_MIN_COLUMN_WIDTH_PX, width)}px` }}
                    />
                  )
                })}
              </colgroup>
            ) : null}
            {children}
          </table>
        </div>
      </div>
    </MarkdownTableRenderContext.Provider>
  )
}

const MarkdownTableRowRenderer = ({
  children,
  className,
}: {
  children?: ReactNode
  className?: string
}) => {
  const context = useContext(MarkdownTableRenderContext)
  const rowIndexRef = useRef<number | null>(null)

  if (context && rowIndexRef.current === null) {
    rowIndexRef.current = context.allocateRowIndex()
  }

  const rowHeight =
    rowIndexRef.current !== null ? context?.rowHeights[rowIndexRef.current] || null : null
  const rowStyle = rowHeight
    ? ({
        height: `${Math.max(TABLE_MIN_ROW_HEIGHT_PX, rowHeight)}px`,
      } satisfies CSSProperties)
    : undefined

  return (
    <tr
      className={className}
      data-row-height={rowHeight ? Math.max(TABLE_MIN_ROW_HEIGHT_PX, rowHeight) : undefined}
      style={rowStyle}
    >
      {children}
    </tr>
  )
}

const MarkdownRendererComponent: FC<Props> = ({
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

  useMermaidEffect(rootRef, renderKey, !disableMermaid)
  useResponsiveTableEffect(rootRef, renderKey)
  useInlineColorEffect(rootRef, renderKey)
  usePrismEffect(rootRef, renderKey, true)

  useEffect(() => {
    imageRenderOrderRef.current = 0
  }, [renderKey])

  let tableRenderIndex = 0

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

  let standaloneImageIndex = -1

  return (
    <MarkdownRendererRoot ref={rootRef} className="aq-markdown">
      {segments.map((segment, index) => {
        const imageIndex = segment.type === "image" ? (standaloneImageIndex += 1) : -1

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
              <div className="aq-callout-box-text">
                <div className="aq-callout-head" data-has-title={segment.title ? "true" : "false"}>
                  <span className="aq-callout-emoji" aria-hidden="true">
                    {segment.emoji}
                  </span>
                  {segment.title ? <strong className="aq-callout-title">{segment.title}</strong> : null}
                </div>
                {renderMarkdown(segment.content, `callout-body-${index}`, true)}
              </div>
            </div>
          )
        }

        if (segment.type === "image") {
          return (
            <MarkdownImageFigure
              key={`image-${imageIndex}-${segment.src}`}
              alt={segment.alt}
              src={segment.src}
              widthPx={segment.widthPx}
              eager={imageIndex === 0}
              editable={editableImages}
              imageIndex={imageIndex}
              onWidthCommit={onImageWidthCommit}
            />
          )
        }

        return renderMarkdown(segment.content, `markdown-${index}`)
      })}
    </MarkdownRendererRoot>
  )
}

MarkdownRendererComponent.displayName = "MarkdownRenderer"

const MarkdownRenderer = memo(MarkdownRendererComponent)

MarkdownRenderer.displayName = "MarkdownRendererMemo"

export default MarkdownRenderer
