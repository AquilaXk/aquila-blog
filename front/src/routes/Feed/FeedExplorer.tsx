import { useMemo, useState } from "react"
import styled from "@emotion/styled"
import SearchInput from "./SearchInput"
import { FeedHeader } from "./FeedHeader"
import PinnedPosts from "./PostList/PinnedPosts"
import PostList from "./PostList"
import TagList from "./TagList"
import usePostsQuery from "src/hooks/usePostsQuery"
import { useRouter } from "next/router"
import { createFeedPostIndex, filterPosts } from "./PostList/filterPosts"

const FeedExplorer = () => {
  const [q, setQ] = useState("")
  const router = useRouter()
  const posts = usePostsQuery()

  const currentTag =
    typeof router.query.tag === "string" ? router.query.tag : undefined
  const currentOrder =
    router.query.order === "asc" || router.query.order === "desc"
      ? router.query.order
      : "desc"

  const feedPostIndex = useMemo(() => createFeedPostIndex(posts), [posts])
  const visiblePosts = useMemo(
    () =>
      filterPosts({
        index: feedPostIndex,
        q,
        tag: currentTag,
        order: currentOrder,
      }),
    [feedPostIndex, q, currentTag, currentOrder]
  )
  const pinnedPosts = useMemo(
    () =>
      filterPosts({
        index: feedPostIndex,
        q,
        order: "desc",
      }).filter((post) => post.tags?.includes("Pinned")),
    [feedPostIndex, q]
  )

  return (
    <>
      <PinnedPosts posts={pinnedPosts} />
      <ExplorerCard>
        <SearchInput value={q} onChange={(event) => setQ(event.target.value)} />
        <div className="tags">
          <TagList />
        </div>
        <FeedHeader />
      </ExplorerCard>
      <PostList posts={visiblePosts} />
    </>
  )
}

export default FeedExplorer

const ExplorerCard = styled.section`
  display: grid;
  gap: 0.95rem;
  border-radius: 22px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  padding: 1rem;
  min-width: 0;
  overflow: visible;

  .tags {
    display: block;

    @media (min-width: 1024px) {
      display: none;
    }
  }

  @media (max-width: 768px) {
    gap: 0.85rem;
    padding: 0.9rem;
  }
`
