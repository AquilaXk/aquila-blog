import type { KeyboardEvent as ReactKeyboardEvent } from "react"

export const ADMIN_POSTS_ROW_ATTR = "data-admin-posts-row"
export const ADMIN_POSTS_ROW_PRIMARY_ATTR = "data-admin-posts-row-primary"

const ROW_SELECTOR = `[${ADMIN_POSTS_ROW_ATTR}]`
const PRIMARY_SELECTOR = `[${ADMIN_POSTS_ROW_PRIMARY_ATTR}]`

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
}

const isEnabledFocusable = (element: HTMLElement | null) => {
  if (!element) return false
  if (element.matches(":disabled") || element.getAttribute("aria-disabled") === "true") return false
  return true
}

export const resolveAdminPostsRowPrimary = (row: HTMLElement): HTMLElement | null => {
  return row.querySelector<HTMLElement>(PRIMARY_SELECTOR)
}

const focusRowPrimary = (row: HTMLElement): boolean => {
  const primary = resolveAdminPostsRowPrimary(row)
  if (!isEnabledFocusable(primary)) return false
  primary!.focus({ preventScroll: true })
  primary!.scrollIntoView({ block: "nearest" })
  return true
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

  if (direction === "first") {
    for (let index = 0; index < rows.length; index += 1) {
      if (focusRowPrimary(rows[index])) return true
    }
    return false
  }

  if (direction === "last") {
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      if (focusRowPrimary(rows[index])) return true
    }
    return false
  }

  if (direction === "next") {
    for (let index = currentIndex + 1; index < rows.length; index += 1) {
      if (focusRowPrimary(rows[index])) return true
    }
    return false
  }

  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    if (focusRowPrimary(rows[index])) return true
  }
  return false
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

  // Boundary no-ops still consume the key so the page does not scroll under focus.
  focusAdjacentAdminPostsRow(event.target, direction, root)
  event.preventDefault()
}
