import { apiFetch } from "src/apis/backend/client"
import AdminToolsExecutionRail from "src/routes/Admin/AdminToolsExecutionRail"
import {
  ActionList,
  ActionRow,
  ActionRowButton,
  ActionToneBadge,
  CalmMessage,
  CompactCodeList,
  CompactList,
  CompactListItem,
  ConfirmDeleteRow,
  DangerActionRow,
  DangerButton,
  DangerPanel,
  DetailsPanel,
  DetailsSummary,
  DiagnosticHeader,
  DiagnosticPanel,
  DiagnosticsTabButton,
  DiagnosticsTabs,
  ExecutionLayout,
  ExecutionMain,
  FieldBox,
  FieldGrid,
  FieldLabel,
  FreshnessBadge,
  InlineNotice,
  Input,
  MetricCard,
  MetricGrid,
  QuietButton,
  SandboxHeader,
  SandboxSection,
  SectionHeading,
  SectionTitleBlock,
  SubtleMetaGrid,
  SubtleMetaItem,
  TextArea,
  WorkspaceSection,
} from "src/routes/Admin/AdminToolsWorkspace.styles"
import { SECTION_IDS, formatInstant } from "src/routes/Admin/AdminToolsWorkspaceModel"
import type { ApiRsData } from "src/routes/Admin/AdminToolsWorkspacePageState"

export const AdminToolsExecutionSection = (props: Record<string, any>) => {
  const {
    activeDiagnosticTab,
    advancedToolsOpen,
    authFreshness,
    authSecurityEvents,
    authSecurityEventsError,
    cleanupDiagnostics,
    cleanupDiagnosticsError,
    cleanupFreshness,
    commentContent,
    commentId,
    confirmDelete,
    executeAction,
    fetchAuthSecurityEvents,
    fetchCleanupDiagnostics,
    fetchSignupMailDiagnostics,
    fetchSystemHealthCached,
    hasAuthDiagnostics,
    hasCleanupDiagnostics,
    isAuthLoading,
    isBusy,
    isCleanupLoading,
    isMutationExpanded,
    mailTestNotice,
    parsePositiveInt,
    postId,
    requireCommentContent,
    sendSignupTestMail,
    setActiveDiagnosticTab,
    setAdvancedToolsOpen,
    setCommentContent,
    setCommentId,
    setConfirmDelete,
    setIsMutationExpanded,
    setPostId,
    setSystemHealthCheckedAt,
    setTestEmail,
    testEmail,
    focusSection,
  } = props

  return (
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
  )
}
