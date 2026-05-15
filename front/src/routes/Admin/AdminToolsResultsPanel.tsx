import {
  formatInstant,
  getFreshnessMeta,
  SECTION_IDS,
  type ExecutionEntry,
  type ExecutionResultFilter,
} from "src/routes/Admin/AdminToolsWorkspaceModel"
import {
  ActionToneBadge,
  CardSectionHeading,
  DetailsPanel,
  DetailsSummary,
  EmptyResultState,
  FreshnessBadge,
  HistoryButton,
  HistoryList,
  ResultBadgeRow,
  ResultFilterButton,
  ResultFilterRow,
  ResultHistoryCard,
  ResultMetaGrid,
  ResultPanel,
  ResultPrimaryCard,
  ResultSummary,
  ResultsLayout,
  ResultTop,
  SectionHeading,
  SectionTitleBlock,
  SubtleMetaItem,
  WorkspaceSection,
} from "src/routes/Admin/AdminToolsWorkspace.styles"

const pretty = (value: unknown) => JSON.stringify(value, null, 2)

export type AdminToolsResultsPanelProps = {
  executions: ExecutionEntry[]
  filteredExecutions: ExecutionEntry[]
  freshnessClock: number | null
  onResultFilterChange: (filter: ExecutionResultFilter) => void
  onSelectedExecutionChange: (id: string) => void
  resultFilterCounts: Record<ExecutionResultFilter, number>
  resultsFilter: ExecutionResultFilter
  selectedExecution: ExecutionEntry | null
}

const RESULT_FILTERS: Array<{ key: ExecutionResultFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "success", label: "성공" },
  { key: "error", label: "실패" },
  { key: "stale", label: "오래됨" },
]

export default function AdminToolsResultsPanel({
  executions,
  filteredExecutions,
  freshnessClock,
  onResultFilterChange,
  onSelectedExecutionChange,
  resultFilterCounts,
  resultsFilter,
  selectedExecution,
}: AdminToolsResultsPanelProps) {
  return (
    <WorkspaceSection id={SECTION_IDS.results} data-ops-section="results" data-emphasis="secondary">
      <SectionHeading>
        <SectionTitleBlock>
          <h2>최근 진단 결과</h2>
        </SectionTitleBlock>
      </SectionHeading>

      <ResultFilterRow aria-label="실행 결과 필터">
        {RESULT_FILTERS.map((filter) => (
          <ResultFilterButton
            key={filter.key}
            type="button"
            data-active={resultsFilter === filter.key}
            onClick={() => onResultFilterChange(filter.key)}
          >
            {filter.label}
            <span>{resultFilterCounts[filter.key]}</span>
          </ResultFilterButton>
        ))}
      </ResultFilterRow>

      {selectedExecution ? (
        <ResultsLayout>
          <ResultPrimaryCard>
            <ResultTop>
              <div>
                <small>방금 실행한 작업</small>
                <strong>{selectedExecution.source}</strong>
              </div>
              <ResultBadgeRow>
                <ActionToneBadge
                  data-tone={
                    selectedExecution.status === "error"
                      ? "danger"
                      : selectedExecution.tone === "danger"
                        ? "danger"
                        : selectedExecution.tone === "write"
                          ? "write"
                          : "read"
                  }
                >
                  {selectedExecution.status === "error" ? "실패" : "성공"}
                </ActionToneBadge>
                <FreshnessBadge data-tone={getFreshnessMeta(selectedExecution.completedAt, freshnessClock).tone}>
                  {getFreshnessMeta(selectedExecution.completedAt, freshnessClock).label}
                </FreshnessBadge>
              </ResultBadgeRow>
            </ResultTop>
            <ResultMetaGrid>
              <SubtleMetaItem>
                <span>영역</span>
                <strong>{selectedExecution.domain}</strong>
              </SubtleMetaItem>
              <SubtleMetaItem>
                <span>실행 시각</span>
                <strong>{formatInstant(selectedExecution.completedAt)}</strong>
              </SubtleMetaItem>
            </ResultMetaGrid>
            <ResultSummary>{selectedExecution.summary}</ResultSummary>
            <DetailsPanel>
              <DetailsSummary>
                <span>원본 응답 보기</span>
                <small>JSON</small>
              </DetailsSummary>
              <ResultPanel>{pretty(selectedExecution.payload)}</ResultPanel>
            </DetailsPanel>
          </ResultPrimaryCard>

          <ResultHistoryCard>
            <CardSectionHeading>
              <div>
                <h3>최근 기록</h3>
              </div>
            </CardSectionHeading>
            <HistoryList>
              {filteredExecutions.map((entry) => (
                <HistoryButton
                  key={entry.id}
                  type="button"
                  data-active={selectedExecution.id === entry.id}
                  onClick={() => onSelectedExecutionChange(entry.id)}
                >
                  <span>{entry.source}</span>
                  <small>
                    {entry.status === "error" ? "실패" : "성공"} · {formatInstant(entry.completedAt)} ·{" "}
                    {getFreshnessMeta(entry.completedAt, freshnessClock).label}
                  </small>
                </HistoryButton>
              ))}
            </HistoryList>
          </ResultHistoryCard>
        </ResultsLayout>
      ) : (
        <EmptyResultState>
          {executions.length === 0 ? "실행 기록 없음" : "현재 필터에 맞는 실행 결과가 없습니다."}
        </EmptyResultState>
      )}
    </WorkspaceSection>
  )
}
