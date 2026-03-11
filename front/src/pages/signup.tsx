import styled from "@emotion/styled"
import Link from "next/link"
import { useRouter } from "next/router"
import { FormEvent, useState } from "react"
import { apiFetch } from "src/apis/backend/client"
import AuthShell from "src/components/auth/AuthShell"

type RsData<T> = {
  resultCode: string
  msg: string
  data: T
}

const SignupPage = () => {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [passwordConfirm, setPasswordConfirm] = useState("")
  const [nickname, setNickname] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const passwordRule = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,64}$/

  const passwordChecks = [
    { label: "8~64자", ok: password.length >= 8 && password.length <= 64 },
    { label: "대문자", ok: /[A-Z]/.test(password) },
    { label: "소문자", ok: /[a-z]/.test(password) },
    { label: "숫자", ok: /\d/.test(password) },
    { label: "특수문자", ok: /[^A-Za-z0-9]/.test(password) },
  ]

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!username.trim() || !password.trim() || !passwordConfirm.trim() || !nickname.trim()) {
      setError("아이디, 비밀번호, 비밀번호 확인, 닉네임을 모두 입력해주세요.")
      return
    }

    if (!passwordRule.test(password)) {
      setError("비밀번호는 8~64자이며 영문 대문자/소문자/숫자/특수문자를 모두 포함해야 합니다.")
      return
    }

    if (password !== passwordConfirm) {
      setError("비밀번호와 비밀번호 확인이 일치하지 않습니다.")
      return
    }

    setLoading(true)
    setError("")

    try {
      await apiFetch<RsData<unknown>>("/member/api/v1/members", {
        method: "POST",
        body: JSON.stringify({ username, password, nickname }),
      })
      await router.push("/login")
    } catch (error) {
      if (error instanceof Error) {
        const message = error.message.split(": ").slice(1).join(": ").trim()
        setError(message || "회원가입에 실패했습니다.")
      } else {
        setError("회원가입에 실패했습니다.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      activeTab="signup"
      title="회원가입"
      subtitle="새 계정을 등록합니다."
      eyebrow="Account Setup"
      heroTitle="회원가입"
      heroDescription="아이디, 비밀번호, 닉네임을 입력해 계정을 만듭니다."
      footer={
        <FooterText>
          이미 계정이 있으면 <Link href="/login">로그인</Link>
        </FooterText>
      }
    >
      <form onSubmit={onSubmit}>
        <Field>
          <FieldTop>
            <Label htmlFor="username">아이디</Label>
            <FieldHint>로그인 식별자</FieldHint>
          </FieldTop>
          <Input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="2~30자 아이디"
            autoComplete="username"
          />
        </Field>

        <Field>
          <FieldTop>
            <Label htmlFor="password">비밀번호</Label>
            <FieldHint>규칙을 만족해야 합니다.</FieldHint>
          </FieldTop>
          <PasswordRow>
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="안전한 비밀번호를 입력하세요"
              autoComplete="new-password"
            />
            <GhostButton
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label="비밀번호 표시 전환"
            >
              {showPassword ? "숨기기" : "표시"}
            </GhostButton>
          </PasswordRow>
          <RuleList>
            {passwordChecks.map((rule) => (
              <li key={rule.label} data-ok={rule.ok}>
                {rule.label}
              </li>
            ))}
          </RuleList>
        </Field>

        <Field>
          <FieldTop>
            <Label htmlFor="password-confirm">비밀번호 확인</Label>
            <FieldHint>같은 값 다시 입력</FieldHint>
          </FieldTop>
          <PasswordRow>
            <Input
              id="password-confirm"
              type={showPassword ? "text" : "password"}
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              placeholder="비밀번호를 다시 입력하세요"
              autoComplete="new-password"
            />
            <GhostButton
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label="비밀번호 표시 전환"
            >
              {showPassword ? "숨기기" : "표시"}
            </GhostButton>
          </PasswordRow>
          <ConfirmStatus data-ok={passwordConfirm.length > 0 && password === passwordConfirm}>
            {passwordConfirm.length === 0
              ? "비밀번호 확인을 입력하면 일치 여부를 바로 보여줍니다."
              : password === passwordConfirm
                ? "비밀번호가 일치합니다."
                : "비밀번호가 일치하지 않습니다."}
          </ConfirmStatus>
        </Field>

        <Field>
          <FieldTop>
            <Label htmlFor="nickname">닉네임</Label>
            <FieldHint>화면 표시 이름</FieldHint>
          </FieldTop>
          <Input
            id="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="표시할 닉네임"
            autoComplete="nickname"
          />
        </Field>

        {error ? <ErrorText>{error}</ErrorText> : <InfoText>가입이 완료되면 로그인 페이지로 이동합니다.</InfoText>}

        <PrimaryButton type="submit" disabled={loading}>
          {loading ? "가입 중..." : "회원가입"}
        </PrimaryButton>
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

const GhostButton = styled.button`
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  border-radius: 14px;
  padding: 0.82rem 0.9rem;
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  cursor: pointer;
  white-space: nowrap;
`

const RuleList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;

  li {
    border-radius: 999px;
    padding: 0.34rem 0.62rem;
    font-size: 0.78rem;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray11};
  }

  li[data-ok="true"] {
    border-color: ${({ theme }) => theme.colors.green7};
    background: ${({ theme }) => theme.colors.green3};
    color: ${({ theme }) => theme.colors.green11};
  }
`

const ConfirmStatus = styled.p`
  margin: 0;
  font-size: 0.8rem;
  color: ${({ theme }) => theme.colors.gray11};

  &[data-ok="true"] {
    color: ${({ theme }) => theme.colors.green11};
  }

  &[data-ok="false"] {
    color: ${({ theme }) => theme.colors.red11};
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
