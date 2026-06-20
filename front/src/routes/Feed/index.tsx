import Footer from "./Footer"
import styled from "@emotion/styled"
import { startTransition, useCallback, useMemo } from "react"
import { AdminProfile, useAdminProfile } from "src/hooks/useAdminProfile"
import { CONFIG } from "site.config"
import FeedExplorer from "./FeedExplorer"
import ProfileSummaryCard from "./ProfileSummaryCard"
import { useTagsQuery } from "src/hooks/useTagsQuery"
import { useRouter } from "next/router"
import { replaceShallowRoutePreservingScroll } from "src/libs/router"

type Props = {
  initialAdminProfile?: AdminProfile | null
}

const TOPIC_RAIL_TAG_LIMIT = 3

const Feed: React.FC<Props> = ({ initialAdminProfile = null }) => {
  const router = useRouter()
  const adminProfile = useAdminProfile(initialAdminProfile)
  const { tagEntries } = useTagsQuery()
  const topicEntries = useMemo(
    () => tagEntries.slice(0, TOPIC_RAIL_TAG_LIMIT),
    [tagEntries]
  )
  const introTitle =
    adminProfile?.blogTitle || CONFIG.blog.title || "AquilaLog"
  const introRole = adminProfile?.profileRole || CONFIG.profile.role || "Backend Engineering"
  const introDescription = adminProfile?.homeIntroDescription || CONFIG.blog.homeIntroDescription || CONFIG.blog.description

  const navigateWithTag = useCallback((value: string) => {
    const { category: _deprecatedCategory, ...restQuery } = router.query
    startTransition(() => {
      void replaceShallowRoutePreservingScroll(router, {
        pathname: "/",
        query: {
          ...restQuery,
          tag: value,
        },
      })
    })
  }, [router])

  const handleClickTopic = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const value = event.currentTarget.dataset.tag
      if (!value) return
      navigateWithTag(value)
    },
    [navigateWithTag]
  )

  return (
    <StyledWrapper data-ui="feed-home-product-shell">
      <div className="mid">
        <IntroCard>
          <div className="introCopy">
            <span className="brandLabel" data-ui="feed-brand-role">
              {introRole}
            </span>
            <h1>{introTitle}</h1>
            <p>{introDescription}</p>
            {topicEntries.length > 0 && (
              <div className="topicRail" data-ui="feed-topic-rail" aria-label="인기 태그">
                {topicEntries.map(([tag, count]) => (
                  <button
                    key={tag}
                    type="button"
                    data-ui="feed-topic-rail-chip"
                    data-tag={tag}
                    aria-label={`태그 ${tag} 글 ${count}개 보기`}
                    onClick={handleClickTopic}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ProfileSummaryCard initialAdminProfile={initialAdminProfile} />
        </IntroCard>
        <FeedExplorer />
        <div className="footer">
          <Footer />
        </div>
      </div>
    </StyledWrapper>
  )
}

export default Feed

const StyledWrapper = styled.div`
  --feed-product-bg: #0d1117;
  --feed-product-panel: #161b22;
  --feed-product-panel-hover: #21262d;
  --feed-product-border: #30363d;
  --feed-product-text: #f0f6fc;
  --feed-product-muted: #8b949e;
  --feed-product-accent: #58a6ff;
  display: block;
  position: relative;
  z-index: 0;
  isolation: isolate;
  padding: 1.2rem 0 2.4rem;
  color: var(--feed-product-text);

  &::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    z-index: -1;
    width: 100vw;
    transform: translateX(-50%);
    background:
      radial-gradient(circle at 78% 0%, rgba(88, 166, 255, 0.1), transparent 28rem),
      var(--feed-product-bg);
  }

  @media (max-width: 768px) {
    padding: 0.5rem 0 1.1rem;
  }

  > .mid {
    display: grid;
    min-width: 0;
    gap: 1.35rem;

    @media (max-width: 768px) {
      gap: 0.82rem;
    }

    > .footer {
      padding-bottom: 2rem;
    }
  }
`

const IntroCard = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(17rem, 20rem);
  align-items: end;
  gap: clamp(1.2rem, 3vw, 2.4rem);
  border-bottom: 1px solid rgba(48, 54, 61, 0.82);
  padding: 0.2rem 0 1.3rem;

  .introCopy {
    min-width: 0;
  }

  .brandLabel {
    display: block;
    margin-bottom: 0.52rem;
    color: #58a6ff;
    font-size: 0.78rem;
    line-height: 1.2;
    font-weight: 860;
    letter-spacing: 0.02em;
  }

  h1 {
    margin: 0;
    color: #f0f6fc;
    font-size: clamp(2.6rem, 5vw, 4rem);
    letter-spacing: -0.075em;
    line-height: 0.96;
    font-weight: 880;
    max-width: 12ch;
  }

  p {
    margin: 0.82rem 0 0;
    color: #8b949e;
    font-size: clamp(0.98rem, 1.3vw, 1.08rem);
    line-height: 1.55;
    letter-spacing: -0.018em;
    max-width: 40rem;
  }

  .topicRail {
    margin-top: 1rem;
    display: flex;
    align-items: center;
    gap: 0.48rem;
    flex-wrap: wrap;
  }

  .topicRail button {
    display: inline-flex;
    align-items: center;
    min-height: 30px;
    border-radius: 999px;
    border: 1px solid rgba(48, 54, 61, 0.86);
    background: rgba(22, 27, 34, 0.68);
    color: #8b949e;
    padding: 0 0.72rem;
    font-size: 0.76rem;
    font-weight: 780;
    cursor: pointer;
    appearance: none;
    font-family: inherit;
  }

  .topicRail button:hover,
  .topicRail button:focus-visible {
    border-color: rgba(88, 166, 255, 0.72);
    color: #f0f6fc;
    outline: none;
  }

  @media (max-width: 1024px) {
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
  }

  @media (max-width: 768px) {
    padding-bottom: 0.18rem;

    [data-ui="feed-profile-summary"] {
      display: none;
    }

    h1 {
      max-width: none;
      font-size: clamp(2rem, 11vw, 2.55rem);
      line-height: 1.1;
    }

    p {
      margin-top: 0.64rem;
      font-size: 0.95rem;
      line-height: 1.5;
    }

    .topicRail {
      margin-top: 0.28rem;
      gap: 0.4rem;
    }

    .topicRail button {
      min-height: 28px;
      padding: 0 0.62rem;
      font-size: 0.72rem;
    }
  }
`
