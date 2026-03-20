import { useInfiniteQuery } from "@tanstack/react-query"
import { getExplorePostsPage } from "src/apis/backend/posts"
import { FEED_EXPLORE_PAGE_SIZE } from "src/constants/feed"
import { queryKey } from "src/constants/queryKey"
import { TPost } from "src/types"
import { useMemo } from "react"

type Params = {
  kw: string
  tag?: string
  pageSize?: number
}

const EMPTY_POSTS: TPost[] = []

const useExplorePostsQuery = ({
  kw,
  tag,
  pageSize = FEED_EXPLORE_PAGE_SIZE,
}: Params) => {
  const normalizedKw = kw.trim()
  const normalizedTag = typeof tag === "string" ? tag.trim() || undefined : undefined

  const query = useInfiniteQuery({
    queryKey: queryKey.postsExploreInfinite({
      kw: normalizedKw,
      tag: normalizedTag,
      pageSize,
    }),
    queryFn: ({ pageParam = 1, signal }) =>
      getExplorePostsPage({
        kw: normalizedKw,
        tag: normalizedTag,
        page: pageParam,
        pageSize,
        signal: signal ?? undefined,
      }),
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
    hasNextPage: query.hasNextPage ?? false,
    isInitialLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
  }
}

export default useExplorePostsQuery
