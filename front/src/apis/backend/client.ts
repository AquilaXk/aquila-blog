import { normalizeApiRequestPath } from "src/libs/backend/requestPath"

const DEFAULT_API_BASE_URL = "http://localhost:8080"
const DEFAULT_API_FETCH_TIMEOUT_MS = 12_000

export type ApiFetchOptions = RequestInit & {
  timeoutMs?: number
}

const isServer = typeof window === "undefined"

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, "")

const resolveStatusMessage = (status: number) => {
  if (status === 400) return "요청 값이 올바르지 않습니다."
  if (status === 401) return "로그인이 필요합니다."
  if (status === 403) return "권한이 없습니다."
  if (status === 404) return "요청한 정보를 찾을 수 없습니다."
  if (status === 409) return "요청 충돌이 발생했습니다. 다시 시도해주세요."
  if (status === 429) return "요청이 많습니다. 잠시 후 다시 시도해주세요."
  if (status >= 500) return "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
  return "요청 처리 중 오류가 발생했습니다."
}

const resolveTimeoutMs = (path: string, init: ApiFetchOptions) => {
  if (typeof init.timeoutMs === "number" && Number.isFinite(init.timeoutMs) && init.timeoutMs > 0) {
    return init.timeoutMs
  }

  const normalizedPath = path.toLowerCase()
  const method = (init.method || "GET").toUpperCase()
  const isFormLikeBody = typeof FormData !== "undefined" && init.body instanceof FormData

  if (normalizedPath.includes("/auth/login") || normalizedPath.includes("/signup/")) {
    return 10_000
  }

  if (normalizedPath.includes("/posts/images") || isFormLikeBody) {
    return 90_000
  }

  if (method === "GET") {
    return 8_000
  }

  return DEFAULT_API_FETCH_TIMEOUT_MS
}

export class ApiError extends Error {
  status: number
  url: string
  body: string
  userMessage: string

  constructor(status: number, url: string, body: string) {
    const userMessage = resolveStatusMessage(status)
    super(userMessage)
    this.name = "ApiError"
    this.status = status
    this.url = url
    this.body = body
    this.userMessage = userMessage
  }
}

export class ApiTimeoutError extends Error {
  url: string
  timeoutMs: number

  constructor(url: string, timeoutMs: number) {
    super("요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.")
    this.name = "ApiTimeoutError"
    this.url = url
    this.timeoutMs = timeoutMs
  }
}

const createTimedSignal = (sourceSignal: AbortSignal | null | undefined, timeoutMs: number) => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), timeoutMs)

  const cleanup = () => {
    clearTimeout(timeoutId)
    if (sourceSignal) {
      sourceSignal.removeEventListener("abort", onSourceAbort)
    }
  }

  const onSourceAbort = () => {
    controller.abort(sourceSignal?.reason)
  }

  if (sourceSignal) {
    if (sourceSignal.aborted) {
      controller.abort(sourceSignal.reason)
    } else {
      sourceSignal.addEventListener("abort", onSourceAbort, { once: true })
    }
  }

  return { signal: controller.signal, cleanup }
}

export const getApiBaseUrl = () => {
  const serverUrl = process.env.BACKEND_INTERNAL_URL
  const publicUrl = process.env.NEXT_PUBLIC_BACKEND_URL

  if (isServer && serverUrl) return stripTrailingSlash(serverUrl)
  if (publicUrl) return stripTrailingSlash(publicUrl)

  if (typeof window !== "undefined") {
    const { hostname } = window.location
    const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1"
    if (!isLocalHost && process.env.NODE_ENV === "production") {
      // 운영에서 API URL이 비어 있으면 추측 대신 즉시 확인 가능한 에러를 낸다.
      throw new Error("NEXT_PUBLIC_BACKEND_URL is required in production.")
    }
  }

  return DEFAULT_API_BASE_URL
}

export const apiFetch = async <T>(path: string, init: ApiFetchOptions = {}): Promise<T> => {
  const safePath = normalizeApiRequestPath(path)
  const url = `${getApiBaseUrl()}${safePath}`
  const { timeoutMs: _timeoutMs, ...requestInit } = init
  const headers = new Headers(requestInit.headers || {})
  const hasBody = requestInit.body !== undefined && requestInit.body !== null
  const isFormLikeBody =
    typeof FormData !== "undefined" && requestInit.body instanceof FormData

  if (hasBody && !isFormLikeBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const resolvedTimeoutMs = resolveTimeoutMs(safePath, init)
  const { signal, cleanup } = createTimedSignal(requestInit.signal, resolvedTimeoutMs)

  let response: Response

  try {
    response = await fetch(url, {
      credentials: "include",
      ...requestInit,
      headers,
      signal,
    })
  } catch (error) {
    cleanup()
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ApiTimeoutError(url, resolvedTimeoutMs)
    }
    throw error
  }

  cleanup()

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new ApiError(response.status, url, body)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const contentLength = response.headers.get("content-length")
  if (contentLength === "0") {
    return undefined as T
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() || ""
  if (contentType.includes("application/json")) {
    return response.json() as Promise<T>
  }

  const body = await response.text()
  return body as unknown as T
}
