import { useInfiniteQuery } from "@tanstack/react-query"
import { getExplorePostsPage, getFeedPostsPage, getSearchPostsPage } from "src/apis/backend/posts"
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

const useExplorePostsQuery = ({
  kw,
  tag,
  pageSize = FEED_EXPLORE_PAGE_SIZE,
  order = "desc",
}: Params) => {
  const normalizedKw = kw.trim()
  const normalizedTag = typeof tag === "string" ? tag.trim() || undefined : undefined
  const searchMode = normalizedKw.length > 0 && !normalizedTag
  const feedMode = normalizedKw.length === 0 && !normalizedTag

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
    queryFn: ({ pageParam = 1, signal }) => {
      if (feedMode) {
        return getFeedPostsPage({
          order,
          page: pageParam,
          pageSize,
          signal: signal ?? undefined,
        })
      }
      if (searchMode) {
        return getSearchPostsPage({
          kw: normalizedKw,
          order,
          page: pageParam,
          pageSize,
          signal: signal ?? undefined,
        })
      }
      return getExplorePostsPage({
        kw: normalizedKw,
        tag: normalizedTag,
        order,
        page: pageParam,
        pageSize,
        signal: signal ?? undefined,
      })
    },
    staleTime: 300_000,
    retry: 1,
    refetchOnWindowFocus: false,
    getNextPageParam: (lastPage) => {
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

    for (const page of pages) {
      for (const post of page.posts) {
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
