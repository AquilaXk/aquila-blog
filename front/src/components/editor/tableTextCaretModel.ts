import type { Editor as TiptapEditor } from "@tiptap/core"
import type { ResolvedPos } from "@tiptap/pm/model"
import { TextSelection } from "@tiptap/pm/state"
import { getFirstEditableTextPositionInNode } from "./blockSelectionModel"
import { clearNextEditorPointerAfterTable } from "./blockHandleLayoutModel"
import {
  cancelActiveTableCellTextSelectionPreserves,
  resolveTableTextCellAtPoint,
} from "./tableTextSelectionModel"

const TABLE_DRAG_SELECTION_TEXT_ATTR = "data-table-drag-selection-text"
const TABLE_DRAG_SELECTION_TEXT_SELECTOR = `[${TABLE_DRAG_SELECTION_TEXT_ATTR}]`

const resolveElement = (target: EventTarget | Node | null | undefined) => {
  if (target instanceof Element) return target
  if (target instanceof Node) return target.parentElement
  return null
}

const resolveCaretRangeFromPoint = (clientX: number, clientY: number) => {
  const caretDocument = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number
    ) => { offset: number; offsetNode: Node } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  const position = caretDocument.caretPositionFromPoint?.(clientX, clientY)
  if (position) {
    const range = document.createRange()
    range.setStart(position.offsetNode, position.offset)
    range.collapse(true)
    return range
  }
  const range = caretDocument.caretRangeFromPoint?.(clientX, clientY)
  range?.collapse(true)
  return range ?? null
}

const resolveFallbackCaretRangeInCell = (cell: HTMLElement, clientX: number) => {
  const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    if (node.data.length > 0) textNodes.push(node)
  }
  if (textNodes.length === 0) {
    const range = document.createRange()
    const editableBlock = cell.querySelector<HTMLElement>("p, div, span")
    range.setStart(editableBlock ?? cell, 0)
    range.collapse(true)
    return range
  }

  const cellRect = cell.getBoundingClientRect()
  const shouldPlaceAtEnd = clientX > cellRect.left + cellRect.width / 2
  const textNode = shouldPlaceAtEnd
    ? textNodes[textNodes.length - 1]
    : textNodes[0]
  const range = document.createRange()
  range.setStart(textNode, shouldPlaceAtEnd ? textNode.data.length : 0)
  range.collapse(true)
  return range
}

const isWindowSelectionInsideTable = (
  selection: Selection,
  table: Element | null
) => {
  if (!table) return false
  const anchorElement = resolveElement(selection.anchorNode)
  const focusElement = resolveElement(selection.focusNode)
  return Boolean(
    anchorElement &&
      focusElement &&
      table.contains(anchorElement) &&
      table.contains(focusElement)
  )
}

const clampEditorPos = (editor: TiptapEditor, pos: number) =>
  Math.max(0, Math.min(editor.state.doc.content.size, pos))

const isEditorDomPositionInsideCell = (
  editor: TiptapEditor,
  pos: number,
  cell: HTMLElement
) => {
  try {
    const domAtPos = editor.view.domAtPos(clampEditorPos(editor, pos))
    return Boolean(resolveElement(domAtPos.node)?.closest("th, td") === cell)
  } catch {
    return false
  }
}

const resolveFallbackEditorCaretPosInCell = (
  editor: TiptapEditor,
  cell: HTMLElement
) => {
  let domPosition = 0
  try {
    domPosition = editor.view.posAtDOM(cell, 0)
  } catch {
    return null
  }

  const safeDomPosition = clampEditorPos(editor, domPosition)
  let resolvedPosition: ResolvedPos
  try {
    resolvedPosition = editor.state.doc.resolve(safeDomPosition)
  } catch {
    return null
  }

  for (let depth = resolvedPosition.depth; depth > 0; depth -= 1) {
    const node = resolvedPosition.node(depth)
    if (node.type.name !== "tableCell" && node.type.name !== "tableHeader") {
      continue
    }

    const cellPosition = resolvedPosition.before(depth)
    const cellNode = editor.state.doc.nodeAt(cellPosition)
    return (
      getFirstEditableTextPositionInNode(cellNode, cellPosition) ??
      Math.max(1, cellPosition + 1)
    )
  }

  return null
}

const resolveEditorCaretPosInCell = (
  editor: TiptapEditor,
  cell: HTMLElement,
  clientX: number,
  clientY: number
) => {
  const pointPos = editor.view.posAtCoords({
    left: clientX,
    top: clientY,
  })?.pos
  if (
    typeof pointPos === "number" &&
    isEditorDomPositionInsideCell(editor, pointPos, cell)
  ) {
    return clampEditorPos(editor, pointPos)
  }

  return resolveFallbackEditorCaretPosInCell(editor, cell)
}

const isEditorSelectionInsideTable = (editor: TiptapEditor) => {
  const { selection } = editor.state
  if (selection.empty) return false
  const resolveDomElementAtPos = (pos: number) => {
    const safePos = Math.max(0, Math.min(editor.state.doc.content.size, pos))
    try {
      return resolveElement(editor.view.domAtPos(safePos).node)
    } catch {
      return null
    }
  }
  const fromElement = resolveDomElementAtPos(selection.from)
  const toElement = resolveDomElementAtPos(Math.max(selection.from, selection.to - 1))
  return Boolean(fromElement?.closest("th, td") || toElement?.closest("th, td"))
}

const clearTableDragSelectionMarkers = () => {
  document
    .querySelectorAll(TABLE_DRAG_SELECTION_TEXT_SELECTOR)
    .forEach((element) => element.removeAttribute(TABLE_DRAG_SELECTION_TEXT_ATTR))
  document.documentElement.removeAttribute(TABLE_DRAG_SELECTION_TEXT_ATTR)
}

export const collapseTableCellTextSelectionToPoint = (
  editor: TiptapEditor,
  clientX: number,
  clientY: number,
  target?: EventTarget | Node | null,
  options: { requireSelectionContext?: boolean } = {}
) => {
  const cell = resolveTableTextCellAtPoint(clientX, clientY, target)
  if (!(cell instanceof HTMLElement) || !editor.view.dom.contains(cell)) return false
  const selection = window.getSelection()
  if (!selection) return false

  const table = cell.closest("table")
  const hasOwnedWindowSelection = Boolean(
    selection.toString().trim() && isWindowSelectionInsideTable(selection, table)
  )
  const hasPersistedTableSelection = Boolean(
    document.documentElement.getAttribute(TABLE_DRAG_SELECTION_TEXT_ATTR)?.trim() ||
      cell.getAttribute(TABLE_DRAG_SELECTION_TEXT_ATTR)?.trim() ||
      cell.querySelector(TABLE_DRAG_SELECTION_TEXT_SELECTOR)
  )
  const requiresSelectionContext = options.requireSelectionContext ?? true
  const hasSelectionContext =
    hasOwnedWindowSelection ||
    hasPersistedTableSelection ||
    isEditorSelectionInsideTable(editor)
  if (requiresSelectionContext && !hasSelectionContext) {
    return false
  }

  let caretRange = resolveCaretRangeFromPoint(clientX, clientY)
  let caretElement = resolveElement(caretRange?.startContainer)
  if (!caretRange || !caretElement || !cell.contains(caretElement)) {
    caretRange = resolveFallbackCaretRangeInCell(cell, clientX)
    caretElement = resolveElement(caretRange.startContainer)
  }
  if (!caretRange || !caretElement || !cell.contains(caretElement)) return false

  cancelActiveTableCellTextSelectionPreserves()
  clearTableDragSelectionMarkers()
  if (editor.view.dom instanceof HTMLElement) {
    editor.view.dom.focus({ preventScroll: true })
  }

  const pointPos = resolveEditorCaretPosInCell(editor, cell, clientX, clientY)
  if (typeof pointPos === "number") {
    const safePos = clampEditorPos(editor, pointPos)
    try {
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.near(editor.state.doc.resolve(safePos))
        )
      )
    } catch {
      // The DOM caret range below is still enough to leave native text selection collapsed.
    }
  }
  selection.removeAllRanges()
  selection.addRange(caretRange)
  clearNextEditorPointerAfterTable()
  return true
}
