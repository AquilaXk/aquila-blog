import { GetServerSideProps } from "next"
import { CONFIG } from "site.config"
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
      timeoutMs: 1_800,
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

const AboutPage: NextPageWithLayout<AboutPageProps> = ({ initialAdminProfile, initialAdminProfileSource }) => {
  const shouldRefreshProfile = initialAdminProfileSource !== "published"
  const adminProfile = useAdminProfile(initialAdminProfile, {
    refetchOnMount: shouldRefreshProfile,
    staleTimeMs: shouldRefreshProfile ? 0 : undefined,
  })

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
          <section className="page-head" data-ui="about-hero">
            <div>
              <span className="mono-label">About {blogTitle}</span>
              <h1>{displayHeadline}</h1>
            </div>
          </section>

          <div className="about-grid">
            <section>
              <h2>Profile</h2>
              <div className="profile-inline">
                <div className="profile-image" data-ui="about-avatar">
                  <ProfileImage
                    src={profileImageSrc}
                    width={132}
                    height={132}
                    alt={`${displayName} profile`}
                    fillContainer
                  />
                </div>
                <div className="profile-copy">
                  <strong>{displayName}</strong>
                  <span>{displayRole}</span>
                  <p>{displayBio}</p>
                </div>
              </div>
              <div className="stack-list">
                <div className="stack-row">
                  <strong>NAME</strong>
                  <span>{displayName}</span>
                </div>
                <div className="stack-row">
                  <strong>ROLE</strong>
                  <span>{displayRole}</span>
                </div>
              </div>
            </section>

            <section>
              <h2>Links</h2>
              <div className="stack-list">
                {contactLinks.map((item) => (
                  <div className="stack-row" key={`${item.label}-${item.safeHref}`}>
                    <strong>{item.label.toUpperCase()}</strong>
                    <a href={item.safeHref} target="_blank" rel="noopener noreferrer">
                      {item.safeHref.replace(/^https?:\/\//, "")}
                    </a>
                  </div>
                ))}
                {serviceLinks.map((item) => (
                  <div className="stack-row" key={`${item.label}-${item.safeHref}`}>
                    <strong>{item.label.toUpperCase()}</strong>
                    <a href={item.safeHref} target="_blank" rel="noopener noreferrer">
                      {item.safeHref.replace(/^https?:\/\//, "")}
                    </a>
                  </div>
                ))}
                {contactLinks.length === 0 && serviceLinks.length === 0 && githubHref ? (
                  <div className="stack-row">
                    <strong>REPOSITORY</strong>
                    <a href={githubHref} target="_blank" rel="noopener noreferrer">
                      {githubHref.replace(/^https?:\/\//, "")}
                    </a>
                  </div>
                ) : null}
              </div>
            </section>

            {projectItems.length > 0 ? (
              <section id="about-projects" data-ui="about-projects">
                <h2>{projectSectionTitle}</h2>
                <div className="stack-list" data-ui="about-project-list">
                  {projectItems.map((item) => (
                    <div className="stack-row" key={item.name}>
                      <strong>{item.role || item.linkLabel || "PROJECT"}</strong>
                      {item.safeHref ? (
                        <a
                          href={item.safeHref}
                          target={isExternalHref(item.safeHref) ? "_blank" : undefined}
                          rel={isExternalHref(item.safeHref) ? "noopener noreferrer" : undefined}
                        >
                          {item.name}
                        </a>
                      ) : (
                        <span>{item.name}</span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {timelineItems.length > 0 ? (
              <section data-ui="about-timeline-section">
                <h2>{timelineSection?.title || "이력"}</h2>
                <div className="stack-list" data-ui="about-timeline">
                  {timelineItems.map((item) => (
                    <div className="stack-row" key={`${item.label}-${item.date}`}>
                      <strong>{item.date}</strong>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {supplementalSections.map((section, index) => (
              <section key={`${section.title}-${index}`} data-has-divider={section.hasDivider ? "true" : "false"}>
                <h2>{section.title}</h2>
                <div className="stack-list">
                  {section.items.map((item) => (
                    <div className="stack-row" key={`${section.title}-${item}`}>
                      <strong>{String(index + 1).padStart(2, "0")}</strong>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
      </AboutPageView>
    </>
  )
}

export default AboutPage
