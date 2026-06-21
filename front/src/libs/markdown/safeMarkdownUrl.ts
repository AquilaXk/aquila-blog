const EXTERNAL_PLACEHOLDER_IMAGE_HOSTS = new Set(
  [
    ["placehold", "co"],
    ["via", "placeholder", "com"],
    [["pic", "sum"].join(""), "photos"],
    [["dummy", "image"].join(""), "com"],
    ["source", "unsplash", "com"],
    ["place", "kitten", "com"],
    ["lorem", "flickr", "com"],
  ].map((parts) => parts.join(".")),
)

const isExternalPlaceholderImageHost = (host: string): boolean => {
  const normalizedHost = host.toLowerCase()
  return Array.from(EXTERNAL_PLACEHOLDER_IMAGE_HOSTS).some(
    (blockedHost) => normalizedHost === blockedHost || normalizedHost.endsWith(`.${blockedHost}`),
  )
}

export const normalizeSafeMarkdownUrl = (raw: string): string => {
  const value = raw.trim()
  if (!value) return ""

  if (value.startsWith("/")) {
    return value.startsWith("//") ? "" : value
  }

  if (value.startsWith("./") || value.startsWith("../")) {
    return value
  }

  try {
    const parsed = new URL(value)
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString()
    }
  } catch {
    return ""
  }

  return ""
}

export const normalizeSafeMarkdownImageSrc = (raw: string): string => {
  const normalized = normalizeSafeMarkdownUrl(raw)
  if (!normalized || normalized.startsWith("/") || normalized.startsWith("./") || normalized.startsWith("../")) {
    return normalized
  }

  try {
    const parsed = new URL(normalized)
    return isExternalPlaceholderImageHost(parsed.hostname) ? "" : normalized
  } catch {
    return ""
  }
}
