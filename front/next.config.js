/**
 * @param {string[]} sources
 */
const uniqueSources = (sources) => [...new Set(sources.filter(Boolean))]

/**
 * @param {string | undefined} value
 */
const originFromEnvUrl = (value) => {
  const raw = value?.trim()
  if (!raw) return ""

  try {
    const url = new URL(raw)
    if (url.protocol !== "http:" && url.protocol !== "https:") return ""
    return url.origin
  } catch {
    return ""
  }
}

const configuredRuntimeOrigins = () =>
  uniqueSources(
    [
      process.env.NEXT_PUBLIC_SITE_URL,
      process.env.NEXT_PUBLIC_BACKEND_URL,
      process.env.NEXT_PUBLIC_MONITORING_EMBED_URL,
      process.env.NEXT_PUBLIC_GRAFANA_EMBED_URL,
      process.env.NEXT_PUBLIC_LOGS_EMBED_URL,
      process.env.NEXT_PUBLIC_GRAFANA_LOGS_EMBED_URL,
      process.env.NEXT_PUBLIC_PROMETHEUS_URL,
      process.env.UPTIME_KUMA_PROXY_ORIGIN,
    ].map(originFromEnvUrl),
  )

const buildContentSecurityPolicy = () => {
  const isDev = process.env.NODE_ENV === "development"
  const runtimeOrigins = configuredRuntimeOrigins()
  const aquilaDomains = ["https://*.aquilaxk.site"]
  const vercelScriptSources = ["https://va.vercel-scripts.com", "https://vercel.live"]
  const vercelConnectSources = [
    "https://vitals.vercel-insights.com",
    "https://vercel.live",
    "wss://ws-us3.pusher.com",
  ]
  const googleScriptSources = ["https://www.googletagmanager.com"]
  const googleConnectSources = [
    "https://www.google-analytics.com",
    "https://analytics.google.com",
    "https://region1.google-analytics.com",
    "https://stats.g.doubleclick.net",
  ]
  const imageSources = [
    "'self'",
    "data:",
    "blob:",
    ...aquilaDomains,
    "https://www.notion.so",
    "https://lh5.googleusercontent.com",
    "https://s3-us-west-2.amazonaws.com",
    "https://avatars.githubusercontent.com",
    "https://placehold.co",
    ...googleConnectSources,
    ...runtimeOrigins,
  ]

  const directives = [
    ["default-src", "'self'"],
    [
      "script-src",
      "'self'",
      "'unsafe-inline'",
      ...(isDev ? ["'unsafe-eval'"] : []),
      ...vercelScriptSources,
      ...googleScriptSources,
    ],
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", ...imageSources],
    [
      "connect-src",
      "'self'",
      ...aquilaDomains,
      ...runtimeOrigins,
      ...vercelConnectSources,
      ...googleConnectSources,
    ],
    ["font-src", "'self'", "data:"],
    ["media-src", "'self'", "blob:", ...aquilaDomains, ...runtimeOrigins],
    ["frame-src", "'self'", "https://vercel.live", ...runtimeOrigins],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'self'"],
    ["upgrade-insecure-requests"],
  ]

  return directives
    .map(([name, ...sources]) => uniqueSources([name, ...sources]).join(" "))
    .join("; ")
}

const buildSecurityHeaders = () => [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: buildContentSecurityPolicy(),
  },
]

/**
 * @typedef {{ source: string, destination: string }} RewriteRule
 */

module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.aquilaxk.site",
      },
      {
        protocol: "https",
        hostname: "www.notion.so",
      },
      {
        protocol: "https",
        hostname: "lh5.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "s3-us-west-2.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "placehold.co",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders(),
      },
    ]
  },
  async rewrites() {
    const uptimeProxyOrigin = process.env.UPTIME_KUMA_PROXY_ORIGIN?.trim()
    /** @type {RewriteRule[]} */
    const rules = []

    if (!uptimeProxyOrigin) return rules

    const origin = uptimeProxyOrigin.replace(/\/+$/, "")

    rules.push(
      {
        source: "/status/:path*",
        destination: `${origin}/status/:path*`,
      },
      {
        source: "/assets/:path*",
        destination: `${origin}/assets/:path*`,
      },
      {
        source: "/api/status-page/:path*",
        destination: `${origin}/api/status-page/:path*`,
      },
    )

    return rules
  },
  /**
   * @param {import("webpack").Configuration} config
   */
  webpack(config) {
    const existingIgnoreWarnings = Array.isArray(config.ignoreWarnings) ? config.ignoreWarnings : []
    config.ignoreWarnings = [
      ...existingIgnoreWarnings,
      /**
       * @param {any} warning
       */
      (warning) => {
        const message = typeof warning?.message === "string" ? warning.message : ""
        if (!message.includes("Critical dependency: the request of a dependency is an expression")) {
          return false
        }

        const moduleResource =
          typeof warning?.module?.resource === "string" ? warning.module.resource : ""
        const moduleIdentifier =
          typeof warning?.module?.identifier === "function"
            ? String(warning.module.identifier())
            : ""
        const target = `${moduleResource} ${moduleIdentifier}`

        return target.includes("src/libs/markdown/prismRuntime.ts")
      },
    ]

    return config
  },
}
