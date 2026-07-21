import type { Theme } from "@emotion/react"
import styled from "@emotion/styled"
import { useRef, type ReactNode } from "react"
import { focusVisibleRing } from "./focusRing"
import { useModalFocusTrap } from "./useModalFocusTrap"

export type ConfirmDialogTone = "default" | "danger"

export type ConfirmDialogProps = {
  open: boolean
  titleId: string
  descriptionId: string
  title: ReactNode
  description: ReactNode
  confirmLabel: string
  cancelLabel?: string
  confirmTone?: ConfirmDialogTone
  actionRowBackground?: (theme: Theme) => string
  onConfirm: () => void
  onCancel: () => void
}

export const ConfirmDialog = ({
  open,
  titleId,
  descriptionId,
  title,
  description,
  confirmLabel,
  cancelLabel = "취소",
  confirmTone = "danger",
  actionRowBackground,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  const { handleKeyDown } = useModalFocusTrap({
    open,
    onClose: onCancel,
    containerRef: dialogRef,
    initialFocusRef: cancelButtonRef,
  })

  if (!open) return null

  return (
    <ConfirmBackdrop role="presentation" onClick={onCancel}>
      <ConfirmPanel
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <strong id={titleId}>{title}</strong>
        <Description id={descriptionId}>{description}</Description>
        <ActionRow $actionRowBackground={actionRowBackground}>
          <GhostButton ref={cancelButtonRef} type="button" onClick={onCancel}>
            {cancelLabel}
          </GhostButton>
          <ConfirmButton type="button" data-tone={confirmTone} onClick={onConfirm}>
            {confirmLabel}
          </ConfirmButton>
        </ActionRow>
      </ConfirmPanel>
    </ConfirmBackdrop>
  )
}

const ConfirmBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: color-mix(in srgb, ${({ theme }) => theme.colors.gray12} 42%, transparent);
`

const ConfirmPanel = styled.div`
  width: min(28rem, 100%);
  display: grid;
  gap: 0.95rem;
  padding: 1.1rem;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  box-shadow: none;

  > strong {
    font-size: 1.02rem;
    letter-spacing: -0.02em;
  }
`

const Description = styled.p`
  margin: 0;
  display: grid;
  gap: 0.3rem;
  color: ${({ theme }) => theme.colors.gray10};
  line-height: 1.55;

  .rowTitle {
    color: ${({ theme }) => theme.colors.gray12};
    font-weight: 800;
  }
`

const ActionRow = styled.div<{ $actionRowBackground?: (theme: Theme) => string }>`
  display: flex;
  gap: 0.55rem;
  align-items: center;
  flex-wrap: wrap;
  width: fit-content;
  max-width: 100%;
  padding: 0.42rem 0.48rem;
  border-radius: 6px;
  background: ${({ theme, $actionRowBackground }) =>
    $actionRowBackground ? $actionRowBackground(theme) : theme.colors.gray2};
`

const GhostButton = styled.button`
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
  ${focusVisibleRing}
`

const ConfirmButton = styled.button`
  border: 1px solid ${({ theme }) => theme.colors.statusDangerBorder};
  background: transparent;
  color: ${({ theme }) => theme.colors.statusDangerText};
  min-height: 40px;
  padding: 0 0.85rem;
  border-radius: 8px;
  font-size: 0.92rem;
  font-weight: 800;
  cursor: pointer;
  ${focusVisibleRing}
`
