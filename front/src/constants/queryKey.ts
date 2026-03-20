export const queryKey = {
  scheme: () => ["scheme"] as const,
  authMe: () => ["auth", "me"] as const,
  adminProfile: () => ["member", "adminProfile"] as const,
  postsExplore: (params: {
    kw: string
    tag?: string
    page: number
    pageSize: number
    order?: "asc" | "desc"
  }) => {
    const normalizedKw = params.kw.trim()
    const normalizedTag = typeof params.tag === "string" ? params.tag.trim() : ""
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
    const normalizedKw = params.kw.trim()
    const normalizedTag = typeof params.tag === "string" ? params.tag.trim() : ""
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
    const normalizedKw = params.kw.trim()
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
} as const
