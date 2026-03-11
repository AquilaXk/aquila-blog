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

    if (!username.trim() || !password.trim() || !nickname.trim()) {
      setError("아이디, 비밀번호, 닉네임을 모두 입력해주세요.")
      return
    }

    if (!passwordRule.test(password)) {
      setError("비밀번호는 8~64자이며 영문 대문자/소문자/숫자/특수문자를 모두 포함해야 합니다.")
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
      subtitle="기본 계정을 만든 뒤 로그인하면 댓글과 개인 기능을 바로 사용할 수 있습니다."
      eyebrow="Account Setup"
      heroTitle="처음 한 번만 정리하면 이후 운영이 훨씬 편해집니다"
      heroDescription="아이디와 닉네임은 블로그 내 식별과 표시 이름에 사용됩니다. 비밀번호는 일반 서비스 수준으로 강하게 잡아두는 편이 운영상 안전합니다."
      statItems={[
        { label: "Username", value: "로그인 식별자" },
        { label: "Nickname", value: "화면 표시 이름" },
        { label: "Password", value: "강한 규칙 필수" },
      ]}
      tips={[
        "관리자 권한은 회원가입만으로 부여되지 않습니다. 별도 설정된 관리자 계정만 어드민 기능을 사용할 수 있습니다.",
        "닉네임은 댓글과 일부 화면 노출에 사용되므로, 운영용 계정이라면 식별하기 쉬운 이름으로 두는 편이 좋습니다.",
        "가입 후 바로 로그인 화면으로 이동하므로, 동일한 비밀번호를 다시 입력할 준비만 되어 있으면 됩니다.",
      ]}
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
            <FieldHint>로그인에 사용하는 고정 식별자입니다.</FieldHint>
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
            <FieldHint>영문 대/소문자, 숫자, 특수문자를 모두 포함해야 합니다.</FieldHint>
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
            <Label htmlFor="nickname">닉네임</Label>
            <FieldHint>댓글과 일부 화면에서 노출되는 이름입니다.</FieldHint>
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
