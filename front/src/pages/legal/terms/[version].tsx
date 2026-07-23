import type { GetStaticPaths, GetStaticProps } from "next"
import { CONFIG } from "site.config"
import MetaConfig from "src/components/MetaConfig"
import type { LegalPolicyPageProps } from "src/libs/legal/policyTypes"
import LegalPolicyPage from "src/routes/LegalPolicy/LegalPolicyPage"

const TermsVersionPage = (props: LegalPolicyPageProps) => (
  <>
    <MetaConfig
      title={`이용약관 ${props.policy.version}`}
      description="AquilaLog 이용약관 버전 문서입니다."
      type="website"
      url={`${CONFIG.link}${props.versionHref}`}
      robots="follow, index"
    />
    <LegalPolicyPage {...props} />
  </>
)

export const getStaticPaths: GetStaticPaths = async () => {
  const { getLegalPolicyVersionStaticPaths } = await import("src/libs/legal/serverPolicySource")
  return getLegalPolicyVersionStaticPaths("terms")
}

export const getStaticProps: GetStaticProps<LegalPolicyPageProps> = async ({ params }) => {
  const { getLegalPolicyPageStaticProps } = await import("src/libs/legal/serverPolicySource")
  return getLegalPolicyPageStaticProps("terms", String(params?.version || ""))
}

export default TermsVersionPage
