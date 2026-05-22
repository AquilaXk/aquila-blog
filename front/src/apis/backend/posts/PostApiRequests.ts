import { normalizeKeywordQuery, normalizeTagQuery } from "src/libs/query/normalize"
import type { PostDetail, TPost } from "src/types"
import { ApiError, apiFetch } from "../client"
import { asOpenApiPath } from "../openapiContract"
import type {
  ApiPostDto,
  ApiPostWithContentDto,
  ApiTagCountDto,
  CursorPageDto,
  ExplorePostsPage,
  ExplorePostsParams,
  PageDto,
  PostsBootstrapDto,
  PostsBootstrapResult,
} from "./PostApiDtos"
import { extractPostIdFromSlug, mapPostDetail, mapPostDto } from "./PostApiMappers"

const PAGE_SIZE = 30
const POSTS_CACHE_TTL_MS = 90_000
const POSTS_BOOTSTRAP_SSR_CACHE_TTL_MS = 60_000
const POST_DETAIL_SSR_CACHE_TTL_MS = 120_000
const POSTS_BOOTSTRAP_SSR_CACHE_MAX_ENTRIES = 6
const POST_DETAIL_SSR_CACHE_MAX_ENTRIES = 24
const isServerRuntime = typeof window === "undefined"
const PUBLIC_CURSOR_DISABLED_SESSION_KEY = "posts:public-cursor-disabled:v1"
const POSTS_EXPLORE_API_PATH = asOpenApiPath("/post/api/v1/posts/explore")
const POSTS_SEARCH_API_PATH = asOpenApiPath("/post/api/v1/posts/search")
const POSTS_FEED_API_PATH = asOpenApiPath("/post/api/v1/posts/feed")
const POSTS_FEED_CURSOR_API_PATH = asOpenApiPath("/post/api/v1/posts/feed/cursor")
const POSTS_EXPLORE_CURSOR_API_PATH = asOpenApiPath("/post/api/v1/posts/explore/cursor")
const POSTS_TAGS_API_PATH = asOpenApiPath("/post/api/v1/posts/tags")
const POSTS_RELATED_AUTHOR_API_PATH = "/post/api/v1/posts/related/author"
const POSTS_BOOTSTRAP_API_PATH = "/post/api/v1/posts/bootstrap"
const POSTS_ENDPOINT_TRACE_KEY = "posts:runtime-endpoints:v1"
const POSTS_ENDPOINT_TRACE_MAX = 60
let postsCache: TPost[] | null = null
let postsCacheAt = 0
let pendingPostsPromise: Promise<TPost[]> | null = null
let postsBootstrapSsrCache = new Map<string, { value: PostsBootstrapResult; cachedAt: number }>()
let pendingPostsBootstrapPromises = new Map<string, Promise<PostsBootstrapResult>>()
let postDetailSsrCache = new Map<string, { value: PostDetail; cachedAt: number }>()
let pendingPostDetailPromises = new Map<string, Promise<PostDetail | null>>()
let isPublicCursorDisabledCache: boolean | null = null

type GetPostsOptions = {
  throwOnError?: boolean
}

export const resetPostsRequestCaches = () => {
  postsCache = null
  postsCacheAt = 0
  pendingPostsPromise = null
  postsBootstrapSsrCache = new Map()
  pendingPostsBootstrapPromises = new Map()
  postDetailSsrCache = new Map()
  pendingPostDetailPromises = new Map()
}

const isAbortError = (error: unknown): boolean => error instanceof Error && error.name === "AbortError"
const getFreshServerSnapshot = <T>(
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

const setServerSnapshot = <T>(
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


const readPublicCursorDisabled = () => {
  if (isServerRuntime) return false
  if (isPublicCursorDisabledCache !== null) return isPublicCursorDisabledCache

  try {
    isPublicCursorDisabledCache = window.sessionStorage.getItem(PUBLIC_CURSOR_DISABLED_SESSION_KEY) === "1"
  } catch {
    isPublicCursorDisabledCache = false
  }

  return isPublicCursorDisabledCache
}

const markPublicCursorDisabled = () => {
  isPublicCursorDisabledCache = true
  if (isServerRuntime) return

  try {
    window.sessionStorage.setItem(PUBLIC_CURSOR_DISABLED_SESSION_KEY, "1")
  } catch {
    // ignore storage permission/quota errors
  }
}

const recordRuntimeEndpoint = (path: string, paginationMode: "page" | "cursor") => {
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

const isAuthRequiredError = (error: unknown) =>
  error instanceof ApiError && (error.status === 401 || error.status === 403)

const toSortParam = (order: "asc" | "desc") => (order === "asc" ? "CREATED_AT_ASC" : "CREATED_AT")

const toValidPage = (page: number | undefined) => {
  if (!Number.isFinite(page)) return 1
  return Math.max(1, Math.trunc(page || 1))
}

const toValidPageSize = (pageSize: number | undefined) => {
  if (!Number.isFinite(pageSize)) return PAGE_SIZE
  return Math.min(30, Math.max(1, Math.trunc(pageSize || PAGE_SIZE)))
}

const buildExplorePath = ({
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

const buildSearchPath = ({
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

const buildFeedPath = ({
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

const buildFeedCursorPath = ({
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

const buildExploreCursorPath = ({
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

const buildBootstrapPath = ({
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

const buildRelatedByAuthorPath = ({
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

export const getPostsBootstrap = async ({
  tag = "",
  order = "desc",
  pageSize = PAGE_SIZE,
  signal,
}: {
  tag?: string
  order?: "asc" | "desc"
  pageSize?: number
  signal?: AbortSignal
}): Promise<PostsBootstrapResult> => {
  const endpoint = buildBootstrapPath({ tag, order, pageSize })
  recordRuntimeEndpoint(endpoint, "cursor")
  const canUseServerSnapshot = isServerRuntime && !signal
  const cachedSnapshot =
    canUseServerSnapshot
      ? getFreshServerSnapshot(postsBootstrapSsrCache, endpoint, POSTS_BOOTSTRAP_SSR_CACHE_TTL_MS)
      : null
  if (cachedSnapshot) return cachedSnapshot

  if (canUseServerSnapshot) {
    const pendingSnapshot = pendingPostsBootstrapPromises.get(endpoint)
    if (pendingSnapshot) return pendingSnapshot
  }

  const loadBootstrap = async (): Promise<PostsBootstrapResult> => {
    const response = await apiFetch<PostsBootstrapDto>(endpoint, { signal })
    const feed = response.feed
    return {
      posts: feed.content.map(mapPostDto),
      hasNext: feed.hasNext === true,
      nextCursor: typeof feed.nextCursor === "string" ? feed.nextCursor : null,
      pageSize: Number.isFinite(feed.pageSize) ? Math.max(1, Math.trunc(feed.pageSize)) : toValidPageSize(pageSize),
      tagCounts: response.tags.reduce<Record<string, number>>((acc, row) => {
        const normalizedTag = normalizeTagQuery(row.tag)
        if (!normalizedTag) return acc
        acc[normalizedTag] = Number.isFinite(row.count) ? row.count : 0
        return acc
      }, {}),
    }
  }

  if (!canUseServerSnapshot) {
    return loadBootstrap()
  }

  const snapshotPromise = (async () => {
    try {
      const nextSnapshot = await loadBootstrap()
      setServerSnapshot(
        postsBootstrapSsrCache,
        endpoint,
        nextSnapshot,
        POSTS_BOOTSTRAP_SSR_CACHE_MAX_ENTRIES
      )
      return nextSnapshot
    } catch (error) {
      const staleSnapshot = postsBootstrapSsrCache.get(endpoint)?.value
      if (staleSnapshot) return staleSnapshot
      throw error
    } finally {
      pendingPostsBootstrapPromises.delete(endpoint)
    }
  })()

  pendingPostsBootstrapPromises.set(endpoint, snapshotPromise)
  return snapshotPromise
}

export const getFeedPosts = async ({
  page = 1,
  pageSize = PAGE_SIZE,
  order = "desc",
}: {
  page?: number
  pageSize?: number
  order?: "asc" | "desc"
} = {}): Promise<TPost[]> => {
  const { posts } = await getFeedPostsPage({
    order,
    page,
    pageSize,
  })
  return posts
}

export const getExplorePosts = async ({
  kw = "",
  tag = "",
  order = "desc",
  page = 1,
  pageSize = PAGE_SIZE,
  signal,
}: ExplorePostsParams = {}): Promise<TPost[]> => {
  const { posts } = await getExplorePostsPage({
    kw,
    tag,
    order,
    page,
    pageSize,
    signal,
  })
  return posts
}

export const getExplorePostsPage = async ({
  kw = "",
  tag = "",
  order = "desc",
  page = 1,
  pageSize = PAGE_SIZE,
  signal,
}: ExplorePostsParams = {}): Promise<ExplorePostsPage> => {
  const fallbackPageNumber = toValidPage(page)
  const fallbackPageSize = toValidPageSize(pageSize)
  const response = await apiFetch<PageDto<ApiPostDto>>(
    (() => {
      const endpoint = buildExplorePath({
        kw,
        tag,
        order,
        page,
        pageSize,
      })
      recordRuntimeEndpoint(endpoint, "page")
      return endpoint
    })(),
    {
      signal,
    }
  )
  return {
    posts: response.content.map(mapPostDto),
    totalCount:
      typeof response?.pageable?.totalElements === "number" && Number.isFinite(response.pageable.totalElements)
        ? response.pageable.totalElements
        : response.content.length,
    pageNumber:
      typeof response?.pageable?.pageNumber === "number" && Number.isFinite(response.pageable.pageNumber)
        ? Math.max(1, Math.trunc(response.pageable.pageNumber))
        : fallbackPageNumber,
    pageSize:
      typeof response?.pageable?.pageSize === "number" && Number.isFinite(response.pageable.pageSize)
        ? Math.max(1, Math.trunc(response.pageable.pageSize))
        : fallbackPageSize,
    paginationMode: "page",
  }
}

export const getFeedPostsPage = async ({
  order = "desc",
  page = 1,
  pageSize = PAGE_SIZE,
  signal,
}: Pick<ExplorePostsParams, "order" | "page" | "pageSize" | "signal"> = {}): Promise<ExplorePostsPage> => {
  const fallbackPageNumber = toValidPage(page)
  const fallbackPageSize = toValidPageSize(pageSize)
  const response = await apiFetch<PageDto<ApiPostDto>>(
    (() => {
      const endpoint = buildFeedPath({
        order,
        page,
        pageSize,
      })
      recordRuntimeEndpoint(endpoint, "page")
      return endpoint
    })(),
    {
      signal,
    }
  )

  return {
    posts: response.content.map(mapPostDto),
    totalCount:
      typeof response?.pageable?.totalElements === "number" && Number.isFinite(response.pageable.totalElements)
        ? response.pageable.totalElements
        : response.content.length,
    pageNumber:
      typeof response?.pageable?.pageNumber === "number" && Number.isFinite(response.pageable.pageNumber)
        ? Math.max(1, Math.trunc(response.pageable.pageNumber))
        : fallbackPageNumber,
    pageSize:
      typeof response?.pageable?.pageSize === "number" && Number.isFinite(response.pageable.pageSize)
        ? Math.max(1, Math.trunc(response.pageable.pageSize))
        : fallbackPageSize,
    paginationMode: "page",
  }
}

export const getFeedPostsCursorPage = async ({
  order = "desc",
  pageSize = PAGE_SIZE,
  cursor,
  signal,
}: {
  order?: "asc" | "desc"
  pageSize?: number
  cursor?: string
  signal?: AbortSignal
}): Promise<ExplorePostsPage> => {
  const safePageSize = toValidPageSize(pageSize)
  const normalizedCursor = typeof cursor === "string" && cursor.trim() ? cursor.trim() : undefined
  if (!normalizedCursor && readPublicCursorDisabled()) {
    const fallback = await getFeedPostsPage({ order, page: 1, pageSize: safePageSize, signal })
    return {
      ...fallback,
      hasNext: fallback.pageNumber * fallback.pageSize < fallback.totalCount,
      nextCursor: null,
      paginationMode: "page",
    }
  }

  try {
    const response = await apiFetch<CursorPageDto<ApiPostDto>>(
      (() => {
        const endpoint = buildFeedCursorPath({
          order,
          pageSize: safePageSize,
          cursor: normalizedCursor,
        })
        recordRuntimeEndpoint(endpoint, "cursor")
        return endpoint
      })(),
      {
        signal,
      }
    )

    const mappedPosts = response.content.map(mapPostDto)
    return {
      posts: mappedPosts,
      totalCount: mappedPosts.length,
      pageNumber: 1,
      pageSize: safePageSize,
      hasNext: response.hasNext === true,
      nextCursor: typeof response.nextCursor === "string" ? response.nextCursor : null,
      paginationMode: "cursor",
    }
  } catch (error) {
    if (isAuthRequiredError(error)) {
      markPublicCursorDisabled()
    }

    // 커서 모드가 불안정할 때 홈 첫 진입이 깨지지 않도록 1페이지 API로 복구한다.
    if (!normalizedCursor) {
      const fallback = await getFeedPostsPage({ order, page: 1, pageSize: safePageSize, signal })
      return {
        ...fallback,
        hasNext: fallback.pageNumber * fallback.pageSize < fallback.totalCount,
        nextCursor: null,
        paginationMode: "page",
      }
    }

    if (isAbortError(error)) {
      throw error
    }
    return {
      posts: [],
      totalCount: 0,
      pageNumber: 1,
      pageSize: safePageSize,
      hasNext: false,
      nextCursor: null,
      paginationMode: "cursor",
    }
  }
}

export const getExplorePostsCursorPage = async ({
  tag = "",
  order = "desc",
  pageSize = PAGE_SIZE,
  cursor,
  signal,
}: {
  tag?: string
  order?: "asc" | "desc"
  pageSize?: number
  cursor?: string
  signal?: AbortSignal
}): Promise<ExplorePostsPage> => {
  const safePageSize = toValidPageSize(pageSize)
  const normalizedCursor = typeof cursor === "string" && cursor.trim() ? cursor.trim() : undefined
  if (!normalizedCursor && readPublicCursorDisabled()) {
    const fallback = await getExplorePostsPage({ kw: "", tag, order, page: 1, pageSize: safePageSize, signal })
    return {
      ...fallback,
      hasNext: fallback.pageNumber * fallback.pageSize < fallback.totalCount,
      nextCursor: null,
      paginationMode: "page",
    }
  }

  try {
    const response = await apiFetch<CursorPageDto<ApiPostDto>>(
      (() => {
        const endpoint = buildExploreCursorPath({
          tag,
          order,
          pageSize: safePageSize,
          cursor: normalizedCursor,
        })
        recordRuntimeEndpoint(endpoint, "cursor")
        return endpoint
      })(),
      {
        signal,
      }
    )

    const mappedPosts = response.content.map(mapPostDto)
    return {
      posts: mappedPosts,
      totalCount: mappedPosts.length,
      pageNumber: 1,
      pageSize: safePageSize,
      hasNext: response.hasNext === true,
      nextCursor: typeof response.nextCursor === "string" ? response.nextCursor : null,
      paginationMode: "cursor",
    }
  } catch (error) {
    if (isAuthRequiredError(error)) {
      markPublicCursorDisabled()
    }

    // 태그 탐색도 첫 진입 시 page API로 복구해 UX 단절을 막는다.
    if (!normalizedCursor) {
      const fallback = await getExplorePostsPage({ kw: "", tag, order, page: 1, pageSize: safePageSize, signal })
      return {
        ...fallback,
        hasNext: fallback.pageNumber * fallback.pageSize < fallback.totalCount,
        nextCursor: null,
        paginationMode: "page",
      }
    }

    if (isAbortError(error)) {
      throw error
    }
    return {
      posts: [],
      totalCount: 0,
      pageNumber: 1,
      pageSize: safePageSize,
      hasNext: false,
      nextCursor: null,
      paginationMode: "cursor",
    }
  }
}

export const getSearchPostsPage = async ({
  kw = "",
  order = "desc",
  page = 1,
  pageSize = PAGE_SIZE,
  signal,
}: ExplorePostsParams = {}): Promise<ExplorePostsPage> => {
  const fallbackPageNumber = toValidPage(page)
  const fallbackPageSize = toValidPageSize(pageSize)
  const response = await apiFetch<PageDto<ApiPostDto>>(
    (() => {
      const endpoint = buildSearchPath({
        kw,
        order,
        page,
        pageSize,
      })
      recordRuntimeEndpoint(endpoint, "page")
      return endpoint
    })(),
    {
      signal,
    }
  )
  return {
    posts: response.content.map(mapPostDto),
    totalCount:
      typeof response?.pageable?.totalElements === "number" && Number.isFinite(response.pageable.totalElements)
        ? response.pageable.totalElements
        : response.content.length,
    pageNumber:
      typeof response?.pageable?.pageNumber === "number" && Number.isFinite(response.pageable.pageNumber)
        ? Math.max(1, Math.trunc(response.pageable.pageNumber))
        : fallbackPageNumber,
    pageSize:
      typeof response?.pageable?.pageSize === "number" && Number.isFinite(response.pageable.pageSize)
        ? Math.max(1, Math.trunc(response.pageable.pageSize))
        : fallbackPageSize,
  }
}

export const getTagCounts = async (): Promise<Record<string, number>> => {
  const rows = await apiFetch<ApiTagCountDto[]>(POSTS_TAGS_API_PATH)
  return rows.reduce<Record<string, number>>((acc, row) => {
    const normalizedTag = normalizeTagQuery(row.tag)
    if (!normalizedTag) return acc
    acc[normalizedTag] = Number.isFinite(row.count) ? row.count : 0
    return acc
  }, {})
}

export const getRelatedPostsByAuthor = async ({
  authorId,
  excludePostId,
  limit = 4,
  signal,
}: {
  authorId: string | number
  excludePostId?: string | number
  limit?: number
  signal?: AbortSignal
}): Promise<TPost[]> => {
  const authorIdNumber = Number(authorId)
  if (!Number.isInteger(authorIdNumber) || authorIdNumber <= 0) return []

  const excludePostIdNumber = Number(excludePostId)
  const safeExcludePostId =
    Number.isInteger(excludePostIdNumber) && excludePostIdNumber > 0 ? excludePostIdNumber : undefined
  const safeLimit = Number.isFinite(limit) ? Math.min(12, Math.max(1, Math.trunc(limit))) : 4

  const rows = await apiFetch<ApiPostDto[]>(
    (() => {
      const endpoint = buildRelatedByAuthorPath({
        authorId: authorIdNumber,
        excludePostId: safeExcludePostId,
        limit: safeLimit,
      })
      recordRuntimeEndpoint(endpoint, "page")
      return endpoint
    })(),
    { signal }
  )

  return rows
    .map(mapPostDto)
    .filter((post) => (safeExcludePostId ? Number(post.id) !== safeExcludePostId : true))
    .slice(0, safeLimit)
}

export const getPosts = async (
  { throwOnError = false }: GetPostsOptions = {}
): Promise<TPost[]> => {
  const now = Date.now()
  if (isServerRuntime && postsCache && now - postsCacheAt < POSTS_CACHE_TTL_MS) {
    return postsCache
  }

  if (pendingPostsPromise) {
    return pendingPostsPromise
  }

  try {
    pendingPostsPromise = (async () => {
      const feedItems = await getFeedPosts({ page: 1, pageSize: PAGE_SIZE })

      if (isServerRuntime) {
        postsCache = feedItems
        postsCacheAt = Date.now()
      }

      return feedItems
    })()

    return await pendingPostsPromise
  } catch (error) {
    if (!throwOnError && isServerRuntime && postsCache) {
      return postsCache
    }

    if (process.env.NODE_ENV !== "production") {
      // 로그 위변조(CWE-117) 방지를 위해 사용자/원격 입력(error.message/url/body)은 로그에 포함하지 않는다.
      if (error instanceof ApiError) {
        console.error("[getPosts] backend request failed: api-status")
      } else if (isAbortError(error)) {
        console.error("[getPosts] backend request failed: abort")
      } else if (error instanceof Error) {
        console.error("[getPosts] backend request failed: runtime")
      } else {
        console.error("[getPosts] backend request failed: unknown")
      }
    }
    if (throwOnError) throw error
    return []
  } finally {
    pendingPostsPromise = null
  }
}


export const getPostDetailBySlug = async (slug: string): Promise<PostDetail | null> => {
  const postId = extractPostIdFromSlug(slug)
  if (!postId) return null

  try {
    const post = await apiFetch<ApiPostWithContentDto>(`/post/api/v1/posts/${postId}`)
    const mapped = mapPostDetail(post)

    // slug mismatch should 404 to avoid duplicate-url indexing.
    if (mapped.slug !== slug) return null

    return mapped
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
}

export const getPostDetailById = async (id: string): Promise<PostDetail | null> => {
  const postId = Number(id)
  if (!Number.isInteger(postId) || postId <= 0) return null
  const endpoint = `/post/api/v1/posts/${postId}`
  const canUseServerSnapshot = isServerRuntime
  const cachedSnapshot =
    canUseServerSnapshot
      ? getFreshServerSnapshot(postDetailSsrCache, endpoint, POST_DETAIL_SSR_CACHE_TTL_MS)
      : null
  if (cachedSnapshot) return cachedSnapshot

  if (canUseServerSnapshot) {
    const pendingSnapshot = pendingPostDetailPromises.get(endpoint)
    if (pendingSnapshot) return pendingSnapshot
  }

  const loadPostDetail = async () => {
    const post = await apiFetch<ApiPostWithContentDto>(endpoint)
    return mapPostDetail(post)
  }

  if (!canUseServerSnapshot) {
    try {
      return await loadPostDetail()
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return null
      }
      throw error
    }
  }

  const snapshotPromise = (async () => {
    try {
      const nextDetail = await loadPostDetail()
      setServerSnapshot(postDetailSsrCache, endpoint, nextDetail, POST_DETAIL_SSR_CACHE_MAX_ENTRIES)
      return nextDetail
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return null
      }
      const staleSnapshot = postDetailSsrCache.get(endpoint)?.value
      if (staleSnapshot) return staleSnapshot
      throw error
    } finally {
      pendingPostDetailPromises.delete(endpoint)
    }
  })()

  pendingPostDetailPromises.set(endpoint, snapshotPromise)
  return snapshotPromise
}
