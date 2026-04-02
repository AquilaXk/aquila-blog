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
import rehypeKatex from "rehype-katex"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import {
  extractCodeMetaFromPreChildren,
  isMermaidSource,
  resolveMarkdownRenderModel,
} from "src/libs/markdown/rendering"
import { extractNormalizedMermaidSource } from "src/libs/markdown/mermaid"
import {
  TABLE_MIN_COLUMN_WIDTH_PX,
  TABLE_MIN_ROW_HEIGHT_PX,
  type MarkdownTableCellAlignment,
  type MarkdownTableCellLayout,
  type MarkdownTableLayout,
} from "src/libs/markdown/tableMetadata"
import useMermaidEffect from "src/libs/markdown/hooks/useMermaidEffect"
import useResponsiveTableEffect from "src/libs/markdown/hooks/useResponsiveTableEffect"
import useInlineColorEffect from "src/libs/markdown/hooks/useInlineColorEffect"
import usePrismEffect from "src/libs/markdown/hooks/usePrismEffect"
import PrettyCodeBlock from "src/libs/markdown/components/PrettyCodeBlock"
import MarkdownRendererRoot from "src/libs/markdown/components/MarkdownRendererRoot"
import FormulaRender from "src/libs/markdown/FormulaRender"
import { renderImmediateCodeToHtml } from "src/libs/markdown/prismRuntime"
import { formatReadableFileSize, inferLinkProvider, resolveEmbedPreviewUrl } from "src/libs/unfurl/extractMeta"

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
  columnAlignments: Array<MarkdownTableCellAlignment | null>
  cellLayouts: Array<Array<MarkdownTableCellLayout | null>>
  allocateRowIndex: () => number
}

type MarkdownTableRowContextValue = {
  rowIndex: number
  allocateCellIndex: () => number
}

const MarkdownTableRenderContext = createContext<MarkdownTableRenderContextValue | null>(null)
const MarkdownTableRowContext = createContext<MarkdownTableRowContextValue | null>(null)

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
      columnAlignments: layout?.columnAlignments || [],
      cellLayouts: layout?.cells || [],
      allocateRowIndex: () => {
        const currentIndex = rowCursorRef.current
        rowCursorRef.current += 1
        return currentIndex
      },
    }),
    [layout?.cells, layout?.columnAlignments, layout?.rowHeights]
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

  let cellCursor = 0
  const rowContextValue: MarkdownTableRowContextValue = {
    rowIndex: rowIndexRef.current ?? 0,
    allocateCellIndex: () => {
      const currentIndex = cellCursor
      cellCursor += 1
      return currentIndex
    },
  }

  return (
    <MarkdownTableRowContext.Provider value={rowContextValue}>
      <tr
        className={className}
        data-row-height={rowHeight ? Math.max(TABLE_MIN_ROW_HEIGHT_PX, rowHeight) : undefined}
        style={rowStyle}
      >
        {children}
      </tr>
    </MarkdownTableRowContext.Provider>
  )
}

const MarkdownTableCellRenderer = ({
  as: Component,
  children,
  className,
}: {
  as: "td" | "th"
  children?: ReactNode
  className?: string
}) => {
  const tableContext = useContext(MarkdownTableRenderContext)
  const rowContext = useContext(MarkdownTableRowContext)
  const cellIndexRef = useRef<number | null>(null)

  if (rowContext && cellIndexRef.current === null) {
    cellIndexRef.current = rowContext.allocateCellIndex()
  }

  const rowIndex = rowContext?.rowIndex ?? 0
  const columnIndex = cellIndexRef.current ?? 0
  const cellLayout = tableContext?.cellLayouts[rowIndex]?.[columnIndex] || null
  const columnAlignment = tableContext?.columnAlignments[columnIndex] || null

  if (cellLayout?.hidden) {
    return null
  }

  const rowSpan = cellLayout?.rowspan && cellLayout.rowspan > 1 ? cellLayout.rowspan : undefined
  const colSpan = cellLayout?.colspan && cellLayout.colspan > 1 ? cellLayout.colspan : undefined
  const textAlign = cellLayout?.align || columnAlignment || undefined
  const backgroundColor = cellLayout?.backgroundColor || undefined
  const style = textAlign || backgroundColor
    ? ({
        ...(textAlign ? { textAlign } : {}),
        ...(backgroundColor ? { backgroundColor } : {}),
      } satisfies CSSProperties)
    : undefined

  return (
    <Component className={className} rowSpan={rowSpan} colSpan={colSpan} style={style}>
      {children}
    </Component>
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
    // 코드블록이 없는 세그먼트에는 무거운 syntax-highlight 플러그인을 생략한다.
    <ReactMarkdown
      key={key}
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p({ children }) {
          if (inlineOnly) return <>{children}</>
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
        th({ children, ...props }) {
          return (
            <MarkdownTableCellRenderer as="th" className={props.className}>
              {children}
            </MarkdownTableCellRenderer>
          )
        },
        td({ children, ...props }) {
          return (
            <MarkdownTableCellRenderer as="td" className={props.className}>
              {children}
            </MarkdownTableCellRenderer>
          )
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
          const highlightedCode = renderImmediateCodeToHtml({
            source: rawCode,
            language,
          })

          return (
            <PrettyCodeBlock
              language={highlightedCode.language}
              rawCode={rawCode}
              preElement={
                <pre className={mergedClassName} {...props}>
                  <code
                    className={`language-${highlightedCode.language}`}
                    data-language={highlightedCode.language}
                    dangerouslySetInnerHTML={{ __html: highlightedCode.html }}
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

        if (segment.type === "bookmark") {
          const providerLabel = segment.provider || segment.siteName || inferLinkProvider(segment.url)
          return (
            <div key={`bookmark-${index}`} className="aq-bookmark-card">
              <a href={segment.url} target="_blank" rel="noreferrer">
                {segment.thumbnailUrl ? (
                  <div className="aq-link-card-thumb" aria-hidden="true">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={segment.thumbnailUrl} alt="" loading="lazy" decoding="async" />
                  </div>
                ) : null}
                <div className="aq-link-card-copy">
                  {providerLabel ? <small>{providerLabel}</small> : null}
                  <strong>{segment.title || segment.url}</strong>
                  <span>{segment.url}</span>
                  {segment.description ? <p>{segment.description}</p> : null}
                </div>
              </a>
            </div>
          )
        }

        if (segment.type === "embed") {
          const previewUrl = segment.embedUrl || resolveEmbedPreviewUrl(segment.url)
          const providerLabel = segment.provider || segment.siteName || inferLinkProvider(segment.url)
          return (
            <div key={`embed-${index}`} className="aq-embed-card">
              <div className="aq-embed-header">
                <div className="aq-embed-copy">
                  {providerLabel ? <small>{providerLabel}</small> : null}
                  <strong>{segment.title || "임베드"}</strong>
                </div>
                <a href={segment.url} target="_blank" rel="noreferrer">
                  원본 열기
                </a>
              </div>
              {previewUrl ? (
                <div className="aq-embed-frame">
                  <iframe
                    src={previewUrl}
                    title={segment.title || segment.url}
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="aq-embed-fallback">
                  <p>이 사이트는 인라인 임베드를 지원하지 않아 링크 카드로 대체했습니다.</p>
                </div>
              )}
              {segment.thumbnailUrl && !previewUrl ? (
                <div className="aq-embed-thumb" aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={segment.thumbnailUrl} alt="" loading="lazy" decoding="async" />
                </div>
              ) : null}
              {segment.caption ? <p className="aq-embed-caption">{segment.caption}</p> : null}
            </div>
          )
        }

        if (segment.type === "file") {
          const meta = [segment.mimeType || "", formatReadableFileSize(segment.sizeBytes)].filter(Boolean).join(" · ")
          return (
            <div key={`file-${index}`} className="aq-file-card">
              <a href={segment.url} target="_blank" rel="noreferrer">
                <div className="aq-link-card-copy">
                  {meta ? <small>{meta}</small> : null}
                  <strong>{segment.name || "첨부 파일"}</strong>
                  <span>{segment.url}</span>
                </div>
              </a>
              {segment.description ? <p>{segment.description}</p> : null}
            </div>
          )
        }

        if (segment.type === "formula") {
          return (
            <div key={`formula-${index}`} className="aq-formula-card">
              <FormulaRender className="aq-formula-render" formula={segment.formula} displayMode />
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
