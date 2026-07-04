import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import styled from "@emotion/styled"
import { CONFIG } from "site.config"
import type { LegalPolicyKind, LegalPolicyPageProps } from "src/libs/legal/policyTypes"
import { legalPolicyCurrentPaths, legalPolicyHistoryPath, legalPolicyKindLabels } from "src/libs/legal/policyLinks"

const policyContactSubjects: Record<LegalPolicyKind, string> = {
  privacy: "AquilaLog 개인정보 문의 및 데이터 삭제 요청",
  terms: "AquilaLog 이용약관 문의",
  cookies: "AquilaLog 쿠키 및 브라우저 저장소 문의",
}

const policyDocumentLabels: Record<LegalPolicyKind, string> = {
  privacy: "개인정보 보호 문서",
  terms: "서비스 이용 조건 문서",
  cookies: "쿠키 및 브라우저 저장소 문서",
}

const buildPolicyContactMailto = (kind: LegalPolicyKind, email: string) =>
  `mailto:${email}?subject=${encodeURIComponent(policyContactSubjects[kind])}`

const formatDate = (value: string) => value.slice(0, 10)

const LegalPolicyPage = ({
  policy,
  kind,
  currentHref,
  versionHref,
  historyHref,
  downloadText,
  downloadFilename,
  downloadHashBasis,
  isCurrentRoute,
}: LegalPolicyPageProps) => {
  const [activeSectionId, setActiveSectionId] = useState(policy.sections[0]?.id ?? "")
  const downloadHref = `data:application/json;charset=utf-8,${encodeURIComponent(downloadText)}`
  const title = legalPolicyKindLabels[kind]
  const reviewRequired = policy.reviewRequired ?? []
  const shouldShowReviewRequired = policy.status !== "effective" && reviewRequired.length > 0
  const activeSection = useMemo(
    () => policy.sections.find((section) => section.id === activeSectionId) ?? policy.sections[0],
    [activeSectionId, policy.sections],
  )

  useEffect(() => {
    const sectionElements = policy.sections
      .map((section) => document.getElementById(section.id))
      .filter((element): element is HTMLElement => Boolean(element))

    if (sectionElements.length === 0) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0]
        if (visibleEntry?.target.id) {
          setActiveSectionId(visibleEntry.target.id)
        }
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: [0.1, 0.35, 0.6] },
    )

    sectionElements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [policy.sections])

  const moveToSection = (sectionId: string) => {
    setActiveSectionId(sectionId)
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" })
    window.history.replaceState(null, "", `#${sectionId}`)
  }

  return (
    <StyledWrapper>
      <div className="legalShell">
        <header className="legalHeader">
          <p className="eyebrow">{policyDocumentLabels[kind]}</p>
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
              <dt>원문 검증</dt>
              <dd>canonical JSON</dd>
            </div>
          </dl>
          <nav className="policyNav" aria-label="정책 문서">
            <Link href={legalPolicyCurrentPaths.privacy}>개인정보처리방침</Link>
            <Link href={legalPolicyCurrentPaths.terms}>이용약관</Link>
            <Link href={legalPolicyCurrentPaths.cookies}>쿠키 정책</Link>
            <Link href={legalPolicyHistoryPath}>변경 이력</Link>
            <a href={buildPolicyContactMailto(kind, CONFIG.profile.email)}>{policyContactSubjects[kind]}</a>
          </nav>
          <div className="actions">
            <button type="button" onClick={() => window.print()}>
              인쇄
            </button>
            <a href={downloadHref} download={downloadFilename}>
              원문 JSON 다운로드
            </a>
            {!isCurrentRoute ? <Link href={currentHref}>현재 버전</Link> : null}
          </div>
          <details className="integrityDetails">
            <summary>문서 무결성 정보</summary>
            <dl>
              <div>
                <dt>검증 기준</dt>
                <dd>{downloadHashBasis}</dd>
              </div>
              <div>
                <dt>SHA-256</dt>
                <dd>{policy.contentSha256}</dd>
              </div>
            </dl>
          </details>
        </header>

        <div className="mobileSectionJump">
          <label htmlFor="legal-section-jump">현재 섹션</label>
          <select
            id="legal-section-jump"
            aria-label="정책 섹션 이동"
            value={activeSection?.id ?? ""}
            onChange={(event) => moveToSection(event.target.value)}
          >
            {policy.sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.title}
              </option>
            ))}
          </select>
        </div>

        <div className="legalContentGrid">
          <aside className="tocRail" aria-label="정책 목차">
            <p>본문 목차</p>
            <nav aria-label="정책 목차">
              {policy.sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  aria-current={activeSection?.id === section.id ? "true" : undefined}
                >
                  {section.title}
                </a>
              ))}
            </nav>
          </aside>

          <main className="legalBody">
            {policy.sections.map((section) => (
              <section key={section.id} id={section.id}>
                <div className="sectionHeading">
                  <h2>{section.title}</h2>
                  <a href={`#${section.id}`} aria-label={`${section.title} 섹션 링크`}>
                    #
                  </a>
                </div>
                {section.body.map((paragraph, index) => (
                  <p key={`${section.id}-${index}`}>{paragraph}</p>
                ))}
              </section>
            ))}
            {shouldShowReviewRequired ? (
              <section>
                <div className="sectionHeading">
                  <h2>법무·운영 확인 필요 항목</h2>
                </div>
                {reviewRequired.map((item, index) => (
                  <p key={`review-${index}`}>{item}</p>
                ))}
              </section>
            ) : null}
          </main>
        </div>
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
    width: min(1120px, 100%);
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
    font-size: 2.75rem;
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

  .policyNav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 0.9rem;
    margin-top: 1.1rem;
  }

  /* 패밀리룩(1225): 본문 링크를 절제된 포인트 컬러(공용 accent)로, 굵기 완화 */
  a {
    color: ${({ theme }) => theme.publicDesign.accent};
    font-weight: 600;
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

  .integrityDetails {
    margin-top: 0.9rem;
    border-top: 1px solid ${({ theme }) => theme.colors.gray4};
    padding-top: 0.85rem;
  }

  .integrityDetails summary {
    width: fit-content;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.9rem;
    font-weight: 800;
    cursor: pointer;
  }

  .integrityDetails dl {
    display: grid;
    gap: 0.65rem;
    margin: 0.8rem 0 0;
  }

  .integrityDetails dd {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-size: 0.78rem;
  }

  .mobileSectionJump {
    display: none;
  }

  .legalContentGrid {
    display: grid;
    grid-template-columns: 15rem minmax(0, 1fr);
    gap: 2rem;
    align-items: start;
  }

  .tocRail {
    position: sticky;
    top: 5.5rem;
    max-height: calc(100vh - 7rem);
    overflow: auto;
    border-right: 1px solid ${({ theme }) => theme.colors.gray4};
    padding-right: 1rem;
  }

  .tocRail p {
    margin: 0 0 0.7rem;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
    font-weight: 800;
  }

  .tocRail nav {
    display: grid;
    gap: 0.18rem;
  }

  .tocRail a {
    border-radius: 8px;
    padding: 0.45rem 0.55rem;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.86rem;
    font-weight: 720;
    line-height: 1.35;
    text-decoration: none;
  }

  .tocRail a[aria-current="true"] {
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
  }

  .legalBody {
    display: grid;
    gap: 1.3rem;
  }

  section {
    scroll-margin-top: 5.25rem;
    padding-bottom: 1.3rem;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray4};
  }

  section:last-of-type {
    border-bottom: 0;
  }

  h2 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.18rem;
    line-height: 1.35;
  }

  .sectionHeading {
    display: flex;
    align-items: baseline;
    gap: 0.45rem;
    margin-bottom: 0.65rem;
  }

  .sectionHeading a {
    color: ${({ theme }) => theme.colors.gray9};
    font-size: 0.95rem;
    text-decoration: none;
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

    h1 {
      font-size: 2.1rem;
    }

    .metaGrid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .legalContentGrid {
      display: block;
    }

    .tocRail {
      display: none;
    }

    .mobileSectionJump {
      display: grid;
      gap: 0.45rem;
      margin: 0 0 1.2rem;
    }

    .mobileSectionJump label {
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.78rem;
      font-weight: 800;
    }

    .mobileSectionJump select {
      min-height: 44px;
      border: 1px solid ${({ theme }) => theme.colors.gray5};
      border-radius: ${({ theme }) => `${theme.variables.ui.button.radius}px`};
      padding: 0 0.75rem;
      background: ${({ theme }) => theme.colors.gray2};
      color: ${({ theme }) => theme.colors.gray12};
      font: inherit;
      font-size: 0.95rem;
      font-weight: 720;
    }
  }

  @media (max-width: 430px) {
    .metaGrid {
      grid-template-columns: 1fr;
    }
  }

  @media print {
    padding: 0;
    background: #fff;
    color: #111;

    .policyNav,
    .actions,
    .tocRail,
    .mobileSectionJump,
    .sectionHeading a {
      display: none;
    }

    .legalShell {
      width: 100%;
    }

    .legalContentGrid {
      display: block;
    }
  }
`
