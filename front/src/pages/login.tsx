import styled from "@emotion/styled"
import { GetServerSideProps } from "next"
import Link from "next/link"
import { useRouter } from "next/router"
import { FormEvent, useEffect, useMemo, useState } from "react"
import { apiFetch } from "src/apis/backend/client"
import { toAuthErrorMessage } from "src/apis/backend/errorMessages"
import AuthShell from "src/components/auth/AuthShell"
import IpSecurityInfoModal from "src/components/auth/IpSecurityInfoModal"
import AppIcon from "src/components/icons/AppIcon"
import SocialAuthButtons from "src/components/auth/SocialAuthButtons"
import { buildSocialAuthItems } from "src/components/auth/socialAuth"
import useAuthSession from "src/hooks/useAuthSession"
import type { AuthMember } from "src/hooks/useAuthSession"
import { loadAuthLoginPolicyPrefs, saveAuthLoginPolicyPrefs } from "src/libs/authLoginPolicy"
import { normalizeNextPath, replaceRoute, toLoginPath, toSignupPath } from "src/libs/router"
import { GuestPageProps, getGuestPageProps } from "src/libs/server/guestPage"
import { isValidAuthEmail, normalizeAuthEmail } from "src/libs/validation/auth"

type RsData<T> = {
  resultCode: string
  msg: string
  data: T
}

export const getServerSideProps: GetServerSideProps<GuestPageProps> = async ({ req }) => {
  return await getGuestPageProps(req)
}

const LoginPage = () => {
  const router = useRouter()
  const { refresh, setMe } = useAuthSession()
  const next = useMemo(() => {
    return normalizeNextPath(router.query.next)
  }, [router.query.next])
  const signupDone = useMemo(() => {
    const raw = router.query.signup
    const value = Array.isArray(raw) ? raw[0] : raw
    return value === "done"
  }, [router.query.signup])
  const loginIdPrefill = useMemo(() => {
    const emailRaw = router.query.email
    const emailValue = Array.isArray(emailRaw) ? emailRaw[0] : emailRaw
    return emailValue?.trim() || ""
  }, [router.query.email])

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [loginIdFocused, setLoginIdFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [keepSignedIn, setKeepSignedIn] = useState(true)
  const [ipSecurityOn, setIpSecurityOn] = useState(false)
  const [showIpSecurityInfo, setShowIpSecurityInfo] = useState(false)

  useEffect(() => {
    if (!loginIdPrefill) return
    setEmail(loginIdPrefill)
  }, [loginIdPrefill])

  useEffect(() => {
    const prefs = loadAuthLoginPolicyPrefs()
    setKeepSignedIn(prefs.keepSignedIn)
    setIpSecurityOn(prefs.ipSecurityOn)
  }, [])

  useEffect(() => {
    saveAuthLoginPolicyPrefs({ keepSignedIn, ipSecurityOn })
  }, [keepSignedIn, ipSecurityOn])

  const socialItems = useMemo(() => {
    return buildSocialAuthItems(next)
  }, [next])
  const loginIdActive = useMemo(() => loginIdFocused || email.length > 0, [email, loginIdFocused])
  const passwordActive = useMemo(() => passwordFocused || password.length > 0, [password, passwordFocused])

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
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

      // 로그인 응답의 Set-Cookie를 받은 직후 현재 세션을 강제로 동기화해,
      // SSR anonymous 스냅샷에서도 즉시 인증 헤더 상태가 반영되도록 한다.
      try {
        const currentMember = await apiFetch<AuthMember>("/member/api/v1/auth/me")
        setMe(currentMember)
      } catch {
        // 세션 재조회 실패 시 refresh()로 한 번 더 재시도한다.
        try {
          const refreshed = await refresh()
          setMe(refreshed.data ?? null)
        } catch {
          setMe(null)
        }
      }

      const normalizePathname = (value: string) => {
        if (!value) return "/"
        if (value === "/") return "/"
        const normalized = value.replace(/\/+$/, "")
        return normalized || "/"
      }

      const currentPathname = normalizePathname(router.asPath.split("?")[0] || router.pathname)
      const nextPathname = normalizePathname(next.split("?")[0] || "/")
      const shouldNavigate = nextPathname !== currentPathname

      if (shouldNavigate && router.asPath !== next) {
        await replaceRoute(router, next)
      }
    } catch (authError) {
      setError(toAuthErrorMessage("login", authError, "로그인에 실패했습니다."))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      activeTab="login"
      title="로그인"
      subtitle="계정으로 계속하세요."
      eyebrow="Access Portal"
      heroTitle="로그인"
      heroDescription="이메일과 비밀번호를 입력해 접속하세요."
      footer={
        <FooterText>
          계정이 없으면 <Link href={toSignupPath(next)}>회원가입</Link>
        </FooterText>
      }
      loginHref={toLoginPath(next)}
      signupHref={toSignupPath(next)}
    >
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
            <GhostIconButton type="button" aria-label="이메일 입력 지우기" onClick={() => setEmail("")}>
              <AppIcon name="close" />
            </GhostIconButton>
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
            <GhostIconButton className="visibilityToggle" type="button" onClick={() => setShowPassword((value) => !value)} aria-label="비밀번호 표시 전환">
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

        {error ? (
          <ErrorText>{error}</ErrorText>
        ) : signupDone ? (
          <SuccessText>
            회원가입이 완료되었습니다. <strong>{loginIdPrefill || "인증한 이메일"}</strong>로 로그인하면 됩니다.
          </SuccessText>
        ) : null}

        <PrimaryButton type="submit" disabled={loading}>
          {loading ? "로그인 중..." : "로그인"}
        </PrimaryButton>

        <SocialSection>
          <span>소셜 계정으로 로그인</span>
          <SocialButtonRow>
            <SocialAuthButtons items={socialItems} />
          </SocialButtonRow>
        </SocialSection>
      </form>
      <IpSecurityInfoModal open={showIpSecurityInfo} onClose={() => setShowIpSecurityInfo(false)} />
    </AuthShell>
  )
}

export default LoginPage

const NaverField = styled.div`
  position: relative;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 14px;
  background: ${({ theme }) => theme.colors.gray2};
  min-height: 76px;
  padding: 1.55rem 0.92rem 0.48rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &[data-active="true"] {
    border-color: ${({ theme }) => theme.colors.gray7};
    box-shadow: 0 0 0 2px rgba(148, 163, 184, 0.1);
  }
`

const NaverFieldLabel = styled.label`
  position: absolute;
  left: 0.92rem;
  top: 50%;
  transform: translateY(-50%);
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1;
  pointer-events: none;
  transition: top 0.2s ease, transform 0.2s ease, font-size 0.2s ease, color 0.2s ease;

  &[data-active="true"] {
    top: 0.82rem;
    transform: translateY(0);
    font-size: 0.72rem;
    color: ${({ theme }) => theme.colors.gray11};
  }
`

const NaverInput = styled.input`
  width: 100%;
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};
  min-height: 42px;
  padding: 0;
  font-size: 1.05rem;
  font-weight: 650;
  line-height: 1.3;

  &::placeholder {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.96rem;
    font-weight: 500;
  }

  &:focus {
    outline: none;
  }

  &[data-password="true"] {
    padding-right: 8.35rem;
  }
`

const PasswordActions = styled.div`
  position: absolute;
  top: 50%;
  right: 0.5rem;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 0.3rem;
`

const GhostIconButton = styled.button`
  min-width: 44px;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.72rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: filter 0.16s ease;

  &:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  &:disabled {
    opacity: 0.62;
    cursor: not-allowed;
  }

  &.visibilityToggle {
    border: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    width: 44px;
    min-width: 44px;
  }

  svg {
    font-size: 0.74rem;
  }

  &.visibilityToggle svg {
    font-size: 1.12rem;
  }
`

const LoginStateRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.9rem;
  margin-top: 0.12rem;
  margin-bottom: 0.06rem;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.42rem;
  }
`

const KeepSignedInButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.46rem;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.9rem;
  font-weight: 650;
  min-height: 44px;
  padding: 0.22rem 0.2rem;
  border-radius: 10px;
  touch-action: manipulation;

  .checkIcon {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: ${({ theme }) => theme.colors.gray9};
    transition: color 0.2s ease, transform 0.2s ease;
  }

  .checkIcon svg {
    font-size: 1.45rem;
  }

  &[data-on="true"] .checkIcon {
    color: ${({ theme }) => theme.colors.gray11};
    transform: scale(1.03);
  }
`

const IpSecurityToggle = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.9rem;
  font-weight: 700;
  min-height: 44px;
  padding: 0.22rem 0;
  touch-action: manipulation;

  .switch {
    width: 52px;
    height: 30px;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray7};
    background: ${({ theme }) => theme.colors.gray5};
    padding: 2px;
    display: inline-flex;
    align-items: center;
    transition: background-color 0.2s ease, border-color 0.2s ease;
  }

  .thumb {
    width: 24px;
    height: 24px;
    border-radius: 999px;
    background: ${({ theme }) => theme.colors.gray1};
    transition: transform 0.22s ease;
    transform: translateX(0);
  }

  .state {
    width: 28px;
    text-align: right;
    color: ${({ theme }) => theme.colors.gray10};
    transition: color 0.2s ease;
  }

  &[data-on="true"] .switch {
    background: rgba(18, 184, 134, 0.44);
    border-color: rgba(18, 184, 134, 0.76);
  }

  &[data-on="true"] .thumb {
    transform: translateX(20px);
  }

  &[data-on="true"] .state {
    color: ${({ theme }) => theme.colors.green10};
  }
`

const IpSecurityControl = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.46rem;

  @media (max-width: 640px) {
    align-self: flex-end;
  }
`

const IpSecurityInfoButton = styled.button`
  border: 0;
  min-height: 44px;
  padding: 0.15rem 0.3rem;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.9rem;
  font-weight: 700;
  text-decoration: underline;
  text-decoration-color: ${({ theme }) => theme.colors.gray7};
  text-underline-offset: 2px;
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.colors.blue10};
    text-decoration-color: ${({ theme }) => theme.colors.blue8};
  }
`

const PrimaryButton = styled.button`
  border: 0;
  border-radius: 12px;
  padding: 0.84rem 1rem;
  background: #12b886;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  transition: filter 0.16s ease;

  &:hover:not(:disabled) {
    filter: brightness(1.06);
  }

  &:disabled {
    opacity: 0.68;
    cursor: not-allowed;
  }
`

const ErrorText = styled.p`
  margin: 0;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.red7};
  background: ${({ theme }) => theme.colors.red3};
  color: ${({ theme }) => theme.colors.red11};
  padding: 0.82rem 0.9rem;
  font-size: 0.9rem;
  line-height: 1.55;
`

const SuccessText = styled.p`
  margin: 0;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.green7};
  background: ${({ theme }) => theme.colors.green3};
  color: ${({ theme }) => theme.colors.green11};
  padding: 0.82rem 0.9rem;
  font-size: 0.87rem;
  line-height: 1.65;

  strong {
    font-weight: 800;
  }
`

const FooterText = styled.p`
  margin: 0;

  a {
    display: inline-flex;
    align-items: center;
    min-height: 34px;
  }
`

const SocialSection = styled.div`
  display: grid;
  gap: 0.8rem;
  margin-top: 0.15rem;

  > span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.88rem;
    font-weight: 700;
  }
`

const SocialButtonRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`
