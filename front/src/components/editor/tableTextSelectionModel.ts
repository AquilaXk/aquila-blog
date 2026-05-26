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

const normalizeCellText = (cell: Element | null | undefined) =>
  cell?.textContent?.replace(/\s+/g, " ").trim() ?? ""

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

let lastActiveTableCell: HTMLElement | null = null
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
  cancelActiveTableCellScrollPreserves()
}

const isWindowSelectionInsideEditorTable = (editorRoot: HTMLElement) => {
  const selection = window.getSelection()
  if (!selection?.toString().trim()) return false
  const anchorElement = resolveElement(selection.anchorNode)
  const focusElement = resolveElement(selection.focusNode)
  const anchorCell = anchorElement?.closest("th, td")
  const focusCell = focusElement?.closest("th, td")
  return Boolean(
    anchorCell &&
      focusCell &&
      anchorCell === focusCell &&
      editorRoot.contains(anchorCell)
  )
}

const hasTableTextSelectionState = (editorRoot: HTMLElement) =>
  Boolean(editorRoot.querySelector(TABLE_DRAG_SELECTION_TEXT_SELECTOR)) ||
  isWindowSelectionInsideEditorTable(editorRoot)

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
  const anchorElement = resolveElement(selection.anchorNode)
  const focusElement = resolveElement(selection.focusNode)
  return Boolean(
    anchorElement &&
      focusElement &&
      currentCell.contains(anchorElement) &&
      currentCell.contains(focusElement)
  )
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
  const targetElement = resolveElement(eventTarget)
  const cell = targetElement?.closest("th, td")
  if (cell instanceof HTMLElement && (!editorRoot || editorRoot.contains(cell))) {
    lastActiveTableCell = cell
    return
  }
  if (editorRoot && targetElement && editorRoot.contains(targetElement)) {
    lastActiveTableCell = null
  }
}

export const selectActiveTableCellText = (
  editor: TiptapEditor,
  eventTarget: EventTarget | null
) => {
  if (typeof window === "undefined" || typeof document === "undefined") return false
  const selection = window.getSelection()
  if (!selection) return false

  const activeElement = resolveElement(document.activeElement)
  const anchorElement = resolveElement(selection.anchorNode)
  const targetElement = resolveElement(eventTarget)
  const rememberedCell = lastActiveTableCell?.isConnected ? lastActiveTableCell : null
  const cell =
    targetElement?.closest("th, td") ??
    activeElement?.closest("th, td") ??
    rememberedCell ??
    anchorElement?.closest("th, td")

  if (!(cell instanceof HTMLElement)) return false
  if (!editor.view.dom.contains(cell)) return false

  const range = document.createRange()
  range.selectNodeContents(cell)
  preserveWindowScrollForRichBlockSelectAll()
  selection.removeAllRanges()
  selection.addRange(range)
  return true
}

export const restoreTableCellTextSelectionIfEscaped = (
  editor: TiptapEditor,
  startedCell: HTMLElement | null,
  scrollAnchor?: WindowScrollAnchor | null,
  restoreWhenEmpty = false,
  forceStartedCellSelection = false,
  preserveFallbackScroll = true
) => {
  if (typeof window === "undefined" || typeof document === "undefined") return false
  if (!startedCell) return false
  const currentCell = resolveConnectedTableCell(editor, startedCell)
  if (!currentCell) return false

  const selection = window.getSelection()
  if (!selection) return false

  const anchorElement = resolveElement(selection.anchorNode)
  const focusElement = resolveElement(selection.focusNode)
  const hasTextSelection = selection.toString().trim().length > 0
  if (
    hasTextSelection &&
    ((anchorElement && currentCell.contains(anchorElement)) ||
      (focusElement && currentCell.contains(focusElement)))
  ) {
    currentCell.setAttribute("data-table-drag-selection-text", selection.toString())
    clearNextEditorPointerAfterTable()
    if (!forceStartedCellSelection) {
      return true
    }
  }
  if (!hasTextSelection && !restoreWhenEmpty) return false

  const range = document.createRange()
  range.selectNodeContents(currentCell)
  selection.removeAllRanges()
  selection.addRange(range)
  currentCell.setAttribute(
    "data-table-drag-selection-text",
    selection.toString() || normalizeCellText(currentCell)
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
  _scrollAnchor: WindowScrollAnchor
) => {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now()
  let frame = 0
  let cancelled = false
  let restoring = false
  const cleanup = () => {
    activeTableCellSelectionPreserveCancels.delete(cancel)
    window.removeEventListener("pointerdown", cancel, true)
    window.removeEventListener("mousedown", cancel, true)
    window.removeEventListener("pointerup", cancel, true)
    window.removeEventListener("pointercancel", cancel, true)
    window.removeEventListener("mouseup", cancel, true)
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
    const anchorElement = resolveElement(selection.anchorNode)
    const focusElement = resolveElement(selection.focusNode)
    if (!anchorElement || !focusElement || !currentCell.contains(anchorElement) || !currentCell.contains(focusElement)) {
      cancel()
    }
  }
  window.addEventListener("pointerdown", cancel, { capture: true, once: true })
  window.addEventListener("mousedown", cancel, { capture: true, once: true })
  window.addEventListener("pointerup", cancel, { capture: true, once: true })
  window.addEventListener("pointercancel", cancel, { capture: true, once: true })
  window.addEventListener("mouseup", cancel, { capture: true, once: true })
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
    const restored = restoreTableCellTextSelectionIfEscaped(editor, startedCell, null, true, true, false)
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
