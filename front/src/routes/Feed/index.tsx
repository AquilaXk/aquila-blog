import Footer from "./Footer"
import styled from "@emotion/styled"
import { useMemo } from "react"
import { AdminProfile, useAdminProfile } from "src/hooks/useAdminProfile"
import { CONFIG } from "site.config"
import FeedExplorer from "./FeedExplorer"
import { useTagsQuery } from "src/hooks/useTagsQuery"

type Props = {
  initialAdminProfile?: AdminProfile | null
  initialHomeBootstrapStatus?: "ready" | "degraded" | "shell"
}

const TOPIC_RAIL_TAG_LIMIT = 3

const Feed: React.FC<Props> = ({ initialAdminProfile = null, initialHomeBootstrapStatus = "ready" }) => {
  const adminProfile = useAdminProfile(initialAdminProfile)
  const { tagEntries } = useTagsQuery()
  const topicEntries = useMemo(
    () => tagEntries.slice(0, TOPIC_RAIL_TAG_LIMIT),
    [tagEntries]
  )
  const introTitle =
    adminProfile?.homeIntroTitle || CONFIG.blog.homeIntroTitle || adminProfile?.blogTitle || CONFIG.blog.title || "AquilaLog"
  const introRole = adminProfile?.profileRole || "Backend systems · production notes"
  const introDescription = adminProfile?.homeIntroDescription || CONFIG.blog.homeIntroDescription || CONFIG.blog.description
  const focusLabel = topicEntries.length > 0
    ? topicEntries.map(([tag]) => tag).join(" · ")
    : "Architecture · Security · Reliability"
  const repositoryLabel = CONFIG.projects?.[0]?.href?.replace(/^https?:\/\//, "") || "AquilaXk/aquila-blog"

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
          </div>
          <aside className="homeNote" aria-label="블로그 운영 정보">
            <div className="noteRow">
              <strong>Focus</strong>
              <span>{focusLabel}</span>
            </div>
            <div className="noteRow">
              <strong>Updated</strong>
              <span>최신 글 기준</span>
            </div>
            <div className="noteRow">
              <strong>Repository</strong>
              <span>{repositoryLabel}</span>
            </div>
          </aside>
        </IntroCard>
        <FeedExplorer initialBootstrapDegraded={initialHomeBootstrapStatus === "degraded"} />
        <div className="footer">
          <Footer />
        </div>
      </div>
    </StyledWrapper>
  )
}

export default Feed

const StyledWrapper = styled.div`
  --feed-product-bg: ${({ theme }) =>
    theme.scheme === "light" ? "color-mix(in srgb, white 97%, black)" : theme.publicDesign.pageBackgroundColor};
  --feed-product-panel: ${({ theme }) => theme.publicDesign.readableSurface};
  --feed-product-panel-hover: ${({ theme }) => theme.publicDesign.surfaceElevated};
  --feed-product-border: ${({ theme }) => theme.publicDesign.border};
  --feed-product-text: ${({ theme }) => theme.colors.gray12};
  --feed-product-muted: ${({ theme }) => theme.colors.gray10};
  --feed-product-accent: ${({ theme }) => theme.publicDesign.accent};
  --feed-product-chip-bg: ${({ theme }) =>
    theme.scheme === "light" ? "rgba(255, 255, 255, 0.78)" : "rgba(22, 27, 34, 0.68)"};
  --feed-product-hero-glow: ${({ theme }) =>
    theme.scheme === "light" ? "rgba(37, 99, 235, 0.08)" : "rgba(88, 166, 255, 0.1)"};
  display: block;
  position: relative;
  z-index: 0;
  isolation: isolate;
  padding: 0 0 2.4rem;
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
      var(--feed-product-bg);
  }

  @media (max-width: 768px) {
    padding: 0.5rem 0 1.1rem;
  }

  > .mid {
    display: grid;
    min-width: 0;
    gap: 0;

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
  grid-template-columns: minmax(0, 1fr) 360px;
  align-items: end;
  gap: 80px;
  border-bottom: 1px solid var(--feed-product-border);
  padding: 66px 0 42px;

  .introCopy {
    min-width: 0;
  }

  .brandLabel {
    display: block;
    margin-bottom: 14px;
    color: var(--feed-product-accent);
    font-size: 0.6875rem;
    line-height: 1.2;
    font-weight: 820;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1 {
    margin: 14px 0 22px;
    color: var(--feed-product-text);
    font-size: clamp(42px, 5.1vw, 72px);
    letter-spacing: -0.065em;
    line-height: 1.04;
    font-weight: 850;
    max-width: 850px;
  }

  p {
    margin: 0;
    color: var(--feed-product-muted);
    font-size: 17px;
    line-height: 1.75;
    letter-spacing: -0.018em;
    max-width: 640px;
    word-break: keep-all;
  }

  .homeNote {
    display: grid;
    gap: 0;
    border-top: 2px solid var(--feed-product-text);
    padding-top: 14px;
  }

  .noteRow {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 16px;
    border-bottom: 1px solid var(--feed-product-border);
    padding: 0 0 13px;
    margin-bottom: 18px;
  }

  .noteRow strong {
    color: ${({ theme }) => theme.colors.gray9};
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 11px;
    line-height: 1.5;
    font-weight: 760;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .noteRow span {
    min-width: 0;
    color: var(--feed-product-text);
    font-size: 0.875rem;
    line-height: 1.55;
    font-weight: 720;
    overflow-wrap: anywhere;
  }

  @media (max-width: 1024px) {
    grid-template-columns: minmax(0, 1fr);
    gap: 34px;

    .homeNote {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .noteRow {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 768px) {
    padding: 44px 0 30px;

    h1 {
      margin: 14px 0 20px;
      max-width: none;
      font-size: 42px;
      line-height: 1.04;
    }

    p {
      font-size: 0.95rem;
      line-height: 1.5;
    }

    .noteRow {
      grid-template-columns: minmax(0, 1fr);
    }
  }
`
