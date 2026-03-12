import styled from "@emotion/styled"
import Link from "next/link"
import { FormEvent, useEffect, useMemo, useState } from "react"
import { FiCheckCircle, FiMail, FiMessageCircle, FiX } from "react-icons/fi"
import { RiKakaoTalkFill } from "react-icons/ri"
import { apiFetch, getApiBaseUrl } from "src/apis/backend/client"
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
          visualIcon: <FiMessageCircle aria-hidden="true" />,
          visualTitle,
          visualDescription,
        }
      : view === "signup"
        ? {
            eyebrow: "Signup",
            heading: "회원가입",
            body: "먼저 이메일을 확인한 뒤 아이디와 비밀번호를 등록합니다.",
            visualIcon: <FiMail aria-hidden="true" />,
            visualTitle: "이메일 인증",
            visualDescription: "가입 링크를 메일로 보내드릴게요. 메일 안의 링크를 통해 마지막 가입 단계로 이어집니다.",
          }
        : {
            eyebrow: "Sent",
            heading: "메일을 보냈어요",
            body: "받은편지함에서 회원가입 메일을 확인한 뒤 계속 진행해주세요.",
            visualIcon: <FiCheckCircle aria-hidden="true" />,
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
            <FiX aria-hidden="true" />
          </button>

          <span className="eyebrow">{currentContent.eyebrow}</span>
          <h4 id="auth-entry-modal-title">{currentContent.heading}</h4>
          <p className="formDescription">{currentContent.body}</p>

          {view === "login" && (
            <>
              <form className="loginForm" onSubmit={handleLogin}>
                <label htmlFor="auth-entry-username">아이디로 로그인</label>
                <div className="inlineField">
                  <input
                    id="auth-entry-username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="아이디를 입력하세요."
                    autoComplete="username"
                    disabled={loading}
                  />
                </div>

                <div className="inlineField passwordField">
                  <input
                    id="auth-entry-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="비밀번호를 입력하세요."
                    autoComplete="current-password"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="passwordToggle"
                    onClick={() => setShowPassword((value) => !value)}
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
                  <button
                    type="button"
                    className="kakaoIconButton"
                    onClick={() => {
                      if (!kakaoAuthUrl) return
                      window.location.href = kakaoAuthUrl
                    }}
                    aria-label="카카오로 로그인"
                    title="카카오로 로그인"
                  >
                    <RiKakaoTalkFill aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="signupRow">
                <span>아직 회원이 아니신가요?</span>
                <button type="button" className="inlineLinkButton" onClick={() => setView("signup")}>
                  회원가입
                </button>
              </div>

              <Link href={loginHref} className="fullPageLink">
                전체 로그인 페이지로 이동
              </Link>
            </>
          )}

          {view === "signup" && (
            <>
              <form className="loginForm" onSubmit={handleSignupEmailStart}>
                <label htmlFor="auth-entry-signup-email">이메일로 회원가입</label>
                <div className="inlineField">
                  <input
                    id="auth-entry-signup-email"
                    value={signupEmail}
                    onChange={(event) => setSignupEmail(event.target.value)}
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
                    onClick={() => {
                      if (!kakaoAuthUrl) return
                      window.location.href = kakaoAuthUrl
                    }}
                    aria-label="카카오로 로그인"
                    title="카카오로 로그인"
                  >
                    <RiKakaoTalkFill aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="signupRow">
                <span>이미 계정이 있으신가요?</span>
                <button type="button" className="inlineLinkButton" onClick={() => setView("login")}>
                  로그인
                </button>
              </div>

              <Link href={signupHref} className="fullPageLink">
                전체 회원가입 페이지로 이동
              </Link>
            </>
          )}

          {view === "signup-sent" && (
            <div className="sentState">
              <div className="sentCard">
                <FiCheckCircle aria-hidden="true" />
                <div>
                  <strong>{sentEmail || signupEmail}</strong>
                  <p>회원가입 링크가 이메일로 전송되었습니다.</p>
                </div>
              </div>

              <div className="sentActions">
                <button type="button" className="primaryAction" onClick={() => setView("login")}>
                  로그인으로 돌아가기
                </button>
                <button type="button" className="secondaryAction" onClick={() => setView("signup")}>
                  다른 이메일로 다시 보내기
                </button>
              </div>

              <Link href={signupHref} className="fullPageLink">
                전체 회원가입 페이지에서 계속하기
              </Link>
            </div>
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
  width: min(100%, 780px);
  display: grid;
  grid-template-columns: minmax(220px, 0.92fr) minmax(0, 1.08fr);
  border-radius: 24px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  overflow: hidden;
  background: ${({ theme }) => theme.colors.gray1};
  box-shadow: 0 28px 70px rgba(0, 0, 0, 0.42);

  .visualPane {
    padding: 2rem 1.35rem 1.5rem;
    background:
      linear-gradient(180deg, rgba(245, 247, 250, 0.98), rgba(236, 240, 245, 0.95));
    color: #1f2937;
    display: grid;
    align-content: center;
    justify-items: center;
    text-align: center;
    gap: 0.9rem;
  }

  .visualArtwork {
    display: grid;
    place-items: center;
    width: 140px;
    height: 140px;
    border-radius: 30px;
    background:
      radial-gradient(circle at top, rgba(16, 185, 129, 0.18), transparent 62%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(241, 245, 249, 0.95));
    box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.22);

    svg {
      font-size: 3.4rem;
      color: #10b981;
    }
  }

  .visualPane strong {
    font-size: 2.2rem;
    line-height: 1.08;
    color: #111827;
  }

  .visualPane p {
    margin: 0;
    color: #64748b;
    font-size: 0.95rem;
    line-height: 1.7;
  }

  .formPane {
    position: relative;
    padding: 1.6rem 1.45rem 1.2rem;
    background: ${({ theme }) => theme.colors.gray1};
  }

  .closeButton {
    position: absolute;
    top: 0.95rem;
    right: 0.95rem;
    min-width: 34px;
    width: 34px;
    height: 34px;
    padding: 0;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid ${({ theme }) => theme.colors.gray7};
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray11};
  }

  .closeButton svg {
    font-size: 1rem;
  }

  .eyebrow {
    display: inline-flex;
    margin-bottom: 0.7rem;
    border-radius: 999px;
    padding: 0.34rem 0.68rem;
    border: 1px solid ${({ theme }) => theme.colors.blue7};
    background: ${({ theme }) => theme.colors.blue3};
    color: ${({ theme }) => theme.colors.blue11};
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
    margin: 0.62rem 0 1rem;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.65;
    font-size: 0.92rem;
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

  .inlineField,
  .passwordField {
    display: grid;
    grid-template-columns: 1fr;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    border-radius: 14px;
    background: ${({ theme }) => theme.colors.gray2};
    overflow: hidden;
  }

  .passwordField {
    grid-template-columns: 1fr auto;
  }

  input {
    width: 100%;
    border: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray12};
    padding: 0.92rem 1rem;
    font-size: 0.94rem;

    &:focus {
      outline: none;
    }
  }

  .passwordToggle {
    min-width: 72px;
    border: 0;
    border-left: 1px solid ${({ theme }) => theme.colors.gray6};
    border-radius: 0;
    background: ${({ theme }) => theme.colors.gray1};
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.8rem;
    font-weight: 700;
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
    border: 1px solid ${({ theme }) => theme.colors.green8};
    background: linear-gradient(135deg, #10b981, #34d399);
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
    box-shadow: 0 10px 24px rgba(250, 204, 21, 0.18);

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
      padding: 1.2rem 1rem 1rem;
    }

    .visualArtwork {
      width: 88px;
      height: 88px;

      svg {
        font-size: 2.2rem;
      }
    }

    .visualPane strong {
      font-size: 1.6rem;
    }

    .formPane {
      padding: 1.2rem 1rem 1rem;
    }
  }
`
