import { FormEvent } from "react"
import SocialAuthButtons, { SocialAuthItem } from "src/components/auth/SocialAuthButtons"

type Props = {
  email: string
  password: string
  showPassword: boolean
  error: string
  loading: boolean
  socialItems: SocialAuthItem[]
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onTogglePassword: () => void
  onSwitchToSignup: () => void
}

const AuthEntryLoginPanel = ({
  email,
  password,
  showPassword,
  error,
  loading,
  socialItems,
  onSubmit,
  onEmailChange,
  onPasswordChange,
  onTogglePassword,
  onSwitchToSignup,
}: Props) => {
  return (
    <>
      <form className="loginForm" onSubmit={onSubmit}>
        <label htmlFor="auth-entry-email">이메일로 로그인</label>
        <div className="inlineField">
          <input
            id="auth-entry-email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder="이메일을 입력하세요."
            autoComplete="email"
            disabled={loading}
          />
        </div>

        <div className="inlineField passwordField">
          <input
            id="auth-entry-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder="비밀번호를 입력하세요."
            autoComplete="current-password"
            disabled={loading}
          />
          <button
            type="button"
            className="passwordToggle"
            onClick={onTogglePassword}
            disabled={loading}
          >
            {showPassword ? "숨기기" : "보기"}
          </button>
        </div>

        {error && <p className="inlineError">{error}</p>}

        <button type="submit" className="primaryAction" disabled={loading}>
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </form>

      <div className="socialSection">
        <span>소셜 계정으로 로그인</span>
        <div className="socialButtonRow">
          <SocialAuthButtons size="compact" items={socialItems} />
        </div>
      </div>

      <div className="signupRow">
        <span>아직 회원이 아니신가요?</span>
        <button type="button" className="inlineLinkButton" onClick={onSwitchToSignup}>
          회원가입
        </button>
      </div>
    </>
  )
}

export default AuthEntryLoginPanel
