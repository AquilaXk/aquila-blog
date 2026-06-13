import {
  TABLE_DRAG_SELECTION_TEXT_ATTR,
  TABLE_DRAG_SELECTION_TEXT_SELECTOR,
} from "./tableTextSelectionModel"

const RECENT_TABLE_TEXT_SELECTION_CONTEXT_ATTR =
  "data-table-recent-text-selection-context"

export const hasRecentTableTextSelectionContextForStructuralSelection = () => {
  if (typeof document === "undefined") return false
  return (
    document.documentElement.hasAttribute(
      RECENT_TABLE_TEXT_SELECTION_CONTEXT_ATTR
    ) ||
    Boolean(
      document.documentElement.getAttribute(TABLE_DRAG_SELECTION_TEXT_ATTR)?.trim()
    ) ||
    Boolean(document.querySelector(TABLE_DRAG_SELECTION_TEXT_SELECTOR))
  )
}
