import styled from "@emotion/styled"
import { Toast } from "src/design-system/Toast"
import { focusVisibleRing } from "src/design-system/focusRing"
import { radius, semanticColors } from "src/design-system/tokens"

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
}: EditorStudioUndoToastProps) => (
  <Toast
    open={isVisible}
    message={message}
    tone="neutral"
    zIndex={140}
    actions={
      <UndoButton type="button" onClick={onUndo} disabled={isUndoDisabled}>
        실행 취소
      </UndoButton>
    }
  />
)

const UndoButton = styled.button`
  border: 1px solid ${({ theme }) => semanticColors(theme).border};
  border-radius: ${radius.sm}px;
  padding: 0.62rem 0.92rem;
  min-height: 44px;
  background: transparent;
  color: ${({ theme }) => semanticColors(theme).textSecondary};
  cursor: pointer;
  font-size: 0.84rem;
  font-weight: 600;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease;
  ${focusVisibleRing}

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => semanticColors(theme).borderStrong};
    background: ${({ theme }) => semanticColors(theme).surfaceMuted};
    color: ${({ theme }) => semanticColors(theme).textPrimary};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`
