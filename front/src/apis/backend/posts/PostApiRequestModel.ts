import { normalizeKeywordQuery, normalizeTagQuery } from "src/libs/query/normalize"
import { ApiError } from "../client"
import { asOpenApiPath } from "../openapiContract"
import type { ExplorePostsParams } from "./PostApiDtos"

export const PAGE_SIZE = 30
export const POSTS_CACHE_TTL_MS = 90_000
export const POSTS_BOOTSTRAP_SSR_CACHE_TTL_MS = 60_000
export const POST_DETAIL_SSR_CACHE_TTL_MS = 120_000
export const POSTS_BOOTSTRAP_SSR_CACHE_MAX_ENTRIES = 6
export const POST_DETAIL_SSR_CACHE_MAX_ENTRIES = 24
export const isServerRuntime = typeof window === "undefined"

export const POSTS_TAGS_API_PATH = asOpenApiPath("/post/api/v1/posts/tags")

const PUBLIC_CURSOR_DISABLED_SESSION_KEY = "posts:public-cursor-disabled:v1"
const POSTS_EXPLORE_API_PATH = asOpenApiPath("/post/api/v1/posts/explore")
const POSTS_SEARCH_API_PATH = asOpenApiPath("/post/api/v1/posts/search")
const POSTS_FEED_API_PATH = asOpenApiPath("/post/api/v1/posts/feed")
const POSTS_FEED_CURSOR_API_PATH = asOpenApiPath("/post/api/v1/posts/feed/cursor")
const POSTS_EXPLORE_CURSOR_API_PATH = asOpenApiPath("/post/api/v1/posts/explore/cursor")
const POSTS_RELATED_AUTHOR_API_PATH = "/post/api/v1/posts/related/author"
const POSTS_BOOTSTRAP_API_PATH = "/post/api/v1/posts/bootstrap"
const POSTS_ENDPOINT_TRACE_KEY = "posts:runtime-endpoints:v1"
const POSTS_ENDPOINT_TRACE_MAX = 60

let isPublicCursorDisabledCache: boolean | null = null

export const resetPostRequestRuntimeState = () => {
  isPublicCursorDisabledCache = null
}

export const isAbortError = (error: unknown): boolean => error instanceof Error && error.name === "AbortError"

export const getFreshServerSnapshot = <T>(
  cache: Map<string, { value: T; cachedAt: number }>,
  key: string,
  ttlMs: number
): T | null => {
  if (!isServerRuntime) return null
  const cached = cache.get(key)
  if (!cached) return null
  if (Date.now() - cached.cachedAt > ttlMs) {
    cache.delete(key)
    return null
  }
  return cached.value
}

export const setServerSnapshot = <T>(
  cache: Map<string, { value: T; cachedAt: number }>,
  key: string,
  value: T,
  maxEntries: number
) => {
  cache.set(key, { value, cachedAt: Date.now() })
  if (cache.size <= maxEntries) return
  const oldestKey = cache.keys().next().value
  if (oldestKey) cache.delete(oldestKey)
}

export const readPublicCursorDisabled = () => {
  if (isServerRuntime) return false
  if (isPublicCursorDisabledCache !== null) return isPublicCursorDisabledCache

  try {
    isPublicCursorDisabledCache = window.sessionStorage.getItem(PUBLIC_CURSOR_DISABLED_SESSION_KEY) === "1"
  } catch {
    isPublicCursorDisabledCache = false
  }

  return isPublicCursorDisabledCache
}

export const markPublicCursorDisabled = () => {
  isPublicCursorDisabledCache = true
  if (isServerRuntime) return

  try {
    window.sessionStorage.setItem(PUBLIC_CURSOR_DISABLED_SESSION_KEY, "1")
  } catch {
    // ignore storage permission/quota errors
  }
}

export const recordRuntimeEndpoint = (path: string, paginationMode: "page" | "cursor") => {
  if (isServerRuntime) return
  const now = new Date().toISOString()
  const entry = `${now} ${paginationMode.toUpperCase()} ${path}`
  const traceWindow = window as Window & {
    __aqPostEndpointTrace?: string[]
  }

  try {
    const raw = window.sessionStorage.getItem(POSTS_ENDPOINT_TRACE_KEY)
    const parsed = raw ? (JSON.parse(raw) as string[]) : []
    const next = [...parsed, entry].slice(-POSTS_ENDPOINT_TRACE_MAX)
    window.sessionStorage.setItem(POSTS_ENDPOINT_TRACE_KEY, JSON.stringify(next))
    traceWindow.__aqPostEndpointTrace = next
  } catch {
    // ignore trace storage failures
  }

  if (paginationMode === "cursor") {
    console.info("[posts-runtime-endpoint] cursor endpoint detected", path)
  }
}

export const isAuthRequiredError = (error: unknown) =>
  error instanceof ApiError && (error.status === 401 || error.status === 403)

const toSortParam = (order: "asc" | "desc") => (order === "asc" ? "CREATED_AT_ASC" : "CREATED_AT")

export const toValidPage = (page: number | undefined) => {
  if (!Number.isFinite(page)) return 1
  return Math.max(1, Math.trunc(page || 1))
}

export const toValidPageSize = (pageSize: number | undefined) => {
  if (!Number.isFinite(pageSize)) return PAGE_SIZE
  return Math.min(30, Math.max(1, Math.trunc(pageSize || PAGE_SIZE)))
}

export const buildExplorePath = ({
  kw = "",
  tag = "",
  order = "desc",
  page = 1,
  pageSize = PAGE_SIZE,
}: ExplorePostsParams) => {
  const normalizedKw = normalizeKeywordQuery(kw)
  const normalizedTag = normalizeTagQuery(tag)
  const params = new URLSearchParams()
  params.set("kw", normalizedKw)
  params.set("tag", normalizedTag)
  params.set("sort", toSortParam(order))
  params.set("page", String(toValidPage(page)))
  params.set("pageSize", String(toValidPageSize(pageSize)))
  return `${POSTS_EXPLORE_API_PATH}?${params.toString()}`
}

export const buildSearchPath = ({
  kw = "",
  order = "desc",
  page = 1,
  pageSize = PAGE_SIZE,
}: ExplorePostsParams) => {
  const normalizedKw = normalizeKeywordQuery(kw)
  const params = new URLSearchParams()
  params.set("kw", normalizedKw)
  params.set("sort", toSortParam(order))
  params.set("page", String(toValidPage(page)))
  params.set("pageSize", String(toValidPageSize(pageSize)))
  return `${POSTS_SEARCH_API_PATH}?${params.toString()}`
}

export const buildFeedPath = ({
  order = "desc",
  page = 1,
  pageSize = PAGE_SIZE,
}: Pick<ExplorePostsParams, "order" | "page" | "pageSize">) => {
  const params = new URLSearchParams()
  params.set("sort", toSortParam(order))
  params.set("page", String(toValidPage(page)))
  params.set("pageSize", String(toValidPageSize(pageSize)))
  return `${POSTS_FEED_API_PATH}?${params.toString()}`
}

export const buildFeedCursorPath = ({
  order = "desc",
  pageSize = PAGE_SIZE,
  cursor,
}: {
  order?: "asc" | "desc"
  pageSize?: number
  cursor?: string
}) => {
  const params = new URLSearchParams()
  params.set("sort", toSortParam(order))
  params.set("pageSize", String(toValidPageSize(pageSize)))
  if (cursor && cursor.trim()) {
    params.set("cursor", cursor.trim())
  }
  return `${POSTS_FEED_CURSOR_API_PATH}?${params.toString()}`
}

export const buildExploreCursorPath = ({
  tag = "",
  order = "desc",
  pageSize = PAGE_SIZE,
  cursor,
}: {
  tag?: string
  order?: "asc" | "desc"
  pageSize?: number
  cursor?: string
}) => {
  const normalizedTag = normalizeTagQuery(tag)
  const params = new URLSearchParams()
  params.set("tag", normalizedTag)
  params.set("sort", toSortParam(order))
  params.set("pageSize", String(toValidPageSize(pageSize)))
  if (cursor && cursor.trim()) {
    params.set("cursor", cursor.trim())
  }
  return `${POSTS_EXPLORE_CURSOR_API_PATH}?${params.toString()}`
}

export const buildBootstrapPath = ({
  tag = "",
  order = "desc",
  pageSize = PAGE_SIZE,
}: {
  tag?: string
  order?: "asc" | "desc"
  pageSize?: number
}) => {
  const normalizedTag = normalizeTagQuery(tag)
  const params = new URLSearchParams()
  params.set("tag", normalizedTag)
  params.set("sort", toSortParam(order))
  params.set("pageSize", String(toValidPageSize(pageSize)))
  return `${POSTS_BOOTSTRAP_API_PATH}?${params.toString()}`
}

export const buildRelatedByAuthorPath = ({
  authorId,
  excludePostId,
  limit,
}: {
  authorId: number
  excludePostId?: number
  limit: number
}) => {
  const params = new URLSearchParams()
  params.set("authorId", String(authorId))
  params.set("limit", String(limit))
  if (typeof excludePostId === "number" && Number.isFinite(excludePostId) && excludePostId > 0) {
    params.set("excludePostId", String(Math.trunc(excludePostId)))
  }
  return `${POSTS_RELATED_AUTHOR_API_PATH}?${params.toString()}`
}
