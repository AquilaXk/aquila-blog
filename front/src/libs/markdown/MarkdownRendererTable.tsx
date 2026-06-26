import {
  createContext,
  type CSSProperties,
  type ReactNode,
  useContext,
  useMemo,
  useRef,
} from "react"
import {
  TABLE_MIN_COLUMN_WIDTH_PX,
  TABLE_MIN_ROW_HEIGHT_PX,
  type MarkdownTableCellAlignment,
  type MarkdownTableCellLayout,
  type MarkdownTableLayout,
} from "src/libs/markdown/tableMetadata"

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

export const MarkdownTableRenderer = ({
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
  const usesExplicitNormalWidth = !isWideOverflowTable && explicitTableWidth > 0
  const tableStyle = useMemo<CSSProperties | undefined>(() => {
    if ((isWideOverflowTable || usesExplicitNormalWidth) && explicitTableWidth > 0) {
      return {
        width: `${explicitTableWidth}px`,
        minWidth: `${explicitTableWidth}px`,
      }
    }

    if (!isWideOverflowTable) {
      return {
        width: "100%",
        minWidth: "680px",
        maxWidth: "none",
      }
    }

    return undefined
  }, [explicitTableWidth, isWideOverflowTable, usesExplicitNormalWidth])
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
      <div
        className="aq-table-shell"
        data-table-width-mode={usesExplicitNormalWidth ? "explicit-normal" : undefined}
      >
        <div
          className="aq-table-scroll"
          data-table-width-mode={usesExplicitNormalWidth ? "explicit-normal" : undefined}
        >
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
                        isWideOverflowTable || usesExplicitNormalWidth
                          ? { width: `${width}px` }
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

export const MarkdownTableRowRenderer = ({
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

export const MarkdownTableCellRenderer = ({
  alignment,
  as: Component,
  children,
  className,
}: {
  alignment?: string
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
  const markdownAlignment: MarkdownTableCellAlignment | null =
    alignment === "left" || alignment === "center" || alignment === "right" ? alignment : null

  if (cellLayout?.hidden) {
    return null
  }

  const rowSpan = cellLayout?.rowspan && cellLayout.rowspan > 1 ? cellLayout.rowspan : undefined
  const colSpan = cellLayout?.colspan && cellLayout.colspan > 1 ? cellLayout.colspan : undefined
  const textAlign = cellLayout?.align || columnAlignment || markdownAlignment || undefined
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
