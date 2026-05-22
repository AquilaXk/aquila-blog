import React, { useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/router"
import dynamic from "next/dynamic"
import PostHeader from "./PostHeader"
import Footer from "./PostFooter"
import usePostQuery from "src/hooks/usePostQuery"
import useAuthSession from "src/hooks/useAuthSession"
import { ApiError, apiFetch } from "src/apis/backend/client"
import { getExplorePostsPage, getRelatedPostsByAuthor } from "src/apis/backend/posts"
import { queryKey } from "src/constants/queryKey"
import { pushRoute, replaceRoute, toLoginPath } from "src/libs/router"
import { readHeaderAuthShellSnapshot } from "src/libs/headerAuthShell"
import { toCanonicalPostPath } from "src/libs/utils/postPath"
import { PostDetail as PostDetailType, TPostComment } from "src/types"
import DeferredCommentBox from "./DeferredCommentBox"
import { extractLeadingSummaryBlock } from "src/libs/postSummary"
import { BodySection, StyledWrapper } from "./PostDetail.styles"
import { RelatedPostsSection } from "./PostDetailRelatedSection"
import { collectTocFromArticle, createObserverRegistry, createRafScheduler, isSameToc, type TocItem } from "./PostDetailTocModel"
import { LEFT_RAIL_HYBRID_MIN_VIEWPORT_PX, RIGHT_RAIL_HYBRID_MIN_VIEWPORT_PX, applyHybridRail, clearInlineRailStyle, measureHybridRail, resolveRailTopOffset } from "./PostDetailRailModel"
import { CompactToc, FloatingActionRail, MobileSummaryActions, RightTocRail } from "./PostDetailActionSections"

type Props = {
  initialComments?: TPostComment[] | null
}

type RsData<T> = {
  resultCode: string
  msg: string
  data: T
}


const MarkdownRenderer = dynamic(() => import("../components/MarkdownRenderer"))

const RELATED_QUERY_PREFETCH_ROOT_MARGIN = "900px 0px"
const RELATED_QUERY_IDLE_TIMEOUT_MS = 1200
const RELATED_POSTS_LIMIT = 4

const PostDetail: React.FC<Props> = ({ initialComments = null }) => {
  const { post: data } = usePostQuery()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { me, authStatus } = useAuthSession()
  const postId = data?.id ?? ""
  const detailId = data?.id
  const didIncrementHitRef = useRef<string | null>(null)
  const likePendingRef = useRef(false)
  const shareFeedbackResetTimerRef = useRef<number | null>(null)
  const articleRef = useRef<HTMLElement | null>(null)
  const compactTocSectionRef = useRef<HTMLElement | null>(null)
  const commentsSectionRef = useRef<HTMLElement | null>(null)
  const relatedPrefetchTriggerRef = useRef<HTMLDivElement | null>(null)
  const leftRailRef = useRef<HTMLElement | null>(null)
  const leftRailInnerRef = useRef<HTMLDivElement | null>(null)
  const rightRailRef = useRef<HTMLElement | null>(null)
  const rightRailInnerRef = useRef<HTMLElement | null>(null)
  const rightTocListRef = useRef<HTMLOListElement | null>(null)
  const [likePending, setLikePending] = useState(false)
  const [adminActionPending, setAdminActionPending] = useState(false)
  const [tocItems, setTocItems] = useState<TocItem[]>([])
  const [activeTocId, setActiveTocId] = useState<string>("")
  const [commentsRailActive, setCommentsRailActive] = useState(false)
  const [showDetailedToc, setShowDetailedToc] = useState(false)
  const [shouldFetchRelated, setShouldFetchRelated] = useState(false)
  const [shareFeedback, setShareFeedback] = useState<"copied" | "shared" | "failed" | null>(null)
  const [leftHybridRailActive, setLeftHybridRailActive] = useState(false)
  const [rightHybridRailActive, setRightHybridRailActive] = useState(false)
  const [engagement, setEngagement] = useState(() => ({
    likesCount: data?.likesCount ?? 0,
    hitCount: data?.hitCount ?? 0,
    actorHasLiked: data?.actorHasLiked ?? false,
  }))
  const visibleTocItemsRef = useRef<TocItem[]>([])
  const showFloatingLikeRef = useRef(false)
  const showStickyTocRef = useRef(false)
  const commentsRailActiveRef = useRef(false)
  const leftHybridRailActiveRef = useRef(false)
  const rightHybridRailActiveRef = useRef(false)
  const hybridRailMetricsRef = useRef({
    left: {
      enabled: false,
      left: 0,
      width: 0,
      railTopDoc: 0,
      articleBottomDoc: 0,
      innerHeight: 0,
      stickyBlocked: false,
    },
    right: {
      enabled: false,
      left: 0,
      width: 0,
      railTopDoc: 0,
      articleBottomDoc: 0,
      innerHeight: 0,
      stickyBlocked: false,
    },
  })

  const loginHref = useMemo(() => {
    const next = router.asPath || toCanonicalPostPath(postId)
    return toLoginPath(next, toCanonicalPostPath(postId))
  }, [postId, router.asPath])
  const [authShellSnapshot] = useState(() => readHeaderAuthShellSnapshot())
  const shellAdmin = authStatus === "loading" ? authShellSnapshot?.admin === true : Boolean(me?.isAdmin)
  const canModifyPost = Boolean(shellAdmin || data?.actorCanModify)
  const canDeletePost = Boolean(shellAdmin || data?.actorCanDelete)
  const showFloatingLike = data?.type[0] === "Post"
  const hasDepth4Toc = useMemo(() => tocItems.some((item) => item.level === 4), [tocItems])
  const visibleTocItems = useMemo(
    () => (showDetailedToc ? tocItems : tocItems.filter((item) => item.level <= 3)),
    [showDetailedToc, tocItems]
  )
  const showStickyToc = visibleTocItems.length >= 2
  const commentsCount = typeof data?.commentsCount === "number" ? data.commentsCount : 0
  const commentsProgressLabel = commentsRailActive ? "읽는 중" : `${commentsCount}`
  const shareProgressLabel =
    shareFeedback === "failed"
      ? "재시도"
      : shareFeedback === "shared"
        ? "복사 완료"
        : shareFeedback === "copied"
          ? "복사 완료"
          : null
  const extractedSummaryState = useMemo(() => extractLeadingSummaryBlock(data?.content || "", 180), [data?.content])
  const renderedContent = useMemo(() => {
    if (!data?.content) return ""
    return extractedSummaryState.summary ? extractedSummaryState.contentWithoutSummary : data.content
  }, [data?.content, extractedSummaryState.contentWithoutSummary, extractedSummaryState.summary])
  const relatedTag = useMemo(
    () =>
      data?.tags
        ?.map((tag) => tag.trim())
        .find((tag) => tag && tag.toLowerCase() !== "pinned") || "",
    [data?.tags]
  )
  const authorId = useMemo(() => data?.author?.[0]?.id || "", [data?.author])
  const detailType = data?.type[0]

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
    shouldFetchRelated && data?.type[0] === "Post" && relatedTag && relatedByTagQuery.isPending
  )
  const showRelatedAuthorSkeleton = Boolean(
    shouldFetchRelated && data?.type[0] === "Post" && authorId && relatedByAuthorQuery.isPending
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
    if (typeof window === "undefined") {
      if (detailType === "Post" && data?.id) {
        setShouldFetchRelated(true)
      }
      return
    }
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

    const triggerNode = relatedPrefetchTriggerRef.current
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
  }, [data?.id, detailType, shouldFetchRelated])

  useEffect(() => {
    visibleTocItemsRef.current = visibleTocItems
  }, [visibleTocItems])

  useEffect(() => {
    showFloatingLikeRef.current = showFloatingLike
  }, [showFloatingLike])

  useEffect(() => {
    showStickyTocRef.current = showStickyToc
  }, [showStickyToc])

  useEffect(() => {
    if (!activeTocId || !showStickyToc || typeof window === "undefined") return

    const frame = window.requestAnimationFrame(() => {
      const listNode = rightTocListRef.current
      if (!listNode) return

      const activeButton = listNode.querySelector<HTMLElement>('button[data-active="true"]')
      if (!activeButton) return

      const listRect = listNode.getBoundingClientRect()
      const activeRect = activeButton.getBoundingClientRect()
      const revealPadding = 12
      const overflowTop = listRect.top + revealPadding - activeRect.top

      if (overflowTop > 0) {
        listNode.scrollTop = Math.max(0, listNode.scrollTop - overflowTop)
        return
      }

      const overflowBottom = activeRect.bottom - (listRect.bottom - revealPadding)
      if (overflowBottom > 0) {
        listNode.scrollTop += overflowBottom
      }
    })

    return () => window.cancelAnimationFrame(frame)
  }, [activeTocId, showDetailedToc, showStickyToc, visibleTocItems.length])

  useEffect(() => {
    commentsRailActiveRef.current = commentsRailActive
  }, [commentsRailActive])

  useEffect(() => {
    leftHybridRailActiveRef.current = leftHybridRailActive
  }, [leftHybridRailActive])

  useEffect(() => {
    rightHybridRailActiveRef.current = rightHybridRailActive
  }, [rightHybridRailActive])

  useEffect(() => {
    if (!data) return
    setEngagement({
      likesCount: data.likesCount ?? 0,
      hitCount: data.hitCount ?? 0,
      actorHasLiked: data.actorHasLiked ?? false,
    })
  }, [data, data?.actorHasLiked, data?.hitCount, data?.id, data?.likesCount])

  useEffect(() => {
    const article = articleRef.current
    if (!article) {
      setTocItems([])
      setActiveTocId("")
      return
    }

    let rafId: number | null = null

    const syncToc = () => {
      const collected = collectTocFromArticle(article)
      setTocItems((prev) => (isSameToc(prev, collected) ? prev : collected))
      setActiveTocId((prev) => (collected.some((item) => item.id === prev) ? prev : collected[0]?.id ?? ""))
    }

    const scheduleSync = () => {
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        syncToc()
      })
    }

    setShowDetailedToc(false)
    syncToc()

    let observer: MutationObserver | null = null
    if (typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(() => {
        scheduleSync()
      })
      observer.observe(article, { childList: true, subtree: true, characterData: true })
    }

    return () => {
      observer?.disconnect()
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
    }
  }, [data?.id, renderedContent])

  useEffect(() => {
    if (typeof window === "undefined") return
    const article = articleRef.current
    if (!article) return
    const leftRailInnerNode = leftRailInnerRef.current
    const rightRailInnerNode = rightRailInnerRef.current

    const syncHybridRails = ({ remeasure = false }: { remeasure?: boolean } = {}) => {
      const viewportWidth = window.innerWidth
      const leftEnabled = showFloatingLikeRef.current && viewportWidth >= LEFT_RAIL_HYBRID_MIN_VIEWPORT_PX
      const rightEnabled = showStickyTocRef.current && viewportWidth >= RIGHT_RAIL_HYBRID_MIN_VIEWPORT_PX
      if (remeasure) {
        const articleBottomDoc = window.scrollY + article.getBoundingClientRect().bottom
        hybridRailMetricsRef.current.left = measureHybridRail(
          leftRailRef.current,
          leftRailInnerRef.current,
          leftEnabled,
          articleBottomDoc
        )
        hybridRailMetricsRef.current.right = measureHybridRail(
          rightRailRef.current,
          rightRailInnerRef.current,
          rightEnabled,
          articleBottomDoc
        )
      }

      const leftNeedsHybridFallback = leftEnabled && hybridRailMetricsRef.current.left.stickyBlocked
      const rightNeedsHybridFallback = rightEnabled && hybridRailMetricsRef.current.right.stickyBlocked

      if (leftHybridRailActiveRef.current !== leftNeedsHybridFallback) {
        leftHybridRailActiveRef.current = leftNeedsHybridFallback
        setLeftHybridRailActive(leftNeedsHybridFallback)
      }
      if (rightHybridRailActiveRef.current !== rightNeedsHybridFallback) {
        rightHybridRailActiveRef.current = rightNeedsHybridFallback
        setRightHybridRailActive(rightNeedsHybridFallback)
      }

      hybridRailMetricsRef.current.left.enabled = leftEnabled
      hybridRailMetricsRef.current.right.enabled = rightEnabled
      applyHybridRail(leftRailInnerRef.current, hybridRailMetricsRef.current.left)
      applyHybridRail(rightRailInnerRef.current, hybridRailMetricsRef.current.right)
    }

    const resolveActiveByScrollPosition = () => {
      const items = visibleTocItemsRef.current
      if (!items.length) return ""

      const anchorTop = resolveRailTopOffset() + 12
      const activeBoundary = anchorTop + 4
      const candidates = items
        .map((item) => {
          const heading = document.getElementById(item.id)
          if (!heading) return null
          return {
            id: item.id,
            top: heading.getBoundingClientRect().top,
          }
        })
        .filter((candidate): candidate is { id: string; top: number } => Boolean(candidate))

      if (!candidates.length) return items[0]?.id || ""

      let activeId = candidates[0].id
      for (const candidate of candidates) {
        if (candidate.top > activeBoundary) break
        activeId = candidate.id
      }

      return activeId
    }

    const scheduler = createRafScheduler(() => {
      const nextActiveId = resolveActiveByScrollPosition()
      setActiveTocId((prev) => (prev === nextActiveId ? prev : nextActiveId))
    })
    const railScheduler = createRafScheduler(() => {
      if (!leftHybridRailActiveRef.current && !rightHybridRailActiveRef.current) return
      syncHybridRails()
    })
    const registry = createObserverRegistry()

    const commentsNode = commentsSectionRef.current
    if (commentsNode) {
      registry.addIntersectionObserver(
        [commentsNode],
        (entries) => {
          const [entry] = entries
          if (!entry) return
          const nextCommentsActive = entry.isIntersecting && entry.intersectionRatio > 0.22
          if (commentsRailActiveRef.current !== nextCommentsActive) {
            commentsRailActiveRef.current = nextCommentsActive
            setCommentsRailActive(nextCommentsActive)
          }
          scheduler.schedule()
        },
        {
          root: null,
          rootMargin: "-24% 0px -48% 0px",
          threshold: [0, 0.22, 0.5],
        }
      )
    }

    registry.addWindowEvent(
      "scroll",
      () => {
        scheduler.schedule()
        if (!leftHybridRailActiveRef.current && !rightHybridRailActiveRef.current) return
        railScheduler.schedule()
      },
      { passive: true }
    )
    registry.addWindowEvent("resize", () => {
      syncHybridRails({ remeasure: true })
      scheduler.schedule()
    }, { passive: true })
    registry.addWindowEvent("orientationchange", () => {
      syncHybridRails({ remeasure: true })
      scheduler.schedule()
    })

    const resizeTargets = [article].filter(
      (target): target is HTMLElement => Boolean(target)
    )
    registry.addResizeObserver(resizeTargets, () => {
      syncHybridRails({ remeasure: true })
      scheduler.schedule()
    })

    const fontSet = document.fonts
    if (fontSet) {
      void fontSet.ready.then(() => {
        syncHybridRails({ remeasure: true })
        scheduler.schedule()
      }).catch(() => {})
    }

    syncHybridRails({ remeasure: true })
    scheduler.schedule()
    railScheduler.schedule()

    return () => {
      registry.cleanup()
      scheduler.cancel()
      railScheduler.cancel()
      clearInlineRailStyle(leftRailInnerNode)
      clearInlineRailStyle(rightRailInnerNode)
      if (leftHybridRailActiveRef.current) {
        leftHybridRailActiveRef.current = false
        setLeftHybridRailActive(false)
      }
      if (rightHybridRailActiveRef.current) {
        rightHybridRailActiveRef.current = false
        setRightHybridRailActive(false)
      }
    }
  }, [data?.id, visibleTocItems])

  useEffect(() => {
    if (!detailId) return
    if (didIncrementHitRef.current === detailId) return
    didIncrementHitRef.current = detailId

    let cancelled = false

    void apiFetch<RsData<{ hitCount: number }>>(`/post/api/v1/posts/${detailId}/hit`, {
      method: "POST",
    })
      .then((response) => {
        if (cancelled) return

        setEngagement((prev) => ({ ...prev, hitCount: response.data.hitCount }))
        queryClient.setQueryData<PostDetailType | undefined>(queryKey.post(detailId), (prev) =>
          prev ? { ...prev, hitCount: response.data.hitCount } : prev
        )
      })
      .catch(() => {
        // 조회수 증가는 사용자 경험을 막지 않도록 실패를 조용히 흡수한다.
      })

    return () => {
      cancelled = true
    }
  }, [detailId, queryClient])

  useEffect(() => {
    return () => {
      if (typeof window === "undefined") return
      if (shareFeedbackResetTimerRef.current === null) return
      window.clearTimeout(shareFeedbackResetTimerRef.current)
    }
  }, [])

  const flashShareFeedback = (next: "copied" | "shared" | "failed") => {
    if (typeof window === "undefined") return
    setShareFeedback(next)
    if (shareFeedbackResetTimerRef.current !== null) {
      window.clearTimeout(shareFeedbackResetTimerRef.current)
    }
    shareFeedbackResetTimerRef.current = window.setTimeout(() => {
      setShareFeedback(null)
    }, 1600)
  }

  const handleToggleLike = async () => {
    if (!data) return
    if (likePendingRef.current) return

    if (!me) {
      await pushRoute(router, loginHref)
      return
    }

    likePendingRef.current = true
    setLikePending(true)

    const currentLiked = engagement.actorHasLiked
    const currentLikesCount = engagement.likesCount
    const optimisticLiked = !currentLiked
    const optimisticLikesCount = Math.max(0, currentLikesCount + (optimisticLiked ? 1 : -1))

    setEngagement((prev) => ({
      ...prev,
      actorHasLiked: optimisticLiked,
      likesCount: optimisticLikesCount,
    }))
    queryClient.setQueryData<PostDetailType | undefined>(queryKey.post(data.id), (prev) =>
      prev
        ? {
            ...prev,
            actorHasLiked: optimisticLiked,
            likesCount: optimisticLikesCount,
          }
        : prev
    )

    try {
      const likeMethod: "PUT" | "DELETE" = currentLiked ? "DELETE" : "PUT"
      const response = await apiFetch<RsData<{ liked: boolean; likesCount: number }>>(
        `/post/api/v1/posts/${data.id}/like`,
        {
          method: likeMethod,
        }
      )

      setEngagement((prev) => ({
        ...prev,
        actorHasLiked: response.data.liked,
        likesCount: response.data.likesCount,
      }))

      queryClient.setQueryData<PostDetailType | undefined>(queryKey.post(data.id), (prev) =>
        prev
          ? {
              ...prev,
              actorHasLiked: response.data.liked,
              likesCount: response.data.likesCount,
            }
          : prev
      )
    } catch (error) {
      // 동시 요청 충돌은 최신 상태를 다시 받아 멱등하게 복구한다.
      const status =
        error instanceof ApiError
          ? error.status
          : typeof error === "object" && error !== null && "status" in error
            ? Number((error as { status?: unknown }).status)
            : undefined
      let recovered = false

      if (status === 409 || (typeof status === "number" && status >= 500)) {
        try {
          await queryClient.invalidateQueries({ queryKey: queryKey.post(data.id) })
          const refreshed = queryClient.getQueryData<PostDetailType | undefined>(queryKey.post(data.id))
          if (refreshed) {
            setEngagement((prev) => ({
              ...prev,
              actorHasLiked: refreshed.actorHasLiked ?? false,
              likesCount: refreshed.likesCount ?? 0,
            }))
            recovered = true
          }
        } catch {
          // 복구 조회 실패 시 아래 롤백으로 되돌린다.
        }
      }

      if (!recovered) {
        setEngagement((prev) => ({
          ...prev,
          actorHasLiked: currentLiked,
          likesCount: currentLikesCount,
        }))
        queryClient.setQueryData<PostDetailType | undefined>(queryKey.post(data.id), (prev) =>
          prev
            ? {
                ...prev,
                actorHasLiked: currentLiked,
                likesCount: currentLikesCount,
              }
            : prev
        )
      }
    } finally {
      likePendingRef.current = false
      setLikePending(false)
    }
  }

  const handleEditPost = async () => {
    if (!data) return
    const returnTo = router.asPath || toCanonicalPostPath(data.id)
    await pushRoute(
      router,
      `/editor/${encodeURIComponent(String(data.id))}?returnTo=${encodeURIComponent(returnTo)}`
    )
  }

  const handleDeletePost = async () => {
    if (!data || adminActionPending) return

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`정말 "${data.title}" 글을 삭제할까요?`)
      if (!confirmed) return
    }

    setAdminActionPending(true)

    try {
      await apiFetch(`/post/api/v1/posts/${data.id}`, {
        method: "DELETE",
      })
      queryClient.removeQueries({ queryKey: queryKey.post(data.id) })
      await replaceRoute(router, "/", { preferHardNavigation: true })
    } finally {
      setAdminActionPending(false)
    }
  }

  const handleSharePost = async () => {
    if (!data) return
    const canonicalPath = toCanonicalPostPath(postId)
    const shareUrl = typeof window !== "undefined" ? window.location.href : canonicalPath

    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          title: data.title,
          url: shareUrl,
        })
        flashShareFeedback("shared")
        return
      }

      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl)
        flashShareFeedback("copied")
        return
      }

      if (typeof window !== "undefined" && typeof window.prompt === "function") {
        window.prompt("링크를 복사하세요.", shareUrl)
      }
      flashShareFeedback("copied")
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return
      }
      flashShareFeedback("failed")
    }
  }

  if (!data) return null

  const handleTocNavigate = (id: string) => {
    const heading = document.getElementById(id)
    if (!heading) return
    const targetTop = heading.getBoundingClientRect().top + window.scrollY - (resolveRailTopOffset() + 24)
    setActiveTocId(id)
    const hash = `#${encodeURIComponent(id)}`
    const nextUrl = `${window.location.pathname}${window.location.search}${hash}`
    window.history.replaceState(window.history.state, "", nextUrl)
    window.scrollTo({ top: targetTop, behavior: "smooth" })
  }

  const scrollSectionIntoView = (target: HTMLElement | null) => {
    if (!target) return
    const targetTop =
      target.getBoundingClientRect().top + window.scrollY - (resolveRailTopOffset() + 20)
    window.scrollTo({ top: targetTop, behavior: "smooth" })
  }

  return (
    <StyledWrapper data-sticky-rail-safe="true">
      <div
        className="detailLayout"
        data-left-hybrid={leftHybridRailActive}
        data-right-hybrid={rightHybridRailActive}
        data-sticky-rail-safe="true"
      >
        <FloatingActionRail
          railRef={leftRailRef}
          innerRef={leftRailInnerRef}
          active={leftHybridRailActive}
          showFloatingLike={showFloatingLike}
          engagement={engagement}
          likePending={likePending}
          shareFeedback={shareFeedback}
          onToggleLike={handleToggleLike}
          onSharePost={handleSharePost}
        />

        <article ref={articleRef}>
          {data.type[0] === "Post" && (
            <section data-rum-section="header">
              <PostHeader
                data={data}
                likesCount={engagement.likesCount}
                hitCount={engagement.hitCount}
                actorHasLiked={engagement.actorHasLiked}
                likePending={likePending}
                hideLikeActionOnDesktop={showFloatingLike}
                hideShareActionOnDesktop={showFloatingLike}
                hideActionButtonsOnMobile
                shareFeedback={shareFeedback}
                onToggleLike={handleToggleLike}
                onSharePost={handleSharePost}
                showModifyAction={canModifyPost}
                showDeleteAction={canDeletePost}
                useAdminShellFallback
                adminActionPending={adminActionPending}
                onEditPost={handleEditPost}
                onDeletePost={handleDeletePost}
              />
            </section>
          )}
          {data.type[0] === "Post" ? (
            <MobileSummaryActions
              engagement={engagement}
              likePending={likePending}
              shareFeedback={shareFeedback}
              shareProgressLabel={shareProgressLabel}
              commentsRailActive={commentsRailActive}
              commentsCount={commentsCount}
              commentsProgressLabel={commentsProgressLabel}
              onToggleLike={handleToggleLike}
              onSharePost={handleSharePost}
              onScrollToComments={() => scrollSectionIntoView(commentsSectionRef.current)}
            />
          ) : null}
          {showStickyToc && (
            <CompactToc
              sectionRef={compactTocSectionRef}
              visibleTocItems={visibleTocItems}
              activeTocId={activeTocId}
              onNavigate={handleTocNavigate}
            />
          )}
          <BodySection data-rum-section="body">
            <MarkdownRenderer content={renderedContent} />
          </BodySection>
          {data.type[0] === "Post" && <div ref={relatedPrefetchTriggerRef} className="relatedPrefetchTrigger" aria-hidden="true" />}
          {data.type[0] === "Post" && shouldFetchRelated ? (
            <RelatedPostsSection
              relatedTag={relatedTag}
              showRelatedTagSkeleton={showRelatedTagSkeleton}
              relatedByTagPosts={relatedByTagPosts}
              showRelatedAuthorSkeleton={showRelatedAuthorSkeleton}
              relatedByAuthorPosts={relatedByAuthorPosts}
            />
          ) : null}
          {data.type[0] === "Post" && (
            <>
              <section data-rum-section="footer">
                <Footer />
              </section>
              <section ref={commentsSectionRef} data-rum-section="comments">
                <DeferredCommentBox data={data} initialComments={initialComments} />
              </section>
            </>
          )}
        </article>

        <RightTocRail
          railRef={rightRailRef}
          innerRef={rightRailInnerRef}
          listRef={rightTocListRef}
          active={rightHybridRailActive}
          showStickyToc={showStickyToc}
          visibleTocItems={visibleTocItems}
          activeTocId={activeTocId}
          hasDepth4Toc={hasDepth4Toc}
          showDetailedToc={showDetailedToc}
          onToggleDetailed={() => setShowDetailedToc((value) => !value)}
          onNavigate={handleTocNavigate}
        />
      </div>
    </StyledWrapper>
  )
}

export default PostDetail
