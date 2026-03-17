import styled from "@emotion/styled"
import { GetServerSideProps } from "next"
import { dehydrate } from "@tanstack/react-query"
import { CONFIG } from "site.config"
import AppIcon from "src/components/icons/AppIcon"
import MetaConfig from "src/components/MetaConfig"
import ProfileImage from "src/components/ProfileImage"
import { AdminProfile, useAdminProfile } from "src/hooks/useAdminProfile"
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
    !authMember && initialAdminProfile
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

  const imageSrc =
    adminProfile?.profileImageDirectUrl || adminProfile?.profileImageUrl || CONFIG.profile.image
  const displayName = adminProfile?.username || CONFIG.profile.name
  const displayRole = adminProfile?.profileRole || CONFIG.profile.role
  const displayBio = adminProfile?.profileBio || CONFIG.profile.bio
  const contactLinks = resolveContactLinks(adminProfile)
  const serviceLinks = resolveServiceLinks(adminProfile)

  const meta = {
    title: `About - ${CONFIG.blog.title}`,
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
            <div className="profile-image-wrapper">
              <ProfileImage
                src={imageSrc}
                alt={displayName}
                width={150}
                height={150}
                priority
                fillContainer
                className="profile-image"
              />
            </div>
            <h2 className="profile-name">{displayName}</h2>
            <p className="profile-role">{displayRole}</p>
            <p className="profile-bio">{displayBio}</p>
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
  padding: 2rem 0 2.6rem;

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
      text-align: center;
      margin-bottom: 3rem;
      padding: 1rem 0.9rem 1.25rem;
      border: 1px solid ${({ theme }) => theme.colors.gray6};
      border-radius: 12px;
      background: ${({ theme }) => theme.colors.gray1};

      .profile-image-wrapper {
        position: relative;
        width: 150px;
        height: 150px;
        margin: 0 auto 1.5rem;

        .profile-image {
          border-radius: 50%;
          object-fit: cover;
          object-position: center 38%;
          border: 1px solid ${({ theme }) => theme.colors.gray6};
        }
      }

      .profile-name {
        font-size: 2rem;
        font-weight: 700;
        margin-bottom: 0.5rem;
        color: ${({ theme }) => theme.colors.gray12};
      }

      .profile-role {
        color: ${({ theme }) => theme.colors.gray11};
        font-size: 1.125rem;
        margin-bottom: 1rem;
        font-weight: 500;
      }

      .profile-bio {
        font-size: 1rem;
        line-height: 1.75;
        color: ${({ theme }) => theme.colors.gray11};
        max-width: 600px;
        margin: 0 auto;
      }
    }

    .section {
      margin-bottom: 3rem;

      .section-title {
        font-size: 1.5rem;
        font-weight: 700;
        margin-bottom: 1.5rem;
        color: ${({ theme }) => theme.colors.gray12};
        padding-bottom: 0.5rem;
        border-bottom: 2px solid ${({ theme }) => theme.colors.gray6};
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
          padding: 0.58rem 0.65rem;
          border-radius: 8px;
          border: 1px solid ${({ theme }) => theme.colors.gray6};
          transition: background-color 0.2s ease, border-color 0.2s ease;

          &:hover {
            background-color: ${({ theme }) => theme.colors.gray2};
            border-color: ${({ theme }) => theme.colors.gray8};
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
`
