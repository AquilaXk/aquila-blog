import styled from "@emotion/styled"
import Image from "next/image"
import { GetServerSideProps } from "next"
import { IncomingMessage } from "http"
import { CONFIG } from "site.config"
import { Emoji } from "src/components/Emoji"
import MetaConfig from "src/components/MetaConfig"
import { AdminProfile, useAdminProfile } from "src/hooks/useAdminProfile"
import { NextPageWithLayout } from "../types"

const resolveServerApiBaseUrl = (req: IncomingMessage): string => {
  const internal = process.env.BACKEND_INTERNAL_URL
  if (internal) return internal.replace(/\/+$/, "")

  const publicUrl = process.env.NEXT_PUBLIC_BACKEND_URL
  if (publicUrl) return publicUrl.replace(/\/+$/, "")

  const forwardedProto = req.headers["x-forwarded-proto"]
  const protocol = typeof forwardedProto === "string" ? forwardedProto : "https"
  const host = req.headers.host || ""
  const apiHost = host.replace(/^www\./, "api.")
  return `${protocol}://${apiHost}`
}

const fetchAdminProfile = async (req: IncomingMessage): Promise<AdminProfile | null> => {
  try {
    const baseUrl = resolveServerApiBaseUrl(req)
    const response = await fetch(`${baseUrl}/member/api/v1/members/adminProfile`)
    if (!response.ok) return null
    return (await response.json()) as AdminProfile
  } catch {
    return null
  }
}

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const initialAdminProfile = await fetchAdminProfile(req)

  res.setHeader(
    "Cache-Control",
    initialAdminProfile
      ? "public, s-maxage=30, stale-while-revalidate=120"
      : "private, no-store"
  )

  return {
    props: {
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
  const bypassOptimizer =
    imageSrc.includes("/redirectToProfileImg") ||
    imageSrc.startsWith("data:") ||
    imageSrc.includes("placehold.co")

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
              <Image
                src={imageSrc}
                alt={displayName}
                fill
                sizes="150px"
                priority
                className="profile-image"
                unoptimized={bypassOptimizer}
              />
            </div>
            <h2 className="profile-name">{displayName}</h2>
            <p className="profile-role">{displayRole}</p>
            <p className="profile-bio">{displayBio}</p>
          </div>

          <div className="section">
            <h3 className="section-title">Contact</h3>
            <ul className="contact-list">
              {CONFIG.profile.email && (
                <li>
                  <span className="icon">
                    <Emoji>📧</Emoji>
                  </span>
                  <a href={`mailto:${CONFIG.profile.email}`}>{CONFIG.profile.email}</a>
                </li>
              )}
              {CONFIG.profile.github && (
                <li>
                  <span className="icon">
                    <Emoji>💻</Emoji>
                  </span>
                  <a href={`https://github.com/${CONFIG.profile.github}`} target="_blank" rel="noopener noreferrer">
                    github.com/{CONFIG.profile.github}
                  </a>
                </li>
              )}
              {CONFIG.profile.linkedin && (
                <li>
                  <span className="icon">
                    <Emoji>💼</Emoji>
                  </span>
                  <a href={CONFIG.profile.linkedin} target="_blank" rel="noopener noreferrer">
                    LinkedIn
                  </a>
                </li>
              )}
              {CONFIG.profile.instagram && (
                <li>
                  <span className="icon">
                    <Emoji>📸</Emoji>
                  </span>
                  <a
                    href={`https://instagram.com/${CONFIG.profile.instagram}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    @{CONFIG.profile.instagram}
                  </a>
                </li>
              )}
            </ul>
          </div>

          {CONFIG.projects && CONFIG.projects.length > 0 && (
            <div className="section">
              <h3 className="section-title">Projects</h3>
              <ul className="projects-list">
                {CONFIG.projects.map((project, index) => (
                  <li key={index}>
                    <a href={project.href} target="_blank" rel="noopener noreferrer">
                      <Emoji>🚀</Emoji> {project.name}
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
  padding: 3rem 0;

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
      margin-bottom: 4rem;
      padding: 2rem;
      background-color: ${({ theme }) => theme.colors.gray3};
      border-radius: 1rem;

      .profile-image-wrapper {
        position: relative;
        width: 150px;
        height: 150px;
        margin: 0 auto 1.5rem;

        .profile-image {
          border-radius: 50%;
          object-fit: cover;
          object-position: center 38%;
          border: 4px solid ${({ theme }) => theme.colors.gray6};
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
          padding: 0.75rem 1rem;
          background-color: ${({ theme }) => theme.colors.gray3};
          border-radius: 0.5rem;
          transition: all 0.2s ease;

          &:hover {
            background-color: ${({ theme }) => theme.colors.gray4};
            transform: translateX(4px);
          }

          .icon {
            margin-right: 0.75rem;
            font-size: 1.25rem;
          }

          a {
            color: ${({ theme }) => theme.colors.gray12};
            text-decoration: none;
            flex: 1;

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
