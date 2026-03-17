import styled from "@emotion/styled"
import { useRouter } from "next/router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  buildNotificationStreamUrl,
  getNotifications,
  getUnreadNotificationCount,
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
const POLLING_INTERVAL_MS = 20_000
const SSE_RECOVERY_PROBE_MS = 120_000

const toSiteKey = (url: URL) => {
  const host = url.hostname.toLowerCase()

  if (host === "localhost" || host === "127.0.0.1") {
    return `${url.protocol}//${host}`
  }

  const labels = host.split(".")
  if (labels.length <= 2) {
    return `${url.protocol}//${host}`
  }

  const suffix2 = labels.slice(-2).join(".")
  const commonMultiPartTlds = new Set([
    "co.kr",
    "or.kr",
    "go.kr",
    "co.uk",
    "org.uk",
    "ac.uk",
    "com.au",
    "co.jp",
  ])
  const registrable =
    commonMultiPartTlds.has(suffix2) && labels.length >= 3
      ? labels.slice(-3).join(".")
      : labels.slice(-2).join(".")

  return `${url.protocol}//${registrable}`
}

const NotificationBell: React.FC<Props> = ({ enabled }) => {
  const router = useRouter()
  const preferPolling = useMemo(() => {
    if (typeof window === "undefined") return false

    try {
      const streamUrl = new URL(buildNotificationStreamUrl(), window.location.origin)
      const currentUrl = new URL(window.location.href)
      const isCrossSite = toSiteKey(streamUrl) !== toSiteKey(currentUrl)
      return isCrossSite
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
  const lastEventIdRef = useRef<string | null>(null)
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

  const loadSnapshot = useCallback(async () => {
    if (!enabled) return

    try {
      const [nextItems, nextUnreadCount] = await Promise.all([getNotifications(), getUnreadNotificationCount()])
      setItems(nextItems)
      setUnreadCount(nextUnreadCount)
      setIsReady(true)
    } catch {
      setIsReady(false)
    }
  }, [enabled])

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
      lastEventIdRef.current = null
      setStreamMode(preferPolling ? "poll" : "sse")
      return
    }

    if (isDocumentVisible) {
      void loadSnapshot()
    }
  }, [enabled, isDocumentVisible, loadSnapshot, preferPolling])

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
        if (event.lastEventId) {
          lastEventIdRef.current = event.lastEventId
        }

        try {
          const payload = JSON.parse(event.data) as TMemberNotificationStreamPayload
          pushNotification(payload.notification)
          setUnreadCount(payload.unreadCount)
          setIsReady(true)
        } catch {
          // ignore malformed payloads
        }
      }

      const handleConnected = (event: MessageEvent<string>) => {
        if (event.lastEventId) {
          lastEventIdRef.current = event.lastEventId
        }

        const recovered = reconnectAttemptRef.current > 0
        reconnectAttemptRef.current = 0
        setIsReady(true)

        if (recovered) {
          void loadSnapshot()
        }
      }

      const handleHeartbeat = (event: MessageEvent<string>) => {
        if (event.lastEventId) {
          lastEventIdRef.current = event.lastEventId
        }

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
  }, [enabled, isDocumentVisible, loadSnapshot, pushNotification, streamMode])

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

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    return () => document.removeEventListener("mousedown", handlePointerDown)
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
    padding: 0 0.42rem;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    flex-shrink: 0;

    &:hover {
      color: ${({ theme }) => theme.colors.gray12};
      text-decoration: underline;
      text-underline-offset: 3px;
      text-decoration-thickness: 1px;
    }

    svg {
      width: 18px;
      height: 18px;
      display: block;
      transform: translateY(-0.3px);
    }
  }

  .badge {
    position: absolute;
    top: -6px;
    right: -5px;
    min-width: 19px;
    height: 19px;
    padding: 0 0.27rem;
    border-radius: 999px;
    background: ${({ theme }) => theme.colors.red10};
    color: white;
    font-size: 0.65rem;
    font-weight: 700;
    line-height: 19px;
    text-align: center;
    border: 2px solid ${({ theme }) => theme.colors.gray2};
  }

  .panel {
    position: absolute;
    top: calc(100% + 0.6rem);
    right: 0;
    width: min(24rem, calc(100vw - 1.4rem));
    border-radius: 24px;
    border: 1px solid ${({ theme }) => theme.colors.gray7};
    background:
      radial-gradient(circle at top right, rgba(59, 130, 246, 0.08), transparent 32%),
      ${({ theme }) => theme.colors.gray2};
    box-shadow: 0 22px 56px rgba(0, 0, 0, 0.34);
    padding: 1rem;
    z-index: 30;
  }

  .panelHead {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.8rem;
    margin-bottom: 0.85rem;

    strong {
      display: block;
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 1rem;
      margin-bottom: 0.2rem;
    }

    span {
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.78rem;
      line-height: 1.45;
    }
  }

  .readAllBtn {
    min-height: 34px;
    padding: 0 0.72rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray7};
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.74rem;
    font-weight: 700;

    :disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.55rem;
  }

  .itemBtn {
    width: 100%;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 0.7rem;
    align-items: center;
    padding: 0.78rem 0.82rem;
    border-radius: 18px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray1};
    text-align: left;

    &[data-read="false"] {
      border-color: ${({ theme }) => theme.colors.blue7};
      background: ${({ theme }) => theme.colors.blue3};
    }
  }

  .avatar {
    position: relative;
    width: 40px;
    height: 40px;
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
      font-size: 0.82rem;
      line-height: 1.5;
      margin-bottom: 0.22rem;
    }

    small {
      color: ${({ theme }) => theme.colors.gray10};
      display: block;
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
      font-size: 0.82rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    span {
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.72rem;
      flex-shrink: 0;
    }
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: ${({ theme }) => theme.colors.blue10};
    flex-shrink: 0;
  }

  .empty {
    display: grid;
    gap: 0.26rem;
    padding: 1.1rem 0.35rem 0.55rem;
    text-align: center;

    strong {
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 0.92rem;
    }

    span {
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.8rem;
      line-height: 1.5;
    }
  }

  @media (max-width: 720px) {
    .trigger {
      min-width: 34px;
      min-height: 34px;
      padding: 0 0.34rem;

      svg {
        width: 17px;
        height: 17px;
      }
    }

    .panel {
      right: -0.35rem;
      width: min(22rem, calc(100vw - 1rem));
      padding: 0.92rem;
    }
  }
`
