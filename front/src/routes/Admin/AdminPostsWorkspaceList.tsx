import type { MouseEvent } from "react"
import ProfileImage from "src/components/ProfileImage"
import { toCanonicalPostPath } from "src/libs/utils/postPath"
import {
  ActionRow,
  AuthorAvatarFrame,
  AuthorIdentity,
  DangerTextButton,
  GhostButton,
  ListCard,
  ListEmptyState,
  ListSkeleton,
  MobileCardList,
  PostsDesktopTable,
  PrimaryInlineButton,
  RowActions,
  RowPrimaryButton,
  RowSecondaryButton,
  TitleAnchor,
  TitleCell,
  TitleText,
  VisibilityBadge,
} from "./AdminPostsWorkspaceList.styles"
import {
  buildWorkspaceAuthorFallbackInitial,
  canOpenCanonicalPost,
  formatDateTime,
  getWorkspaceRowTitle,
  LIST_SKELETON_ROW_COUNT,
  toVisibility,
  visibilityLabel,
  type AdminPostListItem,
  type ListState,
  type PostListScope,
} from "./AdminPostsWorkspaceModel"

type MutationPending = {
  rowId: number
  kind: "delete" | "restore" | "hardDelete"
} | null

type AdminPostsWorkspaceListProps = {
  listScope: PostListScope
  listKw: string
  listState: ListState
  isListLoading: boolean
  listError: string
  shouldRenderMobileList: boolean
  mutationPending: MutationPending
  onLoadList: () => void
  onOpenWriteRoute: (query?: Record<string, string>) => void
  onResetSearch: () => void
  onContinueRecent: (row: AdminPostListItem) => void
  onCopyPostDetailLink: (row: AdminPostListItem) => void
  onOpenCanonicalPost: (
    event: MouseEvent<HTMLAnchorElement>,
    row: Pick<AdminPostListItem, "id" | "published" | "listed" | "tempDraft">
  ) => void
  onDeletePost: (row: AdminPostListItem) => void
  onRestorePost: (row: AdminPostListItem) => void
  onHardDeletePost: (row: AdminPostListItem) => void
}

export const AdminPostsWorkspaceList: React.FC<AdminPostsWorkspaceListProps> = ({
  listScope,
  listKw,
  listState,
  isListLoading,
  listError,
  shouldRenderMobileList,
  mutationPending,
  onLoadList,
  onOpenWriteRoute,
  onResetSearch,
  onContinueRecent,
  onCopyPostDetailLink,
  onOpenCanonicalPost,
  onDeletePost,
  onRestorePost,
  onHardDeletePost,
}) => {
  const renderAuthorMeta = (row: Pick<AdminPostListItem, "authorName" | "authorProfileImgUrl">) => {
    const authorName = row.authorName || "작성자 미상"
    const avatarSrc = (row.authorProfileImgUrl || "").trim()

    return (
      <AuthorIdentity>
        <AuthorAvatarFrame aria-hidden="true" data-has-image={avatarSrc ? "true" : "false"}>
          {avatarSrc ? (
            <ProfileImage src={avatarSrc} alt="" fillContainer />
          ) : (
            <span>{buildWorkspaceAuthorFallbackInitial(row.authorName)}</span>
          )}
        </AuthorAvatarFrame>
        <span className="author">{authorName}</span>
      </AuthorIdentity>
    )
  }

  if (isListLoading) {
    return (
      <ListCard aria-hidden="true">
        <ListSkeleton>
          <div className="desktopRows">
            <div className="headerRow">
              <span className="idCell">ID</span>
              <span>제목</span>
              <span className="dateCell">{listScope === "active" ? "수정일" : "삭제일"}</span>
              <span className="actionCell">작업</span>
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
                <div className="cell actionCell">
                  <span className="line short" />
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
                <div className="actionRow">
                  <span className="line short" />
                  <span className="line short" />
                </div>
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

  const renderActions = (row: AdminPostListItem) =>
    listScope === "active" ? (
      <>
        <RowPrimaryButton type="button" onClick={() => onContinueRecent(row)}>
          수정
        </RowPrimaryButton>
        {canOpenCanonicalPost(row) ? (
          <RowSecondaryButton type="button" onClick={() => onCopyPostDetailLink(row)}>
            링크 복사
          </RowSecondaryButton>
        ) : null}
        <DangerTextButton type="button" disabled={Boolean(mutationPending)} onClick={() => onDeletePost(row)}>
          삭제
        </DangerTextButton>
      </>
    ) : (
      <>
        <RowPrimaryButton type="button" disabled={Boolean(mutationPending)} onClick={() => onRestorePost(row)}>
          복구
        </RowPrimaryButton>
        <DangerTextButton type="button" disabled={Boolean(mutationPending)} onClick={() => onHardDeletePost(row)}>
          영구삭제
        </DangerTextButton>
      </>
    )

  return (
    <ListCard>
      {!shouldRenderMobileList ? (
        <PostsDesktopTable>
          <thead>
            <tr>
              <th className="idCell">ID</th>
              <th>제목</th>
              <th className="dateCell">{listScope === "active" ? "수정일" : "삭제일"}</th>
              <th className="actionCell">작업</th>
            </tr>
          </thead>
          <tbody>
            {listState.rows.map((row) => (
              <tr key={row.id}>
                <td className="idCell">#{row.id}</td>
                <td>
                  <TitleCell>
                    {canOpenCanonicalPost(row) ? (
                      <TitleAnchor href={toCanonicalPostPath(row.id)} onClick={(event) => onOpenCanonicalPost(event, row)}>
                        {getWorkspaceRowTitle(row)}
                      </TitleAnchor>
                    ) : (
                      <TitleText>{getWorkspaceRowTitle(row)}</TitleText>
                    )}
                    <div className="metaRow">
                      <VisibilityBadge data-tone={toVisibility(row.published, row.listed)}>
                        {visibilityLabel(row.published, row.listed)}
                      </VisibilityBadge>
                      {renderAuthorMeta(row)}
                    </div>
                  </TitleCell>
                </td>
                <td className="dateCell">{formatDateTime(listScope === "active" ? row.modifiedAt : row.deletedAt)}</td>
                <td className="actionCell">
                  <RowActions>{renderActions(row)}</RowActions>
                </td>
              </tr>
            ))}
          </tbody>
        </PostsDesktopTable>
      ) : null}

      {shouldRenderMobileList ? (
        <MobileCardList>
          {listState.rows.map((row) => (
            <article key={`mobile-${row.id}`}>
              <header>
                <span className="id">#{row.id}</span>
              </header>
              {canOpenCanonicalPost(row) ? (
                <TitleAnchor href={toCanonicalPostPath(row.id)} onClick={(event) => onOpenCanonicalPost(event, row)}>
                  {getWorkspaceRowTitle(row)}
                </TitleAnchor>
              ) : (
                <TitleText>{getWorkspaceRowTitle(row)}</TitleText>
              )}
              <div className="metaRow">
                <VisibilityBadge data-tone={toVisibility(row.published, row.listed)}>
                  {visibilityLabel(row.published, row.listed)}
                </VisibilityBadge>
                {renderAuthorMeta(row)}
              </div>
              <span className="date">{formatDateTime(listScope === "active" ? row.modifiedAt : row.deletedAt)}</span>
              <div className="actions">{renderActions(row)}</div>
            </article>
          ))}
        </MobileCardList>
      ) : null}
    </ListCard>
  )
}
