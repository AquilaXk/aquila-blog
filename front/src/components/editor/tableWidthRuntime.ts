import type { Editor as TiptapEditor } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { Transaction } from "@tiptap/pm/state"
import {
  TABLE_MIN_COLUMN_WIDTH_PX,
  TABLE_WIDE_COLUMN_MIN_WIDTH_PX,
} from "src/libs/markdown/tableMetadata"
import { readRenderedColumnWidths } from "./tableRenderedDomModel"
import {
  type TableColumnCellRef,
  collectSimpleTableColumnCells,
} from "./tableStructureModel"
import {
  TABLE_OVERFLOW_MODE_WIDE,
  TABLE_WIDTH_BUDGET_META_KEY,
  expandTableColumnWidthsToFit,
  getPreferredNormalTableTotalWidth,
  getTableOverflowMode,
  isLegacyCollapsedTableWidthState,
  isLegacyFullWidthInitializedTableState,
  shouldPromoteWideTableOverflowMode,
  shrinkTableColumnWidthsToFit,
} from "./tableWidthModel"

const DEFAULT_EDITOR_READABLE_WIDTH_PX = 48 * 16
const TABLE_RAIL_EDGE_PADDING_PX = 12
const DESKTOP_TABLE_RAIL_MEDIA_QUERY = "(max-width: 768px)"

export const getCurrentEditorReadableWidthPx = (editor?: TiptapEditor | null) => {
  const contentElement =
    (editor?.view.dom.closest(".aq-block-editor__content") as HTMLElement | null) ??
    (typeof document !== "undefined"
      ? document.querySelector<HTMLElement>(".aq-block-editor__content")
      : null)

  const contentRect = contentElement?.getBoundingClientRect() ?? null
  const measuredWidth = contentRect ? Math.round(contentRect.width) : DEFAULT_EDITOR_READABLE_WIDTH_PX
  const viewportBudget =
    contentRect && typeof window !== "undefined"
      ? Math.round(
          window.innerWidth -
            Math.max(TABLE_RAIL_EDGE_PADDING_PX, Math.round(contentRect.left)) -
            TABLE_RAIL_EDGE_PADDING_PX
        )
      : DEFAULT_EDITOR_READABLE_WIDTH_PX

  return Math.max(
    TABLE_MIN_COLUMN_WIDTH_PX,
    Math.min(
      measuredWidth || DEFAULT_EDITOR_READABLE_WIDTH_PX,
      viewportBudget || DEFAULT_EDITOR_READABLE_WIDTH_PX
    )
  )
}

export const shouldClampTableWidthBudget = () => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
  return !window.matchMedia(DESKTOP_TABLE_RAIL_MEDIA_QUERY).matches
}

export const readColumnWidthFromCell = (cell: TableColumnCellRef) => {
  const widthValue = Array.isArray(cell.node.attrs?.colwidth) ? cell.node.attrs?.colwidth[0] : null
  return typeof widthValue === "number" && Number.isFinite(widthValue) && widthValue > 0
    ? Math.max(TABLE_MIN_COLUMN_WIDTH_PX, Math.round(widthValue))
    : TABLE_MIN_COLUMN_WIDTH_PX
}

export const hasExplicitColumnWidth = (column: TableColumnCellRef[]) =>
  column.every((cell) => {
    const widthValue = Array.isArray(cell.node.attrs?.colwidth) ? cell.node.attrs?.colwidth[0] : null
    return typeof widthValue === "number" && Number.isFinite(widthValue) && widthValue > 0
  })

export const applyTableColumnWidthsToTransaction = (
  transaction: Transaction,
  columns: TableColumnCellRef[][],
  currentWidths: number[],
  nextWidths: number[]
) => {
  let nextTransaction = transaction
  let changed = false

  columns.forEach((column, columnIndex) => {
    const nextWidth = nextWidths[columnIndex]
    const explicitWidthMissing = !hasExplicitColumnWidth(column)
    if (currentWidths[columnIndex] === nextWidth && !explicitWidthMissing) return
    column.forEach((cell) => {
      nextTransaction = nextTransaction.setNodeMarkup(cell.pos, undefined, {
        ...cell.node.attrs,
        colwidth: [nextWidth],
      })
      changed = true
    })
  })

  return { transaction: nextTransaction, changed }
}

export type TableWidthSnapshot = {
  pos: number
  overflowMode: string
  columns: TableColumnCellRef[][]
  columnWidths: number[]
  totalWidth: number
}

export const collectTableWidthSnapshots = (doc: ProseMirrorNode) => {
  const snapshots: TableWidthSnapshot[] = []

  doc.descendants((node: any, pos: number) => {
    if (node.type?.name !== "table") return true

    const columns = collectSimpleTableColumnCells(node, pos)
    if (!columns || columns.length === 0) {
      return true
    }

    const columnWidths = columns.map((column) => readColumnWidthFromCell(column[0]))
    snapshots.push({
      pos,
      overflowMode: getTableOverflowMode(node),
      columns,
      columnWidths,
      totalWidth: columnWidths.reduce((sum, width) => sum + width, 0),
    })

    return true
  })

  return snapshots
}

export const rebalanceStructurallyChangedNormalTableWidths = (
  editor: TiptapEditor,
  previousDoc: ProseMirrorNode
) => {
  if (!shouldClampTableWidthBudget()) return false

  const readableWidthBudget = getCurrentEditorReadableWidthPx(editor) - 2
  const previousTables = collectTableWidthSnapshots(previousDoc)
  const nextTables = collectTableWidthSnapshots(editor.state.doc)
  let transaction = editor.state.tr
  let changed = false

  nextTables.forEach((nextTable, index) => {
    const previousTable = previousTables[index]
    if (!previousTable) return
    if (previousTable.overflowMode === TABLE_OVERFLOW_MODE_WIDE || nextTable.overflowMode === TABLE_OVERFLOW_MODE_WIDE) {
      return
    }
    if (previousTable.columns.length === nextTable.columns.length) return

    const minBudget = TABLE_MIN_COLUMN_WIDTH_PX * nextTable.columns.length
    const targetTotalWidth = Math.max(
      minBudget,
      Math.min(
        readableWidthBudget,
        previousTable.totalWidth > 0 ? previousTable.totalWidth : nextTable.totalWidth
      )
    )
    const nextWidths =
      nextTable.totalWidth > targetTotalWidth
        ? shrinkTableColumnWidthsToFit(nextTable.columnWidths, targetTotalWidth)
        : expandTableColumnWidthsToFit(nextTable.columnWidths, targetTotalWidth)

    if (nextWidths.every((width, widthIndex) => width === nextTable.columnWidths[widthIndex])) {
      return
    }

    const applied = applyTableColumnWidthsToTransaction(
      transaction,
      nextTable.columns,
      nextTable.columnWidths,
      nextWidths
    )
    transaction = applied.transaction
    changed ||= applied.changed
  })

  if (!changed || !transaction.docChanged) return false
  transaction = transaction.setMeta(TABLE_WIDTH_BUDGET_META_KEY, true)
  editor.view.dispatch(transaction)
  return true
}

export const normalizeTableWidthsToReadableBudget = (editor: TiptapEditor) => {
  if (!shouldClampTableWidthBudget()) return false

  const maxTableWidth = getCurrentEditorReadableWidthPx(editor) - 2
  let transaction = editor.state.tr
  let changed = false

  editor.state.doc.descendants((node: any, pos: number) => {
    if (node.type?.name !== "table") return true
    if (getTableOverflowMode(node) === TABLE_OVERFLOW_MODE_WIDE) return true

    const columns = collectSimpleTableColumnCells(node, pos)
    if (!columns || columns.length === 0) return true

    const currentWidths = columns.map((column) => readColumnWidthFromCell(column[0]))
    const minBudget = TABLE_MIN_COLUMN_WIDTH_PX * currentWidths.length
    const safeBudget = Math.max(minBudget, maxTableWidth)
    const totalWidth = currentWidths.reduce((sum, width) => sum + width, 0)
    const shouldRecoverLegacyFullWidth = isLegacyFullWidthInitializedTableState(currentWidths, safeBudget)
    if (totalWidth <= safeBudget && !shouldRecoverLegacyFullWidth) {
      return true
    }

    const targetWidth = shouldRecoverLegacyFullWidth
      ? getPreferredNormalTableTotalWidth(currentWidths.length, safeBudget)
      : safeBudget
    const nextWidths = shrinkTableColumnWidthsToFit(currentWidths, targetWidth)
    if (nextWidths.every((width, index) => width === currentWidths[index])) {
      return true
    }

    const applied = applyTableColumnWidthsToTransaction(transaction, columns, currentWidths, nextWidths)
    transaction = applied.transaction
    changed ||= applied.changed

    return true
  })

  if (!changed || !transaction.docChanged) return false
  transaction = transaction.setMeta(TABLE_WIDTH_BUDGET_META_KEY, true)
  editor.view.dispatch(transaction)
  return true
}

export const promoteLargeTablesToWideOverflowMode = (editor: TiptapEditor) => {
  if (!shouldClampTableWidthBudget()) return false

  const readableWidthBudget = getCurrentEditorReadableWidthPx(editor) - 2
  let transaction = editor.state.tr
  let changed = false

  editor.state.doc.descendants((node: any, pos: number) => {
    if (node.type?.name !== "table") return true
    if (getTableOverflowMode(node) === TABLE_OVERFLOW_MODE_WIDE) return true

    const columns = collectSimpleTableColumnCells(node, pos)
    if (!columns || columns.length === 0) return true
    if (!shouldPromoteWideTableOverflowMode(columns.length, readableWidthBudget)) return true

    const currentWidths = columns.map((column) => readColumnWidthFromCell(column[0]))
    const nextWidths = currentWidths.map((width) =>
      Math.max(TABLE_WIDE_COLUMN_MIN_WIDTH_PX, width)
    )
    const applied = applyTableColumnWidthsToTransaction(
      transaction,
      columns,
      currentWidths,
      nextWidths
    )
    transaction = applied.transaction.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      overflowMode: TABLE_OVERFLOW_MODE_WIDE,
    })
    changed = true

    return true
  })

  if (!changed || !transaction.docChanged) return false
  transaction = transaction.setMeta(TABLE_WIDTH_BUDGET_META_KEY, true)
  editor.view.dispatch(transaction)
  return true
}

export const syncRenderedTableOverflowModes = (editor: TiptapEditor) => {
  const renderedTables = Array.from(
    editor.view.dom.querySelectorAll<HTMLElement>(".tableWrapper > table")
  )
  let renderedTableIndex = 0

  editor.state.doc.descendants((node: any) => {
    if (node.type?.name !== "table") return true

    const renderedTable = renderedTables[renderedTableIndex] ?? null
    renderedTableIndex += 1
    if (!renderedTable) return true

    const overflowMode = getTableOverflowMode(node)
    if (overflowMode === TABLE_OVERFLOW_MODE_WIDE) {
      renderedTable.setAttribute("data-overflow-mode", TABLE_OVERFLOW_MODE_WIDE)
      renderedTable.parentElement?.setAttribute("data-overflow-mode", TABLE_OVERFLOW_MODE_WIDE)
    } else {
      renderedTable.removeAttribute("data-overflow-mode")
      renderedTable.parentElement?.removeAttribute("data-overflow-mode")
    }

    return true
  })

  for (let index = renderedTableIndex; index < renderedTables.length; index += 1) {
    renderedTables[index]?.removeAttribute("data-overflow-mode")
    renderedTables[index]?.parentElement?.removeAttribute("data-overflow-mode")
  }
}

export const getRenderedTableViewportBudgetPx = (tableElement: HTMLElement | null, fallbackBudget: number) => {
  if (!tableElement || typeof window === "undefined") return fallbackBudget

  const tableRect = tableElement.getBoundingClientRect()
  return Math.max(
    TABLE_MIN_COLUMN_WIDTH_PX,
    Math.round(
      window.innerWidth -
        Math.max(TABLE_RAIL_EDGE_PADDING_PX, Math.round(tableRect.left)) -
        TABLE_RAIL_EDGE_PADDING_PX
    )
  )
}

export const normalizeRenderedTableWidthsToReadableBudget = (editor: TiptapEditor) => {
  if (!shouldClampTableWidthBudget()) return false

  const readableWidthBudget = getCurrentEditorReadableWidthPx(editor) - 2
  const renderedTables = Array.from(
    editor.view.dom.querySelectorAll<HTMLElement>(".tableWrapper > table")
  )
  let renderedTableIndex = 0
  let transaction = editor.state.tr
  let changed = false

  editor.state.doc.descendants((node: any, pos: number) => {
    if (node.type?.name !== "table") return true
    if (getTableOverflowMode(node) === TABLE_OVERFLOW_MODE_WIDE) return true

    const columns = collectSimpleTableColumnCells(node, pos)
    const renderedTable = renderedTables[renderedTableIndex] ?? null
    renderedTableIndex += 1
    if (!columns || columns.length === 0) return true

    const currentWidths = columns.map((column) => readColumnWidthFromCell(column[0]))
    const requiresExplicitWidths = columns.some((column) => !hasExplicitColumnWidth(column))
    const renderedColumnWidths = readRenderedColumnWidths(renderedTable)
    const measuredWidths =
      renderedColumnWidths.length === columns.length ? renderedColumnWidths : currentWidths
    const shouldRecoverLegacyCollapsedWidths = isLegacyCollapsedTableWidthState(measuredWidths)
    const measuredTotalWidth = measuredWidths.reduce((sum, width) => sum + width, 0)
    const minBudget = TABLE_MIN_COLUMN_WIDTH_PX * currentWidths.length
    const viewportBudget = getRenderedTableViewportBudgetPx(renderedTable, readableWidthBudget)
    const safeBudget = Math.max(minBudget, Math.min(readableWidthBudget, viewportBudget))
    const renderedTableWidth = renderedTable
      ? Math.round(renderedTable.getBoundingClientRect().width)
      : measuredTotalWidth
    const borderOverhead = Math.max(0, renderedTableWidth - measuredTotalWidth)
    const contentBudget = Math.max(minBudget, safeBudget - borderOverhead)
    const shouldRecoverLegacyFullWidth = isLegacyFullWidthInitializedTableState(currentWidths, contentBudget)
    if (
      renderedTableWidth <= safeBudget &&
      !requiresExplicitWidths &&
      !shouldRecoverLegacyCollapsedWidths &&
      !shouldRecoverLegacyFullWidth
    ) {
      return true
    }

    const targetContentBudget = shouldRecoverLegacyFullWidth
      ? getPreferredNormalTableTotalWidth(currentWidths.length, contentBudget)
      : contentBudget
    const nextWidths =
      measuredTotalWidth > targetContentBudget
        ? shrinkTableColumnWidthsToFit(measuredWidths, targetContentBudget)
        : measuredWidths.map((width) => Math.max(TABLE_MIN_COLUMN_WIDTH_PX, Math.round(width)))
    if (nextWidths.every((width, index) => width === currentWidths[index])) {
      return true
    }

    const applied = applyTableColumnWidthsToTransaction(transaction, columns, currentWidths, nextWidths)
    transaction = applied.transaction
    changed ||= applied.changed

    return true
  })

  if (!changed || !transaction.docChanged) return false
  transaction = transaction.setMeta(TABLE_WIDTH_BUDGET_META_KEY, true)
  editor.view.dispatch(transaction)
  return true
}
