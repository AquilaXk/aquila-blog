import { FormEvent, useMemo, useState } from "react"
import AppIcon from "src/components/icons/AppIcon"
import SocialAuthButtons, { SocialAuthItem } from "src/components/auth/SocialAuthButtons"

type Props = {
  email: string
  password: string
  showPassword: boolean
  error: string
  loading: boolean
  keepSignedIn: boolean
  ipSecurityOn: boolean
  socialItems: SocialAuthItem[]
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onTogglePassword: () => void
  onToggleKeepSignedIn: () => void
  onToggleIpSecurity: () => void
  onOpenIpSecurityInfo: () => void
  onSwitchToSignup: () => void
}

const AuthEntryLoginPanel = ({
  email,
  password,
  showPassword,
  error,
  loading,
  keepSignedIn,
  ipSecurityOn,
  socialItems,
  onSubmit,
  onEmailChange,
  onPasswordChange,
  onTogglePassword,
  onToggleKeepSignedIn,
  onToggleIpSecurity,
  onOpenIpSecurityInfo,
  onSwitchToSignup,
}: Props) => {
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)

  const emailActive = useMemo(() => emailFocused || email.length > 0, [email, emailFocused])
  const passwordActive = useMemo(() => passwordFocused || password.length > 0, [password, passwordFocused])

  return (
    <>
      <form className="loginForm" onSubmit={onSubmit}>
        <div className={`naverField ${emailActive ? "isActive" : ""}`}>
          <label className="naverFieldLabel" htmlFor="auth-entry-email">
            이메일
          </label>
          <input
            className="naverFieldInput"
            id="auth-entry-email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            onFocus={() => setEmailFocused(true)}
            onBlur={() => setEmailFocused(false)}
            placeholder=""
            autoComplete="email"
            disabled={loading}
          />
          {email.length > 0 && (
            <button
              type="button"
              className="fieldGhostButton"
              aria-label="이메일 입력 지우기"
              onClick={() => onEmailChange("")}
              disabled={loading}
            >
              <AppIcon name="close" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className={`naverField passwordField ${passwordActive ? "isActive" : ""}`}>
          <label className="naverFieldLabel" htmlFor="auth-entry-password">
            비밀번호
          </label>
          <input
            className="naverFieldInput"
            id="auth-entry-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
            placeholder=""
            autoComplete="current-password"
            disabled={loading}
          />

          <div className="passwordActions">
            {password.length > 0 && (
              <button
                type="button"
                className="fieldGhostButton"
                aria-label="비밀번호 입력 지우기"
                onClick={() => onPasswordChange("")}
                disabled={loading}
              >
                <AppIcon name="close" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              className="fieldGhostButton visibilityToggle"
              onClick={onTogglePassword}
              aria-label="비밀번호 표시 전환"
              disabled={loading}
            >
              <AppIcon name={showPassword ? "eye-off" : "eye"} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="loginStateRow">
          <button
            type="button"
            className={`keepSignedInButton ${keepSignedIn ? "isOn" : ""}`}
            onClick={onToggleKeepSignedIn}
            aria-pressed={keepSignedIn}
          >
            <span className="checkBadge" aria-hidden="true">
              <AppIcon name="check-circle" />
            </span>
            <span>로그인 상태 유지</span>
          </button>

          <div className="ipSecurityControl">
            <button
              type="button"
              className="ipSecurityInfoButton"
              onClick={onOpenIpSecurityInfo}
              aria-haspopup="dialog"
              aria-controls="ip-security-info-dialog"
            >
              IP보안
            </button>
            <button
              type="button"
              className={`ipSecurityToggle ${ipSecurityOn ? "isOn" : ""}`}
              onClick={onToggleIpSecurity}
              aria-pressed={ipSecurityOn}
              aria-label="IP보안 ON/OFF"
            >
              <span className="switch" aria-hidden="true">
                <span className="thumb" />
              </span>
              <span className="state">{ipSecurityOn ? "ON" : "OFF"}</span>
            </button>
          </div>
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
