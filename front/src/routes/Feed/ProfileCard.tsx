import styled from "@emotion/styled"
import Image from "next/image"
import React from "react"
import { CONFIG } from "site.config"
import { Emoji } from "src/components/Emoji"
import { AdminProfile, useAdminProfile } from "src/hooks/useAdminProfile"

type Props = {
  initialAdminProfile?: AdminProfile | null
}

const ProfileCard: React.FC<Props> = ({ initialAdminProfile = null }) => {
  const adminProfile = useAdminProfile(initialAdminProfile)
  const imageSrc = adminProfile?.profileImageUrl || CONFIG.profile.image
  const displayName = adminProfile?.username || CONFIG.profile.name
  const displayRole = adminProfile?.profileRole || CONFIG.profile.role
  const displayBio = adminProfile?.profileBio || CONFIG.profile.bio
  const bypassOptimizer = imageSrc.includes("/redirectToProfileImg")

  return (
    <StyledWrapper>
      <div className="title">
        <Emoji>💻</Emoji> {displayName}
      </div>
      <div className="content">
        <div className="top">
          <Image src={imageSrc} fill alt="" unoptimized={bypassOptimizer} />
        </div>
        <div className="mid">
          <div className=" name">{displayName}</div>
          <div className="role">{displayRole}</div>
          <div className="text-sm mb-2">{displayBio}</div>
        </div>
      </div>
    </StyledWrapper>
  )
}

export default ProfileCard

const StyledWrapper = styled.div`
  > .title {
    padding: 0.25rem;
    margin-bottom: 0.75rem;
  }
  > .content {
    margin-bottom: 2.25rem;
    border-radius: 1rem;
    width: 100%;
    background-color: ${({ theme }) =>
      theme.scheme === "light" ? "white" : theme.colors.gray4};
    @media (min-width: 768px) {
      padding: 1rem;
    }
    @media (min-width: 1024px) {
      padding: 1rem;
    }
    .top {
      position: relative;
      width: 100%;
      
      border-radius: 50%; 
      overflow: hidden;
      
      &:after {
        content: "";
        display: block;
        padding-bottom: 100%;
      }
    }
    .mid {
      display: flex;
      padding: 0.5rem;
      flex-direction: column;
      align-items: center;
      .name {
        font-size: 1.25rem;
        line-height: 1.75rem;
        font-style: italic;
        font-weight: 700;
      }
      .role {
        margin-bottom: 1rem;
        font-size: 0.875rem;
        line-height: 1.25rem;
        color: ${({ theme }) => theme.colors.gray11};
      }
      .bio {
        margin-bottom: 0.5rem;
        font-size: 0.875rem;
        line-height: 1.25rem;
      }
    }
  }
`
