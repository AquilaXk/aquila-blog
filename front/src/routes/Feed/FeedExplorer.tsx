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
        <SearchInput
          inputRef={searchInputRef}
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
      </ExplorerCard>
      <FeedBody>
        <aside className="tagColumn">
          <TagList />
        </aside>
        <section className="postColumn">
          <PostList
            posts={visiblePosts}
            hasFilter={Boolean(debouncedQ.trim() || currentTag)}
            onClearFilters={handleClearFilters}
          />
        </section>
      </FeedBody>
    </>
  )
}

export default FeedExplorer

const ExplorerCard = styled.section`
  display: grid;
  gap: 0;
  padding: 0;
  min-width: 0;
  min-height: 0;
  height: auto;
  overflow: visible;
  margin-bottom: 0.52rem;

  @media (max-width: 768px) {
    margin-bottom: 0.38rem;
  }
`

const FeedBody = styled.section`
  min-width: 0;
  position: relative;
  overflow: visible;

  .tagColumn {
    min-width: 0;
  }

  .postColumn {
    min-width: 0;
  }

  @media (min-width: 1201px) {
    .tagColumn {
      position: absolute;
      left: calc(-1 * min(188px, max(24px, (100vw - 1200px) * 0.5)));
      top: 0;
      width: 156px;
      min-width: 156px;
      z-index: 1;
    }
  }
`
