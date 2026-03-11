import styled from "@emotion/styled"
import Link from "next/link"
import React from "react"

type Props = {}

const Footer: React.FC<Props> = () => {
  return (
    <StyledWrapper>
      <Link href="/">목록으로 돌아가기</Link>
      <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
        맨 위로 이동
      </button>
    </StyledWrapper>
  )
}

export default Footer

const StyledWrapper = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-top: 2.25rem;
  padding-top: 1.1rem;
  border-top: 1px solid ${({ theme }) => theme.colors.gray6};

  a,
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    padding: 0 0.15rem;
    border: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.92rem;
    font-weight: 700;
    cursor: pointer;

    :hover {
      color: ${({ theme }) => theme.colors.gray12};
    }
  }
`
