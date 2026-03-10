import styled from "@emotion/styled"
import Link from "next/link"
import { useRouter } from "next/router"
import { FormEvent, useMemo, useState } from "react"
import { apiFetch } from "src/apis/backend/client"

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
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

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
      await router.push(next)
    } catch {
      setError("로그인에 실패했습니다.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Main>
      <Card>
        <h1>로그인</h1>
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
            autoComplete="current-password"
          />
          {error && <ErrorText>{error}</ErrorText>}
          <Button type="submit" disabled={loading}>
            로그인
          </Button>
        </form>
        <FooterText>
          계정이 없으면 <Link href="/signup">회원가입</Link>
        </FooterText>
      </Card>
    </Main>
  )
}

export default LoginPage

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
