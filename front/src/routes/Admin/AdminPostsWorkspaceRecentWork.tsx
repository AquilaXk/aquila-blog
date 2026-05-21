import styled from "@emotion/styled"
import {
  AdminInlineActionRow,
  AdminRailCard,
  AdminStatusPill,
  AdminTextActionButton,
} from "./AdminSurfacePrimitives"
import {
  formatDateTime,
  getWorkspaceRowTitle,
  type AdminPostListItem,
  type LocalDraftSummary,
  toVisibility,
  visibilityLabel,
  visibilityLabelFromValue,
} from "./AdminPostsWorkspaceModel"

type AdminPostsWorkspaceRecentWorkProps = {
  localDraft: LocalDraftSummary | null
  recentPosts: AdminPostListItem[]
  isRecentLoading: boolean
  recentError: string
  showDeferredSupportPanels: boolean
  onOpenWriteRoute: (query?: Record<string, string>) => void
  onContinueRecent: (row: AdminPostListItem) => void
}

export const AdminPostsWorkspaceRecentWork: React.FC<AdminPostsWorkspaceRecentWorkProps> = ({
  localDraft,
  recentPosts,
  isRecentLoading,
  recentError,
  showDeferredSupportPanels,
  onOpenWriteRoute,
  onContinueRecent,
}) => {
  const hasAnyResumeTarget = Boolean(localDraft) || recentPosts.length > 0
  const shouldRenderResumeGrid = isRecentLoading || Boolean(recentError) || hasAnyResumeTarget
  const recentRows = recentPosts.slice(0, 3)

  const renderRecentList = () => {
    if (isRecentLoading) {
      return (
        <RecentListSkeleton aria-hidden="true">
          <span />
          <span />
          <span />
        </RecentListSkeleton>
      )
    }

    if (recentError) {
      return <MutedText>{recentError}</MutedText>
    }

    if (recentPosts.length === 0) {
      return <MutedText>이어 쓸 원고 없음</MutedText>
    }

    return (
      <RecentPostItems>
        {recentRows.map((row) => (
          <li key={row.id}>
            <button type="button" onClick={() => onContinueRecent(row)}>
              <div>
                <strong>{getWorkspaceRowTitle(row)}</strong>
                <span>{formatDateTime(row.modifiedAt)}</span>
              </div>
              <RecentMeta>
                <VisibilityBadge data-tone={toVisibility(row.published, row.listed)}>
                  {visibilityLabel(row.published, row.listed)}
                </VisibilityBadge>
              </RecentMeta>
            </button>
          </li>
        ))}
      </RecentPostItems>
    )
  }

  return (
    <ResumeSection>
      <SectionHeading>
        <div>
          <h2>최근 작업</h2>
        </div>
      </SectionHeading>
      {showDeferredSupportPanels ? (
        shouldRenderResumeGrid ? (
          <ResumeGrid>
            {localDraft ? (
              <ResumeCardButton type="button" onClick={() => onOpenWriteRoute({ source: "local-draft" })}>
                <ResumeHeader>
                  <strong>브라우저 임시저장</strong>
                  {localDraft.savedAt ? <span>{formatDateTime(localDraft.savedAt)}</span> : null}
                </ResumeHeader>
                <ResumeTitle>{localDraft.title}</ResumeTitle>
                <ResumeMeta>
                  <VisibilityBadge data-tone={localDraft.visibility}>
                    {visibilityLabelFromValue(localDraft.visibility)}
                  </VisibilityBadge>
                  <span>{localDraft.tagCount > 0 ? `태그 ${localDraft.tagCount}개` : "태그 없음"}</span>
                </ResumeMeta>
              </ResumeCardButton>
            ) : (
              <ResumeCard data-empty="true">
                <ResumeHeader>
                  <strong>브라우저 임시저장</strong>
                </ResumeHeader>
                <EmptyInlineState>
                  <strong>임시 저장 없음</strong>
                  <ActionRow>
                    <PrimaryInlineButton type="button" onClick={() => onOpenWriteRoute()}>
                      새 글 작성
                    </PrimaryInlineButton>
                  </ActionRow>
                </EmptyInlineState>
              </ResumeCard>
            )}

            <ResumeCard>
              <ResumeHeader>
                <strong>최근 수정 3건</strong>
                {isRecentLoading ? <span>불러오는 중</span> : null}
              </ResumeHeader>
              {renderRecentList()}
            </ResumeCard>
          </ResumeGrid>
        ) : (
          <WorkspaceEmpty>
            <strong>최근 작업 없음</strong>
            <PrimaryInlineButton type="button" onClick={() => onOpenWriteRoute()}>
              새 글 작성
            </PrimaryInlineButton>
          </WorkspaceEmpty>
        )
      ) : (
        <DeferredPanelPlaceholder data-size="recent">
          <strong>최근 작업 준비 중</strong>
          <span>글 목록 워크스페이스를 먼저 표시한 뒤 이어서 최근 작업을 붙입니다.</span>
        </DeferredPanelPlaceholder>
      )}
    </ResumeSection>
  )
}

const ResumeSection = styled.section`
  display: grid;
  gap: 0.72rem;
`

const SectionHeading = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;

  h2 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.22rem;
    font-weight: 800;
    letter-spacing: -0.03em;
  }

  @media (max-width: 767px) {
    h2 {
      font-size: 0.9rem;
      letter-spacing: 0;
    }
  }
`

const ResumeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  min-width: 0;
  gap: 0.6rem;
  align-items: start;

  > * {
    min-width: 0;
  }

  @media (max-width: 767px) {
    grid-template-columns: minmax(0, 0.76fr) minmax(0, 1.24fr);
    gap: 0.42rem;
  }
`

const ResumeCard = styled(AdminRailCard)`
  gap: 0.42rem;
  min-width: 0;
  width: 100%;
  padding: 0.72rem 0.78rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};
  text-align: left;
  color: inherit;

  &[data-empty="true"] {
    gap: 0.36rem;
    padding-block: 0.68rem;
  }

  @media (max-width: 767px) {
    gap: 0.28rem;
    padding: 0.5rem 0.54rem;
    border-radius: 12px;

    &[data-empty="true"] {
      padding-block: 0.5rem;
    }
  }
`

const ResumeCardButton = styled.button`
  display: grid;
  gap: 0.42rem;
  min-width: 0;
  width: 100%;
  padding: 0.72rem 0.78rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};
  appearance: none;
  text-align: left;
  color: inherit;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;

  &:hover {
    border-color: ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray1};
  }

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => `0 0 0 3px ${theme.colors.gray6}`};
  }

  @media (max-width: 767px) {
    gap: 0.28rem;
    padding: 0.5rem 0.54rem;
    border-radius: 12px;
  }
`

const ResumeHeader = styled.div`
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;

  strong {
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: 0.88rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.74rem;
    white-space: nowrap;
  }

  @media (max-width: 767px) {
    align-items: flex-start;

    strong {
      font-size: 0.76rem;
      line-height: 1.2;
    }

    span {
      display: none;
    }
  }
`

const ResumeTitle = styled.strong`
  display: -webkit-box;
  min-width: 0;
  font-size: 0.9rem;
  line-height: 1.32;
  overflow: hidden;
  word-break: keep-all;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;

  @media (max-width: 767px) {
    font-size: 0.78rem;
    line-height: 1.25;
    -webkit-line-clamp: 1;
  }
`

const EmptyInlineState = styled.div`
  display: grid;
  gap: 0.12rem;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.84rem;
  }

  @media (max-width: 767px) {
    gap: 0.08rem;

    strong {
      color: ${({ theme }) => theme.colors.gray11};
      font-size: 0.74rem;
      line-height: 1.2;
    }
  }
`

const ResumeMeta = styled.div`
  display: flex;
  gap: 0.55rem;
  align-items: center;
  flex-wrap: wrap;

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.76rem;
  }

  @media (max-width: 767px) {
    gap: 0.24rem;

    span {
      display: none;
    }
  }
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

  @media (max-width: 767px) {
    min-height: 22px;
    padding: 0 0.46rem;
    font-size: 0.68rem;
  }
`

const ActionRow = styled(AdminInlineActionRow)``

const PrimaryInlineButton = styled(AdminTextActionButton)`
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.92rem;
  font-weight: 800;

  @media (max-width: 767px) {
    font-size: 0.74rem;
  }
`

const WorkspaceEmpty = styled.div`
  display: grid;
  gap: 0.45rem;
  padding: 1rem;
  border-radius: 16px;
  border: 1px dashed ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};

  strong {
    font-size: 1rem;
  }
`

const MutedText = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.gray10};
  line-height: 1.55;
`

const DeferredPanelPlaceholder = styled(AdminRailCard)<{ "data-size": "recent" }>`
  display: grid;
  gap: 0.3rem;
  padding: 0.92rem 1rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};
  min-height: 144px;

  strong {
    font-size: 0.9rem;
    letter-spacing: -0.01em;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
    line-height: 1.55;
  }
`

const RecentListSkeleton = styled.div`
  display: grid;
  gap: 0.45rem;

  span {
    display: block;
    height: 50px;
    border-radius: 12px;
    background: ${({ theme }) =>
      theme.scheme === "light"
        ? "linear-gradient(90deg, rgba(148, 163, 184, 0.16), rgba(148, 163, 184, 0.28), rgba(148, 163, 184, 0.16))"
        : "linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.1), rgba(255,255,255,0.06))"};
  }

  @media (max-width: 767px) {
    gap: 0.3rem;

    span {
      height: 28px;
      border-radius: 8px;
    }
  }
`

const RecentPostItems = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.42rem;

  li button {
    width: 100%;
    min-width: 0;
    padding: 0.58rem 0.68rem;
    border-radius: 10px;
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    background: ${({ theme }) => theme.colors.gray2};
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.55rem;
    text-align: left;
    cursor: pointer;
  }

  li button > div {
    display: grid;
    gap: 0.22rem;
    min-width: 0;
  }

  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.84rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.72rem;
  }

  @media (max-width: 820px) {
    li button {
      grid-template-columns: 1fr;
      align-items: start;
    }
  }

  @media (max-width: 767px) {
    gap: 0.3rem;

    li button {
      min-height: 32px;
      padding: 0.34rem 0.4rem;
      border-radius: 8px;
    }

    li button > div {
      gap: 0.08rem;
    }

    strong {
      font-size: 0.73rem;
    }

    span {
      display: none;
    }
  }
`

const RecentMeta = styled.div`
  display: grid;
  justify-items: end;
  gap: 0.28rem;
  flex-shrink: 0;

  @media (max-width: 820px) {
    justify-items: start;
  }

  @media (max-width: 767px) {
    display: none;
  }
`
