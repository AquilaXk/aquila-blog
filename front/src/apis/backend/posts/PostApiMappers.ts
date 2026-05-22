import type { PostDetail, TPost } from "src/types"
import { normalizeCategoryValue } from "src/libs/utils"
import type { ApiPostDto, ApiPostWithContentDto } from "./PostApiDtos"

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

const pickPreferredImageUrl = (...candidates: Array<string | undefined>) => {
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue
    const normalized = candidate.trim()
    if (normalized.length > 0) return normalized
  }
  return ""
}

const isAbortError = (error: unknown): boolean => error instanceof Error && error.name === "AbortError"

export const mapPostDto = (post: ApiPostDto): TPost => {
  const normalizedTags = normalizeStringArray(post.tags)
  const normalizedCategories = normalizeCategoryArray(post.category)
  const hasSummary = typeof post.summary === "string" && post.summary.trim().length > 0
  const normalizedThumbnail = pickPreferredImageUrl(post.thumbnail)
  const hasThumbnail = normalizedThumbnail.length > 0
  const authorProfileImage = pickPreferredImageUrl(
    post.authorProfileImageDirectUrl,
    post.authorProfileImgUrl,
    post.authorProfileImageUrl
  )
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
        name: post.authorName || post.authorUsername || "익명",
        profile_photo: authorProfileImage,
      },
    ],
    title: post.title,
    ...(hasThumbnail ? { thumbnail: normalizedThumbnail } : {}),
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

export const mapPostDetail = (post: ApiPostWithContentDto): PostDetail => {
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
export const extractPostIdFromSlug = (slug: string): number | null => {
  const tail = slug.split("-").pop() || ""
  const id = Number(tail)
  return Number.isInteger(id) && id > 0 ? id : null
}
