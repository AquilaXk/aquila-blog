import styled from "@emotion/styled"
import { useQuery } from "@tanstack/react-query"
import { GetServerSideProps, NextPage } from "next"
import { IncomingMessage } from "http"
import Link from "next/link"
import type { SimpleIcon } from "simple-icons"
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

const EMPTY_INITIAL_SNAPSHOT: AdminDashboardInitialSnapshot = {
  systemHealth: null,
  fetchedAt: null,
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

  const monitoringItems = buildMonitoringItems(systemHealthQuery.data?.status || "확인 전", env)
  const grafanaDashboardUrl = env.monitoringEmbedLooksLikeGrafana ? env.monitoringEmbedUrl : ""

  return (
    <Main>
      <Shell>
        <TopRow>
          <div>
            <PageEyebrow>운영 모니터링</PageEyebrow>
            <h1>운영 대시보드</h1>
            <p>first-fold 핵심 지표를 먼저 보고, 아래에서 수집 건강도와 SSE 연결 상태까지 이어서 점검합니다.</p>
          </div>
          <TopActions>
            <StatusChip data-tone={systemHealthQuery.data?.status === "UP" ? "good" : "neutral"}>
              {systemHealthQuery.data?.status === "UP" ? "서비스 정상" : systemHealthQuery.data?.status || "상태 확인 전"}
            </StatusChip>
            <Link href="/admin/tools" passHref legacyBehavior>
              <HeaderLink>진단/실행 열기</HeaderLink>
            </Link>
          </TopActions>
        </TopRow>

        <ServiceRail data-ui="monitoring-service-rail">
          {monitoringItems.map((item) => (
            <ServiceCard key={item.key} href={item.href} target="_blank" rel="noreferrer noopener">
              <ServiceIcon>{renderMonitoringBrand(item.brand.icon, item.brand.fallbackIcon, item.title)}</ServiceIcon>
              <ServiceCopy>
                <strong>{item.title}</strong>
                <span>{item.status}</span>
              </ServiceCopy>
            </ServiceCard>
          ))}
        </ServiceRail>

        <PanelGrid data-ui="monitoring-panel-grid">
          {DASHBOARD_PANEL_CARDS.map((panel) => {
            const panelUrl = grafanaDashboardUrl ? buildGrafanaPanelEmbedUrl(grafanaDashboardUrl, panel.panelId) : ""
            return (
              <PanelCard key={panel.key} data-ui="monitoring-panel-card">
                <PanelHeader>
                  <div>
                    <strong>{panel.title}</strong>
                    <span>{panel.description}</span>
                  </div>
                  {grafanaDashboardUrl ? (
                    <LaunchLink href={panelUrl || grafanaDashboardUrl} target="_blank" rel="noreferrer noopener">
                      새 창
                    </LaunchLink>
                  ) : null}
                </PanelHeader>
                <PanelBody>
                  {panelUrl ? (
                    <PanelFrame
                      src={panelUrl}
                      title={panel.title}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <PanelFallback>
                      <strong>대시보드를 불러올 수 없습니다.</strong>
                      <span>Grafana embed URL 또는 public dashboard 구성을 먼저 확인하세요.</span>
                    </PanelFallback>
                  )}
                </PanelBody>
              </PanelCard>
            )
          })}
        </PanelGrid>

        <ReviewNote>
          <strong>운영 관점 점검 결과</strong>
          <span>
            운영 first fold에는 총 요청량, p95, 메모리 압박, DB 커넥션 포화를 우선 두고, 다음 행에서 5xx, 큐 적체, 캐시
            효율, SSE recovery를 확인하도록 구성했습니다. 마지막 행에는 scrape health와 SSE emitter 수를 둬 지표 수집
            실패와 연결 누적도 함께 점검할 수 있게 했습니다.
          </span>
        </ReviewNote>
      </Shell>
    </Main>
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
  padding: 40px 0 72px;
  display: grid;
  gap: 24px;

  @media (max-width: 768px) {
    width: min(calc(100% - 24px), 1380px);
    padding-top: 28px;
  }
`

const TopRow = styled.header`
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-start;

  h1 {
    margin: 6px 0 0;
    font-size: clamp(2rem, 3vw, 2.8rem);
    line-height: 1.08;
    letter-spacing: -0.04em;
  }

  p {
    margin: 12px 0 0;
    max-width: 720px;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 1rem;
    line-height: 1.6;
  }

  @media (max-width: 900px) {
    flex-direction: column;
  }
`

const PageEyebrow = styled.span`
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.06em;
`

const TopActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
`

const StatusChip = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.82rem;
  font-weight: 800;

  &[data-tone="good"] {
    background: ${({ theme }) => theme.colors.accentSurfaceSubtle};
  }
`

const HeaderLink = styled.a`
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  text-decoration: none;
  font-size: 0.84rem;
  font-weight: 780;
`

const ServiceRail = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`

const ServiceCard = styled.a`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  text-decoration: none;
`

const ServiceIcon = styled.div`
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
`

const ServiceCopy = styled.div`
  display: grid;
  gap: 2px;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.95rem;
    font-weight: 800;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
    font-weight: 700;
  }
`

const PanelGrid = styled.section`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;

  @media (max-width: 1080px) {
    grid-template-columns: 1fr;
  }
`

const PanelCard = styled.article`
  border-radius: 28px;
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.08);
`

const PanelHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 26px 26px 18px;
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
    font-size: 0.9rem;
    line-height: 1.55;
  }
`

const LaunchLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 76px;
  min-height: 48px;
  padding: 0 18px;
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.blue9};
  text-decoration: none;
  font-size: 0.92rem;
  font-weight: 780;
`

const PanelBody = styled.div`
  background: ${({ theme }) => theme.colors.gray1};
`

const PanelFrame = styled.iframe`
  display: block;
  width: 100%;
  height: 420px;
  border: 0;
  background: ${({ theme }) => theme.colors.gray1};
`

const PanelFallback = styled.div`
  min-height: 320px;
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

const ReviewNote = styled.section`
  display: grid;
  gap: 8px;
  padding: 18px 20px;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};

  strong {
    font-size: 0.96rem;
    font-weight: 820;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.9rem;
    line-height: 1.6;
  }
`
