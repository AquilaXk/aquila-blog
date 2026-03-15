import styled from "@emotion/styled"
import React from "react"
import AppIcon from "src/components/icons/AppIcon"
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
        <AppIcon name="message" className="titleIcon" /> Contact
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
  gap: 0.35rem;
  padding: 0.25rem;
  margin-bottom: 0.75rem;

  .titleIcon {
    font-size: 1rem;
    flex: 0 0 auto;
  }
`
const StyledWrapper = styled.div`
  display: flex;
  padding: 0.25rem;
  flex-direction: column;
  border-radius: 1rem;
  background-color: ${({ theme }) =>
    theme.scheme === "light" ? "white" : theme.colors.gray4};
  a {
    display: flex;
    padding: 0.75rem;
    gap: 0.75rem;
    align-items: center;
    border-radius: 1rem;
    color: ${({ theme }) => theme.colors.gray11};
    cursor: pointer;

    :hover {
      color: ${({ theme }) => theme.colors.gray12};
      background-color: ${({ theme }) => theme.colors.gray5};
    }
    .icon {
      font-size: 1.5rem;
      line-height: 2rem;
    }
    .name {
      font-size: 0.875rem;
      line-height: 1.25rem;
    }
  }
`
