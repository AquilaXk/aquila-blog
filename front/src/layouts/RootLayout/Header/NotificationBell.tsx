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
import { TMemberNotification, TMemberNotificationStreamPayload } from "src/types"

type Props = {
  enabled: boolean
}

const NotificationBell: React.FC<Props> = ({ enabled }) => {
  const router = useRouter()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const reconnectAttemptRef = useRef(0)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<TMemberNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isReady, setIsReady] = useState(false)

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
    if (!enabled) {
      setItems([])
      setUnreadCount(0)
      setOpen(false)
      setIsReady(false)
      return
    }

    void loadSnapshot()
  }, [enabled, loadSnapshot])

  useEffect(() => {
    if (!enabled) return

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

      const eventSource = new EventSource(buildNotificationStreamUrl(), { withCredentials: true })
      eventSourceRef.current = eventSource

      const handleNotification = (event: MessageEvent<string>) => {
        try {
          const payload = JSON.parse(event.data) as TMemberNotificationStreamPayload
          pushNotification(payload.notification)
          setUnreadCount(payload.unreadCount)
          setIsReady(true)
        } catch {
          // ignore malformed payloads
        }
      }

      const handleConnected = () => {
        const recovered = reconnectAttemptRef.current > 0
        reconnectAttemptRef.current = 0
        setIsReady(true)

        if (recovered) {
          void loadSnapshot()
        }
      }

      eventSource.addEventListener("connected", handleConnected)
      eventSource.addEventListener("notification", handleNotification)
      eventSource.onerror = () => {
        eventSource.removeEventListener("connected", handleConnected)
        eventSource.removeEventListener("notification", handleNotification)
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
  }, [enabled, loadSnapshot, pushNotification])

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
    await router.push(`${toCanonicalPostPath(notification.postId)}#comment-${notification.commentId}`)
  }

  if (!enabled) {
    return null
  }

  return (
    <StyledWrapper ref={rootRef}>
      <button
        type="button"
        className="trigger"
        aria-label="알림"
        aria-expanded={open}
        onClick={() => void handleOpenChange()}
      >
        <AppIcon name="bell" />
        {hasUnread && <span className="badge">{unreadBadge}</span>}
      </button>
      {open && (
        <div className="panel" role="dialog" aria-label="알림 목록">
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
    width: 31px;
    height: 31px;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray7};
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
    flex-shrink: 0;

    svg {
      width: 17px;
      height: 17px;
      display: block;
      transform: translateY(-0.5px);
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
    min-height: 32px;
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
      width: 29px;
      height: 29px;

      svg {
        width: 16px;
        height: 16px;
      }
    }

    .panel {
      right: -0.35rem;
      width: min(22rem, calc(100vw - 1rem));
      padding: 0.92rem;
    }
  }
`
