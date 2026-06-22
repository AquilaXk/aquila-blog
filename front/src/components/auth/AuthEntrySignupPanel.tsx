import { FormEvent, useMemo, useState } from "react"
import Link from "next/link"
import AppIcon from "src/components/icons/AppIcon"
import { formatSignupCooldown } from "src/hooks/useSignupMailCooldown"
import { legalPolicyCurrentPaths } from "src/libs/legal/policyLinks"

type Props = {
  signupEmail: string
  signupError: string
  signupLoading: boolean
  signupCooldownSeconds: number
  signupCooldownActive: boolean
  termsAccepted: boolean
  privacyAccepted: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onSignupEmailChange: (value: string) => void
  onTermsAcceptedChange: (value: boolean) => void
  onPrivacyAcceptedChange: (value: boolean) => void
  onSwitchToLogin: () => void
}

const AuthEntrySignupPanel = ({
  signupEmail,
  signupError,
  signupLoading,
  signupCooldownSeconds,
  signupCooldownActive,
  termsAccepted,
  privacyAccepted,
  onSubmit,
  onSignupEmailChange,
  onTermsAcceptedChange,
  onPrivacyAcceptedChange,
  onSwitchToLogin,
}: Props) => {
  const [emailFocused, setEmailFocused] = useState(false)
  const emailActive = useMemo(() => emailFocused || signupEmail.length > 0, [emailFocused, signupEmail])
  const signupConsentAccepted = termsAccepted && privacyAccepted

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
            type="email"
            inputMode="email"
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

        <div className="requiredConsentBox" aria-label="회원가입 필수 동의">
          <p>회원가입을 진행하려면 필수 약관과 개인정보처리방침에 동의해야 합니다.</p>
          <label>
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(event) => onTermsAcceptedChange(event.target.checked)}
            />
            <span>
              <Link href={legalPolicyCurrentPaths.terms}>이용약관</Link>에 동의합니다.
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={privacyAccepted}
              onChange={(event) => onPrivacyAcceptedChange(event.target.checked)}
            />
            <span>
              <Link href={legalPolicyCurrentPaths.privacy}>개인정보처리방침</Link>에 동의합니다.
            </span>
          </label>
        </div>

        <button
          type="submit"
          className="primaryAction"
          disabled={signupLoading || signupCooldownActive || !signupConsentAccepted}
        >
          {signupLoading
            ? "메일 보내는 중..."
            : signupCooldownActive
              ? signupCooldownSeconds > 0
                ? `다시 보내기 ${formatSignupCooldown(signupCooldownSeconds)}`
                : "잠시만 기다려주세요"
              : "인증 메일 보내기"}
        </button>
      </form>

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
