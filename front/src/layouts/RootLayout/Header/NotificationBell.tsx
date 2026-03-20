import styled from "@emotion/styled"
import { useRouter } from "next/router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  buildNotificationStreamUrl,
  getNotificationSnapshot,
  markAllNotificationsRead,
  markNotificationRead,
} from "src/apis/backend/notifications"
import ProfileImage from "src/components/ProfileImage"
import AppIcon from "src/components/icons/AppIcon"
import { formatShortDateTime } from "src/libs/utils"
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
const NOTIFICATION_EVENT_ID_REGEX = /^notification-\d+$/

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

const NotificationBell: React.FC<Props> = ({ enabled }) => {
  const router = useRouter()
  const preferPolling = useMemo(() => {
    if (typeof window === "undefined") return false

    try {
      const streamUrl = new URL(buildNotificationStreamUrl(), window.location.origin)
      const currentUrl = new URL(window.location.href)
      // Cloudflare edge + cross-origin(EventSource) 조합에서는 QUIC/H3 콘솔 오류가 반복될 수 있어
      // 오리진이 다르면 SSE 대신 폴링을 기본값으로 사용한다.
      return streamUrl.origin !== currentUrl.origin
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
  const [items, setItems] = useState<TMemberNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isReady, setIsReady] = useState(false)
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
    } catch {
      setIsReady(false)
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
    if (!enabled) {
      setItems([])
      setUnreadCount(0)
      setOpen(false)
      setIsReady(false)
      reconnectAttemptRef.current = 0
      setLastNotificationEventId(null)
      setStreamMode(preferPolling ? "poll" : "sse")
      return
    }

    if (isDocumentVisible) {
      void loadSnapshot()
    }
  }, [enabled, isDocumentVisible, loadSnapshot, preferPolling, setLastNotificationEventId])

  useEffect(() => {
    if (!enabled || streamMode !== "sse" || !isDocumentVisible) return

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
        } catch {
          // ignore malformed payloads
        }
      }

      const handleConnected = (_event: MessageEvent<string>) => {
        const recovered = reconnectAttemptRef.current > 0
        reconnectAttemptRef.current = 0
        setIsReady(true)

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
  }, [enabled, isDocumentVisible, loadSnapshot, pushNotification, setLastNotificationEventId, streamMode])

  useEffect(() => {
    if (!enabled || streamMode !== "poll" || !isDocumentVisible) return

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
  }, [enabled, isDocumentVisible, loadSnapshot, streamMode])

  useEffect(() => {
    if (!enabled) return
    if (!isDocumentVisible) return
    if (preferPolling) return
    if (streamMode !== "poll") return

    const timer = window.setTimeout(() => {
      reconnectAttemptRef.current = 0
      setStreamMode("sse")
    }, SSE_RECOVERY_PROBE_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [enabled, isDocumentVisible, preferPolling, streamMode])

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
      setUnreadCount(0)
      setItems((prev) => prev.map((item) => ({ ...item, isRead: true })))
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
        setUnreadCount((prev) => Math.max(0, prev - 1))
        setItems((prev) =>
          prev.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item))
        )
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
        <div ref={panelRef} className="panel" role="dialog" aria-modal="false" aria-label="알림 목록" tabIndex={-1}>
          <div className="panelHead">
            <div>
              <strong>알림</strong>
              <span>답글과 댓글 알림을 확인할 수 있습니다.</span>
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
              <strong>새 알림이 없습니다.</strong>
              <span>누군가 댓글이나 답글을 남기면 여기에 표시됩니다.</span>
            </div>
          )}
        </div>
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
    min-width: 36px;
    min-height: 36px;
    width: 36px;
    height: 36px;
    padding: 0;
    border-radius: 999px;
    border: 1px solid transparent;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    flex-shrink: 0;
    transition: border-color 0.16s ease, background-color 0.16s ease, color 0.16s ease;

    &:hover,
    &[data-open="true"] {
      color: ${({ theme }) => theme.colors.gray12};
      border-color: transparent;
      background: transparent;
    }

    &:focus-visible {
      outline: none;
      border-color: ${({ theme }) => theme.colors.blue8};
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

    strong {
      display: block;
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 0.96rem;
      margin-bottom: 0.14rem;
    }

    span {
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.75rem;
      line-height: 1.4;
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
    gap: 0.24rem;
    padding: 1rem 0.28rem 0.45rem;
    text-align: center;

    strong {
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 0.88rem;
    }

    span {
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.76rem;
      line-height: 1.5;
    }
  }

  @media (max-width: 720px) {
    .trigger {
      min-width: 36px;
      min-height: 36px;
      width: 36px;
      height: 36px;

      svg {
        width: 18px;
        height: 18px;
      }
    }

    .panel {
      position: fixed;
      top: calc(var(--app-header-height, 56px) + 0.56rem + env(safe-area-inset-top, 0px));
      left: max(0.5rem, env(safe-area-inset-left, 0px));
      right: max(0.5rem, env(safe-area-inset-right, 0px));
      width: auto;
      max-height: calc(
        100dvh - var(--app-header-height, 56px) - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) -
          1.02rem
      );
      padding: 0.62rem;
      border-radius: 14px;
      animation-name: panelInMobile;
      transform-origin: top center;
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
      transform: translateY(-8px) scale(0.99);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
`
