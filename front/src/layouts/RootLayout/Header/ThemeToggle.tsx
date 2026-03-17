import styled from "@emotion/styled"
import React from "react"
import AppIcon from "src/components/icons/AppIcon"
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
      aria-label={scheme === "light" ? "다크 모드로 전환" : "라이트 모드로 전환"}
      title={scheme === "light" ? "다크 모드" : "라이트 모드"}
    >
      {scheme === "light" ? <AppIcon name="sun" aria-hidden /> : <AppIcon name="moon" aria-hidden />}
    </StyledWrapper>
  )
}

export default ThemeToggle

const StyledWrapper = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-width: 0;
  height: 32px;
  border: none;
  border-radius: 8px;
  padding: 0 0.36rem;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.colors.gray12};
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-thickness: 1px;
  }

  svg {
    width: 18px;
    height: 18px;
    display: block;
    transform: translateY(-0.3px);
  }

  @media (max-width: 720px) {
    height: 28px;

    svg {
      width: 16px;
      height: 16px;
    }
  }
`
