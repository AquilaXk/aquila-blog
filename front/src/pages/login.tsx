import styled from "@emotion/styled"
import { GetServerSideProps } from "next"
import Link from "next/link"
import { useRouter } from "next/router"
import { FormEvent, useEffect, useMemo, useState } from "react"
import { apiFetch } from "src/apis/backend/client"
import { toAuthErrorMessage } from "src/apis/backend/errorMessages"
import AuthShell from "src/components/auth/AuthShell"
import SocialAuthButtons from "src/components/auth/SocialAuthButtons"
import { buildSocialAuthItems } from "src/components/auth/socialAuth"
import useAuthSession from "src/hooks/useAuthSession"
import type { AuthMember } from "src/hooks/useAuthSession"
import { normalizeNextPath, replaceRoute, toLoginPath, toSignupPath } from "src/libs/router"
import { GuestPageProps, getGuestPageProps } from "src/libs/server/guestPage"

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
    if (emailValue?.trim()) return emailValue.trim()

    // 무중단 전환: 과거 signup redirect(`username`) 파라미터도 임시 수용한다.
    const usernameRaw = router.query.username
    const usernameValue = Array.isArray(usernameRaw) ? usernameRaw[0] : usernameRaw
    return usernameValue?.trim() || ""
  }, [router.query.email, router.query.username])

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!loginIdPrefill) return
    setEmail(loginIdPrefill)
  }, [loginIdPrefill])

  const socialItems = useMemo(() => {
    return buildSocialAuthItems(next)
  }, [next])

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      setError("이메일과 비밀번호를 입력해주세요.")
      return
    }

    setLoading(true)
    setError("")

    try {
      await apiFetch<RsData<unknown>>("/member/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
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
    } catch (error) {
      setError(toAuthErrorMessage("login", error, "로그인에 실패했습니다."))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      activeTab="login"
      title="로그인"
      subtitle="계정 정보를 입력하세요."
      eyebrow="Access Portal"
      heroTitle="로그인"
      heroDescription={next !== "/" ? `로그인 후 ${next}로 돌아갑니다.` : "로그인 후 이전 흐름으로 돌아갑니다."}
      footer={
        <FooterText>
          계정이 없으면 <Link href={toSignupPath(next)}>회원가입</Link>
        </FooterText>
      }
      loginHref={toLoginPath(next)}
      signupHref={toSignupPath(next)}
    >
      <form onSubmit={onSubmit}>
        <Field>
          <FieldTop>
            <Label htmlFor="email">이메일</Label>
            <FieldHint>로그인 식별자</FieldHint>
          </FieldTop>
          <Input
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일을 입력하세요"
            autoComplete="email"
          />
        </Field>

        <Field>
          <FieldTop>
            <Label htmlFor="password">비밀번호</Label>
            <FieldHint>계정 비밀번호</FieldHint>
          </FieldTop>
          <PasswordRow>
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
              autoComplete="current-password"
            />
            <GhostButton
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label="비밀번호 표시 전환"
            >
              {showPassword ? "숨기기" : "표시"}
            </GhostButton>
          </PasswordRow>
        </Field>

        {error ? (
          <ErrorText>{error}</ErrorText>
        ) : signupDone ? (
          <SuccessText>
            회원가입이 완료되었습니다. <strong>{loginIdPrefill || "인증한 이메일"}</strong>로 로그인하면 됩니다.
          </SuccessText>
        ) : (
          <InfoText>로그인 후 이전에 보던 화면으로 바로 이동합니다.</InfoText>
        )}

        <PrimaryButton type="submit" disabled={loading}>
          {loading ? "로그인 중..." : "로그인"}
        </PrimaryButton>

        <SocialSection>
          <span>소셜 계정으로 로그인</span>
          <SocialButtonRow>
            <SocialAuthButtons
              items={socialItems}
            />
          </SocialButtonRow>
        </SocialSection>
      </form>
    </AuthShell>
  )
}

export default LoginPage

const Field = styled.div`
  display: grid;
  gap: 0.42rem;
`

const FieldTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;

  @media (max-width: 640px) {
    display: grid;
    gap: 0.16rem;
  }
`

const Label = styled.label`
  font-size: 0.92rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.gray12};
`

const FieldHint = styled.span`
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.78rem;
`

const PasswordRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.5rem;
`

const Input = styled.input`
  width: 100%;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 12px;
  padding: 0.78rem 0.84rem;
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.blue3};
  }
`

const PrimaryButton = styled.button`
  border: 1px solid ${({ theme }) => theme.colors.blue8};
  border-radius: 12px;
  padding: 0.84rem 1rem;
  background: ${({ theme }) => theme.colors.blue9};
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.blue10};
    background: ${({ theme }) => theme.colors.blue10};
  }

  &:disabled {
    opacity: 0.68;
    cursor: not-allowed;
  }
`

const GhostButton = styled.button`
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 12px;
  padding: 0.78rem 0.84rem;
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  cursor: pointer;
  white-space: nowrap;
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

const InfoText = styled.p`
  margin: 0;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0.82rem 0.9rem;
  font-size: 0.87rem;
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
