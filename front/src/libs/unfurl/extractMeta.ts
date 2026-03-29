export type UnfurlMetadata = {
  url: string
  title: string
  description: string
  siteName: string
  provider: string
  thumbnailUrl: string
  embedUrl?: string
}

const FILE_EXTENSION_PATTERN =
  /\.(?:pdf|doc|docx|xls|xlsx|ppt|pptx|zip|tar|gz|tgz|rar|7z|txt|csv|md|rtf|json|xml|yaml|yml|svg|psd|ai|sketch|fig|mp3|wav|ogg|mp4|mov|avi|mkv)$/i

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

const HTML_ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": "\"",
  "&#39;": "'",
}

const hostMatches = (hostname: string, suffix: string) =>
  hostname === suffix || hostname.endsWith(`.${suffix}`)

const htmlDecode = (value: string) =>
  value
    .replace(/&(amp|lt|gt|quot|#39);/g, (entity) => HTML_ENTITY_MAP[entity] || entity)
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
    if (hostMatches(host, "loom.com")) return "Loom"
    if (hostMatches(host, "figma.com")) return "Figma"
    if (hostMatches(host, "codepen.io")) return "CodePen"
    if (hostMatches(host, "codesandbox.io")) return "CodeSandbox"
    if (hostMatches(host, "github.com")) return "GitHub"
    if (hostMatches(host, "notion.so") || hostMatches(host, "notion.site")) return "Notion"
    if (hostMatches(host, "medium.com")) return "Medium"

    return humanizeHost(parsedUrl.hostname)
  } catch {
    return ""
  }
}

export const isLikelyFileUrl = (url: string) => {
  try {
    const parsedUrl = new URL(url)
    const pathname = parsedUrl.pathname.trim()
    if (!pathname) return false
    return FILE_EXTENSION_PATTERN.test(pathname)
  } catch {
    return false
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

    if (hostMatches(host, "loom.com")) {
      const loomId = parsedUrl.pathname.split("/").filter(Boolean).pop() || ""
      return loomId ? `https://www.loom.com/embed/${loomId}` : ""
    }

    if (hostMatches(host, "figma.com")) {
      return `https://www.figma.com/embed?embed_host=aquila-blog&url=${encodeURIComponent(parsedUrl.toString())}`
    }

    if (hostMatches(host, "codepen.io")) {
      const parts = parsedUrl.pathname.split("/").filter(Boolean)
      if (parts.length >= 3 && parts[1] === "pen") {
        return `https://codepen.io/${parts[0]}/embed/${parts[2]}?default-tab=result`
      }
    }

    if (hostMatches(host, "codesandbox.io")) {
      if (parsedUrl.pathname.startsWith("/s/")) {
        return `https://codesandbox.io/embed${parsedUrl.pathname}?view=preview`
      }
    }
  } catch {
    return ""
  }

  return ""
}

export const inferCardKindFromUrl = (url: string): "bookmark" | "embed" | "file" => {
  if (isLikelyFileUrl(url)) return "file"
  if (resolveEmbedPreviewUrl(url)) return "embed"
  return "bookmark"
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
