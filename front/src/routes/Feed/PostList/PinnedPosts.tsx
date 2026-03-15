import PostCard from "src/routes/Feed/PostList/PostCard"
import React from "react"
import styled from "@emotion/styled"
import { TPost } from "src/types"

type Props = {
  posts: TPost[]
}

const PinnedPosts: React.FC<Props> = ({ posts }) => {
  if (posts.length === 0) return null

  return (
    <StyledWrapper>
      <div className="wrapper">
        <div className="header">📌 Pinned Posts</div>
      </div>
      <div className="my-2">
        {posts.map((post) => (
          <PostCard key={post.slug} data={post} />
        ))}
      </div>
    </StyledWrapper>
  )
}

export default PinnedPosts

const StyledWrapper = styled.div`
  position: relative;
  .wrapper {
    display: flex;
    margin-bottom: 1rem;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  }
  .header {
    display: flex;
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
    gap: 0.25rem;
    align-items: center;
    font-size: 1.25rem;
    line-height: 1.75rem;
    font-weight: 700;
    cursor: pointer;
  }
`
