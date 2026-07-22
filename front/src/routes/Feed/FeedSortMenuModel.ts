export type FeedSortMode = "latest" | "views" | "likes"

export const FEED_SORT_OPTIONS: Array<{ value: FeedSortMode; label: string }> = [
  { value: "latest", label: "최신순" },
  { value: "views", label: "조회순" },
  { value: "likes", label: "좋아요순" },
]

export const feedSortOptionId = (value: FeedSortMode) => `feed-sort-option-${value}`

export type FeedSortMenuKeyResult =
  | { type: "open"; activeIndex: number }
  | { type: "close" }
  | { type: "move"; activeIndex: number }
  | { type: "select"; value: FeedSortMode }
  | { type: "none" }

export const resolveFeedSortTriggerKeyDown = (
  key: string,
  optionCount: number
): FeedSortMenuKeyResult => {
  if (key === "ArrowDown" || key === "Enter" || key === " ") {
    return { type: "open", activeIndex: optionCount > 0 ? 0 : -1 }
  }
  if (key === "ArrowUp") {
    return { type: "open", activeIndex: optionCount > 0 ? optionCount - 1 : -1 }
  }
  return { type: "none" }
}

export const resolveFeedSortListboxKeyDown = (
  key: string,
  activeIndex: number,
  options: Array<{ value: FeedSortMode }>
): FeedSortMenuKeyResult => {
  const count = options.length
  if (count <= 0) return { type: "none" }

  if (key === "Escape") return { type: "close" }

  if (key === "ArrowDown") {
    const next = activeIndex < 0 ? 0 : Math.min(count - 1, activeIndex + 1)
    return { type: "move", activeIndex: next }
  }

  if (key === "ArrowUp") {
    const next = activeIndex < 0 ? count - 1 : Math.max(0, activeIndex - 1)
    return { type: "move", activeIndex: next }
  }

  if (key === "Home") return { type: "move", activeIndex: 0 }
  if (key === "End") return { type: "move", activeIndex: count - 1 }

  if (key === "Enter" || key === " ") {
    const safeIndex = activeIndex < 0 || activeIndex >= count ? 0 : activeIndex
    return { type: "select", value: options[safeIndex].value }
  }

  return { type: "none" }
}

export const toFeedApiSortParam = (
  sortMode: FeedSortMode = "latest",
  order: "asc" | "desc" = "desc"
) => {
  if (sortMode === "views") return "HIT_COUNT"
  if (sortMode === "likes") return "LIKES_COUNT"
  return order === "asc" ? "CREATED_AT_ASC" : "CREATED_AT"
}
