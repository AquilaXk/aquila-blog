import styled from "@emotion/styled"
import { AdminInlineActionRow } from "./AdminSurfacePrimitives"
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

    {confirmState ? (
      <ConfirmBackdrop role="presentation" onClick={onConfirmCancel}>
        <ConfirmDialog
          role="dialog"
          aria-modal="true"
          aria-labelledby="workspace-confirm-title"
          aria-describedby="workspace-confirm-description"
          onClick={(event) => event.stopPropagation()}
        >
          <strong id="workspace-confirm-title">{confirmState.headline}</strong>
          <p id="workspace-confirm-description">
            <span className="rowTitle">
              #{confirmState.rowId} {confirmState.rowTitle}
            </span>
            <span>{confirmState.description}</span>
          </p>
          <ActionRow>
            <GhostButton type="button" onClick={onConfirmCancel}>
              취소
            </GhostButton>
            <ConfirmButton type="button" data-tone={confirmState.tone} onClick={onConfirmAction}>
              {confirmState.confirmLabel}
            </ConfirmButton>
          </ActionRow>
        </ConfirmDialog>
      </ConfirmBackdrop>
    ) : null}
  </>
)

const ActionRow = styled(AdminInlineActionRow)``

const GhostButton = styled.button`
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
`

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

const ConfirmBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.56);
`

const ConfirmDialog = styled.div`
  width: min(28rem, 100%);
  display: grid;
  gap: 0.95rem;
  padding: 1.1rem;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  box-shadow: 0 24px 54px rgba(15, 23, 42, 0.24);

  > strong {
    font-size: 1.02rem;
    letter-spacing: -0.02em;
  }

  > p {
    margin: 0;
    display: grid;
    gap: 0.3rem;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.55;
  }

  .rowTitle {
    color: ${({ theme }) => theme.colors.gray12};
    font-weight: 800;
  }
`

const ConfirmButton = styled.button<{ "data-tone": "danger" }>`
  border: 0;
  background: ${({ theme }) => theme.colors.statusDangerSurface};
  color: ${({ theme }) => theme.colors.statusDangerText};
  min-height: 40px;
  padding: 0 0.85rem;
  border-radius: 10px;
  font-size: 0.92rem;
  font-weight: 800;
  cursor: pointer;
`
