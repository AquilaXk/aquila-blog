import type { Editor as TiptapEditor } from "@tiptap/core"
import { preserveWindowScrollForRichBlockSelectAll } from "./blockHandleLayoutModel"

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
