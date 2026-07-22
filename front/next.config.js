const path = require("path")
const { buildContentSecurityPolicy } = require("./src/libs/security/contentSecurityPolicy")

/** Prefer package source over yarn `file:` node_modules copy (Vercel cache drift). */
const sharedUiTokensEntry = path.resolve(__dirname, "packages/shared-ui-tokens/src/index.js")

const buildSecurityHeaders = () => {
  // Phase B enforce: hash-based script-src (no script unsafe-inline).
  // Phase A evidence: keep Report-Only with the same nonce/hash policy for browser/header dumps.
  const csp = buildContentSecurityPolicy()

  return [
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
      value: csp,
    },
    {
      key: "Content-Security-Policy-Report-Only",
      value: csp,
    },
  ]
}

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
    config.resolve = config.resolve || {}
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@shared/ui-tokens": sharedUiTokensEntry,
    }

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
