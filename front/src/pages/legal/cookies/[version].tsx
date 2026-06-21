import type { GetStaticPaths, GetStaticProps } from "next"
import { CONFIG } from "site.config"
import MetaConfig from "src/components/MetaConfig"
import type { LegalPolicyPageProps } from "src/libs/legal/policyTypes"
import LegalPolicyPage from "src/routes/LegalPolicy/LegalPolicyPage"

const CookiesVersionPage = (props: LegalPolicyPageProps) => (
  <>
    <MetaConfig
      title={`쿠키 정책 ${props.policy.version}`}
      description="AquilaLog 쿠키 정책 버전 문서입니다."
      type="website"
      url={`${CONFIG.link}${props.versionHref}`}
      robots="follow, index"
    />
    <LegalPolicyPage {...props} />
  </>
)

export const getStaticPaths: GetStaticPaths = async () => {
  const { getLegalPolicyVersionStaticPaths } = await import("src/libs/legal/serverPolicySource")
  return getLegalPolicyVersionStaticPaths("cookies")
}

export const getStaticProps: GetStaticProps<LegalPolicyPageProps> = async ({ params }) => {
  const { getLegalPolicyPageStaticProps } = await import("src/libs/legal/serverPolicySource")
  return getLegalPolicyPageStaticProps("cookies", String(params?.version || ""))
}

export default CookiesVersionPage
