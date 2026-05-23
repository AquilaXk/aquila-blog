import dynamic from "next/dynamic"
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from "react"
import AppIcon from "src/components/icons/AppIcon"
import type { SocialAuthItem } from "./SocialAuthButtons"
import {
  FeedbackSlot,
  FieldActions,
  GhostIconButton,
  IpSecurityControl,
  IpSecurityInfoButton,
  IpSecurityToggle,
  KeepSignedInButton,
  LoginStateRow,
  NaverField,
  NaverFieldLabel,
  NaverInput,
  PasswordActions,
  PrimaryButton,
  SocialButtonRow,
  SocialSection,
} from "./LoginPage.styles"

const SocialAuthButtons = dynamic(() => import("src/components/auth/SocialAuthButtons"), {
  ssr: false,
})

const IpSecurityInfoModal = dynamic(() => import("src/components/auth/IpSecurityInfoModal"), {
  ssr: false,
})

type LoginPageFormProps = {
  email: string
  password: string
  showPassword: boolean
  loading: boolean
  loginIdActive: boolean
  passwordActive: boolean
  keepSignedIn: boolean
  ipSecurityOn: boolean
  showIpSecurityInfo: boolean
  feedbackMessage: ReactNode
  hasSocialItems: boolean
  showSocialAuth: boolean
  socialItems: SocialAuthItem[]
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  setEmail: Dispatch<SetStateAction<string>>
  setPassword: Dispatch<SetStateAction<string>>
  setShowPassword: Dispatch<SetStateAction<boolean>>
  setLoginIdFocused: Dispatch<SetStateAction<boolean>>
  setPasswordFocused: Dispatch<SetStateAction<boolean>>
  setKeepSignedIn: Dispatch<SetStateAction<boolean>>
  setIpSecurityOn: Dispatch<SetStateAction<boolean>>
  setShowIpSecurityInfo: Dispatch<SetStateAction<boolean>>
}

export const LoginPageForm = ({
  email,
  password,
  showPassword,
  loading,
  loginIdActive,
  passwordActive,
  keepSignedIn,
  ipSecurityOn,
  showIpSecurityInfo,
  feedbackMessage,
  hasSocialItems,
  showSocialAuth,
  socialItems,
  onSubmit,
  setEmail,
  setPassword,
  setShowPassword,
  setLoginIdFocused,
  setPasswordFocused,
  setKeepSignedIn,
  setIpSecurityOn,
  setShowIpSecurityInfo,
}: LoginPageFormProps) => {
  return (
    <>
      <form onSubmit={onSubmit} noValidate>
        <NaverField data-active={loginIdActive}>
          <NaverFieldLabel htmlFor="email" data-active={loginIdActive ? "true" : "false"}>
            이메일
          </NaverFieldLabel>
          <NaverInput
            id="email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onFocus={() => setLoginIdFocused(true)}
            onBlur={() => setLoginIdFocused(false)}
            placeholder=""
            autoComplete="email"
          />
          {email.length > 0 && (
            <FieldActions>
              <GhostIconButton type="button" aria-label="이메일 입력 지우기" onClick={() => setEmail("")}>
                <AppIcon name="close" />
              </GhostIconButton>
            </FieldActions>
          )}
        </NaverField>

        <NaverField data-active={passwordActive}>
          <NaverFieldLabel htmlFor="password" data-active={passwordActive ? "true" : "false"}>
            비밀번호
          </NaverFieldLabel>
          <NaverInput
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
            placeholder=""
            autoComplete="current-password"
            data-password="true"
          />
          <PasswordActions>
            {password.length > 0 && (
              <GhostIconButton type="button" aria-label="비밀번호 입력 지우기" onClick={() => setPassword("")}>
                <AppIcon name="close" />
              </GhostIconButton>
            )}
            <GhostIconButton
              className="visibilityToggle"
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label="비밀번호 표시 전환"
            >
              <AppIcon name={showPassword ? "eye-off" : "eye"} />
            </GhostIconButton>
          </PasswordActions>
        </NaverField>

        <LoginStateRow>
          <KeepSignedInButton
            type="button"
            data-on={keepSignedIn}
            aria-pressed={keepSignedIn}
            onClick={() => setKeepSignedIn((value) => !value)}
          >
            <span className="checkIcon" aria-hidden="true">
              <AppIcon name="check-circle" />
            </span>
            <span>로그인 상태 유지</span>
          </KeepSignedInButton>

          <IpSecurityControl>
            <IpSecurityInfoButton
              type="button"
              onClick={() => setShowIpSecurityInfo(true)}
              aria-haspopup="dialog"
              aria-controls="ip-security-info-dialog"
            >
              IP보안
            </IpSecurityInfoButton>
            <IpSecurityToggle
              type="button"
              data-on={ipSecurityOn}
              aria-pressed={ipSecurityOn}
              aria-label="IP보안 ON/OFF"
              onClick={() => setIpSecurityOn((value) => !value)}
            >
              <span className="switch" aria-hidden="true">
                <span className="thumb" />
              </span>
              <span className="state">{ipSecurityOn ? "ON" : "OFF"}</span>
            </IpSecurityToggle>
          </IpSecurityControl>
        </LoginStateRow>

        <FeedbackSlot aria-live="polite" data-filled={feedbackMessage ? "true" : "false"}>
          {feedbackMessage}
        </FeedbackSlot>

        <PrimaryButton type="submit" disabled={loading}>
          {loading ? "로그인 중..." : "로그인"}
        </PrimaryButton>

        {hasSocialItems ? (
          <SocialSection>
            <span>소셜 계정으로 로그인</span>
            <SocialButtonRow>
              {showSocialAuth ? <SocialAuthButtons items={socialItems} /> : null}
            </SocialButtonRow>
          </SocialSection>
        ) : null}
      </form>
      {showIpSecurityInfo ? <IpSecurityInfoModal open={showIpSecurityInfo} onClose={() => setShowIpSecurityInfo(false)} /> : null}
    </>
  )
}
