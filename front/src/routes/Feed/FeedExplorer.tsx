import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import styled from "@emotion/styled"
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

const LOAD_MORE_THROTTLE_MS = 800
const LOAD_MORE_OBSERVER_THROTTLE_MS = 180
// Disable desktop side-rail in production to prevent feed-width intrusion and asymmetrical gutters.
const FEED_TAG_RAIL_DESKTOP_MIN_PX = 99999
const FEED_TAG_RAIL_OFFSET_ANCHOR_PX = 584
const FEED_TAG_RAIL_OFFSET_MAX_PX = -56
const FEED_TAG_RAIL_OFFSET_MIN_PX = -216
const FEED_TAG_RAIL_WIDTH_PX = 184
const FEED_TAG_RAIL_SAFE_GAP_PX = 12
const FEED_EXPLORER_RESTORE_KEY_PREFIX = "feed:explorer:state:v2"
const FEED_EXPLORER_RESTORE_TTL_MS = 15 * 60_000
const FEED_EXPLORER_RESTORE_MAX_PAGES = 8
const FEED_EXPLORER_ORDER: "asc" | "desc" = "desc"
const FEED_EXPLORER_SNAPSHOT_SUFFIX = ":snapshot"
const FEED_EXPLORER_SNAPSHOT_MAX_PAGES = 4
const FEED_EXPLORER_SNAPSHOT_MAX_BYTES = 260_000
const FEED_EXPLORER_RESTORE_MAX_KEYS = 4
const FEED_EXPLORER_IDLE_REVALIDATE_TIMEOUT_MS = 1200
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect

type FeedExplorerRestoreState = {
  q: string
  tag: string
  scrollY: number
  loadedPages: number
  savedAt: number
}

type FeedExplorerRestoreSnapshot = {
  savedAt: number
  pages: FeedExplorerSnapshotPage[]
}

type FeedExplorerSnapshotPost = {
  id: string
  title: string
  createdTime: string
  date?: { start_date: string }
  modifiedTime?: string
  summary?: string
  thumbnail?: string
  tags?: string[]
  author?: {
    id: string
    name: string
    profile_photo?: string
  }[]
  likesCount?: number
  commentsCount?: number
}

type FeedExplorerSnapshotPage = {
  posts: FeedExplorerSnapshotPost[]
  totalCount: number
  pageNumber: number
  pageSize: number
}

type NavigatorConnectionLike = {
  saveData?: boolean
  effectiveType?: string
}

type IdleCallbackHandle = number
type IdleCallbackDeadlineLike = {
  didTimeout: boolean
  timeRemaining: () => number
}

const getFeedExplorerRestoreKey = (tag: string, pageSize: number, order: "asc" | "desc") =>
  `${FEED_EXPLORER_RESTORE_KEY_PREFIX}:tag=${encodeURIComponent(tag)}:size=${pageSize}:order=${order}`

const getFeedExplorerSnapshotKey = (restoreKey: string) =>
  `${restoreKey}${FEED_EXPLORER_SNAPSHOT_SUFFIX}`

const getNavigatorConnection = (): NavigatorConnectionLike | undefined => {
  if (typeof navigator === "undefined") return undefined
  return (navigator as Navigator & { connection?: NavigatorConnectionLike }).connection
}

const getNavigatorDeviceMemory = () => {
  if (typeof navigator === "undefined") return undefined
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  return typeof memory === "number" && Number.isFinite(memory) ? memory : undefined
}

const resolveRestorePageCap = () => {
  const connection = getNavigatorConnection()
  const memory = getNavigatorDeviceMemory()

  if (connection?.saveData) return 2
  if (connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g") return 1
  if (connection?.effectiveType === "3g") return 3

  if (typeof memory === "number" && memory <= 2) return 2
  if (typeof memory === "number" && memory <= 4) return 4
  return FEED_EXPLORER_RESTORE_MAX_PAGES
}

const resolveSnapshotPageCap = () => {
  return Math.min(FEED_EXPLORER_SNAPSHOT_MAX_PAGES, resolveRestorePageCap())
}

const toSnapshotPost = (post: TPost): FeedExplorerSnapshotPost => {
  const firstAuthor = post.author?.[0]
  return {
    id: post.id,
    title: post.title,
    createdTime: post.createdTime,
    ...(post.date?.start_date ? { date: { start_date: post.date.start_date } } : {}),
    ...(post.modifiedTime ? { modifiedTime: post.modifiedTime } : {}),
    ...(post.summary ? { summary: post.summary } : {}),
    ...(post.thumbnail ? { thumbnail: post.thumbnail } : {}),
    ...(post.tags?.length ? { tags: post.tags } : {}),
    ...(firstAuthor
      ? {
          author: [
            {
              id: firstAuthor.id,
              name: firstAuthor.name,
              ...(firstAuthor.profile_photo ? { profile_photo: firstAuthor.profile_photo } : {}),
            },
          ],
        }
      : {}),
    ...(typeof post.likesCount === "number" ? { likesCount: post.likesCount } : {}),
    ...(typeof post.commentsCount === "number" ? { commentsCount: post.commentsCount } : {}),
  }
}

const toSnapshotPage = (page: ExplorePostsPage): FeedExplorerSnapshotPage => ({
  totalCount: page.totalCount,
  pageNumber: page.pageNumber,
  pageSize: page.pageSize,
  posts: page.posts.map(toSnapshotPost),
})

const toRestoredPost = (post: FeedExplorerSnapshotPost): TPost => {
  const dateStart =
    post.date?.start_date ||
    (typeof post.createdTime === "string" && post.createdTime.length >= 10
      ? post.createdTime.slice(0, 10)
      : "1970-01-01")

  return {
    id: post.id,
    date: { start_date: dateStart },
    type: ["Post"],
    slug: post.id,
    title: post.title,
    status: ["Public"],
    createdTime: post.createdTime,
    fullWidth: false,
    ...(post.modifiedTime ? { modifiedTime: post.modifiedTime } : {}),
    ...(post.summary ? { summary: post.summary } : {}),
    ...(post.thumbnail ? { thumbnail: post.thumbnail } : {}),
    ...(post.tags?.length ? { tags: post.tags } : {}),
    ...(post.author?.length ? { author: post.author } : {}),
    ...(typeof post.likesCount === "number" ? { likesCount: post.likesCount } : {}),
    ...(typeof post.commentsCount === "number" ? { commentsCount: post.commentsCount } : {}),
  }
}

const toRestoredPage = (page: FeedExplorerSnapshotPage): ExplorePostsPage => ({
  totalCount: page.totalCount,
  pageNumber: page.pageNumber,
  pageSize: page.pageSize,
  posts: page.posts.map(toRestoredPost),
})

const scheduleIdleRevalidate = (callback: () => void) => {
  if (typeof window === "undefined") return () => {}

  const idleWindow = window as Window & {
    requestIdleCallback?: (
      cb: (deadline: IdleCallbackDeadlineLike) => void,
      options?: { timeout?: number }
    ) => IdleCallbackHandle
    cancelIdleCallback?: (id: IdleCallbackHandle) => void
  }

  if (typeof idleWindow.requestIdleCallback === "function") {
    const idleId = idleWindow.requestIdleCallback(
      () => {
        callback()
      },
      { timeout: FEED_EXPLORER_IDLE_REVALIDATE_TIMEOUT_MS }
    )

    return () => {
      if (typeof idleWindow.cancelIdleCallback === "function") {
        idleWindow.cancelIdleCallback(idleId)
      }
    }
  }

  const timeoutId = window.setTimeout(callback, FEED_EXPLORER_IDLE_REVALIDATE_TIMEOUT_MS)
  return () => window.clearTimeout(timeoutId)
}

const parseFeedExplorerRestoreSnapshot = (raw: string | null): FeedExplorerRestoreSnapshot | null => {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<FeedExplorerRestoreSnapshot>
    if (!parsed || typeof parsed !== "object") return null
    if (!Array.isArray(parsed.pages)) return null
    if (parsed.pages.length === 0) return null

    const savedAt =
      typeof parsed.savedAt === "number" && Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0
    if (savedAt <= 0) return null
    if (Date.now() - savedAt > FEED_EXPLORER_RESTORE_TTL_MS) return null

    return {
      savedAt,
      pages: parsed.pages as FeedExplorerSnapshotPage[],
    }
  } catch {
    return null
  }
}

const extractSavedAt = (raw: string | null) => {
  if (!raw) return 0
  try {
    const parsed = JSON.parse(raw) as { savedAt?: unknown }
    return typeof parsed.savedAt === "number" && Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0
  } catch {
    return 0
  }
}

const pruneFeedExplorerStateStorage = (storage: Storage) => {
  const candidates: Array<{ key: string; savedAt: number }> = []

  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i)
    if (!key) continue
    if (!key.startsWith(FEED_EXPLORER_RESTORE_KEY_PREFIX)) continue
    if (key.endsWith(FEED_EXPLORER_SNAPSHOT_SUFFIX)) continue

    const snapshotKey = getFeedExplorerSnapshotKey(key)
    const savedAt = extractSavedAt(storage.getItem(key))

    if (savedAt <= 0 || Date.now() - savedAt > FEED_EXPLORER_RESTORE_TTL_MS) {
      storage.removeItem(key)
      storage.removeItem(snapshotKey)
      continue
    }

    candidates.push({ key, savedAt })
  }

  if (candidates.length <= FEED_EXPLORER_RESTORE_MAX_KEYS) return

  candidates
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(FEED_EXPLORER_RESTORE_MAX_KEYS)
    .forEach(({ key }) => {
      storage.removeItem(key)
      storage.removeItem(getFeedExplorerSnapshotKey(key))
    })
}

const toFeedExplorerInfiniteQueryKey = ({
  kw,
  tag,
  pageSize,
  order,
}: {
  kw: string
  tag: string
  pageSize: number
  order: "asc" | "desc"
}) => {
  const normalizedKw = kw.trim()
  const normalizedTag = tag.trim()
  const searchMode = normalizedKw.length > 0 && !normalizedTag
  const feedMode = normalizedKw.length === 0 && !normalizedTag

  if (feedMode) {
    return queryKey.postsFeedInfinite({
      pageSize,
      order,
    })
  }

  if (searchMode) {
    return queryKey.postsSearchInfinite({
      kw: normalizedKw,
      pageSize,
      order,
    })
  }

  return queryKey.postsExploreInfinite({
    kw: normalizedKw,
    tag: normalizedTag || undefined,
    pageSize,
    order,
  })
}

const parseFeedExplorerRestoreState = (raw: string | null): FeedExplorerRestoreState | null => {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<FeedExplorerRestoreState>
    if (!parsed || typeof parsed !== "object") return null

    const q = typeof parsed.q === "string" ? parsed.q : ""
    const tag = typeof parsed.tag === "string" ? parsed.tag : ""
    const scrollY =
      typeof parsed.scrollY === "number" && Number.isFinite(parsed.scrollY)
        ? Math.max(0, Math.trunc(parsed.scrollY))
        : 0
    const loadedPages =
      typeof parsed.loadedPages === "number" && Number.isFinite(parsed.loadedPages)
        ? Math.max(1, Math.trunc(parsed.loadedPages))
        : 1
    const savedAt =
      typeof parsed.savedAt === "number" && Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0

    if (savedAt <= 0) return null
    if (Date.now() - savedAt > FEED_EXPLORER_RESTORE_TTL_MS) return null

    return {
      q,
      tag,
      scrollY,
      loadedPages,
      savedAt,
    }
  } catch {
    return null
  }
}

const getSearchDebounceMs = (value: string) => {
  const trimmedLength = value.trim().length
  if (trimmedLength === 0) return 0
  if (trimmedLength <= 2) return 120
  if (trimmedLength <= 5) return 180
  return 240
}

const useDebouncedValue = (value: string, pause = false) => {
  const [debounced, setDebounced] = useState(value)
  const delayMs = getSearchDebounceMs(value)

  useEffect(() => {
    if (pause) return
    if (delayMs === 0) {
      setDebounced(value)
      return
    }
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs, pause])

  return debounced
}

const FeedExplorer = () => {
  const queryClient = useQueryClient()
  const [q, setQ] = useState("")
  const [isComposing, setIsComposing] = useState(false)
  const router = useRouter()
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const feedBodyRef = useRef<HTMLElement | null>(null)
  const tagColumnRef = useRef<HTMLElement | null>(null)
  const restoreStateRef = useRef<FeedExplorerRestoreState | null>(null)
  const restoreQueryPagesRef = useRef<FeedExplorerSnapshotPage[] | null>(null)
  const hasHydratedQuerySnapshotRef = useRef(false)
  const hasAppliedRestoreSnapshotRef = useRef(false)
  const hasScheduledIdleRevalidateRef = useRef(false)
  const restoreTargetPagesRef = useRef(1)
  const hasInitializedRestoreRef = useRef(false)
  const hasRestoredScrollRef = useRef(false)
  const restoreSnapshotRef = useRef({
    q: "",
    tag: "",
    loadedPagesCount: 1,
  })

  const currentTag =
    typeof router.query.tag === "string" ? router.query.tag : undefined
  const restoreStorageKey = useMemo(
    () => getFeedExplorerRestoreKey(currentTag || "", FEED_EXPLORE_PAGE_SIZE, FEED_EXPLORER_ORDER),
    [currentTag]
  )
  const restoreSnapshotStorageKey = useMemo(
    () => getFeedExplorerSnapshotKey(restoreStorageKey),
    [restoreStorageKey]
  )
  const debouncedQ = useDebouncedValue(q, isComposing)
  const normalizedQuery = debouncedQ.trim()
  const {
    pinnedPosts,
    regularPosts,
    loadedPagesCount,
    hasNextPage,
    isInitialLoading,
    isFetchingNextPage,
    fetchNextPage,
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

  useEffect(() => {
    hasNextPageRef.current = hasNextPage
  }, [hasNextPage])

  useEffect(() => {
    isFetchingNextPageRef.current = isFetchingNextPage
  }, [isFetchingNextPage])

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

    const restoredSnapshot = parseFeedExplorerRestoreSnapshot(
      window.sessionStorage.getItem(restoreSnapshotStorageKey)
    )
    if (restoredSnapshot?.pages?.length) {
      restoreQueryPagesRef.current = restoredSnapshot.pages.slice(0, resolveSnapshotPageCap())
    }

  }, [currentTag, q, restoreSnapshotStorageKey, restoreStorageKey, router.isReady])

  useEffect(() => {
    if (hasHydratedQuerySnapshotRef.current) return

    const restored = restoreStateRef.current
    const restoredPages = restoreQueryPagesRef.current
    if (!restored || !restoredPages || restoredPages.length === 0) return

    const activeTag = currentTag || ""
    if (restored.tag !== activeTag) return
    if (restored.q.trim() !== normalizedQuery) return

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
      pageParams: restoredPages.map((page) => page.pageNumber),
    })
    hasHydratedQuerySnapshotRef.current = true
    hasAppliedRestoreSnapshotRef.current = true
  }, [currentTag, normalizedQuery, queryClient])

  useEffect(() => {
    if (hasScheduledIdleRevalidateRef.current) return
    if (!hasAppliedRestoreSnapshotRef.current) return

    const restored = restoreStateRef.current
    if (!restored) return

    const activeTag = currentTag || ""
    if (restored.tag !== activeTag) return
    if (restored.q.trim() !== normalizedQuery) return

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
    const restoreKey = getFeedExplorerRestoreKey(
      snapshot.tag,
      FEED_EXPLORE_PAGE_SIZE,
      FEED_EXPLORER_ORDER
    )
    const snapshotKey = getFeedExplorerSnapshotKey(restoreKey)
    const state: FeedExplorerRestoreState = {
      q: snapshot.q,
      tag: snapshot.tag,
      scrollY: Math.max(0, Math.trunc(window.scrollY || 0)),
      loadedPages: Math.max(1, snapshot.loadedPagesCount),
      savedAt: Date.now(),
    }

    try {
      window.sessionStorage.setItem(restoreKey, JSON.stringify(state))

      const feedQueryKey = toFeedExplorerInfiniteQueryKey({
        kw: snapshot.q,
        tag: snapshot.tag,
        pageSize: FEED_EXPLORE_PAGE_SIZE,
        order: FEED_EXPLORER_ORDER,
      })
      const queryData = queryClient.getQueryData<InfiniteData<ExplorePostsPage>>(feedQueryKey)
      const pages = queryData?.pages ?? []

      if (pages.length > 0) {
        const snapshotPayload: FeedExplorerRestoreSnapshot = {
          savedAt: state.savedAt,
          pages: pages.slice(0, resolveSnapshotPageCap()).map(toSnapshotPage),
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

    const handlePersist = () => {
      persistFeedExplorerState()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        persistFeedExplorerState()
      }
    }

    window.addEventListener("pagehide", handlePersist)
    window.addEventListener("beforeunload", handlePersist)
    document.addEventListener("visibilitychange", handleVisibilityChange)
    router.events.on("routeChangeStart", handlePersist)

    return () => {
      window.removeEventListener("pagehide", handlePersist)
      window.removeEventListener("beforeunload", handlePersist)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      router.events.off("routeChangeStart", handlePersist)
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
    if (!hasNextPageRef.current || isFetchingNextPageRef.current) return
    const now = Date.now()
    if (now - lastLoadMoreAtRef.current < LOAD_MORE_THROTTLE_MS) return
    lastLoadMoreAtRef.current = now
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

  useIsomorphicLayoutEffect(() => {
    if (typeof window === "undefined") return

    let rafId = 0
    const syncRailOverlap = () => {
      const feedBody = feedBodyRef.current
      const tagColumn = tagColumnRef.current
      if (!feedBody || !tagColumn) return

      if (window.innerWidth < FEED_TAG_RAIL_DESKTOP_MIN_PX) {
        feedBody.style.setProperty("--feed-tag-rail-overlap", "0px")
        feedBody.dataset.railCollapsed = "false"
        return
      }

      const feedRect = feedBody.getBoundingClientRect()
      const railRect = tagColumn.getBoundingClientRect()
      const overlap = Math.max(
        0,
        Math.ceil(railRect.right - feedRect.left + FEED_TAG_RAIL_SAFE_GAP_PX)
      )
      const shouldCollapseRail = overlap > 0
      feedBody.dataset.railCollapsed = shouldCollapseRail ? "true" : "false"
      feedBody.style.setProperty("--feed-tag-rail-overlap", shouldCollapseRail ? "0px" : `${overlap}px`)
    }

    const scheduleSync = () => {
      window.cancelAnimationFrame(rafId)
      rafId = window.requestAnimationFrame(syncRailOverlap)
    }

    scheduleSync()
    window.requestAnimationFrame(() => {
      scheduleSync()
    })
    window.addEventListener("resize", scheduleSync, { passive: true })
    window.addEventListener("orientationchange", scheduleSync)
    window.addEventListener("load", scheduleSync)

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleSync) : null
    if (resizeObserver) {
      if (feedBodyRef.current) resizeObserver.observe(feedBodyRef.current)
      if (tagColumnRef.current) resizeObserver.observe(tagColumnRef.current)
    }

    const fontSet = document.fonts
    const handleFontLoadingDone = () => scheduleSync()
    if (fontSet) {
      if (typeof fontSet.addEventListener === "function") {
        fontSet.addEventListener("loadingdone", handleFontLoadingDone)
      }
      void fontSet.ready.then(() => {
        scheduleSync()
      }).catch(() => {})
    }

    return () => {
      window.cancelAnimationFrame(rafId)
      window.removeEventListener("resize", scheduleSync)
      window.removeEventListener("orientationchange", scheduleSync)
      window.removeEventListener("load", scheduleSync)
      if (fontSet && typeof fontSet.removeEventListener === "function") {
        fontSet.removeEventListener("loadingdone", handleFontLoadingDone)
      }
      resizeObserver?.disconnect()
    }
  }, [])

  const hasFilter = Boolean(normalizedQuery || currentTag)
  const resultCount = pinnedPosts.length + regularPosts.length
  const hasQueryFilter = normalizedQuery.length > 0
  const hasTagFilter = Boolean(currentTag)

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

  return (
    <>
      <PinnedPosts posts={pinnedPosts} />
      <ExplorerCard>
        <SearchInput
          inputRef={searchInputRef}
          value={q}
          onChange={(event) => setQ(event.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
        />
      </ExplorerCard>
      <FeedBody ref={feedBodyRef} data-sticky-rail-safe="true">
        <aside ref={tagColumnRef} className="tagColumn">
          <TagList />
        </aside>
        <section className="postColumn">
          <FilterContextBar data-visible={hasFilter}>
            <div className="contextMain">
              <span className="contextLabel">피드</span>
              <strong className="contextCount">{resultCount}개</strong>
              {hasQueryFilter && <span className="chip">검색: {normalizedQuery}</span>}
              {hasTagFilter && <span className="chip">태그: {currentTag}</span>}
            </div>
            {hasFilter && (
              <button type="button" className="resetButton" onClick={handleClearFilters}>
                조건 초기화
              </button>
            )}
          </FilterContextBar>
          <PostList
            posts={regularPosts}
            hasFilter={hasFilter}
            hasExternalResults={pinnedPosts.length > 0}
            onClearFilters={handleClearFilters}
            isInitialLoading={isInitialLoading}
            isFetchingNextPage={isFetchingNextPage}
            hasNextPage={hasNextPage}
            onLoadMore={handleLoadMore}
            loadMoreTriggerRef={loadMoreTriggerRef}
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
  --feed-tag-rail-width: ${FEED_TAG_RAIL_WIDTH_PX}px;
  --feed-tag-rail-left: ${FEED_TAG_RAIL_OFFSET_MIN_PX}px;
  --feed-tag-rail-safe-gap: 0.8rem;
  --feed-tag-rail-overlap: 0px;
  min-width: 0;
  position: relative;
  overflow: visible;

  .tagColumn {
    min-width: 0;
  }

  .postColumn {
    min-width: 0;
  }

  @media (min-width: ${FEED_TAG_RAIL_DESKTOP_MIN_PX}px) {
    .tagColumn {
      position: absolute;
      top: 0;
      z-index: 1;
    }
  }

  @media (min-width: ${FEED_TAG_RAIL_DESKTOP_MIN_PX}px) {
    --feed-tag-rail-left: clamp(
      ${FEED_TAG_RAIL_OFFSET_MIN_PX}px,
      calc(${FEED_TAG_RAIL_OFFSET_ANCHOR_PX}px - 50vw),
      ${FEED_TAG_RAIL_OFFSET_MAX_PX}px
    );
    --feed-tag-rail-overlap: 0px;

    .tagColumn {
      /*
       * Velog-like vertical rail exposure:
       * - starts at the same break tier as velog desktop-side tags (>1200)
       * - keeps rail inside viewport without clipping on first visible range
       * - converges to fixed -216px offset on wider screens
       */
      left: var(--feed-tag-rail-left);
      width: var(--feed-tag-rail-width);
      min-width: var(--feed-tag-rail-width);
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
      transition: opacity 0.14s ease-in;
    }

    &[data-rail-collapsed="true"] {
      .tagColumn {
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
      }
    }
  }
`

const FilterContextBar = styled.div`
  min-height: 2rem;
  margin: 0.18rem 0 0.26rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  color: ${({ theme }) => theme.colors.gray10};

  .contextMain {
    min-width: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.42rem;
  }

  .contextLabel {
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.gray9};
  }

  .contextCount {
    font-size: 0.84rem;
    color: ${({ theme }) => theme.colors.gray12};
    font-weight: 700;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    min-height: 1.6rem;
    padding: 0 0.56rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.76rem;
    font-weight: 620;
    line-height: 1;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .resetButton {
    flex: 0 0 auto;
    min-height: 1.9rem;
    padding: 0 0.72rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.76rem;
    font-weight: 700;
    cursor: pointer;
    transition: border-color 0.125s ease-in, color 0.125s ease-in, background-color 0.125s ease-in;

    &:hover {
      border-color: ${({ theme }) => theme.colors.gray8};
      background: ${({ theme }) => theme.colors.gray2};
      color: ${({ theme }) => theme.colors.gray12};
    }
  }

  @media (max-width: 768px) {
    margin-top: 0.14rem;
    margin-bottom: 0.24rem;

    .contextCount {
      font-size: 0.8rem;
    }

    .chip {
      font-size: 0.72rem;
      min-height: 1.52rem;
    }
  }
`
