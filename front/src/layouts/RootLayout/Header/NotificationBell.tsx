import AppIcon from "src/components/icons/AppIcon"
import { NotificationBellPanel } from "./NotificationBellPanel"
import { StyledWrapper } from "./NotificationBell.styles"
import { useNotificationBellState } from "./useNotificationBellState"

type Props = {
  enabled: boolean
}

const NotificationBell: React.FC<Props> = ({ enabled }) => {
  const {
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
  } = useNotificationBellState(enabled)

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
        <NotificationBellPanel
          panelRef={panelRef}
          isMobileViewport={isMobileViewport}
          isSnapshotFallback={isSnapshotFallback}
          hasUnread={hasUnread}
          items={items}
          onClose={() => setOpen(false)}
          onMarkAllRead={() => void handleMarkAllRead()}
          onMoveToNotification={(item) => void handleMoveToNotification(item)}
        />
      )}
    </StyledWrapper>
  )
}

export default NotificationBell
