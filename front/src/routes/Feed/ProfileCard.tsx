import styled from "@emotion/styled"
import React from "react"
import { CONFIG } from "site.config"
import { Emoji } from "src/components/Emoji"
import ProfileImage from "src/components/ProfileImage"
import { AdminProfile, useAdminProfile } from "src/hooks/useAdminProfile"

type Props = {
  initialAdminProfile?: AdminProfile | null
}

const ProfileCard: React.FC<Props> = ({ initialAdminProfile = null }) => {
  const adminProfile = useAdminProfile(initialAdminProfile)
  const imageSrc =
    adminProfile?.profileImageDirectUrl || adminProfile?.profileImageUrl || CONFIG.profile.image
  const displayName = adminProfile?.nickname || adminProfile?.name || CONFIG.profile.name
  const displayRole = adminProfile?.profileRole || CONFIG.profile.role
  const displayBio = adminProfile?.profileBio || CONFIG.profile.bio

  return (
    <StyledWrapper>
      <div className="title">
        <Emoji className="titleEmoji">💻</Emoji> Profile
      </div>
      <div className="content">
        <div className="top">
          <ProfileImage src={imageSrc} width={132} height={132} alt={`${displayName} profile`} priority fillContainer />
        </div>
        <div className="mid">
          <div className="name">{displayName}</div>
          <div className="role">{displayRole}</div>
          <div className="bio">{displayBio}</div>
        </div>
      </div>
    </StyledWrapper>
  )
}

export default ProfileCard

const StyledWrapper = styled.div`
  > .title {
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
  }
  > .content {
    margin-bottom: 2.25rem;
    width: 100%;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
    padding: 0 0 1rem;

    .top {
      position: relative;
      width: 132px;
      margin: 0 auto 1rem;
      border-radius: 50%;
      overflow: hidden;
      border: 1px solid ${({ theme }) => theme.colors.gray6};
      background: transparent;

      &:after {
        content: "";
        display: block;
        padding-bottom: 100%;
      }

      img {
        object-fit: cover;
        object-position: center 38%;
      }
    }

    .mid {
      display: flex;
      padding: 0.2rem 0.4rem 0.1rem;
      flex-direction: column;
      align-items: center;
      text-align: center;

      .name {
        font-size: 1.25rem;
        line-height: 1.75rem;
        font-style: italic;
        font-weight: 700;
        letter-spacing: -0.02em;
      }
      .role {
        margin: 0.55rem 0 1rem;
        font-size: 0.9rem;
        line-height: 1.25rem;
        color: ${({ theme }) => theme.colors.gray11};
        font-weight: 600;
      }
      .bio {
        margin-bottom: 0.25rem;
        font-size: 0.875rem;
        line-height: 1.55;
        color: ${({ theme }) => theme.colors.gray11};
        white-space: pre-line;
        word-break: break-word;
      }
    }
  }
`
