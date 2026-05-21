import type { Editor as TiptapEditor } from "@tiptap/core"
import type { EditorView } from "@tiptap/pm/view"

export const shouldSuppressStickySelectionScrollToSelection = (
  view: EditorView,
  selectedBlockNodeIndex: number | null,
  isStickyBlockSelection: boolean
) => {
  if (typeof window === "undefined") return false
  if (selectedBlockNodeIndex === null && !isStickyBlockSelection) return false
  try {
    const { from } = view.state.selection
    const coords = view.coordsAtPos(from)
    const viewportMarginPx = 24
    return (
      coords.bottom < viewportMarginPx ||
      coords.top > window.innerHeight - viewportMarginPx ||
      coords.right < 0 ||
      coords.left > window.innerWidth
    )
  } catch {
    return false
  }
}

export const refocusEditorForSelectionReveal = (editor: TiptapEditor | null | undefined) => {
  if (!editor) return
  editor.view.dom.blur()
  editor.commands.focus()
}
