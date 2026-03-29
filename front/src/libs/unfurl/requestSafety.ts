import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

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

const IPV4_PRIVATE_RANGES: Array<[number, number]> = [
  [0x00000000, 0x00ffffff], // 0.0.0.0/8
  [0x0a000000, 0x0affffff], // 10.0.0.0/8
  [0x64400000, 0x647fffff], // 100.64.0.0/10
  [0x7f000000, 0x7fffffff], // 127.0.0.0/8
  [0xa9fe0000, 0xa9feffff], // 169.254.0.0/16
  [0xac100000, 0xac1fffff], // 172.16.0.0/12
  [0xc0a80000, 0xc0a8ffff], // 192.168.0.0/16
  [0xc6120000, 0xc613ffff], // 198.18.0.0/15
]

const IPV6_PRIVATE_PREFIXES = [
  "::",
  "::1",
  "fc",
  "fd",
  "fe8",
  "fe9",
  "fea",
  "feb",
] as const

const ipv4ToNumber = (ip: string) => {
  const octets = ip.split(".").map((octet) => Number.parseInt(octet, 10))
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null
  }

  return (
    ((octets[0] << 24) >>> 0) +
    ((octets[1] << 16) >>> 0) +
    ((octets[2] << 8) >>> 0) +
    (octets[3] >>> 0)
  )
}

const isPrivateIpv4 = (ip: string) => {
  const numericIp = ipv4ToNumber(ip)
  if (numericIp === null) return true
  return IPV4_PRIVATE_RANGES.some(([start, end]) => numericIp >= start && numericIp <= end)
}

const normalizeIpv6 = (ip: string) => ip.trim().toLowerCase()

const isPrivateIpv6 = (ip: string) => {
  const normalized = normalizeIpv6(ip)

  if (normalized.startsWith("::ffff:")) {
    const mappedIpv4 = normalized.slice("::ffff:".length)
    return isPrivateIpv4(mappedIpv4)
  }

  return IPV6_PRIVATE_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}:`)
  )
}

const assertPublicResolvedHostname = async (hostname: string) => {
  if (isIP(hostname)) {
    throw new Error("IP 주소 직접 unfurl은 허용되지 않습니다.")
  }

  const resolvedAddresses = await lookup(hostname, { all: true, verbatim: true })
  if (resolvedAddresses.length === 0) {
    throw new Error("외부 링크의 IP를 확인할 수 없습니다.")
  }

  const hasPrivateAddress = resolvedAddresses.some(({ address, family }) => {
    if (family === 4) return isPrivateIpv4(address)
    if (family === 6) return isPrivateIpv6(address)
    return true
  })

  if (hasPrivateAddress) {
    throw new Error("비공개 네트워크로 해석되는 링크는 unfurl할 수 없습니다.")
  }
}

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
    await assertPublicResolvedHostname(currentUrl.hostname)

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
