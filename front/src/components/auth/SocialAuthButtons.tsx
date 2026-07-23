import styled from "@emotion/styled"
import React from "react"
import AppIcon from "src/components/icons/AppIcon"

export type SocialProvider = "kakao"

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
}

const PROVIDER_META: Record<SocialProvider, ProviderMeta> = {
  kakao: {
    label: "카카오톡으로 계속하기",
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
            >
              <AppIcon name="kakao" aria-hidden="true" />
              <span>{meta.label}</span>
            </button>
          </li>
        )
      })}
    </StyledList>
  )
}

export default SocialAuthButtons

const StyledList = styled.ul`
  --social-button-height: 52px;
  --social-button-radius: 12px;
  --social-button-font-size: 0.98rem;

  margin: 0;
  padding: 0;
  width: 100%;
  list-style: none;
  display: grid;
  gap: 0.65rem;

  &[data-size="compact"] {
    --social-button-height: 44px;
    --social-button-font-size: 0.92rem;
  }

  li {
    display: flex;
    min-width: 0;
  }

  .providerButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    width: 100%;
    min-height: var(--social-button-height);
    border-radius: var(--social-button-radius);
    border: 0;
    background: ${({ theme }) => theme.colors.kakaoLoginBackground};
    color: ${({ theme }) => theme.colors.kakaoLoginText};
    box-shadow: none;
    padding: 0 1rem;
    font-size: var(--social-button-font-size);
    font-weight: 800;
    letter-spacing: 0;
    cursor: pointer;
    transition: filter 0.16s ease, opacity 0.16s ease;

    svg {
      width: 1.25em;
      height: 1.25em;
      flex: 0 0 auto;
      display: block;
    }

    span {
      min-width: 0;
      white-space: nowrap;
    }

    &:hover:not(:disabled) {
      filter: brightness(0.98);
    }

    &:focus-visible {
      outline: none;
      box-shadow:
        0 0 0 3px ${({ theme }) => theme.colors.blue4},
        0 0 0 1px ${({ theme }) => theme.colors.kakaoLoginFocusBorder};
    }

    &:disabled {
      opacity: 0.58;
      cursor: not-allowed;
    }
  }
`
