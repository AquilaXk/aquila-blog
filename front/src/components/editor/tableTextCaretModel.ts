import type { Editor as TiptapEditor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
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

const isWindowSelectionInsideTable = (selection: Selection, table: Element | null) => {
  if (!table) return false
  const anchorElement = resolveElement(selection.anchorNode)
  const focusElement = resolveElement(selection.focusNode)
  return Boolean(anchorElement && focusElement && table.contains(anchorElement) && table.contains(focusElement))
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
  target?: EventTarget | Node | null
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
  if (!hasOwnedWindowSelection && !hasPersistedTableSelection && !isEditorSelectionInsideTable(editor)) {
    return false
  }

  const caretRange = resolveCaretRangeFromPoint(clientX, clientY)
  const caretElement = resolveElement(caretRange?.startContainer)
  if (!caretRange || !caretElement || !cell.contains(caretElement)) return false

  cancelActiveTableCellTextSelectionPreserves()
  clearTableDragSelectionMarkers()
  if (editor.view.dom instanceof HTMLElement) {
    editor.view.dom.focus({ preventScroll: true })
  }

  const pointPos = editor.view.posAtCoords({ left: clientX, top: clientY })?.pos
  if (typeof pointPos === "number") {
    const safePos = Math.max(0, Math.min(editor.state.doc.content.size, pointPos))
    try {
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(safePos))))
    } catch {
      // The DOM caret range below is still enough to leave native text selection collapsed.
    }
  }
  selection.removeAllRanges()
  selection.addRange(caretRange)
  clearNextEditorPointerAfterTable()
  return true
}
