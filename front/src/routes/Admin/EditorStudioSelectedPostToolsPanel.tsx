import styled from "@emotion/styled"

type EditorStudioSelectedPostToolsPanelProps = {
  hasSelectedManagedPost: boolean
  isDirectLoadOpen: boolean
  onToggleDirectLoad: () => void
  isSelectedToolsOpen: boolean
  onToggleSelectedTools: () => void
  postId: string
  onPostIdChange: (postId: string) => void
  isLoadPostDisabled: boolean
  onLoadPost: () => void
  isHitPostDisabled: boolean
  onRunHitPost: () => void
  isLikePostDisabled: boolean
  onRunLikePost: () => void
}

export const EditorStudioSelectedPostToolsPanel = ({
  hasSelectedManagedPost,
  isDirectLoadOpen,
  onToggleDirectLoad,
  isSelectedToolsOpen,
  onToggleSelectedTools,
  postId,
  onPostIdChange,
  isLoadPostDisabled,
  onLoadPost,
  isHitPostDisabled,
  onRunHitPost,
  isLikePostDisabled,
  onRunLikePost,
}: EditorStudioSelectedPostToolsPanelProps) => {
  const directLoadTitle = hasSelectedManagedPost ? "다른 글 직접 불러오기" : "post id 직접 불러오기"
  const directLoadHint = hasSelectedManagedPost
    ? "번호를 알고 있을 때만 씁니다."
    : "특정 글 번호를 알고 있을 때만 씁니다."

  return (
    <>
      <SelectedPostToolsDisclosure open={isDirectLoadOpen}>
        <summary
          onClick={(event) => {
            event.preventDefault()
            onToggleDirectLoad()
          }}
        >
          <strong>{directLoadTitle}</strong>
          <span>{isDirectLoadOpen ? "닫기" : "열기"}</span>
        </summary>
        {isDirectLoadOpen ? (
          <div className="body">
            <SelectedPostGrid>
              <FieldBox>
                <FieldLabel htmlFor="selected-post-id">post id</FieldLabel>
                <Input
                  id="selected-post-id"
                  placeholder="예: 1"
                  value={postId}
                  onChange={(event) => onPostIdChange(event.target.value)}
                />
              </FieldBox>
            </SelectedPostGrid>
            <SelectedPostHint>{directLoadHint}</SelectedPostHint>
            <ActionRow>
              <Button
                type="button"
                disabled={isLoadPostDisabled}
                onClick={onLoadPost}
              >
                글 불러오기
              </Button>
            </ActionRow>
          </div>
        ) : null}
      </SelectedPostToolsDisclosure>

      {hasSelectedManagedPost ? (
        <SelectedPostToolsDisclosure open={isSelectedToolsOpen}>
          <summary
            onClick={(event) => {
              event.preventDefault()
              onToggleSelectedTools()
            }}
          >
            <strong>진단 도구</strong>
            <span>{isSelectedToolsOpen ? "닫기" : "열기"}</span>
          </summary>
          {isSelectedToolsOpen ? (
            <div className="body">
              <SelectedPostHint>진단이 필요할 때만 실행합니다.</SelectedPostHint>
              <SubActionRow>
                <Button
                  type="button"
                  disabled={isHitPostDisabled}
                  onClick={onRunHitPost}
                >
                  조회수 테스트
                </Button>
                <Button
                  type="button"
                  disabled={isLikePostDisabled}
                  onClick={onRunLikePost}
                >
                  좋아요 반영 테스트
                </Button>
              </SubActionRow>
            </div>
          ) : null}
        </SelectedPostToolsDisclosure>
      ) : null}
    </>
  )
}

const SelectedPostToolsDisclosure = styled.details`
  margin-top: 0.68rem;
  border-top: 1px dashed ${({ theme }) => theme.colors.gray6};
  padding-top: 0.68rem;

  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.72rem;
    list-style: none;
    cursor: pointer;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.78rem;
    line-height: 1.45;

    &::-webkit-details-marker {
      display: none;
    }
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.8rem;
    font-weight: 700;
  }

  summary > span:last-of-type {
    flex: 0 0 auto;
    color: ${({ theme }) => theme.colors.blue11};
    font-size: 0.76rem;
    font-weight: 700;
  }

  .body {
    display: grid;
    gap: 0.62rem;
    margin-top: 0.72rem;
  }
`

const FieldBox = styled.div`
  display: grid;
  gap: 0.26rem;
`

const FieldLabel = styled.label`
  font-size: 0.8rem;
  font-weight: 650;
  color: ${({ theme }) => theme.colors.gray11};
`

const Input = styled.input`
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 8px;
  padding: 0.72rem 0.8rem;
  min-height: 44px;
  min-width: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: 0 0 0 4px ${({ theme }) => theme.colors.blue4};
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

const SelectedPostGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.7rem;
`

const SelectedPostHint = styled.p`
  margin: 0.1rem 0 0;
  font-size: 0.74rem;
  color: ${({ theme }) => theme.colors.gray11};
  line-height: 1.45;
`

const SubActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.65rem;
  padding-top: 0.65rem;
  border-top: 1px dashed ${({ theme }) => theme.colors.gray6};

  > button {
    border-style: dashed;
  }

  @media (max-width: 720px) {
    display: grid;
    grid-template-columns: 1fr;

    > button {
      width: 100%;
      justify-content: center;
    }
  }
`
