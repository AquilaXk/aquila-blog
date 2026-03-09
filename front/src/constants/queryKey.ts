export const queryKey = {
  scheme: () => ["scheme"] as const,
  posts: () => ["posts"] as const,
  tags: () => ["tags"] as const,
  categories: () => ["categories"] as const,
  post: (slug: string) => ["post", slug] as const,
} as const
