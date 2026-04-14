import styled from "@emotion/styled"
import { useQuery } from "@tanstack/react-query"
import { GetServerSideProps, NextPage } from "next"
import { IncomingMessage } from "http"
import Link from "next/link"
import type { SimpleIcon } from "simple-icons"
import { useEffect, useRef, useState } from "react"
import { apiFetch } from "src/apis/backend/client"
import AppIcon, { type IconName } from "src/components/icons/AppIcon"
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
  AdminElevatedCard,
  AdminInfoLinkCard,
  AdminInfoList,
  AdminPlainCard,
  AdminSectionTitleStack,
  AdminStatusPill,
  AdminTextActionLink,
} from "src/routes/Admin/AdminSurfacePrimitives"

type SystemHealthPayload = {
  status?: string
}

type AdminDashboardInitialSnapshot = {
  systemHealth: SystemHealthPayload | null
  fetchedAt: string | null
}

type AdminDashboardPageProps = AdminPageProps & {
  initialSnapshot: AdminDashboardInitialSnapshot
}

type AdminDashboardBootstrapPayload = {
  member: AuthMember
  health: SystemHealthPayload
}

type DashboardKpiCard = {
  key: string
  label: string
  value: string
  tone: "neutral" | "good" | "warn"
  icon: IconName
}

type DashboardPriorityRow = {
  key: string
  title: string
  priority: string
  tone: "neutral" | "good" | "warn"
  href: string
}

type DashboardQuickAction = {
  key: string
  href: string
  label: string
}

const EMPTY_INITIAL_SNAPSHOT: AdminDashboardInitialSnapshot = {
  systemHealth: null,
  fetchedAt: null,
}

const DASHBOARD_PRIORITY_PANEL_LIMIT = 4
const DASHBOARD_FIRST_FOLD_PANEL_LIMIT = 2

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
    systemHealthResult = {
      durationMs: fallbackSystemHealthResult.durationMs,
      ok: true,
      value: {
        value: fallbackSystemHealthResult.value,
        source: fallbackSystemHealthResult.value ? "ok" : "empty",
      },
    }
  }

  const systemHealth = systemHealthResult.value.value

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
        fetchedAt: systemHealth ? new Date().toISOString() : null,
      },
    },
  }
}

const env = getMonitoringEnv()
const DASHBOARD_EAGER_PANEL_COUNT = 1
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
      initialSnapshot.systemHealth && initialSnapshot.fetchedAt ? new Date(initialSnapshot.fetchedAt).getTime() : undefined,
    staleTime: 30_000,
    gcTime: 120_000,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })

  if (!sessionMember) return null

  const systemHealthStatus = systemHealthQuery.data?.status || "확인 전"
  const monitoringItems = buildMonitoringItems(systemHealthStatus, env)
  const grafanaDashboardUrl = env.monitoringEmbedLooksLikeGrafana ? env.monitoringEmbedUrl : ""
  const grafanaPanelsCanEmbed = env.monitoringEmbedIsPublicGrafana && Boolean(grafanaDashboardUrl)
  const leadPanel = DASHBOARD_PANEL_CARDS[0]
  const remainingPanels = DASHBOARD_PANEL_CARDS.slice(1)
  const firstFoldPanels = remainingPanels.slice(0, DASHBOARD_FIRST_FOLD_PANEL_LIMIT)
  const secondaryPanels = remainingPanels.slice(DASHBOARD_FIRST_FOLD_PANEL_LIMIT)
  const primaryRows = DASHBOARD_PANEL_CARDS.slice(0, DASHBOARD_PRIORITY_PANEL_LIMIT)
  const dashboardStatusLabel = systemHealthStatus === "UP" ? "서비스 정상" : systemHealthStatus
  const dashboardStatusTone = systemHealthStatus === "UP" ? "good" : "warn"

  const kpiCards: DashboardKpiCard[] = [
    {
      key: "health",
      label: "서비스 상태",
      value: dashboardStatusLabel,
      tone: dashboardStatusTone,
      icon: "service",
    },
    {
      key: "channels",
      label: "연결 채널",
      value: `${monitoringItems.length}개`,
      tone: monitoringItems.length >= 2 ? "good" : "warn",
      icon: "spark",
    },
    {
      key: "focus",
      label: "우선 점검",
      value: `${primaryRows.length}개`,
      tone: "neutral",
      icon: "edit",
    },
  ]

  const priorityRows: DashboardPriorityRow[] = primaryRows.map((panel, index) => ({
    key: panel.key,
    title: panel.title,
    priority: index === 0 ? "즉시" : index === 1 ? "높음" : "보통",
    tone: systemHealthStatus === "UP" ? (index === 0 ? "good" : "neutral") : index < 2 ? "warn" : "neutral",
    href: grafanaDashboardUrl ? buildGrafanaPanelEmbedUrl(grafanaDashboardUrl, panel.panelId) : grafanaDashboardUrl,
  }))

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

  const leadPanelUrl = grafanaPanelsCanEmbed ? buildGrafanaPanelEmbedUrl(grafanaDashboardUrl, leadPanel.panelId) : ""
  const grafanaPanelFallbackTitle = grafanaDashboardUrl ? "Grafana 패널은 새 창에서 확인하세요." : "대시보드를 불러올 수 없습니다."
  const grafanaPanelFallbackBody = grafanaDashboardUrl
    ? env.monitoringEmbedIsPrivateGrafana
      ? "현재 URL은 인증이 필요한 private Grafana 대시보드라 iframe 대신 링크로만 제공합니다."
      : "현재 대시보드는 iframe 임베드를 지원하지 않아 새 창 링크로만 제공합니다."
    : "Grafana embed URL 또는 public dashboard 구성을 먼저 확인하세요."

  return (
    <AdminShell currentSection="dashboard" member={sessionMember}>
      <Main>
        <Shell>
          <HeroPanel>
            <HeroTop>
              <HeroCopy>
                <PageEyebrow>운영 모니터링</PageEyebrow>
                <h1>운영 대시보드</h1>
                <p>핵심 상태와 즉시 확인할 항목만 남기고, 자세한 패널 탐색은 Grafana 새 창으로 분리합니다.</p>
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
                  <strong>{leadPanel.title}</strong>
                </div>
                {grafanaDashboardUrl ? (
                  <LaunchLink href={leadPanelUrl || grafanaDashboardUrl} target="_blank" rel="noreferrer noopener">
                    새 창
                  </LaunchLink>
                ) : null}
              </PanelHeader>
              <PanelBody>
                {leadPanelUrl ? (
                  <DeferredPanelFrame eager src={leadPanelUrl} title={leadPanel.title} />
                ) : (
                  <PanelFallback>
                    <strong>{grafanaPanelFallbackTitle}</strong>
                    <span>{grafanaPanelFallbackBody}</span>
                  </PanelFallback>
                )}
              </PanelBody>
            </LeadPanelCard>

            <InsightRail>
              {firstFoldPanels.map((panel, index) => {
                const panelUrl = grafanaPanelsCanEmbed ? buildGrafanaPanelEmbedUrl(grafanaDashboardUrl, panel.panelId) : ""
                return (
                  <CompactPanelCard key={`first-fold-${panel.key}`} data-ui="monitoring-panel-card">
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
                    <CompactPanelBody>
                      <CompactPanelSummary>
                        <span>상세 모니터링은 Grafana 새 창으로 확인합니다.</span>
                        {grafanaDashboardUrl ? (
                          <InsightLink href={panelUrl || grafanaDashboardUrl} target="_blank" rel="noreferrer noopener">
                            Grafana 열기
                          </InsightLink>
                        ) : (
                          <InsightLink as="span">환경 확인</InsightLink>
                        )}
                      </CompactPanelSummary>
                    </CompactPanelBody>
                  </CompactPanelCard>
                )
              })}
            </InsightRail>
          </PanelGrid>

          <PrioritySection>
            <SectionHeader>
              <h2>우선 점검 패널</h2>
            </SectionHeader>

            <PriorityTable>
              <thead>
                <tr>
                  <th>패널</th>
                  <th>우선순위</th>
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
                      <PriorityBadge data-tone={row.tone}>{row.priority}</PriorityBadge>
                    </td>
                    <td>
                      {row.href ? (
                        <PriorityLink href={row.href} target="_blank" rel="noreferrer noopener">
                          열기
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
                    <strong>추가 패널</strong>
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
                              activationDelayMs={(index + firstFoldPanels.length) * DASHBOARD_PANEL_STAGGER_MS}
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
                  <AdminInfoLinkCard key={item.key} href={item.href} target="_blank" rel="noreferrer noopener">
                    <span className="iconWrap">{renderMonitoringBrand(item.brand.icon, item.brand.fallbackIcon, item.title)}</span>
                    <span className="copy">
                      <strong>{item.title}</strong>
                      <span>{item.status}</span>
                    </span>
                  </AdminInfoLinkCard>
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

const Main = styled.main`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.gray2};
`

const Shell = styled.div`
  width: min(1380px, calc(100% - 40px));
  margin: 0 auto;
  padding: 16px 0 72px;
  display: grid;
  gap: 10px;

  @media (max-width: 768px) {
    width: min(calc(100% - 24px), 1380px);
    padding-top: 6px;
    gap: 8px;
  }
`

const HeroPanel = styled(AdminElevatedCard)`
  display: grid;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 28px;

  @media (max-width: 820px) {
    gap: 6px;
    padding: 11px 14px;
  }
`

const HeroTop = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-end;

  @media (max-width: 700px) {
    flex-direction: column;
    align-items: stretch;
  }
`

const HeroCopy = styled.div`
  display: grid;
  gap: 4px;

  h1 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: clamp(2rem, 3vw, 2.8rem);
    line-height: 1.08;
    letter-spacing: -0.04em;
    font-weight: 800;
  }

  p {
    margin: 0;
    max-width: 760px;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.98rem;
    line-height: 1.6;
  }

  @media (max-width: 768px) {
    h1 {
      font-size: clamp(1.8rem, 8vw, 2.35rem);
    }

    p {
      display: none;
    }
  }
`

const PageEyebrow = styled.span`
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`

const HeroActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;

  @media (max-width: 700px) {
    justify-content: flex-start;
  }
`

const StatusChip = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 38px;
  padding: 0 15px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.84rem;
  font-weight: 800;

  &[data-tone="good"] {
    border-color: ${({ theme }) => theme.colors.green7};
    background: ${({ theme }) => theme.colors.accentSurfaceSubtle};
  }

  &[data-tone="warn"] {
    border-color: ${({ theme }) => theme.colors.orange7};
  }
`

const HeaderLink = styled.a`
  display: inline-flex;
  align-items: center;
  min-height: 38px;
  padding: 0 15px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  text-decoration: none;
  font-size: 0.84rem;
  font-weight: 780;
`

const ServiceRail = styled.section`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 980px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 820px) {
    gap: 8px;
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`

const MetricCard = styled.article`
  display: grid;
  gap: 10px;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  padding: 12px;
  border-radius: 22px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.05);

  &[data-tone="good"] {
    border-color: ${({ theme }) => theme.colors.green7};
  }

  &[data-tone="warn"] {
    border-color: ${({ theme }) => theme.colors.orange7};
  }

  @media (max-width: 820px) {
    padding: 11px;
    gap: 9px;
  }
`

const MetricIcon = styled.div`
  width: 42px;
  height: 42px;
  border-radius: 15px;
  display: grid;
  place-items: center;
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray11};

  &[data-tone="good"] {
    background: ${({ theme }) =>
      theme.scheme === "light" ? "rgba(34, 197, 94, 0.1)" : "rgba(34, 197, 94, 0.18)"};
    color: ${({ theme }) => theme.colors.green7};
  }

  &[data-tone="warn"] {
    background: ${({ theme }) =>
      theme.scheme === "light" ? "rgba(249, 115, 22, 0.1)" : "rgba(249, 115, 22, 0.18)"};
    color: ${({ theme }) => theme.colors.orange7};
  }
`

const MetricCopy = styled.div`
  display: grid;
  gap: 4px;
  min-width: 0;

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
    font-weight: 700;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.22rem;
    font-weight: 820;
    line-height: 1.24;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.76rem;
    line-height: 1.45;
  }

  @media (max-width: 820px) {
    strong {
      font-size: 1.08rem;
    }

    p {
      font-size: 0.72rem;
      line-height: 1.38;
    }
  }
`

const PanelGrid = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(17.5rem, 0.8fr);
  gap: 16px;
  align-items: start;

  @media (max-width: 1180px) {
    grid-template-columns: 1fr;
  }
`

const PanelCard = styled(AdminPlainCard)`
  border-radius: 28px;
  overflow: hidden;
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.08);
`

const LeadPanelCard = styled(PanelCard)`
  min-width: 0;

  > div:last-of-type > iframe,
  > div:last-of-type > [data-pending="true"] {
    height: 232px;
  }

  > div:last-of-type > div {
    min-height: 188px;
  }
`

const CompactPanelCard = styled(PanelCard)`
  min-width: 0;
`

const PanelHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 18px 18px 12px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray4};

  strong {
    display: block;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.02rem;
    font-weight: 840;
    letter-spacing: -0.03em;
  }

  span {
    display: block;
    margin-top: 8px;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.88rem;
    line-height: 1.55;
  }
`

const LaunchLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 68px;
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  text-decoration: none;
  font-size: 0.88rem;
  font-weight: 780;
`

const PanelBody = styled.div`
  background: ${({ theme }) => theme.colors.gray1};
`

const PanelFrame = styled.iframe`
  display: block;
  width: 100%;
  height: 304px;
  border: 0;
  background: ${({ theme }) => theme.colors.gray1};
`

const CompactPanelBody = styled(PanelBody)`
  overflow: hidden;
`

const CompactPanelSummary = styled.div`
  min-height: 132px;
  display: grid;
  align-content: space-between;
  gap: 12px;
  padding: 18px;

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
    line-height: 1.55;
  }
`

const PanelFallback = styled.div`
  min-height: 210px;
  display: grid;
  place-items: center;
  gap: 8px;
  padding: 32px;
  text-align: center;

  strong {
    font-size: 1rem;
    font-weight: 820;
  }

  span {
    max-width: 28rem;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.9rem;
    line-height: 1.6;
  }
`

const InsightRail = styled.aside`
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr;
`

const RailCard = styled(AdminPlainCard)`
  display: grid;
  gap: 10px;
  padding: 16px;
  border-radius: 24px;
`

const SectionHeader = styled(AdminSectionTitleStack)`
  h2 {
    font-size: 0.98rem;
  }
`

const PrioritySection = styled(AdminPlainCard)`
  display: grid;
  gap: 12px;
  padding: 18px 20px;
  border-radius: 24px;
`

const ContextGrid = styled.section`
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);

  @media (max-width: 1180px) {
    grid-template-columns: 1fr;
  }
`

const ContextSection = styled(AdminPlainCard)`
  display: grid;
  gap: 12px;
  padding: 16px 18px;
  border-radius: 24px;
`

const ContextLinkGrid = styled(AdminInfoList)`
  grid-template-columns: repeat(3, minmax(0, 1fr));

  @media (max-width: 1180px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`

const AdditionalPanelsSection = styled(AdminPlainCard)`
  padding: 14px 16px;
  border-radius: 24px;
`

const AdditionalPanelsDisclosure = styled.details`
  display: grid;
  gap: 14px;
`

const AdditionalPanelsSummary = styled.summary`
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;

  &::-webkit-details-marker {
    display: none;
  }

  div {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.98rem;
    font-weight: 820;
  }

  span,
  small {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
    font-weight: 700;
  }
`

const AdditionalPanelsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`

const PriorityTable = styled.table`
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    padding: 14px 10px;
    border-top: 1px solid ${({ theme }) => theme.colors.gray4};
    text-align: left;
    vertical-align: middle;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.84rem;
    line-height: 1.5;
  }

  thead th {
    border-top: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.75rem;
    font-weight: 780;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  @media (max-width: 720px) {
    thead {
      display: none;
    }

    tbody,
    tr,
    td {
      display: block;
      width: 100%;
    }

    tr {
      padding: 12px 0;
      border-top: 1px solid ${({ theme }) => theme.colors.gray4};
    }

    tbody tr:first-of-type {
      border-top: 0;
    }

    td {
      border-top: 0;
      padding: 6px 0;
    }
  }
`

const PriorityCellCopy = styled.div`
  display: grid;
  gap: 2px;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.9rem;
    font-weight: 800;
  }
`

const PriorityBadge = styled(AdminStatusPill)`
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.75rem;
  font-weight: 780;

  &[data-tone="good"] {
    border-color: ${({ theme }) => theme.colors.green7};
  }

  &[data-tone="warn"] {
    border-color: ${({ theme }) => theme.colors.orange7};
  }
`

const PriorityLink = styled(AdminTextActionLink)`
  min-height: 30px;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.8rem;
  font-weight: 780;
`

const InsightLink = styled(AdminTextActionLink)`
  font-size: 0.82rem;
  font-weight: 780;
`
