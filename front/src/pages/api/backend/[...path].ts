import type { NextApiRequest, NextApiResponse } from "next"
import { normalizeApiRequestPath } from "src/libs/backend/requestPath"
import { resolveServerApiBaseUrl } from "src/libs/server/backend"

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
}

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
])

const BODYLESS_METHODS = new Set(["GET", "HEAD"])

const getSetCookieHeaders = (headers: Headers): string[] => {
  const withCookieList = headers as Headers & { getSetCookie?: () => string[] }
  const cookieList = withCookieList.getSetCookie?.()
  if (cookieList?.length) return cookieList

  const cookie = headers.get("set-cookie")
  return cookie ? [cookie] : []
}

const appendIncomingHeader = (headers: Headers, key: string, value: string | string[] | undefined) => {
  if (value === undefined) return
  if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return

  if (Array.isArray(value)) {
    value.forEach((entry) => headers.append(key, entry))
    return
  }

  headers.set(key, value)
}

const resolveProxyPath = (req: NextApiRequest): string => {
  const segments = Array.isArray(req.query.path) ? req.query.path : [String(req.query.path || "")]
  const pathname = `/${segments.filter(Boolean).join("/")}`
  const queryIndex = req.url?.indexOf("?") ?? -1
  const query = queryIndex >= 0 ? req.url?.slice(queryIndex) : ""
  return normalizeApiRequestPath(`${pathname}${query || ""}`)
}

const pipeWebStreamToResponse = async (stream: ReadableStream<Uint8Array>, res: NextApiResponse) => {
  const reader = stream.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) res.write(Buffer.from(value))
    }
  } finally {
    reader.releaseLock()
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let safePath: string
  try {
    safePath = resolveProxyPath(req)
  } catch {
    res.status(400).json({ message: "Invalid backend proxy path." })
    return
  }

  const method = (req.method || "GET").toUpperCase()
  const headers = new Headers()
  Object.entries(req.headers).forEach(([key, value]) => appendIncomingHeader(headers, key, value))
  headers.set("X-Forwarded-Host", req.headers.host || "")
  headers.set("X-Forwarded-Proto", "https")

  try {
    const upstreamResponse = await fetch(`${resolveServerApiBaseUrl(req)}${safePath}`, {
      method,
      headers,
      body: BODYLESS_METHODS.has(method) ? undefined : (req as unknown as BodyInit),
      duplex: "half",
      redirect: "manual",
    } as RequestInit & { duplex: "half" })

    res.status(upstreamResponse.status)
    upstreamResponse.headers.forEach((value, key) => {
      if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return
      if (key.toLowerCase() === "set-cookie") return
      res.setHeader(key, value)
    })
    const setCookieHeaders = getSetCookieHeaders(upstreamResponse.headers)
    if (setCookieHeaders.length > 0) {
      res.setHeader("Set-Cookie", setCookieHeaders)
    }

    if (!upstreamResponse.body) {
      res.end()
      return
    }

    await pipeWebStreamToResponse(upstreamResponse.body, res)
    res.end()
  } catch {
    res.status(502).json({ message: "Backend proxy request failed." })
  }
}
