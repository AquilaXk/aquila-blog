export type UnfurlMetadata = {
  url: string
  title: string
  description: string
  siteName: string
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

export const extractUnfurlMetadata = (url: string, html: string): UnfurlMetadata => {
  const parsedUrl = new URL(url)
  const siteName = firstMatch(html, SITE_NAME_PATTERNS) || parsedUrl.hostname.replace(/^www\./, "")
  return {
    url,
    title: firstMatch(html, META_PATTERNS) || parsedUrl.hostname.replace(/^www\./, ""),
    description: firstMatch(html, DESCRIPTION_PATTERNS),
    siteName,
  }
}
