export const dedupeStrings = (items: string[]) =>
  Array.from(
    new Set(
      items
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )

export const normalizeRecommendedTags = (value: unknown, maxTags: number) => {
  if (!Array.isArray(value)) return []
  const map = new Map<string, string>()
  value.forEach((item) => {
    if (typeof item !== "string") return
    const normalized = item.replace(/[\r\n]/g, " ").replace(/#/g, "").replace(/\s+/g, " ").trim()
    if (!normalized) return
    if (normalized.length < 2 || normalized.length > 24) return
    if (!/[\p{L}\p{N}]/u.test(normalized)) return
    if (normalized.toLowerCase() === "aside") return
    const key = normalized.toLowerCase()
    if (map.has(key) || map.size >= maxTags) return
    map.set(key, normalized)
  })
  return Array.from(map.values())
}
