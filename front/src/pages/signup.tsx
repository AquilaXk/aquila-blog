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
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!username.trim() || !password.trim() || !nickname.trim()) {
      setError("아이디, 비밀번호, 닉네임을 모두 입력해주세요.")
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
    } catch {
      setError("회원가입에 실패했습니다.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Main>
      <Card>
        <h1>회원가입</h1>
        <form onSubmit={onSubmit}>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="아이디"
            autoComplete="username"
          />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            autoComplete="new-password"
          />
          <Input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="닉네임"
            autoComplete="nickname"
          />
          {error && <ErrorText>{error}</ErrorText>}
          <Button type="submit" disabled={loading}>
            회원가입
          </Button>
        </form>
        <FooterText>
          이미 계정이 있으면 <Link href="/login">로그인</Link>
        </FooterText>
      </Card>
    </Main>
  )
}

export default SignupPage

const Main = styled.main`
  min-height: 70vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
`

const Card = styled.section`
  width: 100%;
  max-width: 420px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 12px;
  padding: 1.2rem;

  h1 {
    margin: 0 0 0.9rem;
    font-size: 1.3rem;
  }

  form {
    display: grid;
    gap: 0.6rem;
  }
`

const Input = styled.input`
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  border-radius: 8px;
  padding: 0.55rem 0.65rem;
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
`

const Button = styled.button`
  border: 1px solid ${({ theme }) => theme.colors.gray8};
  border-radius: 8px;
  padding: 0.55rem 0.75rem;
  background: ${({ theme }) => theme.colors.gray3};
  color: ${({ theme }) => theme.colors.gray12};
  cursor: pointer;
`

const ErrorText = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.red10};
`

const FooterText = styled.p`
  margin: 0.8rem 0 0;
  color: ${({ theme }) => theme.colors.gray11};
`
