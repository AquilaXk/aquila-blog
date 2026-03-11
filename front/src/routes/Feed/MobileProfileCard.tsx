import { CONFIG } from "site.config"
import Image from "next/image"
import React from "react"
import styled from "@emotion/styled"
import { Emoji } from "src/components/Emoji"
import { AdminProfile, useAdminProfile } from "src/hooks/useAdminProfile"

type Props = {
  className?: string
  initialAdminProfile?: AdminProfile | null
}

const MobileProfileCard: React.FC<Props> = ({ initialAdminProfile = null }) => {
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
      <div className="top">
        <Emoji>💻</Emoji> Profile
      </div>
      <div className="mid">
        <div className="wrapper">
          <Image
            src={imageSrc}
            width={90}
            height={90}
            sizes="90px"
            priority
            css={{
              position: "relative",
              borderRadius: "50%",
              objectFit: "cover",
              objectPosition: "center 38%",
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
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.15rem 0.1rem;
    margin-bottom: 0.7rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.82rem;
    font-weight: 700;
  }
  > .mid {
    padding: 0.9rem;
    margin-bottom: 1rem;
    border-radius: 1.3rem;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background:
      radial-gradient(circle at top left, rgba(37, 99, 235, 0.12), transparent 38%),
      ${({ theme }) => (theme.scheme === "light" ? "white" : theme.colors.gray4)};
    > .wrapper {
      display: flex;
      gap: 0.85rem;
      align-items: center;
      > .wrapper {
        height: fit-content;
        > .top {
          font-size: 1.18rem;
          line-height: 1.35;
          font-weight: 700;
          letter-spacing: -0.03em;
        }
        > .mid {
          margin: 0.35rem 0 0.5rem;
          font-size: 0.875rem;
          line-height: 1.35;
          color: ${({ theme }) => theme.colors.blue11};
          font-weight: 700;
        }
        > .btm {
          font-size: 0.875rem;
          line-height: 1.6;
          color: ${({ theme }) => theme.colors.gray11};
        }
      }
    }
  }
`
