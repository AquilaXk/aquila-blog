import { CONFIG } from "site.config"
import type { GetStaticProps } from "next"
import MetaConfig from "src/components/MetaConfig"
import type { LegalPolicyPageProps } from "src/libs/legal/policyTypes"
import LegalPolicyPage from "src/routes/LegalPolicy/LegalPolicyPage"

const CookiesPage = (props: LegalPolicyPageProps) => {
  const meta = {
    title: "쿠키 정책",
    description: "AquilaLog의 필수 쿠키, 브라우저 저장소, 선택 추적 설정과 삭제 방법을 안내합니다.",
    type: "website",
    url: `${CONFIG.link}/cookies`,
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
  return getLegalPolicyPageStaticProps("cookies")
}

export default CookiesPage
