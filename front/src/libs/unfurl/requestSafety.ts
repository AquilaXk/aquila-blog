const ALLOWED_UNFURL_HOST_SUFFIXES = [
  "github.com",
  "gist.github.com",
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "loom.com",
  "figma.com",
  "codepen.io",
  "codesandbox.io",
  "notion.so",
  "notion.site",
  "medium.com",
  "velog.io",
  "substack.com",
  "tistory.com",
  "naver.com",
  "x.com",
  "twitter.com",
  "developer.mozilla.org",
  "docs.google.com",
] as const

const DEFAULT_PORT_BY_PROTOCOL: Record<"http:" | "https:", string> = {
  "http:": "80",
  "https:": "443",
}

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308])
const MAX_UNFURL_REDIRECTS = 4

const isAllowedUnfurlHost = (hostname: string) => {
  const normalizedHostname = hostname.trim().toLowerCase()
  return ALLOWED_UNFURL_HOST_SUFFIXES.some(
    (suffix) =>
      normalizedHostname === suffix || normalizedHostname.endsWith(`.${suffix}`)
  )
}

const assertSafeUnfurlUrl = (rawUrl: string) => {
  let parsedUrl: URL

  try {
    parsedUrl = new URL(rawUrl)
  } catch {
    throw new Error("URL 형식이 올바르지 않습니다.")
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("http/https URL만 지원합니다.")
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error("인증 정보가 포함된 URL은 unfurl할 수 없습니다.")
  }

  const normalizedHostname = parsedUrl.hostname.trim().toLowerCase()
  if (!isAllowedUnfurlHost(normalizedHostname)) {
    throw new Error("허용된 외부 링크만 unfurl할 수 있습니다.")
  }

  if (
    parsedUrl.port &&
    parsedUrl.port !== DEFAULT_PORT_BY_PROTOCOL[parsedUrl.protocol]
  ) {
    throw new Error("표준 포트의 외부 링크만 unfurl할 수 있습니다.")
  }

  const safeUrl = new URL(parsedUrl.toString())
  safeUrl.hostname = normalizedHostname
  safeUrl.username = ""
  safeUrl.password = ""
  safeUrl.hash = ""

  return safeUrl
}

export const normalizeSafeUnfurlUrl = (rawUrl: string) => assertSafeUnfurlUrl(rawUrl)

export const fetchSafeUnfurlResponse = async ({
  initialUrl,
  signal,
  headers,
}: {
  initialUrl: string
  signal: AbortSignal
  headers: HeadersInit
}) => {
  let currentUrl = assertSafeUnfurlUrl(initialUrl)

  for (let redirectCount = 0; redirectCount <= MAX_UNFURL_REDIRECTS; redirectCount += 1) {
    const response = await fetch(currentUrl.toString(), {
      method: "GET",
      redirect: "manual",
      headers,
      signal,
    })

    if (!REDIRECT_STATUS_CODES.has(response.status)) {
      return { response, finalUrl: currentUrl }
    }

    const redirectLocation = response.headers.get("location")
    if (!redirectLocation) {
      throw new Error("리다이렉트 위치를 확인할 수 없습니다.")
    }

    if (redirectCount === MAX_UNFURL_REDIRECTS) {
      throw new Error("리다이렉트가 너무 많습니다.")
    }

    currentUrl = assertSafeUnfurlUrl(new URL(redirectLocation, currentUrl).toString())
  }

  throw new Error("리다이렉트가 너무 많습니다.")
}
