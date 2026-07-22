import type { SimpleIcon } from "simple-icons"
import AppIcon from "src/components/icons/AppIcon"
import {
  DASHBOARD_COLLECTION_FAILED_LABEL,
  DASHBOARD_REFRESH_LABEL,
  DASHBOARD_REFRESHING_LABEL,
} from "src/routes/Admin/AdminDashboardWorkspaceModel"
import {
  FreshnessLabel,
  RefreshButton,
  StatusChip,
} from "src/routes/Admin/AdminDashboardWorkspace.styles"

export const renderMonitoringBrand = (
  icon: SimpleIcon | undefined,
  fallbackIcon: "service" | undefined,
  title: string
) => {
  if (icon) {
    return (
      <svg viewBox="0 0 24 24" focusable="false" aria-label={title} style={{ width: "1.35rem", height: "1.35rem", color: `#${icon.hex}` }}>
        <path d={icon.path} fill="currentColor" />
      </svg>
    )
  }

  return <AppIcon name={fallbackIcon || "service"} aria-hidden="true" />
}

type DashboardRefreshControlsProps = {
  freshnessLabel: string | null
  collectionFailed: boolean
  isRefreshing: boolean
  onRefresh: () => void
}

export const DashboardRefreshControls = ({
  freshnessLabel,
  collectionFailed,
  isRefreshing,
  onRefresh,
}: DashboardRefreshControlsProps) => (
  <>
    {freshnessLabel ? <FreshnessLabel>{freshnessLabel}</FreshnessLabel> : null}
    {collectionFailed ? (
      <StatusChip data-tone="danger" role="status" aria-label={DASHBOARD_COLLECTION_FAILED_LABEL}>
        {DASHBOARD_COLLECTION_FAILED_LABEL}
      </StatusChip>
    ) : null}
    <RefreshButton
      type="button"
      aria-label={isRefreshing ? DASHBOARD_REFRESHING_LABEL : DASHBOARD_REFRESH_LABEL}
      aria-busy={isRefreshing ? "true" : "false"}
      disabled={isRefreshing}
      onClick={onRefresh}
    >
      {isRefreshing ? DASHBOARD_REFRESHING_LABEL : DASHBOARD_REFRESH_LABEL}
    </RefreshButton>
  </>
)
