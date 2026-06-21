import { expect, test } from "@playwright/test"
import { normalizeSafeMarkdownImageSrc } from "src/libs/markdown/safeMarkdownUrl"

type NextHeader = {
  key: string
  value: string
}

type NextHeaderRule = {
  source: string
  headers: NextHeader[]
}

type NextConfig = {
  headers: () => Promise<NextHeaderRule[]>
  images?: {
    remotePatterns?: Array<{
      protocol?: string
      hostname?: string
    }>
  }
}

const externalPlaceholderHosts = [
  ["placehold", "co"],
  ["via", "placeholder", "com"],
  [["pic", "sum"].join(""), "photos"],
  [["dummy", "image"].join(""), "com"],
].map((parts) => parts.join("."))

const getNextConfig = async () => {
  const nextConfigModule = await import("../next.config.js")
  return nextConfigModule.default as NextConfig
}

const getCspHeader = async () => {
  const nextConfig = await getNextConfig()
  const rules = await nextConfig.headers()
  const globalRule = rules.find((rule) => rule.source === "/:path*")
  const csp = globalRule?.headers.find(
    (header) => header.key.toLowerCase() === "content-security-policy",
  )?.value

  expect(csp).toBeTruthy()
  return csp ?? ""
}

const parseCspDirectives = (csp: string) => {
  const directives = new Map<string, string[]>()

  for (const rawDirective of csp.split(";")) {
    const parts = rawDirective.trim().split(/\s+/).filter(Boolean)
    const [name, ...sources] = parts
    if (!name) continue
    directives.set(name, sources)
  }

  return directives
}

test.describe("frontend security headers", () => {
  test("CSP declares script style image connect and font boundaries", async () => {
    const directives = parseCspDirectives(await getCspHeader())

    expect(directives.get("default-src")).toEqual(["'self'"])
    expect(directives.get("script-src")).toEqual(
      expect.arrayContaining(["'self'", "'unsafe-inline'", "https://va.vercel-scripts.com"]),
    )
    expect(directives.get("style-src")).toEqual(expect.arrayContaining(["'self'", "'unsafe-inline'"]))
    expect(directives.get("img-src")).toEqual(
      expect.arrayContaining([
        "'self'",
        "data:",
        "blob:",
        "https:",
        "http:",
        "https://*.aquilaxk.site",
        "https://www.notion.so",
        "https://avatars.githubusercontent.com",
      ]),
    )
    expect(directives.get("connect-src")).toEqual(
      expect.arrayContaining([
        "'self'",
        "https://*.aquilaxk.site",
        "https://vitals.vercel-insights.com",
        "https://vercel.live",
      ]),
    )
    expect(directives.get("font-src")).toEqual(expect.arrayContaining(["'self'", "data:"]))
    expect(directives.get("media-src")).toEqual(
      expect.arrayContaining(["'self'", "blob:", "https://*.aquilaxk.site"]),
    )
    expect(directives.get("object-src")).toEqual(["'none'"])
    expect(directives.get("base-uri")).toEqual(["'self'"])
    expect(directives.get("frame-ancestors")).toEqual(["'self'"])
    expect(directives.get("upgrade-insecure-requests")).toEqual([])
  })

  test("Next image config does not explicitly optimize external placeholder providers", async () => {
    const nextConfig = await getNextConfig()
    const remoteHosts = (nextConfig.images?.remotePatterns ?? [])
      .map((pattern) => pattern.hostname)
      .filter(Boolean)

    for (const host of externalPlaceholderHosts) {
      expect(remoteHosts).not.toContain(host)
    }
  })

  test("markdown image sanitizer rejects external placeholder providers only", () => {
    const placeholderImageUrl = `https://${["placehold", "co"].join(".")}/600x600?text=U_U`
    const supportedExternalImageUrl = "https://cdn.example.com/post-image.png"

    expect(normalizeSafeMarkdownImageSrc(placeholderImageUrl)).toBe("")
    expect(normalizeSafeMarkdownImageSrc(supportedExternalImageUrl)).toBe(supportedExternalImageUrl)
  })

  test("CSP connect-src keeps documented local backend fallback available in development", async () => {
    const previousNodeEnv = process.env.NODE_ENV
    const previousBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL

    process.env.NODE_ENV = "development"
    delete process.env.NEXT_PUBLIC_BACKEND_URL

    try {
      const directives = parseCspDirectives(await getCspHeader())

      expect(directives.get("connect-src")).toEqual(
        expect.arrayContaining(["http://localhost:8080", "http://127.0.0.1:8080"]),
      )
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousNodeEnv

      if (previousBackendUrl === undefined) delete process.env.NEXT_PUBLIC_BACKEND_URL
      else process.env.NEXT_PUBLIC_BACKEND_URL = previousBackendUrl
    }
  })

  test("CSP frame-src keeps supported markdown embed preview providers available", async () => {
    const directives = parseCspDirectives(await getCspHeader())

    expect(directives.get("frame-src")).toEqual(
      expect.arrayContaining([
        "'self'",
        "https://www.youtube.com",
        "https://player.vimeo.com",
        "https://www.loom.com",
        "https://www.figma.com",
        "https://codepen.io",
        "https://codesandbox.io",
      ]),
    )
  })

  test("CSP includes configured runtime origins without duplicating full URLs", async () => {
    const previousBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL
    const previousMonitoringUrl = process.env.NEXT_PUBLIC_MONITORING_EMBED_URL

    process.env.NEXT_PUBLIC_BACKEND_URL = "https://api.example.com/member/api/v1"
    process.env.NEXT_PUBLIC_MONITORING_EMBED_URL = "https://grafana.example.com/d/live?kiosk=1"

    try {
      const directives = parseCspDirectives(await getCspHeader())

      expect(directives.get("connect-src")).toEqual(
        expect.arrayContaining(["https://api.example.com", "https://grafana.example.com"]),
      )
      expect(directives.get("frame-src")).toEqual(
        expect.arrayContaining(["'self'", "https://grafana.example.com", "https://vercel.live"]),
      )
      expect(directives.get("connect-src")).not.toContain("https://api.example.com/member/api/v1")
      expect(directives.get("frame-src")).not.toContain("https://grafana.example.com/d/live?kiosk=1")
    } finally {
      if (previousBackendUrl === undefined) delete process.env.NEXT_PUBLIC_BACKEND_URL
      else process.env.NEXT_PUBLIC_BACKEND_URL = previousBackendUrl

      if (previousMonitoringUrl === undefined) delete process.env.NEXT_PUBLIC_MONITORING_EMBED_URL
      else process.env.NEXT_PUBLIC_MONITORING_EMBED_URL = previousMonitoringUrl
    }
  })
})
