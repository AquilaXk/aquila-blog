import React from "react"
import styled from "@emotion/styled"
import PostCard from "src/routes/Feed/PostList/PostCard"
import { TPost } from "src/types"

type Props = {
  posts: TPost[]
}

const PostList: React.FC<Props> = ({ posts }) => {
  return (
    <StyledWrapper>
      {!posts.length && (
        <p className="empty">Nothing! 😺</p>
      )}
      {posts.map((post) => (
        <PostCard key={post.id} data={post} />
      ))}
    </StyledWrapper>
  )
}

export default PostList

const StyledWrapper = styled.div`
  margin: 0.72rem 0 0.35rem;
  display: grid;
  gap: 1.08rem;
  align-items: start;
  grid-auto-rows: 1fr;
  overflow-anchor: none;

  @media (min-width: 860px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.24rem;
  }

  .empty {
    color: ${({ theme }) => theme.colors.gray10};
    grid-column: 1 / -1;
  }
`
