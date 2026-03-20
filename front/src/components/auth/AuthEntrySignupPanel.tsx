import { FormEvent } from "react"
import AppIcon from "src/components/icons/AppIcon"

type Props = {
  signupEmail: string
  signupError: string
  signupLoading: boolean
  kakaoAuthUrl: string
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onSignupEmailChange: (value: string) => void
  onSwitchToLogin: () => void
  onKakaoAuth: () => void
}

const AuthEntrySignupPanel = ({
  signupEmail,
  signupError,
  signupLoading,
  kakaoAuthUrl,
  onSubmit,
  onSignupEmailChange,
  onSwitchToLogin,
  onKakaoAuth,
}: Props) => {
  return (
    <>
      <form className="loginForm" onSubmit={onSubmit}>
        <label htmlFor="auth-entry-signup-email">이메일로 회원가입</label>
        <div className="inlineField">
          <input
            id="auth-entry-signup-email"
            value={signupEmail}
            onChange={(event) => onSignupEmailChange(event.target.value)}
            placeholder="이메일을 입력하세요."
            autoComplete="email"
            disabled={signupLoading}
          />
        </div>

        {signupError && <p className="inlineError">{signupError}</p>}

        <button type="submit" className="primaryAction" disabled={signupLoading}>
          {signupLoading ? "메일 보내는 중..." : "인증 메일 보내기"}
        </button>
      </form>

      <div className="socialSection">
        <span>소셜 계정으로 계속하기</span>
        <div className="socialButtonRow">
          <button
            type="button"
            className="kakaoIconButton"
            onClick={onKakaoAuth}
            aria-label="카카오로 로그인"
            title="카카오로 로그인"
            disabled={!kakaoAuthUrl}
          >
            <AppIcon name="kakao" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="signupRow">
        <span>이미 계정이 있으신가요?</span>
        <button type="button" className="inlineLinkButton" onClick={onSwitchToLogin}>
          로그인
        </button>
      </div>
    </>
  )
}

export default AuthEntrySignupPanel
