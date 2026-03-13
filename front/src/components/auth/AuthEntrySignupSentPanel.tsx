import Link from "next/link"
import AppIcon from "src/components/icons/AppIcon"

type Props = {
  sentEmail: string
  signupEmail: string
  signupHref: string
  onBackToLogin: () => void
  onRetryWithAnotherEmail: () => void
}

const AuthEntrySignupSentPanel = ({
  sentEmail,
  signupEmail,
  signupHref,
  onBackToLogin,
  onRetryWithAnotherEmail,
}: Props) => {
  return (
    <div className="sentState">
      <div className="sentCard">
        <AppIcon name="check-circle" aria-hidden="true" />
        <div>
          <strong>{sentEmail || signupEmail}</strong>
          <p>회원가입 링크가 이메일로 전송되었습니다.</p>
        </div>
      </div>

      <div className="sentActions">
        <button type="button" className="primaryAction" onClick={onBackToLogin}>
          로그인으로 돌아가기
        </button>
        <button type="button" className="secondaryAction" onClick={onRetryWithAnotherEmail}>
          다른 이메일로 다시 보내기
        </button>
      </div>

      <Link href={signupHref} className="fullPageLink">
        전체 회원가입 페이지에서 계속하기
      </Link>
    </div>
  )
}

export default AuthEntrySignupSentPanel
