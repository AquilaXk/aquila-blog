import AdminShell from "./AdminShell"
import { AdminPostsWorkspaceFeedbackLayer } from "./AdminPostsWorkspaceFeedbackLayer"
import { AdminPostsWorkspaceFilterToolbar } from "./AdminPostsWorkspaceFilterToolbar"
import { AdminPostsWorkspaceList } from "./AdminPostsWorkspaceList"
import { DEFAULT_PAGE, formatDateTime } from "./AdminPostsWorkspaceModel"
import { AdminPostsWorkspaceRecentWork } from "./AdminPostsWorkspaceRecentWork"
import {
  DeferredPanelPlaceholder,
  GhostButton,
  HeroSection,
  ListMeta,
  ListSection,
  Main,
  MutedText,
  PostsHeroCopy,
  PrimaryCta,
  RecentActionList,
  RecentActionPanel,
  SectionHeading,
  WorkspaceBody,
  WorkspaceMain,
} from "./AdminPostsWorkspacePageSections"
import { AdminWorkspaceHeroActions, AdminWorkspaceHeroLayout } from "./AdminSurfacePrimitives"

export const AdminPostsWorkspacePageView = (props: Record<string, any>) => {
  const {
    confirmState,
    continueSectionRef,
    copyPostDetailLink,
    handleConfirmAction,
    handleContinueRecent,
    handleDeletePost,
    handleHardDeletePost,
    handleResetListFilters,
    handleRestorePost,
    handleToastAction,
    hasListFilters,
    isAdvancedOpen,
    isListLoading,
    isRecentLoading,
    isStickyToolbarCompact,
    listError,
    listKw,
    listPage,
    listPageSize,
    listScope,
    listSectionRef,
    listSort,
    listState,
    listSummaryParts,
    loadList,
    loadRecentPosts,
    localDraft,
    mutationPending,
    openCanonicalPost,
    openWriteRoute,
    recentActions,
    recentError,
    recentPosts,
    sessionMember,
    setConfirmState,
    setIsAdvancedOpen,
    setIsStickyToolbarCompact,
    setListKw,
    setListPage,
    setListPageSize,
    setListScope,
    setListSort,
    setToast,
    shouldRenderMobileList,
    showDeferredSupportPanels,
    toast,
  } = props

  return (
    <AdminShell currentSection="posts" member={sessionMember}>
      <Main>
        <HeroSection>
          <AdminWorkspaceHeroLayout>
            <PostsHeroCopy>
              <h1>편집과 검수를 한 화면에서 이어갑니다</h1>
            </PostsHeroCopy>
            <AdminWorkspaceHeroActions>
              <PrimaryCta type="button" onClick={() => void openWriteRoute()}>
                새 글 작성
              </PrimaryCta>
            </AdminWorkspaceHeroActions>
          </AdminWorkspaceHeroLayout>
        </HeroSection>

        <WorkspaceBody>
          <WorkspaceMain>
            <ListSection ref={listSectionRef}>
              <SectionHeading>
                <div>
                  <h2>글 목록</h2>
                </div>
                <ListMeta>
                  <GhostButton type="button" onClick={() => void Promise.all([loadList(), loadRecentPosts()])}>
                    새로고침
                  </GhostButton>
                </ListMeta>
              </SectionHeading>

              <AdminPostsWorkspaceFilterToolbar
                listScope={listScope}
                listKw={listKw}
                listPage={listPage}
                listPageSize={listPageSize}
                listSort={listSort}
                listState={listState}
                isAdvancedOpen={isAdvancedOpen}
                isStickyToolbarCompact={isStickyToolbarCompact}
                hasListFilters={hasListFilters}
                listSummaryParts={listSummaryParts}
                onScopeChange={setListScope}
                onKeywordChange={(value) => {
                  setListPage(DEFAULT_PAGE)
                  setListKw(value)
                }}
                onPageChange={setListPage}
                onPageSizeChange={setListPageSize}
                onSortChange={setListSort}
                onAdvancedToggle={() => setIsAdvancedOpen((prev: boolean) => !prev)}
                onCompactToggle={() => setIsStickyToolbarCompact((prev: boolean) => !prev)}
                onResetFilters={handleResetListFilters}
              />

              <AdminPostsWorkspaceList
                listScope={listScope}
                listKw={listKw}
                listState={listState}
                isListLoading={isListLoading}
                listError={listError}
                shouldRenderMobileList={shouldRenderMobileList}
                mutationPending={mutationPending}
                onLoadList={() => void loadList()}
                onOpenWriteRoute={(query) => void openWriteRoute(query)}
                onResetSearch={() => {
                  setListKw("")
                  setListPage(DEFAULT_PAGE)
                }}
                onContinueRecent={(row) => void handleContinueRecent(row)}
                onCopyPostDetailLink={(row) => void copyPostDetailLink(row)}
                onOpenCanonicalPost={(event, row) => void openCanonicalPost(event, row)}
                onDeletePost={(row) => void handleDeletePost(row)}
                onRestorePost={(row) => void handleRestorePost(row)}
                onHardDeletePost={(row) => void handleHardDeletePost(row)}
              />

              {showDeferredSupportPanels ? (
                <RecentActionPanel aria-live="polite">
                  <div className="panelHead">
                    <strong>작업 기록</strong>
                  </div>
                  {recentActions.length > 0 ? (
                    <RecentActionList>
                      {recentActions.map((entry: any) => (
                        <li key={entry.id} data-tone={entry.tone}>
                          <div className="copy">
                            <div className="headline">
                              <strong>{entry.label}</strong>
                              <span className="stateLabel">{entry.stateLabel}</span>
                            </div>
                            <p>{entry.detail}</p>
                          </div>
                          <span className="time">{formatDateTime(entry.occurredAt)}</span>
                        </li>
                      ))}
                    </RecentActionList>
                  ) : (
                    <MutedText>아직 기록된 작업이 없습니다. 삭제, 복구, 영구삭제 결과가 여기에 쌓입니다.</MutedText>
                  )}
                </RecentActionPanel>
              ) : (
                <DeferredPanelPlaceholder data-size="activity">
                  <strong>작업 기록 준비 중</strong>
                  <span>목록이 안정된 뒤 최근 변경 이력을 이어서 불러옵니다.</span>
                </DeferredPanelPlaceholder>
              )}
            </ListSection>

            <div ref={continueSectionRef}>
              <AdminPostsWorkspaceRecentWork
                localDraft={localDraft}
                recentPosts={recentPosts}
                isRecentLoading={isRecentLoading}
                recentError={recentError}
                showDeferredSupportPanels={showDeferredSupportPanels}
                onOpenWriteRoute={(query) => void openWriteRoute(query)}
                onContinueRecent={(row) => void handleContinueRecent(row)}
              />
            </div>
          </WorkspaceMain>
        </WorkspaceBody>

        <AdminPostsWorkspaceFeedbackLayer
          toast={toast}
          confirmState={confirmState}
          onToastAction={() => void handleToastAction()}
          onToastDismiss={() => setToast(null)}
          onConfirmCancel={() => setConfirmState(null)}
          onConfirmAction={() => void handleConfirmAction()}
        />
      </Main>
    </AdminShell>
  )
}
