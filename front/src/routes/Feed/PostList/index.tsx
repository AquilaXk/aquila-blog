import React from "react"
import styled from "@emotion/styled"
import Link from "next/link"
import PostCard from "src/routes/Feed/PostList/PostCard"
import AppIcon from "src/components/icons/AppIcon"
import useAuthSession from "src/hooks/useAuthSession"
import { TPost } from "src/types"

type Props = {
  posts: TPost[]
  hasFilter?: boolean
  onClearFilters?: () => void
}

const PostList: React.FC<Props> = ({ posts, hasFilter = false, onClearFilters }) => {
  const { me, authStatus } = useAuthSession()
  const isAdmin = authStatus === "authenticated" && Boolean(me?.isAdmin)

  return (
    <StyledWrapper>
      {!posts.length && (
        <section className="emptyState" aria-live="polite">
          <div className="emptyIcon" aria-hidden="true">
            <AppIcon name={hasFilter ? "search" : "edit"} />
          </div>
          <h3>{hasFilter ? "검색 결과가 없습니다." : "아직 게시글이 없습니다."}</h3>
          <p>
            {hasFilter
              ? "다른 검색어를 입력해보세요."
              : "첫 글을 발행해보세요."}
          </p>
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
      )}
      {posts.map((post) => (
        <PostCard key={post.id} data={post} />
      ))}
    </StyledWrapper>
  )
}

export default PostList

const StyledWrapper = styled.div`
  margin: 0.9rem 0 0.35rem;
  display: grid;
  gap: 1.2rem;
  align-items: start;
  grid-auto-rows: 1fr;
  overflow-anchor: none;

  @media (min-width: 860px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.36rem;
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
`
