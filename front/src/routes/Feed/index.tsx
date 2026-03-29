import Footer from "./Footer"
import styled from "@emotion/styled"
import { useMemo } from "react"
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

const DEFAULT_HOME_DESCRIPTION = "백엔드 아키텍처, 운영 트러블슈팅, 성능 최적화를 실서비스 경험 기준으로 정리합니다."

const HOME_TOPIC_CANDIDATES = [
  { label: "백엔드 아키텍처", pattern: /(백엔드|backend).*(아키텍처|architecture)|(아키텍처|architecture).*(백엔드|backend)/i },
  { label: "운영 트러블슈팅", pattern: /(운영|ops|incident|장애).*(트러블슈팅|troubleshooting)|(트러블슈팅|troubleshooting).*(운영|ops|장애)/i },
  { label: "성능 최적화", pattern: /(성능|performance).*(최적화|optimization)|(최적화|optimization).*(성능|performance)/i },
  { label: "관측성", pattern: /(observability|grafana|prometheus|모니터링|관측)/i },
]

const normalizeHomeIntroDescription = (value?: string) => {
  const normalized = typeof value === "string" ? value.trim() : ""
  if (!normalized) return DEFAULT_HOME_DESCRIPTION
  if (/^welcome to my backend dev log!?$/i.test(normalized)) return DEFAULT_HOME_DESCRIPTION
  return normalized
}

const resolveHomeTopicChips = (source: string) => {
  const matches = HOME_TOPIC_CANDIDATES.filter((candidate) => candidate.pattern.test(source)).map(
    (candidate) => candidate.label
  )
  if (matches.length >= 3) return matches.slice(0, 3)
  return [...new Set([...matches, "실서비스 경험", "문제 해결 중심"])].slice(0, 3)
}

const formatHomeUpdatedLabel = (value?: string) => {
  if (!value) return "최근 정리 중"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "최근 정리 중"
  return `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")} 업데이트`
}

type Props = {
  initialAdminProfile?: AdminProfile | null
}

const Feed: React.FC<Props> = ({ initialAdminProfile = null }) => {
  const adminProfile = useAdminProfile(initialAdminProfile)
  const introTitle = adminProfile?.homeIntroTitle || adminProfile?.blogTitle || CONFIG.blog.title
  const introDescription = normalizeHomeIntroDescription(
    adminProfile?.homeIntroDescription || CONFIG.blog.description
  )
  const introTopicChips = useMemo(
    () =>
      resolveHomeTopicChips(
        `${introTitle} ${introDescription} ${adminProfile?.profileRole || ""}`
      ),
    [adminProfile?.profileRole, introDescription, introTitle]
  )
  const introSummaryItems = useMemo(() => {
    const connectedLinks =
      (adminProfile?.serviceLinks?.length || 0) + (adminProfile?.contactLinks?.length || 0)
    return [
      {
        label: "작성 기준",
        value: adminProfile?.profileRole?.trim() || "실서비스 경험 기준",
      },
      {
        label: "연결 채널",
        value: connectedLinks > 0 ? `${connectedLinks}개 채널` : "정리 중",
      },
      {
        label: "최근 업데이트",
        value: formatHomeUpdatedLabel(adminProfile?.modifiedAt),
      },
    ]
  }, [
    adminProfile?.contactLinks?.length,
    adminProfile?.modifiedAt,
    adminProfile?.profileRole,
    adminProfile?.serviceLinks?.length,
  ])

  return (
    <StyledWrapper>
      <div className="mid">
        <IntroCard>
          <h1>{introTitle}</h1>
          <p>{introDescription}</p>
          <IntroSummaryStrip aria-label="홈 요약">
            <div className="topicChips">
              {introTopicChips.map((topic) => (
                <span key={topic}>{topic}</span>
              ))}
            </div>
            <div className="metaGrid">
              {introSummaryItems.map((item) => (
                <article key={item.label}>
                  <small>{item.label}</small>
                  <strong>{item.value}</strong>
                </article>
              ))}
            </div>
          </IntroSummaryStrip>
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
    padding: 0.28rem 0 0.96rem;
  }

  > .mid {
    display: grid;
    min-width: 0;
    gap: 1rem;

    @media (max-width: 768px) {
      gap: 0.82rem;
    }

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
  padding: 0.28rem 0 0.96rem;

  h1 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: clamp(2.1rem, 4.2vw, 2.95rem);
    letter-spacing: -0.04em;
    line-height: 1.08;
    font-weight: 760;
    max-width: 13ch;
  }

  p {
    margin: 0.62rem 0 0;
    max-width: 38rem;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.98rem;
    line-height: 1.64;
    letter-spacing: -0.01em;
  }

  @media (max-width: 768px) {
    padding-bottom: 0.76rem;

    h1 {
      max-width: none;
      font-size: clamp(1.85rem, 10vw, 2.55rem);
      line-height: 1.1;
    }

    p {
      margin-top: 0.54rem;
      font-size: 0.9rem;
      line-height: 1.58;
    }
  }
`

const IntroSummaryStrip = styled.div`
  display: grid;
  gap: 0.7rem;
  margin-top: 0.9rem;

  .topicChips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .topicChips span {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 0 0.7rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.76rem;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  .metaGrid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .metaGrid article {
    display: grid;
    gap: 0.18rem;
    padding: 0.72rem 0.82rem;
    border-radius: 14px;
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    background: ${({ theme }) => theme.colors.gray2};
  }

  .metaGrid small {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.01em;
  }

  .metaGrid strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.84rem;
    line-height: 1.5;
    letter-spacing: -0.01em;
  }

  @media (max-width: 768px) {
    margin-top: 0.78rem;
    gap: 0.58rem;

    .metaGrid {
      grid-template-columns: 1fr;
    }
  }
`
