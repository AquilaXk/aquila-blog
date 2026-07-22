import { IncomingMessage } from "http"
import { ApiError, ApiNetworkError, ApiTimeoutError } from "src/apis/backend/client"
import { normalizeApiRequestPath } from "src/libs/backend/requestPath"

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

  if (
    normalizedPath.includes("/member/api/v1/auth/me") ||
    normalizedPath.includes("/member/api/v1/auth/session") ||
    normalizedPath.includes("/members/adminprofile")
  ) {
    return 5_000
  }

  if (
    normalizedPath.includes("/post/api/v1/posts/feed") ||
    normalizedPath.includes("/post/api/v1/posts/explore") ||
    normalizedPath.includes("/post/api/v1/posts/search")
  ) {
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

  if (process.env.NODE_ENV === "production") {
    // 운영 SSR은 내부 API 경로를 강제한다.
    throw new Error("BACKEND_INTERNAL_URL is required for server-side API calls in production.")
  }

  const publicUrl = process.env.NEXT_PUBLIC_BACKEND_URL
  if (publicUrl) {
    return publicUrl.replace(/\/+$/, "")
  }

  return "http://localhost:8080"
}

export const serverApiFetch = (req: IncomingMessage, path: string, init: ServerApiFetchInit = {}) => {
  const safePath = normalizeApiRequestPath(path)
  const baseUrl = resolveServerApiBaseUrl(req)
  const { timeoutMs: _timeoutMs, ...requestInit } = init
  const headers = new Headers(init.headers)
  const cookie = req.headers.cookie
  const timeoutMs = resolveServerTimeoutMs(safePath, init)
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

  return fetch(`${baseUrl}${safePath}`, {
    ...requestInit,
    headers,
    signal: controller.signal,
  }).finally(() => {
    cleanup()
  })
}

/**
 * JSON을 소비하는 SSR(GSSP/GSP helper) 표준 fetch.
 * 성공 시 파싱된 JSON, 실패 시 공용 ApiError(status/body/userMessage)를 throw한다.
 * 스트리밍·특수 Response 소비는 raw `serverApiFetch`를 유지한다.
 */
export const serverApiFetchJson = async <T>(
  req: IncomingMessage,
  path: string,
  init: ServerApiFetchInit = {}
): Promise<T> => {
  const safePath = normalizeApiRequestPath(path)
  const url = `${resolveServerApiBaseUrl(req)}${safePath}`
  const timeoutMs = resolveServerTimeoutMs(safePath, init)

  let response: Response
  try {
    response = await serverApiFetch(req, path, init)
  } catch (error) {
    if (init.signal?.aborted) {
      throw error
    }

    const aborted =
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError")
    if (aborted) {
      throw new ApiTimeoutError(url, timeoutMs)
    }

    if (error instanceof TypeError) {
      throw new ApiNetworkError(url)
    }

    throw error
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new ApiError(response.status, url, body)
  }

  if (response.status === 204) {
    return null as T
  }

  const contentLength = response.headers.get("content-length")
  if (contentLength === "0") {
    return null as T
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() || ""
  if (contentType.includes("application/json")) {
    try {
      return (await response.json()) as T
    } catch {
      throw new ApiError(response.status, url, "")
    }
  }

  const body = await response.text()
  if (!body) {
    return null as T
  }

  try {
    return JSON.parse(body) as T
  } catch {
    throw new ApiError(response.status, url, body)
  }
}
