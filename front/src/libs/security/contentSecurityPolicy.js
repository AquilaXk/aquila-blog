const crypto = require("crypto")
const {
  AQUILA_SCHEME_BOOTSTRAP_SCRIPT,
  CLIENT_RUNTIME_RECOVERY_SCRIPT,
  HEADER_AUTH_SHELL_BOOTSTRAP_SCRIPT,
} = require("./documentInlineScripts")

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

/**
 * @param {string} source
 */
const scriptSrcHash = (source) =>
  `'sha256-${crypto.createHash("sha256").update(source, "utf8").digest("base64")}'`

const documentInlineScriptHashes = () =>
  uniqueSources([
    scriptSrcHash(AQUILA_SCHEME_BOOTSTRAP_SCRIPT),
    scriptSrcHash(HEADER_AUTH_SHELL_BOOTSTRAP_SCRIPT),
    scriptSrcHash(CLIENT_RUNTIME_RECOVERY_SCRIPT),
  ])

/**
 * Build the frontend Content-Security-Policy.
 *
 * Phase B enforce: script-src uses document inline script hashes (no `'unsafe-inline'`).
 * style-src keeps `'unsafe-inline'` for Emotion.
 * HR-56: do not reintroduce script `'unsafe-inline'` as a silent fallback.
 *
 * @param {{ includeUnsafeEval?: boolean }} [options]
 */
const buildContentSecurityPolicy = (options = {}) => {
  const isDev = process.env.NODE_ENV === "development"
  const includeUnsafeEval = options.includeUnsafeEval ?? isDev
  const runtimeOrigins = configuredRuntimeOrigins()
  const aquilaDomains = ["https://*.aquilaxk.site"]
  const vercelScriptSources = ["https://va.vercel-scripts.com", "https://vercel.live"]
  const vercelConnectSources = [
    "https://vitals.vercel-insights.com",
    "https://vercel.live",
    "wss://ws-us3.pusher.com",
  ]
  const localDevConnectSources = isDev ? ["http://localhost:8080", "http://127.0.0.1:8080"] : []
  const embedFrameSources = [
    "https://www.youtube.com",
    "https://player.vimeo.com",
    "https://www.loom.com",
    "https://www.figma.com",
    "https://codepen.io",
    "https://codesandbox.io",
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
    "https:",
    "http:",
    ...aquilaDomains,
    "https://www.notion.so",
    "https://lh5.googleusercontent.com",
    "https://s3-us-west-2.amazonaws.com",
    "https://avatars.githubusercontent.com",
    ...googleConnectSources,
    ...runtimeOrigins,
  ]

  const directives = [
    ["default-src", "'self'"],
    [
      "script-src",
      "'self'",
      ...documentInlineScriptHashes(),
      ...(includeUnsafeEval ? ["'unsafe-eval'"] : []),
      ...vercelScriptSources,
      ...googleScriptSources,
    ],
    // Emotion critical CSS + runtime style injection still require unsafe-inline.
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", ...imageSources],
    [
      "connect-src",
      "'self'",
      ...aquilaDomains,
      ...runtimeOrigins,
      ...localDevConnectSources,
      ...vercelConnectSources,
      ...googleConnectSources,
    ],
    ["font-src", "'self'", "data:"],
    ["media-src", "'self'", "blob:", ...aquilaDomains, ...runtimeOrigins],
    ["frame-src", "'self'", "https://vercel.live", ...runtimeOrigins, ...embedFrameSources],
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

module.exports = {
  buildContentSecurityPolicy,
  documentInlineScriptHashes,
  originFromEnvUrl,
  uniqueSources,
}
