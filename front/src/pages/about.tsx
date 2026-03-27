import styled from "@emotion/styled"
import { GetServerSideProps } from "next"
import { dehydrate } from "@tanstack/react-query"
import { CONFIG } from "site.config"
import AppIcon from "src/components/icons/AppIcon"
import MetaConfig from "src/components/MetaConfig"
import ProfileImage from "src/components/ProfileImage"
import { AdminProfile, useAdminProfile } from "src/hooks/useAdminProfile"
import { parseLegacyAboutDetails } from "src/libs/profileWorkspace"
import { createQueryClient } from "src/libs/react-query"
import { queryKey } from "src/constants/queryKey"
import { hydrateServerAuthSession } from "src/libs/server/authSession"
import { NextPageWithLayout } from "../types"
import { fetchServerAdminProfile } from "src/libs/server/adminProfile"
import { resolveContactLinks, resolveServiceLinks } from "src/libs/utils/profileCardLinks"

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const queryClient = createQueryClient()
  const [initialAdminProfile, authMember] = await Promise.all([
    fetchServerAdminProfile(req),
    hydrateServerAuthSession(queryClient, req),
  ])
  queryClient.setQueryData(queryKey.adminProfile(), initialAdminProfile)

  res.setHeader(
    "Cache-Control",
    authMember === null && initialAdminProfile
      ? "public, s-maxage=60, stale-while-revalidate=300"
      : "private, no-store"
  )

  return {
    props: {
      dehydratedState: dehydrate(queryClient),
      initialAdminProfile,
    },
  }
}

type AboutPageProps = {
  initialAdminProfile: AdminProfile | null
}

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
          items: section.items.map((item) => ({ text: item, bullet: true })),
          hasDivider: section.dividerBefore,
        }))
      : parseLegacyAboutDetails(adminProfile?.aboutDetails || "").map((section) => ({
          title: section.title,
          items: section.items.map((item) => ({ text: item, bullet: true })),
          hasDivider: section.dividerBefore,
        }))
  const blogTitle = adminProfile?.blogTitle || CONFIG.blog.title
  const contactLinks = resolveContactLinks(adminProfile)
  const serviceLinks = resolveServiceLinks(adminProfile)

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
          <h1 className="page-title">About Me</h1>

          <div className="profile-section">
            <div className="profile-identity">
              <div className="profile-avatar">
                <ProfileImage
                  src={profileImageSrc}
                  width={108}
                  height={108}
                  alt={`${displayName} profile`}
                  priority
                  fillContainer
                />
              </div>
              <div className="profile-copy">
                <h2 className="profile-name">{displayName}</h2>
                <p className="profile-role">{displayRole}</p>
                <p className="profile-bio">{displayBio}</p>
              </div>
            </div>
            {aboutDetailSections.length > 0 && (
              <div className="about-detail-sections" aria-label="about 상세 정보">
                {aboutDetailSections.map((section, index) => (
                  <section
                    key={`${section.title}-${index}`}
                    className="about-detail-section"
                    data-has-divider={section.hasDivider ? "true" : "false"}
                  >
                    <h3 className="about-detail-title">{section.title}</h3>
                    <ul className="about-detail-items">
                      {section.items.map((item, itemIndex) => (
                        <li key={`${section.title}-${itemIndex}`} data-bullet={item.bullet ? "true" : "false"}>
                          {item.text}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>

          <div className="section">
            <h3 className="section-title">Contact</h3>
            <ul className="contact-list">
              {contactLinks.map((item) => (
                <li key={`${item.icon}-${item.label}-${item.href}`}>
                  <span className="icon">
                    <AppIcon name={item.icon} aria-hidden="true" />
                  </span>
                  <a href={item.href} target="_blank" rel="noopener noreferrer">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {serviceLinks.length > 0 && (
            <div className="section">
              <h3 className="section-title">Service</h3>
              <ul className="projects-list">
                {serviceLinks.map((item) => (
                  <li key={`${item.icon}-${item.label}-${item.href}`}>
                    <a href={item.href} target="_blank" rel="noopener noreferrer">
                      <AppIcon name={item.icon} aria-hidden="true" /> {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </article>
      </StyledWrapper>
    </>
  )
}

export default AboutPage

const StyledWrapper = styled.div`
  max-width: 56rem;
  margin: 0 auto;
  padding: 1.8rem 0 2.6rem;

  .about-content {
    .page-title {
      font-size: 2.5rem;
      font-weight: 700;
      margin-bottom: 3rem;
      color: ${({ theme }) => theme.colors.gray12};

      @media (max-width: 768px) {
        font-size: 2rem;
        margin-bottom: 2rem;
      }
    }

    .profile-section {
      margin-bottom: 3rem;
      padding: 1.4rem 1rem 1.3rem;
      border: 1px solid ${({ theme }) => theme.colors.gray5};
      border-radius: 16px;
      background: ${({ theme }) => theme.colors.gray2};
      box-shadow: 0 14px 32px rgba(0, 0, 0, 0.22);

      .profile-identity {
        width: fit-content;
        max-width: 100%;
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1.5rem;
      }

      .profile-avatar {
        position: relative;
        width: 108px;
        flex: 0 0 108px;
        border-radius: 999px;
        overflow: hidden;
        border: 1px solid ${({ theme }) => theme.colors.gray6};
        background: ${({ theme }) => theme.colors.gray1};

        &::after {
          content: "";
          display: block;
          padding-bottom: 100%;
        }
      }

      .profile-copy {
        display: grid;
        gap: 0.48rem;
        text-align: left;
      }

      .profile-name {
        font-size: 2rem;
        font-weight: 800;
        margin: 0;
        color: ${({ theme }) => theme.colors.gray12};
      }

      .profile-role {
        color: ${({ theme }) => theme.colors.gray11};
        font-size: 1.125rem;
        margin: 0;
        font-weight: 500;
      }

      .profile-bio {
        font-size: 1rem;
        line-height: 1.75;
        color: ${({ theme }) => theme.colors.gray11};
        max-width: 600px;
        margin: 0;
      }

      .about-detail-sections {
        margin: 2rem auto 0;
        padding-top: 1.5rem;
        border-top: 1px solid ${({ theme }) => theme.colors.gray5};
        max-width: 42rem;
        text-align: left;

        .about-detail-section {
          padding: 1rem 0 1.08rem;

          &[data-has-divider="true"] {
            border-top: 1px solid ${({ theme }) => theme.colors.gray6};
          }
        }

        .about-detail-title {
          margin: 0;
          font-size: 1.3rem;
          line-height: 1.42;
          letter-spacing: -0.01em;
          color: ${({ theme }) => theme.colors.gray12};
        }

        .about-detail-items {
          margin: 0.78rem 0 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 0.42rem;

          li {
            margin: 0;
            font-size: 1.02rem;
            line-height: 1.72;
            color: ${({ theme }) => theme.colors.gray11};
            white-space: pre-line;
            word-break: keep-all;

            &[data-bullet="true"] {
              position: relative;
              padding-left: 1rem;

              &::before {
                content: "";
                position: absolute;
                left: 0.22rem;
                top: 0.78rem;
                width: 0.34rem;
                height: 0.34rem;
                border-radius: 999px;
                background: ${({ theme }) => theme.colors.gray10};
              }
            }
          }
        }
      }

      @media (max-width: 768px) {
        .profile-identity {
          gap: 1rem;
        }

        .profile-avatar {
          width: 88px;
          flex-basis: 88px;
        }

        .profile-name {
          font-size: 1.7rem;
        }

        .profile-role {
          font-size: 1rem;
        }
      }
    }

    .section {
      margin-bottom: 3rem;

      .section-title {
        font-size: 1.5rem;
        font-weight: 800;
        margin-bottom: 1.5rem;
        color: ${({ theme }) => theme.colors.gray12};
        padding-bottom: 0.58rem;
        border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
      }

      .contact-list,
      .projects-list {
        list-style: none;
        padding: 0;
        margin: 0;

        li {
          margin-bottom: 1rem;
          font-size: 1rem;
          display: flex;
          align-items: center;
          min-height: 44px;
          padding: 0.58rem 0.72rem;
          border-radius: 11px;
          border: 1px solid ${({ theme }) => theme.colors.gray5};
          background: ${({ theme }) => theme.colors.gray2};
          box-shadow: 0 8px 18px rgba(0, 0, 0, 0.16);
          transition: background-color 0.2s ease, border-color 0.2s ease, transform 0.2s ease;

          &:hover {
            background-color: ${({ theme }) => theme.colors.gray2};
            border-color: ${({ theme }) => theme.colors.gray7};
            transform: translateY(-2px);
          }

          .icon {
            margin-right: 0.75rem;
            font-size: 1.25rem;
          }

          a {
            display: inline-flex;
            align-items: center;
            min-height: 34px;
            color: ${({ theme }) => theme.colors.gray12};
            text-decoration: none;
            flex: 1;
            overflow-wrap: anywhere;

            &:hover {
              color: ${({ theme }) => theme.colors.gray11};
              text-decoration: underline;
            }
          }
        }
      }

      .projects-list {
        li {
          a {
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }
        }
      }
    }
  }

  @media (max-width: 768px) {
    .about-content {
      .about-detail-sections {
        margin-top: 1.52rem;
        padding-top: 1.08rem;

        .about-detail-section {
          padding: 0.84rem 0 0.92rem;
        }

        .about-detail-title {
          font-size: 1.08rem;
        }

        .about-detail-items {
          margin-top: 0.72rem;
          gap: 0.36rem;

          li {
            font-size: 0.95rem;
            line-height: 1.63;
          }
        }
      }
    }
  }
`
