import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { InfiniteData, useQueryClient } from "@tanstack/react-query"
import SearchInput from "./SearchInput"
import PinnedPosts from "./PostList/PinnedPosts"
import PostList from "./PostList"
import TagList from "./TagList"
import useExplorePostsQuery from "src/hooks/useExplorePostsQuery"
import { useRouter } from "next/router"
import { replaceShallowRoutePreservingScroll } from "src/libs/router"
import { FEED_EXPLORE_PAGE_SIZE } from "src/constants/feed"
import { queryKey } from "src/constants/queryKey"
import { type ExplorePostsPage } from "src/apis/backend/posts"
import type { TPost } from "src/types"
import { normalizeKeywordQuery, normalizeOptionalTagQuery, normalizeTagQuery } from "src/libs/query/normalize"
import { ExplorerCard, FeedBody, FilterContextBar } from "./FeedExplorer.styles"
import {
  FEED_EXPLORER_ORDER,
  FEED_EXPLORER_SNAPSHOT_MAX_BYTES,
  getFeedExplorerRestoreKey,
  getFeedExplorerSnapshotKey,
  parseFeedExplorerRestoreSnapshot,
  parseFeedExplorerRestoreState,
  pruneFeedExplorerStateStorage,
  resolveRestorePageCap,
  resolveSnapshotPageCap,
  scheduleIdleRevalidate,
  toFeedExplorerInfiniteQueryKey,
  toPersistFingerprint,
  toRestoredPageParams,
  toRestoredPage,
  toSnapshotPageParam,
  toSnapshotPage,
  useDebouncedValue,
  type FeedExplorerRestoreSnapshot,
  type FeedExplorerRestoreState,
  type FeedExplorerSnapshotPage,
  type FeedExplorerSnapshotPageParam,
} from "./FeedExplorerRestoreModel"

const LOAD_MORE_THROTTLE_MS = 800
const LOAD_MORE_OBSERVER_THROTTLE_MS = 180
type FeedSortMode = "latest" | "views" | "likes"
const FEED_SORT_OPTIONS: Array<{ value: FeedSortMode; label: string }> = [
  { value: "latest", label: "최신순" },
  { value: "views", label: "조회순" },
  { value: "likes", label: "좋아요순" },
]

type FeedExplorerProps = {
  initialBootstrapDegraded?: boolean
}

const getPostTime = (post: TPost) => {
  const value = post.date?.start_date || post.createdTime
  const time = value ? new Date(value).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

const compareLatestPosts = (a: TPost, b: TPost) => getPostTime(b) - getPostTime(a)

const sortFeedPosts = (posts: TPost[], sortMode: FeedSortMode) => {
  if (sortMode === "latest") return posts

  return [...posts].sort((a, b) => {
    const primary =
      sortMode === "views"
        ? (b.hitCount ?? 0) - (a.hitCount ?? 0)
        : (b.likesCount ?? 0) - (a.likesCount ?? 0)
    return primary || compareLatestPosts(a, b)
  })
}

const FeedExplorer: React.FC<FeedExplorerProps> = ({ initialBootstrapDegraded = false }) => {
  const queryClient = useQueryClient()
  const [q, setQ] = useState("")
  const [sortMode, setSortMode] = useState<FeedSortMode>("latest")
  const [sortOpen, setSortOpen] = useState(false)
  const [isComposing, setIsComposing] = useState(false)
  const router = useRouter()
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const sortMenuRef = useRef<HTMLDivElement | null>(null)
  const restoreStateRef = useRef<FeedExplorerRestoreState | null>(null)
  const restoreQueryPagesRef = useRef<FeedExplorerSnapshotPage[] | null>(null)
  const restoreQueryPageParamsRef = useRef<FeedExplorerSnapshotPageParam[] | null>(null)
  const hasHydratedQuerySnapshotRef = useRef(false)
  const hasAppliedRestoreSnapshotRef = useRef(false)
  const hasScheduledIdleRevalidateRef = useRef(false)
  const restoreTargetPagesRef = useRef(1)
  const hasInitializedRestoreRef = useRef(false)
  const hasRestoredScrollRef = useRef(false)
  const lastPersistFingerprintRef = useRef("")
  const cancelIdlePersistRef = useRef<(() => void) | null>(null)
  const restoreSnapshotRef = useRef({
    q: "",
    tag: "",
    loadedPagesCount: 1,
  })

  const currentTag = normalizeOptionalTagQuery(
    typeof router.query.tag === "string" ? router.query.tag : undefined
  )
  const restoreStorageKey = useMemo(
    () => getFeedExplorerRestoreKey(currentTag || "", FEED_EXPLORE_PAGE_SIZE, FEED_EXPLORER_ORDER),
    [currentTag]
  )
  const restoreSnapshotStorageKey = useMemo(
    () => getFeedExplorerSnapshotKey(restoreStorageKey),
    [restoreStorageKey]
  )
  const debouncedQ = useDebouncedValue(q, isComposing)
  const normalizedQuery = normalizeKeywordQuery(debouncedQ)
  const {
    pinnedPosts,
    regularPosts,
    loadedPagesCount,
    hasNextPage,
    isInitialLoading,
    isInitialLoadError,
    hasInitialLoadSucceeded,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
    refetchInitialPage,
  } = useExplorePostsQuery({
    kw: debouncedQ,
    tag: currentTag,
    pageSize: FEED_EXPLORE_PAGE_SIZE,
    order: FEED_EXPLORER_ORDER,
    enabled: router.isReady,
  })
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null)
  const lastLoadMoreAtRef = useRef(0)
  const lastObserverTriggerAtRef = useRef(0)
  const hasNextPageRef = useRef(hasNextPage)
  const isFetchingNextPageRef = useRef(isFetchingNextPage)
  const isFetchNextPageErrorRef = useRef(isFetchNextPageError)

  useEffect(() => {
    hasNextPageRef.current = hasNextPage
  }, [hasNextPage])

  useEffect(() => {
    isFetchingNextPageRef.current = isFetchingNextPage
  }, [isFetchingNextPage])

  useEffect(() => {
    isFetchNextPageErrorRef.current = isFetchNextPageError
  }, [isFetchNextPageError])

  useEffect(() => {
    if (!sortOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (sortMenuRef.current?.contains(event.target as Node)) return
      setSortOpen(false)
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [sortOpen])

  useEffect(() => {
    restoreSnapshotRef.current = {
      q,
      tag: currentTag || "",
      loadedPagesCount: Math.max(1, loadedPagesCount),
    }
  }, [currentTag, loadedPagesCount, q])

  useEffect(() => {
    if (!router.isReady || hasInitializedRestoreRef.current) return
    if (typeof window === "undefined") return

    hasInitializedRestoreRef.current = true
    pruneFeedExplorerStateStorage(window.sessionStorage)

    const restored = parseFeedExplorerRestoreState(
      window.sessionStorage.getItem(restoreStorageKey)
    )
    if (!restored) return

    const activeTag = currentTag || ""
    if (restored.tag !== activeTag) return

    restoreStateRef.current = restored
    restoreTargetPagesRef.current = Math.min(
      resolveRestorePageCap(),
      Math.max(1, restored.loadedPages)
    )
    if (restored.q.length > 0) {
      setQ(restored.q)
    }

    const restoredSnapshot = parseFeedExplorerRestoreSnapshot(
      window.sessionStorage.getItem(restoreSnapshotStorageKey)
    )
    if (restoredSnapshot?.pages?.length) {
      const restoredPages = restoredSnapshot.pages.slice(0, resolveSnapshotPageCap())
      const restoredPageParams = toRestoredPageParams({
        ...restoredSnapshot,
        pages: restoredPages,
        pageParams: restoredSnapshot.pageParams?.slice(0, restoredPages.length),
      })
      restoreQueryPagesRef.current = restoredPages
      restoreQueryPageParamsRef.current = restoredPageParams
    }

  }, [currentTag, q, restoreSnapshotStorageKey, restoreStorageKey, router.isReady])

  useEffect(() => {
    if (hasHydratedQuerySnapshotRef.current) return

    const restored = restoreStateRef.current
    const restoredPages = restoreQueryPagesRef.current
    if (!restored || !restoredPages || restoredPages.length === 0) return

    const activeTag = currentTag || ""
    if (restored.tag !== activeTag) return
    if (restored.q !== normalizedQuery) return

    const restoreQueryKey = toFeedExplorerInfiniteQueryKey({
      kw: normalizedQuery,
      tag: activeTag,
      pageSize: FEED_EXPLORE_PAGE_SIZE,
      order: FEED_EXPLORER_ORDER,
    })

    const existingPages = queryClient.getQueryData<InfiniteData<ExplorePostsPage>>(restoreQueryKey)?.pages
    if (existingPages && existingPages.length > 0) {
      hasHydratedQuerySnapshotRef.current = true
      return
    }

    queryClient.setQueryData<InfiniteData<ExplorePostsPage>>(restoreQueryKey, {
      pages: restoredPages.map(toRestoredPage),
      pageParams:
        restoreQueryPageParamsRef.current?.length === restoredPages.length
          ? restoreQueryPageParamsRef.current
          : toRestoredPageParams({ savedAt: restored.savedAt, pages: restoredPages }),
    })
    hasHydratedQuerySnapshotRef.current = true
    hasAppliedRestoreSnapshotRef.current = true
  }, [currentTag, normalizedQuery, queryClient])

  useEffect(() => {
    if (hasScheduledIdleRevalidateRef.current) return
    if (!hasAppliedRestoreSnapshotRef.current) return
    if (!restoreQueryPagesRef.current?.length) return

    const restored = restoreStateRef.current
    if (!restored) return

    const activeTag = currentTag || ""
    if (restored.tag !== activeTag) return
    if (restored.q !== normalizedQuery) return

    const restoreQueryKey = toFeedExplorerInfiniteQueryKey({
      kw: normalizedQuery,
      tag: activeTag,
      pageSize: FEED_EXPLORE_PAGE_SIZE,
      order: FEED_EXPLORER_ORDER,
    })

    hasScheduledIdleRevalidateRef.current = true
    return scheduleIdleRevalidate(() => {
      void queryClient.invalidateQueries({
        queryKey: restoreQueryKey,
        exact: true,
        refetchType: "active",
      })
    })
  }, [currentTag, normalizedQuery, queryClient])

  const persistFeedExplorerState = useCallback(() => {
    if (typeof window === "undefined") return

    const snapshot = restoreSnapshotRef.current
    const normalizedSnapshotTag = normalizeTagQuery(snapshot.tag)
    const normalizedSnapshotQuery = normalizeKeywordQuery(snapshot.q)
    const restoreKey = getFeedExplorerRestoreKey(
      normalizedSnapshotTag,
      FEED_EXPLORE_PAGE_SIZE,
      FEED_EXPLORER_ORDER
    )
    const snapshotKey = getFeedExplorerSnapshotKey(restoreKey)
    const state: FeedExplorerRestoreState = {
      q: normalizedSnapshotQuery,
      tag: normalizedSnapshotTag,
      scrollY: Math.max(0, Math.trunc(window.scrollY || 0)),
      loadedPages: Math.max(1, snapshot.loadedPagesCount),
      savedAt: Date.now(),
    }
    const persistFingerprint = toPersistFingerprint(state)
    if (lastPersistFingerprintRef.current === persistFingerprint) {
      return
    }

    try {
      window.sessionStorage.setItem(restoreKey, JSON.stringify(state))
      lastPersistFingerprintRef.current = persistFingerprint

      const feedQueryKey = toFeedExplorerInfiniteQueryKey({
        kw: normalizedSnapshotQuery,
        tag: normalizedSnapshotTag,
        pageSize: FEED_EXPLORE_PAGE_SIZE,
        order: FEED_EXPLORER_ORDER,
      })
      const queryData = queryClient.getQueryData<InfiniteData<ExplorePostsPage>>(feedQueryKey)
      const pages = queryData?.pages ?? []

      if (pages.length > 0) {
        const snapshotPages = pages.slice(0, resolveSnapshotPageCap()).map(toSnapshotPage)
        const snapshotPageParams = (queryData?.pageParams ?? [])
          .slice(0, snapshotPages.length)
          .map(toSnapshotPageParam)
        const snapshotPayload: FeedExplorerRestoreSnapshot = {
          savedAt: state.savedAt,
          pages: snapshotPages,
          ...(snapshotPageParams.length === snapshotPages.length ? { pageParams: snapshotPageParams } : {}),
        }
        const snapshotJson = JSON.stringify(snapshotPayload)
        if (snapshotJson.length <= FEED_EXPLORER_SNAPSHOT_MAX_BYTES) {
          window.sessionStorage.setItem(snapshotKey, snapshotJson)
        } else {
          window.sessionStorage.removeItem(snapshotKey)
        }
      } else {
        window.sessionStorage.removeItem(snapshotKey)
      }
      pruneFeedExplorerStateStorage(window.sessionStorage)
    } catch {
      // ignore sessionStorage quota/permission errors
    }
  }, [queryClient])

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return

    const flushPersist = () => {
      if (cancelIdlePersistRef.current) {
        cancelIdlePersistRef.current()
        cancelIdlePersistRef.current = null
      }
      persistFeedExplorerState()
    }
    const scheduleIdlePersist = () => {
      if (cancelIdlePersistRef.current) return
      cancelIdlePersistRef.current = scheduleIdleRevalidate(() => {
        cancelIdlePersistRef.current = null
        persistFeedExplorerState()
      })
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushPersist()
      }
    }

    window.addEventListener("pagehide", flushPersist)
    window.addEventListener("beforeunload", flushPersist)
    document.addEventListener("visibilitychange", handleVisibilityChange)
    router.events.on("routeChangeStart", scheduleIdlePersist)

    return () => {
      if (cancelIdlePersistRef.current) {
        cancelIdlePersistRef.current()
        cancelIdlePersistRef.current = null
      }
      window.removeEventListener("pagehide", flushPersist)
      window.removeEventListener("beforeunload", flushPersist)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      router.events.off("routeChangeStart", scheduleIdlePersist)
    }
  }, [persistFeedExplorerState, router.events])

  useEffect(() => {
    const restoreState = restoreStateRef.current
    if (!restoreState || hasRestoredScrollRef.current) return

    const targetPages = restoreTargetPagesRef.current
    if (loadedPagesCount < targetPages && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage()
      return
    }

    if (isInitialLoading) return

    hasRestoredScrollRef.current = true
    window.requestAnimationFrame(() => {
      window.scrollTo({
        top: restoreState.scrollY,
        behavior: "auto",
      })
    })
  }, [
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isInitialLoading,
    loadedPagesCount,
  ])

  const handleLoadMore = useCallback(() => {
    if (isFetchNextPageErrorRef.current) return
    if (!hasNextPageRef.current || isFetchingNextPageRef.current) return
    const now = Date.now()
    if (now - lastLoadMoreAtRef.current < LOAD_MORE_THROTTLE_MS) return
    lastLoadMoreAtRef.current = now
    void fetchNextPage()
  }, [fetchNextPage])
  const handleRetryLoadMore = useCallback(() => {
    if (!hasNextPageRef.current || isFetchingNextPageRef.current) return
    lastLoadMoreAtRef.current = 0
    void fetchNextPage()
  }, [fetchNextPage])
  const handleLoadMoreRef = useRef(handleLoadMore)

  useEffect(() => {
    handleLoadMoreRef.current = handleLoadMore
  }, [handleLoadMore])

  useEffect(() => {
    const target = loadMoreTriggerRef.current
    if (!target) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        if (isFetchNextPageErrorRef.current) return
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return
        const now = Date.now()
        if (now - lastObserverTriggerAtRef.current < LOAD_MORE_OBSERVER_THROTTLE_MS) return
        lastObserverTriggerAtRef.current = now
        handleLoadMoreRef.current()
      },
      {
        rootMargin: "220px 0px",
      }
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  const hasFilter = Boolean(normalizedQuery || currentTag)
  const resultCount = pinnedPosts.length + regularPosts.length
  const sortedRegularPosts = useMemo(
    () => sortFeedPosts(regularPosts, sortMode),
    [regularPosts, sortMode]
  )
  const showBootstrapDegraded = initialBootstrapDegraded && !hasInitialLoadSucceeded
  const hasQueryFilter = normalizedQuery.length > 0
  const hasTagFilter = Boolean(currentTag)
  const filterSummary = useMemo(() => {
    if (!hasFilter) return ""
    const parts: string[] = []
    if (hasQueryFilter) parts.push(`검색 "${normalizedQuery}"`)
    if (hasTagFilter && currentTag) parts.push(`태그 "${currentTag}"`)
    return parts.join(" · ")
  }, [currentTag, hasFilter, hasQueryFilter, hasTagFilter, normalizedQuery])
  const contextStatusLabel = useMemo(() => {
    if (isInitialLoading) return hasFilter ? "검색 결과를 불러오는 중..." : "피드를 불러오는 중..."
    if (showBootstrapDegraded && resultCount > 0) return "최근 저장된 글을 먼저 표시 중"
    return ""
  }, [hasFilter, isInitialLoading, resultCount, showBootstrapDegraded])

  const handleClearFilters = useCallback(() => {
    setQ("")
    if (!currentTag) return
    const { category: _deprecatedCategory, ...restQuery } = router.query
    startTransition(() => {
      void replaceShallowRoutePreservingScroll(router, {
        pathname: "/",
        query: {
          ...restQuery,
          tag: undefined,
        },
      })
    })
  }, [currentTag, router])
  const currentSortLabel =
    FEED_SORT_OPTIONS.find((option) => option.value === sortMode)?.label ?? "최신순"

  const handleSortSelect = useCallback((value: FeedSortMode) => {
    setSortMode(value)
    setSortOpen(false)
  }, [])

  return (
    <>
      <PinnedPosts posts={pinnedPosts} />
      <FeedBody data-sticky-rail-safe="true">
        <aside className="tagColumn">
          <TagList />
        </aside>
        <section className="postColumn">
          <ExplorerCard>
            <div className="feedTitle">
              <span>Latest Notes</span>
              <h2>최근 글</h2>
              <p className="feedDescription">실제 운영에서 마주친 문제와 선택, 검증 결과를 긴 글로 정리합니다.</p>
            </div>
            <div className="searchSlot">
              <SearchInput
                inputRef={searchInputRef}
                value={q}
                onChange={(event) => setQ(event.target.value)}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
              />
              <div className="sortDropdown" ref={sortMenuRef}>
                <button
                  type="button"
                  className="sortTrigger"
                  aria-haspopup="listbox"
                  aria-expanded={sortOpen}
                  onClick={() => setSortOpen((prev) => !prev)}
                >
                  {currentSortLabel}
                  <span className="sortChevron" aria-hidden="true" />
                </button>
                {sortOpen && (
                  <div className="sortMenu" role="listbox" aria-label="피드 정렬">
                    {FEED_SORT_OPTIONS.map((option) => (
                      <button
                        type="button"
                        key={option.value}
                        className="sortOption"
                        role="option"
                        aria-selected={sortMode === option.value}
                        data-active={sortMode === option.value}
                        onClick={() => handleSortSelect(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ExplorerCard>
          {(hasFilter || contextStatusLabel) && (
            <FilterContextBar>
              <div className="contextMain">
                <strong className="contextCount">{hasFilter ? `${resultCount}개` : `피드 ${resultCount}개`}</strong>
                {hasFilter && <span className="filterSummary">{filterSummary}</span>}
                {contextStatusLabel ? <span className="statusBadge">{contextStatusLabel}</span> : null}
              </div>
              <div className="contextActions">
                {hasFilter && (
                  <button type="button" className="resetButton" onClick={handleClearFilters}>
                    초기화
                  </button>
                )}
              </div>
            </FilterContextBar>
          )}
          <PostList
            posts={sortedRegularPosts}
            hasFilter={hasFilter}
            hasExternalResults={pinnedPosts.length > 0}
            onClearFilters={handleClearFilters}
            isInitialLoading={isInitialLoading}
            isInitialLoadError={isInitialLoadError || (showBootstrapDegraded && resultCount === 0)}
            isFetchingNextPage={isFetchingNextPage}
            isFetchNextPageError={isFetchNextPageError}
            hasNextPage={hasNextPage}
            onLoadMore={handleLoadMore}
            onRetryInitialLoad={refetchInitialPage}
            onRetryLoadMore={handleRetryLoadMore}
            loadMoreTriggerRef={loadMoreTriggerRef}
          />
        </section>
      </FeedBody>
    </>
  )
}

export default FeedExplorer
