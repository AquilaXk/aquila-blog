export const queryKey = {
  scheme: () => ["scheme"] as const,
  authMe: () => ["auth", "me"] as const,
  adminProfile: () => ["member", "adminProfile"] as const,
  posts: () => ["posts"] as const,
  postsExplore: (params: {
    kw: string
    tag?: string
    page: number
    pageSize: number
  }) => {
    const normalizedTag = typeof params.tag === "string" ? params.tag.trim() : ""
    return [
      "posts",
      "explore",
      {
        kw: params.kw,
        page: params.page,
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
