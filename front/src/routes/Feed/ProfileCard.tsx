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
  const imageSrc =
    adminProfile?.profileImageDirectUrl || adminProfile?.profileImageUrl || CONFIG.profile.image
  const displayName = adminProfile?.username || CONFIG.profile.name
  const displayRole = adminProfile?.profileRole || CONFIG.profile.role
  const displayBio = adminProfile?.profileBio || CONFIG.profile.bio
  const bypassOptimizer =
    imageSrc.includes("/redirectToProfileImg") ||
    imageSrc.startsWith("data:") ||
    imageSrc.includes("placehold.co")

  return (
    <StyledWrapper>
      <div className="title">
        <Emoji>💻</Emoji> Profile
      </div>
      <div className="content">
        <div className="top">
          <Image src={imageSrc} fill alt="" unoptimized={bypassOptimizer} />
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
    padding: 0.15rem 0.1rem;
    margin-bottom: 0.7rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.82rem;
    font-weight: 700;
  }
  > .content {
    margin-bottom: 1.25rem;
    border-radius: 1.5rem;
    width: 100%;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background:
      radial-gradient(circle at top left, rgba(37, 99, 235, 0.14), transparent 36%),
      ${({ theme }) => (theme.scheme === "light" ? "white" : theme.colors.gray4)};
    padding: 1rem;

    .top {
      position: relative;
      width: 132px;
      margin: 0 auto 1rem;
      border-radius: 50%;
      overflow: hidden;
      border: 1px solid ${({ theme }) => theme.colors.gray6};
      background: ${({ theme }) => theme.colors.gray1};

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
        font-size: 1.32rem;
        line-height: 1.3;
        font-weight: 700;
        letter-spacing: -0.03em;
      }
      .role {
        margin: 0.6rem 0 0.85rem;
        font-size: 0.9rem;
        line-height: 1.4;
        color: ${({ theme }) => theme.colors.blue11};
        font-weight: 700;
      }
      .bio {
        margin-bottom: 0.15rem;
        font-size: 0.875rem;
        line-height: 1.65;
        color: ${({ theme }) => theme.colors.gray11};
      }
    }
  }
`
