import Link from "next/link"
import { CONFIG } from "site.config"
import styled from "@emotion/styled"

type Props = {
  blogTitle?: string
}

const Logo = ({ blogTitle: blogTitleProp }: Props) => {
  const blogTitle = blogTitleProp?.trim() || CONFIG.blog.title

  return (
    <StyledWrapper href="/" aria-label={blogTitle}>
      <span className="brandMark" aria-hidden="true">
        <i />
        <b>A</b>
      </span>
      <span className="brandText">{blogTitle}</span>
      <em>ENGINEERING JOURNAL</em>
    </StyledWrapper>
  )
}

export default Logo

const StyledWrapper = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 0.625rem;
  min-width: 0;
  max-width: 100%;
  min-height: 40px;
  color: ${({ theme }) => theme.colors.gray12};
  font-weight: 850;
  font-size: 0.94rem;
  letter-spacing: -0.03em;
  line-height: 1.1;

  .brandMark {
    display: grid;
    grid-template-columns: 1fr 1fr;
    flex-shrink: 0;
    width: 1.75rem;
    height: 1.75rem;
    border: 1.5px solid currentColor;

    i {
      border-right: 1px solid currentColor;
      transform: skew(-18deg);
      margin-left: 7px;
    }

    b {
      align-self: center;
      color: currentColor;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 10px;
      line-height: 1;
      font-weight: 700;
    }
  }

  .brandText {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  em {
    color: ${({ theme }) => theme.colors.gray9};
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 0.625rem;
    line-height: 1;
    font-weight: 600;
    font-style: normal;
    letter-spacing: 0.08em;
    white-space: nowrap;
  }

  @media (max-width: 720px) {
    min-height: 36px;
    font-size: 1rem;

    .brandMark {
      width: 1.42rem;
      height: 1.42rem;
    }

    em {
      display: none;
    }
  }
`
