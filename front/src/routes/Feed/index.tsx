import Footer from "./Footer"
import styled from "@emotion/styled"
import TagList from "./TagList"
import MobileProfileCard from "./MobileProfileCard"
import ProfileCard from "./ProfileCard"
import ServiceCard from "./ServiceCard"
import ContactCard from "./ContactCard"
import { AdminProfile } from "src/hooks/useAdminProfile"
import { CONFIG } from "site.config"
import dynamic from "next/dynamic"

const FeedExplorer = dynamic(() => import("./FeedExplorer"))

const HEADER_HEIGHT = 73

type Props = {
  initialAdminProfile?: AdminProfile | null
}

const Feed: React.FC<Props> = ({ initialAdminProfile = null }) => {
  return (
    <StyledWrapper>
      <div
        className="lt"
        css={{
          height: `calc(100vh - ${HEADER_HEIGHT}px)`,
        }}
      >
        <TagList />
      </div>
      <div className="mid">
        <MobileProfileCard initialAdminProfile={initialAdminProfile} />
        <IntroCard>
          <h1>{CONFIG.blog.title}</h1>
          <p>{CONFIG.blog.description}</p>
        </IntroCard>
        <FeedExplorer />
        <div className="footer">
          <Footer />
        </div>
      </div>
      <div
        className="rt"
        css={{
          height: `calc(100vh - ${HEADER_HEIGHT}px)`,
        }}
      >
        <ProfileCard initialAdminProfile={initialAdminProfile} />
        <ServiceCard />
        <ContactCard />
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
  padding: 1.4rem 0 2.2rem;
  display: grid;
  gap: 1.5rem;

  @media (max-width: 768px) {
    display: block;
    padding: 0.5rem 0 1.2rem;
  }

  > .lt {
    display: none;
    overflow: auto;
    scrollbar-gutter: stable both-edges;
    overscroll-behavior: contain;
    position: sticky;
    grid-column: span 2 / span 2;
    top: ${HEADER_HEIGHT - 10}px;

    scrollbar-width: none;
    -ms-overflow-style: none;
    &::-webkit-scrollbar {
      display: none;
    }

    @media (min-width: 1024px) {
      display: block;
    }
  }

  > .mid {
    grid-column: span 12 / span 12;
    display: grid;
    min-width: 0;
    gap: 1rem;

    @media (min-width: 1024px) {
      grid-column: span 7 / span 7;
    }

    > .tags {
      display: block;

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
  border-radius: 26px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background:
    radial-gradient(circle at top left, rgba(37, 99, 235, 0.16), transparent 38%),
    linear-gradient(180deg, ${({ theme }) => theme.colors.gray1}, ${({ theme }) => theme.colors.gray2});
  padding: 1.3rem 1.35rem;

  h1 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: clamp(1.9rem, 4vw, 2.7rem);
    letter-spacing: -0.05em;
    line-height: 1.05;
  }

  p {
    margin: 0.8rem 0 0;
    max-width: 42rem;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.7;
  }
`
