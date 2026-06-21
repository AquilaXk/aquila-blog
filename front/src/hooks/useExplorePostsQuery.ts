import { useInfiniteQuery } from "@tanstack/react-query"
import { toSafeInt } from "@shared/utils"
import {
  getExplorePostsCursorPage,
  getExplorePostsPage,
  getFeedPostsCursorPage,
  getFeedPostsPage,
  getSearchPostsPage,
} from "src/apis/backend/posts"
import { FEED_EXPLORE_PAGE_SIZE } from "src/constants/feed"
import { queryKey } from "src/constants/queryKey"
import { normalizeKeywordQuery, normalizeOptionalTagQuery } from "src/libs/query/normalize"
import { TPost } from "src/types"
import { useMemo } from "react"

type Params = {
  kw: string
  tag?: string
  pageSize?: number
  order?: "asc" | "desc"
  enabled?: boolean
}

const EMPTY_POSTS: TPost[] = []
const OFFSET_INITIAL_PAGE_PARAM = 1
type ExplorePageParam = number | string | null

const useExplorePostsQuery = ({
  kw,
  tag,
  pageSize = FEED_EXPLORE_PAGE_SIZE,
  order = "desc",
  enabled = true,
}: Params) => {
  const normalizedKw = normalizeKeywordQuery(kw)
  const normalizedTag = normalizeOptionalTagQuery(tag)
  const searchMode = normalizedKw.length > 0 && !normalizedTag
  const feedMode = normalizedKw.length === 0 && !normalizedTag

  const query = useInfiniteQuery({
    enabled,
    queryKey: feedMode
      ? queryKey.postsFeedInfinite({
          pageSize,
          order,
        })
      : searchMode
        ? queryKey.postsSearchInfinite({
            kw: normalizedKw,
            pageSize,
            order,
          })
        : queryKey.postsExploreInfinite({
            kw: normalizedKw,
            tag: normalizedTag,
            pageSize,
            order,
          }),
    queryFn: ({ pageParam, signal }: { pageParam: ExplorePageParam; signal?: AbortSignal }) => {
      const pageNumber = toSafeInt(pageParam, 1)

      if (feedMode) {
        if (typeof pageParam === "number") {
          return getFeedPostsPage({
            order,
            page: pageNumber,
            pageSize,
            signal: signal ?? undefined,
          })
        }
        const cursor = typeof pageParam === "string" ? pageParam : undefined
        return getFeedPostsCursorPage({
          order,
          pageSize,
          cursor,
          signal: signal ?? undefined,
        })
      }

      if (searchMode) {
        return getSearchPostsPage({
          kw: normalizedKw,
          order,
          page: pageNumber,
          pageSize,
          signal: signal ?? undefined,
        })
      }
      if (normalizedKw.length > 0 || typeof pageParam === "number") {
        return getExplorePostsPage({
          kw: normalizedKw,
          tag: normalizedTag,
          order,
          page: pageNumber,
          pageSize,
          signal: signal ?? undefined,
        })
      }
      const cursor = typeof pageParam === "string" ? pageParam : undefined
      return getExplorePostsCursorPage({
        tag: normalizedTag,
        order,
        pageSize,
        cursor,
        signal: signal ?? undefined,
      })
    },
    staleTime: 300_000,
    retry: 1,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    initialPageParam: normalizedKw.length > 0 ? OFFSET_INITIAL_PAGE_PARAM : null,
    getNextPageParam: (lastPage) => {
      if (lastPage.paginationMode === "cursor") {
        if (lastPage.hasNext !== true) return undefined
        return typeof lastPage.nextCursor === "string" && lastPage.nextCursor.trim()
          ? lastPage.nextCursor.trim()
          : undefined
      }
      if (lastPage.posts.length === 0) return undefined
      if (lastPage.pageNumber * lastPage.pageSize >= lastPage.totalCount) return undefined
      return lastPage.pageNumber + 1
    },
  })

  const { pinnedPosts, regularPosts } = useMemo(() => {
    const pages = query.data?.pages
    if (!pages || pages.length === 0) {
      return {
        pinnedPosts: EMPTY_POSTS,
        regularPosts: EMPTY_POSTS,
      }
    }

    const pinned: TPost[] = []
    const regular: TPost[] = []
    const seenPostIds = new Set<string>()

    for (const page of pages) {
      for (const post of page.posts) {
        const postId = String(post.id)
        if (seenPostIds.has(postId)) continue
        seenPostIds.add(postId)

        if (post.tags?.includes("Pinned")) {
          pinned.push(post)
          continue
        }
        regular.push(post)
      }
    }

    return {
      pinnedPosts: pinned,
      regularPosts: regular,
    }
  }, [query.data])

  return {
    pinnedPosts,
    regularPosts,
    loadedPagesCount: query.data?.pages.length ?? 0,
    hasNextPage: query.hasNextPage ?? false,
    isInitialLoading: query.isLoading,
    isInitialLoadError: query.isError && !(query.data?.pages.length),
    hasInitialLoadSucceeded: query.isSuccess,
    isFetchingNextPage: query.isFetchingNextPage,
    isFetchNextPageError: query.isFetchNextPageError,
    fetchNextPage: query.fetchNextPage,
    refetchInitialPage: query.refetch,
  }
}

export default useExplorePostsQuery
