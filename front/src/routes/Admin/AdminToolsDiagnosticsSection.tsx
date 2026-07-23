import {
  CalmMessage,
  CompactList,
  CompactListItem,
  DetailsPanel,
  DetailsSummary,
  DiagnosticHeader,
  DiagnosticPanel,
  DiagnosticsTabButton,
  DiagnosticsTabs,
  FreshnessBadge,
  InlineNotice,
  MetricCard,
  MetricGrid,
  QuietButton,
  SectionHeading,
  SectionTitleBlock,
  SubSectionHeading,
  SubtleMetaGrid,
  SubtleMetaItem,
  ActionRow,
  WorkspaceSection,
} from "src/routes/Admin/AdminToolsWorkspace.styles"
import {
  SECTION_IDS,
  formatAge,
  formatInstant,
  formatRetryPolicy,
} from "src/routes/Admin/AdminToolsWorkspaceModel"

export const AdminToolsDiagnosticsSection = (props: Record<string, any>) => {
  const {
    activeDiagnosticTab,
    fetchSignupMailDiagnostics,
    fetchTaskQueueDiagnostics,
    hasMailDiagnostics,
    hasTaskQueueDiagnostics,
    isBusy,
    isMailLoading,
    isQueueLoading,
    mailDiagnostics,
    mailDiagnosticsError,
    mailFreshness,
    setActiveDiagnosticTab,
    signupMailQueueStatusLabel,
    signupMailQueueStatusMessage,
    signupMailTaskQueue,
    taskQueueDiagnostics,
    taskQueueDiagnosticsError,
    taskQueueFreshness,
  } = props

  return (
    <WorkspaceSection id={SECTION_IDS.diagnostics} data-ops-section="diagnostics">
      <SectionHeading>
        <SectionTitleBlock>
          <h2>메일과 큐</h2>
        </SectionTitleBlock>
      </SectionHeading>

      <DiagnosticsTabs role="tablist" aria-label="메일과 큐 도메인">
        {([
          { key: "mail", label: "메일 진단" },
          { key: "queue", label: "작업 큐 진단" },
        ] as const).map((tab) => (
          <DiagnosticsTabButton
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeDiagnosticTab === tab.key}
            data-active={activeDiagnosticTab === tab.key}
            onClick={() => setActiveDiagnosticTab(tab.key)}
          >
            {tab.label}
          </DiagnosticsTabButton>
        ))}
      </DiagnosticsTabs>

      {activeDiagnosticTab === "mail" ? (
        <DiagnosticPanel>
          <DiagnosticHeader>
            <div>
              <strong>메일 진단</strong>
            </div>
            <ActionRow>
              {hasMailDiagnostics ? <FreshnessBadge data-tone={mailFreshness.tone}>{mailFreshness.label}</FreshnessBadge> : null}
              <QuietButton type="button" disabled={isBusy} onClick={() => void fetchSignupMailDiagnostics(false)}>
                다시 확인
              </QuietButton>
              <QuietButton type="button" disabled={isBusy} onClick={() => void fetchSignupMailDiagnostics(true)}>
                SMTP 연결 확인
              </QuietButton>
            </ActionRow>
          </DiagnosticHeader>

          {!!mailDiagnostics?.missing.length && <InlineNotice data-tone="warning">누락된 설정: {mailDiagnostics.missing.join(", ")}</InlineNotice>}
          {!!mailDiagnostics?.connectionError && <InlineNotice data-tone="danger">{mailDiagnostics.connectionError}</InlineNotice>}
          {!!mailDiagnosticsError && <InlineNotice data-tone="danger">{mailDiagnosticsError}</InlineNotice>}

          {hasMailDiagnostics ? (
            <>
              <MetricGrid>
                <MetricCard>
                  <small>상태</small>
                  <strong>{mailDiagnostics?.status || "-"}</strong>
                </MetricCard>
                <MetricCard>
                  <small>SMTP 호스트</small>
                  <strong>{mailDiagnostics?.host || "미설정"}</strong>
                </MetricCard>
                <MetricCard>
                  <small>발신 주소</small>
                  <strong>{mailDiagnostics?.mailFrom || "미설정"}</strong>
                </MetricCard>
                <MetricCard>
                  <small>최근 확인</small>
                  <strong>{mailDiagnostics?.checkedAt ? formatInstant(mailDiagnostics.checkedAt) : "-"}</strong>
                </MetricCard>
              </MetricGrid>

              <SubSectionHeading>
                <strong>회원가입 메일 큐</strong>
                <small>{signupMailQueueStatusLabel}</small>
              </SubSectionHeading>
              {signupMailTaskQueue ? (
                <>
                  <MetricGrid>
                    <MetricCard>
                      <small>ready</small>
                      <strong>{signupMailTaskQueue.readyPendingCount}</strong>
                    </MetricCard>
                    <MetricCard>
                      <small>processing</small>
                      <strong>{signupMailTaskQueue.processingCount}</strong>
                    </MetricCard>
                    <MetricCard>
                      <small>backlog</small>
                      <strong>{signupMailTaskQueue.backlogCount ?? 0}</strong>
                    </MetricCard>
                    <MetricCard>
                      <small>failed</small>
                      <strong>{signupMailTaskQueue.failedCount}</strong>
                    </MetricCard>
                  </MetricGrid>
                  <SubtleMetaGrid>
                    <SubtleMetaItem>
                      <span>상태</span>
                      <strong>{signupMailQueueStatusMessage}</strong>
                    </SubtleMetaItem>
                    <SubtleMetaItem>
                      <span>가장 오래 대기</span>
                      <strong>{formatAge(signupMailTaskQueue.oldestReadyPendingAgeSeconds)}</strong>
                    </SubtleMetaItem>
                    <SubtleMetaItem>
                      <span>마지막 실패</span>
                      <strong>{signupMailTaskQueue.latestFailureAt ? formatInstant(signupMailTaskQueue.latestFailureAt) : "-"}</strong>
                    </SubtleMetaItem>
                    <SubtleMetaItem>
                      <span>재시도 정책</span>
                      <strong>{signupMailTaskQueue.retryPolicy.maxRetries}회</strong>
                    </SubtleMetaItem>
                  </SubtleMetaGrid>
                  {!!signupMailTaskQueue.latestFailureMessage && (
                    <InlineNotice data-tone="danger">{signupMailTaskQueue.latestFailureMessage}</InlineNotice>
                  )}
                </>
              ) : (
                <CalmMessage>{isMailLoading ? "로딩 중" : "없음"}</CalmMessage>
              )}
            </>
          ) : (
            <CalmMessage>{isMailLoading ? "로딩 중" : "없음"}</CalmMessage>
          )}

          {hasMailDiagnostics ? (
            <SubtleMetaGrid>
              <SubtleMetaItem>
                <span>메일 어댑터</span>
                <strong>{mailDiagnostics?.adapter || "-"}</strong>
              </SubtleMetaItem>
              <SubtleMetaItem>
                <span>검증 경로</span>
                <strong>{mailDiagnostics?.verifyPath || "/signup/verify"}</strong>
              </SubtleMetaItem>
              <SubtleMetaItem>
                <span>SMTP 인증</span>
                <strong>{mailDiagnostics?.smtpAuth ? "사용" : "미사용"}</strong>
              </SubtleMetaItem>
              <SubtleMetaItem>
                <span>STARTTLS</span>
                <strong>{mailDiagnostics?.startTlsEnabled ? "사용" : "미사용"}</strong>
              </SubtleMetaItem>
            </SubtleMetaGrid>
          ) : null}
        </DiagnosticPanel>
      ) : null}

      {activeDiagnosticTab === "queue" ? (
        <DiagnosticPanel>
          <DiagnosticHeader>
            <div>
              <strong>작업 큐 진단</strong>
            </div>
            <ActionRow>
              {hasTaskQueueDiagnostics ? <FreshnessBadge data-tone={taskQueueFreshness.tone}>{taskQueueFreshness.label}</FreshnessBadge> : null}
              <QuietButton type="button" disabled={isBusy} onClick={() => void fetchTaskQueueDiagnostics()}>
                다시 확인
              </QuietButton>
            </ActionRow>
          </DiagnosticHeader>

          {!!taskQueueDiagnosticsError && <InlineNotice data-tone="danger">{taskQueueDiagnosticsError}</InlineNotice>}

          {taskQueueDiagnostics ? (
            <>
              <MetricGrid>
                <MetricCard>
                  <small>ready</small>
                  <strong>{taskQueueDiagnostics.readyPendingCount}</strong>
                </MetricCard>
                <MetricCard>
                  <small>processing</small>
                  <strong>{taskQueueDiagnostics.processingCount}</strong>
                </MetricCard>
                <MetricCard>
                  <small>최근 실패</small>
                  <strong>{taskQueueDiagnostics.failedCount}</strong>
                </MetricCard>
                <MetricCard>
                  <small>stale</small>
                  <strong>{taskQueueDiagnostics.staleProcessingCount}</strong>
                </MetricCard>
              </MetricGrid>

              <SubtleMetaGrid>
                <SubtleMetaItem>
                  <span>가장 오래 대기 중</span>
                  <strong>{formatAge(taskQueueDiagnostics.oldestReadyPendingAgeSeconds)}</strong>
                </SubtleMetaItem>
                <SubtleMetaItem>
                  <span>가장 오래 처리 중</span>
                  <strong>{formatAge(taskQueueDiagnostics.oldestProcessingAgeSeconds)}</strong>
                </SubtleMetaItem>
                <SubtleMetaItem>
                  <span>processing timeout</span>
                  <strong>{taskQueueDiagnostics.processingTimeoutSeconds}초</strong>
                </SubtleMetaItem>
                <SubtleMetaItem>
                  <span>완료 작업</span>
                  <strong>{taskQueueDiagnostics.completedCount}</strong>
                </SubtleMetaItem>
              </SubtleMetaGrid>
            </>
          ) : (
            <CalmMessage>{isQueueLoading ? "로딩 중" : "없음"}</CalmMessage>
          )}

          {!!taskQueueDiagnostics?.taskTypes.length && (
            <DetailsPanel>
              <DetailsSummary>
                <span>작업 유형별 상태</span>
                <small>{taskQueueDiagnostics.taskTypes.length}개</small>
              </DetailsSummary>
              <CompactList>
                {taskQueueDiagnostics.taskTypes.map((taskType: any) => (
                  <CompactListItem key={taskType.taskType}>
                    <div>
                      <strong>{taskType.label}</strong>
                      <span>{taskType.taskType}</span>
                    </div>
                    <div>
                      <small>ready {taskType.readyPendingCount}</small>
                      <small>failed {taskType.failedCount}</small>
                      <small>{formatRetryPolicy(taskType.retryPolicy)}</small>
                    </div>
                  </CompactListItem>
                ))}
              </CompactList>
            </DetailsPanel>
          )}

          {!!taskQueueDiagnostics?.recentFailures.length && (
            <DetailsPanel>
              <DetailsSummary>
                <span>최근 실패 작업</span>
                <small>{taskQueueDiagnostics.recentFailures.length}건</small>
              </DetailsSummary>
              <CompactList>
                {taskQueueDiagnostics.recentFailures.map((sample: any) => (
                  <CompactListItem key={`failed-${sample.taskId}`}>
                    <div>
                      <strong>{sample.label}</strong>
                      <span>
                        #{sample.taskId} · {sample.taskType} · retry {sample.retryCount}/{sample.maxRetries}
                      </span>
                    </div>
                    <div>
                      <small>{formatInstant(sample.modifiedAt)}</small>
                      <small>{sample.errorMessage || "오류 메시지 없음"}</small>
                    </div>
                  </CompactListItem>
                ))}
              </CompactList>
            </DetailsPanel>
          )}
        </DiagnosticPanel>
      ) : null}
    </WorkspaceSection>
  )
}
