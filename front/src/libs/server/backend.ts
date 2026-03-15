import { IncomingMessage } from "http"

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

  if (cookie) {
    headers.set("cookie", cookie)
  }

  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  })
}
