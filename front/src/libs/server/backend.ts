import { IncomingMessage } from "http"

export const resolveServerApiBaseUrl = (req: IncomingMessage): string => {
  const internal = process.env.BACKEND_INTERNAL_URL
  if (internal) return internal.replace(/\/+$/, "")

  const publicUrl = process.env.NEXT_PUBLIC_BACKEND_URL
  if (publicUrl) return publicUrl.replace(/\/+$/, "")

  const forwardedProto = req.headers["x-forwarded-proto"]
  const protocol = typeof forwardedProto === "string" ? forwardedProto : "https"
  const host = req.headers.host || ""
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
