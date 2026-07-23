import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect } from "react"
import { ApiError, ApiTimeoutError } from "src/apis/backend/client"
import { buildNotificationStreamUrl } from "src/apis/backend/notifications"
import type { TMemberNotification, TMemberNotificationStreamPayload } from "src/types"
import {
  canProbeNotificationStreamRecovery,
  markNotificationPollingFallbackEntered,
  type NotificationStreamRecoveryState,
  recordNotificationStreamFailure,
  resetNotificationStreamFailures,
  shouldSwitchNotificationStreamToPolling,
} from "./notificationStreamRecovery"
import {
  EventSourceLifecycleState,
  getNavigatorConnection,
  getNextPollingDelayMs,
  HIDDEN_GRACE_CLOSE_MS,
  isNavigatorOnline,
  POLLING_FAILURE_COOLDOWN_MS,
  POLLING_FAILURE_COOLDOWN_THRESHOLD,
  POLLING_INTERVAL_MS,
  POLLING_MAX_BACKOFF_MULTIPLIER,
  POLLING_MIN_INTERVAL_MS,
  POLLING_SAVE_DATA_MULTIPLIER,
  POLLING_SLOW_NETWORK_MULTIPLIER,
  sanitizeNotificationEventId,
  SNAPSHOT_FAILURE_LOG_THRESHOLD,
  SnapshotLoadStatus,
  STREAM_MAX_RECONNECT_ATTEMPTS,
} from "./NotificationBellModel"

type NotificationStreamMode = "sse" | "poll"
type NotificationAccessState = "pending" | "ready" | "blocked"

type UseNotificationBellTransportParams = {
  enabled: boolean
  isRealtimeActive: boolean
  streamMode: NotificationStreamMode
  notificationAccessState: NotificationAccessState
  isDocumentVisible: boolean
  preferPolling: boolean
  isDocumentVisibleRef: MutableRefObject<boolean>
  eventSourceRef: MutableRefObject<EventSource | null>
  eventSourceCleanupRef: MutableRefObject<(() => void) | null>
  attachEventSourceRef: MutableRefObject<(() => void) | null>
  clearReconnectTimerRef: MutableRefObject<() => void>
  hiddenCloseTimerRef: MutableRefObject<number | null>
  intentionalCloseRef: MutableRefObject<boolean>
  streamLifecycleRef: MutableRefObject<EventSourceLifecycleState>
  reconnectTimerRef: MutableRefObject<number | null>
  reconnectAttemptRef: MutableRefObject<number>
  recoveryStateRef: MutableRefObject<NotificationStreamRecoveryState>
  lastEventIdRef: MutableRefObject<string | null>
  pollingFailureStreakRef: MutableRefObject<number>
  lastSnapshotErrorRef: MutableRefObject<unknown>
  lastLoggedSnapshotFailureStreakRef: MutableRefObject<number>
  unreadCountRef: MutableRefObject<number>
  closeEventSource: (intentional: boolean) => void
  clearHiddenCloseTimer: () => void
  loadSnapshot: () => Promise<SnapshotLoadStatus>
  pushNotification: (incoming: TMemberNotification) => void
  setLastNotificationEventId: (eventId: string | null) => void
  setUnreadCount: Dispatch<SetStateAction<number>>
  setIsReady: Dispatch<SetStateAction<boolean>>
  setIsSnapshotFallback: Dispatch<SetStateAction<boolean>>
  setIsRealtimeActive: Dispatch<SetStateAction<boolean>>
  setStreamMode: Dispatch<SetStateAction<NotificationStreamMode>>
}

const describeSnapshotError = (error: unknown) => {
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
}

const resolvePollingBaseIntervalMs = (failureStreak: number) => {
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
}

export const useNotificationBellTransport = ({
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
}: UseNotificationBellTransportParams) => {
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
    attachEventSourceRef,
    clearReconnectTimerRef,
    closeEventSource,
    enabled,
    eventSourceCleanupRef,
    eventSourceRef,
    intentionalCloseRef,
    isDocumentVisibleRef,
    isRealtimeActive,
    lastEventIdRef,
    loadSnapshot,
    notificationAccessState,
    pushNotification,
    reconnectAttemptRef,
    reconnectTimerRef,
    recoveryStateRef,
    setIsReady,
    setIsSnapshotFallback,
    setLastNotificationEventId,
    setStreamMode,
    setUnreadCount,
    streamLifecycleRef,
    streamMode,
    unreadCountRef,
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
    attachEventSourceRef,
    clearHiddenCloseTimer,
    clearReconnectTimerRef,
    closeEventSource,
    enabled,
    hiddenCloseTimerRef,
    isDocumentVisible,
    isRealtimeActive,
    notificationAccessState,
    reconnectAttemptRef,
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
  }, [clearHiddenCloseTimer, clearReconnectTimerRef, closeEventSource])

  useEffect(() => {
    if (!enabled || !isRealtimeActive || streamMode !== "poll" || !isDocumentVisible || notificationAccessState !== "ready") return

    let disposed = false
    let timer: number | null = null

    const reportSnapshotFailureIfNeeded = (nextFailureStreak: number) => {
      if (nextFailureStreak < SNAPSHOT_FAILURE_LOG_THRESHOLD) return
      if (lastLoggedSnapshotFailureStreakRef.current >= nextFailureStreak) return

      lastLoggedSnapshotFailureStreakRef.current = nextFailureStreak
      console.warn("[notifications] snapshot polling is recovering from repeated failures", {
        streak: nextFailureStreak,
        reason: describeSnapshotError(lastSnapshotErrorRef.current),
        mode: streamMode,
        fallback: lastSnapshotErrorRef.current ? "none-or-session" : "cache",
      })
    }

    const run = async () => {
      if (disposed) return
      let nextFailureStreak: number

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
    lastLoggedSnapshotFailureStreakRef,
    lastSnapshotErrorRef,
    loadSnapshot,
    notificationAccessState,
    pollingFailureStreakRef,
    setIsRealtimeActive,
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
  }, [enabled, isRealtimeActive, loadSnapshot, notificationAccessState, pollingFailureStreakRef, streamMode])

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
  }, [
    enabled,
    isDocumentVisible,
    isRealtimeActive,
    notificationAccessState,
    pollingFailureStreakRef,
    preferPolling,
    reconnectAttemptRef,
    recoveryStateRef,
    setStreamMode,
    streamMode,
  ])
}
