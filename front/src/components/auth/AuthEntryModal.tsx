import styled from "@emotion/styled"
import dynamic from "next/dynamic"
import Link from "next/link"
import { FormEvent, useEffect, useMemo, useState } from "react"
import { apiFetch, getApiBaseUrl } from "src/apis/backend/client"
import AppIcon from "src/components/icons/AppIcon"
import useAuthSession from "src/hooks/useAuthSession"

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
  visualTitle?: string
  visualDescription?: string
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
  visualTitle = "환영합니다!",
  visualDescription = "로그인하면 현재 보고 있는 화면으로 다시 돌아와 이어서 작업할 수 있습니다.",
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
    if (!nextPath || !nextPath.startsWith("/")) return "/"
    return nextPath
  }, [nextPath])

  const loginHref = useMemo(
    () => `/login?next=${encodeURIComponent(normalizedNextPath)}`,
    [normalizedNextPath]
  )
  const signupHref = useMemo(
    () => `/signup?next=${encodeURIComponent(normalizedNextPath)}`,
    [normalizedNextPath]
  )
  const kakaoAuthUrl = useMemo(() => {
    if (typeof window === "undefined") return ""
    const redirectUrl = `${window.location.origin}${normalizedNextPath}`
    return `${getApiBaseUrl()}/oauth2/authorization/kakao?redirectUrl=${encodeURIComponent(redirectUrl)}`
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
        setMe(null)
      }

      setPassword("")
      onClose()
    } catch (loginError) {
      if (loginError instanceof Error) {
        const message = loginError.message.split(": ").slice(1).join(": ").trim()
        setError(message || "로그인에 실패했습니다.")
      } else {
        setError("로그인에 실패했습니다.")
      }
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
      if (signupStartError instanceof Error) {
        const message = signupStartError.message.split(": ").slice(1).join(": ").trim()
        setSignupError(message || "회원가입 메일 전송에 실패했습니다.")
      } else {
        setSignupError("회원가입 메일 전송에 실패했습니다.")
      }
    } finally {
      setSignupLoading(false)
    }
  }

  const currentContent =
    view === "login"
      ? {
          eyebrow: "Login",
          heading: title,
          body: description,
          visualIcon: <AppIcon name="message" aria-hidden="true" />,
          visualTitle,
          visualDescription,
        }
      : view === "signup"
        ? {
            eyebrow: "Signup",
            heading: "회원가입",
            body: "먼저 이메일을 확인한 뒤 아이디와 비밀번호를 등록합니다.",
            visualIcon: <AppIcon name="mail" aria-hidden="true" />,
            visualTitle: "이메일 인증",
            visualDescription: "가입 링크를 메일로 보내드릴게요. 메일 안의 링크를 통해 마지막 가입 단계로 이어집니다.",
          }
        : {
            eyebrow: "Sent",
            heading: "메일을 보냈어요",
            body: "받은편지함에서 회원가입 메일을 확인한 뒤 계속 진행해주세요.",
            visualIcon: <AppIcon name="check-circle" aria-hidden="true" />,
            visualTitle: "거의 다 됐어요",
            visualDescription: "메일에 들어 있는 링크를 누르면 이메일이 검증되고, 마지막 가입 폼으로 바로 이어집니다.",
          }

  return (
    <Backdrop onClick={onClose} role="presentation">
      <Modal
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-entry-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="visualPane">
          <div className="visualArtwork">{currentContent.visualIcon}</div>
          <strong>{currentContent.visualTitle}</strong>
          <p>{currentContent.visualDescription}</p>
        </div>

        <div className="formPane">
          <button type="button" className="closeButton" onClick={onClose} aria-label="닫기">
            <AppIcon name="close" aria-hidden="true" />
          </button>

          <span className="eyebrow">{currentContent.eyebrow}</span>
          <h4 id="auth-entry-modal-title">{currentContent.heading}</h4>
          <p className="formDescription">{currentContent.body}</p>

          {view === "login" && (
            <LoginPanel
              username={username}
              password={password}
              showPassword={showPassword}
              error={error}
              loading={loading}
              loginHref={loginHref}
              kakaoAuthUrl={kakaoAuthUrl}
              onSubmit={handleLogin}
              onUsernameChange={setUsername}
              onPasswordChange={setPassword}
              onTogglePassword={() => setShowPassword((value) => !value)}
              onSwitchToSignup={() => setView("signup")}
              onKakaoAuth={() => {
                if (!kakaoAuthUrl) return
                window.location.href = kakaoAuthUrl
              }}
            />
          )}

          {view === "signup" && (
            <SignupPanel
              signupEmail={signupEmail}
              signupError={signupError}
              signupLoading={signupLoading}
              signupHref={signupHref}
              kakaoAuthUrl={kakaoAuthUrl}
              onSubmit={handleSignupEmailStart}
              onSignupEmailChange={setSignupEmail}
              onSwitchToLogin={() => setView("login")}
              onKakaoAuth={() => {
                if (!kakaoAuthUrl) return
                window.location.href = kakaoAuthUrl
              }}
            />
          )}

          {view === "signup-sent" && (
            <SignupSentPanel
              sentEmail={sentEmail}
              signupEmail={signupEmail}
              signupHref={signupHref}
              onBackToLogin={() => setView("login")}
              onRetryWithAnotherEmail={() => setView("signup")}
            />
          )}
        </div>
      </Modal>
    </Backdrop>
  )
}

export default AuthEntryModal

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.2rem;
  background: rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(6px);
`

const Modal = styled.div`
  position: relative;
  width: min(100%, 760px);
  display: grid;
  grid-template-columns: minmax(220px, 0.84fr) minmax(0, 1.16fr);
  border-radius: 24px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  overflow: hidden;
  background:
    linear-gradient(180deg, rgba(18, 21, 28, 0.98), rgba(12, 14, 18, 0.98));
  box-shadow: 0 28px 70px rgba(0, 0, 0, 0.42);

  .visualPane {
    padding: 2rem 1.45rem 1.7rem;
    background:
      radial-gradient(circle at top, rgba(49, 196, 141, 0.12), transparent 58%),
      linear-gradient(180deg, rgba(26, 31, 40, 0.96), rgba(18, 22, 30, 0.96));
    border-right: 1px solid rgba(148, 163, 184, 0.12);
    color: ${({ theme }) => theme.colors.gray12};
    display: grid;
    align-content: center;
    justify-items: center;
    text-align: center;
    gap: 1rem;
  }

  .visualArtwork {
    display: grid;
    place-items: center;
    width: 124px;
    height: 124px;
    border-radius: 28px;
    background:
      radial-gradient(circle at top, rgba(52, 211, 153, 0.16), transparent 58%),
      linear-gradient(180deg, rgba(28, 36, 48, 0.95), rgba(20, 26, 36, 0.98));
    box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.16);

    svg {
      font-size: 3rem;
      color: #34d399;
    }
  }

  .visualPane strong {
    font-size: 1.95rem;
    line-height: 1.12;
    color: ${({ theme }) => theme.colors.gray12};
  }

  .visualPane p {
    margin: 0;
    max-width: 18rem;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.95rem;
    line-height: 1.75;
  }

  .formPane {
    position: relative;
    padding: 1.6rem 1.45rem 1.3rem;
    background:
      linear-gradient(180deg, rgba(14, 17, 23, 0.98), rgba(10, 12, 16, 0.98));
  }

  .closeButton {
    position: absolute;
    top: 0.95rem;
    right: 0.95rem;
    min-width: 38px;
    width: 38px;
    height: 38px;
    padding: 0;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid ${({ theme }) => theme.colors.gray7};
    background: rgba(255, 255, 255, 0.02);
    color: ${({ theme }) => theme.colors.gray11};
  }

  .closeButton svg {
    font-size: 1rem;
  }

  .eyebrow {
    display: inline-flex;
    margin-bottom: 0.85rem;
    border-radius: 999px;
    padding: 0.36rem 0.78rem;
    border: 1px solid rgba(59, 130, 246, 0.38);
    background: rgba(18, 63, 126, 0.22);
    color: #60a5fa;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h4 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.75rem;
    line-height: 1.35;
  }

  .formDescription {
    margin: 0.68rem 0 1.15rem;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.65;
    font-size: 0.92rem;
    max-width: 28rem;
  }

  .loginForm {
    display: grid;
    gap: 0.68rem;
    margin-bottom: 1rem;

    label {
      color: ${({ theme }) => theme.colors.gray11};
      font-size: 0.82rem;
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
    border-radius: 16px;
    background: linear-gradient(90deg, rgba(148, 163, 184, 0.08), rgba(148, 163, 184, 0.16));
  }

  .panelFallback .line {
    height: 50px;
  }

  .panelFallback .line.large {
    height: 82px;
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
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.03);
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
    padding: 0.96rem 1rem;
    font-size: 0.94rem;

    &:focus {
      outline: none;
    }
  }

  .passwordField input {
    padding-right: 4.9rem;
  }

  .passwordToggle {
    position: absolute;
    top: 50%;
    right: 0.72rem;
    transform: translateY(-50%);
    min-width: auto;
    border: 0;
    border-radius: 999px;
    padding: 0.38rem 0.68rem;
    background: rgba(148, 163, 184, 0.1);
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.76rem;
    font-weight: 700;
    line-height: 1;
  }

  .inlineError {
    margin: 0;
    border-radius: 12px;
    border: 1px solid ${({ theme }) => theme.colors.red7};
    background: ${({ theme }) => theme.colors.red3};
    color: ${({ theme }) => theme.colors.red11};
    padding: 0.72rem 0.8rem;
    font-size: 0.85rem;
    line-height: 1.5;
  }

  .primaryAction,
  .secondaryAction {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 48px;
    border-radius: 14px;
    font-size: 0.92rem;
    font-weight: 800;
  }

  .primaryAction {
    border: 1px solid rgba(52, 211, 153, 0.44);
    background: linear-gradient(135deg, #149d71, #2abf8c);
    color: #fff;
  }

  .secondaryAction {
    border: 1px solid ${({ theme }) => theme.colors.gray7};
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray12};
  }

  .socialSection {
    display: grid;
    gap: 0.58rem;
    margin-bottom: 0.9rem;

    span {
      color: ${({ theme }) => theme.colors.gray11};
      font-size: 0.82rem;
      font-weight: 700;
    }
  }

  .socialButtonRow {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .kakaoIconButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 72px;
    min-height: 72px;
    border-radius: 50%;
    border: 1px solid rgba(230, 194, 0, 0.72);
    background: linear-gradient(180deg, #fee500, #facc15);
    color: #241b00;
    box-shadow: 0 10px 22px rgba(250, 204, 21, 0.14);

    svg {
      font-size: 1.95rem;
    }
  }

  .signupRow {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.86rem;
    margin-bottom: 0.8rem;
  }

  .inlineLinkButton,
  .fullPageLink {
    border: 0;
    background: transparent;
    min-height: auto;
    padding: 0;
    color: ${({ theme }) => theme.colors.blue10};
    font-size: 0.86rem;
    font-weight: 700;
    text-decoration: underline;
    text-underline-offset: 3px;
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
    grid-template-columns: 1fr;

    .visualPane {
      padding: 1.15rem 1rem 1rem;
      border-right: 0;
      border-bottom: 1px solid rgba(148, 163, 184, 0.1);
    }

    .visualArtwork {
      width: 84px;
      height: 84px;

      svg {
        font-size: 2.2rem;
      }
    }

    .visualPane strong {
      font-size: 1.45rem;
    }

    .formPane {
      padding: 1.2rem 1rem 1rem;
    }
  }
`
