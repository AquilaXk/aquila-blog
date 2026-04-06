import styled from "@emotion/styled"
import React from "react"
import AppIcon from "src/components/icons/AppIcon"
import { Emoji } from "src/components/Emoji"
import { AdminProfile, useAdminProfile } from "src/hooks/useAdminProfile"
import { resolveContactLinks, resolveRenderableProfileLinkHref } from "src/libs/utils/profileCardLinks"

type Props = {
  initialAdminProfile?: AdminProfile | null
}

const ContactCard: React.FC<Props> = ({ initialAdminProfile = null }) => {
  const adminProfile = useAdminProfile(initialAdminProfile)
  const links = resolveContactLinks(adminProfile)
  if (links.length === 0) return null

  return (
    <>
      <StyledTitle>
        <Emoji className="titleEmoji">💬</Emoji> Contact
      </StyledTitle>
      <StyledWrapper>
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

          return (
            <a
              key={`${safeHref}-${item.label}`}
              href={safeHref}
              rel="noopener noreferrer"
              target="_blank"
              css={{ overflow: "hidden" }}
            >
              <AppIcon name={item.icon} className="icon" />
              <div className="name">{item.label}</div>
            </a>
          )
        })}
      </StyledWrapper>
    </>
  )
}

export default ContactCard

const StyledTitle = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.68rem;
  padding: 0.1rem 0;
  margin-bottom: 1rem;
  font-size: 1.22rem;
  line-height: 1.3;
  font-weight: 800;

  .titleEmoji {
    font-size: 1.38rem;
    flex: 0 0 auto;
  }
`
const StyledWrapper = styled.div`
  display: grid;
  gap: 0.72rem;
  padding: 1rem 1.05rem;
  margin-bottom: 2.15rem;
  border-radius: 24px;
  background: ${({ theme }) => theme.colors.gray2};

  a {
    display: flex;
    min-height: 50px;
    padding: 0.42rem 0.3rem;
    gap: 0.72rem;
    align-items: center;
    border-radius: 16px;
    color: ${({ theme }) => theme.colors.gray11};
    cursor: pointer;
    text-decoration: none;

    &:hover {
      color: ${({ theme }) => theme.colors.gray12};
      background: rgba(255, 255, 255, 0.02);
      text-decoration: underline;
      text-underline-offset: 3px;
    }
    .icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.35rem;
      height: 2.35rem;
      flex: 0 0 2.35rem;
      border-radius: 999px;
      background: ${({ theme }) => theme.colors.gray3};
      font-size: 1.08rem;
      line-height: 1;
    }
    .name {
      font-size: 0.95rem;
      line-height: 1.32rem;
      font-weight: 600;
    }
  }
`
