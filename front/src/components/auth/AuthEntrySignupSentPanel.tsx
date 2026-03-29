import AppIcon from "src/components/icons/AppIcon"

type Props = {
  sentEmail: string
  signupEmail: string
  signupCooldownSeconds: number
  onBackToLogin: () => void
  onRetryWithAnotherEmail: () => void
}

const AuthEntrySignupSentPanel = ({
  sentEmail,
  signupEmail,
  signupCooldownSeconds,
  onBackToLogin,
  onRetryWithAnotherEmail,
}: Props) => {
  return (
    <div className="sentState">
      <div className="sentCard">
        <AppIcon name="check-circle" aria-hidden="true" />
        <div>
          <p>
            <strong>{sentEmail || signupEmail}</strong>으로 회원가입 링크를 보냈습니다. 받은편지함에서 메일을 열고 계속 진행해주세요.
          </p>
          {signupCooldownSeconds > 0 ? (
            <p>{Math.floor(signupCooldownSeconds / 60)}:{String(signupCooldownSeconds % 60).padStart(2, "0")} 뒤 다시 요청할 수 있습니다.</p>
          ) : null}
        </div>
      </div>

      <div className="sentActions">
        <button type="button" className="primaryAction" onClick={onBackToLogin}>
          로그인으로 돌아가기
        </button>
        <button type="button" className="secondaryAction" onClick={onRetryWithAnotherEmail}>
          다른 이메일 입력
        </button>
      </div>
    </div>
  )
}

export default AuthEntrySignupSentPanel
