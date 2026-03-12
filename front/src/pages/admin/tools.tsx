import styled from "@emotion/styled"
import { GetServerSideProps, NextPage } from "next"
import Link from "next/link"
import { useRouter } from "next/router"
import { useEffect, useState } from "react"
import { apiFetch } from "src/apis/backend/client"
import useAuthSession from "src/hooks/useAuthSession"
import { AdminPageProps, getAdminPageProps } from "src/libs/server/adminPage"

export const getServerSideProps: GetServerSideProps<AdminPageProps> = async ({ req }) => {
  return await getAdminPageProps(req)
}

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null

const pretty = (value: JsonValue) => JSON.stringify(value, null, 2)

type SignupMailDiagnostics = {
  status: string
  adapter: string
  host: string | null
  port: number | null
  mailFrom: string | null
  usernameConfigured: boolean
  passwordConfigured: boolean
  smtpAuth: boolean
  startTlsEnabled: boolean
  missing: string[]
  canConnect: boolean | null
  checkedAt: string
  verifyPath: string
}

type ApiRsData<T> = {
  resultCode: string
  msg: string
  data: T
}

const AdminToolsPage: NextPage<AdminPageProps> = ({ initialMember }) => {
  const router = useRouter()
  const { me, logout } = useAuthSession()
  const sessionMember = me ?? initialMember
  const [loadingKey, setLoadingKey] = useState("")
  const [result, setResult] = useState("")
  const [postId, setPostId] = useState("1")
  const [commentId, setCommentId] = useState("1")
  const [commentContent, setCommentContent] = useState("")
  const [mailDiagnostics, setMailDiagnostics] = useState<SignupMailDiagnostics | null>(null)
  const [mailDiagnosticsError, setMailDiagnosticsError] = useState("")
  const [testEmail, setTestEmail] = useState("")
  const [mailNotice, setMailNotice] = useState("")

  const run = async (key: string, fn: () => Promise<JsonValue>) => {
    try {
      setLoadingKey(key)
      const data = await fn()
      setResult(pretty(data))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setResult(pretty({ error: message }))
    } finally {
      setLoadingKey("")
    }
  }

  const fetchSignupMailDiagnostics = async (checkConnection = false) => {
    try {
      setLoadingKey(checkConnection ? "mailConnectivity" : "mailStatus")
      setMailDiagnosticsError("")
      setMailNotice("")
      const diagnostics = await apiFetch<SignupMailDiagnostics>(
        `/system/api/v1/adm/mail/signup${checkConnection ? "?checkConnection=true" : ""}`
      )
      setMailDiagnostics(diagnostics)
      setResult(pretty(diagnostics))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setMailDiagnosticsError(message)
      setResult(pretty({ error: message }))
    } finally {
      setLoadingKey("")
    }
  }

  const sendSignupTestMail = async () => {
    const email = testEmail.trim()
    if (!email) {
      setMailNotice("테스트 메일을 받을 이메일을 먼저 입력해주세요.")
      return
    }

    try {
      setLoadingKey("mailTest")
      setMailNotice("")
      const response = await apiFetch<ApiRsData<{ email: string }>>("/system/api/v1/adm/mail/signup/test", {
        method: "POST",
        body: JSON.stringify({ email }),
      })
      setMailNotice(`${response.data.email} 주소로 테스트 메일을 요청했습니다.`)
      setResult(pretty(response))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setMailNotice(message)
      setResult(pretty({ error: message }))
    } finally {
      setLoadingKey("")
    }
  }

  useEffect(() => {
    void fetchSignupMailDiagnostics(false)
  }, [])

  const handleLogout = async () => {
    try {
      setLoadingKey("logout")
      await logout()
    } finally {
      await router.replace(`/login?next=${encodeURIComponent("/admin/tools")}`)
      setLoadingKey("")
    }
  }

  if (!sessionMember) return null

  return (
    <Main>
      <HeaderCard>
        <div>
          <Eyebrow>Admin Tools</Eyebrow>
          <h1>운영 도구</h1>
          <p>댓글 CRUD 점검과 시스템 상태 확인을 글 작업실에서 분리했습니다.</p>
        </div>
        <HeaderActions>
          <Link href="/admin" passHref legacyBehavior>
            <NavLink>허브</NavLink>
          </Link>
          <Link href="/admin/posts/new" passHref legacyBehavior>
            <NavLink>글 작업실</NavLink>
          </Link>
          <PrimaryButton type="button" onClick={() => void handleLogout()} disabled={loadingKey === "logout"}>
            {loadingKey === "logout" ? "로그아웃 중..." : "로그아웃"}
          </PrimaryButton>
        </HeaderActions>
      </HeaderCard>

      <Grid>
        <SectionCard>
          <SectionTop>
            <div>
              <SectionEyebrow>Comment Studio</SectionEyebrow>
              <h2>댓글 테스트 도구</h2>
              <SectionDescription>댓글 조회, 작성, 수정, 삭제 동작을 빠르게 점검합니다.</SectionDescription>
            </div>
          </SectionTop>
          <FieldGrid>
            <FieldBox>
              <FieldLabel htmlFor="comment-post-id">post id</FieldLabel>
              <Input id="comment-post-id" value={postId} onChange={(e) => setPostId(e.target.value)} />
            </FieldBox>
            <FieldBox>
              <FieldLabel htmlFor="comment-id">comment id</FieldLabel>
              <Input id="comment-id" value={commentId} onChange={(e) => setCommentId(e.target.value)} />
            </FieldBox>
            <FieldBox className="wide">
              <FieldLabel htmlFor="comment-content">comment content</FieldLabel>
              <Input
                id="comment-content"
                value={commentContent}
                placeholder="댓글 내용을 입력하세요"
                onChange={(e) => setCommentContent(e.target.value)}
              />
            </FieldBox>
          </FieldGrid>
          <ActionRow>
            <Button type="button" disabled={!!loadingKey} onClick={() => void run("commentList", () => apiFetch(`/post/api/v1/posts/${postId}/comments`))}>
              댓글 목록
            </Button>
            <Button
              type="button"
              disabled={!!loadingKey}
              onClick={() => void run("commentOne", () => apiFetch(`/post/api/v1/posts/${postId}/comments/${commentId}`))}
            >
              댓글 단건
            </Button>
            <Button
              type="button"
              disabled={!!loadingKey}
              onClick={() =>
                void run("commentWrite", () =>
                  apiFetch(`/post/api/v1/posts/${postId}/comments`, {
                    method: "POST",
                    body: JSON.stringify({ content: commentContent }),
                  })
                )
              }
            >
              댓글 작성
            </Button>
            <Button
              type="button"
              disabled={!!loadingKey}
              onClick={() =>
                void run("commentModify", () =>
                  apiFetch(`/post/api/v1/posts/${postId}/comments/${commentId}`, {
                    method: "PUT",
                    body: JSON.stringify({ content: commentContent }),
                  })
                )
              }
            >
              댓글 수정
            </Button>
            <Button
              type="button"
              disabled={!!loadingKey}
              onClick={() =>
                void run("commentDelete", () =>
                  apiFetch(`/post/api/v1/posts/${postId}/comments/${commentId}`, {
                    method: "DELETE",
                  })
                )
              }
            >
              댓글 삭제
            </Button>
          </ActionRow>
        </SectionCard>

        <SectionCard>
          <SectionTop>
            <div>
              <SectionEyebrow>System Tools</SectionEyebrow>
              <h2>시스템 점검 도구</h2>
              <SectionDescription>자주 확인하는 관리자 API만 별도로 모았습니다.</SectionDescription>
            </div>
          </SectionTop>
          <ActionRow>
            <Button type="button" disabled={!!loadingKey} onClick={() => void run("admPostCount", () => apiFetch("/post/api/v1/adm/posts/count"))}>
              전체 글 개수 확인
            </Button>
            <Button type="button" disabled={!!loadingKey} onClick={() => void run("systemHealth", () => apiFetch("/system/api/v1/adm/health"))}>
              서버 상태 조회
            </Button>
          </ActionRow>
        </SectionCard>

        <SectionCard>
          <SectionTop>
            <div>
              <SectionEyebrow>Signup Mail</SectionEyebrow>
              <h2>회원가입 메일 진단</h2>
              <SectionDescription>SMTP 준비 상태를 보고, 테스트 메일을 바로 발송할 수 있습니다.</SectionDescription>
            </div>
            <StatusBadge data-status={mailDiagnostics?.status || "unknown"}>{mailDiagnostics?.status || "LOADING"}</StatusBadge>
          </SectionTop>

          <MetaGrid>
            <MetaBox>
              <small>메일 어댑터</small>
              <strong>{mailDiagnostics?.adapter || "-"}</strong>
            </MetaBox>
            <MetaBox>
              <small>SMTP 호스트</small>
              <strong>{mailDiagnostics?.host || "미설정"}</strong>
            </MetaBox>
            <MetaBox>
              <small>발신 주소</small>
              <strong>{mailDiagnostics?.mailFrom || "미설정"}</strong>
            </MetaBox>
            <MetaBox>
              <small>검증 경로</small>
              <strong>{mailDiagnostics?.verifyPath || "/signup/verify"}</strong>
            </MetaBox>
          </MetaGrid>

          {!!mailDiagnostics?.missing.length && (
            <InlineNotice data-tone="warning">
              누락된 설정: {mailDiagnostics.missing.join(", ")}
            </InlineNotice>
          )}
          {!!mailDiagnosticsError && <InlineNotice data-tone="danger">{mailDiagnosticsError}</InlineNotice>}
          {!!mailNotice && <InlineNotice data-tone="success">{mailNotice}</InlineNotice>}

          <ActionRow>
            <Button type="button" disabled={!!loadingKey} onClick={() => void fetchSignupMailDiagnostics(false)}>
              메일 준비 상태 새로고침
            </Button>
            <Button type="button" disabled={!!loadingKey} onClick={() => void fetchSignupMailDiagnostics(true)}>
              SMTP 연결 확인
            </Button>
          </ActionRow>

          <MailTestBox>
            <FieldBox className="wide">
              <FieldLabel htmlFor="signup-mail-test-email">테스트 메일 주소</FieldLabel>
              <Input
                id="signup-mail-test-email"
                type="email"
                value={testEmail}
                placeholder="메일 수신을 확인할 이메일을 입력하세요"
                onChange={(e) => setTestEmail(e.target.value)}
              />
            </FieldBox>
            <PrimaryButton type="button" disabled={!!loadingKey} onClick={() => void sendSignupTestMail()}>
              테스트 메일 발송
            </PrimaryButton>
          </MailTestBox>
        </SectionCard>
      </Grid>

      <ConsoleCard>
        <ConsoleHeader>
          <div>
            <SectionEyebrow>Console</SectionEyebrow>
            <h2>최근 API 응답</h2>
          </div>
          <span>{loadingKey ? `실행 중: ${loadingKey}` : `${sessionMember.username} 준비 완료`}</span>
        </ConsoleHeader>
        <ResultPanel>{result || "// API 응답 결과가 여기에 표시됩니다."}</ResultPanel>
      </ConsoleCard>
    </Main>
  )
}

export default AdminToolsPage

const Main = styled.main`
  max-width: 1120px;
  margin: 0 auto;
  padding: 2rem 1rem 3rem;
  display: grid;
  gap: 1rem;
`

const HeaderCard = styled.section`
  display: grid;
  gap: 0.9rem;
  padding: 1.2rem;
  border-radius: 24px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background:
    radial-gradient(circle at top left, rgba(37, 99, 235, 0.12), transparent 36%),
    linear-gradient(180deg, ${({ theme }) => theme.colors.gray2}, ${({ theme }) => theme.colors.gray1});

  h1 {
    margin: 0.1rem 0 0;
    font-size: clamp(1.9rem, 4vw, 2.5rem);
    letter-spacing: -0.05em;
  }

  p {
    margin: 0.45rem 0 0;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.7;
  }
`

const Eyebrow = styled.span`
  width: fit-content;
  border-radius: 999px;
  padding: 0.38rem 0.7rem;
  border: 1px solid ${({ theme }) => theme.colors.blue7};
  background: ${({ theme }) => theme.colors.blue3};
  color: ${({ theme }) => theme.colors.blue11};
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`

const HeaderActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
`

const BaseButton = styled.button`
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  padding: 0.72rem 1rem;
  font-size: 0.92rem;
  font-weight: 700;
  cursor: pointer;
`

const Button = styled(BaseButton)``

const PrimaryButton = styled(BaseButton)`
  border-color: ${({ theme }) => theme.colors.blue8};
  background: ${({ theme }) => theme.colors.blue9};
  color: white;
`

const NavLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  text-decoration: none;
  padding: 0.72rem 1rem;
  font-size: 0.92rem;
  font-weight: 700;
`

const Grid = styled.section`
  display: grid;
  gap: 1rem;
`

const SectionCard = styled.section`
  border-radius: 22px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  padding: 1.1rem;
`

const SectionTop = styled.div`
  margin-bottom: 0.9rem;
  display: flex;
  justify-content: space-between;
  gap: 0.9rem;
  align-items: flex-start;

  h2 {
    margin: 0;
    font-size: 1.2rem;
  }

  @media (max-width: 760px) {
    flex-direction: column;
  }
`

const SectionEyebrow = styled.span`
  width: fit-content;
  display: inline-flex;
  border-radius: 999px;
  padding: 0.32rem 0.62rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 0.55rem;
`

const SectionDescription = styled.p`
  margin: 0.35rem 0 0;
  color: ${({ theme }) => theme.colors.gray11};
  line-height: 1.7;
`

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;
  margin-bottom: 1rem;

  .wide {
    grid-column: 1 / -1;
  }

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`

const FieldBox = styled.label`
  display: grid;
  gap: 0.4rem;
`

const FieldLabel = styled.label`
  font-size: 0.82rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.gray11};
`

const Input = styled.input`
  width: 100%;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  padding: 0.9rem 1rem;
  font-size: 0.98rem;
`

const ActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
`

const MetaGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;
  margin-bottom: 1rem;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`

const MetaBox = styled.div`
  display: grid;
  gap: 0.25rem;
  padding: 0.9rem 1rem;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};

  small {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.76rem;
    font-weight: 700;
  }

  strong {
    font-size: 0.98rem;
    word-break: break-word;
  }
`

const StatusBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 92px;
  padding: 0.45rem 0.75rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 800;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};

  &[data-status="READY"],
  &[data-status="TEST_MODE"] {
    border-color: ${({ theme }) => theme.colors.green8};
    background: ${({ theme }) => theme.colors.green3};
    color: ${({ theme }) => theme.colors.green11};
  }

  &[data-status="MISCONFIGURED"],
  &[data-status="CONNECTION_FAILED"] {
    border-color: ${({ theme }) => theme.colors.red8};
    background: ${({ theme }) => theme.colors.red3};
    color: ${({ theme }) => theme.colors.red11};
  }
`

const InlineNotice = styled.p`
  margin: 0 0 0.9rem;
  padding: 0.85rem 1rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  line-height: 1.6;

  &[data-tone="warning"] {
    border-color: ${({ theme }) => theme.colors.indigo8};
    background: ${({ theme }) => theme.colors.indigo3};
    color: ${({ theme }) => theme.colors.indigo11};
  }

  &[data-tone="danger"] {
    border-color: ${({ theme }) => theme.colors.red8};
    background: ${({ theme }) => theme.colors.red3};
    color: ${({ theme }) => theme.colors.red11};
  }

  &[data-tone="success"] {
    border-color: ${({ theme }) => theme.colors.green8};
    background: ${({ theme }) => theme.colors.green3};
    color: ${({ theme }) => theme.colors.green11};
  }
`

const MailTestBox = styled.div`
  margin-top: 1rem;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.8rem;
  align-items: end;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`

const ConsoleCard = styled.section`
  border-radius: 22px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  padding: 1.1rem;
`

const ConsoleHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.75rem;

  h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.8rem;
  }
`

const ResultPanel = styled.pre`
  margin: 0;
  min-height: 220px;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  padding: 0.95rem;
  overflow: auto;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.84rem;
  line-height: 1.65;
`
