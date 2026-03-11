import styled from "@emotion/styled"
import Link from "next/link"
import { useRouter } from "next/router"
import { FormEvent, useMemo, useState } from "react"
import { apiFetch, getApiBaseUrl } from "src/apis/backend/client"
import { isNavigationCancelledError } from "src/libs/router"

type RsData<T> = {
  resultCode: string
  msg: string
  data: T
}

const LoginPage = () => {
  const router = useRouter()
  const next = useMemo(() => {
    const raw = router.query.next
    const value = Array.isArray(raw) ? raw[0] : raw
    if (!value || !value.startsWith("/")) return "/"
    return value
  }, [router.query.next])

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const kakaoAuthUrl = useMemo(() => {
    if (typeof window === "undefined") return ""
    const redirectUrl = `${window.location.origin}${next}`
    return `${getApiBaseUrl()}/oauth2/authorization/kakao?redirectUrl=${encodeURIComponent(redirectUrl)}`
  }, [next])

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      setError("아이디와 비밀번호를 입력해주세요.")
      return
    }

    setLoading(true)
    setError("")

    try {
      await apiFetch<RsData<unknown>>("/member/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      })
      try {
        if (router.asPath !== next) {
          await router.push(next)
        }
      } catch (error) {
        if (!isNavigationCancelledError(error)) throw error
      }
    } catch (error) {
      if (error instanceof Error) {
        const message = error.message.split(": ").slice(1).join(": ").trim()
        setError(message || "로그인에 실패했습니다.")
      } else {
        setError("로그인에 실패했습니다.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Main>
      <Card>
        <Top>
          <Title>로그인</Title>
          <SubTitle>관리 기능은 관리자 계정 로그인 후에만 접근할 수 있습니다.</SubTitle>
        </Top>

        <Tabs>
          <ActiveTab>로그인</ActiveTab>
          <PassiveTab href="/signup">회원가입</PassiveTab>
        </Tabs>

        <form onSubmit={onSubmit}>
          <Field>
            <Label htmlFor="username">아이디</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="아이디를 입력하세요"
              autoComplete="username"
            />
          </Field>

          <Field>
            <Label htmlFor="password">비밀번호</Label>
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

          {error && <ErrorText>{error}</ErrorText>}
          <Button type="submit" disabled={loading}>
            {loading ? "로그인 중..." : "로그인"}
          </Button>
          <KakaoButton
            type="button"
            onClick={() => {
              if (!kakaoAuthUrl) return
              window.location.href = kakaoAuthUrl
            }}
          >
            카카오로 로그인
          </KakaoButton>
        </form>
        <FooterText>계정이 없으면 <Link href="/signup">회원가입</Link></FooterText>
      </Card>
    </Main>
  )
}

export default LoginPage

const Main = styled.main`
  min-height: 78vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background:
    radial-gradient(circle at 20% 20%, rgba(40, 130, 255, 0.1), transparent 40%),
    radial-gradient(circle at 80% 0%, rgba(22, 163, 74, 0.08), transparent 38%);
`

const Card = styled.section`
  width: 100%;
  max-width: 460px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 16px;
  padding: 1.3rem;
  background: ${({ theme }) => theme.colors.gray1};
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);

  form {
    display: grid;
    gap: 0.75rem;
  }
`

const Top = styled.div`
  margin-bottom: 0.9rem;
`

const Title = styled.h1`
  margin: 0;
  font-size: 1.45rem;
  letter-spacing: -0.01em;
`

const SubTitle = styled.p`
  margin: 0.45rem 0 0;
  color: ${({ theme }) => theme.colors.gray11};
  line-height: 1.5;
`

const Tabs = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.45rem;
  margin-bottom: 1rem;
`

const ActiveTab = styled.div`
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  background: ${({ theme }) => theme.colors.gray3};
  color: ${({ theme }) => theme.colors.gray12};
  padding: 0.48rem 0.7rem;
  text-align: center;
  font-weight: 600;
`

const PassiveTab = styled(Link)`
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0.48rem 0.7rem;
  text-align: center;
  text-decoration: none;
`

const Field = styled.div`
  display: grid;
  gap: 0.35rem;
`

const Label = styled.label`
  font-size: 0.88rem;
  color: ${({ theme }) => theme.colors.gray11};
`

const PasswordRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.45rem;
`

const Input = styled.input`
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  border-radius: 8px;
  padding: 0.62rem 0.7rem;
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue9};
  }
`

const Button = styled.button`
  border: 1px solid ${({ theme }) => theme.colors.blue9};
  border-radius: 8px;
  padding: 0.62rem 0.78rem;
  background: ${({ theme }) => theme.colors.blue9};
  color: #fff;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`

const GhostButton = styled.button`
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  border-radius: 8px;
  padding: 0.62rem 0.72rem;
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  cursor: pointer;
`

const KakaoButton = styled.button`
  border: 1px solid #e6c200;
  border-radius: 8px;
  padding: 0.62rem 0.78rem;
  background: #fee500;
  color: #2f1b00;
  cursor: pointer;
  font-weight: 600;
`

const ErrorText = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.red11};
  font-size: 0.92rem;
`

const FooterText = styled.p`
  margin: 0.95rem 0 0;
  color: ${({ theme }) => theme.colors.gray11};

  a {
    color: ${({ theme }) => theme.colors.blue10};
    text-decoration: underline;
    text-underline-offset: 2px;
  }
`
