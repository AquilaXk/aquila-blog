import styled from "@emotion/styled"
import { type ReactNode } from "react"
import { focusVisibleRing } from "./focusRing"
import { fixedBottomSafeArea, fixedHorizontalSafeArea } from "./safeArea"
import { editorialLabel, layoutBreakpoint, radius, semanticColors, space } from "./tokens"

export type ToastTone = "neutral" | "success" | "danger"

export type ToastProps = {
  message: string
  tone?: ToastTone
  open: boolean
  onOpenChange?: (open: boolean) => void
  title?: string
  actions?: ReactNode
  zIndex?: number
}

export const Toast = ({
  message,
  tone = "neutral",
  open,
  onOpenChange,
  title,
  actions,
  zIndex = 40,
}: ToastProps) => {
  if (!open) return null

  const showActions = Boolean(actions) || Boolean(onOpenChange)

  const isDanger = tone === "danger"

  return (
    <ToastViewport
      data-tone={tone}
      role={isDanger ? "alert" : "status"}
      aria-live={isDanger ? "assertive" : "polite"}
      $zIndex={zIndex}
    >
      <div className="copy">
        <span className="dot" aria-hidden="true" />
        <div className="text">
          {title ? <strong>{title}</strong> : null}
          <span>{message}</span>
        </div>
      </div>
      {showActions ? (
        <div className="actions">
          {actions}
          {onOpenChange ? (
            <DismissButton type="button" onClick={() => onOpenChange(false)}>
              닫기
            </DismissButton>
          ) : null}
        </div>
      ) : null}
    </ToastViewport>
  )
}

const toneColor = (tone: ToastTone, theme: Parameters<typeof semanticColors>[0]) => {
  const colors = semanticColors(theme)
  if (tone === "success") return colors.dotSuccess
  if (tone === "danger") return colors.dotDanger
  return colors.dotNeutral
}

const ToastViewport = styled.div<{ "data-tone": ToastTone; $zIndex: number }>`
  position: fixed;
  right: 1.2rem;
  ${fixedBottomSafeArea("1.2rem")}
  z-index: ${({ $zIndex }) => $zIndex};
  display: grid;
  gap: ${space[3]}px;
  min-width: min(24rem, calc(100vw - 2rem));
  max-width: min(28rem, calc(100vw - 2rem));
  padding: ${space[4]}px ${space[4]}px;
  border-radius: ${radius.md}px;
  border: 1px solid ${({ theme }) => semanticColors(theme).border};
  background: ${({ theme }) => semanticColors(theme).surface};
  color: ${({ theme }) => semanticColors(theme).textPrimary};
  box-shadow: none;

  .copy {
    display: flex;
    align-items: flex-start;
    gap: ${space[3]}px;
    min-width: 0;
  }

  .dot {
    width: 8px;
    height: 8px;
    margin-top: 0.45em;
    border-radius: 50%;
    flex: 0 0 auto;
    background: ${({ theme, "data-tone": tone }) => toneColor(tone, theme)};
  }

  .text {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
  }

  .text strong {
    font-family: ${editorialLabel.fontFamily};
    font-size: ${editorialLabel.fontSize};
    font-weight: ${editorialLabel.fontWeight};
    letter-spacing: ${editorialLabel.letterSpacing};
    text-transform: ${editorialLabel.textTransform};
    color: ${({ theme, "data-tone": tone }) => toneColor(tone, theme)};
  }

  .text span {
    color: ${({ theme }) => semanticColors(theme).textSecondary};
    font-size: 0.84rem;
    line-height: 1.55;
  }

  .actions {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
    align-items: center;
  }

  @media (max-width: ${layoutBreakpoint.editorCompact}px) {
    ${fixedHorizontalSafeArea("0.85rem")}
    ${fixedBottomSafeArea("0.85rem")}
    min-width: 0;
    max-width: none;
  }
`

const DismissButton = styled.button`
  border: 0;
  background: transparent;
  color: ${({ theme }) => semanticColors(theme).textSecondary};
  padding: 0;
  min-height: 44px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  ${focusVisibleRing}

  &:hover {
    color: ${({ theme }) => semanticColors(theme).textPrimary};
  }
`
