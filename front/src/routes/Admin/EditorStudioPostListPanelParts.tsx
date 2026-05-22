import AppIcon from "src/components/icons/AppIcon"
import { Button, PrimaryButton, RowActionButton, RowActionMenu } from "./EditorStudioPostListActionStyles"
import {
  DeletedBadge,
  EditorStudioPostListInlineStatus,
  EditorStudioPostListPanelShell,
  InlineActions,
  ListEmpty,
  ListHeader,
  ListHeaderActions,
  ListTable,
  ListTableWrap,
  LoadedBadge,
  MobileListCards,
  ReadOnlyHint,
  SelectionStickyBar,
  SortHeaderButton,
  TitleCell,
  VisibilityBadge,
} from "./EditorStudioPostListPanelStyles"
import { getVisibilityLabel, toVisibility } from "./editorStudioState"
import type {
  EditorStudioPostListEditorMode,
  EditorStudioPostListItem,
  EditorStudioPostListScope,
} from "./EditorStudioPostListPanel"

export type EditorStudioPostListCommands = {
  clearSelection: () => void
  copyPostDetailLink: (id: number, title: string) => void
  editPost: (row: EditorStudioPostListItem) => void
  hardDeletePost: (row: EditorStudioPostListItem) => void
  openPostDetail: (id: number) => void
  refreshList: () => void
  requestDeletePosts: (ids: number[], headline?: string) => void
  restoreDeletedPost: (row: EditorStudioPostListItem) => void
  toggleModifiedSortOrder: () => void
  togglePostSelection: (id: number) => void
  toggleSelectAllVisiblePosts: () => void
}

type HeaderProps = {
  listScope: EditorStudioPostListScope
  selectedPostCount: number
  totalCount: number
  hasVisibleRows: boolean
  isAllVisiblePostsSelected: boolean
  isLoading: boolean
  commands: EditorStudioPostListCommands
}

export const EditorStudioPostListHeader = ({
  listScope,
  selectedPostCount,
  totalCount,
  hasVisibleRows,
  isAllVisiblePostsSelected,
  isLoading,
  commands,
}: HeaderProps) => (
  <ListHeader>
    <h3>{listScope === "active" ? "관리자 글 리스트" : "삭제 글 리스트"}</h3>
    <ListHeaderActions>
      <span>{selectedPostCount > 0 ? `${selectedPostCount}개 선택` : `총 ${totalCount}건`}</span>
      {listScope === "active" ? (
        hasVisibleRows ? (
          <Button type="button" disabled={isLoading} onClick={commands.toggleSelectAllVisiblePosts}>
            {isAllVisiblePostsSelected ? "현재 목록 선택 해제" : "현재 목록 전체 선택"}
          </Button>
        ) : null
      ) : (
        <ReadOnlyHint>삭제 글은 복구 또는 영구삭제로 정리할 수 있습니다.</ReadOnlyHint>
      )}
    </ListHeaderActions>
  </ListHeader>
)

type SelectionBarProps = {
  selectedPostIds: readonly number[]
  isLoading: boolean
  commands: EditorStudioPostListCommands
}

export const EditorStudioPostListSelectionBar = ({
  selectedPostIds,
  isLoading,
  commands,
}: SelectionBarProps) => (
  <SelectionStickyBar role="status" aria-live="polite">
    <strong>{selectedPostIds.length}개 선택됨</strong>
    <div>
      <Button type="button" onClick={commands.clearSelection} disabled={isLoading}>
        선택 해제
      </Button>
      <Button
        type="button"
        data-variant="danger"
        disabled={isLoading}
        onClick={() => commands.requestDeletePosts([...selectedPostIds])}
      >
        선택 삭제
      </Button>
    </div>
  </SelectionStickyBar>
)

type EmptyStateProps = {
  listScope: EditorStudioPostListScope
  isRefreshDisabled: boolean
  commands: EditorStudioPostListCommands
}

export const EditorStudioPostListEmptyState = ({
  listScope,
  isRefreshDisabled,
  commands,
}: EmptyStateProps) => (
  <ListEmpty>
    <p>
      {listScope === "active"
        ? "목록이 없습니다. 위 조회 조건에서 목록 새로고침을 눌러 시작하세요."
        : "삭제된 글이 없습니다. 삭제 글 목록을 조회해 최신 상태를 확인하세요."}
    </p>
    <div className="actions">
      <PrimaryButton type="button" disabled={isRefreshDisabled} onClick={commands.refreshList}>
        {listScope === "active" ? "목록 새로고침" : "삭제 글 목록 조회"}
      </PrimaryButton>
    </div>
  </ListEmpty>
)

type ListRowsProps = {
  listScope: EditorStudioPostListScope
  rows: readonly EditorStudioPostListItem[]
  selectedPostIdSet: ReadonlySet<number>
  editorMode: EditorStudioPostListEditorMode
  postId: string
  isLoading: boolean
  commands: EditorStudioPostListCommands
}

type TableProps = ListRowsProps & {
  isAllVisiblePostsSelected: boolean
  modifiedSortOrder: "desc" | "asc"
}

export const EditorStudioPostListTable = ({
  listScope,
  rows,
  selectedPostIdSet,
  isAllVisiblePostsSelected,
  editorMode,
  postId,
  modifiedSortOrder,
  isLoading,
  commands,
}: TableProps) => (
  <ListTableWrap>
    <ListTable>
      <thead>
        <tr>
          {listScope === "active" ? (
            <th className="checkboxCell">
              <input
                type="checkbox"
                aria-label="현재 목록 전체 선택"
                checked={isAllVisiblePostsSelected}
                onChange={commands.toggleSelectAllVisiblePosts}
              />
            </th>
          ) : null}
          <th className="idCell">ID</th>
          <th>제목</th>
          <th className="dateCell">
            {listScope === "active" ? (
              <SortHeaderButton type="button" onClick={commands.toggleModifiedSortOrder}>
                수정일 {modifiedSortOrder === "desc" ? "↓" : "↑"}
              </SortHeaderButton>
            ) : (
              "삭제일"
            )}
          </th>
          <th className="actionsCell">작업</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const isLoadedRow = listScope === "active" && editorMode === "edit" && postId.trim() === String(row.id)
          return (
            <tr key={row.id} data-active={isLoadedRow}>
              {listScope === "active" ? (
                <td className="checkboxCell">
                  <input
                    type="checkbox"
                    aria-label={`${row.id}번 글 선택`}
                    checked={selectedPostIdSet.has(row.id)}
                    onChange={() => commands.togglePostSelection(row.id)}
                  />
                </td>
              ) : null}
              <td className="idCell">{row.id}</td>
              <td className="title">
                <TitleCell>
                  <div className="titleMain">
                    <span className="text">{row.title}</span>
                    {isLoadedRow ? <LoadedBadge>현재 편집 중</LoadedBadge> : null}
                    {listScope === "deleted" ? <DeletedBadge>삭제됨</DeletedBadge> : null}
                    <VisibilityBadge className="inlineVisibility" data-tone={toVisibility(row.published, row.listed)}>
                      {getVisibilityLabel(row.published, row.listed)}
                    </VisibilityBadge>
                  </div>
                  <span className="meta">{row.authorName || "작성자 미상"}</span>
                </TitleCell>
              </td>
              <td className="dateCell">{(listScope === "deleted" ? row.deletedAt : row.modifiedAt)?.slice(0, 10) || "-"}</td>
              <td className="actionsCell">
                <InlineActions>
                  <PostRowActions
                    row={row}
                    listScope={listScope}
                    isLoadedRow={isLoadedRow}
                    isLoading={isLoading}
                    commands={commands}
                  />
                </InlineActions>
              </td>
            </tr>
          )
        })}
      </tbody>
    </ListTable>
  </ListTableWrap>
)

export const EditorStudioPostListMobileCards = ({
  listScope,
  rows,
  selectedPostIdSet,
  editorMode,
  postId,
  isLoading,
  commands,
}: ListRowsProps) => (
  <MobileListCards>
    {rows.map((row) => {
      const isLoadedRow = listScope === "active" && editorMode === "edit" && postId.trim() === String(row.id)
      return (
        <article key={`mobile-${row.id}`} data-active={isLoadedRow}>
          <header>
            <div className="metaLeading">
              {listScope === "active" ? (
                <input
                  type="checkbox"
                  aria-label={`${row.id}번 글 선택`}
                  checked={selectedPostIdSet.has(row.id)}
                  onChange={() => commands.togglePostSelection(row.id)}
                />
              ) : null}
              <span className="rowId">#{row.id}</span>
            </div>
            {isLoadedRow ? <LoadedBadge>현재 편집 중</LoadedBadge> : null}
          </header>
          <h4>{row.title}</h4>
          <p className="metaLine">
            <span>
              {row.authorName}
              <span className="dot">•</span>
              {(listScope === "deleted" ? row.deletedAt : row.modifiedAt)?.slice(0, 10) || "-"}
            </span>
            <VisibilityBadge data-tone={toVisibility(row.published, row.listed)}>
              {getVisibilityLabel(row.published, row.listed)}
            </VisibilityBadge>
          </p>
          <div className="mainAction">
            <PostRowActions
              row={row}
              listScope={listScope}
              isLoadedRow={isLoadedRow}
              isLoading={isLoading}
              commands={commands}
            />
          </div>
        </article>
      )
    })}
  </MobileListCards>
)

type PostRowActionsProps = {
  row: EditorStudioPostListItem
  listScope: EditorStudioPostListScope
  isLoadedRow: boolean
  isLoading: boolean
  commands: EditorStudioPostListCommands
}

const PostRowActions = ({ row, listScope, isLoadedRow, isLoading, commands }: PostRowActionsProps) =>
  listScope === "active" ? (
    <>
      <RowActionButton type="button" data-variant="primary" disabled={isLoading} onClick={() => commands.editPost(row)}>
        <AppIcon name="edit" />
        <span>{isLoadedRow ? "계속 편집" : "편집"}</span>
      </RowActionButton>
      <RowActionMenu>
        <summary>
          <span>더보기</span>
          <AppIcon name="chevron-down" />
        </summary>
        <div className="menu">
          <button type="button" disabled={isLoading} onClick={() => commands.openPostDetail(row.id)}>
            상세 열기
          </button>
          <button type="button" disabled={isLoading} onClick={() => commands.copyPostDetailLink(row.id, row.title)}>
            링크 복사
          </button>
          <button type="button" disabled={isLoading} onClick={() => commands.requestDeletePosts([row.id], row.title)}>
            삭제
          </button>
        </div>
      </RowActionMenu>
    </>
  ) : (
    <>
      <RowActionButton type="button" data-variant="primary" disabled={isLoading} onClick={() => commands.restoreDeletedPost(row)}>
        <AppIcon name="check-circle" />
        <span>복구</span>
      </RowActionButton>
      <RowActionMenu>
        <summary>
          <span>더보기</span>
          <AppIcon name="chevron-down" />
        </summary>
        <div className="menu">
          <button type="button" disabled={isLoading} onClick={() => commands.hardDeletePost(row)}>
            영구삭제
          </button>
        </div>
      </RowActionMenu>
    </>
  )

export { EditorStudioPostListInlineStatus, EditorStudioPostListPanelShell } from "./EditorStudioPostListPanelStyles"

