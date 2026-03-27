import React, { useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/router"
import Link from "next/link"
import PostHeader from "./PostHeader"
import Footer from "./PostFooter"
import styled from "@emotion/styled"
import MarkdownRenderer from "../components/MarkdownRenderer"
import usePostQuery from "src/hooks/usePostQuery"
import useAuthSession from "src/hooks/useAuthSession"
import { ApiError, apiFetch } from "src/apis/backend/client"
import { getExplorePostsPage, getFeedPostsPage } from "src/apis/backend/posts"
import { queryKey } from "src/constants/queryKey"
import { pushRoute, replaceRoute, toLoginPath } from "src/libs/router"
import { formatDate } from "src/libs/utils"
import { toCanonicalPostPath } from "src/libs/utils/postPath"
import { PostDetail as PostDetailType, TPost, TPostComment } from "src/types"
import DeferredCommentBox from "./DeferredCommentBox"
import AppIcon from "src/components/icons/AppIcon"
import { extractLeadingSummaryBlock, normalizeCardSummary } from "src/libs/postSummary"

type Props = {
  initialComments?: TPostComment[] | null
}

type RsData<T> = {
  resultCode: string
  msg: string
  data: T
}

type TocItem = {
  id: string
  text: string
  level: 2 | 3 | 4
}

const renderRelatedSummary = (summary: string | undefined) => {
  const summaryText = normalizeCardSummary(summary, { fallback: "", maxLength: 148 })
  return summaryText ? <p>{summaryText}</p> : null
}

const TOC_SELECTOR = ".aq-markdown h2, .aq-markdown h3, .aq-markdown h4"
const RELATED_POSTS_LIMIT = 4
const RELATED_AUTHOR_FETCH_PAGE_SIZE = 30
const RELATED_AUTHOR_FETCH_MAX_PAGES = 3
const RIGHT_RAIL_HYBRID_MIN_VIEWPORT_PX = 1440
const LEFT_RAIL_HYBRID_MIN_VIEWPORT_PX = 1201
const DETAIL_RAIL_GAP_FROM_HEADER_PX = 20
const STICKY_BLOCKING_OVERFLOW_VALUES = new Set(["auto", "scroll", "hidden", "clip"])

const getHeaderHeightFromCssVar = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return 56
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--app-header-height")
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 56
}

const resolveRailTopOffset = () => getHeaderHeightFromCssVar() + DETAIL_RAIL_GAP_FROM_HEADER_PX

const hasStickyBlockingAncestor = (node: HTMLElement | null) => {
  if (typeof window === "undefined" || !node) return false
  let current = node.parentElement

  while (current && current !== document.body && current !== document.documentElement) {
    const style = window.getComputedStyle(current)
    if (
      STICKY_BLOCKING_OVERFLOW_VALUES.has(style.overflowY) ||
      STICKY_BLOCKING_OVERFLOW_VALUES.has(style.overflow)
    ) {
      return true
    }
    current = current.parentElement
  }

  return false
}

const normalizeHeadingText = (value: string): string =>
  value
    .replace(/\s+/g, " ")
    .replace(/\u200B/g, "")
    .trim()

const toHeadingSlug = (value: string): string => {
  const normalized = value.trim().toLowerCase()
  const stripped = normalized.replace(/[^\p{L}\p{N}\s-]/gu, "")
  const dashed = stripped.replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "")
  return dashed || "section"
}

const collectTocFromArticle = (article: HTMLElement): TocItem[] => {
  const headings = Array.from(article.querySelectorAll<HTMLElement>(TOC_SELECTOR))
  if (!headings.length) return []

  const slugCounts = new Map<string, number>()
  const toc: TocItem[] = []

  headings.forEach((heading) => {
    const text = normalizeHeadingText(heading.textContent || "")
    if (!text) return

    const level = Number(heading.tagName.replace("H", "")) as TocItem["level"]
    if (![2, 3, 4].includes(level)) return

    const existingId = heading.id?.trim()
    let id = existingId
    if (!id) {
      const base = toHeadingSlug(text)
      const count = slugCounts.get(base) ?? 0
      slugCounts.set(base, count + 1)
      id = count === 0 ? base : `${base}-${count + 1}`
      heading.id = id
    } else {
      const count = slugCounts.get(existingId) ?? 0
      slugCounts.set(existingId, count + 1)
      if (count > 0) {
        id = `${existingId}-${count + 1}`
        heading.id = id
      }
    }

    toc.push({ id, text, level })
  })

  return toc
}

const PostDetail: React.FC<Props> = ({ initialComments = null }) => {
  const { post: data } = usePostQuery()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { me } = useAuthSession()
  const postId = data?.id ?? ""
  const detailId = data?.id
  const didIncrementHitRef = useRef<string | null>(null)
  const likePendingRef = useRef(false)
  const shareFeedbackResetTimerRef = useRef<number | null>(null)
  const articleRef = useRef<HTMLElement | null>(null)
  const leftRailRef = useRef<HTMLElement | null>(null)
  const leftRailInnerRef = useRef<HTMLDivElement | null>(null)
  const rightRailRef = useRef<HTMLElement | null>(null)
  const rightRailInnerRef = useRef<HTMLElement | null>(null)
  const [likePending, setLikePending] = useState(false)
  const [adminActionPending, setAdminActionPending] = useState(false)
  const [tocItems, setTocItems] = useState<TocItem[]>([])
  const [activeTocId, setActiveTocId] = useState<string>("")
  const [showDetailedToc, setShowDetailedToc] = useState(false)
  const [shareFeedback, setShareFeedback] = useState<"copied" | "shared" | "failed" | null>(null)
  const [leftHybridRailActive, setLeftHybridRailActive] = useState(false)
  const [rightHybridRailActive, setRightHybridRailActive] = useState(false)
  const [engagement, setEngagement] = useState(() => ({
    likesCount: data?.likesCount ?? 0,
    hitCount: data?.hitCount ?? 0,
    actorHasLiked: data?.actorHasLiked ?? false,
  }))

  const loginHref = useMemo(() => {
    const next = router.asPath || toCanonicalPostPath(postId)
    return toLoginPath(next, toCanonicalPostPath(postId))
  }, [postId, router.asPath])
  const canModifyPost = Boolean(me?.isAdmin || data?.actorCanModify)
  const canDeletePost = Boolean(me?.isAdmin || data?.actorCanDelete)
  const showFloatingLike = data?.type[0] === "Post"
  const hasDepth4Toc = useMemo(() => tocItems.some((item) => item.level === 4), [tocItems])
  const visibleTocItems = useMemo(
    () => (showDetailedToc ? tocItems : tocItems.filter((item) => item.level <= 3)),
    [showDetailedToc, tocItems]
  )
  const showStickyToc = visibleTocItems.length >= 2
  const extractedSummaryState = useMemo(
    () => extractLeadingSummaryBlock(data?.content || "", 180),
    [data?.content]
  )
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
    enabled: Boolean(relatedTag && data?.id),
    staleTime: 300_000,
    retry: 1,
  })

  const relatedByAuthorQuery = useQuery({
    queryKey: queryKey.postsExplore({
      kw: `author:${authorId || "none"}`,
      tag: undefined,
      order: "desc",
      page: 1,
      pageSize: RELATED_AUTHOR_FETCH_PAGE_SIZE,
    }),
    queryFn: async () => {
      const currentPostId = String(data?.id || "")
      const authorIdValue = String(authorId || "")
      const dedupe = new Set<string>()
      const collected: TPost[] = []

      for (let page = 1; page <= RELATED_AUTHOR_FETCH_MAX_PAGES; page += 1) {
        const pageResult = await getFeedPostsPage({
          order: "desc",
          page,
          pageSize: RELATED_AUTHOR_FETCH_PAGE_SIZE,
        })

        for (const post of pageResult.posts) {
          const postAuthorId = String(post.author?.[0]?.id || "")
          if (!postAuthorId || postAuthorId !== authorIdValue) continue
          const postId = String(post.id || "")
          if (!postId || postId === currentPostId || dedupe.has(postId)) continue

          dedupe.add(postId)
          collected.push(post)

          if (collected.length >= RELATED_POSTS_LIMIT) {
            return collected
          }
        }

        const reachedLastPage = pageResult.pageNumber * pageResult.pageSize >= pageResult.totalCount
        if (reachedLastPage) break
      }

      return collected
    },
    enabled: Boolean(authorId && data?.id),
    staleTime: 300_000,
    retry: 1,
  })

  const relatedByTagPosts = useMemo(() => {
    const currentPostId = String(data?.id || "")
    return (relatedByTagQuery.data?.posts || [])
      .filter((post) => String(post.id) !== currentPostId)
      .slice(0, RELATED_POSTS_LIMIT)
  }, [data?.id, relatedByTagQuery.data?.posts])

  const relatedByAuthorPosts = useMemo(
    () => (relatedByAuthorQuery.data || []).slice(0, RELATED_POSTS_LIMIT),
    [relatedByAuthorQuery.data]
  )

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

    const collected = collectTocFromArticle(article)
    setTocItems(collected)
    setShowDetailedToc(false)
    setActiveTocId(collected[0]?.id ?? "")
  }, [data?.content, data?.id])

  useEffect(() => {
    if (!tocItems.length || !visibleTocItems.length) return

    const headingNodes = visibleTocItems
      .map((item) => document.getElementById(item.id))
      .filter((node): node is HTMLElement => Boolean(node))
    if (!headingNodes.length) return

    const ratioMap = new Map<string, number>()
    const visibleIdSet = new Set(visibleTocItems.map((item) => item.id))
    let rafId: number | null = null

    const resolveActiveByRatio = () => {
      const anchorTop = resolveRailTopOffset() + 12
      const candidates = visibleTocItems.map((item) => {
        const node = document.getElementById(item.id)
        const top = node ? node.getBoundingClientRect().top : Number.POSITIVE_INFINITY
        const ratio = ratioMap.get(item.id) ?? 0
        return { id: item.id, ratio, top }
      })

      const intersecting = candidates
        .filter((candidate) => candidate.ratio > 0.04 && Number.isFinite(candidate.top))
        .sort((a, b) => {
          if (b.ratio !== a.ratio) return b.ratio - a.ratio
          return Math.abs(a.top - anchorTop) - Math.abs(b.top - anchorTop)
        })

      if (intersecting.length > 0) {
        return intersecting[0].id
      }

      const passed = candidates
        .filter((candidate) => Number.isFinite(candidate.top) && candidate.top <= anchorTop)
        .sort((a, b) => a.top - b.top)
      if (passed.length > 0) {
        return passed[passed.length - 1].id
      }

      return visibleTocItems[0]?.id || ""
    }

    const scheduleActiveSync = () => {
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        const nextId = resolveActiveByRatio()
        if (!visibleIdSet.has(nextId)) return
        setActiveTocId((prev) => (prev === nextId ? prev : nextId))
      })
    }

    const thresholds = [0, 0.08, 0.2, 0.36, 0.5, 0.65, 0.8, 1]
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id
          if (!id || !visibleIdSet.has(id)) continue
          ratioMap.set(id, entry.isIntersecting ? entry.intersectionRatio : 0)
        }
        scheduleActiveSync()
      },
      {
        root: null,
        rootMargin: `-${resolveRailTopOffset() + 12}px 0px -52% 0px`,
        threshold: thresholds,
      }
    )

    headingNodes.forEach((node) => observer.observe(node))
    scheduleActiveSync()

    const handleResize = () => {
      scheduleActiveSync()
    }
    window.addEventListener("resize", handleResize)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", handleResize)
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
      ratioMap.clear()
    }
  }, [tocItems, visibleTocItems])

  useEffect(() => {
    if (typeof window === "undefined") return
    const article = articleRef.current
    if (!article) return

    let rafId: number | null = null
    let ticking = false

    const clearInlineRailStyle = (inner: HTMLElement | null) => {
      if (!inner) return
      inner.style.position = ""
      inner.style.top = ""
      inner.style.left = ""
      inner.style.width = ""
      inner.style.bottom = ""
      inner.style.transform = ""
    }

    const applyHybridRail = ({
      rail,
      inner,
      enabled,
    }: {
      rail: HTMLElement | null
      inner: HTMLElement | null
      enabled: boolean
    }) => {
      if (!rail || !inner || !enabled) {
        clearInlineRailStyle(inner)
        return
      }

      const topOffset = resolveRailTopOffset()
      const railRect = rail.getBoundingClientRect()
      const innerHeight = inner.offsetHeight
      const articleRect = article.getBoundingClientRect()
      const railTopDoc = window.scrollY + railRect.top
      const articleBottomDoc = window.scrollY + articleRect.bottom
      const startFixedScrollY = railTopDoc - topOffset
      const endFixedScrollY = articleBottomDoc - topOffset - innerHeight

      if (railRect.width <= 0 || innerHeight <= 0 || endFixedScrollY <= startFixedScrollY) {
        clearInlineRailStyle(inner)
        return
      }

      if (window.scrollY < startFixedScrollY) {
        inner.style.position = "absolute"
        inner.style.top = "0px"
        inner.style.left = "0px"
        inner.style.width = "100%"
        inner.style.bottom = ""
        inner.style.transform = ""
        return
      }

      if (window.scrollY > endFixedScrollY) {
        const bottomTop = Math.max(0, articleBottomDoc - railTopDoc - innerHeight)
        inner.style.position = "absolute"
        inner.style.top = `${bottomTop}px`
        inner.style.left = "0px"
        inner.style.width = "100%"
        inner.style.bottom = ""
        inner.style.transform = ""
        return
      }

      inner.style.position = "fixed"
      inner.style.top = `${topOffset}px`
      inner.style.left = `${Math.round(railRect.left)}px`
      inner.style.width = `${Math.round(railRect.width)}px`
      inner.style.bottom = ""
      inner.style.transform = "translateZ(0)"
    }

    const syncHybridRails = () => {
      const viewportWidth = window.innerWidth
      const leftEnabled = showFloatingLike && viewportWidth >= LEFT_RAIL_HYBRID_MIN_VIEWPORT_PX
      const rightEnabled = showStickyToc && viewportWidth >= RIGHT_RAIL_HYBRID_MIN_VIEWPORT_PX
      const leftNeedsHybridFallback =
        leftEnabled && hasStickyBlockingAncestor(leftRailRef.current)
      const rightNeedsHybridFallback =
        rightEnabled && hasStickyBlockingAncestor(rightRailRef.current)

      setLeftHybridRailActive((prev) =>
        prev === leftNeedsHybridFallback ? prev : leftNeedsHybridFallback
      )
      setRightHybridRailActive((prev) =>
        prev === rightNeedsHybridFallback ? prev : rightNeedsHybridFallback
      )

      applyHybridRail({
        rail: leftRailRef.current,
        inner: leftRailInnerRef.current,
        enabled: leftNeedsHybridFallback,
      })

      applyHybridRail({
        rail: rightRailRef.current,
        inner: rightRailInnerRef.current,
        enabled: rightNeedsHybridFallback,
      })
    }

    const scheduleSync = () => {
      if (ticking) return
      ticking = true
      rafId = window.requestAnimationFrame(() => {
        ticking = false
        syncHybridRails()
      })
    }

    scheduleSync()
    window.addEventListener("scroll", scheduleSync, { passive: true })
    window.addEventListener("resize", scheduleSync, { passive: true })
    window.addEventListener("orientationchange", scheduleSync)

    const fontSet = document.fonts
    if (fontSet) {
      void fontSet.ready.then(() => scheduleSync()).catch(() => {})
    }

    const leftRailInnerNode = leftRailInnerRef.current
    const rightRailInnerNode = rightRailInnerRef.current
    let resizeObserver: ResizeObserver | null = null

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        scheduleSync()
      })
      resizeObserver.observe(article)
      if (leftRailInnerNode) resizeObserver.observe(leftRailInnerNode)
      if (rightRailInnerNode) resizeObserver.observe(rightRailInnerNode)
    }

    return () => {
      window.removeEventListener("scroll", scheduleSync)
      window.removeEventListener("resize", scheduleSync)
      window.removeEventListener("orientationchange", scheduleSync)
      resizeObserver?.disconnect()
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
      clearInlineRailStyle(leftRailInnerNode)
      clearInlineRailStyle(rightRailInnerNode)
      setLeftHybridRailActive(false)
      setRightHybridRailActive(false)
    }
  }, [showFloatingLike, showStickyToc, tocItems.length])

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
        queryClient.setQueryData<PostDetailType | undefined>(queryKey.post(String(detailId)), (prev) =>
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
    queryClient.setQueryData<PostDetailType | undefined>(queryKey.post(String(data.id)), (prev) =>
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

      queryClient.setQueryData<PostDetailType | undefined>(queryKey.post(String(data.id)), (prev) =>
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
          await queryClient.invalidateQueries({ queryKey: queryKey.post(String(data.id)) })
          const refreshed = queryClient.getQueryData<PostDetailType | undefined>(queryKey.post(String(data.id)))
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
        queryClient.setQueryData<PostDetailType | undefined>(queryKey.post(String(data.id)), (prev) =>
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
    await pushRoute(router, `/admin/posts/new?postId=${encodeURIComponent(String(data.id))}`)
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
      queryClient.removeQueries({ queryKey: queryKey.post(String(data.id)) })
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

  return (
    <StyledWrapper data-sticky-rail-safe="true">
      <div
        className="detailLayout"
        data-left-hybrid={leftHybridRailActive}
        data-right-hybrid={rightHybridRailActive}
        data-sticky-rail-safe="true"
      >
        <aside ref={leftRailRef} className="leftRail" data-hybrid-active={leftHybridRailActive} aria-hidden={!showFloatingLike}>
          {showFloatingLike ? (
            <div ref={leftRailInnerRef} className="leftRailInner">
              <div className="floatingLikeCluster">
                <div className="floatingLikeStat">
                  <button
                    type="button"
                    className="floatingActionButton floatingLikeButton"
                    title="좋아요"
                    data-tooltip="좋아요"
                    aria-label={`좋아요 ${engagement.likesCount}`}
                    aria-pressed={engagement.actorHasLiked}
                    data-active={engagement.actorHasLiked}
                    disabled={likePending}
                    onClick={handleToggleLike}
                  >
                    <AppIcon name={engagement.actorHasLiked ? "heart-filled" : "heart"} />
                  </button>
                  <span className="floatingLikeCount" aria-hidden="true">
                    {engagement.likesCount}
                  </span>
                </div>
                <div className="floatingShareStat">
                  <button
                    type="button"
                    className="floatingActionButton floatingShareButton"
                    title="공유"
                    data-tooltip="공유"
                    aria-label="게시글 공유"
                    onClick={handleSharePost}
                  >
                    <AppIcon name="share" />
                  </button>
                </div>
                {shareFeedback ? (
                  <span className="floatingShareFeedback" role="status" aria-live="polite">
                    {shareFeedback === "failed"
                      ? "공유 실패"
                      : shareFeedback === "shared"
                        ? "공유됨"
                        : "링크 복사"}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </aside>

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
                shareFeedback={shareFeedback}
                onToggleLike={handleToggleLike}
                onSharePost={handleSharePost}
                showModifyAction={canModifyPost}
                showDeleteAction={canDeletePost}
                adminActionPending={adminActionPending}
                onEditPost={handleEditPost}
                onDeletePost={handleDeletePost}
              />
            </section>
          )}
          {showStickyToc && (
            <CompactTocSection aria-label="접이식 목차">
              <details>
                <summary>
                  <div className="summaryCopy">
                    <strong>이 글에서 다루는 내용</strong>
                    <span>{visibleTocItems.length}개 섹션을 빠르게 이동합니다.</span>
                  </div>
                  <span className="summaryChevron" aria-hidden="true">
                    <AppIcon name="chevron-down" />
                  </span>
                </summary>
                <ol>
                  {visibleTocItems.map((item) => (
                    <li key={`compact-${item.id}`} data-level={item.level}>
                      <button
                        type="button"
                        data-active={activeTocId === item.id}
                        title={item.text}
                        aria-label={item.text}
                        onClick={() => handleTocNavigate(item.id)}
                      >
                        {item.text}
                      </button>
                    </li>
                  ))}
                </ol>
              </details>
            </CompactTocSection>
          )}
          <BodySection data-rum-section="body">
            <MarkdownRenderer content={renderedContent} />
          </BodySection>
          {data.type[0] === "Post" && relatedByTagPosts.length > 0 && (
            <RelatedSection aria-label="연관 글" data-rum-section="related-tag">
              <header>
                <h2>같은 태그 글</h2>
                <Link href={relatedTag ? `/?tag=${encodeURIComponent(relatedTag)}` : "/"}>
                  더 보기
                </Link>
              </header>
              <ul>
                {relatedByTagPosts.map((post) => (
                  <li key={post.id}>
                    <Link href={toCanonicalPostPath(post.id)}>
                      <strong>{post.title}</strong>
                      {renderRelatedSummary(post.summary)}
                      <span>{formatDate(post.date?.start_date || post.createdTime)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </RelatedSection>
          )}
          {data.type[0] === "Post" && relatedByAuthorPosts.length > 0 && (
            <RelatedSection aria-label="같은 작성자 글" data-rum-section="related-author">
              <header>
                <h2>같은 작성자 글</h2>
                <Link href="/">
                  더 보기
                </Link>
              </header>
              <ul>
                {relatedByAuthorPosts.map((post) => (
                  <li key={post.id}>
                    <Link href={toCanonicalPostPath(post.id)}>
                      <strong>{post.title}</strong>
                      {renderRelatedSummary(post.summary)}
                      <span>{formatDate(post.date?.start_date || post.createdTime)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </RelatedSection>
          )}
          {data.type[0] === "Post" && (
            <>
              <section data-rum-section="footer">
                <Footer />
              </section>
              <section data-rum-section="comments">
                <DeferredCommentBox data={data} initialComments={initialComments} />
              </section>
            </>
          )}
        </article>

        <aside ref={rightRailRef} className="rightRail" data-hybrid-active={rightHybridRailActive} aria-hidden={!showStickyToc}>
          {showStickyToc ? (
            <nav ref={rightRailInnerRef} className="rightRailInner" aria-label="목차">
              <div className="rightRailHead">
                <div className="rightRailTitleGroup">
                  <h2 className="rightRailTitle">목차</h2>
                  <span className="rightRailMeta">{visibleTocItems.length}개 섹션</span>
                </div>
                {hasDepth4Toc && (
                  <button
                    type="button"
                    className="tocDepthToggle"
                    onClick={() => setShowDetailedToc((value) => !value)}
                    aria-pressed={showDetailedToc}
                  >
                    {showDetailedToc ? "h4 접기" : "h4 보기"}
                  </button>
                )}
              </div>
              <ol>
                {visibleTocItems.map((item) => (
                  <li key={item.id} data-level={item.level}>
                    <button
                      type="button"
                      data-active={activeTocId === item.id}
                      title={item.text}
                      aria-label={item.text}
                      onClick={() => handleTocNavigate(item.id)}
                    >
                      {item.text}
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}
        </aside>
      </div>
    </StyledWrapper>
  )
}

export default PostDetail

const StyledWrapper = styled.div`
  width: min(100%, 76rem);
  max-width: 76rem;
  box-sizing: border-box;
  margin: 0 auto;
  min-width: 0;
  padding: 0 0.5rem;

  @media (min-width: 1057px) and (max-width: 1440px) {
    width: min(calc(100vw - 2rem), 76rem);
    max-width: none;
    margin-left: calc((1024px - min(calc(100vw - 2rem), 76rem)) / 2);
    margin-right: 0;
  }

  .detailLayout {
    display: grid;
    grid-template-columns: 72px minmax(0, var(--article-readable-width, 48rem)) minmax(0, 12.5rem);
    justify-content: center;
    gap: 2.5rem;
    min-width: 0;
    overflow: visible;
  }

  article {
    margin: 0 auto;
    max-width: var(--article-readable-width, 48rem);
    display: grid;
    gap: 1.15rem;
    min-width: 0;
    width: 100%;
  }

  article > * {
    min-width: 0;
  }

  .leftRail,
  .rightRail {
    min-width: 0;
    position: sticky;
    top: calc(var(--app-header-height, 5.4rem) + 1rem);
    align-self: start;
    overflow: visible;
    z-index: 1;
  }

  .leftRailInner,
  .rightRailInner {
    position: static;
  }

  .detailLayout[data-left-hybrid="true"] .leftRail,
  .detailLayout[data-right-hybrid="true"] .rightRail {
    position: relative;
    top: 0;
    align-self: stretch;
  }

  .detailLayout[data-left-hybrid="true"] .leftRailInner,
  .detailLayout[data-right-hybrid="true"] .rightRailInner {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
  }

  .floatingActionButton {
    width: 3.2rem;
    height: 3.2rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => (theme.scheme === "dark" ? "rgba(148, 163, 184, 0.28)" : theme.colors.gray6)};
    background: ${({ theme }) => (theme.scheme === "dark" ? "rgba(15, 23, 42, 0.32)" : "rgba(255, 255, 255, 0.92)")};
    color: ${({ theme }) => theme.colors.gray12};
    cursor: pointer;
    transition: border-color 0.18s ease, background-color 0.18s ease, color 0.18s ease, transform 0.18s ease;

    svg {
      font-size: 1.14rem;
    }

    &:hover {
      transform: translateY(-1px);
      border-color: ${({ theme }) => (theme.scheme === "dark" ? "rgba(148, 163, 184, 0.62)" : theme.colors.gray8)};
      background: ${({ theme }) => (theme.scheme === "dark" ? "rgba(17, 24, 39, 0.62)" : "#ffffff")};
    }

    &:disabled {
      opacity: 0.7;
      cursor: not-allowed;
      transform: none;
    }
  }

  @media (hover: hover) and (pointer: fine) {
    .floatingActionButton[data-tooltip] {
      position: relative;
    }

    .floatingActionButton[data-tooltip]::after {
      content: attr(data-tooltip);
      position: absolute;
      left: calc(100% + 0.6rem);
      top: 50%;
      transform: translateY(-50%);
      white-space: nowrap;
      padding: 0.3rem 0.48rem;
      border-radius: 8px;
      border: 1px solid ${({ theme }) => theme.colors.gray6};
      background: ${({ theme }) => theme.colors.gray2};
      color: ${({ theme }) => theme.colors.gray11};
      font-size: 0.68rem;
      line-height: 1;
      font-weight: 700;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s ease;
    }

    .floatingActionButton[data-tooltip]:hover::after,
    .floatingActionButton[data-tooltip]:focus-visible::after {
      opacity: 1;
    }
  }

  .floatingLikeButton[data-active="true"] {
    border-color: ${({ theme }) => theme.colors.red7};

    svg {
      color: ${({ theme }) => theme.colors.red10};
    }
  }

  .floatingShareButton {
    color: ${({ theme }) => theme.colors.gray10};

    svg {
      font-size: 1.02rem;
    }
  }

  .floatingLikeCluster {
    display: grid;
    justify-items: center;
    row-gap: 0.54rem;
  }

  .floatingLikeStat {
    display: grid;
    justify-items: center;
    row-gap: 0.36rem;
  }

  .floatingShareStat {
    display: grid;
    justify-items: center;
    row-gap: 0.36rem;
  }

  .floatingLikeCount {
    font-size: 0.8rem;
    line-height: 1;
    font-weight: 720;
    color: ${({ theme }) => theme.colors.gray10};
  }

  .floatingShareFeedback {
    font-size: 0.64rem;
    line-height: 1;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.gray9};
    text-align: center;
  }

  .rightRailInner {
    border-left: 1px solid ${({ theme }) => (theme.scheme === "dark" ? "rgba(148, 163, 184, 0.26)" : theme.colors.gray6)};
    padding: 0.2rem 0 0.2rem 1.4rem;
    background: transparent;

    .rightRailHead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 0.5rem;
    }

    .rightRailTitleGroup {
      display: grid;
      gap: 0.18rem;
      min-width: 0;
    }

    .rightRailTitle {
      margin: 0;
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 0.88rem;
      line-height: 1.2;
      font-weight: 780;
      letter-spacing: -0.02em;
    }

    .rightRailMeta {
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.69rem;
      line-height: 1.2;
      font-weight: 620;
    }

    .tocDepthToggle {
      border: 1px solid ${({ theme }) => theme.colors.gray6};
      border-radius: 999px;
      background: ${({ theme }) => theme.colors.gray2};
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.71rem;
      font-weight: 700;
      line-height: 1;
      padding: 0.32rem 0.5rem;
      cursor: pointer;
      flex-shrink: 0;

      &:hover {
        color: ${({ theme }) => theme.colors.gray12};
        border-color: ${({ theme }) => theme.colors.gray8};
      }
    }

    ol {
      margin: 0;
      padding: 0;
      list-style: none;
      display: block;
      max-height: calc(100vh - 8.8rem);
      overflow-y: auto;
      overflow-x: hidden;
    }

    li {
      min-width: 0;
      margin: 0;
    }

    li[data-level="3"] button {
      padding-left: 0.62rem;
      font-size: 0.82rem;
    }

    li[data-level="4"] button {
      padding-left: 1.02rem;
      font-size: 0.79rem;
    }

    button {
      width: 100%;
      text-align: left;
      border: 0;
      border-radius: 10px;
      min-height: 38px;
      box-sizing: border-box;
      max-width: 100%;
      padding: 0.52rem 0.82rem 0.52rem 0.28rem;
      background: transparent;
      color: ${({ theme }) => theme.colors.gray9};
      font-size: 0.82rem;
      line-height: 1.42;
      cursor: pointer;
      white-space: normal;
      overflow: hidden;
      overflow-wrap: anywhere;
      word-break: keep-all;
      position: relative;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      transition: color 0.15s ease, background-color 0.15s ease;
    }

    button:hover {
      color: ${({ theme }) => theme.colors.gray11};
      background: ${({ theme }) => theme.colors.gray2};
    }

    button::before {
      content: "";
      position: absolute;
      left: -1.18rem;
      top: 0.24rem;
      bottom: 0.24rem;
      width: 1px;
      opacity: 0;
      background: ${({ theme }) => theme.colors.accentBorder};
      transition: opacity 0.15s ease;
    }

    button[data-active="true"] {
      color: ${({ theme }) => theme.colors.gray12};
      font-weight: 700;
      background: ${({ theme }) => theme.colors.accentSurfaceSubtle};
    }

    button[data-active="true"]::before {
      opacity: 1;
    }
  }

  @media (max-width: 1439px) {
    .detailLayout {
      grid-template-columns: 72px minmax(0, var(--article-readable-width, 48rem));
      gap: 2rem;
    }

    .rightRail {
      display: none;
    }
  }

  @media (max-width: 1279px) {
    .detailLayout {
      grid-template-columns: 72px minmax(0, var(--article-readable-width, 48rem));
      gap: 1.6rem;
    }
  }

  @media (max-width: 1200px) {
    .detailLayout {
      grid-template-columns: minmax(0, 49rem);
      gap: 0;
    }

    .leftRail {
      display: none;
    }
  }

  @media (max-width: 1080px) {
    width: 100%;
    max-width: 50rem;
    padding: 0;

    .detailLayout {
      grid-template-columns: minmax(0, 50rem);
      gap: 0;
    }

    article {
      max-width: 50rem;
    }
  }
`

const BodySection = styled.div`
  margin-top: 0.8rem;
  padding-top: 1.05rem;
  border-top: 1px solid ${({ theme }) => theme.colors.gray6};
  width: 100%;
  min-width: 0;

  @media (max-width: 768px) {
    margin-top: 0.55rem;
    padding-top: 0.85rem;
  }
`

const CompactTocSection = styled.section`
  display: none;
  margin-top: 0.2rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 14px;
  background: ${({ theme }) => theme.colors.gray2};
  overflow: hidden;

  details {
    display: grid;
  }

  summary {
    list-style: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 0.9rem 1rem;
    cursor: pointer;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  .summaryCopy {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
  }

  .summaryCopy strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.96rem;
    line-height: 1.3;
    font-weight: 760;
  }

  .summaryCopy span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .summaryChevron {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    color: ${({ theme }) => theme.colors.gray10};
    flex-shrink: 0;
    transition: transform 0.16s ease;
  }

  details[open] .summaryChevron {
    transform: rotate(180deg);
  }

  ol {
    list-style: none;
    margin: 0;
    padding: 0 0.78rem 0.88rem;
    display: grid;
    gap: 0.12rem;
  }

  li[data-level="3"] button {
    padding-left: 0.78rem;
    font-size: 0.84rem;
  }

  li[data-level="4"] button {
    padding-left: 1.26rem;
    font-size: 0.8rem;
  }

  button {
    width: 100%;
    min-height: 38px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray10};
    text-align: left;
    font-size: 0.88rem;
    line-height: 1.4;
    padding: 0.45rem 0.6rem;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: background-color 0.16s ease, color 0.16s ease;
  }

  button:hover {
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
  }

  button[data-active="true"] {
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
    font-weight: 700;
  }

  @media (max-width: 1439px) {
    display: block;
  }
`

const RelatedSection = styled.section`
  margin-top: 0.52rem;
  padding-top: 0.88rem;
  border-top: 1px solid ${({ theme }) => theme.colors.gray6};
  display: grid;
  gap: 0.72rem;
  content-visibility: auto;
  contain-intrinsic-size: 1px 420px;

  > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 760;
    line-height: 1.35;
    color: ${({ theme }) => theme.colors.gray12};
  }

  > header a {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
    font-weight: 700;
    text-decoration: none;

    &:hover {
      color: ${({ theme }) => theme.colors.gray12};
      text-decoration: underline;
      text-underline-offset: 2px;
    }
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.48rem;
  }

  li {
    min-width: 0;
  }

  li a {
    display: grid;
    gap: 0.3rem;
    min-width: 0;
    padding: 0.68rem 0.74rem;
    border-radius: 10px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray1};
    text-decoration: none;
    transition: border-color 0.14s ease-in, background-color 0.14s ease-in, box-shadow 0.14s ease-in;

    &:hover {
      border-color: ${({ theme }) => theme.colors.gray8};
      background: ${({ theme }) => theme.colors.gray2};
      box-shadow: ${({ theme }) =>
        theme.scheme === "light" ? "0 10px 24px rgba(15, 23, 42, 0.05)" : "none"};
    }
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.92rem;
    line-height: 1.42;
    font-weight: 720;
    letter-spacing: -0.01em;
    word-break: keep-all;
    overflow-wrap: anywhere;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
    line-height: 1.52;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    word-break: keep-all;
    overflow-wrap: anywhere;
  }

  span {
    color: ${({ theme }) => theme.colors.gray9};
    font-size: 0.75rem;
    line-height: 1.4;
  }

  @media (max-width: 768px) {
    margin-top: 0.38rem;
    padding-top: 0.74rem;
  }
`
