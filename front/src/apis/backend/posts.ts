import { PostDetail, TPost } from "src/types"
import { normalizeCategoryValue } from "src/libs/utils"
import { ApiError, apiFetch } from "./client"

type PageDto<T> = {
  content: T[]
  pageable: {
    pageNumber: number
    pageSize: number
    totalElements: number
    totalPages: number
  }
}

type ApiPostDto = {
  id: number
  createdAt: string
  modifiedAt: string
  authorId: number
  authorName: string
  authorUsername?: string
  authorProfileImgUrl: string
  title: string
  thumbnail?: string
  summary?: string
  tags?: string[]
  category?: string[]
  published: boolean
  listed: boolean
  likesCount?: number
  commentsCount?: number
  hitCount?: number
  actorHasLiked?: boolean
}

type ApiPostWithContentDto = {
  id: number
  createdAt: string
  modifiedAt: string
  authorId: number
  authorName: string
  authorUsername?: string
  authorProfileImageUrl?: string
  authorProfileImageDirectUrl?: string
  authorProfileImgUrl?: string
  title: string
  content: string
  contentHtml?: string
  tags?: string[]
  category?: string[]
  published: boolean
  listed: boolean
  likesCount: number
  commentsCount: number
  hitCount: number
  actorHasLiked?: boolean
  actorCanModify?: boolean
  actorCanDelete?: boolean
}

type ApiTagCountDto = {
  tag: string
  count: number
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")

const stripMarkdown = (value: string) =>
  value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[(.*?)\]\((.*?)\)/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/[#>*_~-]/g, "")
    .replace(/\s+/g, " ")
    .trim()

const normalizeMetaItems = (raw: string): string[] => {
  const normalized = raw.trim().replace(/^\[|\]$/g, "")
  if (!normalized) return []

  const tokens = normalized
    .split(",")
    .map((token) => token.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean)

  return Array.from(new Set(tokens))
}

type ParsedPostMeta = {
  content: string
  tags: string[]
  category: string[]
}

const parsePostMeta = (content: string): ParsedPostMeta => {
  let trimmed = content.trimStart()
  const tags: string[] = []
  const categories: string[] = []

  const pushTags = (items: string[]) => {
    items.forEach((item) => {
      if (!tags.includes(item)) tags.push(item)
    })
  }
  const pushCategories = (items: string[]) => {
    items.map(normalizeCategoryValue).forEach((item) => {
      if (!categories.includes(item)) categories.push(item)
    })
  }

  if (trimmed.startsWith("---\n")) {
    const closingIndex = trimmed.indexOf("\n---", 4)
    if (closingIndex > 0) {
      const block = trimmed.slice(4, closingIndex).split("\n")
      block.forEach((line) => {
        const [rawKey, ...rest] = line.split(":")
        if (!rawKey || rest.length === 0) return
        const key = rawKey.trim().toLowerCase()
        const value = rest.join(":").trim()
        if (!value) return

        if (key === "tags" || key === "tag") pushTags(normalizeMetaItems(value))
        if (key === "category" || key === "categories") {
          pushCategories(normalizeMetaItems(value))
        }
      })
      trimmed = trimmed.slice(closingIndex + 4).trimStart()
    }
  }

  const lines = trimmed.split("\n")
  const metadataLineRegex = /^\s*(tags?|categories?)\s*:\s*(.+)\s*$/i
  let consumed = 0
  for (const line of lines) {
    if (!line.trim()) {
      consumed += 1
      break
    }
    const match = line.match(metadataLineRegex)
    if (!match) break
    const key = match[1].toLowerCase()
    const value = match[2]
    if (key === "tag" || key === "tags") pushTags(normalizeMetaItems(value))
    if (key === "category" || key === "categories") {
      pushCategories(normalizeMetaItems(value))
    }
    consumed += 1
  }

  if (consumed > 0) {
    const rest = lines.slice(consumed).join("\n").trimStart()
    trimmed = rest
  }

  return { content: trimmed, tags, category: categories }
}

const toSummary = (content: string, maxLength = 180) => {
  const plain = stripMarkdown(content)
  if (plain.length <= maxLength) return plain
  return `${plain.slice(0, maxLength).trim()}...`
}

const toStatus = (published: boolean, listed: boolean): TPost["status"] => {
  if (!published) return ["Private"]
  if (listed) return ["Public"]
  return ["PublicOnDetail"]
}

const toSlug = (id: number, title: string) => {
  const normalized = slugify(title)
  return normalized ? `${normalized}-${id}` : `${id}`
}

const normalizeStringArray = (value?: string[]) => {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    )
  )
}

const normalizeCategoryArray = (value?: string[]) =>
  normalizeStringArray(value).map(normalizeCategoryValue)

const mapPostDto = (post: ApiPostDto): TPost => {
  const normalizedTags = normalizeStringArray(post.tags)
  const normalizedCategories = normalizeCategoryArray(post.category)
  const hasSummary = typeof post.summary === "string" && post.summary.trim().length > 0
  const hasThumbnail = typeof post.thumbnail === "string" && post.thumbnail.trim().length > 0
  const hasActorHasLiked = typeof post.actorHasLiked === "boolean"

  return {
    id: String(post.id),
    date: { start_date: post.createdAt.slice(0, 10) },
    type: ["Post"],
    slug: toSlug(post.id, post.title),
    ...(hasSummary ? { summary: post.summary } : {}),
    author: [
      {
        id: String(post.authorId),
        name: post.authorUsername || post.authorName,
        profile_photo: post.authorProfileImgUrl,
      },
    ],
    title: post.title,
    ...(hasThumbnail ? { thumbnail: post.thumbnail } : {}),
    ...(normalizedTags.length > 0 ? { tags: normalizedTags } : {}),
    ...(normalizedCategories.length > 0 ? { category: normalizedCategories } : {}),
    status: toStatus(post.published, post.listed),
    createdTime: post.createdAt,
    modifiedTime: post.modifiedAt,
    fullWidth: false,
    likesCount: post.likesCount ?? 0,
    commentsCount: post.commentsCount ?? 0,
    hitCount: post.hitCount ?? 0,
    ...(hasActorHasLiked ? { actorHasLiked: post.actorHasLiked } : {}),
  }
}

const mapPostDetail = (post: ApiPostWithContentDto): PostDetail => {
  const parsed = parsePostMeta(post.content)
  const dtoTags = normalizeStringArray(post.tags)
  const dtoCategories = normalizeCategoryArray(post.category)
  const tags = dtoTags.length > 0 ? dtoTags : parsed.tags
  const category = dtoCategories.length > 0 ? dtoCategories : parsed.category
  const normalizedContent = parsed.content
  const summary = toSummary(normalizedContent)

  const hasActorHasLiked = typeof post.actorHasLiked === "boolean"
  const hasActorCanModify = typeof post.actorCanModify === "boolean"
  const hasActorCanDelete = typeof post.actorCanDelete === "boolean"

  return {
    ...mapPostDto({
      id: post.id,
      createdAt: post.createdAt,
      modifiedAt: post.modifiedAt,
      authorId: post.authorId,
      authorName: post.authorName,
      authorUsername: post.authorUsername,
      authorProfileImgUrl:
        post.authorProfileImageDirectUrl || post.authorProfileImageUrl || post.authorProfileImgUrl || "",
      title: post.title,
      summary,
      tags,
      category,
      published: post.published,
      listed: post.listed,
    }),
    ...(tags.length > 0 ? { tags } : {}),
    ...(category.length > 0 ? { category } : {}),
    summary,
    content: normalizedContent,
    ...(post.contentHtml ? { contentHtml: post.contentHtml } : {}),
    modifiedTime: post.modifiedAt,
    likesCount: post.likesCount,
    commentsCount: post.commentsCount,
    hitCount: post.hitCount,
    ...(hasActorHasLiked ? { actorHasLiked: post.actorHasLiked } : {}),
    ...(hasActorCanModify ? { actorCanModify: post.actorCanModify } : {}),
    ...(hasActorCanDelete ? { actorCanDelete: post.actorCanDelete } : {}),
  }
}

const PAGE_SIZE = 30
const POSTS_CACHE_TTL_MS = 90_000
const isServerRuntime = typeof window === "undefined"
let postsCache: TPost[] | null = null
let postsCacheAt = 0
let pendingPostsPromise: Promise<TPost[]> | null = null

type GetPostsOptions = {
  throwOnError?: boolean
}

export type ExplorePostsParams = {
  kw?: string
  tag?: string
  order?: "asc" | "desc"
  page?: number
  pageSize?: number
  signal?: AbortSignal
}

export type ExplorePostsPage = {
  posts: TPost[]
  totalCount: number
  pageNumber: number
  pageSize: number
}

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
  const params = new URLSearchParams()
  params.set("kw", kw.trim())
  params.set("tag", tag.trim())
  params.set("sort", toSortParam(order))
  params.set("page", String(toValidPage(page)))
  params.set("pageSize", String(toValidPageSize(pageSize)))
  return `/post/api/v1/posts/explore?${params.toString()}`
}

const buildSearchPath = ({
  kw = "",
  order = "desc",
  page = 1,
  pageSize = PAGE_SIZE,
}: ExplorePostsParams) => {
  const params = new URLSearchParams()
  params.set("kw", kw.trim())
  params.set("sort", toSortParam(order))
  params.set("page", String(toValidPage(page)))
  params.set("pageSize", String(toValidPageSize(pageSize)))
  return `/post/api/v1/posts/search?${params.toString()}`
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
  return `/post/api/v1/posts/feed?${params.toString()}`
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
    buildExplorePath({
      kw,
      tag,
      order,
      page,
      pageSize,
    }),
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

export const getFeedPostsPage = async ({
  order = "desc",
  page = 1,
  pageSize = PAGE_SIZE,
  signal,
}: Pick<ExplorePostsParams, "order" | "page" | "pageSize" | "signal"> = {}): Promise<ExplorePostsPage> => {
  const fallbackPageNumber = toValidPage(page)
  const fallbackPageSize = toValidPageSize(pageSize)
  const response = await apiFetch<PageDto<ApiPostDto>>(
    buildFeedPath({
      order,
      page,
      pageSize,
    }),
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
    buildSearchPath({
      kw,
      order,
      page,
      pageSize,
    }),
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
  const rows = await apiFetch<ApiTagCountDto[]>("/post/api/v1/posts/tags")
  return rows.reduce<Record<string, number>>((acc, row) => {
    const normalizedTag = typeof row.tag === "string" ? row.tag.trim() : ""
    if (!normalizedTag) return acc
    acc[normalizedTag] = Number.isFinite(row.count) ? row.count : 0
    return acc
  }, {})
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
      console.error("[getPosts] backend request failed:", error)
    }
    if (throwOnError) throw error
    return []
  } finally {
    pendingPostsPromise = null
  }
}

const extractPostIdFromSlug = (slug: string): number | null => {
  const tail = slug.split("-").pop() || ""
  const id = Number(tail)
  return Number.isInteger(id) && id > 0 ? id : null
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

  try {
    const post = await apiFetch<ApiPostWithContentDto>(`/post/api/v1/posts/${postId}`)
    return mapPostDetail(post)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
}
