import styled from "@emotion/styled"

type DeleteConfirmNoticeTone = "idle" | "loading" | "success" | "error"

export type EditorStudioDeleteConfirmState = {
  ids: number[]
  headline: string
}

type EditorStudioDeleteConfirmDialogProps = {
  state: EditorStudioDeleteConfirmState | null
  noticeTone: DeleteConfirmNoticeTone
  noticeText: string
  isDeleteDisabled: boolean
  onClose: () => void
  onConfirm: (state: EditorStudioDeleteConfirmState) => void | Promise<void>
}

export const EditorStudioDeleteConfirmDialog = ({
  state,
  noticeTone,
  noticeText,
  isDeleteDisabled,
  onClose,
  onConfirm,
}: EditorStudioDeleteConfirmDialogProps) => {
  if (!state) return null

  return (
    <DialogBackdrop onClick={onClose}>
      <DialogShell onClick={(event) => event.stopPropagation()}>
        <div className="header">
          <h4>글을 삭제할까요?</h4>
          <p>
            삭제 후에는 삭제 글 목록에서 복구할 수 있습니다.
            <br />
            <strong>{state.headline}</strong>
          </p>
        </div>
        {noticeText ? <Notice data-tone={noticeTone}>{noticeText}</Notice> : null}
        <div className="actions">
          <Button type="button" disabled={isDeleteDisabled} onClick={onClose}>
            취소
          </Button>
          <PrimaryButton type="button" disabled={isDeleteDisabled} onClick={() => void onConfirm(state)}>
            {isDeleteDisabled ? "삭제 중..." : "삭제 확정"}
          </PrimaryButton>
        </div>
      </DialogShell>
    </DialogBackdrop>
  )
}

const DialogBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.42);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 120;
  padding: 1rem;
`

const DialogShell = styled.div`
  width: min(440px, 100%);
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  padding: 1rem;
  display: grid;
  gap: 0.75rem;

  .header {
    display: grid;
    gap: 0.5rem;
  }

  h4 {
    margin: 0;
    font-size: 1rem;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.45;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
`

const Notice = styled.div`
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray3};
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0.6rem 0.7rem;
  font-size: 0.82rem;
  line-height: 1.45;

  &[data-tone="success"] {
    border-color: ${({ theme }) => theme.colors.green7};
    background: ${({ theme }) => theme.colors.green3};
    color: ${({ theme }) => theme.colors.green11};
  }

  &[data-tone="error"] {
    border-color: ${({ theme }) => theme.colors.red7};
    background: ${({ theme }) => theme.colors.red3};
    color: ${({ theme }) => theme.colors.red11};
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
