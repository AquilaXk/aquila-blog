import styled from "@emotion/styled"

type EditorStudioLegacyUtilityPanelProps = {
  postId: string
  commentId: string
  commentContent: string
  isCommentListDisabled: boolean
  isCommentOneDisabled: boolean
  isCommentWriteDisabled: boolean
  isCommentModifyDisabled: boolean
  isCommentDeleteDisabled: boolean
  isPostCountDisabled: boolean
  isSystemHealthDisabled: boolean
  onPostIdChange: (nextValue: string) => void
  onCommentIdChange: (nextValue: string) => void
  onCommentContentChange: (nextValue: string) => void
  onListComments: () => void
  onReadComment: () => void
  onWriteComment: () => void
  onModifyComment: () => void
  onDeleteComment: () => void
  onReadPostCount: () => void
  onReadSystemHealth: () => void
}

export const EditorStudioLegacyUtilityPanel = ({
  postId,
  commentId,
  commentContent,
  isCommentListDisabled,
  isCommentOneDisabled,
  isCommentWriteDisabled,
  isCommentModifyDisabled,
  isCommentDeleteDisabled,
  isPostCountDisabled,
  isSystemHealthDisabled,
  onPostIdChange,
  onCommentIdChange,
  onCommentContentChange,
  onListComments,
  onReadComment,
  onWriteComment,
  onModifyComment,
  onDeleteComment,
  onReadPostCount,
  onReadSystemHealth,
}: EditorStudioLegacyUtilityPanelProps) => (
  <UtilityGrid>
    <UtilitySection id="comment-studio">
      <UtilitySectionTop>
        <div>
          <UtilitySectionEyebrow>댓글 점검</UtilitySectionEyebrow>
          <h2>댓글 테스트 도구</h2>
          <UtilitySectionDescription>댓글 CRUD 동작을 빠르게 점검할 때 사용하는 영역입니다.</UtilitySectionDescription>
        </div>
      </UtilitySectionTop>
      <UtilityFieldGrid>
        <UtilityFieldBox>
          <UtilityFieldLabel htmlFor="comment-post-id">post id</UtilityFieldLabel>
          <UtilityInput
            id="comment-post-id"
            placeholder="예: 1"
            value={postId}
            onChange={(event) => onPostIdChange(event.target.value)}
          />
        </UtilityFieldBox>
        <UtilityFieldBox>
          <UtilityFieldLabel htmlFor="comment-id">comment id</UtilityFieldLabel>
          <UtilityInput
            id="comment-id"
            placeholder="예: 1"
            value={commentId}
            onChange={(event) => onCommentIdChange(event.target.value)}
          />
        </UtilityFieldBox>
        <UtilityFieldBox className="wide">
          <UtilityFieldLabel htmlFor="comment-content">comment content</UtilityFieldLabel>
          <UtilityInput
            id="comment-content"
            placeholder="댓글 내용을 입력하세요"
            value={commentContent}
            onChange={(event) => onCommentContentChange(event.target.value)}
          />
        </UtilityFieldBox>
      </UtilityFieldGrid>
      <UtilityActionRow>
        <UtilityButton type="button" disabled={isCommentListDisabled} onClick={onListComments}>
          댓글 목록
        </UtilityButton>
        <UtilityButton type="button" disabled={isCommentOneDisabled} onClick={onReadComment}>
          댓글 단건
        </UtilityButton>
        <UtilityButton type="button" disabled={isCommentWriteDisabled} onClick={onWriteComment}>
          댓글 작성
        </UtilityButton>
        <UtilityButton type="button" disabled={isCommentModifyDisabled} onClick={onModifyComment}>
          댓글 수정
        </UtilityButton>
        <UtilityButton type="button" disabled={isCommentDeleteDisabled} onClick={onDeleteComment}>
          댓글 삭제
        </UtilityButton>
      </UtilityActionRow>
    </UtilitySection>

    <UtilitySection id="system-tools">
      <UtilitySectionTop>
        <div>
          <UtilitySectionEyebrow>시스템 점검</UtilitySectionEyebrow>
          <h2>운영 점검 도구</h2>
          <UtilitySectionDescription>자주 확인하는 관리성 API를 한곳에 모았습니다.</UtilitySectionDescription>
        </div>
      </UtilitySectionTop>
      <UtilityActionRow>
        <UtilityButton type="button" disabled={isPostCountDisabled} onClick={onReadPostCount}>
          전체 글 개수 확인
        </UtilityButton>
        <UtilityButton type="button" disabled={isSystemHealthDisabled} onClick={onReadSystemHealth}>
          서버 상태 조회
        </UtilityButton>
      </UtilityActionRow>
    </UtilitySection>
  </UtilityGrid>
)

const UtilityGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`

const UtilitySection = styled.section`
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 12px;
  padding: 1rem;
  background: ${({ theme }) => theme.colors.gray2};
`

const UtilitySectionTop = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.95rem;
`

const UtilitySectionEyebrow = styled.span`
  display: none;
`

const UtilitySectionDescription = styled.p`
  margin: 0.22rem 0 0;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.82rem;
  line-height: 1.5;
`

const UtilityFieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`

const UtilityFieldBox = styled.div`
  display: grid;
  gap: 0.26rem;

  &.wide {
    grid-column: span 2;

    @media (max-width: 720px) {
      grid-column: span 1;
    }
  }
`

const UtilityFieldLabel = styled.label`
  font-size: 0.8rem;
  font-weight: 650;
  color: ${({ theme }) => theme.colors.gray11};
`

const UtilityInput = styled.input`
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

const UtilityActionRow = styled.div`
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

const UtilityButton = styled.button`
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
