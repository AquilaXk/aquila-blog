const path = require("path")
const { buildContentSecurityPolicy } = require("./src/libs/security/contentSecurityPolicy")

/** Prefer package source over the yarn `file:` node_modules copy, which goes stale on cached installs. */
const sharedUiTokensEntry = path.resolve(__dirname, "packages/shared-ui-tokens/src/index.js")

/**
 * yarn 1 filters optional dependencies by `os`/`cpu` but not by libc, so both the glibc and the
 * musl `@img/sharp-*` builds land in node_modules while sharp only ever opens the one matching the
 * host libc. Build host and serve host share a libc here (Dockerfile.runtime builds and runs on
 * node:20-alpine), so the mismatched flavour is dead weight.
 * `glibcVersionRuntime` is the same probe sharp itself uses through detect-libc.
 */
const nodeReportHeader =
  /** @type {{ header?: { glibcVersionRuntime?: string } }} */ (
    process.report?.getReport?.() ?? {}
  ).header
const foreignLibcTag = nodeReportHeader?.glibcVersionRuntime ? "linuxmusl" : "linux"

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
  /** Homeserver container runs `.next/standalone/server.js`; traced deps only, no source tree. */
  output: "standalone",
  /**
   * The standalone tracer copies build-only toolchain into the runtime `node_modules`.
   * `next-server` 키는 next-server 기본 트레이스에만 매칭된다 — Next는 이 키를
   * `picomatch(glob)("next-server")` 로 판정한다 (next/dist/build/collect-build-traces.js).
   * 페이지 트레이스는 라우트 경로로 매칭되므로 여기 항목은 SSR 페이지 의존성을 건드리지 않는다.
   * (mermaid·katex·prismjs·shiki는 실제 페이지 트레이스에 들어 있어 대상이 아니다.)
   *
   * 제외 근거 (모두 next-server 트레이스 경유로만 유입된다):
   * - typescript: `next/dist/server/config.js` 는 `transpileConfig()` 를
   *   `configFileName === "next.config.ts"` 일 때만 호출한다. 이 프로젝트 설정은 next.config.js 다.
   * - webpack: `next/dist/compiled/webpack/webpack.js` 의 `init()` 이 최상위 `webpack` 을 require 하는
   *   분기는 `process.env.NEXT_PRIVATE_LOCAL_WEBPACK` (Next 자체 개발용) 이 설정된 경우뿐이고,
   *   운영 컨테이너는 항상 번들된 `./bundle5` 분기를 탄다. terser·esbuild·ajv 등 webpack 하위
   *   트리도 트레이스 순회가 끊기면서 함께 빠진다.
   * - libc가 어긋나는 `@img/sharp-*` 빌드: sharp 는 호스트 libc에 맞는 하나만 연다.
   *   `sharp-linux-*` 글롭은 `-` 덕분에 `sharp-linuxmusl-*` 과 겹치지 않는다.
   *   sharp 본체와 `@img/colour` 는 그대로 둔다.
   */
  outputFileTracingExcludes: {
    "next-server": [
      "**/node_modules/typescript/**/*",
      "**/node_modules/webpack/**/*",
      `**/node_modules/@img/sharp-libvips-${foreignLibcTag}-*/**/*`,
      `**/node_modules/@img/sharp-${foreignLibcTag}-*/**/*`,
    ],
  },
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
