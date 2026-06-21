import { CONFIG } from "site.config"
import type { GetStaticProps } from "next"
import MetaConfig from "src/components/MetaConfig"
import type { LegalPolicyPageProps } from "src/libs/legal/policyTypes"
import LegalPolicyPage from "src/routes/LegalPolicy/LegalPolicyPage"

const PrivacyPage = (props: LegalPolicyPageProps) => {
  const meta = {
    title: "개인정보처리방침",
    description: "AquilaLog의 개인정보 처리 목적, 처리 항목, 보유 기준, 권리 행사 및 문의 경로를 안내합니다.",
    type: "website",
    url: `${CONFIG.link}/privacy`,
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
  return getLegalPolicyPageStaticProps("privacy")
}

export default PrivacyPage
