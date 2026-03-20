import styled from "@emotion/styled"
import dynamic from "next/dynamic"
import { FormEvent, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { apiFetch } from "src/apis/backend/client"
import { toAuthErrorMessage } from "src/apis/backend/errorMessages"
import AppIcon from "src/components/icons/AppIcon"
import useAuthSession from "src/hooks/useAuthSession"
import { normalizeNextPath } from "src/libs/router"
import { buildSocialAuthItems } from "./socialAuth"

type RsData<T> = {
  resultCode: string
  msg: string
  data: T
}

type SignupEmailStartResult = {
  email: string
}

type Props = {
  open: boolean
  onClose: () => void
  nextPath: string
  title?: string
  description?: string
}

type AuthModalView = "login" | "signup" | "signup-sent"

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

const AuthEntryModal: React.FC<Props> = ({
  open,
  onClose,
  nextPath,
  title = "로그인",
  description = "로그인 후 현재 보던 흐름으로 바로 돌아옵니다.",
}) => {
  const { refresh, setMe } = useAuthSession()
  const [view, setView] = useState<AuthModalView>("login")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [signupEmail, setSignupEmail] = useState("")
  const [signupError, setSignupError] = useState("")
  const [signupLoading, setSignupLoading] = useState(false)
  const [sentEmail, setSentEmail] = useState("")

  const normalizedNextPath = useMemo(() => {
    return normalizeNextPath(nextPath)
  }, [nextPath])

  const socialItems = useMemo(() => {
    return buildSocialAuthItems(normalizedNextPath)
  }, [normalizedNextPath])

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    setView("login")
    setError("")
    setSignupError("")
    setSignupLoading(false)
    setLoading(false)
    setUsername("")
    setPassword("")
    setShowPassword(false)
    setSignupEmail("")
    setSentEmail("")

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    preloadAuthEntryPanels(view)
  }, [open, view])

  if (!open) return null

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!username.trim() || !password.trim()) {
      setError("아이디와 비밀번호를 입력해주세요.")
      return
    }

    setLoading(true)
    setError("")

    try {
      await apiFetch<RsData<unknown>>("/member/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: username.trim(),
          password,
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

    if (!signupEmail.trim()) {
      setSignupError("이메일을 입력해주세요.")
      return
    }

    setSignupLoading(true)
    setSignupError("")

    try {
      const response = await apiFetch<RsData<SignupEmailStartResult>>("/member/api/v1/signup/email/start", {
        method: "POST",
        body: JSON.stringify({
          email: signupEmail.trim(),
          nextPath: normalizedNextPath,
        }),
      })

      setSentEmail(response.data.email)
      setView("signup-sent")
    } catch (signupStartError) {
      setSignupError(toAuthErrorMessage("signupStart", signupStartError, "회원가입 메일 전송에 실패했습니다."))
    } finally {
      setSignupLoading(false)
    }
  }

  const currentContent =
    view === "login"
      ? {
          heading: title,
          body: description,
        }
      : view === "signup"
        ? {
            heading: "회원가입",
            body: "먼저 이메일을 확인한 뒤 아이디와 비밀번호를 등록합니다.",
          }
        : {
            heading: "메일을 보냈어요",
            body: "받은편지함에서 회원가입 메일을 확인한 뒤 계속 진행해주세요.",
          }

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
          <p className="formDescription">{currentContent.body}</p>

          {view === "login" && (
            <LoginPanel
              username={username}
              password={password}
              showPassword={showPassword}
              error={error}
              loading={loading}
              socialItems={socialItems}
              onSubmit={handleLogin}
              onUsernameChange={setUsername}
              onPasswordChange={setPassword}
              onTogglePassword={() => setShowPassword((value) => !value)}
              onSwitchToSignup={() => setView("signup")}
            />
          )}

          {view === "signup" && (
            <SignupPanel
              signupEmail={signupEmail}
              signupError={signupError}
              signupLoading={signupLoading}
              socialItems={socialItems}
              onSubmit={handleSignupEmailStart}
              onSignupEmailChange={setSignupEmail}
              onSwitchToLogin={() => setView("login")}
            />
          )}

          {view === "signup-sent" && (
            <SignupSentPanel
              sentEmail={sentEmail}
              signupEmail={signupEmail}
              onBackToLogin={() => setView("login")}
              onRetryWithAnotherEmail={() => setView("signup")}
            />
          )}
        </div>
      </Modal>
    </Backdrop>
  )

  if (typeof document === "undefined") return null
  return createPortal(modalNode, document.body)
}

export default AuthEntryModal

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(9, 11, 14, 0.72);
  backdrop-filter: blur(3px);
`

const Modal = styled.div`
  position: relative;
  width: min(100%, 560px);
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  overflow: hidden;
  background: ${({ theme }) => theme.colors.gray2};
  box-shadow: 0 28px 70px rgba(0, 0, 0, 0.42);

  .formPane {
    position: relative;
    padding: 1.6rem 1.5rem 1.4rem;
    background: ${({ theme }) => theme.colors.gray2};
  }

  .closeButton {
    position: absolute;
    top: 0.85rem;
    right: 0.85rem;
    min-width: 34px;
    width: 34px;
    height: 34px;
    padding: 0;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray10};
    transition: filter 0.16s ease, opacity 0.16s ease;

    &:hover:not(:disabled) {
      filter: brightness(1.08);
    }
  }

  .closeButton svg {
    font-size: 0.94rem;
  }

  h4 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.95rem;
    line-height: 1.25;
    font-weight: 800;
    letter-spacing: -0.01em;
  }

  .formDescription {
    margin: 0.62rem 0 1.05rem;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.55;
    font-size: 0.9rem;
  }

  .loginForm {
    display: grid;
    gap: 0.62rem;
    margin-bottom: 1rem;

    label {
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.83rem;
      font-weight: 700;
    }
  }

  .panelFallback {
    display: grid;
    gap: 0.72rem;
    margin-bottom: 0.5rem;
  }

  .panelFallback .line,
  .panelFallback .button {
    border-radius: 12px;
    background: linear-gradient(90deg, rgba(148, 163, 184, 0.1), rgba(148, 163, 184, 0.18));
  }

  .panelFallback .line {
    height: 46px;
  }

  .panelFallback .line.large {
    height: 74px;
  }

  .panelFallback .line.short {
    width: 56%;
  }

  .panelFallback .button {
    height: 52px;
    margin-top: 0.2rem;
  }

  .inlineField,
  .passwordField {
    display: grid;
    grid-template-columns: 1fr;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    border-radius: 12px;
    background: ${({ theme }) => theme.colors.gray3};
    overflow: hidden;
  }

  .passwordField {
    position: relative;
  }

  input {
    width: 100%;
    border: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray12};
    padding: 0.9rem 0.92rem;
    font-size: 0.95rem;
    line-height: 1.45;

    &::placeholder {
      color: ${({ theme }) => theme.colors.gray10};
    }

    &:focus {
      outline: none;
    }
  }

  .passwordField input {
    padding-right: 4.2rem;
  }

  .passwordToggle {
    position: absolute;
    top: 50%;
    right: 0.55rem;
    transform: translateY(-50%);
    min-width: auto;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    border-radius: 999px;
    padding: 0.3rem 0.56rem;
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.76rem;
    font-weight: 700;
    line-height: 1;
    transition: filter 0.16s ease;

    &:hover:not(:disabled) {
      filter: brightness(1.08);
    }

    &:disabled {
      opacity: 0.62;
      cursor: not-allowed;
    }
  }

  .inlineError {
    margin: 0;
    border-radius: 10px;
    border: 1px solid ${({ theme }) => theme.colors.red7};
    background: ${({ theme }) => theme.colors.red3};
    color: ${({ theme }) => theme.colors.red11};
    padding: 0.66rem 0.76rem;
    font-size: 0.84rem;
    line-height: 1.5;
  }

  .primaryAction,
  .secondaryAction {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 46px;
    border-radius: 10px;
    font-size: 0.93rem;
    font-weight: 700;
  }

  .primaryAction {
    border: 0;
    background: #12b886;
    color: #fff;
    transition: filter 0.16s ease;

    &:hover:not(:disabled) {
      filter: brightness(1.06);
    }
  }

  .secondaryAction {
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
  }

  .primaryAction:disabled,
  .secondaryAction:disabled {
    opacity: 0.62;
    cursor: not-allowed;
  }

  .socialSection {
    display: grid;
    gap: 0.5rem;
    margin-bottom: 0.9rem;

    span {
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.82rem;
      font-weight: 600;
    }
  }

  .socialButtonRow {
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }

  .signupRow {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.86rem;
    margin-bottom: 0;
  }

  .inlineLinkButton {
    border: 0;
    background: transparent;
    min-height: auto;
    padding: 0;
    color: ${({ theme }) => theme.colors.blue10};
    font-size: 0.86rem;
    font-weight: 700;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
      text-underline-offset: 2px;
    }
  }

  .sentState {
    display: grid;
    gap: 0.9rem;
  }

  .sentCard {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.8rem;
    padding: 0.95rem 1rem;
    border-radius: 16px;
    border: 1px solid ${({ theme }) => theme.colors.green7};
    background: ${({ theme }) => theme.colors.green3};
    color: ${({ theme }) => theme.colors.green11};

    svg {
      font-size: 1.3rem;
      margin-top: 0.1rem;
    }

    strong {
      display: block;
      font-size: 0.95rem;
      word-break: break-word;
    }

    p {
      margin: 0.18rem 0 0;
      font-size: 0.84rem;
      line-height: 1.6;
    }
  }

  .sentActions {
    display: grid;
    gap: 0.55rem;
  }

  @media (max-width: 640px) {
    width: min(100%, 500px);

    .formPane {
      padding: 1.2rem 1rem 1.05rem;
    }

    h4 {
      font-size: 1.65rem;
    }

    .formDescription {
      margin-bottom: 0.95rem;
    }
  }
`
