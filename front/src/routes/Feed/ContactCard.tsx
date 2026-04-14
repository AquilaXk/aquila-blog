import styled from "@emotion/styled"
import React from "react"
import AppIcon from "src/components/icons/AppIcon"
import { Emoji } from "src/components/Emoji"
import { AdminProfile, useAdminProfile } from "src/hooks/useAdminProfile"
import { formatProfileLinkHint, resolveContactLinks, resolveRenderableProfileLinkHref } from "src/libs/utils/profileCardLinks"

type Props = {
  initialAdminProfile?: AdminProfile | null
}

const ContactCard: React.FC<Props> = ({ initialAdminProfile = null }) => {
  const adminProfile = useAdminProfile(initialAdminProfile)
  const links = resolveContactLinks(adminProfile)
  if (links.length === 0) return null

  return (
    <StyledSection data-ui="feed-contact-section">
      <StyledTitle>
        <Emoji className="titleEmoji">💬</Emoji> Contact
      </StyledTitle>
      <StyledContent data-ui="feed-contact-links">
        {links.map((item) => {
          const safeHref = resolveRenderableProfileLinkHref("contact", item.href)
          const canRenderHref = Boolean(
            safeHref &&
              (safeHref.startsWith("https://") ||
                safeHref.startsWith("http://") ||
                safeHref.startsWith("mailto:") ||
                safeHref.startsWith("tel:"))
          )
          if (!canRenderHref || !safeHref) return null
          const hint = formatProfileLinkHint(safeHref)

          return (
            <a
              key={`${safeHref}-${item.label}`}
              href={safeHref}
              rel="noopener noreferrer"
              target="_blank"
              css={{ overflow: "hidden" }}
            >
              <AppIcon name={item.icon} className="icon" />
              <div className="copy">
                <div className="name">{item.label}</div>
                {hint ? <div className="hint">{hint}</div> : null}
              </div>
            </a>
          )
        })}
      </StyledContent>
    </StyledSection>
  )
}

export default ContactCard

const StyledSection = styled.section`
  margin-bottom: 1.4rem;
`

const StyledTitle = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem;
  margin-bottom: 0.75rem;
  font-size: 1.05rem;
  line-height: 1.35;
  font-weight: 800;

  .titleEmoji {
    font-size: 1.15rem;
    flex: 0 0 auto;
  }
`

const StyledContent = styled.div`
  display: grid;
  gap: 0.22rem;
  width: 100%;
  padding: 0 0 0.8rem;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};

  a {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    min-height: 44px;
    padding: 0.48rem 0.2rem;
    gap: 0.72rem;
    align-items: center;
    border-radius: 14px;
    color: ${({ theme }) => theme.colors.gray11};
    cursor: pointer;
    text-decoration: none;
    transition: background-color 120ms ease, color 120ms ease;

    &:hover {
      color: ${({ theme }) => theme.colors.gray12};
      background: rgba(255, 255, 255, 0.028);
    }

    .icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2rem;
      height: 2rem;
      flex: 0 0 2rem;
      border-radius: 12px;
      border: 1px solid ${({ theme }) => theme.colors.gray6};
      background: rgba(255, 255, 255, 0.01);
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.98rem;
      line-height: 1;
    }

    .copy {
      min-width: 0;
    }

    .name {
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 0.93rem;
      line-height: 1.24rem;
      font-weight: 600;
    }

    .hint {
      margin-top: 0.14rem;
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.78rem;
      line-height: 1.24;
      word-break: break-word;
    }
  }
`
