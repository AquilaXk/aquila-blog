import styled from "@emotion/styled"
import Link from "next/link"
import { useRouter } from "next/router"
import { FormEvent, useMemo, useState } from "react"
import { RiKakaoTalkFill } from "react-icons/ri"
import { apiFetch, getApiBaseUrl } from "src/apis/backend/client"
import AuthShell from "src/components/auth/AuthShell"

type RsData<T> = {
  resultCode: string
  msg: string
  data: T
}

type SignupEmailStartResult = {
  email: string
}

const SignupPage = () => {
  const router = useRouter()
  const next = useMemo(() => {
    const raw = router.query.next
    const value = Array.isArray(raw) ? raw[0] : raw
    if (!value || !value.startsWith("/")) return "/"
    return value
  }, [router.query.next])

  const [email, setEmail] = useState("")
  const [sentEmail, setSentEmail] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const kakaoAuthUrl = useMemo(() => {
    if (typeof window === "undefined") return ""
    const redirectUrl = `${window.location.origin}${next}`
    return `${getApiBaseUrl()}/oauth2/authorization/kakao?redirectUrl=${encodeURIComponent(redirectUrl)}`
  }, [next])

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!email.trim()) {
      setError("이메일을 입력해주세요.")
      return
    }

    setLoading(true)
    setError("")

    try {
      const response = await apiFetch<RsData<SignupEmailStartResult>>("/member/api/v1/signup/email/start", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          nextPath: next,
        }),
      })
      setSentEmail(response.data.email)
    } catch (signupError) {
      if (signupError instanceof Error) {
        const message = signupError.message.split(": ").slice(1).join(": ").trim()
        setError(message || "회원가입 메일 전송에 실패했습니다.")
      } else {
        setError("회원가입 메일 전송에 실패했습니다.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      activeTab="signup"
      title="회원가입"
      subtitle="이메일 인증 후 아이디와 비밀번호를 등록합니다."
      eyebrow="Account Setup"
      heroTitle="회원가입"
      heroDescription="먼저 이메일을 확인한 뒤, 메일 안의 링크를 통해 마지막 가입 단계로 이어집니다."
      footer={
        <FooterText>
          이미 계정이 있으면 <Link href={`/login?next=${encodeURIComponent(next)}`}>로그인</Link>
        </FooterText>
      }
      loginHref={`/login?next=${encodeURIComponent(next)}`}
      signupHref={`/signup?next=${encodeURIComponent(next)}`}
    >
      <form onSubmit={onSubmit}>
        <Field>
          <FieldTop>
            <Label htmlFor="signup-email">이메일</Label>
            <FieldHint>메일로 가입 링크를 보냅니다.</FieldHint>
          </FieldTop>
          <Input
            id="signup-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="이메일을 입력하세요"
            autoComplete="email"
          />
        </Field>

        {error && <ErrorText>{error}</ErrorText>}
        {!error && sentEmail && (
          <SuccessText>
            <strong>{sentEmail}</strong>으로 회원가입 링크를 보냈습니다. 받은편지함에서 메일을 열고 계속 진행해주세요.
          </SuccessText>
        )}
        {!error && !sentEmail && <InfoText>메일 링크를 통해 이메일이 확인된 뒤에만 최종 회원가입 폼으로 이동합니다.</InfoText>}

        <PrimaryButton type="submit" disabled={loading}>
          {loading ? "메일 보내는 중..." : "인증 메일 보내기"}
        </PrimaryButton>

        <SocialSection>
          <span>소셜 계정으로 계속하기</span>
          <SocialButtonRow>
            <SocialIconButton
              type="button"
              disabled={!kakaoAuthUrl}
              onClick={() => {
                if (!kakaoAuthUrl) return
                window.location.href = kakaoAuthUrl
              }}
              aria-label="카카오로 로그인"
              title="카카오로 로그인"
            >
              <RiKakaoTalkFill aria-hidden="true" />
            </SocialIconButton>
          </SocialButtonRow>
        </SocialSection>
      </form>
    </AuthShell>
  )
}

export default SignupPage

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
  border: 1px solid ${({ theme }) => theme.colors.green8};
  border-radius: 14px;
  padding: 0.9rem 1rem;
  background: linear-gradient(135deg, #10b981, #34d399);
  color: #fff;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
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

const SuccessText = styled.p`
  margin: 0;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.green7};
  background: ${({ theme }) => theme.colors.green3};
  color: ${({ theme }) => theme.colors.green11};
  padding: 0.82rem 0.9rem;
  font-size: 0.9rem;
  line-height: 1.65;

  strong {
    word-break: break-all;
  }
`

const InfoText = styled.p`
  margin: 0;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0.82rem 0.9rem;
  font-size: 0.87rem;
`

const SocialSection = styled.div`
  display: grid;
  gap: 0.6rem;
  margin-top: 0.2rem;

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.82rem;
    font-weight: 700;
  }
`

const SocialButtonRow = styled.div`
  display: flex;
  gap: 1rem;
`

const SocialIconButton = styled.button`
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
`

const FooterText = styled.div`
  font-size: 0.9rem;
`
