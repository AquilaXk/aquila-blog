import { CONFIG } from "site.config"
import type { GetStaticProps } from "next"
import MetaConfig from "src/components/MetaConfig"
import type { LegalPolicyPageProps } from "src/libs/legal/policyTypes"
import LegalPolicyPage from "src/routes/LegalPolicy/LegalPolicyPage"

const TermsPage = (props: LegalPolicyPageProps) => {
  const meta = {
    title: "이용약관",
    description: "AquilaLog 서비스 이용 조건, 계정과 콘텐츠 책임, 금지 행위, 문의 및 통지 기준을 안내합니다.",
    type: "website",
    url: `${CONFIG.link}/terms`,
    robots: "follow, index",
  }

  return (
    <>
      <MetaConfig {...meta} />
      <LegalPolicyPage {...props} />
    </>
  )
}

export const getStaticProps: GetStaticProps<LegalPolicyPageProps> = async () => {
  const { getLegalPolicyPageStaticProps } = await import("src/libs/legal/serverPolicySource")
  return getLegalPolicyPageStaticProps("terms")
}

export default TermsPage
