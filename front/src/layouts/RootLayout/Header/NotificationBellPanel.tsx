import type { Ref } from "react"
import ProfileImage from "src/components/ProfileImage"
import { formatShortDateTime } from "src/libs/utils"
import type { TMemberNotification } from "src/types"
import { resolveNotificationAvatarSrc } from "./NotificationBellModel"

type NotificationBellPanelProps = {
  panelRef: Ref<HTMLDivElement>
  isMobileViewport: boolean
  isSnapshotFallback: boolean
  hasUnread: boolean
  items: TMemberNotification[]
  onClose: () => void
  onMarkAllRead: () => void
  onMoveToNotification: (notification: TMemberNotification) => void
}

export const NotificationBellPanel = ({
  panelRef,
  isMobileViewport,
  isSnapshotFallback,
  hasUnread,
  items,
  onClose,
  onMarkAllRead,
  onMoveToNotification,
}: NotificationBellPanelProps) => (
  <>
    <button
      type="button"
      className="mobileBackdrop"
      aria-label="알림 닫기"
      onClick={onClose}
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
        <button type="button" className="readAllBtn" onClick={onMarkAllRead} disabled={!hasUnread}>
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
                onClick={() => onMoveToNotification(item)}
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
)
