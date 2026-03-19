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
import AppIcon from "src/components/icons/AppIcon"

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

const TOC_SELECTOR = ".aq-markdown h2, .aq-markdown h3, .aq-markdown h4"

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
  const articleRef = useRef<HTMLElement | null>(null)
  const [likePending, setLikePending] = useState(false)
  const [adminActionPending, setAdminActionPending] = useState(false)
  const [tocItems, setTocItems] = useState<TocItem[]>([])
  const [activeTocId, setActiveTocId] = useState<string>("")
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
  const showStickyToc = tocItems.length >= 2

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
    setActiveTocId(collected[0]?.id ?? "")
  }, [data?.content, data?.id])

  useEffect(() => {
    if (!tocItems.length) return

    const updateActiveToc = () => {
      let current = tocItems[0]?.id || ""
      for (let index = tocItems.length - 1; index >= 0; index -= 1) {
        const item = tocItems[index]
        const node = document.getElementById(item.id)
        if (!node) continue
        const rect = node.getBoundingClientRect()
        if (rect.top <= 140) {
          current = item.id
          break
        }
      }

      setActiveTocId((prev) => (prev === current ? prev : current))
    }

    updateActiveToc()
    window.addEventListener("scroll", updateActiveToc, { passive: true })
    window.addEventListener("resize", updateActiveToc)
    return () => {
      window.removeEventListener("scroll", updateActiveToc)
      window.removeEventListener("resize", updateActiveToc)
    }
  }, [tocItems])

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

  if (!data) return null

  const handleTocNavigate = (id: string) => {
    const heading = document.getElementById(id)
    if (!heading) return
    const targetTop = heading.getBoundingClientRect().top + window.scrollY - 96
    window.scrollTo({ top: targetTop, behavior: "smooth" })
  }

  return (
    <StyledWrapper>
      <div className="detailLayout">
        <aside className="leftRail" aria-hidden={!showFloatingLike}>
          {showFloatingLike ? (
            <div className="leftRailInner">
              <button
                type="button"
                className="floatingLikeButton"
                aria-pressed={engagement.actorHasLiked}
                data-active={engagement.actorHasLiked}
                disabled={likePending}
                onClick={handleToggleLike}
              >
                <AppIcon name={engagement.actorHasLiked ? "heart-filled" : "heart"} />
                <span className="floatingLikeLabel">좋아요</span>
                <strong>{engagement.likesCount}</strong>
              </button>
            </div>
          ) : null}
        </aside>

        <article ref={articleRef}>
          {data.type[0] === "Post" && (
            <PostHeader
              data={data}
              likesCount={engagement.likesCount}
              hitCount={engagement.hitCount}
              actorHasLiked={engagement.actorHasLiked}
              likePending={likePending}
              hideLikeActionOnDesktop={showFloatingLike}
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

        <aside className="rightRail" aria-hidden={!showStickyToc}>
          {showStickyToc ? (
            <nav className="rightRailInner" aria-label="목차">
              <h2>목차</h2>
              <ol>
                {tocItems.map((item) => (
                  <li key={item.id} data-level={item.level}>
                    <button
                      type="button"
                      data-active={activeTocId === item.id}
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
  max-width: 92rem;
  margin: 0 auto;
  min-width: 0;
  padding: 0 0.5rem;

  .detailLayout {
    display: grid;
    grid-template-columns: 4rem minmax(0, 49rem) minmax(0, 12.5rem);
    justify-content: center;
    gap: 0.9rem;
    min-width: 0;
  }

  article {
    margin: 0 auto;
    max-width: 48rem;
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
  }

  .leftRailInner,
  .rightRailInner {
    position: sticky;
    top: 6.2rem;
  }

  .floatingLikeButton {
    width: 100%;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.1rem;
    min-height: 4rem;
    padding: 0.6rem 0.28rem;
    border-radius: 0.95rem;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => (theme.scheme === "dark" ? "rgba(31, 41, 55, 0.7)" : "rgba(248, 250, 252, 0.95)")};
    color: ${({ theme }) => theme.colors.gray12};
    cursor: pointer;
    transition: border-color 0.18s ease, background-color 0.18s ease, color 0.18s ease;

    svg {
      font-size: 0.96rem;
    }

    strong {
      font-size: 0.9rem;
      line-height: 1.1;
      font-weight: 800;
    }

    &[data-active="true"] {
      border-color: ${({ theme }) => theme.colors.red7};

      svg {
        color: ${({ theme }) => theme.colors.red10};
      }
    }

    :disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }
  }

  .floatingLikeLabel {
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  .rightRailInner {
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    border-radius: 0.95rem;
    padding: 0.88rem 0.72rem;
    background: ${({ theme }) => (theme.scheme === "dark" ? "rgba(17, 24, 39, 0.7)" : "rgba(255, 255, 255, 0.94)")};

    h2 {
      margin: 0 0 0.65rem;
      font-size: 0.82rem;
      line-height: 1.2;
      letter-spacing: 0.02em;
      color: ${({ theme }) => theme.colors.gray11};
      font-weight: 750;
    }

    ol {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 0.18rem;
      max-height: calc(100vh - 10.6rem);
      overflow-y: auto;
      overflow-x: hidden;
    }

    li {
      min-width: 0;
    }

    li[data-level="3"] button {
      padding-left: 0.72rem;
      font-size: 0.84rem;
    }

    li[data-level="4"] button {
      padding-left: 1.1rem;
      font-size: 0.8rem;
    }

    button {
      width: 100%;
      text-align: left;
      border: 0;
      border-radius: 0.5rem;
      padding: 0.44rem 0.5rem;
      background: transparent;
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.84rem;
      line-height: 1.24;
      cursor: pointer;
      white-space: normal;
      overflow-wrap: anywhere;
      transition: color 0.15s ease, background-color 0.15s ease;
    }

    button[data-active="true"] {
      color: ${({ theme }) => (theme.scheme === "dark" ? "#7db7ff" : "#0b63d6")};
      background: ${({ theme }) => (theme.scheme === "dark" ? "rgba(59, 130, 246, 0.12)" : "rgba(59, 130, 246, 0.08)")};
      font-weight: 700;
    }
  }

  @media (max-width: 1240px) {
    .detailLayout {
      grid-template-columns: minmax(0, 49rem) minmax(0, 12rem);
      gap: 0.8rem;
    }

    .leftRail {
      display: none;
    }
  }

  @media (max-width: 1080px) {
    max-width: 72rem;
    padding: 0;

    .detailLayout {
      grid-template-columns: minmax(0, 50rem);
      gap: 0;
    }

    .rightRail {
      display: none;
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
