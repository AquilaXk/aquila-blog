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
const RELATED_POSTS_LIMIT = 4
const RELATED_AUTHOR_FETCH_PAGE_SIZE = 30
const RELATED_AUTHOR_FETCH_MAX_PAGES = 3

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
  const [showDetailedToc, setShowDetailedToc] = useState(false)
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

    const resolveActiveId = (items: TocItem[]) => {
      let current = items[0]?.id || ""
      for (let index = items.length - 1; index >= 0; index -= 1) {
        const item = items[index]
        const node = document.getElementById(item.id)
        if (!node) continue
        const rect = node.getBoundingClientRect()
        if (rect.top <= 140) {
          current = item.id
          break
        }
      }
      return current
    }

    const updateActiveToc = () => {
      const visibleIdSet = new Set(visibleTocItems.map((item) => item.id))
      let current = resolveActiveId(tocItems)
      if (!visibleIdSet.has(current)) {
        current = resolveActiveId(visibleTocItems)
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
  }, [tocItems, visibleTocItems])

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
              <div className="floatingLikeCluster">
                <button
                  type="button"
                  className="floatingLikeButton"
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
          {data.type[0] === "Post" && relatedByTagPosts.length > 0 && (
            <RelatedSection aria-label="연관 글">
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
                      {post.summary && <p>{post.summary}</p>}
                      <span>{formatDate(post.date?.start_date || post.createdTime)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </RelatedSection>
          )}
          {data.type[0] === "Post" && relatedByAuthorPosts.length > 0 && (
            <RelatedSection aria-label="같은 작성자 글">
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
                      {post.summary && <p>{post.summary}</p>}
                      <span>{formatDate(post.date?.start_date || post.createdTime)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </RelatedSection>
          )}
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
              <div className="rightRailHead">
                <h2 className="rightRailTitle">목차</h2>
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
    grid-template-columns: 3.8rem minmax(0, 49rem) minmax(0, 13.25rem);
    justify-content: center;
    gap: 0.85rem;
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
    width: 3rem;
    height: 3rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => (theme.scheme === "dark" ? "rgba(15, 23, 42, 0.5)" : "rgba(255, 255, 255, 0.95)")};
    color: ${({ theme }) => theme.colors.gray12};
    cursor: pointer;
    transition: border-color 0.18s ease, background-color 0.18s ease, color 0.18s ease;

    svg {
      font-size: 1.02rem;
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

  .floatingLikeCluster {
    display: grid;
    justify-items: center;
    row-gap: 0.34rem;
  }

  .floatingLikeCount {
    font-size: 0.78rem;
    line-height: 1;
    font-weight: 700;
    color: ${({ theme }) => theme.colors.gray10};
  }

  .rightRailInner {
    position: sticky;
    border-left: 2px solid ${({ theme }) => (theme.scheme === "dark" ? "rgba(148, 163, 184, 0.34)" : theme.colors.gray6)};
    padding: 0.18rem 0 0.18rem 0.82rem;
    background: transparent;

    .rightRailHead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.4rem;
      margin-bottom: 0.28rem;
    }

    .rightRailTitle {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      border: 0;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
    }

    .tocDepthToggle {
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.71rem;
      font-weight: 700;
      line-height: 1;
      padding: 0.18rem 0.36rem;
      cursor: pointer;

      &:hover {
        color: ${({ theme }) => theme.colors.gray12};
        text-decoration: underline;
        text-underline-offset: 2px;
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
      border-radius: 0;
      min-height: 35px;
      padding: 0.32rem 0;
      background: transparent;
      color: ${({ theme }) => (theme.scheme === "dark" ? "rgba(148, 163, 184, 0.92)" : theme.colors.gray10)};
      font-size: 0.84rem;
      line-height: 1.45;
      cursor: pointer;
      white-space: normal;
      overflow-wrap: anywhere;
      position: relative;
      transition: color 0.15s ease;
    }

    button::before {
      content: "";
      position: absolute;
      left: -0.82rem;
      top: 0.24rem;
      bottom: 0.24rem;
      width: 2px;
      opacity: 0;
      background: ${({ theme }) => (theme.scheme === "dark" ? "#e2e8f0" : "#111827")};
      transition: opacity 0.15s ease;
    }

    button[data-active="true"] {
      color: ${({ theme }) => theme.colors.gray12};
      font-weight: 700;
    }

    button[data-active="true"]::before {
      opacity: 1;
    }
  }

  @media (max-width: 1240px) {
    .detailLayout {
      grid-template-columns: minmax(0, 49rem) minmax(0, 12.5rem);
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

const RelatedSection = styled.section`
  margin-top: 0.52rem;
  padding-top: 0.88rem;
  border-top: 1px solid ${({ theme }) => theme.colors.gray6};
  display: grid;
  gap: 0.72rem;

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
    background: ${({ theme }) => theme.colors.gray2};
    text-decoration: none;
    transition: border-color 0.14s ease-in, background-color 0.14s ease-in;

    &:hover {
      border-color: ${({ theme }) => theme.colors.gray8};
      background: ${({ theme }) => theme.colors.gray3};
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
