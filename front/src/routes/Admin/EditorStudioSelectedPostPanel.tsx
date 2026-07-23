import type { ReactNode } from "react"
import styled from "@emotion/styled"

import type { PostVisibility } from "./editorStudioState"

type EditorStudioSelectedPostPanelProps = {
  mobileVisible: boolean
  hasSelectedManagedPost: boolean
  editorModeLabel: string
  selectedPostLabel: string
  postTitle: string
  postId: string
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
  toolsPanel: ReactNode
}

export const EditorStudioSelectedPostPanel = ({
  mobileVisible,
  hasSelectedManagedPost,
  editorModeLabel,
  selectedPostLabel,
  postTitle,
  postId,
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
  toolsPanel,
}: EditorStudioSelectedPostPanelProps) => (
  <SelectedPostPanel data-mobile-visible={mobileVisible}>
    <SelectedPostHeader>
      <div>
        <h3>{hasSelectedManagedPost ? "선택한 글" : "빠른 작업"}</h3>
        <p>
          {hasSelectedManagedPost
            ? "선택한 글만 바로 이어서 다룹니다."
            : "새 글 작성이나 번호 불러오기만 남깁니다."}
        </p>
      </div>
      <SelectedPostBadge>{`${editorModeLabel} · ${selectedPostLabel}`}</SelectedPostBadge>
    </SelectedPostHeader>
    {hasSelectedManagedPost ? (
      <>
        <SelectedPostStateCard data-tone="active">
          <div className="headline">
            <strong>{postTitle.trim() || "제목 없음"}</strong>
            {isTempDraftMode ? (
              <LoadedBadge>임시 저장</LoadedBadge>
            ) : (
              <VisibilityBadge data-tone={postVisibility}>{currentVisibilityText}</VisibilityBadge>
            )}
          </div>
          <p>추가 작업은 필요할 때만 엽니다.</p>
          <div className="meta">
            <span>{`post id #${postId}`}</span>
            <span>{`버전 ${postVersion ?? "-"}`}</span>
          </div>
        </SelectedPostStateCard>
        <ActionRow>
          <PrimaryButton
            type="button"
            disabled={isContinueEditingDisabled}
            onClick={onContinueEditing}
          >
            편집 계속
          </PrimaryButton>
          <Button
            type="button"
            disabled={isCreateNewPostDisabled}
            onClick={onCreateNewPost}
          >
            새 글 작성
          </Button>
          <Button
            type="button"
            data-variant="danger"
            disabled={isDeletePostDisabled}
            onClick={onDeletePost}
          >
            글 삭제
          </Button>
        </ActionRow>
      </>
    ) : (
      <>
        <SelectedPostStateCard data-tone="idle">
          <strong>목록에서 글을 고르면 바로 이어집니다.</strong>
          <p>새 글 작성이나 번호 불러오기만 사용합니다.</p>
        </SelectedPostStateCard>
        <ActionRow>
          <PrimaryButton
            type="button"
            disabled={isCreateNewPostDisabled}
            onClick={onCreateNewPost}
          >
            새 글 작성 시작
          </PrimaryButton>
        </ActionRow>
      </>
    )}
    {toolsPanel}
  </SelectedPostPanel>
)

const SelectedPostPanel = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.gray1};
  padding: 0.72rem;
  margin: 0;
  box-shadow: none;

  @media (min-width: 1320px) {
    position: sticky;
    top: calc(var(--app-header-height, 56px) + 0.72rem);
  }

  @media (max-width: 420px) {
    border-radius: 10px;
    padding: 0.68rem;
  }

  @media (max-width: 720px) {
    &[data-mobile-visible="false"] {
      display: none;
    }
  }
`

const SelectedPostHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.72rem;

  h3 {
    margin: 0;
    font-size: 0.94rem;
    font-weight: 720;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0.24rem 0 0;
    font-size: 0.76rem;
    line-height: 1.45;
    color: ${({ theme }) => theme.colors.gray11};
  }

  @media (max-width: 720px) {
    flex-direction: column;
  }
`

const SelectedPostBadge = styled.span`
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.3rem 0.62rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.74rem;
  font-weight: 700;
  white-space: nowrap;

  @media (max-width: 420px) {
    white-space: normal;
    line-height: 1.45;
  }
`

const SelectedPostStateCard = styled.div`
  display: grid;
  gap: 0.52rem;
  padding: 0.72rem 0.76rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  margin-bottom: 0.72rem;

  &[data-tone="active"] {
    border-color: ${({ theme }) => theme.colors.blue7};
    background: ${({ theme }) => theme.colors.blue3};
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.84rem;
    font-weight: 760;
    line-height: 1.45;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.76rem;
    line-height: 1.58;
  }

  .headline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.55rem;
    flex-wrap: wrap;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.42rem;
  }

  .meta span {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    padding: 0 0.62rem;
    font-size: 0.74rem;
    font-weight: 700;
  }
`

const ActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-top: 0.85rem;
  align-items: center;

  > button {
    min-width: 8.8rem;
  }

  @media (max-width: 720px) {
    display: grid;
    grid-template-columns: 1fr;

    > button {
      width: 100%;
    }
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
