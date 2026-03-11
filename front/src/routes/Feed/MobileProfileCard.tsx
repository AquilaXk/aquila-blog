import { CONFIG } from "site.config"
import Image from "next/image"
import React from "react"
import styled from "@emotion/styled"
import { AdminProfile, useAdminProfile } from "src/hooks/useAdminProfile"

type Props = {
  className?: string
  initialAdminProfile?: AdminProfile | null
}

const MobileProfileCard: React.FC<Props> = ({ initialAdminProfile = null }) => {
  const adminProfile = useAdminProfile(initialAdminProfile)
  const imageSrc = adminProfile?.profileImageUrl || CONFIG.profile.image
  const displayName = adminProfile?.username || CONFIG.profile.name
  const displayRole = adminProfile?.profileRole || CONFIG.profile.role
  const displayBio = adminProfile?.profileBio || CONFIG.profile.bio
  const bypassOptimizer = imageSrc.includes("/redirectToProfileImg")

  return (
    <StyledWrapper>
      <div className="top">💻 {displayName}</div>
      <div className="mid">
        <div className="wrapper">
          <Image
            src={imageSrc}
            width={90}
            height={90}
            css={{
              position: "relative",
              borderRadius: "50%",
              objectFit: "cover",
            }}
            alt="profile_image"
            unoptimized={bypassOptimizer}
          />
          <div className="wrapper">
            <div className="top">{displayName}</div>
            <div className="mid">{displayRole}</div>
            <div className="btm">{displayBio}</div>
          </div>
        </div>
      </div>
    </StyledWrapper>
  )
}

export default MobileProfileCard

const StyledWrapper = styled.div`
  display: block;

  @media (min-width: 1024px) {
    display: none;
  }

  > .top {
    padding: 0.25rem;
    margin-bottom: 0.75rem;
  }
  > .mid {
    padding: 0.5rem;
    margin-bottom: 1rem;
    border-radius: 1rem;
    background-color: ${({ theme }) =>
      theme.scheme === "light" ? "white" : theme.colors.gray4};
    > .wrapper {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      > .wrapper {
        height: fit-content;
        > .top {
          font-size: 1.25rem;
          line-height: 1.75rem;
          font-style: italic;
          font-weight: 700;
        }
        > .mid {
          margin-bottom: 0.5rem;
          font-size: 0.875rem;
          line-height: 1.25rem;
          color: ${({ theme }) => theme.colors.gray11};
        }
        > .btm {
          font-size: 0.875rem;
          line-height: 1.25rem;
        }
      }
    }
  }
`
