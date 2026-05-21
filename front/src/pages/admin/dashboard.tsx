import { useQuery } from "@tanstack/react-query"
import { GetServerSideProps, NextPage } from "next"
import { IncomingMessage } from "http"
import Link from "next/link"
import type { SimpleIcon } from "simple-icons"
import { useEffect, useRef, useState } from "react"
import { apiFetch } from "src/apis/backend/client"
import AppIcon from "src/components/icons/AppIcon"
import type { AuthMember } from "src/hooks/useAuthSession"
import useAuthSession from "src/hooks/useAuthSession"
import { AdminPageProps, buildAdminPagePropsFromMember, getAdminPageProps, readAdminProtectedBootstrap } from "src/libs/server/adminPage"
import { hasServerAuthCookie } from "src/libs/server/authSession"
import { serverApiFetch } from "src/libs/server/backend"
import { appendSsrDebugTiming, timed } from "src/libs/server/serverTiming"
import {
  DASHBOARD_PANEL_CARDS,
  buildGrafanaPanelEmbedUrl,
  buildMonitoringItems,
  getMonitoringEnv,
} from "src/routes/Admin/adminMonitoring"
import AdminShell from "src/routes/Admin/AdminShell"
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
import {
  Main,
  Shell,
  HeroPanel,
  HeroTop,
  HeroCopy,
  PageEyebrow,
  HeroActions,
  StatusChip,
  HeaderLink,
  ServiceRail,
  MetricCard,
  MetricIcon,
  MetricCopy,
  PanelGrid,
  PanelCard,
  LeadPanelCard,
  CompactPanelCard,
  PanelHeader,
  LaunchLink,
  PanelBody,
  SnapshotLeadBody,
  PanelFrame,
  CompactPanelBody,
  CompactPanelSummary,
  PanelFallback,
  InsightRail,
  LeadMetaGrid,
  ActionList,
  SectionHeader,
  PrioritySection,
  ContextGrid,
  ContextSection,
  ContextLinkGrid,
  ContextMonitoringLinkCard,
  AdditionalPanelsSection,
  AdditionalPanelsDisclosure,
  AdditionalPanelsSummary,
  AdditionalPanelsGrid,
  PriorityTable,
  PriorityCellCopy,
  PrioritySummary,
  PriorityLink,
  InsightLink,
} from "src/routes/Admin/AdminDashboardWorkspace.styles"
import {
  AdminInfoLinkCard,
  AdminInfoList,
  AdminInfoPanelCard,
  AdminInfoStatusItem,
  AdminInfoStatusList,
} from "src/routes/Admin/AdminSurfacePrimitives"

type AdminDashboardPageProps = AdminPageProps & {
  initialSnapshot: AdminDashboardInitialSnapshot
}

type AdminDashboardBootstrapPayload = {
  member: AuthMember
  health: SystemHealthPayload
  dashboard: DashboardSnapshotPayload
}

async function readJsonIfOk<T>(req: IncomingMessage, path: string): Promise<T | null> {
  try {
    const response = await serverApiFetch(req, path)
    if (!response.ok) return null
    const contentLength = response.headers.get("content-length")
    if (contentLength === "0") return null
    return (await response.json()) as T
  } catch {
    return null
  }
}

export const getServerSideProps: GetServerSideProps<AdminDashboardPageProps> = async ({ req, res }) => {
  const ssrStartedAt = performance.now()
  const bootstrapResultPromise =
    hasServerAuthCookie(req)
      ? timed(() =>
          readAdminProtectedBootstrap<AdminDashboardBootstrapPayload>(req, "/system/api/v1/adm/bootstrap", "/admin/dashboard")
        )
      : null

  const bootstrapResult = bootstrapResultPromise ? await bootstrapResultPromise : null
  if (bootstrapResult?.ok && !bootstrapResult.value.ok && bootstrapResult.value.destination) {
    return {
      redirect: {
        destination: bootstrapResult.value.destination,
        permanent: false,
      },
    }
  }

  let baseProps: AdminPageProps
  let authDurationMs = 0
  let authDescription: string = "bootstrap"
  let systemHealthResult: {
    durationMs: number
    ok: true
    value: { value: SystemHealthPayload | null; source: string }
  }
  let dashboardSnapshotResult: {
    durationMs: number
    ok: true
    value: { value: DashboardSnapshotPayload | null; source: string }
  }

  if (bootstrapResult?.ok && bootstrapResult.value.ok) {
    baseProps = buildAdminPagePropsFromMember(bootstrapResult.value.value.member)
    systemHealthResult = {
      durationMs: bootstrapResult.durationMs,
      ok: true,
      value: {
        value: bootstrapResult.value.value.health,
        source: "bootstrap",
      },
    }
    dashboardSnapshotResult = {
      durationMs: bootstrapResult.durationMs,
      ok: true,
      value: {
        value: bootstrapResult.value.value.dashboard,
        source: "bootstrap",
      },
    }
  } else {
    const baseResult = await timed(() => getAdminPageProps(req))
    if (!baseResult.ok) throw baseResult.error
    if ("redirect" in baseResult.value) return baseResult.value
    if (!("props" in baseResult.value)) return baseResult.value
    baseProps = await baseResult.value.props
    authDurationMs = baseResult.durationMs
    authDescription = "fallback"

    const fallbackSystemHealthResult = await timed(() => readJsonIfOk<SystemHealthPayload>(req, "/system/api/v1/adm/health"))
    if (!fallbackSystemHealthResult.ok) throw fallbackSystemHealthResult.error
    const fallbackDashboardSnapshotResult = await timed(() =>
      readJsonIfOk<DashboardSnapshotPayload>(req, "/system/api/v1/adm/dashboard-snapshot")
    )
    if (!fallbackDashboardSnapshotResult.ok) throw fallbackDashboardSnapshotResult.error
    systemHealthResult = {
      durationMs: fallbackSystemHealthResult.durationMs,
      ok: true,
      value: {
        value: fallbackSystemHealthResult.value,
        source: fallbackSystemHealthResult.value ? "ok" : "empty",
      },
    }
    dashboardSnapshotResult = {
      durationMs: fallbackDashboardSnapshotResult.durationMs,
      ok: true,
      value: {
        value: fallbackDashboardSnapshotResult.value,
        source: fallbackDashboardSnapshotResult.value ? "ok" : "empty",
      },
    }
  }

  const systemHealth = systemHealthResult.value.value
  const dashboardSnapshot = dashboardSnapshotResult.value.value

  appendSsrDebugTiming(req, res, [
    {
      name: "admin-dashboard-auth",
      durationMs: authDurationMs,
      description: authDescription,
    },
    {
      name: "admin-dashboard-health",
      durationMs: systemHealthResult.durationMs,
      description: systemHealth ? systemHealthResult.value.source : "empty",
    },
    {
      name: "admin-dashboard-snapshot",
      durationMs: dashboardSnapshotResult.durationMs,
      description: dashboardSnapshot ? dashboardSnapshotResult.value.source : "empty",
    },
    {
      name: "admin-dashboard-ssr-total",
      durationMs: performance.now() - ssrStartedAt,
      description: "ready",
    },
  ])

  return {
    props: {
      ...baseProps,
      initialSnapshot: {
        systemHealth,
        dashboard: dashboardSnapshot,
        systemHealthFetchedAt: systemHealth ? new Date().toISOString() : null,
        dashboardFetchedAt: dashboardSnapshot?.generatedAt ?? (dashboardSnapshot ? new Date().toISOString() : null),
      },
    },
  }
}

const env = getMonitoringEnv()
const DASHBOARD_PANEL_STAGGER_MS = 640
const DASHBOARD_INTERSECTION_ROOT_MARGIN = "0px"
const DASHBOARD_IDLE_ACTIVATION_TIMEOUT_MS = 1400
let dashboardPanelActivationCursor = 0

const reserveDashboardPanelActivationDelay = (delayMs: number) => {
  if (typeof performance === "undefined") return Math.max(0, delayMs)
  const now = performance.now()
  const requestedAt = now + Math.max(0, delayMs)
  const scheduledAt = Math.max(requestedAt, dashboardPanelActivationCursor)
  dashboardPanelActivationCursor = scheduledAt + DASHBOARD_PANEL_STAGGER_MS
  return Math.max(0, Math.round(scheduledAt - now))
}

const DeferredPanelFrame: React.FC<{
  eager?: boolean
  activationDelayMs?: number
  src: string
  title: string
}> = ({ eager = false, activationDelayMs = 0, src, title }) => {
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const [isActivated, setIsActivated] = useState(eager)

  useEffect(() => {
    if (isActivated || !src || typeof window === "undefined") return

    let observer: IntersectionObserver | null = null
    let activationDelayId: number | null = null
    let idleId: number | null = null
    let activationQueued = false
    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: {
          timeout?: number
        }
      ) => number
      cancelIdleCallback?: (id: number) => void
    }

    const activate = () => {
      setIsActivated(true)
    }

    const queueIdleActivation = () => {
      if (typeof idleWindow.requestIdleCallback === "function") {
        idleId = idleWindow.requestIdleCallback(activate, { timeout: DASHBOARD_IDLE_ACTIVATION_TIMEOUT_MS })
        return
      }
      activate()
    }

    const scheduleActivation = (delayMs: number) => {
      if (activationQueued) return
      activationQueued = true
      const nextDelayMs = eager ? 0 : reserveDashboardPanelActivationDelay(delayMs)
      if (nextDelayMs <= 0) {
        queueIdleActivation()
        return
      }
      activationDelayId = window.setTimeout(queueIdleActivation, nextDelayMs)
    }

    if (anchorRef.current && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return
          scheduleActivation(activationDelayMs)
          observer?.disconnect()
        },
        { root: null, rootMargin: DASHBOARD_INTERSECTION_ROOT_MARGIN }
      )
      observer.observe(anchorRef.current)
    }

    return () => {
      observer?.disconnect()
      if (idleId !== null && typeof idleWindow.cancelIdleCallback === "function") {
        idleWindow.cancelIdleCallback(idleId)
      }
      if (activationDelayId !== null) {
        window.clearTimeout(activationDelayId)
      }
    }
  }, [activationDelayMs, eager, isActivated, src])

  return (
    <div ref={anchorRef}>
      {isActivated ? (
        <PanelFrame src={src} title={title} loading={eager ? "eager" : "lazy"} referrerPolicy="no-referrer" />
      ) : (
        <PanelFrame as="div" aria-hidden="true" data-pending="true" />
      )}
    </div>
  )
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
  const focusItems = [
    ...leadFailureItems,
  ]

  return (
    <AdminShell currentSection="dashboard" member={sessionMember}>
      <Main>
        <Shell>
          <HeroPanel>
            <HeroTop>
              <HeroCopy>
                <PageEyebrow>운영 모니터링</PageEyebrow>
                <h1>지금 확인해야 할 운영 상태</h1>
              </HeroCopy>
              <HeroActions>
                <StatusChip data-tone={dashboardStatusTone}>{dashboardStatusLabel}</StatusChip>
                <Link href="/admin/tools" passHref legacyBehavior>
                  <HeaderLink>진단/실행 열기</HeaderLink>
                </Link>
              </HeroActions>
            </HeroTop>
          </HeroPanel>

          <ServiceRail data-ui="monitoring-service-rail">
            {kpiCards.map((item) => (
              <MetricCard key={item.key} data-tone={item.tone}>
                <MetricIcon data-tone={item.tone}>
                  <AppIcon name={item.icon} aria-hidden="true" />
                </MetricIcon>
                <MetricCopy>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </MetricCopy>
              </MetricCard>
            ))}
          </ServiceRail>

          <PanelGrid data-ui="monitoring-panel-grid">
            <LeadPanelCard data-ui="monitoring-panel-card">
                <PanelHeader>
                  <div>
                    <strong>최근 실패</strong>
                  </div>
                <Link href="/admin/tools" passHref legacyBehavior>
                  <LaunchLink>운영 도구</LaunchLink>
                </Link>
              </PanelHeader>
              <SnapshotLeadBody>
                <AdminInfoStatusList>
                  {focusItems.map((item) => (
                    <AdminInfoStatusItem key={item.key} data-tone={item.tone}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </AdminInfoStatusItem>
                  ))}
                </AdminInfoStatusList>
                <LeadMetaGrid>
                  {leadFailureMetaItems.map((item) => (
                    <AdminInfoPanelCard key={item.key}>
                      <small>{item.label}</small>
                      <strong>{item.value}</strong>
                    </AdminInfoPanelCard>
                  ))}
                </LeadMetaGrid>
              </SnapshotLeadBody>
            </LeadPanelCard>

            <InsightRail>
              <CompactPanelCard data-ui="monitoring-panel-card">
                <PanelHeader>
                  <div>
                    <strong>런북</strong>
                  </div>
                </PanelHeader>
                <CompactPanelBody>
                  <ActionList>
                    {quickActions.map((action) => (
                      <Link key={action.key} href={action.href} passHref legacyBehavior>
                        <AdminInfoLinkCard
                          $withIcon={false}
                          target={action.href.startsWith("http") ? "_blank" : undefined}
                          rel={action.href.startsWith("http") ? "noreferrer noopener" : undefined}
                        >
                          <strong>{action.label}</strong>
                        </AdminInfoLinkCard>
                      </Link>
                    ))}
                  </ActionList>
                </CompactPanelBody>
              </CompactPanelCard>

              <CompactPanelCard data-ui="monitoring-panel-card">
                <PanelHeader>
                  <div>
                    <strong>즉시 이동</strong>
                  </div>
                </PanelHeader>
                <CompactPanelBody>
                  <CompactPanelSummary>
                    <span>{monitoringItems.length ? `${monitoringItems.length}개 채널이 연결되어 있습니다.` : "연결 채널 설정을 먼저 확인하세요."}</span>
                    {grafanaDashboardUrl ? (
                      <InsightLink href={grafanaDashboardUrl} target="_blank" rel="noreferrer noopener">
                        Grafana 열기
                      </InsightLink>
                    ) : (
                      <InsightLink as="span">환경 확인</InsightLink>
                    )}
                  </CompactPanelSummary>
                </CompactPanelBody>
              </CompactPanelCard>
            </InsightRail>
          </PanelGrid>

          <PrioritySection>
            <SectionHeader>
              <h2>우선 점검 항목</h2>
            </SectionHeader>

            <PriorityTable>
              <thead>
                <tr>
                  <th>항목</th>
                  <th>현재 상태</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {priorityRows.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <PriorityCellCopy>
                        <strong>{row.title}</strong>
                      </PriorityCellCopy>
                    </td>
                    <td>
                      <PrioritySummary data-tone={row.tone}>{row.summary}</PrioritySummary>
                    </td>
                    <td>
                      {row.href ? (
                        <PriorityLink
                          href={row.href}
                          target={row.href.startsWith("http") ? "_blank" : undefined}
                          rel={row.href.startsWith("http") ? "noreferrer noopener" : undefined}
                        >
                          {row.actionLabel}
                        </PriorityLink>
                      ) : (
                        <PriorityLink as="span">환경 확인</PriorityLink>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </PriorityTable>
          </PrioritySection>

          {secondaryPanels.length ? (
            <AdditionalPanelsSection>
              <AdditionalPanelsDisclosure>
                <AdditionalPanelsSummary>
                  <div>
                    <strong>추가 Grafana 패널</strong>
                    <span>{secondaryPanels.length}개</span>
                  </div>
                  <small>열기</small>
                </AdditionalPanelsSummary>
                <AdditionalPanelsGrid>
                  {secondaryPanels.map((panel, index) => {
                    const panelUrl = grafanaPanelsCanEmbed ? buildGrafanaPanelEmbedUrl(grafanaDashboardUrl, panel.panelId) : ""
                    return (
                      <PanelCard key={`secondary-${panel.key}`} data-ui="monitoring-panel-card">
                        <PanelHeader>
                          <div>
                            <strong>{panel.title}</strong>
                          </div>
                          {grafanaDashboardUrl ? (
                            <LaunchLink href={panelUrl || grafanaDashboardUrl} target="_blank" rel="noreferrer noopener">
                              새 창
                            </LaunchLink>
                          ) : null}
                        </PanelHeader>
                        <PanelBody>
                          {panelUrl ? (
                            <DeferredPanelFrame
                              eager={false}
                              activationDelayMs={index * DASHBOARD_PANEL_STAGGER_MS}
                              src={panelUrl}
                              title={panel.title}
                            />
                          ) : (
                            <PanelFallback>
                              <strong>{grafanaPanelFallbackTitle}</strong>
                              <span>{grafanaPanelFallbackBody}</span>
                            </PanelFallback>
                          )}
                        </PanelBody>
                      </PanelCard>
                    )
                  })}
                </AdditionalPanelsGrid>
              </AdditionalPanelsDisclosure>
            </AdditionalPanelsSection>
          ) : null}

          <ContextGrid>
            <ContextSection>
              <SectionHeader>
                <h2>운영 링크</h2>
              </SectionHeader>
              <AdminInfoList>
                {quickActions.map((action) => (
                  <Link key={action.key} href={action.href} passHref legacyBehavior>
                    <AdminInfoLinkCard
                      $withIcon={false}
                      target={action.href.startsWith("http") ? "_blank" : undefined}
                      rel={action.href.startsWith("http") ? "noreferrer noopener" : undefined}
                    >
                      <strong>{action.label}</strong>
                    </AdminInfoLinkCard>
                  </Link>
                ))}
              </AdminInfoList>
            </ContextSection>

            <ContextSection>
              <SectionHeader>
                <h2>연결된 채널</h2>
              </SectionHeader>
              <ContextLinkGrid>
                {monitoringItems.map((item) => (
                  <ContextMonitoringLinkCard key={item.key} href={item.href} target="_blank" rel="noreferrer noopener">
                    <span className="iconWrap">{renderMonitoringBrand(item.brand.icon, item.brand.fallbackIcon, item.title)}</span>
                    <span className="copy">
                      <strong>{item.title}</strong>
                      <span>{item.status}</span>
                    </span>
                  </ContextMonitoringLinkCard>
                ))}
              </ContextLinkGrid>
            </ContextSection>
          </ContextGrid>
        </Shell>
      </Main>
    </AdminShell>
  )
}

export default AdminDashboardPage

const renderMonitoringBrand = (
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
