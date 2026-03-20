import Footer from "./Footer"
import styled from "@emotion/styled"
import MobileProfileCard from "./MobileProfileCard"
import ProfileCard from "./ProfileCard"
import ServiceCard from "./ServiceCard"
import ContactCard from "./ContactCard"
import { AdminProfile, useAdminProfile } from "src/hooks/useAdminProfile"
import { CONFIG } from "site.config"
import FeedExplorer from "./FeedExplorer"

const HEADER_HEIGHT = 73

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
        <div className="mobileProfileCard">
          <MobileProfileCard initialAdminProfile={initialAdminProfile} />
        </div>
        <IntroCard>
          <h1>{introTitle}</h1>
          <p>{introDescription}</p>
        </IntroCard>
        <FeedExplorer />
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

const StyledWrapper = styled.div`
  grid-template-columns: repeat(12, minmax(0, 1fr));
  padding: 1rem 0 1.9rem;
  display: grid;
  gap: 1.25rem;

  @media (max-width: 768px) {
    display: block;
    padding: 0.42rem 0 1.1rem;
  }

  > .mid {
    grid-column: span 12 / span 12;
    display: grid;
    min-width: 0;
    gap: 1rem;

    @media (min-width: 1024px) {
      grid-column: span 9 / span 9;
    }

    .mobileProfileCard {
      @media (min-width: 1024px) {
        display: none;
      }
    }

    > .footer {
      padding-bottom: 2rem;
      @media (min-width: 1024px) {
        display: none;
      }
    }
  }

  > .rt {
    scrollbar-width: none;
    -ms-overflow-style: none;
    &::-webkit-scrollbar {
      display: none;
    }

    display: none;
    overflow: auto;
    scrollbar-gutter: stable both-edges;
    overscroll-behavior: contain;
    position: sticky;
    top: ${HEADER_HEIGHT - 10}px;
    height: calc(100vh - ${HEADER_HEIGHT}px);
    height: calc(100dvh - ${HEADER_HEIGHT}px);

    @media (min-width: 1024px) {
      display: block;
      grid-column: span 3 / span 3;
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
