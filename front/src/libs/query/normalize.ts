const normalizeUnicode = (value: string) => {
  if (typeof value.normalize !== "function") return value
  return value.normalize("NFKC")
}

const collapseWhitespace = (value: string) => value.replace(/\s+/g, " ")

const normalizeQueryText = (value: string) => collapseWhitespace(normalizeUnicode(value).trim())

const SPACED_QUERY_KEYS = new Set(["kw", "tag", "q"])

export const normalizeKeywordQuery = (value: string) => normalizeQueryText(value)

export const normalizeTagQuery = (value: string | null | undefined) =>
  normalizeQueryText(typeof value === "string" ? value : "")

export const normalizeOptionalTagQuery = (value: string | null | undefined) => {
  const normalized = normalizeTagQuery(value)
  return normalized || undefined
}

export const normalizeShallowRouteValue = (key: string, value: string) => {
  if (SPACED_QUERY_KEYS.has(key)) return normalizeQueryText(value)
  return normalizeUnicode(value).trim()
}
