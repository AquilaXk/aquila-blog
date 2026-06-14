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

export const normalizeSafeMarkdownImageSrc = normalizeSafeMarkdownUrl
