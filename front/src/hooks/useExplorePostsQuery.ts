import { useInfiniteQuery } from "@tanstack/react-query"
import { isNonEmptyString, toSafeInt } from "@shared/utils"
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
const DAY_MS = 24 * 60 * 60 * 1000

const tokenizeSearchKeyword = (value: string) =>
  value
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)

const toSafeTimestamp = (value?: string) => {
  if (!value) return 0
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}

const toSearchRelevanceScore = (post: TPost, tokens: string[]) => {
  if (!tokens.length) return 0

  const title = post.title.toLowerCase()
  const summary = (post.summary || "").toLowerCase()
  const tags = (post.tags || []).map((tag) => tag.toLowerCase())

  const lexicalScore = tokens.reduce((score, token) => {
    let nextScore = score
    if (title.includes(token)) nextScore += 4
    if (summary.includes(token)) nextScore += 2
    if (tags.some((tag) => tag.includes(token))) nextScore += 3.5
    return nextScore
  }, 0)

  const popularitySignal =
    (post.likesCount ?? 0) * 3 +
    (post.commentsCount ?? 0) * 4 +
    Math.max(0, Math.trunc((post.hitCount ?? 0) / 50))
  const popularityScore = Math.log10(1 + popularitySignal)

  const createdAt = toSafeTimestamp(post.createdTime || post.date?.start_date)
  const ageDays = createdAt > 0 ? Math.max(0, (Date.now() - createdAt) / DAY_MS) : 365
  const recencyScore = Math.max(0, 2.2 - ageDays / 30)

  return lexicalScore + popularityScore + recencyScore
}

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
      const pageNumber = toSafeInt(pageParam, 1)
      const cursor = isNonEmptyString(pageParam) ? pageParam : undefined

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

    if (searchMode) {
      const tokens = tokenizeSearchKeyword(normalizedKw)
      if (tokens.length) {
        regular.sort((left, right) => {
          const scoreDiff = toSearchRelevanceScore(right, tokens) - toSearchRelevanceScore(left, tokens)
          if (Math.abs(scoreDiff) > 0.0001) return scoreDiff

          const leftCreatedAt = toSafeTimestamp(left.createdTime || left.date?.start_date)
          const rightCreatedAt = toSafeTimestamp(right.createdTime || right.date?.start_date)
          if (leftCreatedAt !== rightCreatedAt) return rightCreatedAt - leftCreatedAt
          const leftId = Number(left.id)
          const rightId = Number(right.id)
          if (Number.isFinite(leftId) && Number.isFinite(rightId)) {
            return rightId - leftId
          }
          return String(right.id).localeCompare(String(left.id))
        })
      }
    }

    return {
      pinnedPosts: pinned,
      regularPosts: regular,
    }
  }, [normalizedKw, query.data, searchMode])

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
