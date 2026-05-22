import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { NextRouter } from "next/router"
import { ApiError, apiFetch } from "src/apis/backend/client"
import { queryKey } from "src/constants/queryKey"
import { pushRoute, replaceRoute } from "src/libs/router"
import { toCanonicalPostPath } from "src/libs/utils/postPath"
import type { PostDetail as PostDetailType } from "src/types"

type RsData<T> = {
  resultCode: string
  msg: string
  data: T
}

type ShareFeedback = "copied" | "shared" | "failed"

type UsePostDetailEngagementActionsArgs = {
  data?: PostDetailType
  postId: string
  loginHref: string
  me: unknown
  router: NextRouter
}

export const usePostDetailEngagementActions = ({
  data,
  postId,
  loginHref,
  me,
  router,
}: UsePostDetailEngagementActionsArgs) => {
  const queryClient = useQueryClient()
  const detailId = data?.id
  const didIncrementHitRef = useRef<string | null>(null)
  const likePendingRef = useRef(false)
  const shareFeedbackResetTimerRef = useRef<number | null>(null)
  const [likePending, setLikePending] = useState(false)
  const [adminActionPending, setAdminActionPending] = useState(false)
  const [shareFeedback, setShareFeedback] = useState<ShareFeedback | null>(null)
  const [engagement, setEngagement] = useState(() => ({
    likesCount: data?.likesCount ?? 0,
    hitCount: data?.hitCount ?? 0,
    actorHasLiked: data?.actorHasLiked ?? false,
  }))
  const shareProgressLabel =
    shareFeedback === "failed"
      ? "재시도"
      : shareFeedback === "shared"
        ? "복사 완료"
        : shareFeedback === "copied"
          ? "복사 완료"
          : null

  useEffect(() => {
    if (!data) return
    setEngagement({
      likesCount: data.likesCount ?? 0,
      hitCount: data.hitCount ?? 0,
      actorHasLiked: data.actorHasLiked ?? false,
    })
  }, [data, data?.actorHasLiked, data?.hitCount, data?.id, data?.likesCount])

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

  const flashShareFeedback = useCallback((next: ShareFeedback) => {
    if (typeof window === "undefined") return
    setShareFeedback(next)
    if (shareFeedbackResetTimerRef.current !== null) {
      window.clearTimeout(shareFeedbackResetTimerRef.current)
    }
    shareFeedbackResetTimerRef.current = window.setTimeout(() => {
      setShareFeedback(null)
    }, 1600)
  }, [])

  const handleToggleLike = useCallback(async () => {
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
  }, [data, engagement.actorHasLiked, engagement.likesCount, loginHref, me, queryClient, router])

  const handleEditPost = useCallback(async () => {
    if (!data) return
    const returnTo = router.asPath || toCanonicalPostPath(data.id)
    await pushRoute(
      router,
      `/editor/${encodeURIComponent(String(data.id))}?returnTo=${encodeURIComponent(returnTo)}`
    )
  }, [data, router])

  const handleDeletePost = useCallback(async () => {
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
  }, [adminActionPending, data, queryClient, router])

  const handleSharePost = useCallback(async () => {
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
  }, [data, flashShareFeedback, postId])

  return {
    adminActionPending,
    engagement,
    handleDeletePost,
    handleEditPost,
    handleSharePost,
    handleToggleLike,
    likePending,
    shareFeedback,
    shareProgressLabel,
  }
}
