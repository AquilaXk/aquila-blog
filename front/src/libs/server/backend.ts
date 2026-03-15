import { IncomingMessage } from "http"

const SERVER_API_FETCH_TIMEOUT_MS = Number(process.env.SERVER_API_FETCH_TIMEOUT_MS || 3500)

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

export const serverApiFetch = (req: IncomingMessage, path: string, init: RequestInit = {}) => {
  const baseUrl = resolveServerApiBaseUrl(req)
  const headers = new Headers(init.headers)
  const cookie = req.headers.cookie
  const timeoutMs = Number.isFinite(SERVER_API_FETCH_TIMEOUT_MS) && SERVER_API_FETCH_TIMEOUT_MS > 0
    ? SERVER_API_FETCH_TIMEOUT_MS
    : 3500
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
    ...init,
    headers,
    signal: controller.signal,
  }).finally(() => {
    cleanup()
  })
}
