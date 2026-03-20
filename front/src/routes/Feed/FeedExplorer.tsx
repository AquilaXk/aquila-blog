import { useEffect, useMemo, useRef, useState } from "react"
import styled from "@emotion/styled"
import SearchInput from "./SearchInput"
import PinnedPosts from "./PostList/PinnedPosts"
import PostList from "./PostList"
import TagList from "./TagList"
import useExplorePostsQuery from "src/hooks/useExplorePostsQuery"
import { useRouter } from "next/router"
import { replaceShallowRoutePreservingScroll } from "src/libs/router"

const useDebouncedValue = (value: string, delayMs = 220) => {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}

const FeedExplorer = () => {
  const [q, setQ] = useState("")
  const router = useRouter()
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const currentTag =
    typeof router.query.tag === "string" ? router.query.tag : undefined
  const debouncedQ = useDebouncedValue(q)
  const visiblePosts = useExplorePostsQuery({
    kw: debouncedQ,
    tag: currentTag,
    page: 1,
    pageSize: 30,
  })

  const pinnedPosts = useMemo(
    () => visiblePosts.filter((post) => post.tags?.includes("Pinned")),
    [visiblePosts]
  )

  const handleClearFilters = () => {
    setQ("")
    if (!currentTag) return
    const { category: _deprecatedCategory, ...restQuery } = router.query
    replaceShallowRoutePreservingScroll(router, {
      pathname: "/",
      query: {
        ...restQuery,
        tag: undefined,
      },
    })
  }

  return (
    <>
      <PinnedPosts posts={pinnedPosts} />
      <ExplorerCard>
        <div className="filters">
          <SearchInput
            inputRef={searchInputRef}
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <div className="tags">
            <TagList />
          </div>
        </div>
      </ExplorerCard>
      <PostList
        posts={visiblePosts}
        hasFilter={Boolean(debouncedQ.trim() || currentTag)}
        onClearFilters={handleClearFilters}
      />
    </>
  )
}

export default FeedExplorer

const ExplorerCard = styled.section`
  container-type: inline-size;
  display: grid;
  gap: 1rem;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 16px;
  background: ${({ theme }) => theme.colors.gray2};
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.24);
  padding: 1rem;
  min-width: 0;
  overflow: visible;

  .filters {
    display: grid;
    gap: 1rem;
    min-width: 0;
    padding-bottom: 0;
    border-bottom: 0;
  }

  .tags {
    min-width: 0;
  }

  @media (max-width: 768px) {
    border-radius: 14px;
    gap: 0.85rem;
    padding: 0.8rem;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.2);
  }
`
