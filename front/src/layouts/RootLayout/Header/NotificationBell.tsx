import styled from "@emotion/styled"
import { useRouter } from "next/router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ApiError } from "src/apis/backend/client"
import {
  buildNotificationStreamUrl,
  getNotificationSnapshot,
  markAllNotificationsRead,
  markNotificationRead,
} from "src/apis/backend/notifications"
import ProfileImage from "src/components/ProfileImage"
import AppIcon from "src/components/icons/AppIcon"
import { formatShortDateTime } from "src/libs/utils"
import { acquireBodyScrollLock } from "src/libs/utils/bodyScrollLock"
import { toCanonicalPostPath } from "src/libs/utils/postPath"
import { pushRoute } from "src/libs/router"
import { TMemberNotification, TMemberNotificationStreamPayload } from "src/types"

type Props = {
  enabled: boolean
}

const STREAM_MAX_RECONNECT_ATTEMPTS = 4
const POLLING_INTERVAL_MS = 30_000
const SSE_RECOVERY_PROBE_MS = 120_000
const LAST_EVENT_ID_STORAGE_KEY = "member.notification.lastEventId.v1"
const SNAPSHOT_STORAGE_KEY = "member.notification.snapshot.v1"
const NOTIFICATION_EVENT_ID_REGEX = /^notification-\d+$/

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

const NotificationBell: React.FC<Props> = ({ enabled }) => {
  const router = useRouter()
  const preferPolling = useMemo(() => {
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
  const reconnectTimerRef = useRef<number | null>(null)
  const reconnectAttemptRef = useRef(0)
  const initialLastEventId = useMemo(() => loadStoredLastEventId(), [])
  const lastEventIdRef = useRef<string | null>(initialLastEventId)
  const [streamMode, setStreamMode] = useState<"sse" | "poll">(preferPolling ? "poll" : "sse")
  const [open, setOpen] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const [items, setItems] = useState<TMemberNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isReady, setIsReady] = useState(false)
  const [isSnapshotFallback, setIsSnapshotFallback] = useState(false)
  const [notificationAccessState, setNotificationAccessState] = useState<"pending" | "ready" | "blocked">(
    "pending"
  )
  const [isDocumentVisible, setIsDocumentVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState !== "hidden"
  )

  const pushNotification = useCallback((incoming: TMemberNotification) => {
    setItems((prev) => {
      const deduped = prev.filter((item) => item.id !== incoming.id)
      return [incoming, ...deduped].slice(0, 20)
    })
  }, [])

  const setLastNotificationEventId = useCallback((eventId: string | null) => {
    const sanitized = sanitizeNotificationEventId(eventId)
    lastEventIdRef.current = sanitized
    persistLastEventId(sanitized)
  }, [])

  const loadSnapshot = useCallback(async () => {
    if (!enabled) return

    try {
      const snapshot = await getNotificationSnapshot()
      setItems(snapshot.items)
      setUnreadCount(snapshot.unreadCount)
      setLastNotificationEventId(toLatestNotificationEventId(snapshot.items))
      setIsReady(true)
      setIsSnapshotFallback(false)
      setNotificationAccessState("ready")
      persistSnapshot({
        items: snapshot.items,
        unreadCount: snapshot.unreadCount,
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setItems([])
        setUnreadCount(0)
        setIsReady(false)
        setIsSnapshotFallback(false)
        setNotificationAccessState("blocked")
        setOpen(false)
        clearStoredSnapshot()
        setLastNotificationEventId(null)
        return
      }

      const stored = loadStoredSnapshot()
      if (stored) {
        setItems(stored.items)
        setUnreadCount(stored.unreadCount)
        setLastNotificationEventId(toLatestNotificationEventId(stored.items))
        setIsReady(true)
        setIsSnapshotFallback(true)
        setNotificationAccessState("ready")
        return
      }
      setIsReady(false)
      setIsSnapshotFallback(false)
      setNotificationAccessState("pending")
    }
  }, [enabled, setLastNotificationEventId])

  useEffect(() => {
    if (typeof document === "undefined") return

    const handleVisibilityChange = () => {
      setIsDocumentVisible(document.visibilityState !== "hidden")
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [])

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
      setItems([])
      setUnreadCount(0)
      setOpen(false)
      setIsReady(false)
      setIsSnapshotFallback(false)
      setNotificationAccessState("pending")
      reconnectAttemptRef.current = 0
      setLastNotificationEventId(null)
      clearStoredSnapshot()
      setStreamMode(preferPolling ? "poll" : "sse")
      return
    }

    if (isDocumentVisible) {
      void loadSnapshot()
    }
  }, [enabled, isDocumentVisible, loadSnapshot, preferPolling, setLastNotificationEventId])

  useEffect(() => {
    if (!enabled || !isReady) return
    persistSnapshot({ items, unreadCount })
  }, [enabled, isReady, items, unreadCount])

  useEffect(() => {
    if (!enabled || streamMode !== "sse" || !isDocumentVisible || notificationAccessState !== "ready") return

    let disposed = false

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }

    const scheduleReconnect = () => {
      if (disposed || reconnectTimerRef.current !== null) return

      setIsReady(false)
      const nextAttempt = reconnectAttemptRef.current + 1
      reconnectAttemptRef.current = nextAttempt

      if (nextAttempt > STREAM_MAX_RECONNECT_ATTEMPTS) {
        eventSourceRef.current?.close()
        eventSourceRef.current = null
        setStreamMode("poll")
        return
      }

      const retryDelay = Math.min(1500 * nextAttempt, 10000)

      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null
        attachEventSource()
      }, retryDelay)
    }

    const attachEventSource = () => {
      if (disposed) return

      clearReconnectTimer()
      eventSourceRef.current?.close()
      const streamUrl = new URL(buildNotificationStreamUrl(), window.location.origin)
      if (lastEventIdRef.current) {
        // We recreate EventSource manually (for backoff/fallback control), so we pass the last id explicitly.
        streamUrl.searchParams.set("lastEventId", lastEventIdRef.current)
      }

      const eventSource = new EventSource(streamUrl.toString(), { withCredentials: true })
      eventSourceRef.current = eventSource

      const handleNotification = (event: MessageEvent<string>) => {
        try {
          const payload = JSON.parse(event.data) as TMemberNotificationStreamPayload
          setLastNotificationEventId(
            sanitizeNotificationEventId(event.lastEventId) || `notification-${payload.notification.id}`
          )
          pushNotification(payload.notification)
          setUnreadCount(payload.unreadCount)
          setIsReady(true)
          setIsSnapshotFallback(false)
        } catch {
          // ignore malformed payloads
        }
      }

      const handleConnected = (_event: MessageEvent<string>) => {
        const recovered = reconnectAttemptRef.current > 0
        reconnectAttemptRef.current = 0
        setIsReady(true)
        setIsSnapshotFallback(false)

        if (recovered) {
          void loadSnapshot()
        }
      }

      const handleHeartbeat = (_event: MessageEvent<string>) => {
        setIsReady(true)
      }

      eventSource.addEventListener("connected", handleConnected)
      eventSource.addEventListener("notification", handleNotification)
      eventSource.addEventListener("heartbeat", handleHeartbeat)
      eventSource.onerror = () => {
        eventSource.removeEventListener("connected", handleConnected)
        eventSource.removeEventListener("notification", handleNotification)
        eventSource.removeEventListener("heartbeat", handleHeartbeat)
        eventSource.close()
        scheduleReconnect()
      }
    }

    attachEventSource()

    return () => {
      disposed = true
      clearReconnectTimer()
      eventSourceRef.current?.close()
      eventSourceRef.current = null
    }
  }, [
    enabled,
    isDocumentVisible,
    loadSnapshot,
    notificationAccessState,
    pushNotification,
    setLastNotificationEventId,
    streamMode,
  ])

  useEffect(() => {
    if (!enabled || streamMode !== "poll" || !isDocumentVisible || notificationAccessState !== "ready") return

    let disposed = false
    let timer: number | null = null

    const run = async () => {
      if (disposed) return
      await loadSnapshot()
      if (disposed) return

      timer = window.setTimeout(() => {
        void run()
      }, POLLING_INTERVAL_MS)
    }

    void run()

    return () => {
      disposed = true
      if (timer !== null) {
        window.clearTimeout(timer)
      }
    }
  }, [enabled, isDocumentVisible, loadSnapshot, notificationAccessState, streamMode])

  useEffect(() => {
    if (!enabled) return
    if (!isDocumentVisible) return
    if (preferPolling) return
    if (streamMode !== "poll") return
    if (notificationAccessState !== "ready") return

    const timer = window.setTimeout(() => {
      reconnectAttemptRef.current = 0
      setStreamMode("sse")
    }, SSE_RECOVERY_PROBE_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [enabled, isDocumentVisible, notificationAccessState, preferPolling, streamMode])

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
      setUnreadCount(0)
      setItems(nextItems)
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
        setUnreadCount(nextUnreadCount)
        setItems(nextItems)
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
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="itemBtn"
                      data-read={item.isRead}
                      onClick={() => void handleMoveToNotification(item)}
                    >
                      <div className="avatar">
                        <ProfileImage
                          src={item.actorProfileImageUrl}
                          alt={`${item.actorName} avatar`}
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
