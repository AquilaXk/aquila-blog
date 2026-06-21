import { CONFIG } from "site.config"
import MetaConfig from "src/components/MetaConfig"
import LegalPolicyPage, { buildDataDeletionMailto } from "src/routes/LegalPolicy/LegalPolicyPage"

const PrivacyPage = () => {
  const dataDeletionMailto = buildDataDeletionMailto(CONFIG.profile.email)
  const meta = {
    title: "개인정보처리방침",
    description: "AquilaLog가 처리하는 개인정보 항목, 이용 목적, 보관 기준, 삭제 요청 경로를 안내합니다.",
    type: "website",
    url: `${CONFIG.link}/privacy`,
    robots: "follow, index",
  }

  return (
    <>
      <MetaConfig {...meta} />
      <LegalPolicyPage
        eyebrow="Privacy"
        title="개인정보처리방침"
        description="AquilaLog는 계정 제공, 콘텐츠 운영, 보안 감사, 서비스 품질 개선에 필요한 최소한의 개인정보와 운영 데이터를 처리합니다."
        updatedAt="2026-06-21"
        sections={[
          {
            title: "처리하는 정보",
            body: [
              "회원가입과 로그인 과정에서 이메일 주소, OAuth 제공자 식별자, 인증 쿠키, 접속 세션 정보를 처리합니다.",
              "댓글, 업로드 파일, 프로필 이미지, 작성/수정/삭제 action log, IP 보안 정보, security log, analytics와 RUM 이벤트가 서비스 운영과 보안 점검에 사용될 수 있습니다.",
            ],
          },
          {
            title: "이용 목적",
            body: [
              "계정 인증, 게시글·댓글 작성, 관리자 도구 접근 제어, 악용 방지, 장애 분석, 성능 개선, 법적 요청 대응을 위해 정보를 사용합니다.",
              "RUM과 analytics 데이터는 페이지 품질과 오류 추적을 위한 집계 분석에 사용하며, 사용자를 불필요하게 식별하는 목적의 별도 판매나 공유는 하지 않습니다.",
            ],
          },
          {
            title: "보관 및 파기",
            body: [
              "계정 정보와 사용자가 작성한 콘텐츠는 계정 유지 또는 서비스 제공에 필요한 기간 동안 보관합니다.",
              "보안·감사 로그는 운영 안정성과 침해 대응을 위해 필요한 기간 보관한 뒤 접근 권한을 제한하거나 삭제합니다.",
            ],
          },
          {
            title: "데이터 삭제 요청",
            body: [
              `데이터 삭제 요청은 ${CONFIG.profile.email}로 보낼 수 있습니다. 요청 시 계정 이메일, 삭제 대상, 본인 확인에 필요한 최소 정보를 함께 알려주세요.`,
              `빠른 접수를 위해 메일 링크를 사용할 수 있습니다: ${dataDeletionMailto}`,
            ],
          },
          {
            title: "문의",
            body: [
              `개인정보 처리, 계정 정보 정정, 데이터 삭제, 서비스 이용 문의는 ${CONFIG.profile.email}로 연락해 주세요.`,
              "정책이 변경되면 이 페이지의 시행일과 내용을 갱신합니다.",
            ],
          },
        ]}
      />
    </>
  )
}

export default PrivacyPage
