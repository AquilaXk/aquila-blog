import { useRouter } from "next/router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ApiError } from "src/apis/backend/client"
import {
  buildNotificationStreamUrl,
  getNotificationSnapshot,
  markAllNotificationsRead,
  markNotificationRead,
} from "src/apis/backend/notifications"
import { createNotificationStreamRecoveryState } from "src/layouts/RootLayout/Header/notificationStreamRecovery"
import { acquireBodyScrollLock } from "src/libs/utils/bodyScrollLock"
import { toCanonicalPostPath } from "src/libs/utils/postPath"
import { pushRoute } from "src/libs/router"
import { TMemberNotification } from "src/types"
import { useNotificationBackgroundActivation } from "./useNotificationBackgroundActivation"
import { useNotificationBellTransport } from "./useNotificationBellTransport"
import {
  AVATAR_PRELOAD_CACHE_MAX,
  AVATAR_PRELOAD_LIMIT,
  EventSourceLifecycleState,
  NOTIFICATION_TRANSPORT_MODE,
  SnapshotLoadStatus,
  clearStoredSnapshot,
  isSameNotificationList,
  isSameSiteOrigin,
  loadStoredLastEventId,
  loadStoredSnapshot,
  persistLastEventId,
  persistSnapshot,
  resolveNotificationAvatarSrc,
  sanitizeNotificationEventId,
  toLatestNotificationEventId,
} from "./NotificationBellModel"

export const useNotificationBellState = (enabled: boolean) => {
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

  const resetSnapshotFailureObservation = useCallback(() => {
    lastSnapshotErrorRef.current = null
    lastLoggedSnapshotFailureStreakRef.current = 0
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

  useNotificationBackgroundActivation({
    enabled,
    isDocumentVisible,
    isRealtimeActive,
    notificationAccessState,
    open,
    pathname: router.pathname,
    loadSnapshot,
    setIsRealtimeActive,
  })

  useEffect(() => {
    if (!enabled || !isReady) return
    persistSnapshot({ items, unreadCount })
  }, [enabled, isReady, items, unreadCount])

  useNotificationBellTransport({
    enabled,
    isRealtimeActive,
    streamMode,
    notificationAccessState,
    isDocumentVisible,
    preferPolling,
    isDocumentVisibleRef,
    eventSourceRef,
    eventSourceCleanupRef,
    attachEventSourceRef,
    clearReconnectTimerRef,
    hiddenCloseTimerRef,
    intentionalCloseRef,
    streamLifecycleRef,
    reconnectTimerRef,
    reconnectAttemptRef,
    recoveryStateRef,
    lastEventIdRef,
    pollingFailureStreakRef,
    lastSnapshotErrorRef,
    lastLoggedSnapshotFailureStreakRef,
    unreadCountRef,
    closeEventSource,
    clearHiddenCloseTimer,
    loadSnapshot,
    pushNotification,
    setLastNotificationEventId,
    setUnreadCount,
    setIsReady,
    setIsSnapshotFallback,
    setIsRealtimeActive,
    setStreamMode,
  })

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


  return {
    rootRef,
    triggerRef,
    panelRef,
    open,
    setOpen,
    isMobileViewport,
    items,
    unreadCount,
    isSnapshotFallback,
    hasUnread,
    unreadBadge,
    handleOpenChange,
    handleMarkAllRead,
    handleMoveToNotification,
  }
}

export type NotificationBellState = ReturnType<typeof useNotificationBellState>
