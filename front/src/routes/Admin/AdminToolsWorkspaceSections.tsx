import { useQuery, useQueryClient } from "@tanstack/react-query"
import { NextPage } from "next"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { setCookie } from "cookies-next"
import { apiFetch } from "src/apis/backend/client"
import { toFriendlyApiMessage } from "src/apis/backend/errorMessages"
import type { AuthMember } from "src/hooks/useAuthSession"
import useAuthSession from "src/hooks/useAuthSession"
import AdminShell from "src/routes/Admin/AdminShell"
import {
  ACTION_META,
  CHECK_REQUIRED_STATUS_LABEL,
  CONNECTION_UNAVAILABLE_STATUS_LABEL,
  DATA_EMPTY_STATUS_LABEL,
  HEALTH_CACHE_MS,
  RESULTS_FILTER_STORAGE_KEY,
  SECTION_IDS,
  SYSTEM_HEALTH_QUERY_KEY,
  buildExecutionSummary,
  formatAge,
  formatInstant,
  formatRetryPolicy,
  getDiagnosticFallbackStatusLabel,
  getFreshnessMeta,
  getStatusTone,
  getSystemHealthSummary,
  isOperationalStatusMissing,
  isExecutionResultFilter,
  normalizeOperationalStatusLabel,
  type DiagnosticTab,
  type ExecutionEntry,
  type ExecutionResultFilter,
  type InlineNoticeTone,
  type JsonValue,
  type SectionKey,
  type SystemHealthPayload,
  type TaskRetryPolicy,
} from "src/routes/Admin/AdminToolsWorkspaceModel"
import {
  Main,
  OpsOverview,
  OverviewHeader,
  OverviewMeta,
  MetaCaption,
  OverviewContent,
  FeaturedStatusCard,
  CardEyebrow,
  CardMainLine,
  CardDetail,
  StatusCardGrid,
  StatusCardButton,
  SectionTitleBlock,
  CalmMessage,
  WorkspaceShell,
  WorkspaceColumn,
  WorkspaceSection,
  SectionHeading,
  StatusBadge,
  FreshnessBadge,
  SubSectionHeading,
  DetailsPanel,
  DetailsSummary,
  DiagnosticsTabs,
  DiagnosticsTabButton,
  DiagnosticPanel,
  DiagnosticHeader,
  ActionRow,
  QuietButton,
  MetricGrid,
  MetricCard,
  InlineNotice,
  SubtleMetaGrid,
  SubtleMetaItem,
  CompactList,
  CompactListItem,
  CompactCodeList,
  ExecutionLayout,
  ExecutionMain,
  ActionToneBadge,
  ActionList,
  ActionRowButton,
  FieldGrid,
  FieldBox,
  FieldLabel,
  Input,
  TextArea,
  DangerPanel,
  SandboxSection,
  SandboxHeader,
  DangerActionRow,
  ConfirmDeleteRow,
  DangerButton,
} from "src/routes/Admin/AdminToolsWorkspace.styles"
import AdminToolsExecutionRail from "src/routes/Admin/AdminToolsExecutionRail"
import AdminToolsResultsPanel from "src/routes/Admin/AdminToolsResultsPanel"

type ApiRsData<T> = {
  resultCode: string
  msg: string
  data: T
}

export const AdminToolsWorkspaceSections = (props: Record<string, any>) => {
  const { queryClient, sessionMember, loadingKey, setLoadingKey, executions, setExecutions, selectedExecutionId, setSelectedExecutionId, resultsFilter, setResultsFilter, postId, setPostId, commentId, setCommentId, commentContent, setCommentContent, mailDiagnostics, setMailDiagnostics, mailDiagnosticsError, setMailDiagnosticsError, taskQueueDiagnostics, setTaskQueueDiagnostics, taskQueueDiagnosticsError, setTaskQueueDiagnosticsError, taskQueueCheckedAt, setTaskQueueCheckedAt, cleanupDiagnostics, setCleanupDiagnostics, cleanupDiagnosticsError, setCleanupDiagnosticsError, cleanupCheckedAt, setCleanupCheckedAt, authSecurityEvents, setAuthSecurityEvents, authSecurityEventsError, setAuthSecurityEventsError, authSecurityCheckedAt, setAuthSecurityCheckedAt, systemHealthCheckedAt, setSystemHealthCheckedAt, activeSection, setActiveSection, sectionJumpTarget, setSectionJumpTarget, activeDiagnosticTab, setActiveDiagnosticTab, testEmail, setTestEmail, mailTestNotice, setMailTestNotice, freshnessClock, setFreshnessClock, confirmDelete, setConfirmDelete, advancedToolsOpen, setAdvancedToolsOpen, isMutationExpanded, setIsMutationExpanded, systemHealthQuery, fetchSystemHealthCached, pushExecution, executeAction, parsePositiveInt, requireCommentContent, fetchSignupMailDiagnostics, sendSignupTestMail, fetchTaskQueueDiagnostics, fetchCleanupDiagnostics, fetchAuthSecurityEvents, filteredExecutions, resultFilterCounts, selectedExecution, rawSystemHealthStatus, hasSystemHealthStatus, isSystemHealthConnectionUnavailable, systemHealthStatus, mailFreshness, taskQueueFreshness, cleanupFreshness, authFreshness, systemHealthFreshness, systemHealthSummary, systemHealthFetchedAt, isMailLoading, isQueueLoading, isCleanupLoading, isAuthLoading, hasMailDiagnostics, hasTaskQueueDiagnostics, hasCleanupDiagnostics, hasAuthDiagnostics, mailStatusLabel, signupMailTaskQueue, signupMailQueueStatusLabel, signupMailQueueStatusMessage, queueStatusLabel, cleanupStatusLabel, authSecurityStatusLabel, recentCheckedLabel, overviewStatusLabel, attentionItems, quickLinks, focusSection } = props as Record<string, any>
  const isBusy = Boolean(loadingKey)
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

        {attentionItems.length ? (
          <InlineNotice data-tone="warning">{attentionItems[0]}</InlineNotice>
        ) : null}
      </OpsOverview>

      <WorkspaceShell>
        <WorkspaceColumn>
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

          <WorkspaceSection id={SECTION_IDS.execution} data-ops-section="execution">
            <SectionHeading>
              <SectionTitleBlock>
                <h2>정리와 보안</h2>
              </SectionTitleBlock>
            </SectionHeading>

            <ExecutionLayout>
              <ExecutionMain>
                <DiagnosticsTabs role="tablist" aria-label="정리와 보안 도메인">
                  {([
                    { key: "cleanup", label: "파일 정리 진단" },
                    { key: "auth", label: "인증 보안 기록" },
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

                {activeDiagnosticTab === "cleanup" ? (
                  <DiagnosticPanel>
                    <DiagnosticHeader>
                      <div>
                        <strong>파일 정리 진단</strong>
                      </div>
                      <ActionRow>
                        {hasCleanupDiagnostics ? <FreshnessBadge data-tone={cleanupFreshness.tone}>{cleanupFreshness.label}</FreshnessBadge> : null}
                        <QuietButton type="button" disabled={isBusy} onClick={() => void fetchCleanupDiagnostics()}>
                          다시 확인
                        </QuietButton>
                      </ActionRow>
                    </DiagnosticHeader>

                    {!!cleanupDiagnosticsError && <InlineNotice data-tone="danger">{cleanupDiagnosticsError}</InlineNotice>}
                    {cleanupDiagnostics ? (
                      <>
                        <MetricGrid>
                          <MetricCard>
                            <small>TEMP</small>
                            <strong>{cleanupDiagnostics.tempCount}</strong>
                          </MetricCard>
                          <MetricCard>
                            <small>PENDING_DELETE</small>
                            <strong>{cleanupDiagnostics.pendingDeleteCount}</strong>
                          </MetricCard>
                          <MetricCard>
                            <small>purge 후보</small>
                            <strong>{cleanupDiagnostics.eligibleForPurgeCount}</strong>
                          </MetricCard>
                          <MetricCard>
                            <small>threshold</small>
                            <strong>{cleanupDiagnostics.cleanupSafetyThreshold}</strong>
                          </MetricCard>
                        </MetricGrid>

                        {!!cleanupDiagnostics.sampleEligibleObjectKeys.length && (
                          <DetailsPanel>
                            <DetailsSummary>
                              <span>샘플 object key</span>
                              <small>{cleanupDiagnostics.sampleEligibleObjectKeys.length}개</small>
                            </DetailsSummary>
                            <CompactCodeList>
                              {cleanupDiagnostics.sampleEligibleObjectKeys.map((key: string) => (
                                <code key={key}>{key}</code>
                              ))}
                            </CompactCodeList>
                          </DetailsPanel>
                        )}
                      </>
                    ) : (
                      <CalmMessage>{isCleanupLoading ? "로딩 중" : "없음"}</CalmMessage>
                    )}
                  </DiagnosticPanel>
                ) : null}

                {activeDiagnosticTab === "auth" ? (
                  <DiagnosticPanel>
                    <DiagnosticHeader>
                      <div>
                        <strong>인증 보안 기록</strong>
                      </div>
                      <ActionRow>
                        {hasAuthDiagnostics ? <FreshnessBadge data-tone={authFreshness.tone}>{authFreshness.label}</FreshnessBadge> : null}
                        <QuietButton type="button" disabled={isBusy} onClick={() => void fetchAuthSecurityEvents()}>
                          다시 확인
                        </QuietButton>
                      </ActionRow>
                    </DiagnosticHeader>

                    {!!authSecurityEventsError && <InlineNotice data-tone="danger">{authSecurityEventsError}</InlineNotice>}

                    {!hasAuthDiagnostics ? (
                      <CalmMessage>{isAuthLoading ? "로딩 중" : "없음"}</CalmMessage>
                    ) : authSecurityEvents.length > 0 ? (
                      <CompactList>
                        {authSecurityEvents.map((event: any) => (
                          <CompactListItem key={event.id}>
                            <div>
                              <strong>{event.eventType}</strong>
                              <span>
                                memberId {event.memberId ?? "-"} · {event.loginIdentifier || "식별자 없음"}
                              </span>
                            </div>
                            <div>
                              <small>{formatInstant(event.createdAt)}</small>
                              <small>{event.reason || event.requestPath || "사유 없음"}</small>
                            </div>
                          </CompactListItem>
                        ))}
                      </CompactList>
                    ) : authSecurityEventsError ? null : (
                      <CalmMessage>없음</CalmMessage>
                    )}
                  </DiagnosticPanel>
                ) : null}

                <DetailsPanel open={advancedToolsOpen}>
                  <DetailsSummary onClick={(event) => {
                    event.preventDefault()
                    setAdvancedToolsOpen((prev: boolean) => !prev)
                  }}>
                    <span>고급 도구</span>
                    <small>{advancedToolsOpen ? "접기" : "열기"}</small>
                  </DetailsSummary>
                  {advancedToolsOpen ? (
                    <ActionList>
                      <ActionRowButton type="button" disabled={isBusy} onClick={() => void fetchSignupMailDiagnostics(true)}>
                        <span>SMTP 연결 확인</span>
                      </ActionRowButton>
                    </ActionList>
                  ) : null}
                </DetailsPanel>

                <DetailsPanel open={isMutationExpanded}>
                  <DetailsSummary
                    onClick={(event) => {
                      event.preventDefault()
                      setIsMutationExpanded((prev: boolean) => !prev)
                    }}
                  >
                    <span>실데이터 테스트</span>
                    <small>{isMutationExpanded ? "접기" : "열기"}</small>
                  </DetailsSummary>
                  {isMutationExpanded ? (
                    <DangerPanel>
                      <InlineNotice data-tone="danger">이 영역의 실행은 실제 데이터에 영향을 줍니다. 운영 데이터 확인 후 진행하세요.</InlineNotice>

                      <SubtleMetaGrid>
                        <SubtleMetaItem>
                          <span>대상 글</span>
                          <strong>#{postId || "-"}</strong>
                        </SubtleMetaItem>
                        <SubtleMetaItem>
                          <span>대상 댓글</span>
                          <strong>{commentId ? `#${commentId}` : "미지정"}</strong>
                        </SubtleMetaItem>
                      </SubtleMetaGrid>

                      <FieldGrid>
                        <FieldBox>
                          <FieldLabel htmlFor="comment-post-id">대상 글</FieldLabel>
                          <Input id="comment-post-id" value={postId} onChange={(event) => setPostId(event.target.value)} />
                        </FieldBox>
                        <FieldBox>
                          <FieldLabel htmlFor="comment-id">대상 댓글</FieldLabel>
                          <Input id="comment-id" value={commentId} onChange={(event) => setCommentId(event.target.value)} />
                        </FieldBox>
                        <FieldBox className="wide">
                          <FieldLabel htmlFor="comment-content">내용</FieldLabel>
                          <TextArea
                            id="comment-content"
                            value={commentContent}
                            placeholder="테스트할 댓글 내용을 입력하세요"
                            onChange={(event) => setCommentContent(event.target.value)}
                          />
                        </FieldBox>
                      </FieldGrid>

                      <SandboxSection>
                        <SandboxHeader>
                          <h3>읽기 전용 확인</h3>
                        </SandboxHeader>
                        <ActionList>
                          <ActionRowButton
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void executeAction("commentList", () => {
                                const targetPostId = parsePositiveInt(postId, "대상 글")
                                return apiFetch(`/post/api/v1/posts/${targetPostId}/comments`)
                              })
                            }
                          >
                            <span>댓글 목록 조회</span>
                          </ActionRowButton>
                          <ActionRowButton
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void executeAction("commentOne", () => {
                                const targetPostId = parsePositiveInt(postId, "대상 글")
                                const targetCommentId = parsePositiveInt(commentId, "대상 댓글")
                                return apiFetch(`/post/api/v1/posts/${targetPostId}/comments/${targetCommentId}`)
                              })
                            }
                          >
                            <span>댓글 상세 조회</span>
                          </ActionRowButton>
                        </ActionList>
                      </SandboxSection>

                      <SandboxSection>
                        <SandboxHeader>
                          <h3>변경 실행</h3>
                          <ActionToneBadge data-tone="write">실행 가능</ActionToneBadge>
                        </SandboxHeader>
                        <ActionList>
                          <ActionRowButton
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void executeAction("commentWrite", async () => {
                                const targetPostId = parsePositiveInt(postId, "대상 글")
                                const content = requireCommentContent()
                                const response = await apiFetch<ApiRsData<{ id?: number }>>(`/post/api/v1/posts/${targetPostId}/comments`, {
                                  method: "POST",
                                  body: JSON.stringify({ content }),
                                })
                                const createdCommentId = response.data?.id
                                if (typeof createdCommentId === "number") setCommentId(String(createdCommentId))
                                return response
                              })
                            }
                          >
                            <span>댓글 생성</span>
                          </ActionRowButton>
                          <ActionRowButton
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void executeAction("commentModify", () => {
                                const targetPostId = parsePositiveInt(postId, "대상 글")
                                const targetCommentId = parsePositiveInt(commentId, "대상 댓글")
                                const content = requireCommentContent()
                                return apiFetch(`/post/api/v1/posts/${targetPostId}/comments/${targetCommentId}`, {
                                  method: "PUT",
                                  body: JSON.stringify({ content }),
                                })
                              })
                            }
                          >
                            <span>댓글 수정</span>
                          </ActionRowButton>
                        </ActionList>
                      </SandboxSection>

                      <DangerActionRow>
                        <ConfirmDeleteRow>
                          <input
                            id="confirm-comment-delete"
                            type="checkbox"
                            checked={confirmDelete}
                            onChange={(event) => setConfirmDelete(event.target.checked)}
                          />
                          <label htmlFor="confirm-comment-delete">삭제 전 대상 댓글을 다시 확인했습니다.</label>
                        </ConfirmDeleteRow>
                        <DangerButton
                          type="button"
                          disabled={isBusy || !confirmDelete || !commentId.trim()}
                          onClick={() =>
                            void executeAction("commentDelete", () => {
                              const targetPostId = parsePositiveInt(postId, "대상 글")
                              const targetCommentId = parsePositiveInt(commentId, "대상 댓글")
                              return apiFetch(`/post/api/v1/posts/${targetPostId}/comments/${targetCommentId}`, {
                                method: "DELETE",
                              })
                            }).then(() => setConfirmDelete(false))
                          }
                        >
                          댓글 삭제
                        </DangerButton>
                      </DangerActionRow>
                    </DangerPanel>
                  ) : null}
                </DetailsPanel>
              </ExecutionMain>

              <AdminToolsExecutionRail
                isBusy={isBusy}
                mailTestNotice={mailTestNotice}
                onFocusSection={focusSection}
                onPostCountCheck={() => void executeAction("admPostCount", () => apiFetch("/post/api/v1/adm/posts/count"))}
                onSendSignupTestMail={() => void sendSignupTestMail()}
                onSystemHealthCheck={() =>
                  void executeAction("systemHealth", () => fetchSystemHealthCached(), {
                    onSuccess: () => {
                      setSystemHealthCheckedAt(new Date().toISOString())
                    },
                  })
                }
                onTestEmailChange={setTestEmail}
                testEmail={testEmail}
              />
            </ExecutionLayout>
          </WorkspaceSection>

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
