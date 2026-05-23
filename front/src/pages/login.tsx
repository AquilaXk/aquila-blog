import { GetServerSideProps } from "next"
import Link from "next/link"
import { useRouter } from "next/router"
import { FormEvent, useEffect, useMemo, useState } from "react"
import { apiFetch } from "src/apis/backend/client"
import { toAuthErrorMessage } from "src/apis/backend/errorMessages"
import { ErrorText, FooterText, SuccessText } from "src/components/auth/LoginPage.styles"
import { LoginPageForm } from "src/components/auth/LoginPageForm"
import AuthShell from "src/components/auth/AuthShell"
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
  const [showSocialAuth, setShowSocialAuth] = useState(false)

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
  const hasSocialItems = socialItems.length > 0

  useEffect(() => {
    if (!hasSocialItems || showSocialAuth || typeof window === "undefined") return
    const handle = window.setTimeout(() => setShowSocialAuth(true), 320)
    return () => window.clearTimeout(handle)
  }, [hasSocialItems, showSocialAuth])

  const loginIdActive = useMemo(() => loginIdFocused || email.length > 0, [email, loginIdFocused])
  const passwordActive = useMemo(() => passwordFocused || password.length > 0, [password, passwordFocused])
  const feedbackMessage = error ? (
    <ErrorText>{error}</ErrorText>
  ) : signupDone ? (
    <SuccessText>
      회원가입이 완료되었습니다. <strong>{loginIdPrefill || "인증한 이메일"}</strong>로 로그인하면 됩니다.
    </SuccessText>
  ) : null

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
      <LoginPageForm
        email={email}
        password={password}
        showPassword={showPassword}
        loading={loading}
        loginIdActive={loginIdActive}
        passwordActive={passwordActive}
        keepSignedIn={keepSignedIn}
        ipSecurityOn={ipSecurityOn}
        showIpSecurityInfo={showIpSecurityInfo}
        feedbackMessage={feedbackMessage}
        hasSocialItems={hasSocialItems}
        showSocialAuth={showSocialAuth}
        socialItems={socialItems}
        onSubmit={onSubmit}
        setEmail={setEmail}
        setPassword={setPassword}
        setShowPassword={setShowPassword}
        setLoginIdFocused={setLoginIdFocused}
        setPasswordFocused={setPasswordFocused}
        setKeepSignedIn={setKeepSignedIn}
        setIpSecurityOn={setIpSecurityOn}
        setShowIpSecurityInfo={setShowIpSecurityInfo}
      />
    </AuthShell>
  )
}

export default LoginPage
