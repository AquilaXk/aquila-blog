import type { Editor as TiptapEditor } from "@tiptap/core"

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
  const cell =
    anchorElement?.closest("th, td") ??
    activeElement?.closest("th, td") ??
    targetElement?.closest("th, td")

  if (!(cell instanceof HTMLElement)) return false
  if (!editor.view.dom.contains(cell)) return false

  const range = document.createRange()
  range.selectNodeContents(cell)
  selection.removeAllRanges()
  selection.addRange(range)
  return true
}
