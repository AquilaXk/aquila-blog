import styled from "@emotion/styled"
import Link from "next/link"
import { useRouter } from "next/router"
import { FormEvent, useState } from "react"
import { apiFetch } from "src/apis/backend/client"

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
    <Main>
      <Card>
        <Top>
          <Title>회원가입</Title>
          <SubTitle>계정을 만든 뒤 로그인하면 댓글 기능과 관리 기능 접근이 가능합니다.</SubTitle>
        </Top>

        <Tabs>
          <PassiveTab href="/login">로그인</PassiveTab>
          <ActiveTab>회원가입</ActiveTab>
        </Tabs>

        <form onSubmit={onSubmit}>
          <Field>
            <Label htmlFor="username">아이디</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="2~30자 아이디"
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
                placeholder="영문 대/소문자+숫자+특수문자 포함 8~64자"
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
          </Field>

          <Field>
            <Label htmlFor="nickname">닉네임</Label>
            <Input
              id="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="표시할 닉네임"
              autoComplete="nickname"
            />
          </Field>
          <HintText>비밀번호 규칙: 영문 대문자/소문자/숫자/특수문자 포함, 8~64자</HintText>

          {error && <ErrorText>{error}</ErrorText>}
          <Button type="submit" disabled={loading}>
            {loading ? "가입 중..." : "회원가입"}
          </Button>
        </form>
        <FooterText>이미 계정이 있으면 <Link href="/login">로그인</Link></FooterText>
      </Card>
    </Main>
  )
}

export default SignupPage

const Main = styled.main`
  min-height: 78vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background:
    radial-gradient(circle at 12% 18%, rgba(40, 130, 255, 0.1), transparent 38%),
    radial-gradient(circle at 84% 2%, rgba(22, 163, 74, 0.08), transparent 40%);
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

const ErrorText = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.red11};
  font-size: 0.92rem;
`

const HintText = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.85rem;
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
