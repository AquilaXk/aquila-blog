import { normalizeApiRequestPath } from "src/libs/backend/requestPath"

const DEFAULT_API_BASE_URL = "http://localhost:8080"
const DEFAULT_API_FETCH_TIMEOUT_MS = 12_000
const DEFAULT_REVALIDATE_CACHE_TTL_MS = 15_000
const REVALIDATE_CACHE_MAX_TTL_MS = 300_000
const REVALIDATE_CACHE_MAX_ENTRIES = 200
const DEFAULT_GET_TRANSIENT_RETRY_COUNT = 1
const DEFAULT_GET_TRANSIENT_RETRY_DELAY_MS = 120
const GET_RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504])
const STALE_IF_ERROR_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504])

type GetCacheMode = "revalidate" | "no-store"
type ApiRequestCredentials = "include" | "omit"

type GetRequestPolicy = {
  cacheMode: GetCacheMode
  retryCount: number
  staleIfError: boolean
  timeoutMs?: number
  credentials: ApiRequestCredentials
}

const DEFAULT_GET_REQUEST_POLICY: GetRequestPolicy = {
  cacheMode: "no-store",
  retryCount: 0,
  staleIfError: false,
  credentials: "include",
}

const GET_REQUEST_POLICY_REGISTRY: Array<{
  matcher: RegExp
  policy: Partial<GetRequestPolicy>
}> = [
  {
    matcher: /^\/member\/api\/v1\/auth\/me$/i,
    policy: { cacheMode: "no-store", retryCount: 0, staleIfError: false, timeoutMs: 4_000 },
  },
  {
    matcher: /^\/member\/api\/v1\/auth\//i,
    policy: { cacheMode: "no-store", retryCount: 0, staleIfError: false, timeoutMs: 5_000 },
  },
  {
    matcher: /^\/member\/api\/v1\/notifications\/snapshot/i,
    policy: {
      cacheMode: "revalidate",
      retryCount: 0,
      staleIfError: true,
      timeoutMs: 4_000,
    },
  },
  {
    matcher: /^\/member\/api\/v1\/notifications(\/|$)/i,
    policy: { cacheMode: "no-store", retryCount: 0, staleIfError: false, timeoutMs: 5_000 },
  },
  {
    matcher: /^\/(member|post)\/api\/v1\/adm\//i,
    policy: { cacheMode: "no-store", retryCount: 0, staleIfError: false, timeoutMs: 8_000 },
  },
  {
    matcher: /^\/system\/api\/v1\/adm\//i,
    policy: { cacheMode: "no-store", retryCount: 0, staleIfError: false, timeoutMs: 8_000 },
  },
  {
    matcher: /^\/post\/api\/v1\/posts\/mine(\/|$)/i,
    policy: { cacheMode: "no-store", retryCount: 0, staleIfError: false, timeoutMs: 8_000 },
  },
  {
    matcher: /^\/post\/api\/v1\/posts\/[0-9]+\/comments(\/|$)/i,
    policy: { cacheMode: "no-store", retryCount: 0, staleIfError: false, timeoutMs: 8_000 },
  },
  {
    matcher: /^\/post\/api\/v1\/posts\/(feed|explore|search|tags|bootstrap)(\/|$)/i,
    policy: {
      cacheMode: "revalidate",
      retryCount: DEFAULT_GET_TRANSIENT_RETRY_COUNT,
      staleIfError: true,
      timeoutMs: 8_000,
      credentials: "omit",
    },
  },
  {
    matcher: /^\/post\/api\/v1\/posts\/[0-9]+(\/|$)/i,
    policy: {
      cacheMode: "revalidate",
      retryCount: DEFAULT_GET_TRANSIENT_RETRY_COUNT,
      staleIfError: true,
      timeoutMs: 8_000,
    },
  },
  {
    matcher: /^\/(member|post|system)\/api\/v1\//i,
    policy: { cacheMode: "no-store", retryCount: 0, staleIfError: false, timeoutMs: 8_000 },
  },
  {
    matcher: /^\/signup(\/|$)/i,
    policy: { cacheMode: "no-store", retryCount: 0, staleIfError: false, timeoutMs: 8_000 },
  },
]

const resolveGetRequestPolicy = (path: string): GetRequestPolicy => {
  const normalizedPath = path.trim().toLowerCase()
  const matched = GET_REQUEST_POLICY_REGISTRY.find((entry) => entry.matcher.test(normalizedPath))
  if (!matched) return DEFAULT_GET_REQUEST_POLICY

  return {
    cacheMode: matched.policy.cacheMode ?? DEFAULT_GET_REQUEST_POLICY.cacheMode,
    retryCount: matched.policy.retryCount ?? DEFAULT_GET_REQUEST_POLICY.retryCount,
    staleIfError: matched.policy.staleIfError ?? DEFAULT_GET_REQUEST_POLICY.staleIfError,
    timeoutMs: matched.policy.timeoutMs,
    credentials: matched.policy.credentials ?? DEFAULT_GET_REQUEST_POLICY.credentials,
  }
}

export type ApiFetchOptions = RequestInit & {
  timeoutMs?: number
}

const isServer = typeof window === "undefined"

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, "")

type RevalidateCacheEntry = {
  etag: string
  payload: unknown
  expiresAt: number
  maxAgeMs: number
}

const browserRevalidateCache = new Map<string, RevalidateCacheEntry>()
const browserInFlightGetRequests = new Map<string, Promise<unknown>>()

const parseCacheControlMaxAgeMs = (cacheControlHeader: string | null) => {
  if (!cacheControlHeader) return DEFAULT_REVALIDATE_CACHE_TTL_MS
  const matched = cacheControlHeader.match(/(?:^|,)\s*max-age=(\d+)/i)
  if (!matched) return DEFAULT_REVALIDATE_CACHE_TTL_MS
  const seconds = Number.parseInt(matched[1], 10)
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_REVALIDATE_CACHE_TTL_MS
  return Math.min(seconds * 1000, REVALIDATE_CACHE_MAX_TTL_MS)
}

const getRevalidateCacheEntry = (url: string) => {
  if (isServer) return null
  const cached = browserRevalidateCache.get(url)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    browserRevalidateCache.delete(url)
    return null
  }
  return cached
}

const setRevalidateCacheEntry = (
  url: string,
  etag: string,
  payload: unknown,
  cacheControlHeader: string | null,
) => {
  if (isServer) return
  const maxAgeMs = parseCacheControlMaxAgeMs(cacheControlHeader)
  browserRevalidateCache.set(url, {
    etag,
    payload,
    maxAgeMs,
    expiresAt: Date.now() + maxAgeMs,
  })

  if (browserRevalidateCache.size <= REVALIDATE_CACHE_MAX_ENTRIES) return
  const oldestKey = browserRevalidateCache.keys().next().value
  if (oldestKey) browserRevalidateCache.delete(oldestKey)
}

const refreshRevalidateCacheEntry = (
  url: string,
  fallback: RevalidateCacheEntry,
  etagHeader: string | null,
  cacheControlHeader: string | null,
) => {
  if (isServer) return
  const maxAgeMs = parseCacheControlMaxAgeMs(cacheControlHeader)
  const nextEtag = etagHeader?.trim() || fallback.etag
  browserRevalidateCache.set(url, {
    etag: nextEtag,
    payload: fallback.payload,
    maxAgeMs,
    expiresAt: Date.now() + maxAgeMs,
  })
}

export const evictBrowserRevalidateCacheEntries = (predicate: (url: string) => boolean) => {
  if (isServer) return

  const cacheKeysToDelete: string[] = []
  browserRevalidateCache.forEach((_, url) => {
    if (predicate(url)) cacheKeysToDelete.push(url)
  })
  cacheKeysToDelete.forEach((url) => {
    browserRevalidateCache.delete(url)
  })

  const inFlightKeysToDelete: string[] = []
  browserInFlightGetRequests.forEach((_, key) => {
    const separatorIndex = key.indexOf(":")
    if (separatorIndex < 0) return
    const url = key.slice(separatorIndex + 1)
    if (url && predicate(url)) inFlightKeysToDelete.push(key)
  })
  inFlightKeysToDelete.forEach((key) => {
    browserInFlightGetRequests.delete(key)
  })
}

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

const sleep = (delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs))

const resolveTimeoutMs = (path: string, init: ApiFetchOptions) => {
  if (typeof init.timeoutMs === "number" && Number.isFinite(init.timeoutMs) && init.timeoutMs > 0) {
    return init.timeoutMs
  }

  const normalizedPath = path.toLowerCase()
  const method = (init.method || "GET").toUpperCase()
  const isReadMethod = method === "GET" || method === "HEAD"
  if (isReadMethod) {
    const getPolicy = resolveGetRequestPolicy(path)
    if (
      typeof getPolicy.timeoutMs === "number" &&
      Number.isFinite(getPolicy.timeoutMs) &&
      getPolicy.timeoutMs > 0
    ) {
      return getPolicy.timeoutMs
    }
  }
  const isFormLikeBody = typeof FormData !== "undefined" && init.body instanceof FormData

  if (normalizedPath.includes("/auth/login") || normalizedPath.includes("/signup/")) {
    return 10_000
  }

  if (normalizedPath.includes("/posts/images") || isFormLikeBody) {
    return 90_000
  }

  if (isReadMethod) {
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

  if (isServer) {
    if (serverUrl) return stripTrailingSlash(serverUrl)
    if (process.env.NODE_ENV === "production") {
      // 운영 SSR은 내부 API 경로를 강제해 외부 edge/tunnel 우회를 차단한다.
      throw new Error("BACKEND_INTERNAL_URL is required for server runtime in production.")
    }
    if (publicUrl) return stripTrailingSlash(publicUrl)
  } else if (publicUrl) {
    return stripTrailingSlash(publicUrl)
  }

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
  const method = (requestInit.method || "GET").toUpperCase()
  const isReadMethod = method === "GET" || method === "HEAD"
  const getRequestPolicy = isReadMethod ? resolveGetRequestPolicy(safePath) : null
  const requestCredentials: RequestCredentials =
    requestInit.credentials ??
    (isReadMethod ? (getRequestPolicy?.credentials ?? DEFAULT_GET_REQUEST_POLICY.credentials) : "include")
  const canUseRevalidateCache =
    !isServer &&
    method === "GET" &&
    !hasBody &&
    getRequestPolicy?.cacheMode !== "no-store" &&
    requestInit.cache !== "no-store"
  const canUseInFlightDedupe =
    !isServer &&
    isReadMethod &&
    !hasBody &&
    !requestInit.signal &&
    init.timeoutMs === undefined
  const inFlightKey = canUseInFlightDedupe ? `${method}:${requestCredentials}:${url}` : null
  const revalidateCacheEntry = canUseRevalidateCache ? getRevalidateCacheEntry(url) : null

  if (hasBody && !isFormLikeBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }
  if (canUseRevalidateCache && revalidateCacheEntry && !headers.has("If-None-Match")) {
    headers.set("If-None-Match", revalidateCacheEntry.etag)
  }

  if (inFlightKey) {
    const existing = browserInFlightGetRequests.get(inFlightKey)
    if (existing) return existing as Promise<T>
  }

  const executeRequest = async (): Promise<T> => {
    const resolvedTimeoutMs = resolveTimeoutMs(safePath, init)
    const getRetryCount = getRequestPolicy?.retryCount ?? 0
    const canRetryTransientRead =
      isReadMethod &&
      !requestInit.signal &&
      getRetryCount > 0 &&
      !isServer
    const maxAttempts = canRetryTransientRead ? getRetryCount + 1 : 1
    let response: Response | null = null

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const { signal, cleanup } = createTimedSignal(requestInit.signal, resolvedTimeoutMs)

      try {
        response = await fetch(url, {
          ...requestInit,
          credentials: requestCredentials,
          headers,
          signal,
        })
        cleanup()
      } catch (error) {
        cleanup()

        if (requestInit.signal?.aborted) {
          throw error
        }

        const timedOut = error instanceof DOMException && error.name === "TimeoutError"
        const transientTransportError =
          error instanceof DOMException || error instanceof TypeError
        const hasNextAttempt = attempt < maxAttempts - 1

        if (canRetryTransientRead && transientTransportError && hasNextAttempt) {
          await sleep(DEFAULT_GET_TRANSIENT_RETRY_DELAY_MS * (attempt + 1))
          continue
        }

        if (canUseRevalidateCache && revalidateCacheEntry && getRequestPolicy?.staleIfError !== false) {
          // stale-if-error: 전송 장애/타임아웃 시 최근 정상 payload로 즉시 복구
          refreshRevalidateCacheEntry(url, revalidateCacheEntry, null, null)
          return revalidateCacheEntry.payload as T
        }

        if (timedOut) {
          throw new ApiTimeoutError(url, resolvedTimeoutMs)
        }

        throw error
      }

      if (response.ok || !canRetryTransientRead || attempt >= maxAttempts - 1) {
        break
      }

      if (!GET_RETRYABLE_STATUS_CODES.has(response.status)) {
        break
      }

      await sleep(DEFAULT_GET_TRANSIENT_RETRY_DELAY_MS * (attempt + 1))
    }

    if (!response) {
      throw new Error(`apiFetch: missing response for ${url}`)
    }

    if (response.status === 304 && canUseRevalidateCache && revalidateCacheEntry) {
      refreshRevalidateCacheEntry(
        url,
        revalidateCacheEntry,
        response.headers.get("etag"),
        response.headers.get("cache-control"),
      )
      return revalidateCacheEntry.payload as T
    }

    if (!response.ok) {
      if (
        canUseRevalidateCache &&
        revalidateCacheEntry &&
        getRequestPolicy?.staleIfError !== false &&
        STALE_IF_ERROR_STATUS_CODES.has(response.status)
      ) {
        // upstream 5xx/429 구간에서도 사용자에게 마지막 정상 스냅샷을 우선 제공
        refreshRevalidateCacheEntry(
          url,
          revalidateCacheEntry,
          response.headers.get("etag"),
          response.headers.get("cache-control"),
        )
        return revalidateCacheEntry.payload as T
      }

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
    const etag = response.headers.get("etag")?.trim() || null

    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as T
      if (canUseRevalidateCache && etag) {
        setRevalidateCacheEntry(url, etag, payload, response.headers.get("cache-control"))
      }
      return payload
    }

    const body = await response.text()
    if (canUseRevalidateCache && etag) {
      setRevalidateCacheEntry(url, etag, body, response.headers.get("cache-control"))
    }
    return body as unknown as T
  }

  if (!inFlightKey) {
    return executeRequest()
  }

  const inFlightPromise = executeRequest().finally(() => {
    browserInFlightGetRequests.delete(inFlightKey)
  })
  browserInFlightGetRequests.set(inFlightKey, inFlightPromise as Promise<unknown>)
  return inFlightPromise
}
