import { expect, test } from "@playwright/test"

type NextHeader = {
  key: string
  value: string
}

type NextHeaderRule = {
  source: string
  headers: NextHeader[]
}

const getCspHeader = async () => {
  const nextConfigModule = await import("../next.config.js")
  const nextConfig = nextConfigModule.default as {
    headers: () => Promise<NextHeaderRule[]>
  }
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
