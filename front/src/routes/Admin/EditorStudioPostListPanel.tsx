import styled from "@emotion/styled"
import AppIcon from "src/components/icons/AppIcon"
import { getVisibilityLabel, toVisibility } from "./editorStudioState"

type PostListScope = "active" | "deleted"
type EditorMode = "create" | "edit"
type NoticeTone = "idle" | "loading" | "success" | "error"

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

type Props = {
  mobileVisible: boolean
  listScope: PostListScope
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
  deletedListNotice: {
    tone: NoticeTone
    text: string
  }
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

  return (
    <ListPanel data-mobile-visible={mobileVisible}>
      <ListHeader>
        <h3>{listScope === "active" ? "관리자 글 리스트" : "삭제 글 리스트"}</h3>
        <ListHeaderActions>
          <span>{selectedPostIds.length > 0 ? `${selectedPostIds.length}개 선택` : `총 ${adminPostTotal}건`}</span>
          {listScope === "active" ? (
            adminPostViewRows.length > 0 ? (
              <Button type="button" disabled={isLoading} onClick={onToggleSelectAllVisiblePosts}>
                {isAllVisiblePostsSelected ? "현재 목록 선택 해제" : "현재 목록 전체 선택"}
              </Button>
            ) : null
          ) : (
            <ReadOnlyHint>삭제 글은 복구 또는 영구삭제로 정리할 수 있습니다.</ReadOnlyHint>
          )}
        </ListHeaderActions>
      </ListHeader>

      {listScope === "active" && selectedPostIds.length > 0 ? (
        <SelectionStickyBar role="status" aria-live="polite">
          <strong>{selectedPostIds.length}개 선택됨</strong>
          <div>
            <Button type="button" onClick={onClearSelection} disabled={isLoading}>
              선택 해제
            </Button>
            <Button
              type="button"
              data-variant="danger"
              disabled={isLoading}
              onClick={() => onRequestDeletePosts([...selectedPostIds])}
            >
              선택 삭제
            </Button>
          </div>
        </SelectionStickyBar>
      ) : null}

      {adminPostRows.length === 0 ? (
        <ListEmpty>
          <p>
            {listScope === "active"
              ? "목록이 없습니다. 위 조회 조건에서 목록 새로고침을 눌러 시작하세요."
              : "삭제된 글이 없습니다. 삭제 글 목록을 조회해 최신 상태를 확인하세요."}
          </p>
          <div className="actions">
            <PrimaryButton type="button" disabled={isRefreshDisabled} onClick={onRefreshList}>
              {listScope === "active" ? "목록 새로고침" : "삭제 글 목록 조회"}
            </PrimaryButton>
          </div>
        </ListEmpty>
      ) : (
        <>
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
                        onChange={onToggleSelectAllVisiblePosts}
                      />
                    </th>
                  ) : null}
                  <th className="idCell">ID</th>
                  <th>제목</th>
                  <th className="dateCell">
                    {listScope === "active" ? (
                      <SortHeaderButton type="button" onClick={onToggleModifiedSortOrder}>
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
                {adminPostViewRows.map((row) => {
                  const isLoadedRow = listScope === "active" && editorMode === "edit" && postId.trim() === String(row.id)
                  return (
                    <tr key={row.id} data-active={isLoadedRow}>
                      {listScope === "active" ? (
                        <td className="checkboxCell">
                          <input
                            type="checkbox"
                            aria-label={`${row.id}번 글 선택`}
                            checked={selectedPostIdSet.has(row.id)}
                            onChange={() => onTogglePostSelection(row.id)}
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
                            onEditPost={onEditPost}
                            onOpenPostDetail={onOpenPostDetail}
                            onCopyPostDetailLink={onCopyPostDetailLink}
                            onRequestDeletePosts={onRequestDeletePosts}
                            onRestoreDeletedPost={onRestoreDeletedPost}
                            onHardDeletePost={onHardDeletePost}
                          />
                        </InlineActions>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </ListTable>
          </ListTableWrap>

          <MobileListCards>
            {adminPostViewRows.map((row) => {
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
                          onChange={() => onTogglePostSelection(row.id)}
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
                      onEditPost={onEditPost}
                      onOpenPostDetail={onOpenPostDetail}
                      onCopyPostDetailLink={onCopyPostDetailLink}
                      onRequestDeletePosts={onRequestDeletePosts}
                      onRestoreDeletedPost={onRestoreDeletedPost}
                      onHardDeletePost={onHardDeletePost}
                    />
                  </div>
                </article>
              )
            })}
          </MobileListCards>
        </>
      )}

      {listScope === "deleted" && deletedListNotice.text ? (
        <InlineStatus data-tone={deletedListNotice.tone}>{deletedListNotice.text}</InlineStatus>
      ) : null}
    </ListPanel>
  )
}

type PostRowActionsProps = {
  row: EditorStudioPostListItem
  listScope: PostListScope
  isLoadedRow: boolean
  isLoading: boolean
  onEditPost: (row: EditorStudioPostListItem) => void
  onOpenPostDetail: (id: number) => void
  onCopyPostDetailLink: (id: number, title: string) => void
  onRequestDeletePosts: (ids: number[], headline?: string) => void
  onRestoreDeletedPost: (row: EditorStudioPostListItem) => void
  onHardDeletePost: (row: EditorStudioPostListItem) => void
}

const PostRowActions = ({
  row,
  listScope,
  isLoadedRow,
  isLoading,
  onEditPost,
  onOpenPostDetail,
  onCopyPostDetailLink,
  onRequestDeletePosts,
  onRestoreDeletedPost,
  onHardDeletePost,
}: PostRowActionsProps) =>
  listScope === "active" ? (
    <>
      <RowActionButton type="button" data-variant="primary" disabled={isLoading} onClick={() => onEditPost(row)}>
        <AppIcon name="edit" />
        <span>{isLoadedRow ? "계속 편집" : "편집"}</span>
      </RowActionButton>
      <RowActionMenu>
        <summary>
          <span>더보기</span>
          <AppIcon name="chevron-down" />
        </summary>
        <div className="menu">
          <button type="button" disabled={isLoading} onClick={() => onOpenPostDetail(row.id)}>
            상세 열기
          </button>
          <button type="button" disabled={isLoading} onClick={() => onCopyPostDetailLink(row.id, row.title)}>
            링크 복사
          </button>
          <button type="button" disabled={isLoading} onClick={() => onRequestDeletePosts([row.id], row.title)}>
            삭제
          </button>
        </div>
      </RowActionMenu>
    </>
  ) : (
    <>
      <RowActionButton type="button" data-variant="primary" disabled={isLoading} onClick={() => onRestoreDeletedPost(row)}>
        <AppIcon name="check-circle" />
        <span>복구</span>
      </RowActionButton>
      <RowActionMenu>
        <summary>
          <span>더보기</span>
          <AppIcon name="chevron-down" />
        </summary>
        <div className="menu">
          <button type="button" disabled={isLoading} onClick={() => onHardDeletePost(row)}>
            영구삭제
          </button>
        </div>
      </RowActionMenu>
    </>
  )

const ListPanel = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.gray1};
  padding: 0.82rem;
  margin: 0;
  min-width: 0;
  display: grid;
  gap: 0.62rem;

  @media (max-width: 720px) {
    &[data-mobile-visible="false"] {
      display: none;
    }
  }
`

const ListHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.64rem;
  margin-bottom: 0.75rem;

  h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 720;
    color: ${({ theme }) => theme.colors.gray12};
  }

  span {
    font-size: 0.8rem;
    color: ${({ theme }) => theme.colors.gray11};
  }

  @media (max-width: 920px) {
    flex-direction: column;
  }
`

const ListHeaderActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: flex-end;
  align-items: center;

  span {
    display: inline-flex;
    align-items: center;
    min-height: 34px;
    padding: 0 0.72rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.8rem;
    font-weight: 700;
    white-space: nowrap;
  }

  @media (max-width: 920px) {
    justify-content: flex-start;
  }

  @media (max-width: 720px) {
    width: 100%;

    span {
      width: 100%;
      margin-right: 0;
    }

    > button {
      width: 100%;
      justify-content: center;
    }
  }
`

const ReadOnlyHint = styled.span`
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray11};
  min-height: 28px;
  padding: 0 0.58rem;
  font-size: 0.72rem;
  font-weight: 600;
`

const ListEmpty = styled.div`
  margin: 0;
  min-height: 13.5rem;
  display: grid;
  place-items: center;
  text-align: center;
  padding: 0.8rem 1rem;
  border-radius: 10px;
  border: 1px dashed ${({ theme }) => theme.colors.gray6};
  color: ${({ theme }) => theme.colors.gray11};
  gap: 0.72rem;

  p {
    margin: 0;
    font-size: 0.86rem;
    line-height: 1.65;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
  }
`

const SelectionStickyBar = styled.div`
  position: sticky;
  top: 0;
  z-index: 2;
  margin: 0 0 0.68rem;
  padding: 0.55rem 0.62rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.gray2};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.8rem;
  }

  > div {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  @media (max-width: 900px) {
    top: calc(var(--app-header-height, 56px) + 0.35rem);
  }
`

const ListTableWrap = styled.div`
  width: 100%;
  overflow-x: auto;
  overflow-y: auto;
  max-height: 52vh;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 10px;
  overscroll-behavior: contain;

  @media (max-width: 1100px) {
    display: none;
  }
`

const ListTable = styled.table`
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
  table-layout: fixed;

  th,
  td {
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
    padding: 0.5rem 0.45rem;
    text-align: left;
    font-size: 0.8rem;
    color: ${({ theme }) => theme.colors.gray12};
    vertical-align: middle;
  }

  th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: ${({ theme }) => theme.colors.gray2};
    font-size: 0.75rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-weight: 700;
  }

  tbody tr:last-of-type td {
    border-bottom: 0;
  }

  tbody tr {
    transition: background-color 0.18s ease, box-shadow 0.18s ease;
  }

  tbody tr:hover td {
    background: rgba(255, 255, 255, 0.02);
  }

  tbody tr[data-active="true"] td {
    background:
      linear-gradient(90deg, rgba(59, 130, 246, 0.14) 0, rgba(59, 130, 246, 0.04) 28px, rgba(255, 255, 255, 0.02) 28px);
  }

  .checkboxCell {
    width: 2rem;
    text-align: center;
    padding-left: 0.2rem;
    padding-right: 0.2rem;
  }

  th.idCell,
  td.idCell {
    width: 4.75rem;
    white-space: nowrap;
  }

  input[type="checkbox"] {
    width: 0.92rem;
    height: 0.92rem;
    cursor: pointer;
    accent-color: ${({ theme }) => theme.colors.blue9};
  }

  td.title {
    min-width: 0;
  }

  th.dateCell,
  td.dateCell {
    width: 112px;
    white-space: nowrap;
  }

  th.actionsCell,
  td.actionsCell {
    width: 132px;
    min-width: 132px;
  }

  @media (max-width: 1520px) {
    th.actionsCell,
    td.actionsCell {
      width: 124px;
      min-width: 124px;
    }
  }
`

const TitleCell = styled.div`
  display: grid;
  gap: 0.36rem;
  max-width: 100%;
  min-width: 0;

  .titleMain {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    flex-wrap: wrap;
  }

  .text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: ${({ theme }) => theme.colors.gray12};
    font-weight: 700;
  }

  .meta {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.72rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .inlineVisibility {
    display: inline-flex;
  }
`

const DeletedBadge = styled.span`
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.12rem 0.42rem;
  flex: 0 0 auto;
`

const LoadedBadge = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.blue7};
  background: ${({ theme }) => theme.colors.blue3};
  color: ${({ theme }) => theme.colors.blue11};
  padding: 0 0.5rem;
  font-size: 0.7rem;
  font-weight: 800;
  line-height: 1;
  flex: 0 0 auto;
`

const SortHeaderButton = styled.button`
  border: 0;
  background: transparent;
  padding: 0;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.74rem;
  font-weight: 700;
  cursor: pointer;
`

const VisibilityBadge = styled.span`
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.16rem 0.46rem;
  font-size: 0.72rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  color: ${({ theme }) => theme.colors.gray11};
  background: ${({ theme }) => theme.colors.gray2};

  &[data-tone="PRIVATE"] {
    color: ${({ theme }) => theme.colors.gray11};
  }

  &[data-tone="PUBLIC_UNLISTED"] {
    color: ${({ theme }) => theme.colors.blue11};
    border-color: ${({ theme }) => theme.colors.blue7};
    background: ${({ theme }) => theme.colors.blue3};
  }

  &[data-tone="PUBLIC_LISTED"] {
    color: ${({ theme }) => theme.colors.green11};
    border-color: ${({ theme }) => theme.colors.green7};
    background: ${({ theme }) => theme.colors.green3};
  }
`

const InlineActions = styled.div`
  display: grid;
  gap: 0.42rem;
  align-items: stretch;
`

const MobileListCards = styled.div`
  display: none;
  margin-top: 0.65rem;

  @media (max-width: 1100px) {
    display: grid;
    gap: 0.6rem;
  }

  article {
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    border-radius: 10px;
    padding: 0.62rem;
    background: ${({ theme }) => theme.colors.gray2};
    display: grid;
    gap: 0.5rem;
    content-visibility: auto;
    contain-intrinsic-size: 1px 172px;
    transition: background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
  }

  article[data-active="true"] {
    border-color: ${({ theme }) => theme.colors.blue7};
    background: ${({ theme }) => theme.colors.blue3};
    box-shadow: none;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.45rem;
  }

  .metaLeading {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }

  .metaLeading input[type="checkbox"] {
    width: 1rem;
    height: 1rem;
    accent-color: ${({ theme }) => theme.colors.gray10};
  }

  h4 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.9rem;
    line-height: 1.45;
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  p {
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
  }

  .metaLine {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.42rem;

    .dot {
      margin: 0 0.26rem;
      opacity: 0.65;
    }
  }

  .mainAction {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.42rem;
  }

  .mainAction > button {
    width: 100%;
    justify-content: center;
  }

  .rowId {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
  }

  @media (max-width: 420px) {
    gap: 0.52rem;

    article {
      padding: 0.56rem;
    }

    p {
      align-items: flex-start;
      flex-wrap: wrap;
      justify-content: flex-start;
    }

    .mainAction {
      grid-template-columns: 1fr;
    }
  }
`

const InlineStatus = styled.div`
  margin-bottom: 0.85rem;
  padding: 0.62rem 0.72rem;
  border-radius: 8px;
  font-size: 0.82rem;
  line-height: 1.5;
  width: 100%;
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;

  &[data-tone="idle"] {
    color: ${({ theme }) => theme.colors.gray11};
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
  }

  &[data-tone="loading"] {
    color: ${({ theme }) => theme.colors.blue11};
    border: 1px solid ${({ theme }) => theme.colors.blue7};
    background: ${({ theme }) => theme.colors.blue3};
  }

  &[data-tone="success"] {
    color: ${({ theme }) => theme.colors.green11};
    border: 1px solid ${({ theme }) => theme.colors.green7};
    background: ${({ theme }) => theme.colors.green3};
  }

  &[data-tone="error"] {
    color: ${({ theme }) => theme.colors.red11};
    border: 1px solid ${({ theme }) => theme.colors.red7};
    background: ${({ theme }) => theme.colors.red3};
  }
`

const Button = styled.button`
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 8px;
  padding: 0.62rem 0.92rem;
  min-height: 44px;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray10};
  cursor: pointer;
  font-size: 0.84rem;
  font-weight: 600;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;

  &[data-variant="danger"] {
    border-color: ${({ theme }) => theme.colors.red8};
    background: ${({ theme }) => theme.colors.red3};
    color: ${({ theme }) => theme.colors.red11};
  }

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.gray8};
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.blue4};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

const PrimaryButton = styled(Button)`
  border-radius: 8px;
  padding: 0.6rem 0.88rem;
  border-color: ${({ theme }) => theme.colors.blue9};
  background: ${({ theme }) => theme.colors.blue9};
  color: ${({ theme }) => theme.colors.gray1};
  font-weight: 700;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.blue10};
    background: ${({ theme }) => theme.colors.blue10};
    color: ${({ theme }) => theme.colors.gray1};
  }
`

const RowActionButton = styled(Button)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.42rem;
  width: 100%;
  min-height: 40px;
  padding: 0.42rem 0.62rem;
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;

  svg {
    flex: 0 0 auto;
  }

  span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &[data-variant="primary"] {
    border-color: ${({ theme }) => theme.colors.blue8};
    background: ${({ theme }) => theme.colors.blue3};
    color: ${({ theme }) => theme.colors.blue11};
  }

  &[data-variant="primary"]:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.blue9};
    background: ${({ theme }) => theme.colors.blue4};
    color: ${({ theme }) => theme.colors.blue12};
  }
`

const RowActionMenu = styled.details`
  position: relative;

  summary {
    list-style: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    width: 100%;
    min-height: 40px;
    border-radius: 8px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.76rem;
    font-weight: 700;
    cursor: pointer;

    &::-webkit-details-marker {
      display: none;
    }
  }

  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 0.3rem);
    z-index: 8;
    display: grid;
    min-width: 7rem;
    padding: 0.32rem;
    border-radius: 10px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    box-shadow: none;
  }

  .menu button {
    min-height: 36px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: ${({ theme }) => theme.colors.red11};
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
  }

  .menu button:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.red3};
  }

  .menu button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`
