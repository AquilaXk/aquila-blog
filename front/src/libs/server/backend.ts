import { IncomingMessage } from "http"

type ServerApiFetchInit = RequestInit & {
  timeoutMs?: number
}

const FALLBACK_TIMEOUT_MS = 6_000

const resolveServerTimeoutMs = (path: string, init: ServerApiFetchInit): number => {
  if (typeof init.timeoutMs === "number" && Number.isFinite(init.timeoutMs) && init.timeoutMs > 0) {
    return init.timeoutMs
  }

  const normalizedPath = path.toLowerCase()
  const method = (init.method || "GET").toUpperCase()

  if (normalizedPath.includes("/member/api/v1/auth/me") || normalizedPath.includes("/members/adminprofile")) {
    return 5_000
  }

  if (normalizedPath.includes("/post/api/v1/posts/feed") || normalizedPath.includes("/post/api/v1/posts/explore")) {
    return 6_500
  }

  if (method === "GET") {
    return 6_000
  }

  return FALLBACK_TIMEOUT_MS
}

export const resolveServerApiBaseUrl = (req: IncomingMessage): string => {
  const internal = process.env.BACKEND_INTERNAL_URL
  if (internal) return internal.replace(/\/+$/, "")

  const publicUrl = process.env.NEXT_PUBLIC_BACKEND_URL
  if (publicUrl) return publicUrl.replace(/\/+$/, "")

  if (process.env.NODE_ENV === "production") {
    throw new Error("BACKEND_INTERNAL_URL or NEXT_PUBLIC_BACKEND_URL is required in production.")
  }

  const forwardedProto = req.headers["x-forwarded-proto"]
  const forwardedHost = req.headers["x-forwarded-host"]
  const protocolRaw = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto
  const protocol = typeof protocolRaw === "string" && protocolRaw ? protocolRaw.split(",")[0].trim() : "http"
  const hostRaw = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : typeof forwardedHost === "string"
      ? forwardedHost
      : req.headers.host || ""
  const host = typeof hostRaw === "string" ? hostRaw.split(",")[0].trim() : ""
  if (!host) return "http://localhost:8080"
  const apiHost = host.replace(/^www\./, "api.")
  return `${protocol}://${apiHost}`
}

export const serverApiFetch = (req: IncomingMessage, path: string, init: ServerApiFetchInit = {}) => {
  const baseUrl = resolveServerApiBaseUrl(req)
  const { timeoutMs: _timeoutMs, ...requestInit } = init
  const headers = new Headers(init.headers)
  const cookie = req.headers.cookie
  const timeoutMs = resolveServerTimeoutMs(path, init)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()

  if (cookie) {
    headers.set("cookie", cookie)
  }

  if (init.signal) {
    if (init.signal.aborted) controller.abort()
    else init.signal.addEventListener("abort", onAbort, { once: true })
  }

  const cleanup = () => {
    clearTimeout(timeoutId)
    if (init.signal) init.signal.removeEventListener("abort", onAbort)
  }

  return fetch(`${baseUrl}${path}`, {
    ...requestInit,
    headers,
    signal: controller.signal,
  }).finally(() => {
    cleanup()
  })
}
