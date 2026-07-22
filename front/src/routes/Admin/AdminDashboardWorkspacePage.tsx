import { useQuery } from "@tanstack/react-query"
import { NextPage } from "next"
import { useCallback, useState } from "react"
import { apiFetch } from "src/apis/backend/client"
import type { AuthMember } from "src/hooks/useAuthSession"
import useAuthSession from "src/hooks/useAuthSession"
import {
  DASHBOARD_BACKEND_CHECK_LABEL,
  DASHBOARD_COLLECTION_FAILED_LABEL,
  DASHBOARD_DATA_MISSING_LABEL,
  EMPTY_INITIAL_SNAPSHOT,
  formatAge,
  formatDashboardFreshnessLabel,
  formatInstant,
  getMailStatusLabel,
  getMailStatusTone,
  getSystemHealthStatusLabel,
  getSystemHealthTone,
  getTaskQueueTone,
  hasDashboardSnapshot,
  isDashboardQueryCollectionFailed,
  resolveDashboardCollectionLabel,
  resolveDashboardDataUpdatedAt,
  type AdminDashboardInitialSnapshot,
  type DashboardChartBar,
  type DashboardKpiCard,
  type DashboardLogRow,
  type DashboardPriorityRow,
  type DashboardSnapshotPayload,
  type SystemHealthPayload,
} from "src/routes/Admin/AdminDashboardWorkspaceModel"
import { AdminDashboardWorkspaceView } from "src/routes/Admin/AdminDashboardWorkspaceView"

type AdminDashboardPageProps = {
  initialMember: AuthMember
  initialSnapshot: AdminDashboardInitialSnapshot
}

const AdminDashboardPage: NextPage<AdminDashboardPageProps> = ({
  initialMember,
  initialSnapshot = EMPTY_INITIAL_SNAPSHOT,
}) => {
  const { me, authStatus } = useAuthSession()
  const sessionMember = authStatus === "loading" || authStatus === "unavailable" ? initialMember : me || initialMember
  const systemHealthQuery = useQuery({
    queryKey: ["admin", "dashboard", "system-health"],
    queryFn: (): Promise<SystemHealthPayload> => apiFetch<SystemHealthPayload>("/system/api/v1/adm/health"),
    enabled: Boolean(sessionMember?.isAdmin),
    initialData: initialSnapshot.systemHealth ?? undefined,
    initialDataUpdatedAt:
      initialSnapshot.systemHealth && initialSnapshot.systemHealthFetchedAt
        ? new Date(initialSnapshot.systemHealthFetchedAt).getTime()
        : undefined,
    staleTime: 30_000,
    gcTime: 120_000,
    retry: 1,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnMount: false,
  })
  const dashboardSnapshotQuery = useQuery({
    queryKey: ["admin", "dashboard", "snapshot"],
    queryFn: (): Promise<DashboardSnapshotPayload> => apiFetch<DashboardSnapshotPayload>("/system/api/v1/adm/dashboard-snapshot"),
    enabled: Boolean(sessionMember?.isAdmin),
    initialData: initialSnapshot.dashboard ?? undefined,
    initialDataUpdatedAt:
      initialSnapshot.dashboard && initialSnapshot.dashboardFetchedAt
        ? new Date(initialSnapshot.dashboardFetchedAt).getTime()
        : undefined,
    staleTime: 30_000,
    gcTime: 120_000,
    retry: 1,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnMount: false,
  })

  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  const handleRefresh = useCallback(() => {
    setIsManualRefreshing(true)
    void Promise.all([systemHealthQuery.refetch(), dashboardSnapshotQuery.refetch()]).finally(() => {
      setIsManualRefreshing(false)
    })
  }, [dashboardSnapshotQuery, systemHealthQuery])

  if (!sessionMember) return null

  const healthCollectionFailed = isDashboardQueryCollectionFailed(systemHealthQuery)
  const snapshotCollectionFailed = isDashboardQueryCollectionFailed(dashboardSnapshotQuery)
  const collectionFailed = healthCollectionFailed || snapshotCollectionFailed
  const isRefreshing = isManualRefreshing
  const freshnessLabel = formatDashboardFreshnessLabel(
    resolveDashboardDataUpdatedAt(systemHealthQuery.dataUpdatedAt, dashboardSnapshotQuery.dataUpdatedAt)
  )
  const rawSystemHealthStatus = systemHealthQuery.data?.status ?? null
  const dashboardSnapshot = dashboardSnapshotQuery.data ?? initialSnapshot.dashboard
  const hasSnapshot = hasDashboardSnapshot(dashboardSnapshot)
  const snapshotCollectionLabel = resolveDashboardCollectionLabel({
    isError: dashboardSnapshotQuery.isError,
    isRefetchError: dashboardSnapshotQuery.isRefetchError,
    hasData: hasSnapshot,
  })
  const healthCollectionLabel = resolveDashboardCollectionLabel({
    isError: systemHealthQuery.isError,
    isRefetchError: systemHealthQuery.isRefetchError,
    hasData: Boolean(systemHealthQuery.data),
  })
  const dashboardStatusLabel = getSystemHealthStatusLabel(rawSystemHealthStatus)
  const dashboardStatusTone = getSystemHealthTone(rawSystemHealthStatus)
  const dashboardSnapshotGeneratedAt = hasSnapshot
    ? formatInstant(dashboardSnapshot.generatedAt)
    : snapshotCollectionLabel ?? DASHBOARD_DATA_MISSING_LABEL
  const mailStatusLabel = getMailStatusLabel(dashboardSnapshot?.signupMail.status)
  const taskQueueDetail = hasSnapshot
    ? `실패 ${dashboardSnapshot.taskQueue.failedCount} · 정체 ${dashboardSnapshot.taskQueue.staleProcessingCount}`
    : snapshotCollectionLabel ?? DASHBOARD_DATA_MISSING_LABEL
  const authSecurityDetail = hasSnapshot
    ? `최근 기록 ${dashboardSnapshot.authSecurity.recentEventCount}건`
    : snapshotCollectionLabel ?? DASHBOARD_DATA_MISSING_LABEL
  const missingOrFailedLabel = snapshotCollectionLabel ?? DASHBOARD_DATA_MISSING_LABEL
  const missingOrFailedTone = snapshotCollectionFailed ? "warn" : "neutral"

  const kpiCards: DashboardKpiCard[] = [
    {
      key: "health",
      label: "서비스 상태",
      value: healthCollectionLabel === DASHBOARD_COLLECTION_FAILED_LABEL && !systemHealthQuery.data
        ? DASHBOARD_COLLECTION_FAILED_LABEL
        : dashboardStatusLabel,
      detail: healthCollectionFailed
        ? DASHBOARD_COLLECTION_FAILED_LABEL
        : `스냅샷 ${dashboardSnapshotGeneratedAt}`,
      tone: healthCollectionFailed ? "warn" : dashboardStatusTone,
      icon: "service",
    },
    {
      key: "tasks",
      label: "작업 큐",
      value: hasSnapshot
        ? `${dashboardSnapshot.taskQueue.readyPendingCount} 대기 / ${dashboardSnapshot.taskQueue.processingCount} 처리`
        : missingOrFailedLabel,
      detail: taskQueueDetail,
      tone: hasSnapshot ? getTaskQueueTone(dashboardSnapshot) : missingOrFailedTone,
      icon: "spark",
    },
    {
      key: "mail",
      label: "회원가입 메일",
      value: hasSnapshot ? mailStatusLabel : missingOrFailedLabel,
      detail:
        hasSnapshot && dashboardSnapshot.signupMail.queueLagSeconds != null
          ? `큐 지연 ${formatAge(dashboardSnapshot.signupMail.queueLagSeconds)}`
          : hasSnapshot && dashboardSnapshot.signupMail.latestFailureAt
            ? `최근 실패 ${formatInstant(dashboardSnapshot.signupMail.latestFailureAt)}`
            : hasSnapshot ? "메일 큐 정상" : missingOrFailedLabel,
      tone: hasSnapshot ? getMailStatusTone(dashboardSnapshot?.signupMail.status) : missingOrFailedTone,
      icon: "edit",
    },
    {
      key: "auth-security",
      label: "인증 이상",
      value: hasSnapshot ? `${dashboardSnapshot.authSecurity.blockedEventCount}건` : missingOrFailedLabel,
      detail: authSecurityDetail,
      tone: hasSnapshot ? (dashboardSnapshot.authSecurity.blockedEventCount ? "warn" : "good") : missingOrFailedTone,
      icon: "check-circle",
    },
  ]

  const priorityRows: DashboardPriorityRow[] = hasSnapshot ? [
    {
      key: "task-queue",
      title: "작업 큐",
      summary: `ready ${dashboardSnapshot.taskQueue.readyPendingCount} · failed ${dashboardSnapshot.taskQueue.failedCount} · stale ${dashboardSnapshot.taskQueue.staleProcessingCount}`,
      tone: getTaskQueueTone(dashboardSnapshot),
      href: "/admin/tools",
      actionLabel: "도구 열기",
    },
    {
      key: "signup-mail",
      title: "회원가입 메일",
      summary:
        dashboardSnapshot.signupMail.latestFailureMessage ??
        (dashboardSnapshot.signupMail.queueLagSeconds != null
          ? `큐 지연 ${formatAge(dashboardSnapshot.signupMail.queueLagSeconds)}`
          : mailStatusLabel),
      tone: getMailStatusTone(dashboardSnapshot?.signupMail.status),
      href: "/admin/tools",
      actionLabel: "메일 진단",
    },
    {
      key: "auth-security",
      title: "인증 보안",
      summary: `차단 ${dashboardSnapshot.authSecurity.blockedEventCount} · 최근 ${dashboardSnapshot.authSecurity.recentEventCount}`,
      tone: dashboardSnapshot.authSecurity.blockedEventCount ? "warn" : "good",
      href: "/admin/tools",
      actionLabel: "기록 보기",
    },
    {
      key: "storage-cleanup",
      title: "스토리지 정리",
      summary: dashboardSnapshot.storageCleanup.blockedBySafetyThreshold
        ? "안전 임계값으로 purge 보류"
        : `purge 대상 ${dashboardSnapshot.storageCleanup.eligibleForPurgeCount}건`,
      tone:
        dashboardSnapshot.storageCleanup.blockedBySafetyThreshold || dashboardSnapshot.storageCleanup.eligibleForPurgeCount > 0
          ? "warn"
          : "good",
      href: "/admin/tools",
      actionLabel: "정리 진단",
    },
  ] : [
    {
      key: "snapshot-missing",
      title: "운영 스냅샷",
      summary: snapshotCollectionFailed
        ? DASHBOARD_COLLECTION_FAILED_LABEL
        : `${DASHBOARD_DATA_MISSING_LABEL} · ${DASHBOARD_BACKEND_CHECK_LABEL}`,
      tone: missingOrFailedTone,
      href: "/admin/tools",
      actionLabel: "진단 열기",
    },
  ]

  const chartBars: DashboardChartBar[] = hasSnapshot
    ? ([
        {
          key: "ready",
          label: "ready",
          value: dashboardSnapshot.taskQueue.readyPendingCount,
          tone: dashboardSnapshot.taskQueue.readyPendingCount ? "neutral" : "good",
        },
        {
          key: "processing",
          label: "processing",
          value: dashboardSnapshot.taskQueue.processingCount,
          tone: "neutral",
        },
        {
          key: "failed",
          label: "failed",
          value: dashboardSnapshot.taskQueue.failedCount,
          tone: dashboardSnapshot.taskQueue.failedCount ? "warn" : "good",
        },
        {
          key: "stale",
          label: "stale",
          value: dashboardSnapshot.taskQueue.staleProcessingCount,
          tone: dashboardSnapshot.taskQueue.staleProcessingCount ? "warn" : "good",
        },
        {
          key: "auth-recent",
          label: "auth",
          value: dashboardSnapshot.authSecurity.recentEventCount,
          tone: "neutral",
        },
        {
          key: "auth-blocked",
          label: "blocked",
          value: dashboardSnapshot.authSecurity.blockedEventCount,
          tone: dashboardSnapshot.authSecurity.blockedEventCount ? "warn" : "good",
        },
        {
          key: "purge",
          label: "purge",
          value: dashboardSnapshot.storageCleanup.eligibleForPurgeCount,
          tone: dashboardSnapshot.storageCleanup.eligibleForPurgeCount ? "warn" : "good",
        },
        {
          key: "mail-lag",
          label: "mail",
          value: dashboardSnapshot.signupMail.queueLagSeconds ?? 0,
          tone: getMailStatusTone(dashboardSnapshot.signupMail.status),
        },
      ] as Array<{ key: string; label: string; value: number; tone: DashboardChartBar["tone"] }>)
        .map((item, _index, items) => {
          const maxValue = Math.max(...items.map((bar) => bar.value), 1)
          const height = item.value > 0 ? Math.max(14, Math.round((item.value / maxValue) * 100)) : 8
          return {
            key: item.key,
            label: item.label,
            height,
            tone: item.tone,
          }
        })
    : []

  const logRows: DashboardLogRow[] = hasSnapshot
    ? [
        {
          key: "snapshot",
          time: formatInstant(dashboardSnapshot.generatedAt),
          message: "운영 스냅샷 수집",
          detail: `system ${dashboardStatusLabel}`,
          tone: dashboardStatusTone,
        },
        {
          key: "task-queue",
          time: dashboardSnapshot.taskQueue.latestFailureAt
            ? formatInstant(dashboardSnapshot.taskQueue.latestFailureAt)
            : formatInstant(dashboardSnapshot.generatedAt),
          message: "작업 큐 상태",
          detail: `ready ${dashboardSnapshot.taskQueue.readyPendingCount} · failed ${dashboardSnapshot.taskQueue.failedCount} · stale ${dashboardSnapshot.taskQueue.staleProcessingCount}`,
          tone: getTaskQueueTone(dashboardSnapshot),
        },
        {
          key: "signup-mail",
          time: dashboardSnapshot.signupMail.latestFailureAt
            ? formatInstant(dashboardSnapshot.signupMail.latestFailureAt)
            : formatInstant(dashboardSnapshot.generatedAt),
          message: "회원가입 메일",
          detail: dashboardSnapshot.signupMail.latestFailureMessage ?? mailStatusLabel,
          tone: getMailStatusTone(dashboardSnapshot.signupMail.status),
        },
        {
          key: "auth-security",
          time: dashboardSnapshot.authSecurity.latestEventAt
            ? formatInstant(dashboardSnapshot.authSecurity.latestEventAt)
            : formatInstant(dashboardSnapshot.generatedAt),
          message: "인증 이벤트",
          detail: `recent ${dashboardSnapshot.authSecurity.recentEventCount} · blocked ${dashboardSnapshot.authSecurity.blockedEventCount}`,
          tone: dashboardSnapshot.authSecurity.blockedEventCount ? "warn" : "good",
        },
        {
          key: "storage-cleanup",
          time: dashboardSnapshot.storageCleanup.oldestEligiblePurgeAfter
            ? formatInstant(dashboardSnapshot.storageCleanup.oldestEligiblePurgeAfter)
            : formatInstant(dashboardSnapshot.generatedAt),
          message: "스토리지 정리",
          detail: dashboardSnapshot.storageCleanup.blockedBySafetyThreshold
            ? "safety threshold blocked"
            : `eligible ${dashboardSnapshot.storageCleanup.eligibleForPurgeCount}`,
          tone:
            dashboardSnapshot.storageCleanup.blockedBySafetyThreshold ||
            dashboardSnapshot.storageCleanup.eligibleForPurgeCount > 0
              ? "warn"
              : "good",
        },
      ]
    : [
        {
          key: "snapshot-missing",
          time: missingOrFailedLabel,
          message: snapshotCollectionFailed ? "운영 스냅샷 수집 실패" : "운영 스냅샷 미수집",
          detail: snapshotCollectionFailed ? DASHBOARD_COLLECTION_FAILED_LABEL : DASHBOARD_BACKEND_CHECK_LABEL,
          tone: missingOrFailedTone,
        },
      ]

  const chartEmptyLabel = snapshotCollectionFailed
    ? DASHBOARD_COLLECTION_FAILED_LABEL
    : `${DASHBOARD_DATA_MISSING_LABEL} · ${DASHBOARD_BACKEND_CHECK_LABEL}`

  return (
    <AdminDashboardWorkspaceView
      chartBars={chartBars}
      chartEmptyLabel={chartEmptyLabel}
      collectionFailed={collectionFailed}
      snapshotCollectionFailed={snapshotCollectionFailed}
      dashboardStatusLabel={dashboardStatusLabel}
      dashboardStatusTone={dashboardStatusTone}
      freshnessLabel={freshnessLabel}
      isRefreshing={isRefreshing}
      kpiCards={kpiCards}
      logRows={logRows}
      onRefresh={handleRefresh}
      priorityRows={priorityRows}
      sessionMember={sessionMember}
    />
  )
}

export default AdminDashboardPage
