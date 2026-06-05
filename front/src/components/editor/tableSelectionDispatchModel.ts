import type { Editor as TiptapEditor } from "@tiptap/core"
import type { EditorState, Selection } from "@tiptap/pm/state"

const STALE_SELECTION_MESSAGE = "Selection passed to setSelection must point at the current document"

export const dispatchEditorSelectionSafely = (
  editor: TiptapEditor,
  createSelection: (state: EditorState) => Selection | null | undefined
) => {
  const state = editor.state
  const selection = createSelection(state)
  if (!selection) return false
  if (selection.$from.doc !== state.doc || selection.$to.doc !== state.doc) return false

  try {
    editor.view.dispatch(state.tr.setSelection(selection))
    return true
  } catch (error) {
    if (error instanceof RangeError && error.message.includes(STALE_SELECTION_MESSAGE)) return false
    throw error
  }
}
