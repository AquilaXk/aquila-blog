import styled from "@emotion/styled"
import type { ChangeEvent } from "react"
import type { EditorMode, PostVisibility } from "./editorStudioState"
import { EditorStudioMobileStepNavigator } from "./EditorStudioMobileStepNavigator"
import { EditorStudioPostListPanel } from "./EditorStudioPostListPanel"
import type { EditorStudioPostListItem } from "./EditorStudioPostListPanel"
import { EditorStudioPostQueryPanel } from "./EditorStudioPostQueryPanel"
import { EditorStudioSelectedPostPanel } from "./EditorStudioSelectedPostPanel"
import { EditorStudioSelectedPostToolsPanel } from "./EditorStudioSelectedPostToolsPanel"
import { EditorStudioUndoToast } from "./EditorStudioUndoToast"

type NoticeTone = "idle" | "loading" | "success" | "error"
type ManageMobileStudioStep = "query" | "list"
type MobileStudioStep = "query" | "list" | "edit" | "publish"
type PostListScope = "active" | "deleted"
type ListQuickPreset = "none" | "today" | "temp"

type NoticeState = {
  tone: NoticeTone
  text: string
}

type ListSortOption = {
  value: string
  label: string
}

type EditorStudioContentWorkspaceProps = {
  shouldShowGlobalNotice: boolean
  globalNotice: NoticeState
  mobileStudioSurfaceSteps: readonly MobileStudioStep[]
  activeMobileStudioStep: MobileStudioStep
  mobileStudioStepLabels: Record<MobileStudioStep, string>
  mobileStudioStepDescriptions: Record<MobileStudioStep, string>
  mobileStudioPrevStep: MobileStudioStep | null
  mobileStudioNextStep: MobileStudioStep | null
  mobileStudioPrevStepLabel: string
  mobileStudioNextStepLabel: string
  isCompactMobileLayout: boolean
  onMobileStepChange: (step: MobileStudioStep) => void
  listScope: PostListScope
  listKeyword: string
  listQuickPreset: ListQuickPreset
  hasListFiltersApplied: boolean
  isListAdvancedOpen: boolean
  listPage: string
  listPageSize: string
  listSort: string
  listSortOptions: readonly ListSortOption[]
  isListRefreshDisabled: boolean
  isTempPostDisabled: boolean
  onListScopeChange: (scope: PostListScope) => void
  onListKeywordChange: (value: string) => void
  onRefreshList: () => void
  onLoadOrCreateTempPost: () => void
  onApplyQuickPreset: (preset: Exclude<ListQuickPreset, "none">) => void
  onResetFilters: () => void
  onToggleListAdvanced: () => void
  onListPageChange: (event: ChangeEvent<HTMLInputElement>) => void
  onListPageSizeChange: (event: ChangeEvent<HTMLInputElement>) => void
  onListSortChange: (event: ChangeEvent<HTMLSelectElement>) => void
  selectedPostIds: readonly number[]
  adminPostTotal: number
  adminPostRows: readonly EditorStudioPostListItem[]
  adminPostViewRows: readonly EditorStudioPostListItem[]
  isAllVisiblePostsSelected: boolean
  selectedPostIdSet: ReadonlySet<number>
  editorMode: EditorMode
  postId: string
  loadingKey: string
  modifiedSortOrder: "desc" | "asc"
  deletedListNotice: NoticeState
  onToggleSelectAllVisiblePosts: () => void
  onClearSelection: () => void
  onRequestDeletePosts: (ids: number[], headline?: string) => void
  onTogglePostSelection: (id: number) => void
  onToggleModifiedSortOrder: () => void
  onEditPost: (row: EditorStudioPostListItem) => void
  onOpenPostDetail: (id: number) => void
  onCopyPostDetailLink: (id: number, title: string) => void
  onRestoreDeletedPost: (row: EditorStudioPostListItem) => void
  onHardDeletePost: (row: EditorStudioPostListItem) => void
  showSelectedPanelInManageSurface: boolean
  hasSelectedManagedPost: boolean
  editorModeLabel: string
  selectedPostLabel: string
  postTitle: string
  postVersion: number | null
  isTempDraftMode: boolean
  postVisibility: PostVisibility
  currentVisibilityText: string
  isContinueEditingDisabled: boolean
  isCreateNewPostDisabled: boolean
  isDeletePostDisabled: boolean
  onContinueEditing: () => void
  onCreateNewPost: () => void
  onDeletePost: () => void
  isDirectLoadOpen: boolean
  onToggleDirectLoad: () => void
  isSelectedToolsOpen: boolean
  onToggleSelectedTools: () => void
  onPostIdChange: (postId: string) => void
  isLoadPostDisabled: boolean
  onLoadPost: () => void
  isHitPostDisabled: boolean
  onRunHitPost: () => void
  isLikePostDisabled: boolean
  onRunLikePost: () => void
  softDeleteUndoMessage: string
  isSoftDeleteUndoVisible: boolean
  isUndoDisabled: boolean
  onUndoSoftDelete: () => void
}

export const EditorStudioContentWorkspace = ({
  shouldShowGlobalNotice,
  globalNotice,
  mobileStudioSurfaceSteps,
  activeMobileStudioStep,
  mobileStudioStepLabels,
  mobileStudioStepDescriptions,
  mobileStudioPrevStep,
  mobileStudioNextStep,
  mobileStudioPrevStepLabel,
  mobileStudioNextStepLabel,
  isCompactMobileLayout,
  onMobileStepChange,
  listScope,
  listKeyword,
  listQuickPreset,
  hasListFiltersApplied,
  isListAdvancedOpen,
  listPage,
  listPageSize,
  listSort,
  listSortOptions,
  isListRefreshDisabled,
  isTempPostDisabled,
  onListScopeChange,
  onListKeywordChange,
  onRefreshList,
  onLoadOrCreateTempPost,
  onApplyQuickPreset,
  onResetFilters,
  onToggleListAdvanced,
  onListPageChange,
  onListPageSizeChange,
  onListSortChange,
  selectedPostIds,
  adminPostTotal,
  adminPostRows,
  adminPostViewRows,
  isAllVisiblePostsSelected,
  selectedPostIdSet,
  editorMode,
  postId,
  loadingKey,
  modifiedSortOrder,
  deletedListNotice,
  onToggleSelectAllVisiblePosts,
  onClearSelection,
  onRequestDeletePosts,
  onTogglePostSelection,
  onToggleModifiedSortOrder,
  onEditPost,
  onOpenPostDetail,
  onCopyPostDetailLink,
  onRestoreDeletedPost,
  onHardDeletePost,
  showSelectedPanelInManageSurface,
  hasSelectedManagedPost,
  editorModeLabel,
  selectedPostLabel,
  postTitle,
  postVersion,
  isTempDraftMode,
  postVisibility,
  currentVisibilityText,
  isContinueEditingDisabled,
  isCreateNewPostDisabled,
  isDeletePostDisabled,
  onContinueEditing,
  onCreateNewPost,
  onDeletePost,
  isDirectLoadOpen,
  onToggleDirectLoad,
  isSelectedToolsOpen,
  onToggleSelectedTools,
  onPostIdChange,
  isLoadPostDisabled,
  onLoadPost,
  isHitPostDisabled,
  onRunHitPost,
  isLikePostDisabled,
  onRunLikePost,
  softDeleteUndoMessage,
  isSoftDeleteUndoVisible,
  isUndoDisabled,
  onUndoSoftDelete,
}: EditorStudioContentWorkspaceProps) => (
  <Section id="content-studio">
    <SectionTop>
      <div>
        <h2>글 목록 관리</h2>
        <SectionDescription>조회·선택·편집만 남겨 정리에 집중합니다.</SectionDescription>
      </div>
    </SectionTop>
    {shouldShowGlobalNotice ? (
      <GlobalNoticeBar data-tone={globalNotice.tone}>{globalNotice.text}</GlobalNoticeBar>
    ) : null}
    <EditorStudioMobileStepNavigator
      steps={mobileStudioSurfaceSteps}
      activeStep={activeMobileStudioStep}
      stepLabels={mobileStudioStepLabels}
      stepDescriptions={mobileStudioStepDescriptions}
      prevStep={mobileStudioPrevStep}
      nextStep={mobileStudioNextStep}
      prevStepLabel={mobileStudioPrevStepLabel}
      nextStepLabel={mobileStudioNextStepLabel}
      isCompactMobileLayout={isCompactMobileLayout}
      onStepChange={onMobileStepChange}
    />
    <ContentStudioGrid>
      <ContentStudioLeft
        data-mobile-visible={!isCompactMobileLayout || activeMobileStudioStep === "query" || activeMobileStudioStep === "list"}
      >
        <EditorStudioPostQueryPanel
          activeMobileStep={activeMobileStudioStep as ManageMobileStudioStep}
          isCompactMobileLayout={isCompactMobileLayout}
          listScope={listScope}
          listKeyword={listKeyword}
          listQuickPreset={listQuickPreset}
          hasListFiltersApplied={hasListFiltersApplied}
          isAdvancedOpen={isListAdvancedOpen}
          listPage={listPage}
          listPageSize={listPageSize}
          listSort={listSort}
          listSortOptions={listSortOptions}
          isRefreshDisabled={isListRefreshDisabled}
          isTempPostDisabled={isTempPostDisabled}
          onListScopeChange={onListScopeChange}
          onListKeywordChange={onListKeywordChange}
          onRefreshList={onRefreshList}
          onLoadOrCreateTempPost={onLoadOrCreateTempPost}
          onApplyQuickPreset={onApplyQuickPreset}
          onResetFilters={onResetFilters}
          onToggleAdvanced={onToggleListAdvanced}
          onListPageChange={onListPageChange}
          onListPageSizeChange={onListPageSizeChange}
          onListSortChange={onListSortChange}
        />
        <EditorStudioPostListPanel
          mobileVisible={!isCompactMobileLayout || activeMobileStudioStep === "list"}
          listScope={listScope}
          selectedPostIds={selectedPostIds}
          adminPostTotal={adminPostTotal}
          adminPostRows={adminPostRows}
          adminPostViewRows={adminPostViewRows}
          isAllVisiblePostsSelected={isAllVisiblePostsSelected}
          selectedPostIdSet={selectedPostIdSet}
          editorMode={editorMode}
          postId={postId}
          loadingKey={loadingKey}
          modifiedSortOrder={modifiedSortOrder}
          deletedListNotice={deletedListNotice}
          isRefreshDisabled={isListRefreshDisabled}
          onToggleSelectAllVisiblePosts={onToggleSelectAllVisiblePosts}
          onClearSelection={onClearSelection}
          onRequestDeletePosts={onRequestDeletePosts}
          onRefreshList={onRefreshList}
          onTogglePostSelection={onTogglePostSelection}
          onToggleModifiedSortOrder={onToggleModifiedSortOrder}
          onEditPost={onEditPost}
          onOpenPostDetail={onOpenPostDetail}
          onCopyPostDetailLink={onCopyPostDetailLink}
          onRestoreDeletedPost={onRestoreDeletedPost}
          onHardDeletePost={onHardDeletePost}
        />
      </ContentStudioLeft>

      <EditorStudioSelectedPostPanel
        mobileVisible={showSelectedPanelInManageSurface}
        hasSelectedManagedPost={hasSelectedManagedPost}
        editorModeLabel={editorModeLabel}
        selectedPostLabel={selectedPostLabel}
        postTitle={postTitle}
        postId={postId}
        postVersion={postVersion}
        isTempDraftMode={isTempDraftMode}
        postVisibility={postVisibility}
        currentVisibilityText={currentVisibilityText}
        isContinueEditingDisabled={isContinueEditingDisabled}
        isCreateNewPostDisabled={isCreateNewPostDisabled}
        isDeletePostDisabled={isDeletePostDisabled}
        onContinueEditing={onContinueEditing}
        onCreateNewPost={onCreateNewPost}
        onDeletePost={onDeletePost}
        toolsPanel={
          <EditorStudioSelectedPostToolsPanel
            hasSelectedManagedPost={hasSelectedManagedPost}
            isDirectLoadOpen={isDirectLoadOpen}
            onToggleDirectLoad={onToggleDirectLoad}
            isSelectedToolsOpen={isSelectedToolsOpen}
            onToggleSelectedTools={onToggleSelectedTools}
            postId={postId}
            onPostIdChange={onPostIdChange}
            isLoadPostDisabled={isLoadPostDisabled}
            onLoadPost={onLoadPost}
            isHitPostDisabled={isHitPostDisabled}
            onRunHitPost={onRunHitPost}
            isLikePostDisabled={isLikePostDisabled}
            onRunLikePost={onRunLikePost}
          />
        }
      />
    </ContentStudioGrid>

    <EditorStudioUndoToast
      isVisible={isSoftDeleteUndoVisible}
      message={softDeleteUndoMessage}
      isUndoDisabled={isUndoDisabled}
      onUndo={onUndoSoftDelete}
    />
  </Section>
)

const Section = styled.section`
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 14px;
  padding: 0.96rem;
  margin-bottom: 1.05rem;
  background: ${({ theme }) => theme.colors.gray2};
  box-shadow: none;

  h2 {
    margin: 0;
    font-size: 1.2rem;
    color: ${({ theme }) => theme.colors.gray12};
  }

  @media (max-width: 420px) {
    border-radius: 12px;
    padding: 0.74rem;
    margin-bottom: 0.95rem;
  }
`

const SectionTop = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.95rem;
`

const SectionDescription = styled.p`
  margin: 0.22rem 0 0;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.82rem;
  line-height: 1.5;
`

const GlobalNoticeBar = styled.div`
  margin-bottom: 0.9rem;
  padding: 0.66rem 0.78rem;
  border-radius: 10px;
  font-size: 0.84rem;
  line-height: 1.5;
  border: 1px solid ${({ theme }) => theme.colors.gray6};

  &[data-tone="idle"] {
    color: ${({ theme }) => theme.colors.gray10};
    background: ${({ theme }) => theme.colors.gray2};
    border-color: ${({ theme }) => theme.colors.gray6};
  }

  &[data-tone="loading"] {
    color: ${({ theme }) => theme.colors.blue11};
    background: ${({ theme }) => theme.colors.blue3};
    border-color: ${({ theme }) => theme.colors.blue7};
  }

  &[data-tone="success"] {
    color: ${({ theme }) => theme.colors.green11};
    background: ${({ theme }) => theme.colors.green3};
    border-color: ${({ theme }) => theme.colors.green7};
  }

  &[data-tone="error"] {
    color: ${({ theme }) => theme.colors.red11};
    background: ${({ theme }) => theme.colors.red3};
    border-color: ${({ theme }) => theme.colors.red7};
  }

  @media (max-width: 420px) {
    margin-bottom: 0.7rem;
    padding: 0.58rem 0.62rem;
    font-size: 0.8rem;
  }
`

const ContentStudioGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;
  align-items: start;

  @media (min-width: 1320px) {
    grid-template-columns: minmax(0, 1fr) minmax(320px, 360px);
  }

  @media (max-width: 720px) {
    gap: 0.76rem;
  }
`

const ContentStudioLeft = styled.div`
  display: grid;
  gap: 0.95rem;
  min-width: 0;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.gray1};
  padding: 0.9rem;
  box-shadow: none;
  overflow: hidden;

  @media (max-width: 720px) {
    padding: 0.72rem;
    gap: 0.8rem;
  }

  @media (max-width: 720px) {
    &[data-mobile-visible="false"] {
      display: none;
    }
  }
`
