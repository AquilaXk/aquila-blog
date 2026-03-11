import styled from "@emotion/styled"
import Link from "next/link"
import { useRouter } from "next/router"
import { FormEvent, useMemo, useState } from "react"
import { apiFetch, getApiBaseUrl } from "src/apis/backend/client"
import AuthShell from "src/components/auth/AuthShell"
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
    <AuthShell
      activeTab="login"
      title="로그인"
      subtitle="작성된 글을 관리하거나 댓글 기능을 쓰려면 계정 인증이 필요합니다."
      eyebrow="Access Portal"
      heroTitle="블로그 운영 화면으로 들어가는 가장 짧은 경로"
      heroDescription="관리자 도구, 댓글 기능, 개인 세션은 모두 동일한 인증 흐름을 사용합니다. 로그인 후에는 현재 페이지로 바로 되돌아갑니다."
      statItems={[
        { label: "Redirect", value: next },
        { label: "Session", value: "쿠키 기반 유지" },
        { label: "OAuth", value: "Kakao 지원" },
      ]}
      tips={[
        "관리자 권한은 별도 계정 플래그로 제어됩니다. 일반 계정으로 로그인해도 어드민 화면은 열리지 않습니다.",
        "카카오 로그인은 동일한 세션 쿠키를 사용하므로 브라우저에서 바로 관리자/댓글 기능과 연결됩니다.",
        "로그인 실패 시 서버 메시지를 그대로 보여주므로 아이디 오타나 비밀번호 규칙 문제를 빠르게 확인할 수 있습니다.",
      ]}
      footer={
        <FooterText>
          계정이 없으면 <Link href="/signup">회원가입</Link>
        </FooterText>
      }
    >
      <form onSubmit={onSubmit}>
        <Field>
          <FieldTop>
            <Label htmlFor="username">아이디</Label>
            <FieldHint>관리자 계정도 동일한 아이디 필드를 사용합니다.</FieldHint>
          </FieldTop>
          <Input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="아이디를 입력하세요"
            autoComplete="username"
          />
        </Field>

        <Field>
          <FieldTop>
            <Label htmlFor="password">비밀번호</Label>
            <FieldHint>브라우저 자동완성을 켜두면 다음 로그인도 더 빠릅니다.</FieldHint>
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

        {error ? <ErrorText>{error}</ErrorText> : <InfoText>로그인 후 이전에 보던 화면으로 바로 이동합니다.</InfoText>}

        <PrimaryButton type="submit" disabled={loading}>
          {loading ? "로그인 중..." : "로그인"}
        </PrimaryButton>
        <KakaoButton
          type="button"
          disabled={!kakaoAuthUrl}
          onClick={() => {
            if (!kakaoAuthUrl) return
            window.location.href = kakaoAuthUrl
          }}
        >
          카카오로 계속하기
        </KakaoButton>
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
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  border-radius: 14px;
  padding: 0.82rem 0.88rem;
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: 0 0 0 4px ${({ theme }) => theme.colors.blue4};
    transform: translateY(-1px);
  }
`

const PrimaryButton = styled.button`
  border: 1px solid ${({ theme }) => theme.colors.blue9};
  border-radius: 14px;
  padding: 0.9rem 1rem;
  background: linear-gradient(135deg, ${({ theme }) => theme.colors.blue9}, #2563eb);
  color: #fff;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`

const GhostButton = styled.button`
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  border-radius: 14px;
  padding: 0.82rem 0.9rem;
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  cursor: pointer;
  white-space: nowrap;
`

const KakaoButton = styled.button`
  border: 1px solid #e6c200;
  border-radius: 14px;
  padding: 0.9rem 1rem;
  background: linear-gradient(135deg, #fee500, #facc15);
  color: #241b00;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`

const ErrorText = styled.p`
  margin: 0;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.red7};
  background: ${({ theme }) => theme.colors.red3};
  color: ${({ theme }) => theme.colors.red11};
  padding: 0.82rem 0.9rem;
  font-size: 0.9rem;
  line-height: 1.55;
`

const InfoText = styled.p`
  margin: 0;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0.82rem 0.9rem;
  font-size: 0.87rem;
  line-height: 1.55;
`

const FooterText = styled.p`
  margin: 0;
`
