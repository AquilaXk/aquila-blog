export type UnfurlMetadata = {
  url: string
  title: string
  description: string
  siteName: string
  provider: string
  thumbnailUrl: string
  embedUrl?: string
}

const META_PATTERNS = [
  /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["'][^>]*>/i,
  /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']*)["'][^>]*>/i,
  /<title[^>]*>([^<]*)<\/title>/i,
] as const

const DESCRIPTION_PATTERNS = [
  /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["'][^>]*>/i,
  /<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']*)["'][^>]*>/i,
  /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i,
] as const

const SITE_NAME_PATTERNS = [
  /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']*)["'][^>]*>/i,
  /<meta[^>]+name=["']application-name["'][^>]+content=["']([^"']*)["'][^>]*>/i,
] as const

const IMAGE_PATTERNS = [
  /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']*)["'][^>]*>/i,
  /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']*)["'][^>]*>/i,
] as const

const htmlDecode = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .trim()

const firstMatch = (html: string, patterns: readonly RegExp[]) => {
  for (const pattern of patterns) {
    const match = html.match(pattern)
    const value = match?.[1]?.trim()
    if (value) return htmlDecode(value)
  }
  return ""
}

const humanizeHost = (hostname: string) =>
  hostname
    .replace(/^www\./i, "")
    .split(".")
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(".")

export const inferLinkProvider = (url: string) => {
  try {
    const parsedUrl = new URL(url)
    const host = parsedUrl.hostname.replace(/^www\./i, "").toLowerCase()

    if (host === "youtube.com" || host === "youtu.be") return "YouTube"
    if (host === "vimeo.com") return "Vimeo"
    if (host.endsWith("loom.com")) return "Loom"
    if (host.endsWith("figma.com")) return "Figma"
    if (host.endsWith("codepen.io")) return "CodePen"
    if (host.endsWith("codesandbox.io")) return "CodeSandbox"
    if (host.endsWith("github.com")) return "GitHub"
    if (host.endsWith("notion.so") || host.endsWith("notion.site")) return "Notion"
    if (host.endsWith("medium.com")) return "Medium"

    return humanizeHost(parsedUrl.hostname)
  } catch {
    return ""
  }
}

export const resolveEmbedPreviewUrl = (url: string) => {
  try {
    const parsedUrl = new URL(url)
    const host = parsedUrl.hostname.replace(/^www\./i, "").toLowerCase()

    if (host === "youtube.com" || host === "youtu.be") {
      const videoId =
        host === "youtu.be"
          ? parsedUrl.pathname.replace(/^\/+/, "")
          : parsedUrl.searchParams.get("v") || ""
      return videoId ? `https://www.youtube.com/embed/${videoId}` : ""
    }

    if (host === "vimeo.com") {
      const videoId = parsedUrl.pathname.replace(/^\/+/, "")
      return videoId ? `https://player.vimeo.com/video/${videoId}` : ""
    }

    if (host.endsWith("loom.com")) {
      const loomId = parsedUrl.pathname.split("/").filter(Boolean).pop() || ""
      return loomId ? `https://www.loom.com/embed/${loomId}` : ""
    }

    if (host.endsWith("figma.com")) {
      return `https://www.figma.com/embed?embed_host=aquila-blog&url=${encodeURIComponent(parsedUrl.toString())}`
    }

    if (host.endsWith("codepen.io")) {
      const parts = parsedUrl.pathname.split("/").filter(Boolean)
      if (parts.length >= 3 && parts[1] === "pen") {
        return `https://codepen.io/${parts[0]}/embed/${parts[2]}?default-tab=result`
      }
    }

    if (host.endsWith("codesandbox.io")) {
      if (parsedUrl.pathname.startsWith("/s/")) {
        return `https://codesandbox.io/embed${parsedUrl.pathname}?view=preview`
      }
    }
  } catch {
    return ""
  }

  return ""
}

export const formatReadableFileSize = (sizeBytes?: number | null) => {
  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes <= 0) return ""
  const units = ["B", "KB", "MB", "GB"]
  let value = sizeBytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const precision = value >= 10 || unitIndex === 0 ? 0 : 1
  return `${value.toFixed(precision)} ${units[unitIndex]}`
}

export const extractUnfurlMetadata = (url: string, html: string): UnfurlMetadata => {
  const parsedUrl = new URL(url)
  const siteName = firstMatch(html, SITE_NAME_PATTERNS) || humanizeHost(parsedUrl.hostname)
  const provider = inferLinkProvider(url) || siteName
  const embedUrl = resolveEmbedPreviewUrl(url)
  const thumbnailCandidate = firstMatch(html, IMAGE_PATTERNS)
  const thumbnailUrl = thumbnailCandidate
    ? new URL(thumbnailCandidate, parsedUrl).toString()
    : ""

  return {
    url,
    title: firstMatch(html, META_PATTERNS) || humanizeHost(parsedUrl.hostname),
    description: firstMatch(html, DESCRIPTION_PATTERNS),
    siteName,
    provider,
    thumbnailUrl,
    ...(embedUrl ? { embedUrl } : {}),
  }
}
