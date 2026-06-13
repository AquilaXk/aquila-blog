import Link from "next/link"
import AppIcon from "src/components/icons/AppIcon"
import {
  DASHBOARD_PANEL_STAGGER_MS,
  DeferredPanelFrame,
} from "src/routes/Admin/AdminDashboardDeferredPanelFrame"
import {
  ActionList,
  ActionListLinkCard,
  AdditionalPanelsDisclosure,
  AdditionalPanelsGrid,
  AdditionalPanelsSection,
  AdditionalPanelsSummary,
  CompactPanelBody,
  CompactPanelCard,
  CompactPanelSummary,
  ContextGrid,
  ContextLinkGrid,
  ContextMonitoringLinkCard,
  ContextSection,
  HeaderLink,
  HeroActions,
  HeroCopy,
  HeroPanel,
  HeroTop,
  InsightLink,
  InsightRail,
  LaunchLink,
  LeadMetaCard,
  LeadMetaGrid,
  LeadPanelCard,
  Main,
  MetricCard,
  MetricCopy,
  MetricIcon,
  PanelBody,
  PanelCard,
  PanelFallback,
  PanelGrid,
  PanelHeader,
  PriorityCellCopy,
  PriorityLink,
  PrioritySection,
  PrioritySummary,
  PriorityTable,
  SectionHeader,
  Shell,
  SnapshotLeadBody,
  ServiceRail,
  StatusChip,
} from "src/routes/Admin/AdminDashboardWorkspace.styles"
import { renderMonitoringBrand } from "src/routes/Admin/AdminDashboardWorkspaceSections"
import AdminShell from "src/routes/Admin/AdminShell"
import {
  AdminInfoLinkCard,
  AdminInfoList,
  AdminInfoStatusItem,
  AdminInfoStatusList,
} from "src/routes/Admin/AdminSurfacePrimitives"

export const AdminDashboardWorkspaceView = (props: Record<string, any>) => {
  const {
    dashboardStatusLabel,
    dashboardStatusTone,
    focusItems,
    grafanaDashboardUrl,
    grafanaPanelFallbackBody,
    grafanaPanelFallbackTitle,
    grafanaPanelsCanEmbed,
    kpiCards,
    monitoringItems,
    priorityRows,
    quickActions,
    secondaryPanels,
    sessionMember,
    buildGrafanaPanelEmbedUrl,
    leadFailureMetaItems,
  } = props

  return (
    <AdminShell currentSection="dashboard" member={sessionMember}>
      <Main>
        <Shell>
          <HeroPanel>
            <HeroTop>
              <HeroCopy>
                <h1>운영 상태</h1>
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
            {kpiCards.map((item: any) => (
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
                {priorityRows.map((row: any) => (
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
                  {focusItems.map((item: any) => (
                    <AdminInfoStatusItem key={item.key} data-tone={item.tone}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </AdminInfoStatusItem>
                  ))}
                </AdminInfoStatusList>
                <LeadMetaGrid>
                  {leadFailureMetaItems.map((item: any) => (
                    <LeadMetaCard key={item.key}>
                      <small>{item.label}</small>
                      <strong>{item.value}</strong>
                    </LeadMetaCard>
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
                    {quickActions.map((action: any) => (
                      <Link key={action.key} href={action.href} passHref legacyBehavior>
                        <ActionListLinkCard
                          $withIcon={false}
                          target={action.href.startsWith("http") ? "_blank" : undefined}
                          rel={action.href.startsWith("http") ? "noreferrer noopener" : undefined}
                        >
                          <strong>{action.label}</strong>
                        </ActionListLinkCard>
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
                  {secondaryPanels.map((panel: any, index: number) => {
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
                {quickActions.map((action: any) => (
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
                {monitoringItems.map((item: any) => (
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
