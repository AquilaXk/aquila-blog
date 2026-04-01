import { normalizeKeywordQuery, normalizeTagQuery } from "src/libs/query/normalize"

export const queryKey = {
  scheme: () => ["scheme"] as const,
  authMe: () => ["auth", "me"] as const,
  authMeProbe: () => ["auth", "me", "probe"] as const,
  adminProfile: () => ["member", "adminProfile"] as const,
  adminProfileWorkspace: (memberId: number) => ["member", "adminProfile", "workspace", memberId] as const,
  postsExplore: (params: {
    kw: string
    tag?: string
    page: number
    pageSize: number
    order?: "asc" | "desc"
  }) => {
    const normalizedKw = normalizeKeywordQuery(params.kw)
    const normalizedTag = normalizeTagQuery(params.tag)
    const normalizedOrder = params.order === "asc" ? "asc" : "desc"
    return [
      "posts",
      "explore",
      {
        kw: normalizedKw,
        page: params.page,
        pageSize: params.pageSize,
        order: normalizedOrder,
        ...(normalizedTag ? { tag: normalizedTag } : {}),
      },
    ] as const
  },
  postsExploreInfinite: (params: {
    kw: string
    tag?: string
    pageSize: number
    order?: "asc" | "desc"
  }) => {
    const normalizedKw = normalizeKeywordQuery(params.kw)
    const normalizedTag = normalizeTagQuery(params.tag)
    const normalizedOrder = params.order === "asc" ? "asc" : "desc"
    return [
      "posts",
      "explore",
      "infinite",
      {
        kw: normalizedKw,
        pageSize: params.pageSize,
        order: normalizedOrder,
        ...(normalizedTag ? { tag: normalizedTag } : {}),
      },
    ] as const
  },
  postsFeedInfinite: (params: { pageSize: number; order?: "asc" | "desc" }) => {
    const normalizedOrder = params.order === "asc" ? "asc" : "desc"
    return [
      "posts",
      "feed",
      "infinite",
      {
        pageSize: params.pageSize,
        order: normalizedOrder,
      },
    ] as const
  },
  postsSearchInfinite: (params: {
    kw: string
    pageSize: number
    order?: "asc" | "desc"
  }) => {
    const normalizedKw = normalizeKeywordQuery(params.kw)
    const normalizedOrder = params.order === "asc" ? "asc" : "desc"
    return [
      "posts",
      "search",
      "infinite",
      {
        kw: normalizedKw,
        pageSize: params.pageSize,
        order: normalizedOrder,
      },
    ] as const
  },
  postsTotalCount: () => ["posts", "totalCount"] as const,
  tags: () => ["tags"] as const,
  categories: () => ["categories"] as const,
  post: (postId: string) => ["post", postId] as const,
  postsRelatedByAuthor: (params: {
    authorId: string
    excludePostId?: string
    limit: number
  }) =>
    [
      "posts",
      "related",
      "author",
      {
        authorId: params.authorId.trim(),
        excludePostId: params.excludePostId?.trim() || "",
        limit: Math.max(1, Math.trunc(params.limit)),
      },
    ] as const,
} as const
