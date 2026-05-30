import type { Editor as TiptapEditor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import {
  clearNextEditorPointerAfterTable,
  preserveWindowScrollForRichBlockSelectAll,
  preserveWindowScrollPositionAcrossFrames,
  type WindowScrollAnchor,
} from "./blockHandleLayoutModel"

export const isPrimarySelectAllKeyboardEvent = (event: KeyboardEvent) => {
  if (event.defaultPrevented || event.altKey || event.shiftKey) return false
  if (!(event.metaKey || event.ctrlKey)) return false
  return event.code === "KeyA" || event.key.toLowerCase() === "a"
}

const resolveElement = (target: EventTarget | Node | null | undefined) => {
  if (target instanceof Element) return target
  if (target instanceof Node) return target.parentElement
  return null
}

const TABLE_TEXT_SELECTION_CONTROL_SELECTOR = "[data-table-axis-rail='true'], [data-table-affordance], [data-table-menu-root='true'], [data-table-menu-trigger='true'], [data-testid^='table-column-resize-boundary-'], [data-testid='table-structure-menu-button'], [data-testid='table-corner-handle'], [data-testid='table-corner-grow-handle'], .column-resize-handle"
export const resolveTableTextCellAtPoint = (clientX: number, clientY: number, target?: EventTarget | Node | null, options: { allowControlFallback?: boolean } = {}) => {
  const pointElements = document.elementsFromPoint(clientX, clientY), targetElement = resolveElement(target)
  return !options.allowControlFallback && (targetElement?.closest(TABLE_TEXT_SELECTION_CONTROL_SELECTOR) || pointElements[0]?.closest(TABLE_TEXT_SELECTION_CONTROL_SELECTOR)) ? null : pointElements.find((element) => Boolean(element.closest("th, td")))?.closest("th, td") ?? targetElement?.closest("th, td")
}

export const resolveTableTextSelectionRangeCells = (clientX: number, clientY: number, target?: EventTarget | Node | null) => {
  const pointCell = resolveTableTextCellAtPoint(clientX, clientY, target)
  const selection = window.getSelection()
  const anchorElement = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement ?? null
  const selectedText = selection?.toString().trim() ?? ""
  const pointTable = pointCell?.closest("table")
  const anchorCell = anchorElement?.closest("th, td") ?? Array.from(pointTable?.querySelectorAll<HTMLElement>("th, td") ?? []).find((cell) => {
    const cellText = normalizeCellText(cell)
    return cellText === selectedText || cellText.includes(selectedText) || selectedText.includes(cellText)
  })
  return pointCell instanceof HTMLElement && anchorCell instanceof HTMLElement && selectedText && pointTable === anchorCell.closest("table") ? { anchorCell, pointCell } : null
}

let pendingTableTextSelectionRangeCells: { anchorCell: HTMLElement; pointCell: HTMLElement } | null = null, explicitTableTextDragStart: { cell: HTMLElement; x: number; y: number } | null = null
let activeTableTextRangePreserveCancel: (() => void) | null = null
let hasActiveTableTextSelection = false
let shouldClearActiveTableTextSelectionOnBlur = false
let lastTableSelectionRoot: HTMLElement | null = null
const TABLE_TEXT_HIGHLIGHT_NAME = "aq-table-text-selection"
const clearTableTextRangeHighlight = (options: { markBlur?: boolean } = {}) => {
  const shouldClearTableSelection =
    hasActiveTableTextSelection ||
    hasTableTextSelectionState(document.documentElement)
  if (shouldClearTableSelection && (options.markBlur ?? true)) {
    shouldClearActiveTableTextSelectionOnBlur = true
  }
  hasActiveTableTextSelection = false
  document.querySelectorAll("[data-table-drag-selection-text]").forEach((element) => element.removeAttribute("data-table-drag-selection-text"))
  document.documentElement.removeAttribute("data-table-drag-selection-text")
  ;(CSS as typeof CSS & { highlights?: { delete: (name: string) => void } }).highlights?.delete(TABLE_TEXT_HIGHLIGHT_NAME)
}
const paintTableTextRangeHighlight = (range: Range) => { const HighlightCtor = (window as typeof window & { Highlight?: new (range: Range) => unknown }).Highlight, highlights = (CSS as typeof CSS & { highlights?: { set: (name: string, highlight: unknown) => void } }).highlights; if (!HighlightCtor || !highlights) return; if (!document.getElementById("aq-table-text-highlight-style")) { const style = document.createElement("style"); style.id = "aq-table-text-highlight-style"; style.textContent = `::highlight(${TABLE_TEXT_HIGHLIGHT_NAME}){background:#0a5b9d;color:white}`; document.head.append(style) } highlights.set(TABLE_TEXT_HIGHLIGHT_NAME, new HighlightCtor(range.cloneRange())) }
const resolveExplicitTableTextSelectionRangeCells = (clientX: number, clientY: number, target?: EventTarget | Node | null, explicitDragStart = explicitTableTextDragStart) => { const pointCell = resolveTableTextCellAtPoint(clientX, clientY, target); return explicitDragStart && pointCell instanceof HTMLElement && pointCell.closest("table") === explicitDragStart.cell.closest("table") && (Math.abs(clientX - explicitDragStart.x) > 4 || Math.abs(clientY - explicitDragStart.y) > 4) ? { anchorCell: explicitDragStart.cell, pointCell } : null }
const preserveExplicitTableTextSelectionFromPoint = (clientX: number, clientY: number, target?: EventTarget | Node | null) => { const rangeCells = resolveExplicitTableTextSelectionRangeCells(clientX, clientY, target); if (!rangeCells || rangeCells.anchorCell === rangeCells.pointCell) return false; pendingTableTextSelectionRangeCells = rangeCells; selectTableCellTextRange(rangeCells.anchorCell, rangeCells.pointCell); preserveTableTextRangeAcrossFrames(rangeCells.anchorCell, rangeCells.pointCell); return true }
const preserveExplicitTableTextSelectionFromMoveEvent = (event: MouseEvent | PointerEvent) => { if (event.buttons !== 1) { pendingTableTextSelectionRangeCells = null; return } if (preserveExplicitTableTextSelectionFromPoint(event.clientX, event.clientY, event.target)) { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); return } pendingTableTextSelectionRangeCells = resolveTableTextSelectionRangeCells(event.clientX, event.clientY, event.target) ?? pendingTableTextSelectionRangeCells }

const preserveTableTextRangeAcrossFrames = (anchorCell: HTMLElement, pointCell: HTMLElement) => {
  activeTableTextRangePreserveCancel?.()
  let cancelled = false, frame = 0
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now()
  const cleanup = () => {
    window.removeEventListener("pointerdown", cancel, true); window.removeEventListener("mousedown", cancel, true); window.removeEventListener("wheel", cancel, true); window.removeEventListener("scroll", cancel, true); window.removeEventListener("keydown", cancel, true)
    if (activeTableTextRangePreserveCancel === cancel) activeTableTextRangePreserveCancel = null
  }
  const cancel = (event?: Event) => {
    cancelled = true
    clearTableTextRangeHighlight({
      markBlur: !(event instanceof KeyboardEvent),
    })
    cleanup()
  }
  const restore = () => {
    if (cancelled) return
    selectTableCellTextRange(anchorCell, pointCell)
    frame += 1
    const elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt
    if (frame < 96 || elapsedMs < 1_600) {
      window.requestAnimationFrame(restore)
    }
  }
  activeTableTextRangePreserveCancel = cancel
  window.addEventListener("pointerdown", cancel, { capture: true, once: true }); window.addEventListener("mousedown", cancel, { capture: true, once: true })
  window.addEventListener("wheel", cancel, { capture: true, passive: true, once: true }); window.addEventListener("scroll", cancel, { capture: true, passive: true, once: true })
  window.addEventListener("keydown", cancel, { capture: true, once: true })
  window.requestAnimationFrame(restore)
  return cancel
}

export const finalizeTableTextSelectionFromPoint = (clientX: number, clientY: number, target?: EventTarget | Node | null) => {
  const explicitDragStart = explicitTableTextDragStart
  explicitTableTextDragStart = null
  const pointCell = resolveTableTextCellAtPoint(clientX, clientY, target), explicitRangeCells = resolveExplicitTableTextSelectionRangeCells(clientX, clientY, target, explicitDragStart), rangeCells = resolveTableTextSelectionRangeCells(clientX, clientY, target) ?? (pointCell ? pendingTableTextSelectionRangeCells : null) ?? explicitRangeCells
  pendingTableTextSelectionRangeCells = null
  if (!rangeCells || rangeCells.anchorCell === rangeCells.pointCell) return false
  cancelActiveTableCellTextSelectionPreserves()
  const restore = () => selectTableCellTextRange(rangeCells.anchorCell, rangeCells.pointCell)
  window.requestAnimationFrame(restore); window.setTimeout(restore, 80); window.setTimeout(restore, 180)
  preserveTableTextRangeAcrossFrames(rangeCells.anchorCell, rangeCells.pointCell)
  return true
}

const rememberExplicitTableTextDragStart = (event: MouseEvent | PointerEvent) => { if (event.button !== 0 || ("pointerType" in event && event.pointerType && event.pointerType !== "mouse")) return; const startCell = resolveTableTextCellAtPoint(event.clientX, event.clientY, event.target); explicitTableTextDragStart = startCell instanceof HTMLElement ? { cell: startCell, x: event.clientX, y: event.clientY } : null }
const finalizeTableTextSelectionFromPointerCancel = (event: PointerEvent) => {
  const explicitDragStart = explicitTableTextDragStart
  if (finalizeTableTextSelectionFromPoint(event.clientX, event.clientY, event.target)) return
  if (explicitDragStart) explicitTableTextDragStart = explicitDragStart
}
if (typeof window !== "undefined" && typeof document !== "undefined") {
    const tableSelectionWindow = window as typeof window & { __aqTableTextSelectionFinalizerInstalled?: boolean }
    if (!tableSelectionWindow.__aqTableTextSelectionFinalizerInstalled) {
      tableSelectionWindow.__aqTableTextSelectionFinalizerInstalled = true
      window.addEventListener("pointerdown", rememberExplicitTableTextDragStart, true); window.addEventListener("mousedown", rememberExplicitTableTextDragStart, true)
      window.addEventListener("pointermove", preserveExplicitTableTextSelectionFromMoveEvent, true); window.addEventListener("mousemove", preserveExplicitTableTextSelectionFromMoveEvent, true)
      window.addEventListener("dragover", (event) => { if (preserveExplicitTableTextSelectionFromPoint(event.clientX, event.clientY, event.target)) event.preventDefault() }, true)
      window.addEventListener("dragenter", (event) => { if (preserveExplicitTableTextSelectionFromPoint(event.clientX, event.clientY, event.target)) event.preventDefault() }, true)
      window.addEventListener("pointerup", (event) => finalizeTableTextSelectionFromPoint(event.clientX, event.clientY, event.target), true)
      window.addEventListener("pointercancel", finalizeTableTextSelectionFromPointerCancel, true)
      window.addEventListener("mouseup", (event) => finalizeTableTextSelectionFromPoint(event.clientX, event.clientY, event.target), true)
      window.addEventListener("dragend", (event) => finalizeTableTextSelectionFromPoint(event.clientX, event.clientY, event.target), true)
      window.addEventListener("drop", (event) => finalizeTableTextSelectionFromPoint(event.clientX, event.clientY, event.target), true)
    }
  }

const normalizeCellText = (cell: Element | null | undefined) => cell?.textContent?.replace(/\s+/g, " ").trim() ?? ""

const resolveCellTable = (cell: HTMLElement | null | undefined) => cell?.closest("table") ?? null
const isConnectedTableCell = (cell: HTMLElement) => cell.isConnected && document.documentElement.contains(cell)

const resolveCurrentTableTextRangeCells = (
  startedCell: HTMLElement,
  endCell: HTMLElement
) => {
  const startedTable = resolveCellTable(startedCell)
  if (
    isConnectedTableCell(startedCell) &&
    isConnectedTableCell(endCell) &&
    startedTable &&
    resolveCellTable(endCell) === startedTable
  ) {
    return { endCell, startedCell }
  }

  const startedText = normalizeCellText(startedCell)
  const endText = normalizeCellText(endCell)
  const hasStartedText = Boolean(startedText)
  const hasEndText = Boolean(endText)
  const originalCells = startedTable ? Array.from(startedTable.querySelectorAll<HTMLElement>("th, td")) : []
  const startedIndex = originalCells.indexOf(startedCell)
  const endIndex = originalCells.indexOf(endCell)
  if ((!hasStartedText || !hasEndText) && startedIndex >= 0 && endIndex >= 0) {
    return { endCell: originalCells[endIndex], startedCell: originalCells[startedIndex] }
  }
  for (const table of Array.from(document.querySelectorAll("table"))) {
    const cells = Array.from(table.querySelectorAll<HTMLElement>("th, td"))
    const indexedStartedCell = startedIndex >= 0 ? cells[startedIndex] : null
    const indexedEndCell = endIndex >= 0 ? cells[endIndex] : null
    if (
      indexedStartedCell &&
      indexedEndCell &&
      normalizeCellText(indexedStartedCell) === startedText &&
      normalizeCellText(indexedEndCell) === endText
    ) {
      return { endCell: indexedEndCell, startedCell: indexedStartedCell }
    }

    if (!hasStartedText || !hasEndText) {
      continue
    }

    const textStartedCell = cells.find((cell) => normalizeCellText(cell) === startedText)
    const textEndCell = cells.find((cell) => normalizeCellText(cell) === endText)
    if (textStartedCell && textEndCell) {
      return { endCell: textEndCell, startedCell: textStartedCell }
    }
  }
  return null
}

const resolveConnectedTableCell = (
  editor: TiptapEditor,
  startedCell: HTMLElement
) => {
  if (startedCell.isConnected && editor.view.dom.contains(startedCell)) {
    return startedCell
  }

  const startedText = normalizeCellText(startedCell)
  if (!startedText) return null

  return (
    Array.from(editor.view.dom.querySelectorAll<HTMLElement>("th, td")).find(
      (candidate) => normalizeCellText(candidate) === startedText
    ) ?? null
  )
}

const resolveOwnedTableRangeEndCell = (
  editor: TiptapEditor,
  startedCell: HTMLElement,
  endCell: HTMLElement | null | undefined
) => {
  if (!endCell) return null
  const currentCell = resolveConnectedTableCell(editor, endCell)
  const startedTable = resolveCellTable(startedCell)
  if (!currentCell || !startedTable || resolveCellTable(currentCell) !== startedTable) {
    return null
  }
  return currentCell
}

const resolveTextBoundary = (element: HTMLElement, edge: "end" | "start") => {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let firstText: Text | null = null
  let lastText: Text | null = null
  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text
    if (!firstText) firstText = textNode
    lastText = textNode
  }
  const textNode = edge === "start" ? firstText : lastText
  if (textNode) {
    return {
      node: textNode,
      offset: edge === "start" ? 0 : textNode.data.length,
    }
  }
  return {
    node: element,
    offset: edge === "start" ? 0 : element.childNodes.length,
  }
}

const isElementBeforeOrSame = (start: HTMLElement, end: HTMLElement) =>
  start === end || Boolean(start.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING)

export const selectTableCellTextRange = (
  startedCell: HTMLElement,
  endCell: HTMLElement
) => {
  const selection = window.getSelection()
  if (!selection) return ""
  const resolvedCells = resolveCurrentTableTextRangeCells(startedCell, endCell)
  if (!resolvedCells) return ""
  hasActiveTableTextSelection = true
  const range = document.createRange()
  const forward = isElementBeforeOrSame(resolvedCells.startedCell, resolvedCells.endCell)
  const rangeStartCell = forward ? resolvedCells.startedCell : resolvedCells.endCell, rangeEndCell = forward ? resolvedCells.endCell : resolvedCells.startedCell
  const startBoundary = resolveTextBoundary(rangeStartCell, "start")
  const endBoundary = resolveTextBoundary(rangeEndCell, "end")
  range.setStart(startBoundary.node, startBoundary.offset)
  range.setEnd(endBoundary.node, endBoundary.offset)
  selection.removeAllRanges()
  if (typeof selection.setBaseAndExtent === "function") selection.setBaseAndExtent(startBoundary.node, startBoundary.offset, endBoundary.node, endBoundary.offset)
  else selection.addRange(range)
  const selectedText = selection.toString() || range.toString()
  resolvedCells.startedCell.setAttribute("data-table-drag-selection-text", selectedText || normalizeCellText(resolvedCells.startedCell))
  document.documentElement.setAttribute("data-table-drag-selection-text", selectedText || normalizeCellText(resolvedCells.startedCell))
  paintTableTextRangeHighlight(range)
  return selectedText
}

const isSelectionInsideSameTable = (selection: Selection, table: Element | null) => {
  if (!table) return false
  const anchorElement = resolveElement(selection.anchorNode)
  const focusElement = resolveElement(selection.focusNode)
  return Boolean(anchorElement && focusElement && table.contains(anchorElement) && table.contains(focusElement))
}

const resolveWholeTableTextRangeCells = (cell: HTMLElement) => {
  const table = resolveCellTable(cell)
  if (!table) return null

  const rows = Array.from(table.rows)
  const cells = rows.flatMap((row) => Array.from(row.cells)).filter(isConnectedTableCell)

  return cells[0] && cells[cells.length - 1]
    ? { firstCell: cells[0], lastCell: cells[cells.length - 1] }
    : null
}

const asTableCell = (element: Element | null) =>
  element instanceof HTMLElement ? element : null

type ActiveTableCellPath = {
  tableIndex: number
  rowIndex: number
  cellIndex: number
}

let lastActiveTableCell: HTMLElement | null = null
let lastActiveTableCellPath: ActiveTableCellPath | null = null
const activeTableCellScrollPreserveCancels = new Set<() => void>()
const activeTableCellSelectionPreserveCancels = new Set<() => void>()
const TABLE_DRAG_SELECTION_TEXT_ATTR = "data-table-drag-selection-text"
const TABLE_DRAG_SELECTION_TEXT_SELECTOR = `[${TABLE_DRAG_SELECTION_TEXT_ATTR}]`
const TABLE_TEXT_DRAG_SCROLL_PRESERVE_FRAMES = 168
const TABLE_TEXT_DRAG_SCROLL_PRESERVE_MIN_MS = 2_800

export const cancelActiveTableCellScrollPreserves = () => {
  activeTableCellScrollPreserveCancels.forEach((cancel) => cancel())
  activeTableCellScrollPreserveCancels.clear()
}

export const cancelActiveTableCellTextSelectionPreserves = () => {
  activeTableCellSelectionPreserveCancels.forEach((cancel) => cancel())
  activeTableCellSelectionPreserveCancels.clear()
  activeTableTextRangePreserveCancel?.(); clearTableTextRangeHighlight()
  cancelActiveTableCellScrollPreserves()
}

const isWindowSelectionInsideEditorTable = (editorRoot: HTMLElement) => {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return false
  const anchorElement = resolveElement(selection.anchorNode)
  const focusElement = resolveElement(selection.focusNode)
  const anchorCell = anchorElement?.closest("th, td")
  const focusCell = focusElement?.closest("th, td")
  const anchorTable = anchorCell?.closest("table")
  return Boolean(
    anchorCell &&
      focusCell &&
      anchorTable &&
      focusCell.closest("table") === anchorTable &&
      editorRoot.contains(anchorTable)
  )
}
const hasTableTextSelectionState = (editorRoot: HTMLElement) => Boolean(document.documentElement.getAttribute(TABLE_DRAG_SELECTION_TEXT_ATTR)?.trim() || editorRoot.querySelector(TABLE_DRAG_SELECTION_TEXT_SELECTOR)) || isWindowSelectionInsideEditorTable(editorRoot)

const resolveDomElementAtEditorPos = (editor: TiptapEditor, pos: number) => {
  const docSize = editor.state.doc.content.size
  const safePos = Math.max(0, Math.min(docSize, pos))
  try {
    return resolveElement(editor.view.domAtPos(safePos).node)
  } catch {
    return null
  }
}

const isEditorSelectionInsideTable = (editor: TiptapEditor) => {
  const { selection } = editor.state
  if (selection.empty) return false

  const fromElement = resolveDomElementAtEditorPos(editor, selection.from)
  const toElement = resolveDomElementAtEditorPos(editor, Math.max(selection.from, selection.to - 1))
  return Boolean(
    fromElement?.closest("th, td") ||
      toElement?.closest("th, td")
  )
}

const captureActiveTableCellPath = (
  editorRoot: HTMLElement | null | undefined,
  cell: HTMLElement
) => {
  if (!editorRoot) return null
  const table = cell.closest("table")
  const row = cell.closest("tr")
  if (!(table instanceof HTMLTableElement) || !(row instanceof HTMLTableRowElement)) return null
  const tableNodes = Array.from(editorRoot.querySelectorAll("table"))
  const rowNodes = Array.from(table.querySelectorAll("tr"))
  const cellNodes = Array.from(row.querySelectorAll("th, td"))
  const tableIndex = tableNodes.indexOf(table)
  const rowIndex = rowNodes.indexOf(row)
  const cellIndex = cellNodes.indexOf(cell)
  if (tableIndex < 0 || rowIndex < 0 || cellIndex < 0) return null
  return {
    tableIndex,
    rowIndex,
    cellIndex,
  }
}

const resolveActiveTableCellFromPath = (editorRoot: HTMLElement | null | undefined, path: ActiveTableCellPath | null) => {
  if (!editorRoot || !path) return null
  const tableNodes = Array.from(editorRoot.querySelectorAll("table"))
  const table = tableNodes[path.tableIndex]
  if (!(table instanceof HTMLTableElement)) return null
  const rowNodes = Array.from(table.querySelectorAll("tr"))
  const row = rowNodes[path.rowIndex]
  if (!(row instanceof HTMLElement)) return null
  const cellNodes = Array.from(row.querySelectorAll("th, td"))
  const cell = cellNodes[path.cellIndex]
  return cell instanceof HTMLElement && editorRoot.contains(cell) ? cell : null
}

export const collapseStaleTableEditorSelection = (editor: TiptapEditor) => {
  if (!isEditorSelectionInsideTable(editor)) return false
  const { doc, selection } = editor.state
  const collapsePos = Math.max(0, Math.min(doc.content.size, selection.to))
  try {
    const nextSelection = TextSelection.near(doc.resolve(collapsePos), -1)
    editor.view.dispatch(editor.state.tr.setSelection(nextSelection))
    if (editor.view.dom instanceof HTMLElement) {
      editor.view.dom.focus({ preventScroll: true })
    }
    return true
  } catch {
    return false
  }
}

export const watchTableCellTextSelectionExternalClear = (
  editorRoot: HTMLElement,
  isDragActive: () => boolean,
  onExternalClear: () => void
) => {
  let hadTableTextSelectionState = false
  let clearRafId: number | null = null
  const reset = () => {
    hadTableTextSelectionState = false
  }
  const markActive = () => {
    hadTableTextSelectionState = true
  }
  const cancelIfCleared = () => {
    if (hasTableTextSelectionState(editorRoot)) {
      markActive()
      return false
    }
    if (!hadTableTextSelectionState || isDragActive()) return false
    reset()
    onExternalClear()
    return true
  }
  const scheduleClearCheck = () => {
    if (clearRafId !== null) return
    clearRafId = window.requestAnimationFrame(() => {
      clearRafId = null
      cancelIfCleared()
    })
  }
  const observer =
    typeof MutationObserver !== "undefined"
      ? new MutationObserver((records) => {
          if (!hadTableTextSelectionState && hasTableTextSelectionState(editorRoot)) {
            markActive()
            return
          }
          if (!hadTableTextSelectionState) return
          if (
            records.some(
              (record) =>
                record.type === "attributes" &&
                record.attributeName === TABLE_DRAG_SELECTION_TEXT_ATTR
            )
          ) {
            scheduleClearCheck()
          }
        })
      : null
  observer?.observe(editorRoot, {
    attributeFilter: [TABLE_DRAG_SELECTION_TEXT_ATTR],
    attributes: true,
    subtree: true,
  })
  observer?.observe(document.documentElement, { attributeFilter: [TABLE_DRAG_SELECTION_TEXT_ATTR], attributes: true })
  return {
    cancelIfCleared,
    dispose: () => {
      observer?.disconnect()
      if (clearRafId !== null) window.cancelAnimationFrame(clearRafId)
    },
    markActive,
    reset,
  }
}

const hasOwnedTableCellTextSelection = (
  editor: TiptapEditor,
  startedCell: HTMLElement
) => {
  const currentCell = resolveConnectedTableCell(editor, startedCell)
  if (!currentCell) return false
  if (currentCell.getAttribute("data-table-drag-selection-text")?.trim()) {
    return true
  }

  const selection = window.getSelection()
  if (!selection?.toString().trim()) return false
  return isSelectionInsideSameTable(selection, resolveCellTable(currentCell))
}

const clearOwnedTableCellDragSelectionText = (
  editor: TiptapEditor,
  startedCell: HTMLElement
) => {
  resolveConnectedTableCell(editor, startedCell)?.removeAttribute(
    "data-table-drag-selection-text"
  )
}

export const rememberActiveTableCellFromTarget = (
  eventTarget: EventTarget | Node | null | undefined,
  editorRoot?: HTMLElement | null
) => {
  if (editorRoot && editorRoot !== lastTableSelectionRoot) {
    lastTableSelectionRoot = editorRoot
    shouldClearActiveTableTextSelectionOnBlur = false
    hasActiveTableTextSelection = false
  }
  const targetElement = resolveElement(eventTarget)
  const cell = targetElement?.closest("th, td")
  if (cell instanceof HTMLElement && (!editorRoot || editorRoot.contains(cell))) {
    shouldClearActiveTableTextSelectionOnBlur = false
    lastActiveTableCell = cell
    lastActiveTableCellPath = captureActiveTableCellPath(editorRoot, cell)
    return
  }
  if (!editorRoot || !targetElement || !editorRoot.contains(targetElement)) {
    return
  }

  const currentTable = targetElement.closest("table")
  if (!currentTable) {
    if (hasActiveTableTextSelection || hasTableTextSelectionState(editorRoot)) {
      shouldClearActiveTableTextSelectionOnBlur = true
    }
    lastActiveTableCell = null
    lastActiveTableCellPath = null
    return
  }

  const existingCell = lastActiveTableCell?.isConnected ? lastActiveTableCell : null
  if (!existingCell || existingCell.closest("table") !== currentTable) {
    lastActiveTableCell = null
    lastActiveTableCellPath = null
  }
}

export const selectActiveTableCellText = (
  editor: TiptapEditor,
  eventTarget: EventTarget | null
) => {
  if (typeof window === "undefined" || typeof document === "undefined") return false
  const selection = window.getSelection(); if (!selection) return false

  const activeElement = resolveElement(document.activeElement)
  const anchorElement = resolveElement(selection.anchorNode)
  const focusElement = resolveElement(selection.focusNode)
  const targetElement = resolveElement(eventTarget)
  const hasDirectTableCellContext = Boolean(
    targetElement?.closest("th, td") ||
      anchorElement?.closest("th, td") ||
      focusElement?.closest("th, td")
  )
  if (
    targetElement?.closest(".aq-code-shell") ||
    anchorElement?.closest(".aq-code-shell") ||
    focusElement?.closest(".aq-code-shell") ||
    (!hasDirectTableCellContext && activeElement?.closest(".aq-code-shell"))
  ) {
    return false
  }

  const tableSelectionCandidate = resolveActiveTableCellFromPath(editor.view.dom, lastActiveTableCellPath)
  const rememberedCell = lastActiveTableCell?.isConnected
    ? lastActiveTableCell
    : tableSelectionCandidate
  const anchorCell = asTableCell(anchorElement?.closest("th, td") || null)
  const isEditorSelectionInsideCurrentTable = isEditorSelectionInsideTable(editor)
  const targetTable = targetElement?.closest("table")
  const activeTable = activeElement?.closest("table")
  const focusTable = focusElement?.closest("table")
  const rememberedTable = rememberedCell?.closest("table")
  const isSelectionInsideActiveTable = isWindowSelectionInsideEditorTable(editor.view.dom)
  const activeCell = asTableCell(activeElement?.closest("th, td") || null)
  const targetCell = asTableCell(targetElement?.closest("th, td") || null)
  const focusCell = asTableCell(focusElement?.closest("th, td") || null)
  if (targetCell || anchorCell || focusCell || isSelectionInsideActiveTable) {
    shouldClearActiveTableTextSelectionOnBlur = false
  }
  const hasActiveCellContext = Boolean(
    !shouldClearActiveTableTextSelectionOnBlur &&
    activeCell &&
      activeTable &&
      (activeTable === targetTable || activeTable === focusTable)
  )
  const hasExplicitTableContext = Boolean(
    targetCell ||
    hasActiveCellContext ||
    targetTable ||
    (!shouldClearActiveTableTextSelectionOnBlur && focusCell)
  )
  const hasTableContext = Boolean(
    targetTable ||
    targetCell ||
    (!shouldClearActiveTableTextSelectionOnBlur &&
      (hasActiveCellContext || focusTable || activeTable))
  )
  const hasRecoveredTableContext = Boolean(
    (isSelectionInsideActiveTable || isEditorSelectionInsideCurrentTable) &&
      hasTableContext &&
      rememberedTable &&
      (!targetTable || targetTable === rememberedTable) &&
      !shouldClearActiveTableTextSelectionOnBlur
  )
  const hasTableSelectionState = hasTableTextSelectionState(editor.view.dom)
  const hasTableSelectionContext = Boolean(
    hasExplicitTableContext ||
      hasRecoveredTableContext
  )
  if (!hasTableSelectionContext && (hasTableSelectionState || shouldClearActiveTableTextSelectionOnBlur)) {
    shouldClearActiveTableTextSelectionOnBlur = false
    hasActiveTableTextSelection = false
    const outsideParagraph = targetElement?.closest("p") || anchorElement?.closest("p") || focusElement?.closest("p")
    selection.removeAllRanges()
    clearTableTextRangeHighlight()
    if (outsideParagraph) {
      const paragraphRange = document.createRange()
      paragraphRange.selectNodeContents(outsideParagraph)
      selection.addRange(paragraphRange)
    }
    return true
  }
  const selectedCell =
    targetCell ??
    (!shouldClearActiveTableTextSelectionOnBlur ? focusCell : null) ??
    ((isSelectionInsideActiveTable || isEditorSelectionInsideCurrentTable) && hasExplicitTableContext ? activeCell : null) ??
    ((isSelectionInsideActiveTable || isEditorSelectionInsideCurrentTable) && hasExplicitTableContext ? anchorCell : null) ??
    (hasTableSelectionContext ? tableSelectionCandidate ?? rememberedCell : null) ??
    null
  if (!selectedCell && hasTableSelectionContext && !tableSelectionCandidate && !rememberedCell) {
    return false
  }
  if (!selectedCell && !hasTableSelectionContext) {
    return false
  }
  if (!selectedCell && tableSelectionCandidate) {
    lastActiveTableCell = tableSelectionCandidate
  }
  if (!selectedCell || !selectedCell.isConnected) {
    return false
  }

  if (!editor.view.dom.contains(selectedCell)) return false
  if (activeCell && !activeCell.isConnected) return false

  const wholeTableRangeCells = resolveWholeTableTextRangeCells(selectedCell)
  if (!wholeTableRangeCells) return false
  clearNextEditorPointerAfterTable()
  preserveWindowScrollForRichBlockSelectAll()
  selectTableCellTextRange(wholeTableRangeCells.firstCell, wholeTableRangeCells.lastCell)
  preserveTableTextRangeAcrossFrames(wholeTableRangeCells.firstCell, wholeTableRangeCells.lastCell)
  hasActiveTableTextSelection = true
  return true
}

export const restoreTableCellTextSelectionIfEscaped = (
  editor: TiptapEditor,
  startedCell: HTMLElement | null,
  scrollAnchor?: WindowScrollAnchor | null,
  restoreWhenEmpty = false,
  forceStartedCellSelection = false,
  preserveFallbackScroll = true,
  endCell: HTMLElement | null = null
) => {
  if (typeof window === "undefined" || typeof document === "undefined") return false
  if (!startedCell) return false
  const currentCell = resolveConnectedTableCell(editor, startedCell)
  if (!currentCell) return false
  const rangeEndCell = resolveOwnedTableRangeEndCell(editor, currentCell, endCell)

  const selection = window.getSelection()
  if (!selection) return false

  const anchorElement = resolveElement(selection.anchorNode)
  const focusElement = resolveElement(selection.focusNode)
  const hasTextSelection = selection.toString().trim().length > 0
  const table = resolveCellTable(currentCell)
  const isOwnedTableSelection = isSelectionInsideSameTable(selection, table)
  if (
    hasTextSelection &&
    (isOwnedTableSelection ||
      (anchorElement && currentCell.contains(anchorElement)) ||
      (focusElement && currentCell.contains(focusElement)))
  ) {
    currentCell.setAttribute("data-table-drag-selection-text", selection.toString())
    clearNextEditorPointerAfterTable()
    if (!forceStartedCellSelection || !rangeEndCell || rangeEndCell === currentCell) {
      return true
    }
  }
  if (!hasTextSelection && !restoreWhenEmpty) return false

  let restoredRangeText = ""
  if (rangeEndCell && rangeEndCell !== currentCell) {
    restoredRangeText = selectTableCellTextRange(currentCell, rangeEndCell)
  } else {
    const range = document.createRange()
    range.selectNodeContents(currentCell)
    selection.removeAllRanges()
    selection.addRange(range)
  }
  currentCell.setAttribute(
    "data-table-drag-selection-text",
    restoredRangeText || selection.toString() || normalizeCellText(currentCell)
  )
  clearNextEditorPointerAfterTable()
  if (scrollAnchor) {
    const cancelScrollPreserve = preserveWindowScrollPositionAcrossFrames(
      scrollAnchor,
      TABLE_TEXT_DRAG_SCROLL_PRESERVE_FRAMES,
      4,
      TABLE_TEXT_DRAG_SCROLL_PRESERVE_MIN_MS,
      true,
      false,
      true,
      true,
      false,
      () => !hasOwnedTableCellTextSelection(editor, startedCell)
    )
    if (cancelScrollPreserve) {
      activeTableCellScrollPreserveCancels.add(cancelScrollPreserve)
      window.setTimeout(
        () => activeTableCellScrollPreserveCancels.delete(cancelScrollPreserve),
        TABLE_TEXT_DRAG_SCROLL_PRESERVE_MIN_MS + 250
      )
    }
  } else if (preserveFallbackScroll) {
    preserveWindowScrollForRichBlockSelectAll()
  }
  return true
}

export const preserveTableCellTextSelectionAcrossFrames = (
  editor: TiptapEditor,
  startedCell: HTMLElement,
  _scrollAnchor: WindowScrollAnchor,
  resolveEndCell?: () => HTMLElement | null
) => {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now()
  let frame = 0
  let cancelled = false
  let restoring = false
  const cleanup = () => {
    activeTableCellSelectionPreserveCancels.delete(cancel)
    window.removeEventListener("pointerdown", cancel, true)
    window.removeEventListener("mousedown", cancel, true)
    window.removeEventListener("wheel", cancel, true)
    window.removeEventListener("scroll", cancel, true)
    window.removeEventListener("keydown", cancel, true)
    document.removeEventListener("selectionchange", cancelIfSelectionLeavesCell, true)
  }
  const cancel = () => {
    cancelled = true
    clearOwnedTableCellDragSelectionText(editor, startedCell)
    cancelActiveTableCellScrollPreserves()
    cleanup()
  }
  const cancelIfSelectionLeavesCell = () => {
    if (restoring || cancelled) return
    const currentCell = resolveConnectedTableCell(editor, startedCell)
    if (!currentCell) {
      cancel()
      return
    }
    const selection = window.getSelection()
    const selectionText = selection?.toString().trim() ?? ""
    if (!selection || !selectionText) {
      cancel()
      return
    }
    if (!isSelectionInsideSameTable(selection, resolveCellTable(currentCell))) {
      cancel()
    }
  }
  window.addEventListener("pointerdown", cancel, { capture: true, once: true })
  window.addEventListener("mousedown", cancel, { capture: true, once: true })
  window.addEventListener("wheel", cancel, { capture: true, passive: true, once: true })
  window.addEventListener("scroll", cancel, { capture: true, passive: true, once: true })
  window.addEventListener("keydown", cancel, { capture: true, once: true })
  document.addEventListener("selectionchange", cancelIfSelectionLeavesCell, true)
  activeTableCellSelectionPreserveCancels.add(cancel)
  const restore = () => {
    if (cancelled) return
    if (frame > 0 && !hasOwnedTableCellTextSelection(editor, startedCell)) {
      cancel()
      return
    }
    restoring = true
    const restored = restoreTableCellTextSelectionIfEscaped(editor, startedCell, null, true, true, false, resolveEndCell?.() ?? null)
    restoring = false
    if (!restored) {
      cancel()
      return
    }
    frame += 1
    const elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt
    const currentCell = resolveConnectedTableCell(editor, startedCell)
    if (currentCell && (frame < TABLE_TEXT_DRAG_SCROLL_PRESERVE_FRAMES || elapsedMs < TABLE_TEXT_DRAG_SCROLL_PRESERVE_MIN_MS)) {
      window.requestAnimationFrame(restore)
    } else {
      cleanup()
    }
  }
  restore()
  return cancel
}
