import type { GetStaticProps } from "next"
import Link from "next/link"
import { CONFIG } from "site.config"
import styled from "@emotion/styled"
import MetaConfig from "src/components/MetaConfig"
import type { LegalPolicySummary } from "src/libs/legal/policyTypes"

type LegalPolicyHistoryProps = {
  policies: LegalPolicySummary[]
}

const LegalPolicyHistoryPage = ({ policies }: LegalPolicyHistoryProps) => (
  <StyledWrapper>
    <MetaConfig
      title="정책 변경 이력"
      description="AquilaLog 법적 정책 문서의 버전, 시행일, 변경 요약, content hash를 확인합니다."
      type="website"
      url={`${CONFIG.link}/legal/history`}
      robots="follow, index"
    />
    <main className="historyShell">
      <header>
        <p className="eyebrow">정책 원문 검증</p>
        <h1>정책 변경 이력</h1>
        <p>현재 시행 중인 법적 정책 문서와 immutable content hash를 확인합니다.</p>
      </header>
      <div className="policyList">
        {policies.map((policy) => (
          <article key={`${policy.kind}-${policy.version}`}>
            <div>
              <h2>{policy.title}</h2>
              <p>버전 {policy.version} · 시행일 {policy.effectiveAt.slice(0, 10)}</p>
              <p className="hash">contentSha256 {policy.contentSha256}</p>
              {policy.changeSummary.map((summary, index) => (
                <p key={`${policy.kind}-summary-${index}`}>{summary}</p>
              ))}
            </div>
            <nav aria-label={`${policy.title} 링크`}>
              {policy.currentHref !== policy.href ? <Link href={policy.currentHref}>현재 문서</Link> : null}
              <Link href={policy.href}>버전 문서</Link>
            </nav>
          </article>
        ))}
      </div>
    </main>
  </StyledWrapper>
)

export const getStaticProps: GetStaticProps<LegalPolicyHistoryProps> = async () => {
  const { getLegalPolicyHistoryStaticProps } = await import("src/libs/legal/serverPolicySource")
  return getLegalPolicyHistoryStaticProps()
}

export default LegalPolicyHistoryPage

const StyledWrapper = styled.div`
  min-height: calc(100vh - 4rem);
  padding: 3rem 1rem 4rem;
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};

  .historyShell {
    width: min(860px, 100%);
    margin: 0 auto;
  }

  header {
    margin-bottom: 1.5rem;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray5};
    padding-bottom: 1.4rem;
  }

  .eyebrow {
    margin: 0 0 0.55rem;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
    font-weight: 760;
    text-transform: uppercase;
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  h1 {
    font-size: clamp(2rem, 5vw, 3rem);
    line-height: 1.14;
  }

  header p:not(.eyebrow) {
    max-width: 680px;
    margin-top: 0.9rem;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.72;
  }

  .policyList {
    display: grid;
    gap: 1rem;
  }

  article {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1rem;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray4};
    padding-bottom: 1rem;
  }

  h2 {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.1rem;
  }

  article p {
    margin-top: 0.45rem;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.65;
  }

  .hash {
    overflow-wrap: anywhere;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
  }

  nav {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 0.5rem;
  }

  /* 패밀리룩(1225): 항목마다 반복되는 파란 링크 노이즈 완화 → 절제된 muted 링크 */
  a {
    color: ${({ theme }) => theme.colors.gray11};
    font-weight: 600;
    font-size: 0.85rem;
    text-decoration: underline;
    text-decoration-color: ${({ theme }) => theme.colors.gray7};
    text-underline-offset: 3px;
  }

  a:hover {
    color: ${({ theme }) => theme.publicDesign.accent};
    text-decoration-color: currentColor;
  }

  @media (max-width: 680px) {
    article {
      grid-template-columns: 1fr;
    }
  }
`
