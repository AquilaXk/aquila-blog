import PostCard from "src/routes/Feed/PostList/PostCard"
import React, { memo } from "react"
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
          <PostCard key={post.id} data={post} layout="pinned" />
        ))}
      </div>
    </StyledWrapper>
  )
}

const arePinnedPostsEqual = (prev: Props, next: Props) => {
  if (prev.posts.length !== next.posts.length) return false
  for (let i = 0; i < prev.posts.length; i += 1) {
    const prevPost = prev.posts[i]
    const nextPost = next.posts[i]
    if (prevPost.id !== nextPost.id) return false
    if (prevPost.modifiedTime !== nextPost.modifiedTime) return false
    if (prevPost.likesCount !== nextPost.likesCount) return false
    if (prevPost.commentsCount !== nextPost.commentsCount) return false
    if (prevPost.hitCount !== nextPost.hitCount) return false
    if (prevPost.title !== nextPost.title) return false
    if (prevPost.summary !== nextPost.summary) return false
    if (prevPost.thumbnail !== nextPost.thumbnail) return false
    if (!areStringArraysEqual(prevPost.tags, nextPost.tags)) return false
    if (!areStringArraysEqual(prevPost.category, nextPost.category)) return false
  }
  return true
}

const areStringArraysEqual = (prevValues?: string[], nextValues?: string[]) => {
  if (prevValues === nextValues) return true
  if (!prevValues || !nextValues) return !prevValues?.length && !nextValues?.length
  if (prevValues.length !== nextValues.length) return false

  return prevValues.every((value, index) => value === nextValues[index])
}

export default memo(PinnedPosts, arePinnedPostsEqual)

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
