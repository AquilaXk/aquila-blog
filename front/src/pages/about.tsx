import styled from "@emotion/styled"
import { GetServerSideProps } from "next"
import { CONFIG } from "site.config"
import AppIcon from "src/components/icons/AppIcon"
import MetaConfig from "src/components/MetaConfig"
import ProfileImage from "src/components/ProfileImage"
import { AdminProfile, useAdminProfile } from "src/hooks/useAdminProfile"
import { parseLegacyAboutDetails } from "src/libs/profileWorkspace"
import { NextPageWithLayout } from "../types"
import {
  buildStaticAdminProfileSnapshot,
  fetchServerAdminProfile,
  hasServerAuthCookie,
  resolvePublicAdminProfileSnapshot,
} from "src/libs/server/adminProfile"
import { appendSsrDebugTiming, isSsrDebugEnabled, timed } from "src/libs/server/serverTiming"
import { resolveContactLinks, resolveRenderableProfileLinkHref, resolveServiceLinks } from "src/libs/utils/profileCardLinks"

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const ssrStartedAt = performance.now()
  const hasAuthCookie = hasServerAuthCookie(req)
  const debugSsr = isSsrDebugEnabled(req)
  const fallbackProfileSnapshot = !hasAuthCookie ? resolvePublicAdminProfileSnapshot(req) : null
  const adminProfileResult = await timed(() =>
    fetchServerAdminProfile(req, {
      timeoutMs: hasAuthCookie ? 1_800 : 900,
    })
  )
  const initialAdminProfile =
    adminProfileResult.ok && adminProfileResult.value
      ? adminProfileResult.value
      : hasAuthCookie
        ? buildStaticAdminProfileSnapshot()
        : fallbackProfileSnapshot?.profile || buildStaticAdminProfileSnapshot()

  res.setHeader(
    "Cache-Control",
    !debugSsr && !hasAuthCookie ? "public, s-maxage=60, stale-while-revalidate=300" : "private, no-store"
  )
  appendSsrDebugTiming(req, res, [
    {
      name: "about-admin-profile",
      durationMs: adminProfileResult.durationMs,
      description:
        adminProfileResult.ok && adminProfileResult.value
          ? "ok"
          : fallbackProfileSnapshot?.source || "static-fallback",
    },
    {
      name: "about-ssr-total",
      durationMs: performance.now() - ssrStartedAt,
      description: hasAuthCookie ? "member" : "public",
    },
  ])

  return {
    props: {
      initialAdminProfile,
    },
  }
}

type AboutPageProps = {
  initialAdminProfile: AdminProfile | null
}

type AboutListSection = {
  title: string
  items: string[]
  hasDivider: boolean
}

type AboutTimelineItem = {
  label: string
  date: string
}

type AboutProjectItem = {
  name: string
  summary: string
  role: string
  href: string
  linkLabel: string
}

const PROJECT_PRESETS: Record<string, { summary: string; role: string; href?: string }> = {
  고구마마켓: {
    summary: "거래 흐름과 상태 전이를 직접 설계하며 커머스 도메인 감각을 다진 프로젝트입니다.",
    role: "Backend · 도메인 설계",
  },
  "마음-온": {
    summary: "사용자 감정 기록 흐름을 다루며 서비스 구조와 데이터 설계를 다듬은 프로젝트입니다.",
    role: "Backend · API 설계",
  },
  "aquila-blog": {
    summary: "글쓰기, 공개 렌더링, 운영 배포까지 직접 관리하는 개인 기술 블로그입니다.",
    role: "Full-stack · Editor/SSR/Deploy",
    href: "https://github.com/AquilaXk/aquila-blog",
  },
  "aquila-bank": {
    summary: "금융 도메인을 가정하고 계좌/거래 흐름을 모델링한 학습 프로젝트입니다.",
    role: "Backend · Transaction Flow",
    href: "https://github.com/AquilaXk/aquila-bank",
  },
}

const normalizeSectionTitle = (title: string) => title.replace(/\s+/g, "").toLowerCase()

const isProjectSection = (title: string) => /프로젝트|project/.test(normalizeSectionTitle(title))

const isTimelineSection = (title: string) => /이력|자격|journey|timeline|credential/.test(normalizeSectionTitle(title))

const parseTimelineItem = (item: string): AboutTimelineItem => {
  const match = item.match(/^(.*?)(?:\s*\[([0-9./-]+)\])?$/)
  return {
    label: (match?.[1] || item).trim(),
    date: (match?.[2] || "").trim(),
  }
}

const isExternalHref = (href: string) =>
  href.startsWith("https://") || href.startsWith("http://") || href.startsWith("mailto:") || href.startsWith("tel:")

const AboutPage: NextPageWithLayout<AboutPageProps> = ({ initialAdminProfile }) => {
  const adminProfile = useAdminProfile(initialAdminProfile)

  const displayName = adminProfile?.nickname || adminProfile?.name || CONFIG.profile.name
  const displayRole = adminProfile?.aboutRole || CONFIG.profile.role
  const displayBio = adminProfile?.aboutBio || CONFIG.profile.bio
  const profileImageSrc =
    adminProfile?.profileImageDirectUrl || adminProfile?.profileImageUrl || CONFIG.profile.image
  const aboutDetailSections =
    adminProfile?.aboutSections && adminProfile.aboutSections.length > 0
      ? adminProfile.aboutSections.map((section) => ({
          title: section.title,
          items: section.items,
          hasDivider: section.dividerBefore,
        }))
      : parseLegacyAboutDetails(adminProfile?.aboutDetails || "").map((section) => ({
          title: section.title,
          items: section.items,
          hasDivider: section.dividerBefore,
        }))
  const blogTitle = adminProfile?.blogTitle || CONFIG.blog.title
  const contactLinks = resolveContactLinks(adminProfile)
    .map((item) => {
      const safeHref = resolveRenderableProfileLinkHref("contact", item.href)
      return safeHref && isExternalHref(safeHref) ? { ...item, safeHref } : null
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  const serviceLinks = resolveServiceLinks(adminProfile)
    .map((item) => {
      const safeHref = resolveRenderableProfileLinkHref("service", item.href)
      return safeHref && (safeHref.startsWith("https://") || safeHref.startsWith("http://"))
        ? { ...item, safeHref }
        : null
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  const projectSection = aboutDetailSections.find((section) => isProjectSection(section.title))
  const timelineSection = aboutDetailSections.find((section) => isTimelineSection(section.title))
  const supplementalSections = aboutDetailSections.filter(
    (section) => section !== projectSection && section !== timelineSection
  )
  const githubHref = contactLinks.find((item) => item.label.toLowerCase().includes("github"))?.safeHref || ""
  const projectItems: AboutProjectItem[] = (projectSection?.items || []).map((name) => {
    const preset = PROJECT_PRESETS[name] || {
      summary: "직접 구현과 운영 경험을 축적하며 시스템 설계 감각을 넓힌 프로젝트입니다.",
      role: "Implementation · Problem Solving",
    }
    const linkedService = serviceLinks.find((item) => item.label.toLowerCase() === name.toLowerCase())
    const href = linkedService?.safeHref || preset.href || githubHref || "#about-service-links"
    return {
      name,
      summary: preset.summary,
      role: preset.role,
      href,
      linkLabel: linkedService?.label || (href.startsWith("#") ? "섹션 보기" : "링크 보기"),
    }
  })
  const timelineItems = (timelineSection?.items || []).map(parseTimelineItem)
  const ctaLinks = [
    { label: "대표 글 보기", href: "/" },
    { label: "GitHub", href: githubHref || "https://github.com/AquilaXk" },
    { label: "프로젝트 보기", href: "#about-projects" },
  ]

  const meta = {
    title: `About - ${blogTitle}`,
    description: displayBio,
    type: "website",
    url: `${CONFIG.link}/about`,
  }

  return (
    <>
      <MetaConfig {...meta} />
      <StyledWrapper>
        <article className="about-content">
          <section className="hero-grid">
            <div className="hero-copy" data-ui="about-hero">
              <p className="about-eyebrow" data-ui="about-eyebrow">
                Profile
              </p>
              <h1 className="profile-name">{displayName}</h1>
              <p className="profile-statement">이유를 먼저 따지고, 운영 가능한 시스템을 설계합니다.</p>
              <p className="profile-role">{displayRole}</p>
              <p className="profile-bio">{displayBio}</p>
            </div>

            <aside className="hero-rail">
              <div className="profile-avatar" data-ui="about-avatar">
                <ProfileImage
                  src={profileImageSrc}
                  width={108}
                  height={108}
                  alt={`${displayName} profile`}
                  fillContainer
                />
              </div>

              <div className="cta-group" data-ui="about-cta-group">
                {ctaLinks.map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    target={isExternalHref(item.href) ? "_blank" : undefined}
                    rel={isExternalHref(item.href) ? "noopener noreferrer" : undefined}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </aside>
          </section>

          {projectItems.length > 0 ? (
            <section className="content-section" id="about-projects" data-ui="about-projects">
              <h2 className="section-title">{projectSection?.title || "프로젝트"}</h2>
              <ul className="project-list" data-ui="about-project-list">
                {projectItems.map((item) => (
                  <li key={item.name}>
                    <div className="project-copy">
                      <h3>{item.name}</h3>
                      <p data-ui="about-project-summary">{item.summary}</p>
                    </div>
                    <div className="project-meta">
                      <span data-ui="about-project-role">{item.role}</span>
                      <a
                        href={item.href}
                        target={isExternalHref(item.href) ? "_blank" : undefined}
                        rel={isExternalHref(item.href) ? "noopener noreferrer" : undefined}
                      >
                        {item.linkLabel}
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {timelineItems.length > 0 ? (
            <section className="content-section" data-ui="about-timeline-section">
              <h2 className="section-title">{timelineSection?.title || "이력"}</h2>
              <ol className="timeline-list" data-ui="about-timeline">
                {timelineItems.map((item) => (
                  <li key={`${item.label}-${item.date}`}>
                    <span className="timeline-date">{item.date}</span>
                    <strong>{item.label}</strong>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {supplementalSections.map((section, index) => (
            <section
              key={`${section.title}-${index}`}
              className="content-section supplemental-section"
              data-has-divider={section.hasDivider ? "true" : "false"}
            >
              <h2 className="section-title">{section.title}</h2>
              <ul className="supplemental-list">
                {section.items.map((item) => (
                  <li key={`${section.title}-${item}`}>{item}</li>
                ))}
              </ul>
            </section>
          ))}

          {contactLinks.length > 0 ? (
            <section className="content-section compact-link-section" data-ui="about-contact-section">
              <h2 className="section-title">Contact</h2>
              <ul className="compact-link-list" data-ui="about-contact-links">
                {contactLinks.map((item) => (
                  <li key={`${item.icon}-${item.label}-${item.safeHref}`}>
                    <a href={item.safeHref} target="_blank" rel="noopener noreferrer">
                      <span className="icon">
                        <AppIcon name={item.icon} aria-hidden="true" />
                      </span>
                      <span>{item.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {serviceLinks.length > 0 ? (
            <section className="content-section compact-link-section" data-ui="about-service-section">
              <h2 className="section-title">Service</h2>
              <ul className="compact-link-list" data-ui="about-service-links" id="about-service-links">
                {serviceLinks.map((item) => (
                  <li key={`${item.icon}-${item.label}-${item.safeHref}`}>
                    <a href={item.safeHref} target="_blank" rel="noopener noreferrer">
                      <span className="icon">
                        <AppIcon name={item.icon} aria-hidden="true" />
                      </span>
                      <span>{item.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </article>
      </StyledWrapper>
    </>
  )
}

export default AboutPage

const StyledWrapper = styled.div`
  max-width: 62rem;
  margin: 0 auto;
  padding: 2.25rem 0 3rem;

  .about-content {
    display: grid;
    gap: 2.6rem;
  }

  .hero-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(220px, 0.9fr);
    gap: 2.25rem;
    padding-bottom: 2rem;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  }

  .hero-copy {
    min-width: 0;
  }

  .about-eyebrow {
    margin: 0 0 0.9rem;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .profile-name {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: clamp(2.4rem, 2rem + 1vw, 3.25rem);
    line-height: 1.02;
    letter-spacing: -0.045em;
    font-weight: 800;
  }

  .profile-statement {
    margin: 1rem 0 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: clamp(1.18rem, 1.02rem + 0.42vw, 1.45rem);
    line-height: 1.5;
    font-weight: 650;
    letter-spacing: -0.02em;
  }

  .profile-role {
    margin: 0.8rem 0 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.98rem;
    line-height: 1.5;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .profile-bio {
    margin: 1.1rem 0 0;
    max-width: 40rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 1rem;
    line-height: 1.8;
    white-space: pre-line;
    word-break: keep-all;
  }

  .hero-rail {
    display: grid;
    align-content: start;
    justify-items: start;
    gap: 1rem;
  }

  .profile-avatar {
    position: relative;
    width: 148px;
    border-radius: 999px;
    overflow: hidden;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray1};
    box-shadow: 0 18px 38px rgba(0, 0, 0, 0.18);

    &::after {
      content: "";
      display: block;
      padding-bottom: 100%;
    }
  }

  .cta-group {
    width: min(100%, 240px);
    display: grid;
    gap: 0.62rem;

    a {
      display: inline-flex;
      align-items: center;
      justify-content: space-between;
      min-height: 44px;
      padding: 0.78rem 0.96rem;
      border-radius: 12px;
      border: 1px solid ${({ theme }) => theme.colors.gray6};
      background: ${({ theme }) => theme.colors.gray2};
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 0.98rem;
      font-weight: 700;
      line-height: 1;
      transition: border-color 0.2s ease, transform 0.2s ease;

      &:hover {
        border-color: ${({ theme }) => theme.colors.gray10};
        transform: translateY(-1px);
      }
    }
  }

  .content-section {
    min-width: 0;
  }

  .section-title {
    margin: 0 0 1.1rem;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.38rem;
    line-height: 1.35;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .project-list,
  .timeline-list,
  .supplemental-list,
  .compact-link-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .project-list {
    display: grid;
    gap: 0;
    border-top: 1px solid ${({ theme }) => theme.colors.gray6};
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};

    li {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 1rem;
      padding: 1rem 0;
    }

    li + li {
      border-top: 1px solid ${({ theme }) => theme.colors.gray6};
    }
  }

  .project-copy {
    min-width: 0;

    h3 {
      margin: 0;
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 1.05rem;
      line-height: 1.4;
      font-weight: 720;
    }

    p {
      margin: 0.4rem 0 0;
      color: ${({ theme }) => theme.colors.gray11};
      font-size: 0.96rem;
      line-height: 1.7;
      word-break: keep-all;
    }
  }

  .project-meta {
    display: grid;
    justify-items: end;
    align-content: start;
    gap: 0.44rem;

    span {
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.84rem;
      line-height: 1.4;
      font-weight: 700;
      text-align: right;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    a {
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 0.92rem;
      line-height: 1.4;
      font-weight: 650;

      &:hover {
        text-decoration: underline;
        text-underline-offset: 3px;
      }
    }
  }

  .timeline-list {
    display: grid;
    gap: 0.92rem;

    li {
      display: grid;
      grid-template-columns: 7.2rem minmax(0, 1fr);
      gap: 1rem;
      align-items: start;
    }
  }

  .timeline-date {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.9rem;
    line-height: 1.5;
    font-weight: 650;
  }

  .timeline-list strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1rem;
    line-height: 1.6;
    font-weight: 650;
  }

  .supplemental-section[data-has-divider="true"] {
    padding-top: 1.2rem;
    border-top: 1px solid ${({ theme }) => theme.colors.gray6};
  }

  .supplemental-list {
    display: grid;
    gap: 0.52rem;

    li {
      color: ${({ theme }) => theme.colors.gray11};
      font-size: 0.98rem;
      line-height: 1.7;
    }
  }

  .compact-link-section {
    .section-title {
      margin-bottom: 0.82rem;
    }
  }

  .compact-link-list {
    background: transparent;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};

    li + li {
      border-top: 1px solid ${({ theme }) => theme.colors.gray6};
    }

    a {
      display: inline-flex;
      align-items: center;
      gap: 0.7rem;
      width: 100%;
      min-height: 44px;
      padding: 0.84rem 0;
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 0.98rem;
      line-height: 1.5;

      &:hover {
        text-decoration: underline;
        text-underline-offset: 3px;
      }
    }

    .icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 1.05rem;
    }
  }

  @media (max-width: 900px) {
    .hero-grid {
      grid-template-columns: 1fr;
      gap: 1.5rem;
    }

    .hero-rail {
      justify-items: start;
    }

    .cta-group {
      width: 100%;
      max-width: 28rem;
    }

    .project-list li {
      grid-template-columns: 1fr;
    }

    .project-meta {
      justify-items: start;

      span {
        text-align: left;
      }
    }
  }

  @media (max-width: 768px) {
    padding: 1.6rem 0 2.4rem;

    .about-content {
      gap: 2.1rem;
    }

    .hero-grid {
      padding-bottom: 1.6rem;
    }

    .profile-name {
      font-size: 2.25rem;
    }

    .profile-statement {
      font-size: 1.08rem;
      line-height: 1.56;
    }

    .profile-role {
      font-size: 0.9rem;
    }

    .profile-bio {
      font-size: 0.96rem;
      line-height: 1.72;
    }

    .profile-avatar {
      width: 88px;
      box-shadow: none;
    }

    .cta-group {
      gap: 0.54rem;

      a {
        min-height: 42px;
        padding: 0.76rem 0.88rem;
        font-size: 0.95rem;
      }
    }

    .section-title {
      font-size: 1.18rem;
      margin-bottom: 0.88rem;
    }

    .timeline-list {
      gap: 0.74rem;

      li {
        grid-template-columns: 1fr;
        gap: 0.18rem;
      }
    }

    .timeline-date {
      font-size: 0.82rem;
    }

    .project-copy p,
    .supplemental-list li,
    .compact-link-list a {
      font-size: 0.94rem;
    }
  }
`
