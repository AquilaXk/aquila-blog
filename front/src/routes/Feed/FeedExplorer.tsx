import { useState } from "react"
import styled from "@emotion/styled"
import SearchInput from "./SearchInput"
import { FeedHeader } from "./FeedHeader"
import PinnedPosts from "./PostList/PinnedPosts"
import PostList from "./PostList"
import dynamic from "next/dynamic"

const MobileTagListIsland = dynamic(() => import("./TagList"), {
  ssr: false,
  loading: () => <ControlPlaceholder className="tagPlaceholder" aria-hidden="true" />,
})

const FeedExplorer = () => {
  const [q, setQ] = useState("")

  return (
    <>
      <PinnedPosts q={q} />
      <ExplorerCard>
        <SearchInput value={q} onChange={(event) => setQ(event.target.value)} />
        <div className="tags">
          <MobileTagListIsland />
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

const ControlPlaceholder = styled.div`
  min-height: 48px;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background:
    linear-gradient(90deg, ${({ theme }) => theme.colors.gray2}, ${({ theme }) => theme.colors.gray3}, ${({ theme }) => theme.colors.gray2});
  background-size: 200% 100%;
  animation: shimmer 1.2s linear infinite;

  &.tagPlaceholder {
    min-height: 42px;
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`
