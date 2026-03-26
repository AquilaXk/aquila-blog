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
        headers: securityHeaders,
      },
    ]
  },
  async rewrites() {
    const uptimeProxyOrigin = process.env.UPTIME_KUMA_PROXY_ORIGIN?.trim()
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
}
