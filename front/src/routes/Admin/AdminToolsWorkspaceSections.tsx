import Link from "next/link"
import AdminShell from "src/routes/Admin/AdminShell"
import { AdminToolsDiagnosticsSection } from "src/routes/Admin/AdminToolsDiagnosticsSection"
import { AdminToolsExecutionSection } from "src/routes/Admin/AdminToolsExecutionSection"
import AdminToolsResultsPanel from "src/routes/Admin/AdminToolsResultsPanel"
import {
  CardDetail,
  CardEyebrow,
  CardMainLine,
  FeaturedStatusCard,
  FreshnessBadge,
  InlineNotice,
  Main,
  MetaCaption,
  OpsOverview,
  OverviewContent,
  OverviewHeader,
  OverviewMeta,
  StatusBadge,
  StatusCardButton,
  StatusCardGrid,
  WorkspaceColumn,
  WorkspaceShell,
} from "src/routes/Admin/AdminToolsWorkspace.styles"
import { SECTION_IDS, getStatusTone } from "src/routes/Admin/AdminToolsWorkspaceModel"

export const AdminToolsWorkspaceSections = (props: Record<string, any>) => {
  const {
    attentionItems,
    executions,
    filteredExecutions,
    freshnessClock,
    focusSection,
    loadingKey,
    overviewStatusLabel,
    quickLinks,
    recentCheckedLabel,
    resultFilterCounts,
    resultsFilter,
    selectedExecution,
    sessionMember,
    setResultsFilter,
    setSelectedExecutionId,
    systemHealthFetchedAt,
    systemHealthFreshness,
    systemHealthStatus,
    systemHealthSummary,
  } = props

  return (
    <AdminShell currentSection="tools" member={sessionMember}>
      <Main>
        <OpsOverview id={SECTION_IDS.overview} data-ops-section="overview">
          <OverviewHeader>
            <div>
              <h1>문제 확인과 복구를 같은 흐름에서 처리합니다</h1>
            </div>
            <OverviewMeta>
              <StatusBadge data-tone={getStatusTone(overviewStatusLabel)}>{overviewStatusLabel}</StatusBadge>
              <FreshnessBadge data-tone={systemHealthFreshness.tone}>{systemHealthFreshness.label}</FreshnessBadge>
              <MetaCaption>
                <span>최근 확인</span>
                <strong>{recentCheckedLabel}</strong>
              </MetaCaption>
            </OverviewMeta>
          </OverviewHeader>

          <OverviewContent>
            <Link href="/admin/dashboard" passHref legacyBehavior>
              <FeaturedStatusCard as="a">
                <CardEyebrow>운영 대시보드</CardEyebrow>
                <CardMainLine>
                  <strong>{systemHealthStatus}</strong>
                </CardMainLine>
                <CardDetail>{systemHealthSummary[0] || `최근 확인 ${systemHealthFetchedAt}`}</CardDetail>
              </FeaturedStatusCard>
            </Link>

            <StatusCardGrid>
              {quickLinks.map((card: any) => (
                <StatusCardButton key={card.label} type="button" onClick={() => focusSection(card.section, card.tab)}>
                  <small>{card.label}</small>
                  <strong>{card.status}</strong>
                </StatusCardButton>
              ))}
            </StatusCardGrid>
          </OverviewContent>

          {attentionItems.length ? <InlineNotice data-tone="warning">{attentionItems[0]}</InlineNotice> : null}
        </OpsOverview>

        <WorkspaceShell>
          <WorkspaceColumn>
            <AdminToolsDiagnosticsSection {...props} isBusy={Boolean(loadingKey)} />
            <AdminToolsExecutionSection {...props} isBusy={Boolean(loadingKey)} />
            <AdminToolsResultsPanel
              executions={executions}
              filteredExecutions={filteredExecutions}
              freshnessClock={freshnessClock}
              onResultFilterChange={setResultsFilter}
              onSelectedExecutionChange={setSelectedExecutionId}
              resultFilterCounts={resultFilterCounts}
              resultsFilter={resultsFilter}
              selectedExecution={selectedExecution}
            />
          </WorkspaceColumn>
        </WorkspaceShell>
      </Main>
    </AdminShell>
  )
}
