import styled from "@emotion/styled"
import { useRouter } from "next/router"
import React from "react"

type Props = {
  children: string
}

const Tag: React.FC<Props> = ({ children }) => {
  const router = useRouter()

  const handleClick = (event?: React.SyntheticEvent) => {
    event?.preventDefault()
    event?.stopPropagation()
    router.push({
      query: {
        ...router.query,
        tag: children,
      },
    }, undefined, { shallow: true, scroll: false })
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return
    handleClick(event)
  }

  return (
    <StyledWrapper
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`Filter by tag: ${children}`}
    >
      {children}
    </StyledWrapper>
  )
}

export default Tag

const StyledWrapper = styled.span`
  display: inline-block;
  padding-top: 0.25rem;
  padding-bottom: 0.25rem;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
  border-radius: 50px;
  font-size: 0.75rem;
  line-height: 1rem;
  font-weight: 400;
  color: ${({ theme }) => theme.colors.gray10};
  background-color: ${({ theme }) => theme.colors.gray5};
  cursor: pointer;
`
