import AdminShell from "src/routes/Admin/AdminShell"
import { AdminToolsDiagnosticsSection } from "src/routes/Admin/AdminToolsDiagnosticsSection"
import { AdminToolsExecutionSection } from "src/routes/Admin/AdminToolsExecutionSection"
import { AdminToolsOpsOverview } from "src/routes/Admin/AdminToolsOpsOverview"
import AdminToolsResultsPanel from "src/routes/Admin/AdminToolsResultsPanel"
import {
  Main,
  WorkspaceColumn,
  WorkspaceShell,
} from "src/routes/Admin/AdminToolsWorkspace.styles"

export const AdminToolsWorkspaceSections = (props: Record<string, any>) => {
  const {
    executions,
    filteredExecutions,
    freshnessClock,
    loadingKey,
    resultFilterCounts,
    resultsFilter,
    selectedExecution,
    sessionMember,
    setResultsFilter,
    setSelectedExecutionId,
  } = props

  return (
    <AdminShell currentSection="tools" member={sessionMember}>
      <Main>
        <AdminToolsOpsOverview {...props} loadingKey={loadingKey} />

        <WorkspaceShell>
          <WorkspaceColumn>
            <AdminToolsDiagnosticsSection
              {...props}
              isBusy={Boolean(loadingKey)}
            />
            <AdminToolsExecutionSection
              {...props}
              isBusy={Boolean(loadingKey)}
            />
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
