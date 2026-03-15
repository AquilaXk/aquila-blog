import Link from "next/link"
import { CONFIG } from "site.config"
import styled from "@emotion/styled"

const Logo = () => {
  return (
    <StyledWrapper href="/" aria-label={CONFIG.blog.title}>
      {CONFIG.blog.title}
    </StyledWrapper>
  )
}

export default Logo

const StyledWrapper = styled(Link)`
  display: inline-block;
  min-width: 0;
  color: ${({ theme }) => theme.colors.gray12};
  font-weight: 700;
  font-size: clamp(1.15rem, 0.95rem + 0.65vw, 1.55rem);
  letter-spacing: -0.02em;
  line-height: 1.1;
  white-space: nowrap;

  @media (max-width: 720px) {
    font-size: clamp(1.02rem, 0.9rem + 0.45vw, 1.22rem);
    overflow: hidden;
    text-overflow: ellipsis;
  }
`
