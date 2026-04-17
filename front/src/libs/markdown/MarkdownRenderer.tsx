import {
  Children,
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
  extractTextFromCodeAst,
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
import { resolveInlineColorValue } from "src/libs/markdown/inlineColor"
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

const QUOTED_STRONG_MARKERS = ["**", "__"] as const
const INLINE_COLOR_CHILD_PLACEHOLDER_PREFIX = "__AQ_INLINE_COLOR_CHILD_"
const INLINE_COLOR_CHILD_PLACEHOLDER_SUFFIX = "__"
const INLINE_COLOR_CHILD_PLACEHOLDER_REGEX = /__AQ_INLINE_COLOR_CHILD_(\d+)__/g
const INLINE_COLOR_RENDER_REGEX = /\{\{\s*color\s*:\s*([^|{}]+?)\s*\|([\s\S]+?)\s*\}\}/gi
const QUOTED_STRONG_QUOTE_PAIRS = [
  ['"', '"'],
  ["“", "”"],
  ["‘", "’"],
  ["«", "»"],
  ["「", "」"],
  ["『", "』"],
  ["〈", "〉"],
  ["《", "》"],
] as const

const QUOTED_STRONG_QUOTE_MARKERS = QUOTED_STRONG_QUOTE_PAIRS.flatMap(([openQuote, closeQuote]) =>
  openQuote === closeQuote ? [openQuote] : [openQuote, closeQuote]
)

const isLetterOrNumber = (value: string) => /[\p{L}\p{N}]/u.test(value)

type QuotedStrongMatch = {
  end: number
  quotedText: string
}

const matchQuotedStrongAt = (value: string, start: number): QuotedStrongMatch | null => {
  for (const marker of QUOTED_STRONG_MARKERS) {
    if (!value.startsWith(marker, start)) continue

    for (const [openQuote, closeQuote] of QUOTED_STRONG_QUOTE_PAIRS) {
      const quoteStart = start + marker.length
      if (!value.startsWith(openQuote, quoteStart)) continue

      const contentStart = quoteStart + openQuote.length
      const closingToken = `${closeQuote}${marker}`
      const closeIndex = value.indexOf(closingToken, contentStart)
      if (closeIndex < 0) continue

      const suffixIndex = closeIndex + closingToken.length
      const suffixChar = value[suffixIndex] || ""
      if (!suffixChar || !isLetterOrNumber(suffixChar)) continue

      const inner = value.slice(contentStart, closeIndex)
      if (!inner.trim()) continue

      return {
        end: suffixIndex,
        quotedText: `${openQuote}${inner}${closeQuote}`,
      }
    }
  }

  return null
}

const restoreQuotedStrongText = (value: string): ReactNode[] => {
  if (
    (!value.includes("**") && !value.includes("__")) ||
    !QUOTED_STRONG_QUOTE_MARKERS.some((quote) => value.includes(quote))
  ) {
    return [value]
  }

  const nodes: ReactNode[] = []
  let textCursor = 0
  let index = 0
  let strongIndex = 0

  while (index < value.length) {
    const match = matchQuotedStrongAt(value, index)
    if (!match) {
      index += 1
      continue
    }

    if (textCursor < index) {
      nodes.push(value.slice(textCursor, index))
    }

    nodes.push(<strong key={`quoted-strong-${strongIndex}`}>{match.quotedText}</strong>)
    strongIndex += 1
    index = match.end
    textCursor = match.end
  }

  if (strongIndex === 0) return [value]
  if (textCursor < value.length) {
    nodes.push(value.slice(textCursor))
  }

  return nodes
}

const normalizeQuotedStrongChildren = (children: ReactNode) =>
  Children.toArray(children).flatMap((child) => {
    if (typeof child !== "string") return [child]
    return restoreQuotedStrongText(child)
  })

const restoreSerializedMarkdownChildren = (serialized: string, sourceChildren: ReactNode[]) => {
  if (!serialized) return []

  const nodes: ReactNode[] = []
  let cursor = 0

  for (const match of serialized.matchAll(INLINE_COLOR_CHILD_PLACEHOLDER_REGEX)) {
    const start = match.index ?? 0
    if (start > cursor) nodes.push(serialized.slice(cursor, start))

    const nodeIndex = Number.parseInt(match[1] || "", 10)
    const node = sourceChildren[nodeIndex]
    if (node !== undefined) nodes.push(node)
    cursor = start + match[0].length
  }

  if (cursor < serialized.length) {
    nodes.push(serialized.slice(cursor))
  }

  return nodes
}

const normalizeInlineColorChildren = (children: ReactNode) => {
  const sourceChildren = Children.toArray(children)
  if (sourceChildren.length === 0) return sourceChildren

  const serialized = sourceChildren
    .map((child, index) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : `${INLINE_COLOR_CHILD_PLACEHOLDER_PREFIX}${index}${INLINE_COLOR_CHILD_PLACEHOLDER_SUFFIX}`
    )
    .join("")

  if (!serialized.includes("{{")) return sourceChildren

  const nodes: ReactNode[] = []
  let cursor = 0
  let colorIndex = 0
  let matched = false

  for (const match of serialized.matchAll(INLINE_COLOR_RENDER_REGEX)) {
    const full = match[0]
    const colorToken = match[1] || ""
    const contentSerialized = match[2] || ""
    const start = match.index ?? 0
    const cssColor = resolveInlineColorValue(colorToken)

    if (start > cursor) {
      nodes.push(...restoreSerializedMarkdownChildren(serialized.slice(cursor, start), sourceChildren))
    }

    if (!cssColor) {
      nodes.push(...restoreSerializedMarkdownChildren(full, sourceChildren))
    } else {
      const contentNodes = restoreSerializedMarkdownChildren(contentSerialized, sourceChildren)
      nodes.push(
        <span
          key={`inline-color-${colorIndex}`}
          className="aq-inline-color"
          style={{ "--aq-inline-color": cssColor } as CSSProperties}
        >
          {contentNodes}
        </span>
      )
      colorIndex += 1
      matched = true
    }

    cursor = start + full.length
  }

  if (!matched) return sourceChildren

  if (cursor < serialized.length) {
    nodes.push(...restoreSerializedMarkdownChildren(serialized.slice(cursor), sourceChildren))
  }

  return nodes
}

const normalizeSoftBreakChildren = (children: ReactNode) => {
  const nodes: ReactNode[] = []
  let breakIndex = 0

  Children.toArray(children).forEach((child) => {
    if (typeof child !== "string") {
      nodes.push(child)
      return
    }

    const parts = child.split("\n")
    parts.forEach((part, index) => {
      if (part) nodes.push(part)
      if (index < parts.length - 1) {
        nodes.push(<br key={`blockquote-soft-break-${breakIndex}`} />)
        breakIndex += 1
      }
    })
  })

  return nodes
}

const MarkdownBlockquoteContext = createContext(false)

const MarkdownParagraph = ({ children, inCallout = false }: { children: ReactNode; inCallout?: boolean }) => {
  const inBlockquote = useContext(MarkdownBlockquoteContext)
  let normalizedChildren = normalizeInlineColorChildren(children)
  normalizedChildren = normalizeQuotedStrongChildren(normalizedChildren)
  if (inBlockquote) {
    normalizedChildren = normalizeSoftBreakChildren(normalizedChildren)
  }

  if (!inCallout) return <p>{normalizedChildren}</p>
  return <p className="aq-markdown-text">{normalizedChildren}</p>
}

const MarkdownBlockquote = ({ children }: { children: ReactNode }) => (
  <MarkdownBlockquoteContext.Provider value={true}>
    <blockquote>{children}</blockquote>
  </MarkdownBlockquoteContext.Provider>
)

const normalizeCodeLineBreaks = (value: string) => value.replace(/\r\n?|\u2028|\u2029/g, "\n")

const extractTextFromMarkdownNode = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(extractTextFromMarkdownNode).join("\n")
  if (!node || typeof node !== "object" || !("props" in node)) return ""
  return extractTextFromMarkdownNode((node as { props?: { children?: ReactNode } }).props?.children)
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
  const isWideOverflowTable = layout?.overflowMode === "wide"
  const columnWidths = layout?.columnWidths
  const normalizedColumnWidths = useMemo(
    () =>
      (columnWidths ?? []).map((width) =>
        typeof width === "number" && Number.isFinite(width) && width > 0
          ? Math.max(TABLE_MIN_COLUMN_WIDTH_PX, Math.round(width))
          : null
      ),
    [columnWidths]
  )
  const explicitTableWidth = useMemo(
    () => normalizedColumnWidths.reduce<number>((sum, width) => sum + (width || 0), 0),
    [normalizedColumnWidths]
  )
  const hasExplicitColumnWidths = useMemo(
    () => normalizedColumnWidths.some((width) => typeof width === "number" && width > 0),
    [normalizedColumnWidths]
  )
  const normalizedColumnWidthPercentages = useMemo(
    () =>
      !isWideOverflowTable && explicitTableWidth > 0
        ? normalizedColumnWidths.map((width) =>
            width ? `${((width / explicitTableWidth) * 100).toFixed(4)}%` : null
          )
        : [],
    [explicitTableWidth, isWideOverflowTable, normalizedColumnWidths]
  )
  const tableStyle = useMemo<CSSProperties | undefined>(() => {
    if (isWideOverflowTable && explicitTableWidth > 0) {
      return {
        width: `${explicitTableWidth}px`,
        minWidth: `${explicitTableWidth}px`,
      }
    }

    if (!isWideOverflowTable) {
      return {
        width: "100%",
        minWidth: "100%",
        maxWidth: "100%",
      }
    }

    return undefined
  }, [explicitTableWidth, isWideOverflowTable])
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
          <table
            className={[
              "aq-table",
              isWideOverflowTable ? "aq-table-wide" : "aq-table-normal",
              className,
            ]
              .filter(Boolean)
              .join(" ")}
            data-overflow-mode={isWideOverflowTable ? "wide" : undefined}
            style={tableStyle}
          >
            {hasExplicitColumnWidths ? (
              <colgroup>
                {normalizedColumnWidths.map((width, index) => {
                  if (!width) return <col key={`table-col-${index}`} />
                  return (
                    <col
                      key={`table-col-${index}`}
                      style={
                        isWideOverflowTable
                          ? { width: `${width}px` }
                          : normalizedColumnWidthPercentages[index]
                            ? { width: normalizedColumnWidthPercentages[index] || undefined }
                            : undefined
                      }
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
        pre({ node: _node, children, className: _className, ...props }) {
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

          const mergedClassName = "aq-code aq-pretty-pre"
          const initialCodePresentation = renderImmediateCodeToHtml({
            source: rawCode,
            language,
          })
          const initialCodeText = normalizeCodeLineBreaks(rawCode)

          return (
            <PrettyCodeBlock
              language={initialCodePresentation.language}
              rawCode={rawCode}
              preElement={
                <pre {...props} className={mergedClassName}>
                  <code
                    className={`language-${initialCodePresentation.language}`}
                    data-language={initialCodePresentation.language}
                    data-raw-code={rawCode}
                  >
                    {initialCodeText}
                  </code>
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
              <summary>
                <span className="aq-toggle__caret" aria-hidden="true" />
                <span className="aq-toggle__title">{segment.title}</span>
              </summary>
              <div className="aq-toggle__body">{renderMarkdown(segment.content, `toggle-body-${index}`)}</div>
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
