import type { TPost } from "src/types"

export type PageDto<T> = {
  content: T[]
  pageable: {
    pageNumber: number
    pageSize: number
    totalElements: number
    totalPages: number
  }
}

export type CursorPageDto<T> = {
  content: T[]
  pageSize: number
  hasNext: boolean
  nextCursor?: string | null
}

export type PostsBootstrapDto = {
  feed: CursorPageDto<ApiPostDto>
  tags: ApiTagCountDto[]
}

export type ApiPostDto = {
  id: number
  createdAt: string
  modifiedAt: string
  authorId: number
  authorName: string
  authorUsername?: string
  authorProfileImgUrl: string
  authorProfileImageUrl?: string
  authorProfileImageDirectUrl?: string
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

export type ApiPostWithContentDto = {
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

export type ApiTagCountDto = {
  tag: string
  count: number
}

export type ExplorePostsParams = {
  kw?: string
  tag?: string
  order?: "asc" | "desc"
  page?: number
  pageSize?: number
  signal?: AbortSignal
}

export type PostsBootstrapResult = {
  posts: TPost[]
  hasNext: boolean
  nextCursor: string | null
  pageSize: number
  tagCounts: Record<string, number>
}

export type ExplorePostsPage = {
  posts: TPost[]
  totalCount: number
  pageNumber: number
  pageSize: number
  hasNext?: boolean
  nextCursor?: string | null
  paginationMode?: "cursor" | "page"
}
