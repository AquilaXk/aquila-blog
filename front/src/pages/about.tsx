import { GetServerSideProps } from "next"
import { CONFIG } from "site.config"
import AppIcon from "src/components/icons/AppIcon"
import MetaConfig from "src/components/MetaConfig"
import ProfileImage from "src/components/ProfileImage"
import { AdminProfile, useAdminProfile } from "src/hooks/useAdminProfile"
import {
  DEFAULT_ABOUT_HEADLINE,
  DEFAULT_ABOUT_PROJECT_SECTION_TITLE,
  isAboutProjectSectionTitle,
  parseLegacyAboutDetails,
} from "src/libs/profileWorkspace"
import { NextPageWithLayout } from "../types"
import { AboutPageView } from "src/routes/About/AboutPageView"
import {
  isExternalHref,
  isTimelineSection,
  parseTimelineItem,
  type AboutProjectItem,
} from "src/routes/About/AboutPageModel"
import {
  buildStaticAdminProfileSnapshot,
  fetchServerAdminProfile,
  hasServerAuthCookie,
  resolvePublicAdminProfileSnapshot,
  type StaticAdminProfileSeedSource,
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
  const initialAdminProfileSource: StaticAdminProfileSeedSource =
    adminProfileResult.ok && adminProfileResult.value
      ? "published"
      : fallbackProfileSnapshot?.source === "cookie-snapshot"
        ? "published"
        : "static-fallback"

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
      initialAdminProfileSource,
    },
  }
}

type AboutPageProps = {
  initialAdminProfile: AdminProfile | null
  initialAdminProfileSource: StaticAdminProfileSeedSource
}

const AboutPage: NextPageWithLayout<AboutPageProps> = ({ initialAdminProfile }) => {
  const adminProfile = useAdminProfile(initialAdminProfile)

  const displayName = adminProfile?.nickname || adminProfile?.name || CONFIG.profile.name
  const displayHeadline = adminProfile?.aboutHeadline || DEFAULT_ABOUT_HEADLINE
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
  const projectSection = aboutDetailSections.find((section) => isAboutProjectSectionTitle(section.title))
  const timelineSection = aboutDetailSections.find((section) => isTimelineSection(section.title))
  const supplementalSections = aboutDetailSections.filter(
    (section) => section !== projectSection && section !== timelineSection
  )
  const githubHref = contactLinks.find((item) => item.label.toLowerCase().includes("github"))?.safeHref || ""
  const workspaceProjects =
    adminProfile?.aboutProjects && adminProfile.aboutProjects.length > 0
      ? adminProfile.aboutProjects
      : (projectSection?.items || []).map((name, index) => ({
          id: `legacy-project-${index + 1}`,
          name,
          summary: "",
          role: "",
          href: "",
          linkLabel: "",
        }))
  const projectSectionTitle =
    adminProfile?.aboutProjectSectionTitle || projectSection?.title || DEFAULT_ABOUT_PROJECT_SECTION_TITLE
  const projectItems: AboutProjectItem[] = workspaceProjects.map((project) => {
    const linkedService = serviceLinks.find((item) => item.label.toLowerCase() === project.name.toLowerCase())
    const safeHref = resolveRenderableProfileLinkHref("service", project.href || linkedService?.safeHref || "") || ""
    return {
      name: project.name,
      summary: project.summary,
      role: project.role,
      safeHref,
      linkLabel: project.linkLabel || linkedService?.label || (safeHref ? "링크 보기" : ""),
    }
  })
  const timelineItems = (timelineSection?.items || []).map(parseTimelineItem)
  const ctaLinks = [
    githubHref ? { label: "GitHub", safeHref: githubHref } : null,
    projectItems.length > 0 ? { label: "프로젝트 보기", safeHref: "#about-projects" } : null,
  ].filter((item): item is { label: string; safeHref: string } => Boolean(item?.safeHref))

  const meta = {
    title: `About - ${blogTitle}`,
    description: displayBio,
    type: "website",
    url: `${CONFIG.link}/about`,
  }

  return (
    <>
      <MetaConfig {...meta} />
      <AboutPageView>
          <section className="hero-grid">
            <div className="hero-copy" data-ui="about-hero">
              <p className="about-eyebrow" data-ui="about-eyebrow">
                Profile
              </p>
              <h1 className="profile-name">{displayName}</h1>
              <p className="profile-statement">{displayHeadline}</p>
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
                    className="cta-link"
                    href={item.safeHref}
                    target={isExternalHref(item.safeHref) ? "_blank" : undefined}
                    rel={isExternalHref(item.safeHref) ? "noopener noreferrer" : undefined}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </aside>
          </section>

          {projectItems.length > 0 ? (
            <section className="content-section" id="about-projects" data-ui="about-projects">
              <h2 className="section-title">{projectSectionTitle}</h2>
              <ul className="project-list" data-ui="about-project-list">
                {projectItems.map((item) => (
                  <li key={item.name}>
                    <div className="project-copy">
                      <h3>{item.name}</h3>
                      {item.summary ? <p data-ui="about-project-summary">{item.summary}</p> : null}
                    </div>
                    <div className="project-meta">
                      {item.role ? <span data-ui="about-project-role">{item.role}</span> : null}
                      {item.safeHref && item.linkLabel ? (
                        <a
                          className="project-link"
                          href={item.safeHref}
                          target={isExternalHref(item.safeHref) ? "_blank" : undefined}
                          rel={isExternalHref(item.safeHref) ? "noopener noreferrer" : undefined}
                        >
                          {item.linkLabel}
                        </a>
                      ) : null}
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
      </AboutPageView>
    </>
  )
}

export default AboutPage
