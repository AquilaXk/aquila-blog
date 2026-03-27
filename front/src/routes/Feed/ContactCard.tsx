import styled from "@emotion/styled"
import React from "react"
import AppIcon from "src/components/icons/AppIcon"
import { Emoji } from "src/components/Emoji"
import { AdminProfile, useAdminProfile } from "src/hooks/useAdminProfile"
import { resolveContactLinks } from "src/libs/utils/profileCardLinks"

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
        {links.map((item) => (
          <a
            key={`${item.href}-${item.label}`}
            href={item.href}
            rel="noopener noreferrer"
            target="_blank"
            css={{ overflow: "hidden" }}
          >
            <AppIcon name={item.icon} className="icon" />
            <div className="name">{item.label}</div>
          </a>
        ))}
      </StyledWrapper>
    </>
  )
}

export default ContactCard

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
const StyledWrapper = styled.div`
  display: flex;
  padding: 0.15rem 0;
  flex-direction: column;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  a {
    display: flex;
    padding: 0.75rem 0.1rem;
    gap: 0.75rem;
    align-items: center;
    border-radius: 0;
    color: ${({ theme }) => theme.colors.gray11};
    cursor: pointer;

    &:hover {
      color: ${({ theme }) => theme.colors.gray12};
      background: transparent;
      text-decoration: underline;
      text-underline-offset: 3px;
    }
    .icon {
      font-size: 1.5rem;
      line-height: 2rem;
    }
    .name {
      font-size: 0.95rem;
      line-height: 1.35rem;
      font-weight: 500;
    }
  }
`
