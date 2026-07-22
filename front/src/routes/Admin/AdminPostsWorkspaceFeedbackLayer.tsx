import styled from "@emotion/styled"
import { ConfirmDialog } from "src/design-system/ConfirmDialog"
import { Toast } from "src/design-system/Toast"
import { focusVisibleRing } from "src/design-system/focusRing"
import { semanticColors } from "src/design-system/tokens"
import { adminMutedSurface } from "./adminColorTokens"
import type { WorkspaceConfirmState, WorkspaceToastState } from "./AdminPostsWorkspaceModel"

type AdminPostsWorkspaceFeedbackLayerProps = {
  toast: WorkspaceToastState
  confirmState: WorkspaceConfirmState
  onToastAction: () => void
  onToastDismiss: () => void
  onConfirmCancel: () => void
  onConfirmAction: () => void
}

export const AdminPostsWorkspaceFeedbackLayer: React.FC<AdminPostsWorkspaceFeedbackLayerProps> = ({
  toast,
  confirmState,
  onToastAction,
  onToastDismiss,
  onConfirmCancel,
  onConfirmAction,
}) => (
  <>
    <Toast
      open={Boolean(toast)}
      tone={toast?.tone === "error" ? "danger" : "success"}
      title={toast?.tone === "error" ? "작업 실패" : "작업 완료"}
      message={toast?.text ?? ""}
      onOpenChange={(open) => {
        if (!open) onToastDismiss()
      }}
      actions={
        toast?.action ? (
          <ToastActionButton type="button" onClick={onToastAction}>
            {toast.actionLabel}
          </ToastActionButton>
        ) : null
      }
    />

    <ConfirmDialog
      open={Boolean(confirmState)}
      titleId="workspace-confirm-title"
      descriptionId="workspace-confirm-description"
      title={confirmState?.headline ?? ""}
      description={
        confirmState ? (
          <>
            <span className="rowTitle">
              #{confirmState.rowId} {confirmState.rowTitle}
            </span>
            <span>{confirmState.description}</span>
          </>
        ) : null
      }
      confirmLabel={confirmState?.confirmLabel ?? ""}
      confirmTone={confirmState?.tone ?? "danger"}
      actionRowBackground={adminMutedSurface}
      onConfirm={onConfirmAction}
      onCancel={onConfirmCancel}
    />
  </>
)

const ToastActionButton = styled.button`
  border: 0;
  background: transparent;
  color: ${({ theme }) => semanticColors(theme).accentLink};
  padding: 0;
  min-height: 44px;
  font-size: 0.84rem;
  font-weight: 800;
  cursor: pointer;
  ${focusVisibleRing}
`
