import Link from "next/link"
import styled from "@emotion/styled"
import { CONFIG } from "site.config"
import type { LegalPolicyPageProps } from "src/libs/legal/policyTypes"
import { legalPolicyCurrentPaths, legalPolicyHistoryPath, legalPolicyKindLabels } from "src/libs/legal/policyLinks"

const DATA_DELETION_SUBJECT = encodeURIComponent("AquilaLog 데이터 삭제 요청")

export const buildDataDeletionMailto = (email: string) => `mailto:${email}?subject=${DATA_DELETION_SUBJECT}`

const formatDate = (value: string) => value.slice(0, 10)

const LegalPolicyPage = ({ policy, kind, currentHref, versionHref, historyHref, downloadText }: LegalPolicyPageProps) => {
  const downloadHref = `data:text/plain;charset=utf-8,${encodeURIComponent(downloadText)}`
  const title = legalPolicyKindLabels[kind]
  const reviewRequired = policy.reviewRequired ?? []
  const shouldShowReviewRequired = policy.status !== "effective" && reviewRequired.length > 0
  return (
    <StyledWrapper>
      <div className="legalShell">
        <header className="legalHeader">
          <p className="eyebrow">{policy.documentType}</p>
          <h1>{title}</h1>
          <p className="description">{policy.changeSummary[0]}</p>
          <dl className="metaGrid">
            <div>
              <dt>버전</dt>
              <dd>{policy.version}</dd>
            </div>
            <div>
              <dt>공고일</dt>
              <dd>{formatDate(policy.publishedAt)}</dd>
            </div>
            <div>
              <dt>시행일</dt>
              <dd>{formatDate(policy.effectiveAt)}</dd>
            </div>
            <div>
              <dt>문서 해시</dt>
              <dd>{policy.contentSha256}</dd>
            </div>
          </dl>
          <nav aria-label="정책 문서">
            <Link href={legalPolicyCurrentPaths.privacy}>개인정보처리방침</Link>
            <Link href={legalPolicyCurrentPaths.terms}>이용약관</Link>
            <Link href={legalPolicyCurrentPaths.cookies}>쿠키 정책</Link>
            <Link href={legalPolicyHistoryPath}>변경 이력</Link>
            <a href={buildDataDeletionMailto(CONFIG.profile.email)}>{CONFIG.profile.email}</a>
          </nav>
          <div className="actions">
            <button type="button" onClick={() => window.print()}>
              인쇄
            </button>
            <a href={downloadHref} download={`aquilalog-${kind}-${policy.version}.txt`}>
              다운로드
            </a>
            {currentHref !== versionHref ? <Link href={currentHref}>현재 버전</Link> : null}
          </div>
        </header>

        <main className="legalBody">
          {policy.sections.map((section) => (
            <section key={section.id} id={section.id}>
              <h2>{section.title}</h2>
              {section.body.map((paragraph, index) => (
                <p key={`${section.id}-${index}`}>{paragraph}</p>
              ))}
            </section>
          ))}
          {shouldShowReviewRequired ? (
            <section>
              <h2>법무·운영 확인 필요 항목</h2>
              {reviewRequired.map((item, index) => (
                <p key={`review-${index}`}>{item}</p>
              ))}
            </section>
          ) : null}
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

  .metaGrid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.7rem;
    margin: 1.1rem 0 0;
  }

  .metaGrid > div {
    min-width: 0;
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    border-radius: ${({ theme }) => `${theme.variables.ui.card.radius}px`};
    padding: 0.72rem 0.8rem;
    background: ${({ theme }) => theme.colors.gray2};
  }

  dt {
    margin: 0 0 0.25rem;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.76rem;
    font-weight: 760;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.88rem;
    font-weight: 740;
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

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
    margin-top: 1rem;
  }

  .actions button,
  .actions a {
    min-height: ${({ theme }) => `${theme.variables.ui.button.minHeight}px`};
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    border-radius: ${({ theme }) => `${theme.variables.ui.button.radius}px`};
    padding: 0.45rem 0.75rem;
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray12};
    font: inherit;
    font-size: 0.88rem;
    font-weight: 760;
    text-decoration: none;
    cursor: pointer;
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

  @media (max-width: 720px) {
    padding-top: 2.1rem;

    .metaGrid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 430px) {
    .metaGrid {
      grid-template-columns: 1fr;
    }
  }
`
