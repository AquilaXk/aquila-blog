import styled from "@emotion/styled"
import React from "react"
import AppIcon, { IconName } from "src/components/icons/AppIcon"

export type SocialProvider = "kakao" | "google" | "github"

export type SocialAuthItem = {
  provider: SocialProvider
  onClick: () => void
  disabled?: boolean
}

type Size = "compact" | "regular"

type Props = {
  items: SocialAuthItem[]
  size?: Size
  className?: string
}

type ProviderMeta = {
  label: string
  icon: IconName
  background: string
  foreground: string
  border: string
}

const PROVIDER_META: Record<SocialProvider, ProviderMeta> = {
  kakao: {
    label: "카카오로 로그인",
    icon: "kakao",
    background: "#FEE500",
    foreground: "#111111",
    border: "#DCC300",
  },
  google: {
    label: "구글로 로그인",
    icon: "google",
    background: "#FFFFFF",
    foreground: "#202124",
    border: "#DADCE0",
  },
  github: {
    label: "깃허브로 로그인",
    icon: "github",
    background: "#24292F",
    foreground: "#FFFFFF",
    border: "#3F4A56",
  },
}

const SocialAuthButtons: React.FC<Props> = ({ items, size = "regular", className }) => {
  return (
    <StyledList className={className} data-size={size}>
      {items.map((item, index) => {
        const meta = PROVIDER_META[item.provider]

        return (
          <li key={`${item.provider}-${index}`}>
            <button
              type="button"
              className="providerButton"
              data-provider={item.provider}
              aria-label={meta.label}
              title={meta.label}
              onClick={item.onClick}
              disabled={item.disabled}
              style={
                {
                  "--provider-bg": meta.background,
                  "--provider-fg": meta.foreground,
                  "--provider-border": meta.border,
                } as React.CSSProperties
              }
            >
              <AppIcon name={meta.icon} aria-hidden="true" />
            </button>
          </li>
        )
      })}
    </StyledList>
  )
}

export default SocialAuthButtons

const StyledList = styled.ul`
  --social-button-size: 46px;

  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 0.58rem;

  &[data-size="compact"] {
    --social-button-size: 42px;
  }

  li {
    display: flex;
  }

  .providerButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--social-button-size);
    height: var(--social-button-size);
    border-radius: 999px;
    border: 1px solid var(--provider-border, ${({ theme }) => theme.colors.gray6});
    background: var(--provider-bg, ${({ theme }) => theme.colors.gray3});
    color: var(--provider-fg, ${({ theme }) => theme.colors.gray12});
    box-shadow:
      0 10px 18px rgba(0, 0, 0, 0.2),
      inset 0 0 0 1px rgba(255, 255, 255, 0.12);
    padding: 0;
    cursor: pointer;
    transition: transform 0.16s ease, box-shadow 0.16s ease, filter 0.16s ease, opacity 0.16s ease;

    svg {
      width: 52%;
      height: 52%;
      display: block;
    }

    &[data-provider="google"] svg {
      width: 56%;
      height: 56%;
    }

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow:
        0 14px 26px rgba(0, 0, 0, 0.26),
        inset 0 0 0 1px rgba(255, 255, 255, 0.16);
      filter: brightness(1.02);
    }

    &:focus-visible {
      outline: none;
      box-shadow:
        0 0 0 3px rgba(96, 165, 250, 0.34),
        0 10px 18px rgba(0, 0, 0, 0.2);
    }

    &:disabled {
      opacity: 0.58;
      cursor: not-allowed;
      transform: none;
    }
  }
`
