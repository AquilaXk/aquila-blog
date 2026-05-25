import type { Editor as TiptapEditor } from "@tiptap/core"
import {
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

let lastActiveTableCell: HTMLElement | null = null
const TABLE_TEXT_DRAG_SCROLL_PRESERVE_FRAMES = 168
const TABLE_TEXT_DRAG_SCROLL_PRESERVE_MIN_MS = 2_800

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
  forceStartedCellSelection = false
) => {
  if (typeof window === "undefined" || typeof document === "undefined") return false
  if (!startedCell?.isConnected || !editor.view.dom.contains(startedCell)) return false

  const selection = window.getSelection()
  if (!selection) return false

  const anchorElement = resolveElement(selection.anchorNode)
  const focusElement = resolveElement(selection.focusNode)
  const hasTextSelection = selection.toString().trim().length > 0
  if (
    hasTextSelection &&
    ((anchorElement && startedCell.contains(anchorElement)) ||
      (focusElement && startedCell.contains(focusElement)))
  ) {
    startedCell.setAttribute("data-table-drag-selection-text", selection.toString())
    if (!forceStartedCellSelection) {
      return true
    }
  }
  if (!hasTextSelection && !restoreWhenEmpty) return false

  const range = document.createRange()
  range.selectNodeContents(startedCell)
  selection.removeAllRanges()
  selection.addRange(range)
  startedCell.setAttribute("data-table-drag-selection-text", selection.toString())
  if (scrollAnchor) {
    preserveWindowScrollPositionAcrossFrames(
      scrollAnchor,
      TABLE_TEXT_DRAG_SCROLL_PRESERVE_FRAMES,
      4,
      TABLE_TEXT_DRAG_SCROLL_PRESERVE_MIN_MS,
      false,
      false
    )
  } else {
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
  const cleanup = () => {
    window.removeEventListener("pointerdown", cancel, true)
    window.removeEventListener("mousedown", cancel, true)
    window.removeEventListener("wheel", cancel, true)
    window.removeEventListener("keydown", cancel, true)
  }
  const cancel = () => {
    cancelled = true
    cleanup()
  }
  window.addEventListener("pointerdown", cancel, { capture: true, once: true })
  window.addEventListener("mousedown", cancel, { capture: true, once: true })
  window.addEventListener("wheel", cancel, { capture: true, passive: true, once: true })
  window.addEventListener("keydown", cancel, { capture: true, once: true })
  const restore = () => {
    if (cancelled) return
    restoreTableCellTextSelectionIfEscaped(editor, startedCell, null, true, true)
    frame += 1
    const elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt
    if (startedCell.isConnected && (frame < TABLE_TEXT_DRAG_SCROLL_PRESERVE_FRAMES || elapsedMs < TABLE_TEXT_DRAG_SCROLL_PRESERVE_MIN_MS)) {
      window.requestAnimationFrame(restore)
    } else {
      cleanup()
    }
  }
  restore()
}
