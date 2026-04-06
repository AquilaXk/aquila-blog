import styled from "@emotion/styled"
import { useRouter } from "next/router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ApiError, ApiTimeoutError } from "src/apis/backend/client"
import {
  buildNotificationStreamUrl,
  getNotificationSnapshot,
  markAllNotificationsRead,
  markNotificationRead,
} from "src/apis/backend/notifications"
import ProfileImage from "src/components/ProfileImage"
import AppIcon from "src/components/icons/AppIcon"
import {
  canProbeNotificationStreamRecovery,
  createNotificationStreamRecoveryState,
  markNotificationPollingFallbackEntered,
  recordNotificationStreamFailure,
  resetNotificationStreamFailures,
  shouldSwitchNotificationStreamToPolling,
} from "src/layouts/RootLayout/Header/notificationStreamRecovery"
import { formatShortDateTime } from "src/libs/utils"
import { acquireBodyScrollLock } from "src/libs/utils/bodyScrollLock"
import { toCanonicalPostPath } from "src/libs/utils/postPath"
import { pushRoute } from "src/libs/router"
import { TMemberNotification, TMemberNotificationStreamPayload } from "src/types"

type Props = {
  enabled: boolean
}

type NotificationTransportMode = "auto" | "polling-only" | "sse"
type SnapshotLoadStatus = "success" | "snapshot-fallback" | "blocked" | "error"
type NavigatorConnectionLike = {
  saveData?: boolean
  effectiveType?: string
}

const STREAM_MAX_RECONNECT_ATTEMPTS = 4
const POLLING_INTERVAL_MS = 30_000
const POLLING_MIN_INTERVAL_MS = 8_000
const POLLING_MAX_BACKOFF_MULTIPLIER = 8
const POLLING_SAVE_DATA_MULTIPLIER = 1.5
const POLLING_SLOW_NETWORK_MULTIPLIER = 1.6
const POLLING_JITTER_RATIO = 0.2
const POLLING_FAILURE_COOLDOWN_THRESHOLD = 3
const POLLING_FAILURE_COOLDOWN_MS = 180_000
const HIDDEN_GRACE_CLOSE_MS = 45_000
const LAST_EVENT_ID_STORAGE_KEY = "member.notification.lastEventId.v1"
const SNAPSHOT_STORAGE_KEY = "member.notification.snapshot.v1"
const NOTIFICATION_EVENT_ID_REGEX = /^notification-\d+$/
const AVATAR_PRELOAD_LIMIT = 8
const AVATAR_PRELOAD_CACHE_MAX = 128
const SNAPSHOT_FAILURE_LOG_THRESHOLD = 2

type EventSourceLifecycleState = "idle" | "connecting" | "open"

const resolveNotificationTransportMode = (): NotificationTransportMode => {
  const raw = (process.env.NEXT_PUBLIC_NOTIFICATION_STREAM_MODE || "").trim().toLowerCase()
  if (raw === "poll" || raw === "polling" || raw === "polling-only") return "polling-only"
  if (raw === "sse" || raw === "realtime") return "sse"
  // 운영에서는 SSE 장기 연결 노이즈 대신 polling 안정성을 기본으로 사용한다.
  if (process.env.NODE_ENV === "production") return "polling-only"
  return "auto"
}

const NOTIFICATION_TRANSPORT_MODE = resolveNotificationTransportMode()

const getNextPollingDelayMs = (baseMs: number) => {
  const jitter = Math.floor(baseMs * POLLING_JITTER_RATIO)
  const minDelay = Math.max(1_000, baseMs - jitter)
  const maxDelay = baseMs + jitter
  return Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay
}

const getNavigatorConnection = (): NavigatorConnectionLike | undefined => {
  if (typeof navigator === "undefined") return undefined
  return (navigator as Navigator & { connection?: NavigatorConnectionLike }).connection
}

const isNavigatorOnline = () => {
  if (typeof navigator === "undefined") return true
  return navigator.onLine !== false
}

const isLoopbackHost = (hostname: string) =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]"

const resolveSiteKey = (hostname: string) => {
  const normalized = hostname.trim().toLowerCase()
  if (!normalized) return ""
  if (isLoopbackHost(normalized)) return normalized
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) return normalized

  const parts = normalized.split(".").filter(Boolean)
  if (parts.length <= 2) return normalized
  return parts.slice(-2).join(".")
}

const isSameSiteOrigin = (left: URL, right: URL) =>
  left.protocol === right.protocol && resolveSiteKey(left.hostname) === resolveSiteKey(right.hostname)

const sanitizeNotificationEventId = (raw: string | null | undefined): string | null => {
  if (!raw) return null
  const normalized = raw.trim()
  if (!NOTIFICATION_EVENT_ID_REGEX.test(normalized)) return null
  return normalized
}

const persistLastEventId = (eventId: string | null) => {
  if (typeof window === "undefined") return
  if (!eventId) {
    window.sessionStorage.removeItem(LAST_EVENT_ID_STORAGE_KEY)
    return
  }
  window.sessionStorage.setItem(LAST_EVENT_ID_STORAGE_KEY, eventId)
}

const loadStoredLastEventId = (): string | null => {
  if (typeof window === "undefined") return null
  return sanitizeNotificationEventId(window.sessionStorage.getItem(LAST_EVENT_ID_STORAGE_KEY))
}

const toLatestNotificationEventId = (items: TMemberNotification[]): string | null => {
  const latestId = items.reduce((maxId, item) => Math.max(maxId, item.id), 0)
  return latestId > 0 ? `notification-${latestId}` : null
}

type StoredNotificationSnapshot = {
  items: TMemberNotification[]
  unreadCount: number
}

const persistSnapshot = (payload: StoredNotificationSnapshot) => {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // ignore storage quota failures
  }
}

const clearStoredSnapshot = () => {
  if (typeof window === "undefined") return
  window.sessionStorage.removeItem(SNAPSHOT_STORAGE_KEY)
}

const loadStoredSnapshot = (): StoredNotificationSnapshot | null => {
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

const isSameNotification = (left: TMemberNotification, right: TMemberNotification) =>
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

const isSameNotificationList = (left: TMemberNotification[], right: TMemberNotification[]) => {
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i += 1) {
    if (!isSameNotification(left[i], right[i])) return false
  }
  return true
}

const resolveNotificationAvatarSrc = (item: TMemberNotification) =>
  item.actorProfileImageDirectUrl || item.actorProfileImageUrl || ""

const NotificationBell: React.FC<Props> = ({ enabled }) => {
  const router = useRouter()
  const preferPolling = useMemo(() => {
    if (NOTIFICATION_TRANSPORT_MODE === "polling-only") return true
    if (NOTIFICATION_TRANSPORT_MODE === "sse") return false
    if (typeof window === "undefined") return false

    try {
      const streamUrl = new URL(buildNotificationStreamUrl(), window.location.origin)
      const currentUrl = new URL(window.location.href)
      // 완전한 cross-site 오리진에서만 폴링으로 강등한다.
      // www/api 같은 동일 사이트 서브도메인 조합은 SSE를 우선 유지한다.
      return streamUrl.origin !== currentUrl.origin && !isSameSiteOrigin(streamUrl, currentUrl)
    } catch {
      return false
    }
  }, [])
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)
  const hadOpenedRef = useRef(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const eventSourceCleanupRef = useRef<(() => void) | null>(null)
  const attachEventSourceRef = useRef<(() => void) | null>(null)
  const clearReconnectTimerRef = useRef<() => void>(() => {})
  const hiddenCloseTimerRef = useRef<number | null>(null)
  const intentionalCloseRef = useRef(false)
  const streamLifecycleRef = useRef<EventSourceLifecycleState>("idle")
  const reconnectTimerRef = useRef<number | null>(null)
  const reconnectAttemptRef = useRef(0)
  const recoveryStateRef = useRef(createNotificationStreamRecoveryState())
  const initialLastEventId = useMemo(() => loadStoredLastEventId(), [])
  const lastEventIdRef = useRef<string | null>(initialLastEventId)
  const [streamMode, setStreamMode] = useState<"sse" | "poll">(preferPolling ? "poll" : "sse")
  const [open, setOpen] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const [items, setItems] = useState<TMemberNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isReady, setIsReady] = useState(false)
  const [isRealtimeActive, setIsRealtimeActive] = useState(false)
  const [isSnapshotFallback, setIsSnapshotFallback] = useState(false)
  const [notificationAccessState, setNotificationAccessState] = useState<"pending" | "ready" | "blocked">(
    "pending"
  )
  const [isDocumentVisible, setIsDocumentVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState !== "hidden"
  )
  const isDocumentVisibleRef = useRef(isDocumentVisible)
  const pollingFailureStreakRef = useRef(0)
  const lastSnapshotErrorRef = useRef<unknown>(null)
  const lastLoggedSnapshotFailureStreakRef = useRef(0)
  const itemsRef = useRef<TMemberNotification[]>([])
  const unreadCountRef = useRef(0)
  const preloadedAvatarSrcRef = useRef<Set<string>>(new Set())

  const describeSnapshotError = useCallback((error: unknown) => {
    if (error instanceof ApiTimeoutError) {
      return `timeout(${error.timeoutMs}ms)`
    }
    if (error instanceof ApiError) {
      return `api-${error.status}`
    }
    if (error instanceof DOMException) {
      return error.name
    }
    if (error instanceof Error) {
      return error.name
    }
    return "unknown"
  }, [])

  const resetSnapshotFailureObservation = useCallback(() => {
    lastSnapshotErrorRef.current = null
    lastLoggedSnapshotFailureStreakRef.current = 0
  }, [])

  const reportSnapshotFailureIfNeeded = useCallback(
    (nextFailureStreak: number) => {
      if (nextFailureStreak < SNAPSHOT_FAILURE_LOG_THRESHOLD) return
      if (lastLoggedSnapshotFailureStreakRef.current >= nextFailureStreak) return

      lastLoggedSnapshotFailureStreakRef.current = nextFailureStreak
      console.warn("[notifications] snapshot polling is recovering from repeated failures", {
        streak: nextFailureStreak,
        reason: describeSnapshotError(lastSnapshotErrorRef.current),
        mode: streamMode,
        fallback: lastSnapshotErrorRef.current ? "none-or-session" : "cache",
      })
    },
    [describeSnapshotError, streamMode]
  )

  const resolvePollingBaseIntervalMs = useCallback((failureStreak: number) => {
    let baseMs = POLLING_INTERVAL_MS
    const connection = getNavigatorConnection()
    if (connection?.saveData) {
      baseMs = Math.round(baseMs * POLLING_SAVE_DATA_MULTIPLIER)
    } else if (connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g") {
      baseMs = Math.round(baseMs * POLLING_SLOW_NETWORK_MULTIPLIER)
    }

    if (failureStreak > 0) {
      const multiplier = Math.min(POLLING_MAX_BACKOFF_MULTIPLIER, 2 ** failureStreak)
      baseMs = Math.round(baseMs * multiplier)
    }

    if (failureStreak >= POLLING_FAILURE_COOLDOWN_THRESHOLD) {
      baseMs = Math.max(baseMs, POLLING_FAILURE_COOLDOWN_MS)
    }

    return Math.max(POLLING_MIN_INTERVAL_MS, baseMs)
  }, [])

  const setLastNotificationEventId = useCallback((eventId: string | null) => {
    const sanitized = sanitizeNotificationEventId(eventId)
    lastEventIdRef.current = sanitized
    persistLastEventId(sanitized)
  }, [])

  const prewarmNotificationAvatars = useCallback((nextItems: TMemberNotification[]) => {
    if (typeof window === "undefined") return
    const preloadedSet = preloadedAvatarSrcRef.current
    const candidates = nextItems
      .slice(0, AVATAR_PRELOAD_LIMIT)
      .map((item) => resolveNotificationAvatarSrc(item).trim())
      .filter(Boolean)

    for (const src of candidates) {
      if (preloadedSet.has(src)) continue
      if (preloadedSet.size >= AVATAR_PRELOAD_CACHE_MAX) {
        const overflowCount = preloadedSet.size - AVATAR_PRELOAD_CACHE_MAX + 1
        const iterator = preloadedSet.values()
        for (let i = 0; i < overflowCount; i += 1) {
          const oldest = iterator.next()
          if (oldest.done) break
          preloadedSet.delete(oldest.value)
        }
      }
      preloadedSet.add(src)
      const img = new Image()
      img.decoding = "async"
      img.src = src
    }
  }, [])

  const applySnapshotState = useCallback(
    ({
      nextItems,
      nextUnreadCount,
      fallback,
    }: {
      nextItems: TMemberNotification[]
      nextUnreadCount: number
      fallback: boolean
    }) => {
      const sameItems = isSameNotificationList(itemsRef.current, nextItems)
      const sameUnreadCount = unreadCountRef.current === nextUnreadCount

      if (!sameItems) {
        itemsRef.current = nextItems
        setItems(nextItems)
        prewarmNotificationAvatars(nextItems)
      }
      if (!sameUnreadCount) {
        unreadCountRef.current = nextUnreadCount
        setUnreadCount(nextUnreadCount)
      }

      setLastNotificationEventId(toLatestNotificationEventId(nextItems))
      setIsReady(true)
      setIsSnapshotFallback(fallback)
      setNotificationAccessState("ready")

      if (!sameItems || !sameUnreadCount) {
        persistSnapshot({
          items: nextItems,
          unreadCount: nextUnreadCount,
        })
      }
    },
    [prewarmNotificationAvatars, setLastNotificationEventId]
  )

  const pushNotification = useCallback((incoming: TMemberNotification) => {
    prewarmNotificationAvatars([incoming])
    setItems((prev) => {
      const deduped = prev.filter((item) => item.id !== incoming.id)
      const next = [incoming, ...deduped].slice(0, 20)
      if (isSameNotificationList(prev, next)) return prev
      itemsRef.current = next
      return next
    })
  }, [prewarmNotificationAvatars])

  const clearHiddenCloseTimer = useCallback(() => {
    if (hiddenCloseTimerRef.current !== null) {
      window.clearTimeout(hiddenCloseTimerRef.current)
      hiddenCloseTimerRef.current = null
    }
  }, [])

  const closeEventSource = useCallback(
    (intentional: boolean) => {
      intentionalCloseRef.current = intentional
      clearHiddenCloseTimer()
      eventSourceCleanupRef.current?.()
      eventSourceCleanupRef.current = null
      eventSourceRef.current?.close()
      eventSourceRef.current = null
      streamLifecycleRef.current = "idle"
    },
    [clearHiddenCloseTimer]
  )

  const loadSnapshot = useCallback(async (): Promise<SnapshotLoadStatus> => {
    if (!enabled) return "error"

    try {
      const snapshot = await getNotificationSnapshot()
      resetSnapshotFailureObservation()
      applySnapshotState({
        nextItems: snapshot.items,
        nextUnreadCount: snapshot.unreadCount,
        fallback: false,
      })
      return "success"
    } catch (error) {
      lastSnapshotErrorRef.current = error
      if (error instanceof ApiError && error.status === 401) {
        itemsRef.current = []
        unreadCountRef.current = 0
        setItems([])
        setUnreadCount(0)
        setIsReady(false)
        setIsSnapshotFallback(false)
        setNotificationAccessState("blocked")
        setOpen(false)
        clearStoredSnapshot()
        setLastNotificationEventId(null)
        resetSnapshotFailureObservation()
        return "blocked"
      }

      const stored = loadStoredSnapshot()
      if (stored) {
        applySnapshotState({
          nextItems: stored.items,
          nextUnreadCount: stored.unreadCount,
          fallback: true,
        })
        return "snapshot-fallback"
      }
      setIsReady(false)
      setIsSnapshotFallback(false)
      setNotificationAccessState("pending")
      return "error"
    }
  }, [applySnapshotState, enabled, resetSnapshotFailureObservation, setLastNotificationEventId])

  useEffect(() => {
    if (typeof document === "undefined") return

    const handleVisibilityChange = () => {
      setIsDocumentVisible(document.visibilityState !== "hidden")
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [])

  useEffect(() => {
    isDocumentVisibleRef.current = isDocumentVisible
  }, [isDocumentVisible])

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    unreadCountRef.current = unreadCount
  }, [unreadCount])

  useEffect(() => {
    if (typeof window === "undefined") return

    const media = window.matchMedia("(max-width: 720px)")
    const sync = () => {
      setIsMobileViewport(media.matches)
    }

    sync()
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", sync)
      return () => media.removeEventListener("change", sync)
    }

    media.addListener(sync)
    return () => media.removeListener(sync)
  }, [])

  useEffect(() => {
    if (typeof document === "undefined") return
    if (!open || !isMobileViewport) return

    const releaseBodyScrollLock = acquireBodyScrollLock()

    return () => {
      releaseBodyScrollLock()
    }
  }, [isMobileViewport, open])

  useEffect(() => {
    if (!enabled) {
      clearReconnectTimerRef.current()
      attachEventSourceRef.current = null
      closeEventSource(true)
      itemsRef.current = []
      unreadCountRef.current = 0
      setItems([])
      setUnreadCount(0)
      setOpen(false)
      setIsReady(false)
      setIsRealtimeActive(false)
      setIsSnapshotFallback(false)
      setNotificationAccessState("pending")
      reconnectAttemptRef.current = 0
      pollingFailureStreakRef.current = 0
      recoveryStateRef.current = createNotificationStreamRecoveryState()
      setLastNotificationEventId(null)
      clearStoredSnapshot()
      setStreamMode(preferPolling ? "poll" : "sse")
      return
    }

    const stored = loadStoredSnapshot()
    if (stored) {
      pollingFailureStreakRef.current = 0
      applySnapshotState({
        nextItems: stored.items,
        nextUnreadCount: stored.unreadCount,
        fallback: true,
      })
    } else {
      itemsRef.current = []
      unreadCountRef.current = 0
      setItems([])
      setUnreadCount(0)
      setIsReady(false)
      setIsSnapshotFallback(false)
      setNotificationAccessState("pending")
    }
  }, [applySnapshotState, closeEventSource, enabled, preferPolling, setLastNotificationEventId])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!enabled || isRealtimeActive || open || !isDocumentVisible || notificationAccessState === "blocked") return

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
      cancelIdleCallback?: (handle: number) => void
    }
    let disposed = false
    let fallbackTimer: number | null = null
    let idleHandle: number | null = null

    const activateRealtime = () => {
      if (disposed) return
      setIsRealtimeActive(true)
      void loadSnapshot()
    }

    if (typeof idleWindow.requestIdleCallback === "function") {
      idleHandle = idleWindow.requestIdleCallback(activateRealtime, { timeout: 4000 })
    } else {
      fallbackTimer = window.setTimeout(activateRealtime, 2400)
    }

    return () => {
      disposed = true
      if (idleHandle !== null && typeof idleWindow.cancelIdleCallback === "function") {
        idleWindow.cancelIdleCallback(idleHandle)
      }
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer)
      }
    }
  }, [enabled, isDocumentVisible, isRealtimeActive, loadSnapshot, notificationAccessState, open])

  useEffect(() => {
    if (!enabled || !isReady) return
    persistSnapshot({ items, unreadCount })
  }, [enabled, isReady, items, unreadCount])

  useEffect(() => {
    if (!enabled || !isRealtimeActive || streamMode !== "sse" || notificationAccessState !== "ready") {
      clearReconnectTimerRef.current()
      attachEventSourceRef.current = null
      closeEventSource(true)
      return
    }

    let disposed = false

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }

    clearReconnectTimerRef.current = clearReconnectTimer

    const scheduleReconnect = () => {
      if (disposed || reconnectTimerRef.current !== null || intentionalCloseRef.current) return

      setIsReady(false)
      const nextAttempt = reconnectAttemptRef.current + 1
      reconnectAttemptRef.current = nextAttempt
      recoveryStateRef.current = recordNotificationStreamFailure(recoveryStateRef.current, Date.now())

      if (shouldSwitchNotificationStreamToPolling(recoveryStateRef.current, Date.now())) {
        closeEventSource(false)
        recoveryStateRef.current = markNotificationPollingFallbackEntered(recoveryStateRef.current, Date.now())
        setStreamMode("poll")
        return
      }

      if (nextAttempt > STREAM_MAX_RECONNECT_ATTEMPTS) {
        closeEventSource(false)
        recoveryStateRef.current = markNotificationPollingFallbackEntered(recoveryStateRef.current, Date.now())
        setStreamMode("poll")
        return
      }

      const retryDelay = Math.min(1500 * nextAttempt, 10000)
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null
        attachEventSourceRef.current?.()
      }, retryDelay)
    }

    const attachEventSource = () => {
      if (disposed) return
      if (!isDocumentVisibleRef.current) return
      if (streamLifecycleRef.current === "connecting" || streamLifecycleRef.current === "open") return
      if (eventSourceRef.current) return

      clearReconnectTimer()
      intentionalCloseRef.current = false
      streamLifecycleRef.current = "connecting"
      const streamUrl = new URL(buildNotificationStreamUrl(), window.location.origin)
      if (lastEventIdRef.current) {
        // We recreate EventSource manually (for backoff/fallback control), so we pass the last id explicitly.
        streamUrl.searchParams.set("lastEventId", lastEventIdRef.current)
      }

      const eventSource = new EventSource(streamUrl.toString(), { withCredentials: true })
      eventSourceRef.current = eventSource

      const markStreamOpen = () => {
        streamLifecycleRef.current = "open"
      }

      const handleNotification = (event: MessageEvent<string>) => {
        markStreamOpen()
        try {
          const payload = JSON.parse(event.data) as TMemberNotificationStreamPayload
          setLastNotificationEventId(
            sanitizeNotificationEventId(event.lastEventId) || `notification-${payload.notification.id}`
          )
          pushNotification(payload.notification)
          setUnreadCount((prev) => {
            if (prev === payload.unreadCount) return prev
            unreadCountRef.current = payload.unreadCount
            return payload.unreadCount
          })
          setIsReady(true)
          setIsSnapshotFallback(false)
        } catch {
          // ignore malformed payloads
        }
      }

      const handleConnected = (_event: MessageEvent<string>) => {
        markStreamOpen()
        const recovered = reconnectAttemptRef.current > 0
        reconnectAttemptRef.current = 0
        recoveryStateRef.current = resetNotificationStreamFailures(recoveryStateRef.current)
        setIsReady(true)
        setIsSnapshotFallback(false)

        if (recovered) {
          void loadSnapshot()
        }
      }

      const handleHeartbeat = (_event: MessageEvent<string>) => {
        markStreamOpen()
        recoveryStateRef.current = resetNotificationStreamFailures(recoveryStateRef.current)
        setIsReady(true)
      }

      const detachListeners = () => {
        eventSource.removeEventListener("connected", handleConnected)
        eventSource.removeEventListener("notification", handleNotification)
        eventSource.removeEventListener("heartbeat", handleHeartbeat)
        eventSource.onerror = null
      }

      eventSourceCleanupRef.current = detachListeners
      eventSource.addEventListener("connected", handleConnected)
      eventSource.addEventListener("notification", handleNotification)
      eventSource.addEventListener("heartbeat", handleHeartbeat)
      eventSource.onerror = () => {
        const isIntentionalClose = intentionalCloseRef.current || disposed
        detachListeners()
        eventSource.close()
        if (eventSourceRef.current === eventSource) {
          eventSourceRef.current = null
        }
        streamLifecycleRef.current = "idle"
        if (isIntentionalClose) return
        scheduleReconnect()
      }
    }

    attachEventSourceRef.current = attachEventSource
    if (isDocumentVisibleRef.current) {
      attachEventSource()
    }

    return () => {
      disposed = true
      attachEventSourceRef.current = null
      clearReconnectTimer()
      clearReconnectTimerRef.current = () => {}
      closeEventSource(true)
    }
  }, [
    closeEventSource,
    enabled,
    isRealtimeActive,
    loadSnapshot,
    notificationAccessState,
    pushNotification,
    setLastNotificationEventId,
    streamMode,
  ])

  useEffect(() => {
    if (!enabled || !isRealtimeActive || streamMode !== "sse" || notificationAccessState !== "ready") {
      clearHiddenCloseTimer()
      return
    }

    if (!isDocumentVisible) {
      if (hiddenCloseTimerRef.current !== null) return
      hiddenCloseTimerRef.current = window.setTimeout(() => {
        hiddenCloseTimerRef.current = null
        clearReconnectTimerRef.current()
        closeEventSource(true)
      }, HIDDEN_GRACE_CLOSE_MS)
      return
    }

    clearHiddenCloseTimer()
    reconnectAttemptRef.current = 0
    attachEventSourceRef.current?.()
  }, [
    clearHiddenCloseTimer,
    closeEventSource,
    enabled,
    isDocumentVisible,
    isRealtimeActive,
    notificationAccessState,
    streamMode,
  ])

  useEffect(() => {
    if (typeof window === "undefined") return

    const handlePageExit = () => {
      clearHiddenCloseTimer()
      clearReconnectTimerRef.current()
      closeEventSource(true)
    }

    window.addEventListener("pagehide", handlePageExit)
    window.addEventListener("beforeunload", handlePageExit)
    return () => {
      window.removeEventListener("pagehide", handlePageExit)
      window.removeEventListener("beforeunload", handlePageExit)
    }
  }, [clearHiddenCloseTimer, closeEventSource])

  useEffect(() => {
    if (!enabled || !isRealtimeActive || streamMode !== "poll" || !isDocumentVisible || notificationAccessState !== "ready") return

    let disposed = false
    let timer: number | null = null

    const run = async () => {
      if (disposed) return
      let nextFailureStreak = pollingFailureStreakRef.current

      if (!isNavigatorOnline()) {
        lastSnapshotErrorRef.current = new Error("NetworkOffline")
        nextFailureStreak = Math.min(
          pollingFailureStreakRef.current + 1,
          STREAM_MAX_RECONNECT_ATTEMPTS + POLLING_FAILURE_COOLDOWN_THRESHOLD
        )
        pollingFailureStreakRef.current = nextFailureStreak
        reportSnapshotFailureIfNeeded(nextFailureStreak)
      } else {
        const snapshotStatus = await loadSnapshot()
        if (disposed) return

        if (snapshotStatus === "success") {
          pollingFailureStreakRef.current = 0
          lastLoggedSnapshotFailureStreakRef.current = 0
          nextFailureStreak = 0
        } else if (snapshotStatus === "blocked") {
          pollingFailureStreakRef.current = 0
          lastLoggedSnapshotFailureStreakRef.current = 0
          setIsRealtimeActive(false)
          return
        } else {
          nextFailureStreak = Math.min(
            pollingFailureStreakRef.current + 1,
            STREAM_MAX_RECONNECT_ATTEMPTS + POLLING_FAILURE_COOLDOWN_THRESHOLD
          )
          pollingFailureStreakRef.current = nextFailureStreak
          reportSnapshotFailureIfNeeded(nextFailureStreak)
        }
      }

      if (disposed) return

      if (nextFailureStreak === 0) {
        pollingFailureStreakRef.current = 0
        lastLoggedSnapshotFailureStreakRef.current = 0
      }

      const pollingBaseIntervalMs = resolvePollingBaseIntervalMs(nextFailureStreak)
      timer = window.setTimeout(() => {
        void run()
      }, getNextPollingDelayMs(pollingBaseIntervalMs))
    }

    void run()

    return () => {
      disposed = true
      if (timer !== null) {
        window.clearTimeout(timer)
      }
    }
  }, [
    enabled,
    isDocumentVisible,
    isRealtimeActive,
    loadSnapshot,
    notificationAccessState,
    reportSnapshotFailureIfNeeded,
    resolvePollingBaseIntervalMs,
    streamMode,
  ])

  useEffect(() => {
    if (!enabled || !isRealtimeActive || streamMode !== "poll" || notificationAccessState !== "ready") return

    const handleOnline = () => {
      pollingFailureStreakRef.current = 0
      void loadSnapshot()
    }

    window.addEventListener("online", handleOnline)
    return () => {
      window.removeEventListener("online", handleOnline)
    }
  }, [enabled, isRealtimeActive, loadSnapshot, notificationAccessState, streamMode])

  useEffect(() => {
    if (!enabled) return
    if (!isRealtimeActive) return
    if (!isDocumentVisible) return
    if (preferPolling) return
    if (streamMode !== "poll") return
    if (
      !canProbeNotificationStreamRecovery({
        state: recoveryStateRef.current,
        nowMs: Date.now(),
        enabled,
        isDocumentVisible,
        preferPolling,
        streamMode,
        notificationAccessState,
      })
    ) {
      return
    }

    const timer = window.setTimeout(() => {
      pollingFailureStreakRef.current = 0
      reconnectAttemptRef.current = 0
      recoveryStateRef.current = resetNotificationStreamFailures(recoveryStateRef.current)
      setStreamMode("sse")
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [enabled, isDocumentVisible, isRealtimeActive, notificationAccessState, preferPolling, streamMode])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [open])

  useEffect(() => {
    if (!open) return

    const panel = panelRef.current
    if (!panel) return

    const focusableSelectors = [
      "button:not([disabled])",
      "a[href]",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ]

    const getFocusableElements = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(focusableSelectors.join(","))).filter(
        (element) => !element.hasAttribute("disabled") && element.tabIndex !== -1
      )

    const focusables = getFocusableElements()
    ;(focusables[0] || panel).focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
        return
      }

      if (event.key !== "Tab") return

      const currentFocusable = getFocusableElements()
      if (currentFocusable.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }

      const first = currentFocusable[0]
      const last = currentFocusable[currentFocusable.length - 1]
      const active = document.activeElement as HTMLElement | null

      if (event.shiftKey) {
        if (!active || active === first || !panel.contains(active)) {
          event.preventDefault()
          last.focus()
        }
        return
      }

      if (!active || active === last || !panel.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open])

  useEffect(() => {
    if (open) {
      hadOpenedRef.current = true
      return
    }
    if (!hadOpenedRef.current) return
    if (lastFocusedRef.current) {
      lastFocusedRef.current.focus()
      lastFocusedRef.current = null
      return
    }

    triggerRef.current?.focus()
  }, [open])

  const hasUnread = unreadCount > 0
  const unreadBadge = useMemo(() => {
    if (unreadCount <= 0) return ""
    if (unreadCount > 99) return "99+"
    return String(unreadCount)
  }, [unreadCount])

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead()
      const nextItems = items.map((item) => ({ ...item, isRead: true }))
      unreadCountRef.current = 0
      itemsRef.current = nextItems
      setUnreadCount((prev) => (prev === 0 ? prev : 0))
      setItems((prev) => (isSameNotificationList(prev, nextItems) ? prev : nextItems))
      persistSnapshot({
        items: nextItems,
        unreadCount: 0,
      })
    } catch {
      // keep current state if mark-all fails
    }
  }

  const handleOpenChange = async () => {
    if (!open && typeof document !== "undefined") {
      lastFocusedRef.current = document.activeElement as HTMLElement | null
    }
    const nextOpen = !open
    setOpen(nextOpen)

    if (nextOpen && !isRealtimeActive) {
      setIsRealtimeActive(true)
      await loadSnapshot()
      return
    }

    if (nextOpen && !isReady) {
      await loadSnapshot()
    }
  }

  const handleMoveToNotification = async (notification: TMemberNotification) => {
    if (!notification.isRead) {
      try {
        await markNotificationRead(notification.id)
        const nextUnreadCount = Math.max(0, unreadCount - 1)
        const nextItems = items.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item))
        unreadCountRef.current = nextUnreadCount
        itemsRef.current = nextItems
        setUnreadCount((prev) => (prev === nextUnreadCount ? prev : nextUnreadCount))
        setItems((prev) => (isSameNotificationList(prev, nextItems) ? prev : nextItems))
        persistSnapshot({
          items: nextItems,
          unreadCount: nextUnreadCount,
        })
      } catch {
        // move to target even if mark-read fails
      }
    }

    setOpen(false)
    await pushRoute(router, `${toCanonicalPostPath(notification.postId)}#comment-${notification.commentId}`)
  }

  if (!enabled) {
    return null
  }

  return (
    <StyledWrapper ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="trigger"
        data-ui="nav-control"
        data-open={open}
        aria-label="알림"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => void handleOpenChange()}
      >
        <AppIcon name="bell" />
        {hasUnread && <span className="badge">{unreadBadge}</span>}
      </button>
      {open && (
        <>
          <button
            type="button"
            className="mobileBackdrop"
            aria-label="알림 닫기"
            onClick={() => setOpen(false)}
            tabIndex={-1}
          />
          <div
            ref={panelRef}
            className="panel"
            role="dialog"
            aria-modal={isMobileViewport ? "true" : "false"}
            aria-label="알림 목록"
            tabIndex={-1}
          >
            <div className="panelHead">
              <div className="panelTitle">
                <strong>알림</strong>
                {isSnapshotFallback && <small>오프라인 스냅샷</small>}
              </div>
              <button type="button" className="readAllBtn" onClick={() => void handleMarkAllRead()} disabled={!hasUnread}>
                모두 읽음
              </button>
            </div>
            {items.length > 0 ? (
              <ul className="list">
                {items.map((item, index) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="itemBtn"
                      data-read={item.isRead}
                      onClick={() => void handleMoveToNotification(item)}
                    >
                      <div className="avatar">
                        <ProfileImage
                          src={resolveNotificationAvatarSrc(item)}
                          alt={`${item.actorName} avatar`}
                          priority={index < 3}
                          loading={index < 3 ? "eager" : "lazy"}
                          fillContainer
                          width={40}
                          height={40}
                        />
                      </div>
                      <div className="copy">
                        <div className="headLine">
                          <strong>{item.actorName}</strong>
                          <span>{formatShortDateTime(item.createdAt, "ko")}</span>
                        </div>
                        <p>{item.message}</p>
                        <small>{item.postTitle}</small>
                      </div>
                      {!item.isRead && <span className="dot" aria-hidden="true" />}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty">
                <strong>알림이 없습니다.</strong>
              </div>
            )}
          </div>
        </>
      )}
    </StyledWrapper>
  )
}

export default NotificationBell

const StyledWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;

  .trigger {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: ${({ theme }) => theme.variables.navControl.height}px;
    min-height: ${({ theme }) => theme.variables.navControl.height}px;
    width: auto;
    height: ${({ theme }) => theme.variables.navControl.height}px;
    padding: 0 0.34rem;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    flex-shrink: 0;
    transition: color 0.16s ease, text-decoration-color 0.16s ease;

    &:hover,
    &[data-open="true"] {
      color: ${({ theme }) => theme.colors.gray12};
      text-decoration: underline;
      text-underline-offset: 3px;
      text-decoration-thickness: 1px;
    }

    &:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.blue4};
    }

    svg {
      width: 18px;
      height: 18px;
      display: block;
    }
  }

  .badge {
    position: absolute;
    top: -5px;
    right: -6px;
    min-width: 18px;
    height: 18px;
    padding: 0 0.24rem;
    border-radius: 999px;
    background: ${({ theme }) => theme.colors.red10};
    color: white;
    font-size: 0.62rem;
    font-weight: 700;
    line-height: 18px;
    text-align: center;
    border: 2px solid ${({ theme }) => theme.colors.gray2};
  }

  .panel {
    position: absolute;
    top: calc(100% + 0.5rem);
    right: 0;
    width: min(24rem, calc(100vw - 1.6rem));
    max-height: min(70vh, 28rem);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    border-radius: 16px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    box-shadow: 0 20px 42px rgba(0, 0, 0, 0.44);
    padding: 0.74rem;
    overflow: hidden;
    transform-origin: top right;
    animation: panelIn 0.14s ease-out;
    z-index: 30;

    &:focus-visible {
      outline: none;
      box-shadow:
        0 0 0 2px ${({ theme }) => theme.colors.blue4},
        0 20px 42px rgba(0, 0, 0, 0.44);
    }
  }

  .mobileBackdrop {
    display: none;
  }

  @keyframes panelIn {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.985);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .panelHead {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.7rem;
    margin-bottom: 0.62rem;
    padding: 0.08rem 0.12rem;
  }

  .panelTitle {
    display: inline-flex;
    align-items: center;
    gap: 0.46rem;
    min-width: 0;

    strong {
      display: block;
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 0.96rem;
      margin: 0;
    }

    small {
      display: inline-flex;
      align-items: center;
      min-height: 22px;
      padding: 0 0.46rem;
      border-radius: 999px;
      border: 1px solid ${({ theme }) => theme.colors.gray6};
      color: ${({ theme }) => theme.colors.gray10};
      background: ${({ theme }) => theme.colors.gray2};
      font-size: 0.68rem;
      font-weight: 700;
      white-space: nowrap;
    }
  }

  .readAllBtn {
    min-height: 30px;
    padding: 0 0.66rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.72rem;
    font-weight: 700;
    white-space: nowrap;
    transition: border-color 0.16s ease, color 0.16s ease, background-color 0.16s ease;

    &:hover:not(:disabled) {
      border-color: ${({ theme }) => theme.colors.gray7};
      color: ${({ theme }) => theme.colors.gray12};
      background: ${({ theme }) => theme.colors.gray4};
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.46rem;
    min-height: 0;
    overflow: auto;
    scrollbar-width: thin;
    scrollbar-color: ${({ theme }) => theme.colors.gray7} transparent;

    &::-webkit-scrollbar {
      width: 7px;
    }

    &::-webkit-scrollbar-thumb {
      border-radius: 999px;
      background: ${({ theme }) => theme.colors.gray7};
    }
  }

  .itemBtn {
    width: 100%;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 0.62rem;
    align-items: center;
    padding: 0.66rem 0.72rem;
    border-radius: 12px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray1};
    text-align: left;
    transition: border-color 0.16s ease, background-color 0.16s ease, transform 0.16s ease;

    &:hover {
      border-color: ${({ theme }) => theme.colors.gray7};
      background: ${({ theme }) => theme.colors.gray2};
      transform: translateY(-1px);
    }

    &:focus-visible {
      outline: none;
      border-color: ${({ theme }) => theme.colors.blue8};
      box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.blue4};
    }

    &[data-read="false"] {
      border-color: ${({ theme }) => theme.colors.blue7};
      background: ${({ theme }) => "rgba(24, 67, 135, 0.22)"};
    }
  }

  .avatar {
    position: relative;
    width: 36px;
    height: 36px;
    border-radius: 999px;
    overflow: hidden;
    flex-shrink: 0;
    background: ${({ theme }) => theme.colors.gray4};
  }

  .copy {
    min-width: 0;

    p,
    small {
      margin: 0;
    }

    p {
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 0.8rem;
      line-height: 1.43;
      margin-bottom: 0.18rem;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    small {
      color: ${({ theme }) => theme.colors.gray10};
      display: block;
      font-size: 0.73rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .headLine {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.24rem;

    strong {
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 0.79rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    span {
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.69rem;
      flex-shrink: 0;
    }
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: ${({ theme }) => theme.colors.blue9};
    flex-shrink: 0;
  }

  .empty {
    display: grid;
    gap: 0;
    padding: 1rem 0.28rem 0.45rem;
    text-align: center;

    strong {
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 0.84rem;
    }
  }

  @media (max-width: 720px) {
    .mobileBackdrop {
      display: block;
      position: fixed;
      inset: 0;
      border: 0;
      padding: 0;
      margin: 0;
      background: rgba(2, 6, 23, 0.42);
      z-index: 35;
      cursor: default;
    }

    .trigger {
      min-width: 36px;
      min-height: 36px;
      width: auto;
      height: 36px;
      padding: 0 0.34rem;

      svg {
        width: 18px;
        height: 18px;
      }
    }

    .panel {
      position: fixed;
      left: max(0.48rem, env(safe-area-inset-left, 0px));
      right: max(0.48rem, env(safe-area-inset-right, 0px));
      bottom: calc(env(safe-area-inset-bottom, 0px) + 0.48rem);
      top: auto;
      width: auto;
      max-height: min(72dvh, 34rem);
      padding: 0.62rem;
      border-radius: 16px;
      animation-name: panelInMobile;
      transform-origin: bottom center;
      z-index: 36;
    }

    .panelHead {
      margin-bottom: 0.56rem;

      strong {
        font-size: 0.92rem;
      }

      span {
        display: none;
      }
    }

    .readAllBtn {
      min-height: 32px;
      padding: 0 0.72rem;
    }

    .itemBtn {
      padding: 0.64rem 0.64rem;
      gap: 0.56rem;
    }

    .copy p {
      font-size: 0.78rem;
      line-height: 1.42;
      margin-bottom: 0.14rem;
    }

    .headLine {
      align-items: flex-start;
      justify-content: flex-start;
      flex-direction: column;
      gap: 0.12rem;
      margin-bottom: 0.2rem;
    }

    .headLine strong {
      font-size: 0.76rem;
      max-width: 100%;
    }

    .headLine span {
      font-size: 0.66rem;
    }

    .list {
      gap: 0.42rem;
    }
  }

  @keyframes panelInMobile {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.992);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
`
