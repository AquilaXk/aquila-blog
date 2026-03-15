import { useRouter } from "next/router"
import React, { useMemo } from "react"
import styled from "@emotion/styled"
import PostCard from "src/routes/Feed/PostList/PostCard"
import usePostsQuery from "src/hooks/usePostsQuery"
import { filterPosts } from "./filterPosts"

type Props = {
  q: string
}

const PostList: React.FC<Props> = ({ q }) => {
  const router = useRouter()
  const data = usePostsQuery()

  const currentTag =
    typeof router.query.tag === "string" ? router.query.tag : undefined
  const currentOrder =
    router.query.order === "asc" || router.query.order === "desc"
      ? router.query.order
      : "desc"

  const filteredPosts = useMemo(
    () =>
      filterPosts({
        posts: data,
        q,
        tag: currentTag,
        order: currentOrder,
      }),
    [data, q, currentTag, currentOrder]
  )

  return (
    <StyledWrapper>
      {!filteredPosts.length && (
        <p className="empty">Nothing! 😺</p>
      )}
      {filteredPosts.map((post) => (
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
