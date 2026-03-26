import Link from "next/link"
import { CONFIG } from "site.config"
import styled from "@emotion/styled"
import BrandMark from "src/components/branding/BrandMark"
import { useAdminProfile } from "src/hooks/useAdminProfile"

const Logo = () => {
  const adminProfile = useAdminProfile()
  const blogTitle = adminProfile?.blogTitle?.trim() || CONFIG.blog.title

  return (
    <StyledWrapper href="/" aria-label={blogTitle}>
      <BrandMark className="brandMark" priority />
      <span className="brandText">{blogTitle}</span>
    </StyledWrapper>
  )
}

export default Logo

const StyledWrapper = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: clamp(0.34rem, 0.22rem + 0.26vw, 0.52rem);
  min-width: 0;
  max-width: 100%;
  min-height: 34px;
  color: ${({ theme }) => theme.colors.gray12};
  font-weight: 760;
  font-size: clamp(1.28rem, 1.04rem + 0.72vw, 1.72rem);
  letter-spacing: -0.03em;
  line-height: 1.1;

  .brandMark {
    display: block;
    flex-shrink: 0;
    width: clamp(1.42rem, 1.18rem + 0.48vw, 1.8rem);
    height: clamp(1.42rem, 1.18rem + 0.48vw, 1.8rem);
  }

  .brandText {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 720px) {
    font-size: clamp(1.08rem, 0.95rem + 0.5vw, 1.32rem);

    .brandMark {
      width: 1.32rem;
      height: 1.32rem;
    }
  }
`
