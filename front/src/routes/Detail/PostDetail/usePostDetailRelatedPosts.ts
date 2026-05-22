import { useEffect, useMemo, useState, type RefObject } from "react"
import { useQuery } from "@tanstack/react-query"
import { getExplorePostsPage, getRelatedPostsByAuthor } from "src/apis/backend/posts"
import { queryKey } from "src/constants/queryKey"
import type { PostDetail as PostDetailType } from "src/types"

const RELATED_QUERY_PREFETCH_ROOT_MARGIN = "900px 0px"
const RELATED_QUERY_IDLE_TIMEOUT_MS = 1200
const RELATED_POSTS_LIMIT = 4

type UsePostDetailRelatedPostsArgs = {
  data?: PostDetailType
  prefetchTriggerRef: RefObject<HTMLDivElement | null>
}

export const usePostDetailRelatedPosts = ({ data, prefetchTriggerRef }: UsePostDetailRelatedPostsArgs) => {
  const [shouldFetchRelated, setShouldFetchRelated] = useState(false)
  const detailType = data?.type[0]
  const relatedTag = useMemo(
    () =>
      data?.tags
        ?.map((tag) => tag.trim())
        .find((tag) => tag && tag.toLowerCase() !== "pinned") || "",
    [data?.tags]
  )
  const authorId = useMemo(() => data?.author?.[0]?.id || "", [data?.author])

  const relatedByTagQuery = useQuery({
    queryKey: queryKey.postsExplore({
      kw: "",
      tag: relatedTag || undefined,
      order: "desc",
      page: 1,
      pageSize: 10,
    }),
    queryFn: () =>
      getExplorePostsPage({
        kw: "",
        tag: relatedTag,
        order: "desc",
        page: 1,
        pageSize: 10,
      }),
    enabled: Boolean(shouldFetchRelated && relatedTag && data?.id),
    staleTime: 300_000,
    retry: 1,
  })

  const relatedByAuthorQuery = useQuery({
    queryKey: queryKey.postsRelatedByAuthor({
      authorId: authorId || "none",
      excludePostId: data?.id ? String(data.id) : undefined,
      limit: RELATED_POSTS_LIMIT,
    }),
    queryFn: () =>
      getRelatedPostsByAuthor({
        authorId,
        excludePostId: data?.id ? String(data.id) : undefined,
        limit: RELATED_POSTS_LIMIT,
      }),
    enabled: Boolean(shouldFetchRelated && authorId && data?.id),
    staleTime: 300_000,
    retry: 1,
  })

  const relatedByTagPosts = useMemo(() => {
    const currentPostId = String(data?.id || "")
    return (relatedByTagQuery.data?.posts || [])
      .filter((post) => String(post.id) !== currentPostId)
      .slice(0, RELATED_POSTS_LIMIT)
  }, [data?.id, relatedByTagQuery.data?.posts])

  const relatedByAuthorPosts = useMemo(() => relatedByAuthorQuery.data || [], [relatedByAuthorQuery.data])
  const showRelatedTagSkeleton = Boolean(
    shouldFetchRelated && detailType === "Post" && relatedTag && relatedByTagQuery.isPending
  )
  const showRelatedAuthorSkeleton = Boolean(
    shouldFetchRelated && detailType === "Post" && authorId && relatedByAuthorQuery.isPending
  )

  useEffect(() => {
    const isPostDetail = detailType === "Post"
    if (!isPostDetail || !data?.id) {
      setShouldFetchRelated(false)
      return
    }
    setShouldFetchRelated(false)
  }, [data?.id, detailType])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!data?.id || detailType !== "Post" || shouldFetchRelated) return

    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions
      ) => number
      cancelIdleCallback?: (id: number) => void
    }

    let disposed = false
    let observer: IntersectionObserver | null = null
    let idleHandle: number | null = null
    let idleMode: "idle" | "timeout" | null = null

    const activateRelatedFetch = () => {
      if (disposed) return
      setShouldFetchRelated(true)
    }

    const triggerNode = prefetchTriggerRef.current
    if (triggerNode && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return
          observer?.disconnect()
          activateRelatedFetch()
        },
        {
          root: null,
          rootMargin: RELATED_QUERY_PREFETCH_ROOT_MARGIN,
          threshold: 0.01,
        }
      )
      observer.observe(triggerNode)
    }

    if (typeof idleWindow.requestIdleCallback === "function") {
      idleMode = "idle"
      idleHandle = idleWindow.requestIdleCallback(
        () => {
          activateRelatedFetch()
        },
        { timeout: RELATED_QUERY_IDLE_TIMEOUT_MS }
      )
    } else {
      idleMode = "timeout"
      idleHandle = window.setTimeout(() => {
        activateRelatedFetch()
      }, RELATED_QUERY_IDLE_TIMEOUT_MS)
    }

    return () => {
      disposed = true
      observer?.disconnect()
      if (idleHandle === null) return
      if (idleMode === "idle" && typeof idleWindow.cancelIdleCallback === "function") {
        idleWindow.cancelIdleCallback(idleHandle)
        return
      }
      window.clearTimeout(idleHandle)
    }
  }, [data?.id, detailType, prefetchTriggerRef, shouldFetchRelated])

  return {
    detailType,
    relatedByAuthorPosts,
    relatedByTagPosts,
    relatedTag,
    shouldFetchRelated,
    showRelatedAuthorSkeleton,
    showRelatedTagSkeleton,
  }
}
