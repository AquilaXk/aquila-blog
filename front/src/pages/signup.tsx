import styled from "@emotion/styled"
import { GetServerSideProps } from "next"
import Link from "next/link"
import { useRouter } from "next/router"
import { FormEvent, useMemo, useState } from "react"
import { apiFetch } from "src/apis/backend/client"
import { toAuthErrorMessage } from "src/apis/backend/errorMessages"
import AuthShell from "src/components/auth/AuthShell"
import AppIcon from "src/components/icons/AppIcon"
import SocialAuthButtons from "src/components/auth/SocialAuthButtons"
import { buildSocialAuthItems } from "src/components/auth/socialAuth"
import { normalizeNextPath, toLoginPath, toSignupPath } from "src/libs/router"
import { GuestPageProps, getGuestPageProps } from "src/libs/server/guestPage"

type RsData<T> = {
  resultCode: string
  msg: string
  data: T
}

type SignupEmailStartResult = {
  email: string
}

export const getServerSideProps: GetServerSideProps<GuestPageProps> = async ({ req }) => {
  return await getGuestPageProps(req)
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
  const [emailFocused, setEmailFocused] = useState(false)

  const socialItems = useMemo(() => {
    return buildSocialAuthItems(next)
  }, [next])
  const emailActive = useMemo(() => emailFocused || email.length > 0, [email, emailFocused])

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
      subtitle="계정을 만들어 계속하세요."
      eyebrow="Account Setup"
      heroTitle="회원가입"
      heroDescription="이메일을 입력하고 가입을 진행하세요."
      footer={
        <FooterText>
          이미 계정이 있으면 <Link href={toLoginPath(next)}>로그인</Link>
        </FooterText>
      }
      loginHref={toLoginPath(next)}
      signupHref={toSignupPath(next)}
    >
      <form onSubmit={onSubmit}>
        <NaverField data-active={emailActive}>
          <NaverFieldLabel htmlFor="signup-email" data-active={emailActive ? "true" : "false"}>
            이메일
          </NaverFieldLabel>
          <NaverInput
            id="signup-email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onFocus={() => setEmailFocused(true)}
            onBlur={() => setEmailFocused(false)}
            placeholder=""
            autoComplete="email"
          />
          {email.length > 0 && (
            <GhostIconButton type="button" aria-label="아이디 입력 지우기" onClick={() => setEmail("")}>
              <AppIcon name="close" />
            </GhostIconButton>
          )}
        </NaverField>

        {error && <ErrorText>{error}</ErrorText>}
        {!error && sentEmail && (
          <SuccessText>
            <strong>{sentEmail}</strong>으로 회원가입 링크를 보냈습니다. 받은편지함에서 메일을 열고 계속 진행해주세요.
          </SuccessText>
        )}

        <PrimaryButton type="submit" disabled={loading}>
          {loading ? "메일 보내는 중..." : "인증 메일 보내기"}
        </PrimaryButton>

        <SocialSection>
          <span>소셜 계정으로 계속하기</span>
          <SocialButtonRow>
            <SocialAuthButtons items={socialItems} />
          </SocialButtonRow>
        </SocialSection>
      </form>
    </AuthShell>
  )
}

export default SignupPage

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
`

const GhostIconButton = styled.button`
  position: absolute;
  top: 50%;
  right: 0.5rem;
  transform: translateY(-50%);
  min-width: 30px;
  width: 30px;
  height: 30px;
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

  svg {
    font-size: 0.74rem;
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
  font-size: 0.9rem;
  line-height: 1.65;

  strong {
    word-break: break-all;
  }
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

const FooterText = styled.div`
  font-size: 0.9rem;

  a {
    display: inline-flex;
    align-items: center;
    min-height: 34px;
  }
`
