import styled from "@emotion/styled"
import Link from "next/link"
import React from "react"

type Props = {}

const Footer: React.FC<Props> = () => {
  return (
    <StyledWrapper>
      <Link href="/">← Back</Link>
      <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
        ↑ Top
      </button>
    </StyledWrapper>
  )
}

export default Footer

const StyledWrapper = styled.div`
  display: flex;
  justify-content: space-between;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.gray10};
  a,
  button {
    margin-top: 0.5rem;
    cursor: pointer;

    :hover {
      color: ${({ theme }) => theme.colors.gray12};
    }
  }
`
