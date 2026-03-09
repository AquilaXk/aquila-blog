import { CONFIG } from "site.config"
import { NextPageWithLayout } from "../types"
import MetaConfig from "src/components/MetaConfig"
import styled from "@emotion/styled"
import Image from "next/image"

const AboutPage: NextPageWithLayout = () => {
  const meta = {
    title: `About - ${CONFIG.blog.title}`,
    description: CONFIG.profile.bio,
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
                src={CONFIG.profile.image}
                alt={CONFIG.profile.name}
                fill
                sizes="150px"
                className="profile-image"
              />
            </div>
            <h2 className="profile-name">{CONFIG.profile.name}</h2>
            <p className="profile-role">{CONFIG.profile.role}</p>
            <p className="profile-bio">{CONFIG.profile.bio}</p>
          </div>

          <div className="section">
            <h3 className="section-title">Contact</h3>
            <ul className="contact-list">
              {CONFIG.profile.email && (
                <li>
                  <span className="icon">📧</span>
                  <a href={`mailto:${CONFIG.profile.email}`}>{CONFIG.profile.email}</a>
                </li>
              )}
              {CONFIG.profile.github && (
                <li>
                  <span className="icon">💻</span>
                  <a
                    href={`https://github.com/${CONFIG.profile.github}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    github.com/{CONFIG.profile.github}
                  </a>
                </li>
              )}
              {CONFIG.profile.linkedin && (
                <li>
                  <span className="icon">💼</span>
                  <a
                    href={CONFIG.profile.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    LinkedIn
                  </a>
                </li>
              )}
              {CONFIG.profile.instagram && (
                <li>
                  <span className="icon">📸</span>
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
                    <a
                      href={project.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      🚀 {project.name}
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
