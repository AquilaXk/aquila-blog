import styled from "@emotion/styled"

type EditorStudioUndoToastProps = {
  isVisible: boolean
  message: string
  isUndoDisabled: boolean
  onUndo: () => void
}

export const EditorStudioUndoToast = ({
  isVisible,
  message,
  isUndoDisabled,
  onUndo,
}: EditorStudioUndoToastProps) => {
  if (!isVisible) return null

  return (
    <ToastShell role="status" aria-live="polite">
      <p>{message}</p>
      <Button type="button" onClick={onUndo} disabled={isUndoDisabled}>
        실행 취소
      </Button>
    </ToastShell>
  )
}

const ToastShell = styled.div`
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 140;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.72rem;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.8rem;
  }

  @media (max-width: 720px) {
    left: 0.85rem;
    right: 0.85rem;
    bottom: calc(0.85rem + env(safe-area-inset-bottom));
    flex-wrap: wrap;
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
