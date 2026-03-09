import { PostDetail, TPost } from "src/types"
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
  authorProfileImgUrl: string
  title: string
  summary?: string
  published: boolean
  listed: boolean
}

type ApiPostWithContentDto = {
  id: number
  createdAt: string
  modifiedAt: string
  authorId: number
  authorName: string
  authorProfileImageUrl?: string
  authorProfileImgUrl?: string
  title: string
  content: string
  published: boolean
  listed: boolean
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
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/[#>*_~-]/g, "")
    .replace(/\s+/g, " ")
    .trim()

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

const mapPostDto = (post: ApiPostDto): TPost => ({
  id: String(post.id),
  date: { start_date: post.createdAt.slice(0, 10) },
  type: ["Post"],
  slug: toSlug(post.id, post.title),
  summary: post.summary,
  author: [
    {
      id: String(post.authorId),
      name: post.authorName,
      profile_photo: post.authorProfileImgUrl,
    },
  ],
  title: post.title,
  status: toStatus(post.published, post.listed),
  createdTime: post.createdAt,
  fullWidth: false,
})

const mapPostDetail = (post: ApiPostWithContentDto): PostDetail => ({
  ...mapPostDto({
    id: post.id,
    createdAt: post.createdAt,
    modifiedAt: post.modifiedAt,
    authorId: post.authorId,
    authorName: post.authorName,
    authorProfileImgUrl:
      post.authorProfileImageUrl || post.authorProfileImgUrl || "",
    title: post.title,
    published: post.published,
    listed: post.listed,
  }),
  summary: toSummary(post.content),
  content: post.content,
})

const PAGE_SIZE = 30

export const getPosts = async (): Promise<TPost[]> => {
  const firstPage = await apiFetch<PageDto<ApiPostDto>>(
    `/post/api/v1/posts?page=1&pageSize=${PAGE_SIZE}`
  )

  const mapped = firstPage.content.map(mapPostDto)
  if (firstPage.pageable.totalPages <= 1) return mapped

  const restPages = await Promise.all(
    Array.from({ length: firstPage.pageable.totalPages - 1 }, (_, index) =>
      apiFetch<PageDto<ApiPostDto>>(
        `/post/api/v1/posts?page=${index + 2}&pageSize=${PAGE_SIZE}`
      )
    )
  )

  return mapped.concat(restPages.flatMap((page) => page.content.map(mapPostDto)))
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
