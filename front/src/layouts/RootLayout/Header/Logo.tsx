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
  white-space: nowrap;

  @media (max-width: 720px) {
    overflow: hidden;
    text-overflow: ellipsis;
  }
`
