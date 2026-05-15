import styled from "@emotion/styled"
import type { MouseEvent } from "react"
import ProfileImage from "src/components/ProfileImage"
import { toCanonicalPostPath } from "src/libs/utils/postPath"
import {
  AdminInlineActionRow,
  AdminStatusPill,
  AdminSubtleCard,
  AdminTextActionButton,
} from "./AdminSurfacePrimitives"
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

const ActionRow = styled(AdminInlineActionRow)``

const PrimaryInlineButton = styled(AdminTextActionButton)`
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.92rem;
  font-weight: 800;
`

const GhostButton = styled(AdminTextActionButton)`
  font-size: 0.88rem;
  font-weight: 700;
`

const VisibilityBadge = styled(AdminStatusPill)<{ "data-tone": string }>`
  min-height: 28px;
  max-width: 100%;
  padding: 0 0.82rem;
  font-size: 0.78rem;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: ${({ theme, "data-tone": tone }) =>
    tone === "PRIVATE"
      ? theme.colors.gray11
      : tone === "PUBLIC_UNLISTED"
        ? theme.colors.orange9
        : theme.colors.green9};
  background: ${({ theme, "data-tone": tone }) =>
    tone === "PRIVATE"
      ? theme.colors.gray2
      : tone === "PUBLIC_UNLISTED"
        ? "rgba(249, 115, 22, 0.12)"
        : "rgba(34, 197, 94, 0.12)"};
  border-color: ${({ theme, "data-tone": tone }) =>
    tone === "PRIVATE"
      ? theme.colors.gray7
      : tone === "PUBLIC_UNLISTED"
        ? theme.colors.orange8
        : theme.colors.green8};
`

const ListSkeleton = styled.div`
  .desktopRows {
    display: grid;
  }

  .headerRow,
  .row {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr) 144px 220px;
  }

  .headerRow {
    min-height: 49px;
    align-items: center;
    padding: 0 1rem;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray5};
  }

  .headerRow > span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
    font-weight: 700;
  }

  .row {
    padding: 0 1rem;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray5};
  }

  .row:last-of-type {
    border-bottom: none;
  }

  .cell {
    display: grid;
    align-content: center;
    gap: 0.34rem;
    min-height: 78px;
    padding: 0.95rem 0;
  }

  .actionCell {
    grid-auto-flow: column;
    align-items: center;
    justify-content: start;
    gap: 0.65rem;
  }

  .line {
    display: block;
    height: 12px;
    border-radius: 999px;
    background: ${({ theme }) =>
      theme.scheme === "light"
        ? "linear-gradient(90deg, rgba(148, 163, 184, 0.16), rgba(148, 163, 184, 0.28), rgba(148, 163, 184, 0.16))"
        : "linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.12), rgba(255,255,255,0.06))"};
  }

  .line.short {
    width: 4.5rem;
  }

  .line.medium {
    width: 8.5rem;
  }

  .line.wide {
    width: min(100%, 22rem);
  }

  .line.muted {
    opacity: 0.65;
  }

  .mobileCards {
    display: none;
  }

  @media (max-width: 900px) {
    .desktopRows {
      display: none;
    }

    .mobileCards {
      display: grid;
      gap: 0.75rem;
      padding: 0.95rem;
    }

    .mobileCards article {
      display: grid;
      gap: 0.55rem;
      padding: 0.95rem;
      border-radius: 14px;
      border: 1px solid ${({ theme }) => theme.colors.gray5};
      background: ${({ theme }) => theme.colors.gray1};
    }

    .mobileCards .metaRow,
    .mobileCards .actionRow {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.55rem;
    }
  }
`

const ListEmptyState = styled.div`
  display: grid;
  gap: 0.45rem;
  padding: 1rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};

  strong {
    font-size: 1rem;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.55;
  }
`

const ListCard = styled(AdminSubtleCard)`
  border-radius: 16px;
  overflow: hidden;
`

const PostsDesktopTable = styled.table`
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    padding: 0.95rem 1rem;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray5};
    vertical-align: top;
  }

  th {
    text-align: left;
    font-size: 0.8rem;
    color: ${({ theme }) => theme.colors.gray10};
  }

  .idCell {
    width: 88px;
    white-space: nowrap;
    vertical-align: middle;
  }

  .dateCell {
    width: 144px;
    white-space: nowrap;
    vertical-align: middle;
  }

  .actionCell {
    width: 220px;
    vertical-align: middle;
  }

  tbody tr:last-of-type td {
    border-bottom: none;
  }

  @media (max-width: 900px) {
    display: none;
  }
`

const TitleCell = styled.div`
  display: grid;
  gap: 0.38rem;

  .metaRow {
    display: flex;
    gap: 0.55rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .author {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
  }
`

const TitleAnchor = styled.a`
  display: -webkit-box;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.96rem;
  font-weight: 800;
  line-height: 1.45;
  text-decoration: none;
  overflow: hidden;
  word-break: keep-all;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;

  &:hover {
    color: ${({ theme }) => theme.colors.gray12};
    text-decoration: underline;
    text-underline-offset: 0.16em;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.gray8};
    outline-offset: 3px;
    border-radius: 0.32rem;
  }
`

const TitleText = styled.strong`
  display: -webkit-box;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.96rem;
  font-weight: 800;
  line-height: 1.45;
  overflow: hidden;
  word-break: keep-all;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
`

const AuthorIdentity = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
`

const AuthorAvatarFrame = styled.span`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 1.4rem;
  height: 1.4rem;
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.gray3};
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.66rem;
  font-weight: 800;
  line-height: 1;

  &[data-has-image="true"] {
    background: ${({ theme }) => theme.colors.gray4};
  }

  img {
    width: 100%;
    height: 100%;
  }
`

const RowActions = styled(AdminInlineActionRow)``

const RowPrimaryButton = styled(AdminTextActionButton)`
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.86rem;
  font-weight: 800;

  &:disabled {
    opacity: 0.48;
    cursor: wait;
  }
`

const RowSecondaryButton = styled(AdminTextActionButton)`
  font-size: 0.84rem;
  font-weight: 700;

  &:disabled {
    opacity: 0.48;
    cursor: wait;
  }
`

const DangerTextButton = styled(AdminTextActionButton)`
  color: ${({ theme }) => theme.colors.red11};
  font-size: 0.86rem;
  font-weight: 700;

  &:disabled {
    opacity: 0.48;
    cursor: wait;
  }
`

const MobileCardList = styled.div`
  display: none;

  @media (max-width: 900px) {
    display: grid;
    gap: 0.75rem;
    padding: 0.95rem;
  }

  article {
    display: grid;
    gap: 0.55rem;
    padding: 0.95rem;
    border-radius: 14px;
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    background: ${({ theme }) => theme.colors.gray1};
  }

  header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .id {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
    font-weight: 700;
  }

  strong {
    font-size: 0.98rem;
    line-height: 1.45;
  }

  .metaRow {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    flex-wrap: wrap;
  }

  .author,
  .date {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
  }

  .actions {
    display: flex;
    gap: 0.55rem;
    flex-wrap: wrap;
  }
`
