import { useQuery } from "@tanstack/react-query"
import { NextPage } from "next"
import { apiFetch } from "src/apis/backend/client"
import type { AuthMember } from "src/hooks/useAuthSession"
import useAuthSession from "src/hooks/useAuthSession"
import {
  DASHBOARD_BACKEND_CHECK_LABEL,
  DASHBOARD_DATA_MISSING_LABEL,
  EMPTY_INITIAL_SNAPSHOT,
  formatAge,
  formatInstant,
  getMailStatusLabel,
  getMailStatusTone,
  getSystemHealthStatusLabel,
  getSystemHealthTone,
  getTaskQueueTone,
  hasDashboardSnapshot,
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
    refetchOnWindowFocus: false,
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
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })

  if (!sessionMember) return null

  const rawSystemHealthStatus = systemHealthQuery.data?.status ?? null
  const dashboardSnapshot = dashboardSnapshotQuery.data ?? initialSnapshot.dashboard
  const hasSnapshot = hasDashboardSnapshot(dashboardSnapshot)
  const dashboardStatusLabel = getSystemHealthStatusLabel(rawSystemHealthStatus)
  const dashboardStatusTone = getSystemHealthTone(rawSystemHealthStatus)
  const dashboardSnapshotGeneratedAt = hasSnapshot ? formatInstant(dashboardSnapshot.generatedAt) : DASHBOARD_DATA_MISSING_LABEL
  const mailStatusLabel = getMailStatusLabel(dashboardSnapshot?.signupMail.status)
  const taskQueueDetail = hasSnapshot
    ? `실패 ${dashboardSnapshot.taskQueue.failedCount} · 정체 ${dashboardSnapshot.taskQueue.staleProcessingCount}`
    : DASHBOARD_DATA_MISSING_LABEL
  const authSecurityDetail = hasSnapshot
    ? `최근 기록 ${dashboardSnapshot.authSecurity.recentEventCount}건`
    : DASHBOARD_DATA_MISSING_LABEL

  const kpiCards: DashboardKpiCard[] = [
    {
      key: "health",
      label: "서비스 상태",
      value: dashboardStatusLabel,
      detail: `스냅샷 ${dashboardSnapshotGeneratedAt}`,
      tone: dashboardStatusTone,
      icon: "service",
    },
    {
      key: "tasks",
      label: "작업 큐",
      value: hasSnapshot
        ? `${dashboardSnapshot.taskQueue.readyPendingCount} 대기 / ${dashboardSnapshot.taskQueue.processingCount} 처리`
        : DASHBOARD_DATA_MISSING_LABEL,
      detail: taskQueueDetail,
      tone: getTaskQueueTone(dashboardSnapshot),
      icon: "spark",
    },
    {
      key: "mail",
      label: "회원가입 메일",
      value: mailStatusLabel,
      detail:
        hasSnapshot && dashboardSnapshot.signupMail.queueLagSeconds != null
          ? `큐 지연 ${formatAge(dashboardSnapshot.signupMail.queueLagSeconds)}`
          : hasSnapshot && dashboardSnapshot.signupMail.latestFailureAt
            ? `최근 실패 ${formatInstant(dashboardSnapshot.signupMail.latestFailureAt)}`
            : hasSnapshot ? "메일 큐 정상" : DASHBOARD_DATA_MISSING_LABEL,
      tone: getMailStatusTone(dashboardSnapshot?.signupMail.status),
      icon: "edit",
    },
    {
      key: "auth-security",
      label: "인증 이상",
      value: hasSnapshot ? `${dashboardSnapshot.authSecurity.blockedEventCount}건` : DASHBOARD_DATA_MISSING_LABEL,
      detail: authSecurityDetail,
      tone: hasSnapshot ? (dashboardSnapshot.authSecurity.blockedEventCount ? "warn" : "good") : "neutral",
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
      summary: `${DASHBOARD_DATA_MISSING_LABEL} · ${DASHBOARD_BACKEND_CHECK_LABEL}`,
      tone: "neutral",
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
          time: DASHBOARD_DATA_MISSING_LABEL,
          message: "운영 스냅샷 미수집",
          detail: DASHBOARD_BACKEND_CHECK_LABEL,
          tone: "neutral",
        },
      ]

  return (
    <AdminDashboardWorkspaceView
      chartBars={chartBars}
      dashboardStatusLabel={dashboardStatusLabel}
      dashboardStatusTone={dashboardStatusTone}
      kpiCards={kpiCards}
      logRows={logRows}
      priorityRows={priorityRows}
      sessionMember={sessionMember}
    />
  )
}

export default AdminDashboardPage
