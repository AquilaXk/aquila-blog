import Link from "next/link"
import styled from "@emotion/styled"
import { CONFIG } from "site.config"

export const DATA_DELETION_MAILTO =
  "mailto:illusiveman7@gmail.com?subject=AquilaLog%20%EB%8D%B0%EC%9D%B4%ED%84%B0%20%EC%82%AD%EC%A0%9C%20%EC%9A%94%EC%B2%AD"

type LegalPolicySection = {
  title: string
  body: string[]
}

type LegalPolicyPageProps = {
  eyebrow: string
  title: string
  description: string
  updatedAt: string
  sections: LegalPolicySection[]
}

const LegalPolicyPage = ({ eyebrow, title, description, updatedAt, sections }: LegalPolicyPageProps) => {
  return (
    <StyledWrapper>
      <div className="legalShell">
        <header className="legalHeader">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="description">{description}</p>
          <p className="updated">시행일: {updatedAt}</p>
          <nav aria-label="정책 문서">
            <Link href="/privacy">개인정보처리방침</Link>
            <Link href="/terms">이용약관</Link>
            <a href={DATA_DELETION_MAILTO}>{CONFIG.profile.email}</a>
          </nav>
        </header>

        <main className="legalBody">
          {sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </main>
      </div>
    </StyledWrapper>
  )
}

export default LegalPolicyPage

const StyledWrapper = styled.div`
  min-height: calc(100vh - 4rem);
  padding: 3rem 1rem 4rem;
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};

  .legalShell {
    width: min(860px, 100%);
    margin: 0 auto;
  }

  .legalHeader {
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray5};
    padding-bottom: 1.4rem;
    margin-bottom: 1.6rem;
  }

  .eyebrow {
    margin: 0 0 0.55rem;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
    font-weight: 760;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: clamp(2rem, 5vw, 3rem);
    line-height: 1.14;
  }

  .description {
    max-width: 680px;
    margin: 0.9rem 0 0;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 1.02rem;
    line-height: 1.72;
  }

  .updated {
    margin: 1rem 0 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.9rem;
  }

  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 0.9rem;
    margin-top: 1.1rem;
  }

  a {
    color: ${({ theme }) => theme.colors.accentLink};
    font-weight: 700;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .legalBody {
    display: grid;
    gap: 1.3rem;
  }

  section {
    padding-bottom: 1.3rem;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray4};
  }

  section:last-of-type {
    border-bottom: 0;
  }

  h2 {
    margin: 0 0 0.65rem;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.18rem;
    line-height: 1.35;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.78;
  }

  p + p {
    margin-top: 0.58rem;
  }
`
