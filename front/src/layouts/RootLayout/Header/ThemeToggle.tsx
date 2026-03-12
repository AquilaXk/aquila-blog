import styled from "@emotion/styled"
import React from "react"
import { IoMoon, IoSunny } from "react-icons/io5"
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
      {scheme === "light" ? <IoSunny aria-hidden /> : <IoMoon aria-hidden />}
    </StyledWrapper>
  )
}

export default ThemeToggle

const StyledWrapper = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  border-radius: 999px;
  padding: 0;
  background: ${({ theme }) => theme.colors.gray3};
  color: ${({ theme }) => theme.colors.gray12};
  cursor: pointer;

  svg {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.98rem;
    line-height: 1;
  }

  @media (max-width: 720px) {
    width: 30px;
    height: 30px;

    svg {
      font-size: 0.92rem;
    }
  }
`
