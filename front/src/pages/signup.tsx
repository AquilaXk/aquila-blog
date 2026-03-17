import styled from "@emotion/styled"
import Link from "next/link"
import { useRouter } from "next/router"
import { FormEvent, useMemo, useState } from "react"
import { apiFetch, getApiBaseUrl } from "src/apis/backend/client"
import { toAuthErrorMessage } from "src/apis/backend/errorMessages"
import AuthShell from "src/components/auth/AuthShell"
import AppIcon from "src/components/icons/AppIcon"
import { normalizeNextPath, toLoginPath, toSignupPath } from "src/libs/router"

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
    return normalizeNextPath(router.query.next)
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
      setError(toAuthErrorMessage("signupStart", signupError, "회원가입 메일 전송에 실패했습니다."))
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
          이미 계정이 있으면 <Link href={toLoginPath(next)}>로그인</Link>
        </FooterText>
      }
      loginHref={toLoginPath(next)}
      signupHref={toSignupPath(next)}
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
              <AppIcon name="kakao" aria-hidden="true" />
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
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 12px;
  padding: 0.78rem 0.84rem;
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.blue4};
  }
`

const PrimaryButton = styled.button`
  border: 1px solid ${({ theme }) => theme.colors.blue8};
  border-radius: 12px;
  padding: 0.84rem 1rem;
  background: linear-gradient(135deg, #2563eb, #3b82f6);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  transition: filter 0.16s ease;

  &:hover:not(:disabled) {
    filter: brightness(1.06);
  }

  &:disabled {
    filter: saturate(0.6) brightness(0.92);
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
  font-size: 0.9rem;
  line-height: 1.65;

  strong {
    word-break: break-all;
  }
`

const InfoText = styled.p`
  margin: 0;
  border-radius: 12px;
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
  width: 58px;
  height: 58px;
  min-height: 58px;
  border-radius: 50%;
  border: 1px solid rgba(230, 194, 0, 0.62);
  background: #fee500;
  color: #241b00;
  box-shadow: none;

  svg {
    font-size: 1.6rem;
  }
`

const FooterText = styled.div`
  font-size: 0.9rem;

  a {
    display: inline-flex;
    align-items: center;
    min-height: 34px;
  }
`
