export const queryKey = {
  scheme: () => ["scheme"] as const,
  authMe: () => ["auth", "me"] as const,
  adminProfile: () => ["member", "adminProfile"] as const,
  postsExplore: (params: {
    kw: string
    tag?: string
    page: number
    pageSize: number
  }) => {
    const normalizedKw = params.kw.trim()
    const normalizedTag = typeof params.tag === "string" ? params.tag.trim() : ""
    return [
      "posts",
      "explore",
      {
        kw: normalizedKw,
        page: params.page,
        pageSize: params.pageSize,
        ...(normalizedTag ? { tag: normalizedTag } : {}),
      },
    ] as const
  },
  postsExploreInfinite: (params: {
    kw: string
    tag?: string
    pageSize: number
  }) => {
    const normalizedKw = params.kw.trim()
    const normalizedTag = typeof params.tag === "string" ? params.tag.trim() : ""
    return [
      "posts",
      "explore",
      "infinite",
      {
        kw: normalizedKw,
        pageSize: params.pageSize,
        ...(normalizedTag ? { tag: normalizedTag } : {}),
      },
    ] as const
  },
  postsTotalCount: () => ["posts", "totalCount"] as const,
  tags: () => ["tags"] as const,
  categories: () => ["categories"] as const,
  post: (postId: string) => ["post", postId] as const,
} as const
