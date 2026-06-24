import Link from "next/link"
import {
  Chart,
  ChartBar,
  ChartBars,
  HeaderLink,
  HeroActions,
  HeroCopy,
  HeroPanel,
  HeroTop,
  LogLine,
  LogLines,
  Main,
  MetricCard,
  MetricCopy,
  OpsGrid,
  PanelCard,
  PanelHeader,
  PrioritySection,
  PrioritySummary,
  Shell,
  ServiceRail,
  StatusChip,
  StatusDot,
  StatusRow,
  StatusRows,
} from "src/routes/Admin/AdminDashboardWorkspace.styles"
import AdminShell from "src/routes/Admin/AdminShell"

export const AdminDashboardWorkspaceView = (props: Record<string, any>) => {
  const {
    chartBars,
    dashboardStatusLabel,
    dashboardStatusTone,
    kpiCards,
    logRows,
    priorityRows,
    sessionMember,
  } = props

  return (
    <AdminShell currentSection="dashboard" member={sessionMember}>
      <Main>
        <Shell>
          <HeroPanel>
            <HeroTop>
              <HeroCopy>
                <span>Operations</span>
                <h1>운영 상태와 복구</h1>
                <p>배포 슬롯, readiness, 로그와 주요 시스템 지표를 확인합니다.</p>
              </HeroCopy>
              <HeroActions>
                <StatusChip data-tone={dashboardStatusTone}>{dashboardStatusLabel}</StatusChip>
                <Link href="/admin/tools" passHref legacyBehavior>
                  <HeaderLink>Doctor 실행</HeaderLink>
                </Link>
                <Link href="/admin/tools" passHref legacyBehavior>
                  <HeaderLink data-variant="primary">Rollback</HeaderLink>
                </Link>
              </HeroActions>
            </HeroTop>
          </HeroPanel>

          <ServiceRail data-ui="monitoring-service-rail">
            {kpiCards.map((item: any) => (
              <MetricCard key={item.key} data-tone={item.tone}>
                <MetricCopy>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <small>{item.detail}</small>
                </MetricCopy>
              </MetricCard>
            ))}
          </ServiceRail>

          <OpsGrid>
            <PanelCard>
              <PanelHeader>
                <h2>Public read latency</h2>
                <StatusChip data-tone={dashboardStatusTone}>LIVE</StatusChip>
              </PanelHeader>
              <Chart aria-label="운영 스냅샷 기반 지표 차트">
                {chartBars.length ? (
                  <ChartBars>
                    {chartBars.map((bar: any) => (
                      <ChartBar
                        key={bar.key}
                        aria-label={`${bar.label} ${bar.height}`}
                        data-tone={bar.tone}
                        style={{ height: `${bar.height}%` }}
                      />
                    ))}
                  </ChartBars>
                ) : (
                  <PrioritySummary data-tone="neutral">데이터 미수집 · 백엔드 확인 필요</PrioritySummary>
                )}
              </Chart>
            </PanelCard>

            <PrioritySection>
              <PanelHeader>
                <h2>Steady-state guard</h2>
              </PanelHeader>
              <StatusRows data-ui="dashboard-guard-rows">
                {priorityRows.map((row: any) => (
                  <StatusRow key={row.key} data-tone={row.tone}>
                    <span>
                      <StatusDot data-tone={row.tone} aria-hidden="true" />
                      <span>
                        <strong>{row.title}</strong>
                        <small>{row.summary}</small>
                      </span>
                    </span>
                    {row.href ? (
                      <Link href={row.href} passHref legacyBehavior>
                        <PrioritySummary as="a" data-tone={row.tone}>
                          {row.actionLabel}
                        </PrioritySummary>
                      </Link>
                    ) : (
                      <PrioritySummary data-tone={row.tone}>{row.actionLabel}</PrioritySummary>
                    )}
                  </StatusRow>
                ))}
              </StatusRows>
            </PrioritySection>

            <PanelCard data-size="wide">
              <PanelHeader>
                <h2>Live logs</h2>
                <span>Loki · production</span>
              </PanelHeader>
              <LogLines>
                {logRows.map((row: any) => (
                  <LogLine key={row.key} data-tone={row.tone}>
                    <span>{row.time}</span>
                    <p>
                      {row.message}
                      <small>{row.detail}</small>
                    </p>
                  </LogLine>
                ))}
              </LogLines>
            </PanelCard>
          </OpsGrid>
        </Shell>
      </Main>
    </AdminShell>
  )
}
