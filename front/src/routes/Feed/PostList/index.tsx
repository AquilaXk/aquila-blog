import { useRouter } from "next/router"
import React, { useMemo } from "react"
import styled from "@emotion/styled"
import PostCard from "src/routes/Feed/PostList/PostCard"
import { DEFAULT_CATEGORY } from "src/constants"
import usePostsQuery from "src/hooks/usePostsQuery"
import { normalizeCategoryValue } from "src/libs/utils"
import { filterPosts } from "./filterPosts"

type Props = {
  q: string
}

const PostList: React.FC<Props> = ({ q }) => {
  const router = useRouter()
  const data = usePostsQuery()

  const currentTag =
    typeof router.query.tag === "string" ? router.query.tag : undefined
  const currentCategory =
    typeof router.query.category === "string"
      ? normalizeCategoryValue(router.query.category)
      : DEFAULT_CATEGORY
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
        category: currentCategory,
        order: currentOrder,
      }),
    [data, q, currentTag, currentCategory, currentOrder]
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
  margin: 0.5rem 0;
  overflow-anchor: none;

  .empty {
    color: ${({ theme }) => theme.colors.gray10};
  }
`
