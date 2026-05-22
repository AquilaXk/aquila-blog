import type { TMemberNotification } from "src/types"

export type NotificationTransportMode = "auto" | "polling-only" | "sse"
export type SnapshotLoadStatus = "success" | "snapshot-fallback" | "blocked" | "error"
export type NavigatorConnectionLike = {
  saveData?: boolean
  effectiveType?: string
}

export const STREAM_MAX_RECONNECT_ATTEMPTS = 4
export const POLLING_INTERVAL_MS = 30_000
export const POLLING_MIN_INTERVAL_MS = 8_000
export const POLLING_MAX_BACKOFF_MULTIPLIER = 8
export const POLLING_SAVE_DATA_MULTIPLIER = 1.5
export const POLLING_SLOW_NETWORK_MULTIPLIER = 1.6
export const POLLING_JITTER_RATIO = 0.2
export const POLLING_FAILURE_COOLDOWN_THRESHOLD = 3
export const POLLING_FAILURE_COOLDOWN_MS = 180_000
export const HIDDEN_GRACE_CLOSE_MS = 45_000
export const LAST_EVENT_ID_STORAGE_KEY = "member.notification.lastEventId.v1"
export const SNAPSHOT_STORAGE_KEY = "member.notification.snapshot.v1"
export const NOTIFICATION_EVENT_ID_REGEX = /^notification-\d+$/
export const AVATAR_PRELOAD_LIMIT = 8
export const AVATAR_PRELOAD_CACHE_MAX = 128
export const SNAPSHOT_FAILURE_LOG_THRESHOLD = 2

export type EventSourceLifecycleState = "idle" | "connecting" | "open"

export const resolveNotificationTransportMode = (): NotificationTransportMode => {
  const raw = (process.env.NEXT_PUBLIC_NOTIFICATION_STREAM_MODE || "").trim().toLowerCase()
  if (raw === "poll" || raw === "polling" || raw === "polling-only") return "polling-only"
  if (raw === "sse" || raw === "realtime") return "sse"
  // 운영에서는 SSE 장기 연결 노이즈 대신 polling 안정성을 기본으로 사용한다.
  if (process.env.NODE_ENV === "production") return "polling-only"
  return "auto"
}

export const NOTIFICATION_TRANSPORT_MODE = resolveNotificationTransportMode()

export const getNextPollingDelayMs = (baseMs: number) => {
  const jitter = Math.floor(baseMs * POLLING_JITTER_RATIO)
  const minDelay = Math.max(1_000, baseMs - jitter)
  const maxDelay = baseMs + jitter
  return Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay
}

export const getNavigatorConnection = (): NavigatorConnectionLike | undefined => {
  if (typeof navigator === "undefined") return undefined
  return (navigator as Navigator & { connection?: NavigatorConnectionLike }).connection
}

export const isNavigatorOnline = () => {
  if (typeof navigator === "undefined") return true
  return navigator.onLine !== false
}

export const isLoopbackHost = (hostname: string) =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]"

export const resolveSiteKey = (hostname: string) => {
  const normalized = hostname.trim().toLowerCase()
  if (!normalized) return ""
  if (isLoopbackHost(normalized)) return normalized
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) return normalized

  const parts = normalized.split(".").filter(Boolean)
  if (parts.length <= 2) return normalized
  return parts.slice(-2).join(".")
}

export const isSameSiteOrigin = (left: URL, right: URL) =>
  left.protocol === right.protocol && resolveSiteKey(left.hostname) === resolveSiteKey(right.hostname)

export const sanitizeNotificationEventId = (raw: string | null | undefined): string | null => {
  if (!raw) return null
  const normalized = raw.trim()
  if (!NOTIFICATION_EVENT_ID_REGEX.test(normalized)) return null
  return normalized
}

export const persistLastEventId = (eventId: string | null) => {
  if (typeof window === "undefined") return
  if (!eventId) {
    window.sessionStorage.removeItem(LAST_EVENT_ID_STORAGE_KEY)
    return
  }
  window.sessionStorage.setItem(LAST_EVENT_ID_STORAGE_KEY, eventId)
}

export const loadStoredLastEventId = (): string | null => {
  if (typeof window === "undefined") return null
  return sanitizeNotificationEventId(window.sessionStorage.getItem(LAST_EVENT_ID_STORAGE_KEY))
}

export const toLatestNotificationEventId = (items: TMemberNotification[]): string | null => {
  const latestId = items.reduce((maxId, item) => Math.max(maxId, item.id), 0)
  return latestId > 0 ? `notification-${latestId}` : null
}

export type StoredNotificationSnapshot = {
  items: TMemberNotification[]
  unreadCount: number
}

export const persistSnapshot = (payload: StoredNotificationSnapshot) => {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // ignore storage quota failures
  }
}

export const clearStoredSnapshot = () => {
  if (typeof window === "undefined") return
  window.sessionStorage.removeItem(SNAPSHOT_STORAGE_KEY)
}

export const loadStoredSnapshot = (): StoredNotificationSnapshot | null => {
  if (typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem(SNAPSHOT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredNotificationSnapshot>
    if (!Array.isArray(parsed.items) || typeof parsed.unreadCount !== "number") return null
    return {
      items: parsed.items as TMemberNotification[],
      unreadCount: Math.max(0, parsed.unreadCount),
    }
  } catch {
    return null
  }
}

export const isSameNotification = (left: TMemberNotification, right: TMemberNotification) =>
  left.id === right.id &&
  left.type === right.type &&
  left.createdAt === right.createdAt &&
  left.actorId === right.actorId &&
  left.actorName === right.actorName &&
  left.actorProfileImageDirectUrl === right.actorProfileImageDirectUrl &&
  left.actorProfileImageUrl === right.actorProfileImageUrl &&
  left.postId === right.postId &&
  left.commentId === right.commentId &&
  left.postTitle === right.postTitle &&
  left.commentPreview === right.commentPreview &&
  left.message === right.message &&
  left.isRead === right.isRead

export const isSameNotificationList = (left: TMemberNotification[], right: TMemberNotification[]) => {
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i += 1) {
    if (!isSameNotification(left[i], right[i])) return false
  }
  return true
}

export const resolveNotificationAvatarSrc = (item: TMemberNotification) =>
  item.actorProfileImageDirectUrl || item.actorProfileImageUrl || ""
