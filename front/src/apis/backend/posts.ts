import { PostDetail, TPost } from "src/types"
import { normalizeCategoryValue } from "src/libs/utils"
import { apiFetch } from "./client"

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

const mapPostDto = (post: ApiPostDto): TPost => ({
  id: String(post.id),
  date: { start_date: post.createdAt.slice(0, 10) },
  type: ["Post"],
  slug: toSlug(post.id, post.title),
  summary: post.summary,
  author: [
    {
      id: String(post.authorId),
      name: post.authorUsername || post.authorName,
      profile_photo: post.authorProfileImgUrl,
    },
  ],
  title: post.title,
  thumbnail: post.thumbnail,
  ...(normalizeStringArray(post.tags).length > 0
    ? { tags: normalizeStringArray(post.tags) }
    : {}),
  ...(normalizeCategoryArray(post.category).length > 0
    ? { category: normalizeCategoryArray(post.category) }
    : {}),
  status: toStatus(post.published, post.listed),
  createdTime: post.createdAt,
  modifiedTime: post.modifiedAt,
  fullWidth: false,
  actorHasLiked: post.actorHasLiked,
})

const mapPostDetail = (post: ApiPostWithContentDto): PostDetail => {
  const parsed = parsePostMeta(post.content)
  const dtoTags = normalizeStringArray(post.tags)
  const dtoCategories = normalizeCategoryArray(post.category)
  const tags = dtoTags.length > 0 ? dtoTags : parsed.tags
  const category = dtoCategories.length > 0 ? dtoCategories : parsed.category
  const normalizedContent = parsed.content

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
      summary: toSummary(normalizedContent),
      tags,
      category,
      published: post.published,
      listed: post.listed,
    }),
    ...(tags.length > 0 ? { tags } : {}),
    ...(category.length > 0 ? { category } : {}),
    summary: toSummary(normalizedContent),
    content: normalizedContent,
    modifiedTime: post.modifiedAt,
    likesCount: post.likesCount,
    commentsCount: post.commentsCount,
    hitCount: post.hitCount,
    actorHasLiked: post.actorHasLiked,
    actorCanModify: post.actorCanModify,
    actorCanDelete: post.actorCanDelete,
  }
}

const PAGE_SIZE = 30
const PAGE_FETCH_CONCURRENCY = 3
const DETAIL_ENRICH_BATCH_SIZE = 8
const DETAIL_ENRICH_MAX_TARGETS = 12
const POSTS_CACHE_TTL_MS = 10_000
const isServerRuntime = typeof window === "undefined"
let postsCache: TPost[] | null = null
let postsCacheAt = 0
let pendingPostsPromise: Promise<TPost[]> | null = null

const enrichPostMetadata = async (posts: TPost[]): Promise<TPost[]> => {
  const targets = posts.filter(
    (post) =>
      (!post.tags || post.tags.length === 0) &&
      (!post.category || post.category.length === 0)
  )
  if (!targets.length) return posts
  const limitedTargets = targets.slice(0, DETAIL_ENRICH_MAX_TARGETS)

  const metadataById = new Map<string, { tags: string[]; category: string[] }>()

  for (let i = 0; i < limitedTargets.length; i += DETAIL_ENRICH_BATCH_SIZE) {
    const batch = limitedTargets.slice(i, i + DETAIL_ENRICH_BATCH_SIZE)
    const settled = await Promise.allSettled(
      batch.map(async (post) => {
        const detail = await apiFetch<ApiPostWithContentDto>(`/post/api/v1/posts/${post.id}`)
        const parsed = parsePostMeta(detail.content)
        return {
          id: post.id,
          tags: normalizeStringArray(detail.tags).length
            ? normalizeStringArray(detail.tags)
            : parsed.tags,
          category: normalizeStringArray(detail.category).length
            ? normalizeStringArray(detail.category)
            : parsed.category,
        }
      })
    )

    settled.forEach((result) => {
      if (result.status !== "fulfilled") return
      metadataById.set(result.value.id, {
        tags: result.value.tags,
        category: result.value.category,
      })
    })
  }

  return posts.map((post) => {
    const metadata = metadataById.get(post.id)
    if (!metadata) return post

    return {
      ...post,
      ...(metadata.tags.length > 0 ? { tags: metadata.tags } : {}),
      ...(metadata.category.length > 0 ? { category: metadata.category } : {}),
    }
  })
}

type GetPostsOptions = {
  throwOnError?: boolean
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
      const firstPage = await apiFetch<PageDto<ApiPostDto>>(
        `/post/api/v1/posts?page=1&pageSize=${PAGE_SIZE}`
      )

      const mapped = firstPage.content.map(mapPostDto)
      const totalPages = Math.max(1, firstPage.pageable.totalPages)

      if (totalPages <= 1) {
        const enriched = await enrichPostMetadata(mapped)
        if (isServerRuntime) {
          postsCache = enriched
          postsCacheAt = Date.now()
        }
        return enriched
      }

      const restPages: PageDto<ApiPostDto>[] = []
      const pageNumbers = Array.from({ length: totalPages - 1 }, (_, index) => index + 2)

      for (let index = 0; index < pageNumbers.length; index += PAGE_FETCH_CONCURRENCY) {
        const batch = pageNumbers.slice(index, index + PAGE_FETCH_CONCURRENCY)
        const fetched = await Promise.all(
          batch.map((pageNumber) =>
            apiFetch<PageDto<ApiPostDto>>(
              `/post/api/v1/posts?page=${pageNumber}&pageSize=${PAGE_SIZE}`
            )
          )
        )
        restPages.push(...fetched)
      }

      const allPosts = mapped.concat(restPages.flatMap((page) => page.content.map(mapPostDto)))
      const enriched = await enrichPostMetadata(allPosts)

      if (isServerRuntime) {
        postsCache = enriched
        postsCacheAt = Date.now()
      }

      return enriched
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
  } catch {
    return null
  }
}

export const getPostDetailById = async (id: string): Promise<PostDetail | null> => {
  const postId = Number(id)
  if (!Number.isInteger(postId) || postId <= 0) return null

  try {
    const post = await apiFetch<ApiPostWithContentDto>(`/post/api/v1/posts/${postId}`)
    return mapPostDetail(post)
  } catch {
    return null
  }
}
