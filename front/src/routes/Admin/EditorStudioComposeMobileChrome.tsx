import styled from "@emotion/styled"

type EditorStudioComposeMobileChromeTone = "idle" | "loading" | "success" | "error"

export type EditorStudioComposeMobileStatus = {
  label: string
  tone: EditorStudioComposeMobileChromeTone
  text: string
}

type EditorStudioComposeMobileChromeProps = {
  showStatus: boolean
  showAction: boolean
  primaryStatus: EditorStudioComposeMobileStatus
  visibilityText: string
  secondaryStatusText?: string | null
  primaryActionLabel: string
  primaryActionDisabled: boolean
  onPrimaryAction: () => void
}

export const EditorStudioComposeMobileChrome = ({
  showStatus,
  showAction,
  primaryStatus,
  visibilityText,
  secondaryStatusText,
  primaryActionLabel,
  primaryActionDisabled,
  onPrimaryAction,
}: EditorStudioComposeMobileChromeProps) => (
  <>
    {showStatus ? (
      <MobileComposeStatusBar data-tone={primaryStatus.tone}>
        <div className="headline">
          <strong>{primaryStatus.label}</strong>
          <span>{primaryStatus.text}</span>
        </div>
        <div className="meta">
          <span className="pill">{visibilityText}</span>
          {secondaryStatusText ? <span className="pill">{secondaryStatusText}</span> : null}
        </div>
      </MobileComposeStatusBar>
    ) : null}
    {showAction ? (
      <MobilePrimaryActionBar>
        <PrimaryButton type="button" disabled={primaryActionDisabled} onClick={onPrimaryAction}>
          {primaryActionLabel}
        </PrimaryButton>
      </MobilePrimaryActionBar>
    ) : null}
  </>
)

const MobilePrimaryActionBar = styled.div`
  display: none;

  @media (max-width: 720px) {
    position: fixed;
    left: max(0.72rem, env(safe-area-inset-left, 0px));
    right: max(0.72rem, env(safe-area-inset-right, 0px));
    bottom: calc(0.72rem + env(safe-area-inset-bottom, 0px));
    z-index: 145;
    display: grid;
    gap: 0.42rem;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    border-radius: 12px;
    background: ${({ theme }) => theme.colors.gray2};
    padding: 0.54rem;
    box-shadow: 0 12px 28px rgba(2, 6, 23, 0.28);

    > button {
      width: 100%;
      justify-content: center;
      min-height: 40px;
    }
  }
`

const MobileComposeStatusBar = styled.div`
  display: none;

  @media (max-width: 720px) {
    position: sticky;
    top: calc(var(--app-header-height, 64px) + 0.3rem);
    z-index: 22;
    display: grid;
    gap: 0.5rem;
    margin-bottom: 0.72rem;
    padding: 0.72rem 0.82rem;
    border-radius: 14px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: color-mix(in srgb, ${({ theme }) => theme.colors.gray2} 92%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: 0 12px 28px rgba(2, 6, 23, 0.16);

    .headline {
      display: grid;
      gap: 0.16rem;
    }

    .headline strong {
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: -0.01em;
    }

    .headline span {
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.76rem;
      line-height: 1.45;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.42rem;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 26px;
      padding: 0 0.58rem;
      border-radius: 999px;
      border: 1px solid ${({ theme }) => theme.colors.gray6};
      background: ${({ theme }) => theme.colors.gray1};
      color: ${({ theme }) => theme.colors.gray11};
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: -0.01em;
    }

    /* 패밀리룩(1222): 파스텔 상태 면 → 헤어라인 보더(면 채색 제거) */
    &[data-tone="loading"] {
      border-color: ${({ theme }) => theme.colors.blue7};
    }

    &[data-tone="success"] {
      border-color: ${({ theme }) => theme.colors.green7};
    }

    &[data-tone="error"] {
      border-color: ${({ theme }) => theme.colors.red7};
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
