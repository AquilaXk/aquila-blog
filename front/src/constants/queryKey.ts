export const queryKey = {
  scheme: () => ["scheme"] as const,
  authMe: () => ["auth", "me"] as const,
  adminProfile: () => ["member", "adminProfile"] as const,
  posts: () => ["posts"] as const,
  postsExplore: (params: {
    kw: string
    tag?: string
    order: "asc" | "desc"
    page: number
    pageSize: number
  }) => ["posts", "explore", params] as const,
  tags: () => ["tags"] as const,
  categories: () => ["categories"] as const,
  post: (postId: string) => ["post", postId] as const,
} as const
