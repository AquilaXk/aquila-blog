import { useInfiniteQuery } from "@tanstack/react-query"
import {
  getExplorePostsCursorPage,
  getExplorePostsPage,
  getFeedPostsCursorPage,
  getFeedPostsPage,
  getSearchPostsPage,
} from "src/apis/backend/posts"
import { FEED_EXPLORE_PAGE_SIZE } from "src/constants/feed"
import { queryKey } from "src/constants/queryKey"
import { TPost } from "src/types"
import { useMemo } from "react"

type Params = {
  kw: string
  tag?: string
  pageSize?: number
  order?: "asc" | "desc"
}

const EMPTY_POSTS: TPost[] = []
const CURSOR_INITIAL_PAGE_PARAM: null = null
const OFFSET_INITIAL_PAGE_PARAM = 1
type ExplorePageParam = string | number | null

const useExplorePostsQuery = ({
  kw,
  tag,
  pageSize = FEED_EXPLORE_PAGE_SIZE,
  order = "desc",
}: Params) => {
  const normalizedKw = kw.trim()
  const normalizedTag = typeof tag === "string" ? tag.trim() || undefined : undefined
  const cursorMode = normalizedKw.length === 0
  const searchMode = normalizedKw.length > 0 && !normalizedTag
  const feedMode = cursorMode && !normalizedTag

  const query = useInfiniteQuery({
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
      const pageNumber = typeof pageParam === "number" ? pageParam : 1
      const cursor =
        typeof pageParam === "string" && pageParam.trim().length > 0
          ? pageParam
          : undefined

      if (cursorMode) {
        if (feedMode) {
          if (typeof pageParam === "number") {
            return getFeedPostsPage({
              order,
              page: pageNumber,
              pageSize,
              signal: signal ?? undefined,
            })
          }

          return getFeedPostsCursorPage({
            order,
            pageSize,
            cursor,
            signal: signal ?? undefined,
          })
        }

        if (typeof pageParam === "number") {
          return getExplorePostsPage({
            kw: "",
            tag: normalizedTag,
            order,
            page: pageNumber,
            pageSize,
            signal: signal ?? undefined,
          })
        }

        return getExplorePostsCursorPage({
          tag: normalizedTag,
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
      return getExplorePostsPage({
        kw: normalizedKw,
        tag: normalizedTag,
        order,
        page: pageNumber,
        pageSize,
        signal: signal ?? undefined,
      })
    },
    staleTime: 300_000,
    retry: 1,
    refetchOnWindowFocus: false,
    initialPageParam: cursorMode ? CURSOR_INITIAL_PAGE_PARAM : OFFSET_INITIAL_PAGE_PARAM,
    getNextPageParam: (lastPage) => {
      if (cursorMode) {
        if (lastPage.paginationMode === "page") {
          if (lastPage.posts.length === 0) return undefined
          if (lastPage.pageNumber * lastPage.pageSize >= lastPage.totalCount) return undefined
          return lastPage.pageNumber + 1
        }

        if (!lastPage.hasNext) return undefined
        const nextCursor =
          typeof lastPage.nextCursor === "string" && lastPage.nextCursor.trim()
            ? lastPage.nextCursor
            : null
        return nextCursor ?? undefined
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
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
  }
}

export default useExplorePostsQuery
