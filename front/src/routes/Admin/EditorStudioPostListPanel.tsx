import {
  EditorStudioPostListEmptyState,
  EditorStudioPostListHeader,
  EditorStudioPostListInlineStatus,
  EditorStudioPostListMobileCards,
  EditorStudioPostListPanelShell,
  EditorStudioPostListSelectionBar,
  EditorStudioPostListTable,
  type EditorStudioPostListCommands,
} from "./EditorStudioPostListPanelParts"

export type EditorStudioPostListScope = "active" | "deleted"
export type EditorStudioPostListEditorMode = "create" | "edit"
export type EditorStudioPostListNoticeTone = "idle" | "loading" | "success" | "error"

export type EditorStudioPostListItem = {
  id: number
  title: string
  authorName: string
  published: boolean
  listed: boolean
  tempDraft?: boolean
  createdAt: string
  modifiedAt: string
  deletedAt?: string
}

export type EditorStudioPostListNoticeState = {
  tone: EditorStudioPostListNoticeTone
  text: string
}

type Props = {
  mobileVisible: boolean
  listScope: EditorStudioPostListScope
  selectedPostIds: readonly number[]
  adminPostTotal: number
  adminPostRows: readonly EditorStudioPostListItem[]
  adminPostViewRows: readonly EditorStudioPostListItem[]
  isAllVisiblePostsSelected: boolean
  selectedPostIdSet: ReadonlySet<number>
  editorMode: EditorStudioPostListEditorMode
  postId: string
  loadingKey: string
  modifiedSortOrder: "desc" | "asc"
  deletedListNotice: EditorStudioPostListNoticeState
  isRefreshDisabled: boolean
  onToggleSelectAllVisiblePosts: () => void
  onClearSelection: () => void
  onRequestDeletePosts: (ids: number[], headline?: string) => void
  onRefreshList: () => void
  onTogglePostSelection: (id: number) => void
  onToggleModifiedSortOrder: () => void
  onEditPost: (row: EditorStudioPostListItem) => void
  onOpenPostDetail: (id: number) => void
  onCopyPostDetailLink: (id: number, title: string) => void
  onRestoreDeletedPost: (row: EditorStudioPostListItem) => void
  onHardDeletePost: (row: EditorStudioPostListItem) => void
}

export const EditorStudioPostListPanel = ({
  mobileVisible,
  listScope,
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
  isRefreshDisabled,
  onToggleSelectAllVisiblePosts,
  onClearSelection,
  onRequestDeletePosts,
  onRefreshList,
  onTogglePostSelection,
  onToggleModifiedSortOrder,
  onEditPost,
  onOpenPostDetail,
  onCopyPostDetailLink,
  onRestoreDeletedPost,
  onHardDeletePost,
}: Props) => {
  const isLoading = loadingKey.length > 0
  const commands: EditorStudioPostListCommands = {
    clearSelection: onClearSelection,
    copyPostDetailLink: onCopyPostDetailLink,
    editPost: onEditPost,
    hardDeletePost: onHardDeletePost,
    openPostDetail: onOpenPostDetail,
    refreshList: onRefreshList,
    requestDeletePosts: onRequestDeletePosts,
    restoreDeletedPost: onRestoreDeletedPost,
    toggleModifiedSortOrder: onToggleModifiedSortOrder,
    togglePostSelection: onTogglePostSelection,
    toggleSelectAllVisiblePosts: onToggleSelectAllVisiblePosts,
  }

  return (
    <EditorStudioPostListPanelShell data-mobile-visible={mobileVisible}>
      <EditorStudioPostListHeader
        listScope={listScope}
        selectedPostCount={selectedPostIds.length}
        totalCount={adminPostTotal}
        hasVisibleRows={adminPostViewRows.length > 0}
        isAllVisiblePostsSelected={isAllVisiblePostsSelected}
        isLoading={isLoading}
        commands={commands}
      />

      {listScope === "active" && selectedPostIds.length > 0 ? (
        <EditorStudioPostListSelectionBar
          selectedPostIds={selectedPostIds}
          isLoading={isLoading}
          commands={commands}
        />
      ) : null}

      {adminPostRows.length === 0 ? (
        <EditorStudioPostListEmptyState
          listScope={listScope}
          isRefreshDisabled={isRefreshDisabled}
          commands={commands}
        />
      ) : (
        <>
          <EditorStudioPostListTable
            listScope={listScope}
            rows={adminPostViewRows}
            selectedPostIdSet={selectedPostIdSet}
            isAllVisiblePostsSelected={isAllVisiblePostsSelected}
            editorMode={editorMode}
            postId={postId}
            modifiedSortOrder={modifiedSortOrder}
            isLoading={isLoading}
            commands={commands}
          />
          <EditorStudioPostListMobileCards
            listScope={listScope}
            rows={adminPostViewRows}
            selectedPostIdSet={selectedPostIdSet}
            editorMode={editorMode}
            postId={postId}
            isLoading={isLoading}
            commands={commands}
          />
        </>
      )}

      {listScope === "deleted" && deletedListNotice.text ? (
        <EditorStudioPostListInlineStatus data-tone={deletedListNotice.tone}>
          {deletedListNotice.text}
        </EditorStudioPostListInlineStatus>
      ) : null}
    </EditorStudioPostListPanelShell>
  )
}
