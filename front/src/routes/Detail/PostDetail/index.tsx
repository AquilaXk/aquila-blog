import React, { useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/router"
import PostHeader from "./PostHeader"
import Footer from "./PostFooter"
import styled from "@emotion/styled"
import MarkdownRenderer from "../components/MarkdownRenderer"
import usePostQuery from "src/hooks/usePostQuery"
import useAuthSession from "src/hooks/useAuthSession"
import { ApiError, apiFetch } from "src/apis/backend/client"
import { queryKey } from "src/constants/queryKey"
import { pushRoute, replaceRoute, toLoginPath } from "src/libs/router"
import { toCanonicalPostPath } from "src/libs/utils/postPath"
import { PostDetail as PostDetailType, TPostComment } from "src/types"
import DeferredCommentBox from "./DeferredCommentBox"

type Props = {
  initialComments?: TPostComment[] | null
}

type RsData<T> = {
  resultCode: string
  msg: string
  data: T
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
  const [likePending, setLikePending] = useState(false)
  const [adminActionPending, setAdminActionPending] = useState(false)
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
      const response = await apiFetch<RsData<{ liked: boolean; likesCount: number }>>(
        `/post/api/v1/posts/${data.id}/like`,
        {
          method: "POST",
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

  if (!data) return null

  return (
    <StyledWrapper>
      <article>
        {data.type[0] === "Post" && (
          <PostHeader
            data={data}
            likesCount={engagement.likesCount}
            hitCount={engagement.hitCount}
            actorHasLiked={engagement.actorHasLiked}
            likePending={likePending}
            onToggleLike={handleToggleLike}
            showModifyAction={canModifyPost}
            showDeleteAction={canDeletePost}
            adminActionPending={adminActionPending}
            onEditPost={handleEditPost}
            onDeletePost={handleDeletePost}
          />
        )}
        <BodySection>
          <MarkdownRenderer content={data.content} />
        </BodySection>
        {data.type[0] === "Post" && (
          <>
            <Footer />
            <DeferredCommentBox data={data} initialComments={initialComments} />
          </>
        )}
      </article>
    </StyledWrapper>
  )
}

export default PostDetail

const StyledWrapper = styled.div`
  max-width: 72rem;
  margin: 0 auto;
  min-width: 0;

  > article {
    margin: 0 auto;
    max-width: 52rem;
    display: grid;
    gap: 1.1rem;
    min-width: 0;
    width: 100%;
  }

  > article > * {
    min-width: 0;
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
