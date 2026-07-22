import type { FeedSortMode } from "../routes/Feed/FeedSortMenuModel"

export const EXPLORE_POSTS_LATEST_STALE_TIME_MS = 300_000
export const EXPLORE_POSTS_RANKED_STALE_TIME_MS = 30_000

/** Ranked sorts change with likes/hits; keep freshness tighter than latest CREATED_AT feed. */
export const resolveExplorePostsQueryFreshness = (sortMode: FeedSortMode) => {
  const isRankedSort = sortMode === "views" || sortMode === "likes"
  return {
    staleTime: isRankedSort ? EXPLORE_POSTS_RANKED_STALE_TIME_MS : EXPLORE_POSTS_LATEST_STALE_TIME_MS,
    refetchOnMount: isRankedSort,
    refetchOnWindowFocus: isRankedSort,
  }
}
