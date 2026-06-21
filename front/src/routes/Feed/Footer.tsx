import { CONFIG } from "site.config"
import Link from "next/link"
import React from "react"
import styled from "@emotion/styled"

const d = new Date()
const y = d.getFullYear()
const from = +CONFIG.since

type Props = {
  className?: string
}

const Footer: React.FC<Props> = ({ className }) => {
  return (
    <StyledWrapper className={className}>
      <div className="footerLinks">
        <a
          href={`https://github.com/${CONFIG.profile.github}`}
          target="_blank"
          rel="noreferrer"
        >
          © {CONFIG.profile.name} {from === y || !from ? y : `${from} - ${y}`}
        </a>
        <Link href="/privacy">개인정보처리방침</Link>
        <Link href="/terms">이용약관</Link>
      </div>
    </StyledWrapper>
  )
}

export default Footer

const StyledWrapper = styled.footer`
  .footerLinks {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.45rem 0.85rem;
  }

  a {
    display: inline-flex;
    align-items: center;
    min-height: 34px;
    margin-top: 0.75rem;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: ${({ theme }) => theme.colors.gray10};
  }
`
