import styled from "@emotion/styled"

export const NaverField = styled.div`
  position: relative;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 14px;
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : theme.colors.gray2)};
  min-height: 76px;
  padding: 1.55rem 0.92rem 0.48rem;
  box-shadow: ${({ theme }) =>
    theme.scheme === "light" ? "0 1px 0 rgba(15, 23, 42, 0.03)" : "none"};
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;

  &[data-active="true"] {
    border-color: ${({ theme }) => theme.colors.gray7};
    box-shadow: ${({ theme }) =>
      theme.scheme === "light" ? "0 0 0 2px rgba(148, 163, 184, 0.12)" : "0 0 0 2px rgba(148, 163, 184, 0.1)"};
  }
`

export const NaverFieldLabel = styled.label`
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

  &[data-active="true"] {
    top: 0.82rem;
    transform: translateY(0);
    font-size: 0.72rem;
    color: ${({ theme }) => theme.colors.gray11};
  }
`

export const NaverInput = styled.input`
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

  &[data-password="true"] {
    padding-right: 8.35rem;
  }
`

export const FieldActions = styled.div`
  position: absolute;
  top: 50%;
  right: 0.5rem;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 0.3rem;
`

export const PasswordActions = styled.div`
  position: absolute;
  top: 50%;
  right: 0.5rem;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 0.3rem;
`

export const GhostIconButton = styled.button`
  min-width: 44px;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 999px;
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : theme.colors.gray2)};
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.72rem;
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

  &.visibilityToggle {
    border: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    width: 44px;
    min-width: 44px;
  }

  svg {
    font-size: 0.74rem;
  }

  &.visibilityToggle svg {
    font-size: 1.12rem;
  }
`

export const LoginStateRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.9rem;
  margin-top: 0.12rem;
  margin-bottom: 0.06rem;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.42rem;
  }
`

export const FeedbackSlot = styled.div`
  min-height: 0;
  display: flex;
  align-items: stretch;

  &[data-filled="true"] {
    min-height: 4.6rem;
  }

  > * {
    width: 100%;
  }
`

export const KeepSignedInButton = styled.button`
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

  .checkIcon {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: ${({ theme }) => theme.colors.gray9};
    transition: color 0.2s ease, transform 0.2s ease;
  }

  .checkIcon svg {
    font-size: 1.45rem;
  }

  &[data-on="true"] .checkIcon {
    color: ${({ theme }) => theme.colors.gray11};
    transform: scale(1.03);
  }
`

export const IpSecurityToggle = styled.button`
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

  &[data-on="true"] .switch {
    background: rgba(18, 184, 134, 0.44);
    border-color: rgba(18, 184, 134, 0.76);
  }

  &[data-on="true"] .thumb {
    transform: translateX(20px);
  }

  &[data-on="true"] .state {
    color: ${({ theme }) => theme.colors.green10};
  }
`

export const IpSecurityControl = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.46rem;

  @media (max-width: 640px) {
    align-self: flex-end;
  }
`

export const IpSecurityInfoButton = styled.button`
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
`

export const PrimaryButton = styled.button`
  border: 0;
  border-radius: 12px;
  padding: 0.84rem 1rem;
  background: ${({ theme }) => theme.colors.accentLink};
  color: ${({ theme }) => theme.colors.accentControlText};
  font-weight: 700;
  cursor: pointer;
  box-shadow: ${({ theme }) =>
    theme.scheme === "light" ? `0 10px 22px color-mix(in srgb, ${theme.colors.accentLink} 18%, transparent)` : "none"};
  transition: filter 0.16s ease, box-shadow 0.16s ease;

  &:hover:not(:disabled) {
    filter: brightness(1.06);
  }

  &:disabled {
    opacity: 0.68;
    cursor: not-allowed;
  }
`

export const ErrorText = styled.p`
  margin: 0;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.statusDangerBorder};
  background: ${({ theme }) => theme.colors.statusDangerSurface};
  color: ${({ theme }) => theme.colors.statusDangerText};
  padding: 0.82rem 0.9rem;
  font-size: 0.9rem;
  line-height: 1.55;
`

export const SuccessText = styled.p`
  margin: 0;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.statusSuccessBorder};
  background: ${({ theme }) => theme.colors.statusSuccessSurface};
  color: ${({ theme }) => theme.colors.statusSuccessText};
  padding: 0.82rem 0.9rem;
  font-size: 0.87rem;
  line-height: 1.65;

  strong {
    font-weight: 800;
  }
`

export const FooterText = styled.p`
  margin: 0;

  a {
    display: inline-flex;
    align-items: center;
    min-height: 34px;
  }

  .policyLinks {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.7rem;
    margin-top: 0.25rem;
  }
`

export const SocialSection = styled.div`
  display: grid;
  gap: 0.8rem;
  margin-top: 0.15rem;

  > span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.88rem;
    font-weight: 700;
  }
`

export const SocialButtonRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`
