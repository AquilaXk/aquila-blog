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
  gap: clamp(0.4rem, 0.24rem + 0.32vw, 0.6rem);
  min-width: 0;
  max-width: 100%;
  min-height: 40px;
  color: ${({ theme }) => theme.colors.gray12};
  font-weight: 760;
  font-size: clamp(1.42rem, 1.12rem + 0.8vw, 1.9rem);
  letter-spacing: -0.03em;
  line-height: 1.1;

  .brandMark {
    display: block;
    flex-shrink: 0;
    width: clamp(1.58rem, 1.24rem + 0.56vw, 1.96rem);
    height: clamp(1.58rem, 1.24rem + 0.56vw, 1.96rem);
  }

  .brandText {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 720px) {
    min-height: 36px;
    font-size: clamp(1.18rem, 1.02rem + 0.56vw, 1.46rem);

    .brandMark {
      width: 1.42rem;
      height: 1.42rem;
    }
  }
`
