const DEFAULT_API_BASE_URL = "http://localhost:8080"
const API_FETCH_TIMEOUT_MS = 12_000

const isServer = typeof window === "undefined"

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, "")

export class ApiError extends Error {
  status: number
  url: string
  body: string

  constructor(status: number, url: string, body: string) {
    super(`API request failed (${status}) ${url}: ${body}`)
    this.name = "ApiError"
    this.status = status
    this.url = url
    this.body = body
  }
}

export class ApiTimeoutError extends Error {
  url: string

  constructor(url: string) {
    super(`API request timed out (${API_FETCH_TIMEOUT_MS}ms): ${url}`)
    this.name = "ApiTimeoutError"
    this.url = url
  }
}

const createTimedSignal = (sourceSignal: AbortSignal | null | undefined) => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), API_FETCH_TIMEOUT_MS)

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

export const apiFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const url = `${getApiBaseUrl()}${path}`
  const headers = new Headers(init?.headers || {})
  const hasBody = init?.body !== undefined && init?.body !== null
  const isFormLikeBody =
    typeof FormData !== "undefined" && init?.body instanceof FormData

  if (hasBody && !isFormLikeBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const { signal, cleanup } = createTimedSignal(init?.signal)

  let response: Response

  try {
    response = await fetch(url, {
      credentials: "include",
      ...init,
      headers,
      signal,
    })
  } catch (error) {
    cleanup()
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ApiTimeoutError(url)
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
