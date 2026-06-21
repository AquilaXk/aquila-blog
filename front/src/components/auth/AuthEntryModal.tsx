import dynamic from "next/dynamic"
import { FormEvent, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { apiFetch } from "src/apis/backend/client"
import { toAuthErrorMessage } from "src/apis/backend/errorMessages"
import { SIGNUP_LEGAL_POLICY_VERSION } from "src/apis/backend/legal"
import AppIcon from "src/components/icons/AppIcon"
import useAuthSession from "src/hooks/useAuthSession"
import { useSignupMailCooldown } from "src/hooks/useSignupMailCooldown"
import { loadAuthLoginPolicyPrefs, saveAuthLoginPolicyPrefs } from "src/libs/authLoginPolicy"
import { normalizeNextPath } from "src/libs/router"
import { acquireBodyScrollLock } from "src/libs/utils/bodyScrollLock"
import { isValidAuthEmail, normalizeAuthEmail } from "src/libs/validation/auth"
import IpSecurityInfoModal from "./IpSecurityInfoModal"
import { buildSocialAuthItems } from "./socialAuth"
import { Backdrop, Modal } from "./AuthEntryModal.styles"
import {
  resolveAuthModalContent,
  type AuthEntryModalProps,
  type AuthModalView,
  type RsData,
  type SignupEmailStartResult,
} from "./AuthEntryModalModel"

const loadLoginPanel = () => import("./AuthEntryLoginPanel")
const loadSignupPanel = () => import("./AuthEntrySignupPanel")
const loadSignupSentPanel = () => import("./AuthEntrySignupSentPanel")

const AuthEntryPanelFallback = () => (
  <div className="panelFallback" aria-hidden="true">
    <div className="line large" />
    <div className="line" />
    <div className="line short" />
    <div className="button" />
  </div>
)

const LoginPanel = dynamic(loadLoginPanel, {
  ssr: false,
  loading: AuthEntryPanelFallback,
})

const SignupPanel = dynamic(loadSignupPanel, {
  ssr: false,
  loading: AuthEntryPanelFallback,
})

const SignupSentPanel = dynamic(loadSignupSentPanel, {
  ssr: false,
  loading: AuthEntryPanelFallback,
})

export const preloadAuthEntryPanels = (view: AuthModalView = "login") => {
  if (view === "signup") {
    void loadSignupPanel()
    return
  }

  if (view === "signup-sent") {
    void Promise.all([loadSignupPanel(), loadSignupSentPanel()])
    return
  }

  void loadLoginPanel()
}

const AuthEntryModal: React.FC<AuthEntryModalProps> = ({
  open,
  onClose,
  nextPath,
  title = "로그인",
  description = "",
}) => {
  const { refresh, setMe } = useAuthSession()
  const [view, setView] = useState<AuthModalView>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [keepSignedIn, setKeepSignedIn] = useState(true)
  const [ipSecurityOn, setIpSecurityOn] = useState(false)
  const [showIpSecurityInfo, setShowIpSecurityInfo] = useState(false)
  const [signupEmail, setSignupEmail] = useState("")
  const [signupError, setSignupError] = useState("")
  const [signupLoading, setSignupLoading] = useState(false)
  const [sentEmail, setSentEmail] = useState("")
  const [signupTermsAccepted, setSignupTermsAccepted] = useState(false)
  const [signupPrivacyAccepted, setSignupPrivacyAccepted] = useState(false)
  const { remainingSeconds: signupCooldownSeconds, startCooldown } = useSignupMailCooldown(signupEmail)

  const normalizedNextPath = useMemo(() => {
    return normalizeNextPath(nextPath)
  }, [nextPath])

  const socialItems = useMemo(() => {
    return buildSocialAuthItems(normalizedNextPath)
  }, [normalizedNextPath])

  useEffect(() => {
    if (!open) return

    const releaseBodyScrollLock = acquireBodyScrollLock()

    setView("login")
    setError("")
    setSignupError("")
    setSignupLoading(false)
    setLoading(false)
    setEmail("")
    setPassword("")
    setShowPassword(false)
    setShowIpSecurityInfo(false)
    const prefs = loadAuthLoginPolicyPrefs()
    setKeepSignedIn(prefs.keepSignedIn)
    setIpSecurityOn(prefs.ipSecurityOn)
    setSignupEmail("")
    setSentEmail("")
    setSignupTermsAccepted(false)
    setSignupPrivacyAccepted(false)

    return () => {
      releaseBodyScrollLock()
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    preloadAuthEntryPanels(view)
  }, [open, view])

  useEffect(() => {
    saveAuthLoginPolicyPrefs({ keepSignedIn, ipSecurityOn })
  }, [keepSignedIn, ipSecurityOn])

  if (!open) return null

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    const normalizedEmail = normalizeAuthEmail(email)

    if (!normalizedEmail || !password.trim()) {
      setError("이메일과 비밀번호를 입력해주세요.")
      return
    }
    if (!isValidAuthEmail(normalizedEmail)) {
      setError("이메일 형식을 확인해주세요.")
      return
    }

    setLoading(true)

    try {
      await apiFetch<RsData<unknown>>("/member/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          rememberMe: keepSignedIn,
          ipSecurity: ipSecurityOn,
        }),
      })

      try {
        const refreshed = await refresh()
        setMe(refreshed.data ?? null)
      } catch {
        // 로그인 성공 직후 세션 재조회가 일시 실패해도 기존 상태를 강제로 비우지 않는다.
      }

      setPassword("")
      onClose()
    } catch (loginError) {
      setError(toAuthErrorMessage("login", loginError, "로그인에 실패했습니다."))
    } finally {
      setLoading(false)
    }
  }

  const handleSignupEmailStart = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedEmail = normalizeAuthEmail(signupEmail)

    if (!normalizedEmail) {
      setSignupError("이메일을 입력해주세요.")
      return
    }
    if (!isValidAuthEmail(normalizedEmail)) {
      setSignupError("이메일 형식을 확인해주세요.")
      return
    }
    if (!signupTermsAccepted || !signupPrivacyAccepted) {
      setSignupError("회원가입을 진행하려면 이용약관과 개인정보처리방침에 모두 동의해주세요.")
      return
    }

    setSignupLoading(true)
    setSignupError("")

    try {
      const response = await apiFetch<RsData<SignupEmailStartResult>>("/member/api/v1/signup/email/start", {
        method: "POST",
        body: JSON.stringify({
          email: normalizedEmail,
          nextPath: normalizedNextPath,
          termsAccepted: signupTermsAccepted,
          privacyAccepted: signupPrivacyAccepted,
          legalPolicyVersion: SIGNUP_LEGAL_POLICY_VERSION,
        }),
      })

      setSentEmail(response.data.email)
      startCooldown(response.data.email)
      setView("signup-sent")
    } catch (signupStartError) {
      setSignupError(toAuthErrorMessage("signupStart", signupStartError, "회원가입 메일 전송에 실패했습니다."))
    } finally {
      setSignupLoading(false)
    }
  }

  const currentContent = resolveAuthModalContent(view, title, description)

  const modalNode = (
    <Backdrop onClick={onClose} role="presentation">
      <Modal
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-entry-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="formPane">
          <button type="button" className="closeButton" onClick={onClose} aria-label="닫기">
            <AppIcon name="close" aria-hidden="true" />
          </button>

          <h4 id="auth-entry-modal-title">{currentContent.heading}</h4>
          {currentContent.body ? <p className="formDescription">{currentContent.body}</p> : null}

          {view === "login" && (
            <LoginPanel
              email={email}
              password={password}
              showPassword={showPassword}
              error={error}
              loading={loading}
              keepSignedIn={keepSignedIn}
              ipSecurityOn={ipSecurityOn}
              socialItems={socialItems}
              onSubmit={handleLogin}
              onEmailChange={setEmail}
              onPasswordChange={setPassword}
              onTogglePassword={() => setShowPassword((value) => !value)}
              onToggleKeepSignedIn={() => setKeepSignedIn((value) => !value)}
              onToggleIpSecurity={() => setIpSecurityOn((value) => !value)}
              onOpenIpSecurityInfo={() => setShowIpSecurityInfo(true)}
              onSwitchToSignup={() => setView("signup")}
            />
          )}

          {view === "signup" && (
            <SignupPanel
              signupEmail={signupEmail}
              signupError={signupError}
              signupLoading={signupLoading}
              signupCooldownSeconds={signupCooldownSeconds}
              termsAccepted={signupTermsAccepted}
              privacyAccepted={signupPrivacyAccepted}
              onSubmit={handleSignupEmailStart}
              onSignupEmailChange={setSignupEmail}
              onTermsAcceptedChange={setSignupTermsAccepted}
              onPrivacyAcceptedChange={setSignupPrivacyAccepted}
              onSwitchToLogin={() => setView("login")}
            />
          )}

          {view === "signup-sent" && (
            <SignupSentPanel
              sentEmail={sentEmail}
              signupEmail={signupEmail}
              signupCooldownSeconds={signupCooldownSeconds}
              onBackToLogin={() => setView("login")}
              onRetryWithAnotherEmail={() => setView("signup")}
            />
          )}
        </div>
      </Modal>
      <IpSecurityInfoModal open={showIpSecurityInfo} onClose={() => setShowIpSecurityInfo(false)} />
    </Backdrop>
  )

  if (typeof document === "undefined") return null
  return createPortal(modalNode, document.body)
}

export default AuthEntryModal
