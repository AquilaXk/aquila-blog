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

const DECODED_RESPONSE_HEADERS = new Set(["content-encoding", "content-length"])
const BODYLESS_METHODS = new Set(["GET", "HEAD"])
const BACKEND_PROXY_TIMEOUT_MS = 10 * 60_000
const DEFAULT_BACKEND_PROXY_MAX_BODY_BYTES = 512 * 1024 * 1024
const DEFAULT_BACKEND_PROXY_MAX_IN_FLIGHT_BODY_BYTES = 1024 * 1024 * 1024

class ProxyBodyTooLargeError extends Error {}
class ProxyBodyCapacityExceededError extends Error {}
class ProxyBodyTimeoutError extends Error {}

type ProxyBodyReadResult = {
  body: BodyInit | undefined
  releaseReservation: () => void
}

let inFlightProxyBodyBytes = 0

const isAbortLikeError = (error: unknown) => {
  if (!(error instanceof Error)) return false
  return error.name === "AbortError" || error.message.toLowerCase().includes("abort")
}

const firstHeaderValue = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return value[0] || ""
  return value || ""
}

const resolveMaxProxyBodyBytes = (): number => {
  const configured = Number.parseInt(process.env.BACKEND_PROXY_MAX_BODY_BYTES || "", 10)
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_BACKEND_PROXY_MAX_BODY_BYTES
}

const resolveMaxProxyInFlightBodyBytes = (): number => {
  const configured = Number.parseInt(process.env.BACKEND_PROXY_MAX_IN_FLIGHT_BODY_BYTES || "", 10)
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_BACKEND_PROXY_MAX_IN_FLIGHT_BODY_BYTES
}

const reserveProxyBodyBytes = (byteCount: number, maxInFlightBodyBytes: number) => {
  if (byteCount <= 0) return
  if (inFlightProxyBodyBytes + byteCount > maxInFlightBodyBytes) throw new ProxyBodyCapacityExceededError()
  inFlightProxyBodyBytes += byteCount
}

const releaseProxyBodyBytes = (byteCount: number) => {
  if (byteCount <= 0) return
  inFlightProxyBodyBytes = Math.max(0, inFlightProxyBodyBytes - byteCount)
}

const getSetCookieHeaders = (headers: Headers): string[] => {
  const withCookieList = headers as Headers & { getSetCookie?: () => string[] }
  const cookieList = withCookieList.getSetCookie?.()
  if (cookieList?.length) return cookieList

  const cookie = headers.get("set-cookie")
  return cookie ? [cookie] : []
}

const appendIncomingHeader = (headers: Headers, key: string, value: string | string[] | undefined) => {
  const normalizedKey = key.toLowerCase()
  if (value === undefined) return
  if (HOP_BY_HOP_HEADERS.has(normalizedKey)) return
  if (normalizedKey === "host") return
  if (normalizedKey === "accept-encoding") return

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

const toArrayBuffer = (buffer: Buffer): ArrayBuffer => {
  const body = new ArrayBuffer(buffer.byteLength)
  new Uint8Array(body).set(buffer)
  return body
}

const readProxyBody = async (
  req: NextApiRequest,
  method: string,
  signal: AbortSignal,
): Promise<ProxyBodyReadResult> => {
  if (BODYLESS_METHODS.has(method)) return { body: undefined, releaseReservation: () => undefined }
  if (signal.aborted) throw new ProxyBodyTimeoutError()

  // Keep the exact incoming bytes so JSON and multipart boundaries survive the proxy hop.
  const maxBodyBytes = resolveMaxProxyBodyBytes()
  const maxInFlightBodyBytes = resolveMaxProxyInFlightBodyBytes()
  const declaredContentLength = Number.parseInt(firstHeaderValue(req.headers["content-length"]), 10)
  if (Number.isFinite(declaredContentLength) && declaredContentLength > maxBodyBytes) {
    throw new ProxyBodyTooLargeError()
  }
  const hasDeclaredContentLength = Number.isFinite(declaredContentLength) && declaredContentLength > 0
  let reservedBytes = 0
  let released = false
  const reserveAdditionalBytes = (byteCount: number) => {
    reserveProxyBodyBytes(byteCount, maxInFlightBodyBytes)
    reservedBytes += byteCount
  }
  const releaseReservation = () => {
    if (released) return
    released = true
    releaseProxyBodyBytes(reservedBytes)
  }

  if (hasDeclaredContentLength) reserveAdditionalBytes(declaredContentLength)

  return await new Promise<ProxyBodyReadResult>((resolve, reject) => {
    const chunks: Buffer[] = []
    let totalBytes = 0
    let settled = false

    const cleanup = () => {
      req.off("data", handleData)
      req.off("end", handleEnd)
      req.off("error", handleError)
      signal.removeEventListener("abort", handleAbort)
    }
    const settle = (callback: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }
    const fail = (error: Error) => {
      // Stop consuming the body without closing the response socket, so 413/504 can still be delivered.
      req.pause()
      settle(() => {
        releaseReservation()
        reject(error)
      })
    }
    const handleData = (chunk: Buffer | string) => {
      if (signal.aborted) {
        fail(new ProxyBodyTimeoutError())
        return
      }

      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      totalBytes += buffer.byteLength
      if (totalBytes > maxBodyBytes) {
        fail(new ProxyBodyTooLargeError())
        return
      }
      if (!hasDeclaredContentLength || totalBytes > reservedBytes) {
        try {
          reserveAdditionalBytes(totalBytes - reservedBytes)
        } catch (error) {
          fail(error instanceof Error ? error : new ProxyBodyCapacityExceededError())
          return
        }
      }
      chunks.push(buffer)
    }
    const handleEnd = () =>
      settle(() =>
        resolve({
          body: toArrayBuffer(Buffer.concat(chunks)),
          releaseReservation,
        })
      )
    const handleError = (error: Error) => fail(error)
    const handleAbort = () => fail(new ProxyBodyTimeoutError())

    signal.addEventListener("abort", handleAbort, { once: true })
    if (signal.aborted) {
      fail(new ProxyBodyTimeoutError())
      return
    }
    req.on("data", handleData)
    req.once("end", handleEnd)
    req.once("error", handleError)
  })
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
  headers.set("X-Forwarded-Proto", firstHeaderValue(req.headers["x-forwarded-proto"]) || "https")
  const clientIp = firstHeaderValue(req.headers["x-forwarded-for"]) || req.socket?.remoteAddress || ""
  if (clientIp) headers.set("X-Forwarded-For", clientIp)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), BACKEND_PROXY_TIMEOUT_MS)
  let proxyBodyRead: ProxyBodyReadResult | undefined

  try {
    proxyBodyRead = await readProxyBody(req, method, controller.signal)
    const upstreamResponse = await fetch(`${resolveServerApiBaseUrl(req)}${safePath}`, {
      method,
      headers,
      body: proxyBodyRead.body,
      redirect: "manual",
      signal: controller.signal,
    })

    res.status(upstreamResponse.status)
    upstreamResponse.headers.forEach((value, key) => {
      const normalizedKey = key.toLowerCase()
      if (HOP_BY_HOP_HEADERS.has(normalizedKey)) return
      if (DECODED_RESPONSE_HEADERS.has(normalizedKey)) return
      if (normalizedKey === "set-cookie") return
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
  } catch (error) {
    if (error instanceof ProxyBodyTooLargeError) {
      const maxMb = Math.floor(resolveMaxProxyBodyBytes() / (1024 * 1024))
      res.status(413).json({
        message: `파일 용량이 너무 큽니다. ${maxMb}MB 이하 파일로 다시 시도해주세요.`,
      })
      return
    }
    if (error instanceof ProxyBodyCapacityExceededError) {
      res.status(503).json({ message: "동시에 처리 중인 업로드가 많습니다. 잠시 후 다시 시도해주세요." })
      return
    }
    if (error instanceof ProxyBodyTimeoutError || controller.signal.aborted || isAbortLikeError(error)) {
      res.status(504).json({ message: "Backend proxy request timed out." })
      return
    }

    res.status(502).json({ message: "Backend proxy request failed." })
  } finally {
    proxyBodyRead?.releaseReservation()
    clearTimeout(timeoutId)
  }
}
