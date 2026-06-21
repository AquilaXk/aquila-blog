import { CONFIG } from "site.config"
import MetaConfig from "src/components/MetaConfig"
import LegalPolicyPage from "src/routes/LegalPolicy/LegalPolicyPage"

const TermsPage = () => {
  const meta = {
    title: "이용약관",
    description: "AquilaLog 서비스 이용 조건, 계정과 콘텐츠 책임, 문의 및 데이터 삭제 요청 경로를 안내합니다.",
    type: "website",
    url: `${CONFIG.link}/terms`,
    robots: "follow, index",
  }

  return (
    <>
      <MetaConfig {...meta} />
      <LegalPolicyPage
        eyebrow="Terms"
        title="이용약관"
        description="AquilaLog를 이용할 때 적용되는 계정, 콘텐츠, 보안, 운영 문의 기준입니다."
        updatedAt="2026-06-21"
        sections={[
          {
            title: "서비스 이용",
            body: [
              "AquilaLog는 기술 글, 댓글, 프로필, 관리자 도구를 제공하는 개인 운영 블로그 서비스입니다.",
              "사용자는 관련 법령과 본 약관을 지키며 서비스를 이용해야 하고, 계정 정보와 인증 수단을 안전하게 관리해야 합니다.",
            ],
          },
          {
            title: "계정과 보안",
            body: [
              "이메일 로그인, OAuth 로그인, 인증 쿠키, IP 보안 설정은 계정 보호와 접근 제어를 위해 사용됩니다.",
              "비정상 접근, 자동화 남용, 다른 사용자의 계정 또는 데이터를 침해하는 행위는 제한될 수 있습니다.",
            ],
          },
          {
            title: "콘텐츠와 댓글",
            body: [
              "사용자가 작성한 댓글과 업로드한 파일은 사용자가 책임을 집니다. 타인의 권리 침해, 악성 코드, 불법 정보, 과도한 광고성 콘텐츠는 삭제될 수 있습니다.",
              "서비스 운영자는 보안, 장애 대응, 법적 요청, 커뮤니티 보호를 위해 필요한 범위에서 콘텐츠 노출을 제한하거나 삭제할 수 있습니다.",
            ],
          },
          {
            title: "문의 및 데이터 삭제 요청",
            body: [
              `서비스 문의, 계정 문제, 데이터 삭제 요청은 ${CONFIG.profile.email}로 접수합니다.`,
              "개인정보 처리 기준과 삭제 요청 절차는 개인정보처리방침에서 함께 확인할 수 있습니다.",
            ],
          },
          {
            title: "약관 변경",
            body: [
              "서비스 구조, 법령, 운영 정책이 바뀌면 약관을 갱신할 수 있습니다.",
              "중요한 변경은 이 페이지의 시행일과 본문을 통해 확인할 수 있게 공개합니다.",
            ],
          },
        ]}
      />
    </>
  )
}

export default TermsPage
