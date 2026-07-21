import type { KeyboardEvent as ReactKeyboardEvent } from "react"

export const ADMIN_POSTS_ROW_ATTR = "data-admin-posts-row"
export const ADMIN_POSTS_ROW_PRIMARY_ATTR = "data-admin-posts-row-primary"

const ROW_SELECTOR = `[${ADMIN_POSTS_ROW_ATTR}]`
const PRIMARY_SELECTOR = `[${ADMIN_POSTS_ROW_PRIMARY_ATTR}]`

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
}

export const resolveAdminPostsRowPrimary = (row: HTMLElement): HTMLElement | null => {
  return row.querySelector<HTMLElement>(PRIMARY_SELECTOR)
}

export const focusAdjacentAdminPostsRow = (
  currentTarget: HTMLElement,
  direction: "prev" | "next" | "first" | "last",
  root: ParentNode
): boolean => {
  const rows = Array.from(root.querySelectorAll<HTMLElement>(ROW_SELECTOR))
  if (rows.length === 0) return false

  const currentRow = currentTarget.closest<HTMLElement>(ROW_SELECTOR)
  if (!currentRow) return false

  const currentIndex = rows.indexOf(currentRow)
  if (currentIndex < 0) return false

  let nextIndex = currentIndex
  if (direction === "prev") nextIndex = Math.max(0, currentIndex - 1)
  if (direction === "next") nextIndex = Math.min(rows.length - 1, currentIndex + 1)
  if (direction === "first") nextIndex = 0
  if (direction === "last") nextIndex = rows.length - 1

  if (nextIndex === currentIndex && direction !== "first" && direction !== "last") {
    return false
  }

  const primary = resolveAdminPostsRowPrimary(rows[nextIndex])
  if (!primary || primary.matches(":disabled") || primary.getAttribute("aria-disabled") === "true") {
    return false
  }

  primary.focus({ preventScroll: false })
  primary.scrollIntoView({ block: "nearest" })
  return true
}

export const handleAdminPostsListKeyDown = (
  event: ReactKeyboardEvent<HTMLElement>,
  root: ParentNode | null
) => {
  if (!root || isEditableTarget(event.target)) return
  if (!(event.target instanceof HTMLElement)) return
  if (!event.target.closest(ROW_SELECTOR)) return

  const key = event.key
  if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Home" && key !== "End") return

  const direction =
    key === "ArrowDown" ? "next" : key === "ArrowUp" ? "prev" : key === "Home" ? "first" : "last"

  const moved = focusAdjacentAdminPostsRow(event.target, direction, root)
  if (moved) {
    event.preventDefault()
  }
}
