import React from "react"
import styled from "@emotion/styled"
import AppIcon from "src/components/icons/AppIcon"
import { AdminProfile, useAdminProfile } from "src/hooks/useAdminProfile"
import { resolveServiceLinks } from "src/libs/utils/profileCardLinks"

type Props = {
  initialAdminProfile?: AdminProfile | null
}

const ServiceCard: React.FC<Props> = ({ initialAdminProfile = null }) => {
  const adminProfile = useAdminProfile(initialAdminProfile)
  const links = resolveServiceLinks(adminProfile)
  if (links.length === 0) return null

  return (
    <>
      <StyledTitle>
        <AppIcon name="spark" className="titleIcon" /> Service
      </StyledTitle>
      <StyledWrapper>
        {links.map((item) => (
          <a
            key={`${item.href}-${item.label}`}
            href={item.href}
            rel="noopener noreferrer"
            target="_blank"
          >
            <AppIcon name={item.icon} className="icon" />
            <div className="name">{item.label}</div>
          </a>
        ))}
      </StyledWrapper>
    </>
  )
}

export default ServiceCard

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
  margin-bottom: 2.25rem;
  flex-direction: column;
  border-radius: 1rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background-color: ${({ theme }) => theme.colors.gray1};
  > a {
    display: flex;
    padding: 0.75rem;
    gap: 0.75rem;
    align-items: center;
    border-radius: 1rem;
    color: ${({ theme }) => theme.colors.gray11};
    cursor: pointer;

    &:hover {
      color: ${({ theme }) => theme.colors.gray12};
      background-color: ${({ theme }) => theme.colors.gray3};
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
