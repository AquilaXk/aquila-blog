import styled from "@emotion/styled"
import { ConfirmDialog } from "src/design-system/ConfirmDialog"
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
    {toast ? (
      <ToastViewport data-tone={toast.tone} role="status" aria-live="polite">
        <div className="copy">
          <strong>{toast.tone === "error" ? "작업 실패" : "작업 완료"}</strong>
          <span>{toast.text}</span>
        </div>
        <div className="actions">
          {toast.action ? (
            <ToastActionButton type="button" onClick={onToastAction}>
              {toast.actionLabel}
            </ToastActionButton>
          ) : null}
          <ToastDismissButton type="button" onClick={onToastDismiss}>
            닫기
          </ToastDismissButton>
        </div>
      </ToastViewport>
    ) : null}

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

const ToastViewport = styled.div<{ "data-tone": "success" | "error" }>`
  position: fixed;
  right: 1.2rem;
  bottom: 1.2rem;
  z-index: 40;
  display: grid;
  gap: 0.55rem;
  min-width: min(24rem, calc(100vw - 2rem));
  max-width: min(28rem, calc(100vw - 2rem));
  padding: 0.95rem 1rem;
  border-radius: 16px;
  border: 1px solid
    ${({ theme, "data-tone": tone }) =>
      tone === "error" ? theme.colors.statusDangerBorder : theme.colors.statusSuccessBorder};
  background: ${({ theme }) => theme.colors.gray1};
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.18);

  .copy {
    display: grid;
    gap: 0.2rem;
  }

  .copy strong {
    font-size: 0.92rem;
  }

  .copy span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
    line-height: 1.55;
  }

  .actions {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  @media (max-width: 767px) {
    left: 0.85rem;
    right: 0.85rem;
    bottom: 0.85rem;
    min-width: 0;
    max-width: none;
  }
`

const ToastActionButton = styled.button`
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.blue9};
  padding: 0;
  font-size: 0.84rem;
  font-weight: 800;
  cursor: pointer;
`

const ToastDismissButton = styled.button`
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
`
