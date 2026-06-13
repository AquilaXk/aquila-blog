import type { Editor as TiptapEditor } from "@tiptap/core"
import { CellSelection, selectedRect } from "@tiptap/pm/tables"
import type { EditorView } from "@tiptap/pm/view"

const TABLE_AXIS_SCROLL_SUPPRESS_UNTIL_ATTR =
  "data-table-axis-scroll-suppress-until"

const getScrollGuardNow = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now()

export const markTableAxisSelectionScrollToSelectionSuppressed = (
  durationMs = 1_200
) => {
  if (typeof document === "undefined") return
  document.documentElement.setAttribute(
    TABLE_AXIS_SCROLL_SUPPRESS_UNTIL_ATTR,
    String(Math.round(getScrollGuardNow() + durationMs))
  )
}

const shouldSuppressTableAxisSelectionScrollToSelection = (view: EditorView) => {
  if (typeof document === "undefined") return false
  const rawUntil = document.documentElement.getAttribute(
    TABLE_AXIS_SCROLL_SUPPRESS_UNTIL_ATTR
  )
  const suppressUntil = rawUntil ? Number(rawUntil) : 0
  if (!Number.isFinite(suppressUntil) || suppressUntil <= 0) return false
  if (getScrollGuardNow() > suppressUntil) {
    document.documentElement.removeAttribute(
      TABLE_AXIS_SCROLL_SUPPRESS_UNTIL_ATTR
    )
    return false
  }
  if (!(view.state.selection instanceof CellSelection)) return false
  try {
    const rect = selectedRect(view.state)
    return (
      (rect.left === 0 && rect.right === rect.map.width) ||
      (rect.top === 0 && rect.bottom === rect.map.height)
    )
  } catch {
    return false
  }
}

export const shouldSuppressStickySelectionScrollToSelection = (
  view: EditorView,
  selectedBlockNodeIndex: number | null,
  isStickyBlockSelection: boolean
) => {
  if (typeof window === "undefined") return false
  if (shouldSuppressTableAxisSelectionScrollToSelection(view)) return true
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
