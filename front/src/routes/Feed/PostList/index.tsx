import React, { RefObject, memo } from "react"
import styled from "@emotion/styled"
import Link from "next/link"
import PostCard from "src/routes/Feed/PostList/PostCard"
import AppIcon from "src/components/icons/AppIcon"
import useAuthSession from "src/hooks/useAuthSession"
import { TPost } from "src/types"

type Props = {
  posts: TPost[]
  hasFilter?: boolean
  hasExternalResults?: boolean
  onClearFilters?: () => void
  isInitialLoading?: boolean
  isFetchingNextPage?: boolean
  hasNextPage?: boolean
  onLoadMore?: () => void
  loadMoreTriggerRef?: RefObject<HTMLDivElement>
}

type EmptyPostStateProps = {
  hasFilter: boolean
  onClearFilters?: () => void
}

const INITIAL_SKELETON_KEYS = Array.from({ length: 6 }, (_, index) => `skeleton-initial-${index}`)
const NEXT_SKELETON_KEYS = Array.from({ length: 2 }, (_, index) => `skeleton-next-${index}`)

const EmptyPostStateInner: React.FC<EmptyPostStateProps> = ({ hasFilter, onClearFilters }) => {
  const { me, authStatus } = useAuthSession()
  const isAdmin = authStatus === "authenticated" && Boolean(me?.isAdmin)

  return (
    <section className="emptyState" aria-live="polite">
      <div className="emptyIcon" aria-hidden="true">
        <AppIcon name={hasFilter ? "search" : "edit"} />
      </div>
      <h3>{hasFilter ? "검색 결과가 없습니다." : "아직 게시글이 없습니다."}</h3>
      <p>{hasFilter ? "다른 검색어를 입력해보세요." : "첫 글을 발행해보세요."}</p>
      <div className="emptyActions">
        {hasFilter ? (
          <button type="button" onClick={onClearFilters} className="actionBtn actionBtn--primary">
            <AppIcon name="search" />
            초기화
          </button>
        ) : (
          <Link href={isAdmin ? "/admin/posts/new" : "/admin"} className="actionBtn actionBtn--primary">
            <AppIcon name="edit" />
            글 작성
          </Link>
        )}
        {!hasFilter && (
          <Link href="/" className="actionBtn">
            <AppIcon name="service" />
            새로고침
          </Link>
        )}
      </div>
    </section>
  )
}

const EmptyPostState = memo(EmptyPostStateInner)
EmptyPostState.displayName = "EmptyPostState"

const PostList: React.FC<Props> = ({
  posts,
  hasFilter = false,
  hasExternalResults = false,
  onClearFilters,
  isInitialLoading = false,
  isFetchingNextPage = false,
  hasNextPage = false,
  onLoadMore,
  loadMoreTriggerRef,
}) => {
  const showEmptyState = !isInitialLoading && !posts.length && !hasExternalResults

  return (
    <StyledWrapper>
      {isInitialLoading && (
        <div className="skeletonGrid" aria-hidden="true">
          {INITIAL_SKELETON_KEYS.map((key) => (
            <article key={key} className="skeletonCard" />
          ))}
        </div>
      )}
      {showEmptyState && <EmptyPostState hasFilter={hasFilter} onClearFilters={onClearFilters} />}
      {posts.map((post) => (
        <PostCard key={post.id} data={post} />
      ))}
      {(hasNextPage || isFetchingNextPage) && (
        <section className="loadMoreArea">
          <div ref={loadMoreTriggerRef} className="loadMoreTrigger" aria-hidden="true" />
          {hasNextPage && (
            <button
              type="button"
              className="loadMoreButton"
              onClick={onLoadMore}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? "불러오는 중..." : "더보기"}
            </button>
          )}
          {isFetchingNextPage && (
            <div className="skeletonGrid" aria-hidden="true">
              {NEXT_SKELETON_KEYS.map((key) => (
                <article key={key} className="skeletonCard" />
              ))}
            </div>
          )}
        </section>
      )}
    </StyledWrapper>
  )
}

const arePostsEqual = (prevPosts: TPost[], nextPosts: TPost[]) => {
  if (prevPosts === nextPosts) return true
  if (prevPosts.length !== nextPosts.length) return false

  for (let i = 0; i < prevPosts.length; i += 1) {
    const prevPost = prevPosts[i]
    const nextPost = nextPosts[i]
    if (prevPost.id !== nextPost.id) return false
    if (prevPost.modifiedTime !== nextPost.modifiedTime) return false
    if (prevPost.likesCount !== nextPost.likesCount) return false
    if (prevPost.commentsCount !== nextPost.commentsCount) return false
    if (prevPost.title !== nextPost.title) return false
    if (prevPost.summary !== nextPost.summary) return false
    if (prevPost.thumbnail !== nextPost.thumbnail) return false
  }

  return true
}

const arePostListPropsEqual = (prev: Props, next: Props) => {
  if (!arePostsEqual(prev.posts, next.posts)) return false
  if (prev.hasFilter !== next.hasFilter) return false
  if (prev.hasExternalResults !== next.hasExternalResults) return false
  if (prev.isInitialLoading !== next.isInitialLoading) return false
  if (prev.isFetchingNextPage !== next.isFetchingNextPage) return false
  if (prev.hasNextPage !== next.hasNextPage) return false
  if (prev.onClearFilters !== next.onClearFilters) return false
  if (prev.onLoadMore !== next.onLoadMore) return false
  if (prev.loadMoreTriggerRef !== next.loadMoreTriggerRef) return false
  return true
}

export default memo(PostList, arePostListPropsEqual)

const StyledWrapper = styled.div`
  margin: 0.9rem 0 0.35rem;
  display: grid;
  gap: 1rem;
  align-items: start;
  grid-auto-rows: 1fr;
  overflow-anchor: none;

  @media (min-width: 768px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 2rem;
  }

  .emptyState {
    grid-column: 1 / -1;
    border-radius: 0;
    border: 0;
    border-top: 1px solid ${({ theme }) => theme.colors.gray6};
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
    padding: 1rem 0;
    min-height: 10rem;
    display: grid;
    align-content: center;
    justify-items: center;
    text-align: center;
    gap: 0.5rem;

    .emptyIcon {
      width: 2.1rem;
      height: 2.1rem;
      border-radius: 8px;
      border: 1px solid ${({ theme }) => theme.colors.gray6};
      background: transparent;
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 1.08rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    h3 {
      margin: 0;
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    p {
      margin: 0;
      color: ${({ theme }) => theme.colors.gray10};
      line-height: 1.6;
      font-size: 0.94rem;
    }

    .emptyActions {
      margin-top: 0.35rem;
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      justify-content: center;
    }

    .actionBtn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.35rem;
      min-height: 36px;
      padding: 0 0.82rem;
      border-radius: 8px;
      border: 1px solid ${({ theme }) => theme.colors.gray6};
      background: transparent;
      color: ${({ theme }) => theme.colors.gray11};
      font-size: 0.84rem;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
    }

    .actionBtn--primary {
      border-color: ${({ theme }) => theme.colors.blue7};
      color: ${({ theme }) => theme.colors.blue11};
    }
  }

  .loadMoreArea {
    grid-column: 1 / -1;
    display: grid;
    justify-items: center;
    gap: 0.8rem;
    padding-top: 0.35rem;
  }

  .loadMoreTrigger {
    width: 100%;
    height: 1px;
  }

  .loadMoreButton {
    min-height: 36px;
    padding: 0 0.9rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.86rem;
    font-weight: 700;
    cursor: pointer;
    transition: opacity 0.16s ease;

    &:disabled {
      cursor: wait;
      opacity: 0.72;
    }
  }

  .skeletonGrid {
    width: 100%;
    display: grid;
    gap: 1rem;
    align-items: start;
    grid-auto-rows: 1fr;

    @media (min-width: 768px) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 2rem;
    }
  }

  .skeletonCard {
    min-height: 18.5rem;
    border-radius: 15px;
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    background:
      linear-gradient(
        90deg,
        ${({ theme }) => theme.colors.gray2} 0%,
        ${({ theme }) => theme.colors.gray3} 50%,
        ${({ theme }) => theme.colors.gray2} 100%
      );
    background-size: 240% 100%;
    animation: feed-card-skeleton-pulse 1.1s ease-in-out infinite;
  }

  @keyframes feed-card-skeleton-pulse {
    0% {
      background-position: 100% 0;
    }
    100% {
      background-position: 0 0;
    }
  }
`
