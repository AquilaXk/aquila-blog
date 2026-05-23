import { AdminHubSurfaceSections } from "./AdminHubSurface.sections"

export type AdminHubPrimaryAction = {
  href: string
  title: string
  cta: string
  secondaryHref: string
  secondaryLabel: string
}

export type AdminHubSecondaryLink = {
  href: string
  title: string
  cta: string
}

export type AdminHubSupportRailItem = {
  label: string
  value?: string
  href?: string
  cta?: string
  tone?: "neutral" | "good" | "warn"
}

export type AdminHubSupportRailGroup = {
  title: string
  items: AdminHubSupportRailItem[]
}

export type AdminHubNextAction = {
  href: string
  title: string
  tone?: "neutral" | "good" | "warn"
}

export type AdminHubRecentWorkItem = {
  label: string
  value: string
  tone?: "neutral" | "good" | "warn"
}

type Props = {
  displayName: string
  displayNameInitial: string
  profileSrc?: string
  profileRole?: string
  profileBio?: string
  recentWorkSummary: string
  recentWorkItems: AdminHubRecentWorkItem[]
  supportRailGroups?: AdminHubSupportRailGroup[]
  summaryItems?: AdminHubSupportRailItem[]
  priorityActions: AdminHubNextAction[]
  handoffActions: AdminHubNextAction[]
  nextActions?: AdminHubNextAction[]
  primaryAction: AdminHubPrimaryAction
  secondaryLinks?: AdminHubSecondaryLink[]
}

const AdminHubSurface = ({
  displayName,
  displayNameInitial,
  profileSrc = "",
  profileRole,
  profileBio,
  recentWorkSummary,
  recentWorkItems,
  supportRailGroups,
  summaryItems,
  priorityActions,
  handoffActions,
  nextActions,
  primaryAction,
}: Props) => {
  const resolvedPriorityActions = priorityActions || nextActions || []
  const resolvedHandoffActions = handoffActions || nextActions || []
  const resolvedSupportRailGroups =
    supportRailGroups ||
    (summaryItems?.length
      ? [
          {
            title: "허브 지원 정보",
            items: summaryItems,
          },
        ]
      : [])

  return (
    <AdminHubSurfaceSections
      displayName={displayName}
      displayNameInitial={displayNameInitial}
      profileBio={profileBio}
      profileRole={profileRole}
      profileSrc={profileSrc}
      recentWorkItems={recentWorkItems}
      recentWorkSummary={recentWorkSummary}
      resolvedHandoffActions={resolvedHandoffActions}
      resolvedPriorityActions={resolvedPriorityActions}
      resolvedSupportRailGroups={resolvedSupportRailGroups}
      primaryAction={primaryAction}
    />
  )
}

export default AdminHubSurface
