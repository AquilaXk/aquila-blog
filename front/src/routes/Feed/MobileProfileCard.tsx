import { CONFIG } from "site.config"
import React from "react"
import styled from "@emotion/styled"
import { Emoji } from "src/components/Emoji"
import ProfileImage from "src/components/ProfileImage"
import { AdminProfile, useAdminProfile } from "src/hooks/useAdminProfile"
import { useState } from "react"

type Props = {
  className?: string
  initialAdminProfile?: AdminProfile | null
}

const MobileProfileCard: React.FC<Props> = ({ initialAdminProfile = null }) => {
  const [expanded, setExpanded] = useState(false)
  const adminProfile = useAdminProfile(initialAdminProfile)
  const imageSrc =
    adminProfile?.profileImageDirectUrl || adminProfile?.profileImageUrl || CONFIG.profile.image
  const displayName = adminProfile?.nickname || adminProfile?.name || CONFIG.profile.name
  const displayRole = adminProfile?.profileRole || CONFIG.profile.role
  const displayBio = adminProfile?.profileBio || CONFIG.profile.bio

  return (
    <StyledWrapper>
      <div className="top">
        <span className="title">
          <Emoji className="titleEmoji">💻</Emoji> Profile
        </span>
        <button type="button" onClick={() => setExpanded((prev) => !prev)}>
          {expanded ? "접기" : "보기"}
        </button>
      </div>
      <div className="mid" data-expanded={expanded}>
        <div className="wrapper">
          <ProfileImage
            src={imageSrc}
            width={expanded ? 90 : 56}
            height={expanded ? 90 : 56}
            priority
            css={{
              position: "relative",
              borderRadius: "50%",
              objectFit: "cover",
              objectPosition: "center 38%",
            }}
            alt={`${displayName} profile image`}
          />
          <div className="wrapper">
            <div className="top">{displayName}</div>
            <div className="mid">{displayRole}</div>
            {expanded ? <div className="btm">{displayBio}</div> : null}
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
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.35rem;
    padding: 0.15rem 0.1rem;
    margin-bottom: 0.7rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.82rem;
    font-weight: 700;

    .title {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      font-size: 1rem;
      line-height: 1.3;
      font-weight: 800;
    }

    .titleEmoji {
      font-size: 1.1rem;
      flex: 0 0 auto;
    }

    button {
      min-height: 34px;
      border-radius: 999px;
      border: 1px solid ${({ theme }) => theme.colors.gray6};
      background: transparent;
      color: ${({ theme }) => theme.colors.gray11};
      padding: 0 0.72rem;
      font-size: 0.74rem;
      font-weight: 700;
      cursor: pointer;
    }
  }
  > .mid {
    padding: 0.12rem 0 0.86rem;
    margin-bottom: 1rem;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
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
          white-space: pre-line;
          word-break: break-word;
        }
      }
    }

    &[data-expanded="false"] {
      > .wrapper {
        > .wrapper {
          > .top {
            font-size: 1rem;
            line-height: 1.25;
          }

          > .mid {
            margin: 0.18rem 0 0;
            font-size: 0.82rem;
          }
        }
      }
    }
  }
`
