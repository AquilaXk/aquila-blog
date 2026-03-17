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
  display: inline-flex;
  align-items: center;
  min-width: 0;
  min-height: 34px;
  color: ${({ theme }) => theme.colors.gray12};
  font-weight: 760;
  font-size: clamp(1.28rem, 1.04rem + 0.72vw, 1.72rem);
  letter-spacing: -0.03em;
  line-height: 1.1;
  white-space: nowrap;

  @media (max-width: 720px) {
    font-size: clamp(1.08rem, 0.95rem + 0.5vw, 1.32rem);
    overflow: hidden;
    text-overflow: ellipsis;
  }
`
