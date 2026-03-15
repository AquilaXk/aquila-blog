import { useState } from "react"
import styled from "@emotion/styled"
import SearchInput from "./SearchInput"
import { FeedHeader } from "./FeedHeader"
import PinnedPosts from "./PostList/PinnedPosts"
import PostList from "./PostList"
import TagList from "./TagList"

const FeedExplorer = () => {
  const [q, setQ] = useState("")

  return (
    <>
      <PinnedPosts q={q} />
      <ExplorerCard>
        <SearchInput value={q} onChange={(event) => setQ(event.target.value)} />
        <div className="tags">
          <TagList />
        </div>
        <FeedHeader />
      </ExplorerCard>
      <PostList q={q} />
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
