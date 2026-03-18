const securityHeaders = [
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
    value: "base-uri 'self'; object-src 'none'; frame-ancestors 'self'; upgrade-insecure-requests",
  },
]

module.exports = {
  images: {
    domains: [
      "www.notion.so",
      "lh5.googleusercontent.com",
      "s3-us-west-2.amazonaws.com",
      "avatars.githubusercontent.com",
      "api.aquilaxk.site",
      "placehold.co",
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.aquilaxk.site",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ]
  },
  async rewrites() {
    const backendOrigin = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080").trim().replace(/\/+$/, "")
    const uptimeProxyOrigin = process.env.UPTIME_KUMA_PROXY_ORIGIN?.trim()
    const rules = [
      {
        source: "/member/api/v1/notifications/stream",
        destination: `${backendOrigin}/member/api/v1/notifications/stream`,
      },
    ]

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
}
