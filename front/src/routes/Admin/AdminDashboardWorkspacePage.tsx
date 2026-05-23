import { useQuery } from "@tanstack/react-query"
import { NextPage } from "next"
import { apiFetch } from "src/apis/backend/client"
import type { AuthMember } from "src/hooks/useAuthSession"
import useAuthSession from "src/hooks/useAuthSession"
import {
  DASHBOARD_PANEL_CARDS,
  buildGrafanaPanelEmbedUrl,
  buildMonitoringItems,
  getMonitoringEnv,
} from "src/routes/Admin/adminMonitoring"
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
  type DashboardKpiCard,
  type DashboardPriorityRow,
  type DashboardQuickAction,
  type DashboardSnapshotPayload,
  type SystemHealthPayload,
} from "src/routes/Admin/AdminDashboardWorkspaceModel"
import { AdminDashboardWorkspaceView } from "src/routes/Admin/AdminDashboardWorkspaceView"

type AdminDashboardPageProps = {
  initialMember: AuthMember
  initialSnapshot: AdminDashboardInitialSnapshot
}

const env = getMonitoringEnv()

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
  const monitoringItems = buildMonitoringItems(rawSystemHealthStatus ?? "", env)
  const grafanaDashboardUrl = env.monitoringEmbedLooksLikeGrafana ? env.monitoringEmbedUrl : ""
  const grafanaPanelsCanEmbed = env.monitoringEmbedIsPublicGrafana && Boolean(grafanaDashboardUrl)
  const secondaryPanels = DASHBOARD_PANEL_CARDS
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
  const leadFailureItems = hasSnapshot ? [
    {
      key: "task-failed",
      label: "실패 task",
      value: `${dashboardSnapshot.taskQueue.failedCount}건`,
      tone: dashboardSnapshot.taskQueue.failedCount ? ("warn" as const) : ("good" as const),
    },
    {
      key: "task-stale",
      label: "정체 task",
      value: `${dashboardSnapshot.taskQueue.staleProcessingCount}건`,
      tone: dashboardSnapshot.taskQueue.staleProcessingCount ? ("warn" as const) : ("good" as const),
    },
    {
      key: "mail-failure",
      label: "메일 최근 실패",
      value: dashboardSnapshot.signupMail.latestFailureAt
        ? formatInstant(dashboardSnapshot.signupMail.latestFailureAt)
        : DASHBOARD_DATA_MISSING_LABEL,
      tone: dashboardSnapshot.signupMail.latestFailureAt ? ("warn" as const) : ("good" as const),
    },
    {
      key: "auth-blocked",
      label: "최근 인증 차단",
      value: dashboardSnapshot.authSecurity.latestBlockedAt
        ? formatInstant(dashboardSnapshot.authSecurity.latestBlockedAt)
        : DASHBOARD_DATA_MISSING_LABEL,
      tone: dashboardSnapshot.authSecurity.latestBlockedAt ? ("warn" as const) : ("good" as const),
    },
  ] : [
    {
      key: "snapshot-missing",
      label: "운영 스냅샷",
      value: DASHBOARD_DATA_MISSING_LABEL,
      tone: "neutral" as const,
    },
  ]

  const leadFailureMetaItems = hasSnapshot ? [
    {
      key: "mail-message",
      label: "메일 실패 메시지",
      value: dashboardSnapshot.signupMail.latestFailureMessage ?? DASHBOARD_DATA_MISSING_LABEL,
    },
    {
      key: "task-message",
      label: "task 실패 메시지",
      value: dashboardSnapshot.taskQueue.latestFailureMessage ?? DASHBOARD_DATA_MISSING_LABEL,
    },
    {
      key: "mail-latest",
      label: "메일 실패 시각",
      value: dashboardSnapshot.signupMail.latestFailureAt
        ? formatInstant(dashboardSnapshot.signupMail.latestFailureAt)
        : DASHBOARD_DATA_MISSING_LABEL,
    },
    {
      key: "task-latest",
      label: "task 실패 시각",
      value: dashboardSnapshot.taskQueue.latestFailureAt
        ? formatInstant(dashboardSnapshot.taskQueue.latestFailureAt)
        : DASHBOARD_DATA_MISSING_LABEL,
    },
    {
      key: "auth-latest",
      label: "차단 시각",
      value: dashboardSnapshot.authSecurity.latestBlockedAt
        ? formatInstant(dashboardSnapshot.authSecurity.latestBlockedAt)
        : DASHBOARD_DATA_MISSING_LABEL,
    },
  ] : [
    {
      key: "snapshot-check",
      label: "스냅샷",
      value: DASHBOARD_BACKEND_CHECK_LABEL,
    },
  ]

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

  const quickActions: DashboardQuickAction[] = [
    {
      key: "tools",
      href: "/admin/tools",
      label: "운영 진단 열기",
    },
    ...(grafanaDashboardUrl
      ? [
          {
            key: "grafana",
            href: grafanaDashboardUrl,
            label: "Grafana 열기",
          },
        ]
      : []),
    ...(env.logsDashboardUrl
      ? [
          {
            key: "logs",
            href: env.logsDashboardUrl,
            label: "로그 보드",
          },
        ]
      : []),
  ]

  const grafanaPanelFallbackTitle = grafanaDashboardUrl ? "Grafana 패널은 새 창에서 확인하세요." : "대시보드를 불러올 수 없습니다."
  const grafanaPanelFallbackBody = grafanaDashboardUrl
    ? env.monitoringEmbedIsPrivateGrafana
      ? "현재 URL은 인증이 필요한 private Grafana 대시보드라 iframe 대신 링크로만 제공합니다."
      : "현재 대시보드는 iframe 임베드를 지원하지 않아 새 창 링크로만 제공합니다."
    : "Grafana embed URL 또는 public dashboard 구성을 먼저 확인하세요."

  return (
    <AdminDashboardWorkspaceView
      buildGrafanaPanelEmbedUrl={buildGrafanaPanelEmbedUrl}
      dashboardStatusLabel={dashboardStatusLabel}
      dashboardStatusTone={dashboardStatusTone}
      focusItems={leadFailureItems}
      grafanaDashboardUrl={grafanaDashboardUrl}
      grafanaPanelFallbackBody={grafanaPanelFallbackBody}
      grafanaPanelFallbackTitle={grafanaPanelFallbackTitle}
      grafanaPanelsCanEmbed={grafanaPanelsCanEmbed}
      kpiCards={kpiCards}
      leadFailureMetaItems={leadFailureMetaItems}
      monitoringItems={monitoringItems}
      priorityRows={priorityRows}
      quickActions={quickActions}
      secondaryPanels={secondaryPanels}
      sessionMember={sessionMember}
    />
  )
}

export default AdminDashboardPage
