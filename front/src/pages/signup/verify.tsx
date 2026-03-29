import styled from "@emotion/styled"
import { GetServerSideProps } from "next"
import Link from "next/link"
import { useRouter } from "next/router"
import { FormEvent, useEffect, useMemo, useState } from "react"
import { apiFetch } from "src/apis/backend/client"
import { toAuthErrorMessage } from "src/apis/backend/errorMessages"
import AuthShell from "src/components/auth/AuthShell"
import AppIcon from "src/components/icons/AppIcon"
import { normalizeNextPath, replaceRoute, toLoginPath, toSignupPath } from "src/libs/router"
import { GuestPageProps, getGuestPageProps } from "src/libs/server/guestPage"
import { evaluatePasswordPolicy } from "src/libs/validation/auth"

type RsData<T> = {
  resultCode: string
  msg: string
  data: T
}

type SignupVerifyResult = {
  email: string
  signupToken: string
  expiresAt: string
}

export const getServerSideProps: GetServerSideProps<GuestPageProps> = async ({ req }) => {
  return await getGuestPageProps(req)
}

const SignupVerifyPage = () => {
  const router = useRouter()
  const [verification, setVerification] = useState<SignupVerifyResult | null>(null)
  const [loadingVerification, setLoadingVerification] = useState(true)
  const [verificationError, setVerificationError] = useState("")
  const [password, setPassword] = useState("")
  const [passwordConfirm, setPasswordConfirm] = useState("")
  const [nickname, setNickname] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [submitLoading, setSubmitLoading] = useState(false)

  const token = useMemo(() => {
    const raw = router.query.token
    return Array.isArray(raw) ? raw[0] : raw
  }, [router.query.token])
  const next = useMemo(() => {
    return normalizeNextPath(router.query.next)
  }, [router.query.next])

  useEffect(() => {
    if (!router.isReady) return

    if (!token) {
      setVerificationError("회원가입 링크가 올바르지 않습니다.")
      setLoadingVerification(false)
      return
    }

    let cancelled = false

    const fetchVerification = async () => {
      setLoadingVerification(true)
      setVerificationError("")

      try {
        const response = await apiFetch<RsData<SignupVerifyResult>>(
          `/member/api/v1/signup/email/verify?token=${encodeURIComponent(token)}`
        )

        if (cancelled) return
        setVerification(response.data)
      } catch (error) {
        if (cancelled) return
        setVerificationError(toAuthErrorMessage("signupVerify", error, "회원가입 링크를 확인하지 못했습니다."))
      } finally {
        if (!cancelled) setLoadingVerification(false)
      }
    }

    void fetchVerification()

    return () => {
      cancelled = true
    }
  }, [router.isReady, token])

  const passwordPolicy = useMemo(() => evaluatePasswordPolicy(password), [password])
  const hasPasswordInput = password.length > 0
  const hasPasswordConfirmInput = passwordConfirm.length > 0
  const passwordMatched = hasPasswordInput && hasPasswordConfirmInput && password === passwordConfirm
  const passwordMismatch = hasPasswordConfirmInput && password !== passwordConfirm
  const submitFeedbackMessage = submitError ? (
    <ErrorText>{submitError}</ErrorText>
  ) : (
    <InfoText>가입이 끝나면 로그인 화면으로 이동합니다. 이후부터는 이메일과 비밀번호로 로그인하면 됩니다.</InfoText>
  )

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!verification?.signupToken) {
      setSubmitError("회원가입 세션이 준비되지 않았습니다.")
      return
    }

    if (!password.trim() || !passwordConfirm.trim() || !nickname.trim()) {
      setSubmitError("비밀번호, 비밀번호 확인, 닉네임을 모두 입력해주세요.")
      return
    }

    if (!passwordPolicy.valid) {
      setSubmitError("비밀번호는 8~64자이며 영문 대문자/소문자/숫자/특수문자를 모두 포함해야 합니다.")
      return
    }

    if (password !== passwordConfirm) {
      setSubmitError("비밀번호와 비밀번호 확인이 일치하지 않습니다.")
      return
    }

    setSubmitLoading(true)
    setSubmitError("")

    try {
      await apiFetch<RsData<unknown>>("/member/api/v1/signup/complete", {
        method: "POST",
        body: JSON.stringify({
          signupToken: verification.signupToken,
          password,
          nickname: nickname.trim(),
        }),
      })

      await replaceRoute(
        router,
        `/login?signup=done&email=${encodeURIComponent(verification.email)}&next=${encodeURIComponent(next)}`
      )
    } catch (error) {
      setSubmitError(toAuthErrorMessage("signupComplete", error, "회원가입에 실패했습니다."))
    } finally {
      setSubmitLoading(false)
    }
  }

  return (
    <AuthShell
      activeTab="signup"
      title="회원가입"
      subtitle="이메일 확인이 끝났습니다. 이제 기본 계정 정보를 등록해주세요."
      eyebrow="Verified Email"
      heroTitle="환영합니다!"
      heroDescription="이메일은 확인 완료 상태로 잠겨 있습니다. 이제 닉네임과 비밀번호를 설정하면 됩니다."
      footer={
        <FooterText>
          다시 시작하려면 <Link href={toSignupPath(next)}>회원가입 처음으로</Link>
        </FooterText>
      }
      loginHref={toLoginPath(next)}
      signupHref={toSignupPath(next)}
    >
      {loadingVerification ? (
        <InfoText>회원가입 링크를 확인하고 있습니다...</InfoText>
      ) : verificationError ? (
        <ErrorText>{verificationError}</ErrorText>
      ) : verification ? (
        <form onSubmit={onSubmit}>
          <Field>
            <FieldTop>
              <Label htmlFor="verified-email">이메일</Label>
              <FieldHint>인증 완료</FieldHint>
            </FieldTop>
            <ReadOnlyField id="verified-email">{verification.email}</ReadOnlyField>
          </Field>

          <Field>
            <FieldTop>
              <Label htmlFor="signup-nickname">프로필 이름</Label>
              <FieldHint>댓글과 화면에 보일 이름</FieldHint>
            </FieldTop>
            <Input
              id="signup-nickname"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="프로필 이름을 입력하세요."
              autoComplete="nickname"
            />
          </Field>

          <Field>
            <FieldTop>
              <Label htmlFor="signup-password">비밀번호</Label>
              <FieldHint>안전한 비밀번호 규칙 적용</FieldHint>
            </FieldTop>
            <PasswordRow>
              <Input
                id="signup-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="비밀번호를 입력하세요."
                autoComplete="new-password"
              />
              <GhostButton type="button" onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? "숨기기" : "표시"}
              </GhostButton>
            </PasswordRow>
          </Field>

          <Field>
            <FieldTop>
              <Label htmlFor="signup-password-confirm">비밀번호 확인</Label>
              <FieldHint>같은 비밀번호 다시 입력</FieldHint>
            </FieldTop>
            <PasswordRow>
              <Input
                id="signup-password-confirm"
                type={showPassword ? "text" : "password"}
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                placeholder="비밀번호를 다시 입력하세요."
                autoComplete="new-password"
              />
              <GhostButton type="button" onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? "숨기기" : "표시"}
              </GhostButton>
            </PasswordRow>
            <ConfirmStatus data-state={passwordMatched ? "ok" : passwordMismatch ? "fail" : "idle"}>
              <AppIcon
                name={passwordMatched ? "check-circle" : passwordMismatch ? "close" : "question"}
                aria-hidden="true"
              />
              <span>
                {passwordMatched
                  ? "비밀번호가 일치합니다."
                  : passwordMismatch
                    ? "비밀번호가 일치하지 않습니다."
                    : "비밀번호 확인을 입력하면 일치 여부를 바로 표시합니다."}
              </span>
            </ConfirmStatus>
          </Field>

          <PasswordPolicyCard>
            <strong>비밀번호 규칙</strong>
            <PasswordPolicyList>
              <PasswordPolicyItem data-ok={passwordPolicy.length}>
                <AppIcon name={passwordPolicy.length ? "check-circle" : "close"} aria-hidden="true" />
                <span>8~64자 길이</span>
              </PasswordPolicyItem>
              <PasswordPolicyItem data-ok={passwordPolicy.lowercase}>
                <AppIcon name={passwordPolicy.lowercase ? "check-circle" : "close"} aria-hidden="true" />
                <span>영문 소문자 포함</span>
              </PasswordPolicyItem>
              <PasswordPolicyItem data-ok={passwordPolicy.uppercase}>
                <AppIcon name={passwordPolicy.uppercase ? "check-circle" : "close"} aria-hidden="true" />
                <span>영문 대문자 포함</span>
              </PasswordPolicyItem>
              <PasswordPolicyItem data-ok={passwordPolicy.digit}>
                <AppIcon name={passwordPolicy.digit ? "check-circle" : "close"} aria-hidden="true" />
                <span>숫자 포함</span>
              </PasswordPolicyItem>
              <PasswordPolicyItem data-ok={passwordPolicy.special}>
                <AppIcon name={passwordPolicy.special ? "check-circle" : "close"} aria-hidden="true" />
                <span>특수문자 포함</span>
              </PasswordPolicyItem>
            </PasswordPolicyList>
          </PasswordPolicyCard>

          <FeedbackSlot aria-live="polite">{submitFeedbackMessage}</FeedbackSlot>

          <ActionRow>
            <CancelLink href={toSignupPath(next)}>취소</CancelLink>
            <PrimaryButton type="submit" disabled={submitLoading}>
              {submitLoading ? "가입 중..." : "가입"}
            </PrimaryButton>
          </ActionRow>
        </form>
      ) : null}
    </AuthShell>
  )
}

export default SignupVerifyPage

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

const ReadOnlyField = styled.div`
  width: 100%;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 14px;
  padding: 0.82rem 0.88rem;
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray11};
  word-break: break-all;
`

const PasswordRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.5rem;
`

const ConfirmStatus = styled.div`
  display: flex;
  align-items: center;
  gap: 0.36rem;
  font-size: 0.82rem;
  color: ${({ theme }) => theme.colors.gray11};

  svg {
    font-size: 0.94rem;
  }

  &[data-state="ok"] {
    color: ${({ theme }) => theme.colors.green10};
  }

  &[data-state="fail"] {
    color: ${({ theme }) => theme.colors.red10};
  }
`

const PasswordPolicyCard = styled.div`
  display: grid;
  gap: 0.52rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 14px;
  background: ${({ theme }) => theme.colors.gray2};
  padding: 0.72rem 0.84rem;

  strong {
    font-size: 0.84rem;
    color: ${({ theme }) => theme.colors.gray12};
  }
`

const PasswordPolicyList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.34rem;
`

const PasswordPolicyItem = styled.li`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: ${({ theme }) => theme.colors.gray11};

  svg {
    font-size: 0.92rem;
  }

  &[data-ok="true"] {
    color: ${({ theme }) => theme.colors.green10};
  }

  &[data-ok="false"] {
    color: ${({ theme }) => theme.colors.gray10};
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

const PrimaryButton = styled.button`
  min-width: 140px;
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

const CancelLink = styled(Link)`
  min-width: 120px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 14px;
  padding: 0.9rem 1rem;
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray11};
  text-decoration: none;
  font-weight: 700;
`

const ActionRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.8rem;

  @media (max-width: 640px) {
    display: grid;
    grid-template-columns: 1fr;
  }
`

const FeedbackSlot = styled.div`
  min-height: 4.8rem;
  display: flex;
  align-items: stretch;

  > * {
    width: 100%;
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
  line-height: 1.65;
`

const FooterText = styled.div`
  font-size: 0.9rem;
`
