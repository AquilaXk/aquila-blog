import styled from "@emotion/styled"

export const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(7, 9, 12, 0.74);
  backdrop-filter: blur(4px);
`

export const Modal = styled.div`
  position: relative;
  width: min(100%, 520px);
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  overflow: hidden;
  background: ${({ theme }) => theme.colors.gray2};
  box-shadow: 0 28px 70px rgba(0, 0, 0, 0.42);

  .formPane {
    position: relative;
    padding: 1.6rem 1.5rem 1.4rem;
    background: ${({ theme }) => theme.colors.gray2};
  }

  .closeButton {
    position: absolute;
    top: 0.85rem;
    right: 0.85rem;
    min-width: 34px;
    width: 34px;
    height: 34px;
    padding: 0;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray10};
    transition: filter 0.16s ease, opacity 0.16s ease;

    &:hover:not(:disabled) {
      filter: brightness(1.08);
    }
  }

  .closeButton svg {
    font-size: 0.94rem;
  }

  h4 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.68rem;
    line-height: 1.25;
    font-weight: 800;
    letter-spacing: -0.01em;
  }

  .formDescription {
    margin: 0.62rem 0 1.05rem;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.55;
    font-size: 0.88rem;
    max-width: 34rem;
  }

  .loginForm {
    display: grid;
    gap: 0.72rem;
    margin-top: 0.82rem;
    margin-bottom: 1rem;
  }

  .panelFallback {
    display: grid;
    gap: 0.72rem;
    margin-bottom: 0.5rem;
  }

  .panelFallback .line,
  .panelFallback .button {
    border-radius: 12px;
    background: linear-gradient(90deg, rgba(148, 163, 184, 0.1), rgba(148, 163, 184, 0.18));
  }

  .panelFallback .line {
    height: 46px;
  }

  .panelFallback .line.large {
    height: 74px;
  }

  .panelFallback .line.short {
    width: 56%;
  }

  .panelFallback .button {
    height: 52px;
    margin-top: 0.2rem;
  }

  .requiredConsentBox {
    display: grid;
    gap: 0.5rem;
    margin: -0.12rem 0 0.12rem;
    padding: 0.78rem 0.82rem;
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    border-radius: 12px;
    background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : theme.colors.gray2)};
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
    line-height: 1.55;
  }

  .requiredConsentBox p {
    margin: 0;
  }

  .requiredConsentBox label {
    display: flex;
    align-items: flex-start;
    gap: 0.44rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-weight: 650;
  }

  .requiredConsentBox input {
    width: 16px;
    height: 16px;
    margin-top: 0.15rem;
    accent-color: ${({ theme }) => theme.colors.accentControl};
    flex: 0 0 auto;
  }

  .requiredConsentBox a {
    color: ${({ theme }) => theme.colors.accentLink};
    font-weight: 700;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .naverField {
    position: relative;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    border-radius: 14px;
    background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : theme.colors.gray2)};
    min-height: 76px;
    padding: 1.55rem 0.92rem 0.48rem;
    box-shadow: ${({ theme }) =>
      theme.scheme === "light" ? "0 1px 0 rgba(15, 23, 42, 0.03)" : "none"};
    transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
  }

  .naverField.isActive {
    border-color: ${({ theme }) => theme.colors.gray7};
    box-shadow: ${({ theme }) =>
      theme.scheme === "light" ? "0 0 0 2px rgba(148, 163, 184, 0.12)" : "0 0 0 2px rgba(148, 163, 184, 0.1)"};
  }

  .naverFieldLabel {
    position: absolute;
    left: 0.92rem;
    top: 50%;
    transform: translateY(-50%);
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.9rem;
    font-weight: 600;
    line-height: 1;
    pointer-events: none;
    transition: top 0.2s ease, transform 0.2s ease, font-size 0.2s ease, color 0.2s ease;
  }

  .naverField.isActive .naverFieldLabel {
    top: 0.82rem;
    transform: translateY(0);
    font-size: 0.72rem;
    color: ${({ theme }) => theme.colors.gray11};
  }

  .naverFieldInput {
    width: 100%;
    border: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray12};
    min-height: 42px;
    padding: 0;
    font-size: 1.05rem;
    font-weight: 650;
    line-height: 1.3;

    &::placeholder {
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.96rem;
      font-weight: 500;
    }

    &:focus {
      outline: none;
    }
  }

  .passwordField .naverFieldInput {
    padding-right: 8.35rem;
  }

  .fieldGhostButton {
    position: absolute;
    top: 50%;
    right: 0.5rem;
    transform: translateY(-50%);
    min-width: 44px;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    border-radius: 999px;
    background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : theme.colors.gray2)};
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.72rem;
    font-weight: 600;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: filter 0.16s ease;

    &:hover:not(:disabled) {
      filter: brightness(1.08);
    }

    &:disabled {
      opacity: 0.62;
      cursor: not-allowed;
    }
  }

  .fieldGhostButton svg {
    font-size: 0.74rem;
  }

  .fieldGhostButton.visibilityToggle {
    border: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    width: 44px;
    min-width: 44px;
  }

  .fieldGhostButton.visibilityToggle svg {
    font-size: 1.12rem;
  }

  .passwordActions {
    position: absolute;
    top: 50%;
    right: 0.5rem;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .loginStateRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.9rem;
    margin-top: 0.12rem;
    margin-bottom: 0.06rem;
  }

  .keepSignedInButton {
    display: inline-flex;
    align-items: center;
    gap: 0.46rem;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.9rem;
    font-weight: 650;
    min-height: 44px;
    padding: 0.22rem 0.2rem;
    border-radius: 10px;
    touch-action: manipulation;

    .checkBadge {
      width: 28px;
      height: 28px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: ${({ theme }) => theme.colors.gray9};
      transition: color 0.2s ease, transform 0.2s ease;
    }

    .checkBadge svg {
      font-size: 1.45rem;
    }

    &.isOn .checkBadge {
      color: ${({ theme }) => theme.colors.gray11};
      transform: scale(1.03);
    }
  }

  .ipSecurityToggle {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.9rem;
    font-weight: 700;
    min-height: 44px;
    padding: 0.22rem 0;
    touch-action: manipulation;

    .switch {
      width: 52px;
      height: 30px;
      border-radius: 999px;
      border: 1px solid ${({ theme }) => theme.colors.gray7};
      background: ${({ theme }) => theme.colors.gray5};
      padding: 2px;
      display: inline-flex;
      align-items: center;
      transition: background-color 0.2s ease, border-color 0.2s ease;
    }

    .thumb {
      width: 24px;
      height: 24px;
      border-radius: 999px;
      background: ${({ theme }) => theme.colors.gray1};
      transition: transform 0.22s ease;
      transform: translateX(0);
    }

    .state {
      width: 28px;
      text-align: right;
      color: ${({ theme }) => theme.colors.gray10};
      transition: color 0.2s ease;
    }

    &.isOn .switch {
      background: rgba(18, 184, 134, 0.44);
      border-color: rgba(18, 184, 134, 0.76);
    }

    &.isOn .thumb {
      transform: translateX(20px);
    }

    &.isOn .state {
      color: ${({ theme }) => theme.colors.green10};
    }
  }

  .ipSecurityControl {
    display: inline-flex;
    align-items: center;
    gap: 0.46rem;
  }

  .ipSecurityInfoButton {
    border: 0;
    min-height: 44px;
    padding: 0.15rem 0.3rem;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.9rem;
    font-weight: 700;
    text-decoration: underline;
    text-decoration-color: ${({ theme }) => theme.colors.gray7};
    text-underline-offset: 2px;
    cursor: pointer;

    &:hover {
      color: ${({ theme }) => theme.colors.accentLink};
      text-decoration-color: ${({ theme }) => theme.colors.accentBorder};
    }
  }

  .inlineError {
    margin: 0;
    border-radius: 10px;
    border: 1px solid ${({ theme }) => theme.colors.statusDangerBorder};
    background: ${({ theme }) => theme.colors.statusDangerSurface};
    color: ${({ theme }) => theme.colors.statusDangerText};
    padding: 0.66rem 0.76rem;
    font-size: 0.84rem;
    line-height: 1.5;
  }

  .primaryAction,
  .secondaryAction {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: ${({ theme }) => `${theme.variables.ui.button.minHeight}px`};
    border-radius: ${({ theme }) => `${theme.variables.ui.button.radius}px`};
    font-size: ${({ theme }) => `${theme.variables.ui.button.fontSize}rem`};
    font-weight: 700;
  }

  .primaryAction {
    border: 0;
    background: ${({ theme }) => theme.colors.accentLink};
    color: ${({ theme }) => theme.colors.accentControlText};
    box-shadow: ${({ theme }) =>
      theme.scheme === "light"
        ? `0 10px 22px color-mix(in srgb, ${theme.colors.accentLink} 18%, transparent)`
        : "none"};
    transition: filter 0.16s ease, box-shadow 0.16s ease;

    &:hover:not(:disabled) {
      filter: brightness(1.06);
    }
  }

  .secondaryAction {
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
  }

  .primaryAction:disabled,
  .secondaryAction:disabled {
    opacity: 0.62;
    cursor: not-allowed;
  }

  .socialSection {
    display: grid;
    gap: 0.5rem;
    margin-bottom: 0.9rem;
    padding-top: 0.72rem;
    border-top: 1px solid ${({ theme }) => theme.colors.gray6};

    span {
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.82rem;
      font-weight: 600;
    }
  }

  .socialButtonRow {
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }

  .signupRow {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.86rem;
    margin-bottom: 0;
  }

  .inlineLinkButton {
    border: 0;
    background: transparent;
    min-height: auto;
    padding: 0;
    color: ${({ theme }) => theme.colors.accentLink};
    font-size: 0.86rem;
    font-weight: 700;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
      text-underline-offset: 2px;
    }
  }

  .sentState {
    display: grid;
    gap: 0.9rem;
  }

  .sentCard {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.8rem;
    padding: 0.95rem 1rem;
    border-radius: 16px;
    border: 1px solid ${({ theme }) => theme.colors.statusSuccessBorder};
    background: ${({ theme }) => theme.colors.statusSuccessSurface};
    color: ${({ theme }) => theme.colors.green11};

    svg {
      font-size: 1.3rem;
      margin-top: 0.1rem;
    }

    strong {
      display: block;
      font-size: 0.95rem;
      word-break: break-word;
    }

    p {
      margin: 0.18rem 0 0;
      font-size: 0.84rem;
      line-height: 1.6;
    }
  }

  .sentActions {
    display: grid;
    gap: 0.55rem;
  }

  @media (max-width: 640px) {
    width: min(100%, 500px);

    .formPane {
      padding: 1.2rem 1rem 1.05rem;
    }

    h4 {
      font-size: 1.48rem;
    }

    .formDescription {
      margin-bottom: 0.95rem;
      font-size: 0.84rem;
    }

    .loginStateRow {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.42rem;
    }

    .ipSecurityControl {
      align-self: flex-end;
    }
  }
`
