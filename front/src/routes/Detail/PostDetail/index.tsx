import React, { useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/router"
import PostHeader from "./PostHeader"
import Footer from "./PostFooter"
import styled from "@emotion/styled"
import NotionRenderer from "../components/NotionRenderer"
import usePostQuery from "src/hooks/usePostQuery"
import useAuthSession from "src/hooks/useAuthSession"
import { apiFetch } from "src/apis/backend/client"
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
  const showAdminActions = Boolean(me?.isAdmin && data?.actorCanModify && data?.actorCanDelete)

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
    if (likePending) return

    if (!me) {
      await pushRoute(router, loginHref)
      return
    }

    setLikePending(true)

    try {
      const nextLiked = !engagement.actorHasLiked
      const response = await apiFetch<RsData<{ liked: boolean; likesCount: number }>>(
        `/post/api/v1/posts/${data.id}/like`,
        {
          method: nextLiked ? "PUT" : "DELETE",
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
    } finally {
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
            showAdminActions={showAdminActions}
            adminActionPending={adminActionPending}
            onEditPost={handleEditPost}
            onDeletePost={handleDeletePost}
          />
        )}
        <BodySection>
          <NotionRenderer content={data.content} contentHtml={data.contentHtml} />
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

  > article {
    margin: 0 auto;
    max-width: 52rem;
  }
`

const BodySection = styled.div`
  margin-top: 2rem;

  @media (max-width: 768px) {
    margin-top: 1.6rem;
  }
`
