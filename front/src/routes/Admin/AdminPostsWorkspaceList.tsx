import {
  ActionRow,
  GhostButton,
  ListCard,
  ListEmptyState,
  ListSkeleton,
  MobileCardList,
  PostsDesktopTable,
  PrimaryInlineButton,
  TitleCell,
  TitleText,
  VisibilityBadge,
} from "./AdminPostsWorkspaceList.styles"
import {
  formatDateTime,
  formatWorkspaceViews,
  getWorkspaceTopicLabel,
  getWorkspaceRowTitle,
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
  listState: ListState
  isListLoading: boolean
  listError: string
  shouldRenderMobileList: boolean
  onLoadList: () => void
  onOpenWriteRoute: (query?: Record<string, string>) => void
  onResetSearch: () => void
}

export const AdminPostsWorkspaceList: React.FC<AdminPostsWorkspaceListProps> = ({
  listScope,
  listKw,
  listState,
  isListLoading,
  listError,
  shouldRenderMobileList,
  onLoadList,
  onOpenWriteRoute,
  onResetSearch,
}) => {
  const openEditorForRow = (row: AdminPostListItem) => onOpenWriteRoute({ postId: String(row.id) })

  if (isListLoading) {
    return (
      <ListCard aria-hidden="true">
        <ListSkeleton>
          <div className="desktopRows">
            <div className="headerRow">
              <span className="idCell">ID</span>
              <span>제목</span>
              <span className="dateCell">{listScope === "active" ? "수정일" : "삭제일"}</span>
            </div>
            {Array.from({ length: LIST_SKELETON_ROW_COUNT }, (_, index) => (
              <div className="row" key={`desktop-skeleton-${index}`}>
                <div className="cell idCell">
                  <span className="line short" />
                </div>
                <div className="cell titleCell">
                  <span className="line medium" />
                  <span className="line wide" />
                  <span className="line short muted" />
                </div>
                <div className="cell dateCell">
                  <span className="line medium" />
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
              <th className="viewsCell">Views</th>
            </tr>
          </thead>
          <tbody>
            {listState.rows.map((row) => (
              <tr
                key={row.id}
                tabIndex={0}
                role="button"
                onClick={() => openEditorForRow(row)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    openEditorForRow(row)
                  }
                }}
              >
                <td className="selectCell">
                  <span className="check" aria-hidden="true" />
                </td>
                <td>
                  <TitleCell>
                    <TitleText>{getWorkspaceRowTitle(row)}</TitleText>
                    <div className="metaRow">
                      <span>ID #{row.id}</span>
                    </div>
                  </TitleCell>
                </td>
                <td className="topicCell">{getWorkspaceTopicLabel(row)}</td>
                <td className="statusCell">
                  <VisibilityBadge data-tone={toVisibility(row.published, row.listed)}>
                    {workspaceStatusLabel(row)}
                  </VisibilityBadge>
                </td>
                <td className="dateCell">{formatDateTime(listScope === "active" ? row.modifiedAt : row.deletedAt)}</td>
                <td className="viewsCell">{listScope === "active" ? formatWorkspaceViews(row) : "-"}</td>
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
              tabIndex={0}
              role="button"
              onClick={() => openEditorForRow(row)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  openEditorForRow(row)
                }
              }}
            >
              <header>
                <span className="id">#{row.id}</span>
              </header>
              <TitleText>{getWorkspaceRowTitle(row)}</TitleText>
              <div className="metaRow">
                <VisibilityBadge data-tone={toVisibility(row.published, row.listed)}>
                  {workspaceStatusLabel(row)}
                </VisibilityBadge>
              </div>
              <span className="date">
                {getWorkspaceTopicLabel(row)} · {formatDateTime(listScope === "active" ? row.modifiedAt : row.deletedAt)} ·{" "}
                {listScope === "active" ? formatWorkspaceViews(row) : "-"} views
              </span>
            </article>
          ))}
        </MobileCardList>
      ) : null}
    </ListCard>
  )
}
