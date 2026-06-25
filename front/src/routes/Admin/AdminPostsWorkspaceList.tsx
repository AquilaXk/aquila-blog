import {
  ActionRow,
  GhostButton,
  ListCard,
  ListEmptyState,
  ListSkeleton,
  MobileCardList,
  PageFooter,
  RowActions,
  PostsDesktopTable,
  PrimaryInlineButton,
  TitleCell,
  TitleText,
  VisibilityBadge,
} from "./AdminPostsWorkspaceList.styles"
import {
  buildRowTitle,
  formatDateTime,
  formatWorkspaceViews,
  getWorkspaceTopicLabel,
  LIST_SKELETON_ROW_COUNT,
  toVisibility,
  workspaceStatusLabel,
  type AdminPostListItem,
  type ListState,
  type PostListScope,
} from "./AdminPostsWorkspaceModel"

type AdminPostsWorkspaceListProps = {
  listScope: PostListScope
  listKw: string
  listPage: string
  listPageSize: string
  listState: ListState
  isListLoading: boolean
  listError: string
  shouldRenderMobileList: boolean
  onLoadList: () => void
  onOpenWriteRoute: (query?: Record<string, string>) => void
  onPageChange: (page: number) => void
  mutationPending: { rowId: number; kind: "delete" | "restore" | "hardDelete" } | null
  onHardDeletePost: (row: AdminPostListItem) => void
  onRestorePost: (row: AdminPostListItem) => void
  onResetSearch: () => void
}

export const AdminPostsWorkspaceList: React.FC<AdminPostsWorkspaceListProps> = ({
  listScope,
  listKw,
  listPage,
  listPageSize,
  listState,
  isListLoading,
  listError,
  shouldRenderMobileList,
  onLoadList,
  onOpenWriteRoute,
  onPageChange,
  mutationPending,
  onHardDeletePost,
  onRestorePost,
  onResetSearch,
}) => {
  const isDeletedScope = listScope === "deleted"
  const openEditorForRow = (row: AdminPostListItem) => onOpenWriteRoute({ postId: String(row.id) })
  const getStatusLabel = (row: AdminPostListItem) => (listScope === "deleted" ? "삭제됨" : workspaceStatusLabel(row))
  const getStatusTone = (row: AdminPostListItem) => (listScope === "deleted" ? "PRIVATE" : toVisibility(row.published, row.listed))
  const isRowPending = (row: AdminPostListItem, kind: "restore" | "hardDelete") =>
    mutationPending?.rowId === row.id && mutationPending.kind === kind

  if (isListLoading) {
    return (
      <ListCard aria-hidden="true">
        <ListSkeleton>
          <div className="desktopRows">
            <div className="headerRow">
              <span className="selectCell" />
              <span>Title</span>
              <span className="topicCell">Topic</span>
              <span className="statusCell">Status</span>
              <span className="dateCell">Updated</span>
              <span className="viewsCell">Views</span>
            </div>
            {Array.from({ length: LIST_SKELETON_ROW_COUNT }, (_, index) => (
              <div className="row" key={`desktop-skeleton-${index}`}>
                <div className="cell selectCell">
                  <span className="line tiny" />
                </div>
                <div className="cell titleCell">
                  <span className="line wide" />
                  <span className="line short muted" />
                </div>
                <div className="cell topicCell">
                  <span className="line short" />
                </div>
                <div className="cell statusCell">
                  <span className="line medium" />
                </div>
                <div className="cell dateCell">
                  <span className="line medium" />
                </div>
                <div className="cell viewsCell">
                  <span className="line short" />
                </div>
              </div>
            ))}
          </div>
          <div className="mobileCards">
            {Array.from({ length: 3 }, (_, index) => (
              <article key={`mobile-skeleton-${index}`}>
                <div className="metaRow">
                  <span className="line short" />
                  <span className="line short" />
                </div>
                <span className="line wide" />
                <span className="line medium muted" />
                <span className="line short muted" />
              </article>
            ))}
          </div>
        </ListSkeleton>
      </ListCard>
    )
  }

  if (listError) {
    return (
      <ListEmptyState>
        <strong>목록을 불러오지 못했습니다.</strong>
        <p>{listError}</p>
        <ActionRow>
          <PrimaryInlineButton type="button" onClick={onLoadList}>
            다시 시도
          </PrimaryInlineButton>
        </ActionRow>
      </ListEmptyState>
    )
  }

  if (listState.rows.length === 0) {
    return (
      <ListEmptyState>
        <strong>{listScope === "active" ? "아직 글이 없습니다." : "삭제된 글이 없습니다."}</strong>
        <ActionRow>
          <PrimaryInlineButton type="button" onClick={() => onOpenWriteRoute()}>
            새 글 작성
          </PrimaryInlineButton>
          {listKw.trim() ? (
            <GhostButton type="button" onClick={onResetSearch}>
              검색 초기화
            </GhostButton>
          ) : null}
        </ActionRow>
      </ListEmptyState>
    )
  }

  const currentPage = Math.max(1, Number.parseInt(listPage, 10) || 1)
  const pageSize = Math.max(1, Number.parseInt(listPageSize, 10) || 1)
  const totalPages = Math.max(currentPage, Math.ceil(listState.total / pageSize))
  const showPager = totalPages > 1

  return (
    <ListCard>
      {!shouldRenderMobileList ? (
        <PostsDesktopTable>
          <thead>
            <tr>
              <th className="selectCell"></th>
              <th>Title</th>
              <th className="topicCell">Topic</th>
              <th className="statusCell">Status</th>
              <th className="dateCell">Updated</th>
              <th className="viewsCell">{isDeletedScope ? "Actions" : "Views"}</th>
            </tr>
          </thead>
          <tbody>
            {listState.rows.map((row) => (
              <tr
                key={row.id}
                tabIndex={isDeletedScope ? undefined : 0}
                role={isDeletedScope ? undefined : "button"}
                onClick={isDeletedScope ? undefined : () => openEditorForRow(row)}
                onKeyDown={
                  isDeletedScope
                    ? undefined
                    : (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault()
                          openEditorForRow(row)
                        }
                      }
                }
              >
                <td className="selectCell">
                  <span className="check" aria-hidden="true" />
                </td>
                <td>
                  <TitleCell>
                    <TitleText>{buildRowTitle(row)}</TitleText>
                    <div className="metaRow">
                      <span>ID #{row.id}</span>
                    </div>
                  </TitleCell>
                </td>
                <td className="topicCell">{getWorkspaceTopicLabel(row)}</td>
                <td className="statusCell">
                  <VisibilityBadge data-tone={getStatusTone(row)}>{getStatusLabel(row)}</VisibilityBadge>
                </td>
                <td className="dateCell">{formatDateTime(listScope === "active" ? row.modifiedAt : row.deletedAt)}</td>
                <td className="viewsCell">
                  {isDeletedScope ? (
                    <RowActions>
                      <GhostButton
                        type="button"
                        disabled={isRowPending(row, "restore")}
                        onClick={() => onRestorePost(row)}
                      >
                        복구
                      </GhostButton>
                      <GhostButton
                        type="button"
                        disabled={isRowPending(row, "hardDelete")}
                        onClick={() => onHardDeletePost(row)}
                      >
                        영구삭제
                      </GhostButton>
                    </RowActions>
                  ) : (
                    formatWorkspaceViews(row)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </PostsDesktopTable>
      ) : null}

      {shouldRenderMobileList ? (
        <MobileCardList>
          {listState.rows.map((row) => (
            <article
              key={`mobile-${row.id}`}
              tabIndex={isDeletedScope ? undefined : 0}
              role={isDeletedScope ? undefined : "button"}
              onClick={isDeletedScope ? undefined : () => openEditorForRow(row)}
              onKeyDown={
                isDeletedScope
                  ? undefined
                  : (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        openEditorForRow(row)
                      }
                    }
              }
            >
              <header>
                <span className="id">#{row.id}</span>
              </header>
              <TitleText>{buildRowTitle(row)}</TitleText>
              <div className="metaRow">
                <VisibilityBadge data-tone={getStatusTone(row)}>{getStatusLabel(row)}</VisibilityBadge>
              </div>
              <span className="date">
                {getWorkspaceTopicLabel(row)} · {formatDateTime(listScope === "active" ? row.modifiedAt : row.deletedAt)} ·{" "}
                {listScope === "active" ? formatWorkspaceViews(row) : "-"} views
              </span>
              {isDeletedScope ? (
                <RowActions>
                  <GhostButton
                    type="button"
                    disabled={isRowPending(row, "restore")}
                    onClick={() => onRestorePost(row)}
                  >
                    복구
                  </GhostButton>
                  <GhostButton
                    type="button"
                    disabled={isRowPending(row, "hardDelete")}
                    onClick={() => onHardDeletePost(row)}
                  >
                    영구삭제
                  </GhostButton>
                </RowActions>
              ) : null}
            </article>
          ))}
        </MobileCardList>
      ) : null}

      {showPager ? (
        <PageFooter>
          <GhostButton type="button" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>
            이전
          </GhostButton>
          <span>
            {currentPage} / {totalPages}
          </span>
          <PrimaryInlineButton
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
          >
            다음
          </PrimaryInlineButton>
        </PageFooter>
      ) : null}
    </ListCard>
  )
}
