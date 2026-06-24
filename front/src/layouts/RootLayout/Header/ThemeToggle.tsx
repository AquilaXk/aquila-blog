import styled from "@emotion/styled"
import React from "react"
import useScheme from "src/hooks/useScheme"

type Props = {}

const ThemeToggle: React.FC<Props> = () => {
  const [scheme, setScheme] = useScheme()

  const handleClick = () => {
    setScheme(scheme === "light" ? "dark" : "light")
  }

  return (
    <StyledWrapper
      type="button"
      onClick={handleClick}
      aria-label="테마 전환"
      title="테마 전환"
    >
      <span className="themeIcon themeIconLight">
        <SunIcon />
      </span>
      <span className="themeIcon themeIconDark">
        <MoonIcon />
      </span>
    </StyledWrapper>
  )
}

export default ThemeToggle

const SunIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.5v2.1M12 19.4v2.1M4.6 4.6l1.5 1.5M17.9 17.9l1.5 1.5M2.5 12h2.1M19.4 12h2.1M4.6 19.4l1.5-1.5M17.9 6.1l1.5-1.5" strokeLinecap="round" />
  </svg>
)

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M19.35 14.15A7.95 7.95 0 1 1 10.05 4.7a6.45 6.45 0 0 0 9.3 9.45Z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const StyledWrapper = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border: 1px solid transparent;
  border-radius: ${({ theme }) => theme.variables.ui.button.radius}px;
  padding: 0;
  background: transparent;
  color: var(--aq-muted);
  cursor: pointer;

  &:hover {
    border-color: var(--aq-border);
    background: var(--aq-surface);
    color: var(--aq-text);
  }

  .themeIcon {
    display: inline-flex;
  }

  .themeIconDark {
    display: none;
  }

  html[data-aquila-scheme="dark"] & .themeIconLight {
    display: none;
  }

  html[data-aquila-scheme="dark"] & .themeIconDark {
    display: inline-flex;
  }

  svg {
    width: 18px;
    height: 18px;
    display: block;
    transform: translateY(-0.3px);
  }

  @media (max-width: 720px) {
    width: 36px;
    height: 36px;
  }
`
