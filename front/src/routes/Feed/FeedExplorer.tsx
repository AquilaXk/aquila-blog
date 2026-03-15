import { useEffect, useMemo, useRef, useState } from "react"
import styled from "@emotion/styled"
import SearchInput from "./SearchInput"
import { FeedHeader } from "./FeedHeader"
import PinnedPosts from "./PostList/PinnedPosts"
import PostList from "./PostList"
import TagList from "./TagList"
import useExplorePostsQuery from "src/hooks/useExplorePostsQuery"
import { useTagsQuery } from "src/hooks/useTagsQuery"
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
  const currentOrder =
    router.query.order === "asc" || router.query.order === "desc"
      ? router.query.order
      : "desc"
  const debouncedQ = useDebouncedValue(q)
  const tagCounts = useTagsQuery()
  const hasTagEntries = useMemo(() => Object.keys(tagCounts).length > 0, [tagCounts])
  const visiblePosts = useExplorePostsQuery({
    kw: debouncedQ,
    tag: currentTag,
    order: currentOrder,
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

  useEffect(() => {
    const handleGlobalShortcut = (event: KeyboardEvent) => {
      const isSearchShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k"
      if (!isSearchShortcut) return

      const target = event.target as HTMLElement | null
      const isTypingContext =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      if (isTypingContext) return

      event.preventDefault()
      searchInputRef.current?.focus()
    }

    window.addEventListener("keydown", handleGlobalShortcut)
    return () => window.removeEventListener("keydown", handleGlobalShortcut)
  }, [])

  return (
    <>
      <PinnedPosts posts={pinnedPosts} />
      <ExplorerCard data-has-tags={hasTagEntries}>
        <div className="filters">
          <SearchInput
            inputRef={searchInputRef}
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          {hasTagEntries && (
            <div className="tags">
              <TagList />
            </div>
          )}
        </div>
        <div className="actions">
          <FeedHeader />
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
  display: grid;
  gap: 0.95rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  padding: 0.9rem;
  min-width: 0;
  overflow: visible;

  .filters {
    display: grid;
    gap: 0.95rem;
    min-width: 0;
  }

  .tags {
    min-width: 0;
  }

  .actions {
    min-width: 0;
    padding-top: 0.4rem;
  }

  &[data-has-tags="true"] .actions {
    border-top: 1px solid ${({ theme }) => theme.colors.gray6};
  }

  @media (max-width: 768px) {
    gap: 0.85rem;
    padding: 0.82rem;
  }

  @media (min-width: 1024px) {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    column-gap: 1.2rem;
    row-gap: 0;

    &[data-has-tags="true"] {
      grid-template-columns: minmax(250px, 320px) minmax(0, 1fr);
    }

    &[data-has-tags="true"] .filters {
      padding-right: 1.2rem;
      border-right: 1px solid ${({ theme }) => theme.colors.gray6};
    }

    .actions {
      border-top: 0;
      padding-top: 0.1rem;
      align-self: start;
    }
  }
`
