export const toCanonicalPostPath = (id: string | number) => `/posts/${id}`

export const extractPostIdFromLegacySlug = (slug: string): number | null => {
  const tail = slug.split("-").pop() || slug
  const id = Number(tail)
  return Number.isInteger(id) && id > 0 ? id : null
}
