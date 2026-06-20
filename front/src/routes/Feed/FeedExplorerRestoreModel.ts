import { useEffect, useState } from "react"
import { queryKey } from "src/constants/queryKey"
import { type ExplorePostsPage } from "src/apis/backend/posts"
import {
  FEED_EXPLORER_RESTORE_KEY_PREFIX,
  FEED_EXPLORER_SNAPSHOT_SUFFIX,
} from "src/libs/feed/feedRestoreCache"
import { normalizeKeywordQuery, normalizeTagQuery } from "src/libs/query/normalize"
import type { TPost } from "src/types"

export const FEED_EXPLORER_RESTORE_TTL_MS = 15 * 60_000
export const FEED_EXPLORER_RESTORE_MAX_PAGES = 8
export const FEED_EXPLORER_ORDER: "asc" | "desc" = "desc"
export const FEED_EXPLORER_SNAPSHOT_MAX_PAGES = 4
export const FEED_EXPLORER_SNAPSHOT_MAX_BYTES = 260_000
export const FEED_EXPLORER_RESTORE_MAX_KEYS = 4
export const FEED_EXPLORER_IDLE_REVALIDATE_TIMEOUT_MS = 1200
export const FEED_EXPLORER_SCROLL_BUCKET_PX = 36
export type FeedExplorerRestoreState = {
  q: string
  tag: string
  scrollY: number
  loadedPages: number
  savedAt: number
}

export type FeedExplorerRestoreSnapshot = {
  savedAt: number
  pages: FeedExplorerSnapshotPage[]
}

export type FeedExplorerSnapshotPost = {
  id: string
  title: string
  createdTime: string
  date?: { start_date: string }
  modifiedTime?: string
  summary?: string
  thumbnail?: string
  tags?: string[]
  category?: string[]
  author?: {
    id: string
    name: string
    profile_photo?: string
  }[]
  likesCount?: number
  commentsCount?: number
  hitCount?: number
}

export type FeedExplorerSnapshotPage = {
  posts: FeedExplorerSnapshotPost[]
  totalCount: number
  pageNumber: number
  pageSize: number
  hasNext?: boolean
  nextCursor?: string | null
  paginationMode?: "cursor" | "page"
}

export type NavigatorConnectionLike = {
  saveData?: boolean
  effectiveType?: string
}

export type IdleCallbackHandle = number
export type IdleCallbackDeadlineLike = {
  didTimeout: boolean
  timeRemaining: () => number
}

export const getFeedExplorerRestoreKey = (tag: string, pageSize: number, order: "asc" | "desc") =>
  `${FEED_EXPLORER_RESTORE_KEY_PREFIX}:tag=${encodeURIComponent(normalizeTagQuery(tag))}:size=${pageSize}:order=${order}`

export const getFeedExplorerSnapshotKey = (restoreKey: string) =>
  `${restoreKey}${FEED_EXPLORER_SNAPSHOT_SUFFIX}`

export const getNavigatorConnection = (): NavigatorConnectionLike | undefined => {
  if (typeof navigator === "undefined") return undefined
  return (navigator as Navigator & { connection?: NavigatorConnectionLike }).connection
}

export const getNavigatorDeviceMemory = () => {
  if (typeof navigator === "undefined") return undefined
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  return typeof memory === "number" && Number.isFinite(memory) ? memory : undefined
}

export const resolveRestorePageCap = () => {
  const connection = getNavigatorConnection()
  const memory = getNavigatorDeviceMemory()

  if (connection?.saveData) return 2
  if (connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g") return 1
  if (connection?.effectiveType === "3g") return 3

  if (typeof memory === "number" && memory <= 2) return 2
  if (typeof memory === "number" && memory <= 4) return 4
  return FEED_EXPLORER_RESTORE_MAX_PAGES
}

export const resolveSnapshotPageCap = () => {
  return Math.min(FEED_EXPLORER_SNAPSHOT_MAX_PAGES, resolveRestorePageCap())
}

export const toSnapshotPost = (post: TPost): FeedExplorerSnapshotPost => {
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
    ...(post.category?.length ? { category: post.category } : {}),
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
    ...(typeof post.hitCount === "number" ? { hitCount: post.hitCount } : {}),
  }
}

export const toSnapshotPage = (page: ExplorePostsPage): FeedExplorerSnapshotPage => ({
  totalCount: page.totalCount,
  pageNumber: page.pageNumber,
  pageSize: page.pageSize,
  ...(typeof page.hasNext === "boolean" ? { hasNext: page.hasNext } : {}),
  ...(typeof page.nextCursor === "string" || page.nextCursor === null ? { nextCursor: page.nextCursor } : {}),
  ...(page.paginationMode ? { paginationMode: page.paginationMode } : {}),
  posts: page.posts.map(toSnapshotPost),
})

export const toRestoredPost = (post: FeedExplorerSnapshotPost): TPost => {
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
    ...(post.category?.length ? { category: post.category } : {}),
    ...(post.author?.length ? { author: post.author } : {}),
    ...(typeof post.likesCount === "number" ? { likesCount: post.likesCount } : {}),
    ...(typeof post.commentsCount === "number" ? { commentsCount: post.commentsCount } : {}),
    ...(typeof post.hitCount === "number" ? { hitCount: post.hitCount } : {}),
  }
}

export const toRestoredPage = (page: FeedExplorerSnapshotPage): ExplorePostsPage => ({
  totalCount: page.totalCount,
  pageNumber: page.pageNumber,
  pageSize: page.pageSize,
  ...(typeof page.hasNext === "boolean" ? { hasNext: page.hasNext } : {}),
  ...(typeof page.nextCursor === "string" || page.nextCursor === null ? { nextCursor: page.nextCursor } : {}),
  ...(page.paginationMode ? { paginationMode: page.paginationMode } : {}),
  posts: page.posts.map(toRestoredPost),
})

export const scheduleIdleRevalidate = (callback: () => void) => {
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

export const parseFeedExplorerRestoreSnapshot = (raw: string | null): FeedExplorerRestoreSnapshot | null => {
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

export const toPersistFingerprint = (state: Pick<FeedExplorerRestoreState, "q" | "tag" | "loadedPages" | "scrollY">) => {
  const scrollBucket = Math.trunc(Math.max(0, state.scrollY) / FEED_EXPLORER_SCROLL_BUCKET_PX)
  return `${state.q}\u0000${state.tag}\u0000${state.loadedPages}\u0000${scrollBucket}`
}

export const extractSavedAt = (raw: string | null) => {
  if (!raw) return 0
  try {
    const parsed = JSON.parse(raw) as { savedAt?: unknown }
    return typeof parsed.savedAt === "number" && Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0
  } catch {
    return 0
  }
}

export const pruneFeedExplorerStateStorage = (storage: Storage) => {
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

export const toFeedExplorerInfiniteQueryKey = ({
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
  const normalizedKw = normalizeKeywordQuery(kw)
  const normalizedTag = normalizeTagQuery(tag)
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

export const parseFeedExplorerRestoreState = (raw: string | null): FeedExplorerRestoreState | null => {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<FeedExplorerRestoreState>
    if (!parsed || typeof parsed !== "object") return null

    const q = typeof parsed.q === "string" ? normalizeKeywordQuery(parsed.q) : ""
    const tag = typeof parsed.tag === "string" ? normalizeTagQuery(parsed.tag) : ""
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

export const getSearchDebounceMs = (value: string) => {
  const trimmedLength = normalizeKeywordQuery(value).length
  if (trimmedLength === 0) return 0
  if (trimmedLength <= 2) return 120
  if (trimmedLength <= 5) return 180
  return 240
}

export const useDebouncedValue = (value: string, pause = false) => {
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
