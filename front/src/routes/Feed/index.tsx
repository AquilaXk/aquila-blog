import Footer from "./Footer"
import styled from "@emotion/styled"
import MobileProfileCard from "./MobileProfileCard"
import ProfileCard from "./ProfileCard"
import ServiceCard from "./ServiceCard"
import ContactCard from "./ContactCard"
import { AdminProfile, useAdminProfile } from "src/hooks/useAdminProfile"
import { CONFIG } from "site.config"
import FeedExplorer from "./FeedExplorer"
import {
  WIDE_SIDEBAR_LAYOUT_MIN_PX,
} from "src/layouts/RootLayout/layoutTiers"

type Props = {
  initialAdminProfile?: AdminProfile | null
}

const Feed: React.FC<Props> = ({ initialAdminProfile = null }) => {
  const adminProfile = useAdminProfile(initialAdminProfile)
  const introTitle = adminProfile?.homeIntroTitle || CONFIG.blog.title
  const introDescription = adminProfile?.homeIntroDescription || CONFIG.blog.description

  return (
    <StyledWrapper>
      <div className="mid">
        <IntroCard>
          <h1>{introTitle}</h1>
          <p>{introDescription}</p>
        </IntroCard>
        <FeedExplorer />
        <div className="mobileProfileCard">
          <MobileProfileCard initialAdminProfile={initialAdminProfile} />
        </div>
        <div className="footer">
          <Footer />
        </div>
      </div>
      <div className="rt">
        <ProfileCard initialAdminProfile={initialAdminProfile} />
        <ServiceCard initialAdminProfile={initialAdminProfile} />
        <ContactCard initialAdminProfile={initialAdminProfile} />
        <div className="footer">
          <Footer />
        </div>
      </div>
    </StyledWrapper>
  )
}

export default Feed

const FEED_SIDEBAR_WIDTH_REM = 20

const StyledWrapper = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.25rem;
  align-items: start;
  padding: 1rem 0 1.9rem;

  @media (min-width: ${WIDE_SIDEBAR_LAYOUT_MIN_PX}px) {
    grid-template-columns: minmax(0, 1fr) minmax(18rem, ${FEED_SIDEBAR_WIDTH_REM}rem);
    column-gap: clamp(1.5rem, 2.2vw, 2.5rem);
  }

  @media (max-width: 768px) {
    padding: 0.42rem 0 1.1rem;
  }

  > .mid {
    display: grid;
    min-width: 0;
    gap: 1rem;

    .mobileProfileCard {
      @media (min-width: ${WIDE_SIDEBAR_LAYOUT_MIN_PX}px) {
        display: none;
      }
    }

    > .footer {
      padding-bottom: 2rem;
      @media (min-width: ${WIDE_SIDEBAR_LAYOUT_MIN_PX}px) {
        display: none;
      }
    }
  }

  > .rt {
    display: none;
    min-width: 0;
    overflow: auto;
    overscroll-behavior: contain;
    position: sticky;
    top: calc(var(--app-header-height, 73px) + 0.65rem);
    height: calc(100vh - var(--app-header-height, 73px) - 0.65rem);
    height: calc(100dvh - var(--app-header-height, 73px) - 0.65rem);
    gap: 1rem;
    scrollbar-width: none;
    -ms-overflow-style: none;

    &::-webkit-scrollbar {
      display: none;
    }

    @media (min-width: ${WIDE_SIDEBAR_LAYOUT_MIN_PX}px) {
      display: grid;
    }

    .footer {
      padding-top: 1rem;
    }
  }
`

const IntroCard = styled.section`
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray5};
  padding: 0.35rem 0 1.05rem;

  h1 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: clamp(2.1rem, 4.2vw, 2.95rem);
    letter-spacing: -0.04em;
    line-height: 1.08;
    font-weight: 760;
  }

  p {
    margin: 0.8rem 0 0;
    max-width: 42rem;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.62;
  }
`
