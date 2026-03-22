import { FormEvent, useMemo, useState } from "react"
import AppIcon from "src/components/icons/AppIcon"
import SocialAuthButtons, { SocialAuthItem } from "src/components/auth/SocialAuthButtons"

type Props = {
  signupEmail: string
  signupError: string
  signupLoading: boolean
  socialItems: SocialAuthItem[]
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onSignupEmailChange: (value: string) => void
  onSwitchToLogin: () => void
}

const AuthEntrySignupPanel = ({
  signupEmail,
  signupError,
  signupLoading,
  socialItems,
  onSubmit,
  onSignupEmailChange,
  onSwitchToLogin,
}: Props) => {
  const [emailFocused, setEmailFocused] = useState(false)
  const emailActive = useMemo(() => emailFocused || signupEmail.length > 0, [emailFocused, signupEmail])

  return (
    <>
      <form className="loginForm" onSubmit={onSubmit}>
        <div className={`naverField ${emailActive ? "isActive" : ""}`}>
          <label className="naverFieldLabel" htmlFor="auth-entry-signup-email">
            이메일
          </label>
          <input
            className="naverFieldInput"
            id="auth-entry-signup-email"
            value={signupEmail}
            onChange={(event) => onSignupEmailChange(event.target.value)}
            onFocus={() => setEmailFocused(true)}
            onBlur={() => setEmailFocused(false)}
            placeholder=""
            autoComplete="email"
            disabled={signupLoading}
          />
          {signupEmail.length > 0 && (
            <button
              type="button"
              className="fieldGhostButton"
              aria-label="이메일 입력 지우기"
              onClick={() => onSignupEmailChange("")}
              disabled={signupLoading}
            >
              <AppIcon name="close" aria-hidden="true" />
            </button>
          )}
        </div>

        {signupError && <p className="inlineError">{signupError}</p>}

        <button type="submit" className="primaryAction" disabled={signupLoading}>
          {signupLoading ? "메일 보내는 중..." : "인증 메일 보내기"}
        </button>
      </form>

      <div className="socialSection">
        <span>소셜 계정으로 계속하기</span>
        <div className="socialButtonRow">
          <SocialAuthButtons size="compact" items={socialItems} />
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
