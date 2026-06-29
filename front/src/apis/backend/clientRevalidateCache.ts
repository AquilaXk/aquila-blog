const DEFAULT_REVALIDATE_CACHE_TTL_MS = 15_000
const REVALIDATE_CACHE_MAX_TTL_MS = 300_000
const REVALIDATE_CACHE_MAX_ENTRIES = 200

type StaleIfErrorPolicy = {
  staleIfError?: boolean
  maxStaleAgeMs?: number
}

export type ApiFetchMeta = {
  stale: boolean
  staleReason?: "transport" | "timeout" | "http-status"
  staleStatus?: number
  staleAgeMs?: number
}

export type ApiFetchResult<T> = {
  data: T
  meta: ApiFetchMeta
}

type RevalidateCacheEntry = {
  etag: string
  payload: unknown
  cachedAt: number
  expiresAt: number
  maxAgeMs: number
}

const FRESH_API_FETCH_META: ApiFetchMeta = { stale: false }
const isServer = typeof window === "undefined"
const browserRevalidateCache = new Map<string, RevalidateCacheEntry>()

const parseCacheControlMaxAgeMs = (cacheControlHeader: string | null) => {
  if (!cacheControlHeader) return DEFAULT_REVALIDATE_CACHE_TTL_MS
  const matched = cacheControlHeader.match(/(?:^|,)\s*max-age=(\d+)/i)
  if (!matched) return DEFAULT_REVALIDATE_CACHE_TTL_MS
  const seconds = Number.parseInt(matched[1], 10)
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_REVALIDATE_CACHE_TTL_MS
  return Math.min(seconds * 1000, REVALIDATE_CACHE_MAX_TTL_MS)
}

export const getRevalidateCacheEntry = (url: string) => {
  if (isServer) return null
  const cached = browserRevalidateCache.get(url)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    browserRevalidateCache.delete(url)
    return null
  }
  return cached
}

export const setRevalidateCacheEntry = (
  url: string,
  etag: string,
  payload: unknown,
  cacheControlHeader: string | null,
) => {
  if (isServer) return
  const maxAgeMs = parseCacheControlMaxAgeMs(cacheControlHeader)
  const cachedAt = Date.now()
  browserRevalidateCache.set(url, {
    etag,
    payload,
    cachedAt,
    maxAgeMs,
    expiresAt: cachedAt + maxAgeMs,
  })

  if (browserRevalidateCache.size <= REVALIDATE_CACHE_MAX_ENTRIES) return
  const oldestKey = browserRevalidateCache.keys().next().value
  if (oldestKey) browserRevalidateCache.delete(oldestKey)
}

export const refreshRevalidateCacheEntry = (
  url: string,
  fallback: RevalidateCacheEntry,
  etagHeader: string | null,
  cacheControlHeader: string | null,
) => {
  if (isServer) return
  const maxAgeMs = parseCacheControlMaxAgeMs(cacheControlHeader)
  const cachedAt = Date.now()
  const nextEtag = etagHeader?.trim() || fallback.etag
  browserRevalidateCache.set(url, {
    etag: nextEtag,
    payload: fallback.payload,
    cachedAt,
    maxAgeMs,
    expiresAt: cachedAt + maxAgeMs,
  })
}

const getRevalidateCacheEntryAgeMs = (entry: RevalidateCacheEntry) => {
  const ageMs = Date.now() - entry.cachedAt
  return Number.isFinite(ageMs) && ageMs > 0 ? ageMs : 0
}

export const canUseStaleRevalidateCacheEntry = (
  entry: RevalidateCacheEntry,
  policy: StaleIfErrorPolicy | null,
) => {
  if (policy?.staleIfError === false) return false
  const maxStaleAgeMs = policy?.maxStaleAgeMs ?? REVALIDATE_CACHE_MAX_TTL_MS
  return getRevalidateCacheEntryAgeMs(entry) <= maxStaleAgeMs
}

const toApiPathBucket = (safePath: string) =>
  safePath
    .split(/[?#]/, 1)[0]
    .replace(/\/\d+(?=\/|$)/g, "/:id")

const emitStaleIfErrorTelemetry = ({
  path,
  reason,
  status,
  staleAgeMs,
}: {
  path: string
  reason: ApiFetchMeta["staleReason"]
  status?: number
  staleAgeMs: number
}) => {
  if (isServer || typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent("aquila:api-stale-if-error", {
      detail: {
        pathBucket: toApiPathBucket(path),
        reason,
        status,
        staleAgeMs,
      },
    })
  )
}

export const buildStaleResult = <T>({
  path,
  entry,
  reason,
  status,
}: {
  path: string
  entry: RevalidateCacheEntry
  reason: NonNullable<ApiFetchMeta["staleReason"]>
  status?: number
}): ApiFetchResult<T> => {
  const staleAgeMs = getRevalidateCacheEntryAgeMs(entry)
  emitStaleIfErrorTelemetry({
    path,
    reason,
    status,
    staleAgeMs,
  })
  return {
    data: entry.payload as T,
    meta: {
      stale: true,
      staleReason: reason,
      staleStatus: status,
      staleAgeMs,
    },
  }
}

export const buildFreshResult = <T>(data: T): ApiFetchResult<T> => ({
  data,
  meta: FRESH_API_FETCH_META,
})

export const evictBrowserRevalidatePayloadCacheEntries = (predicate: (url: string) => boolean) => {
  if (isServer) return

  const cacheKeysToDelete: string[] = []
  browserRevalidateCache.forEach((_, url) => {
    if (predicate(url)) cacheKeysToDelete.push(url)
  })
  cacheKeysToDelete.forEach((url) => {
    browserRevalidateCache.delete(url)
  })
}
