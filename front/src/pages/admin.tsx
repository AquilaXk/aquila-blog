import styled from "@emotion/styled"
import { GetServerSideProps, NextPage } from "next"
import { useMemo, useRef, useState } from "react"
import { apiFetch, getApiBaseUrl } from "src/apis/backend/client"
import NotionRenderer, {
  markdownGuide,
} from "src/routes/Detail/components/NotionRenderer"

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null

type MemberMe = {
  id: number
  username: string
  nickname: string
  isAdmin?: boolean
}

type Props = {
  me: MemberMe
}

const pretty = (value: JsonValue) => JSON.stringify(value, null, 2)

const getServerApiBaseUrl = () => {
  const serverUrl = process.env.BACKEND_INTERNAL_URL
  const publicUrl = process.env.NEXT_PUBLIC_BACKEND_URL
  const stripTrailingSlash = (value: string) => value.replace(/\/+$/, "")

  if (serverUrl) return stripTrailingSlash(serverUrl)
  if (publicUrl) return stripTrailingSlash(publicUrl)

  return "http://localhost:8080"
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const cookie = context.req.headers.cookie || ""
  const meRes = await fetch(`${getServerApiBaseUrl()}/member/api/v1/auth/me`, {
    headers: { cookie },
  }).catch(() => null)

  if (!meRes?.ok) {
    return {
      redirect: {
        destination: `/login?next=${encodeURIComponent("/admin")}`,
        permanent: false,
      },
    }
  }

  const me = (await meRes.json().catch(() => null)) as MemberMe | null
  if (!me?.isAdmin) return { notFound: true }

  return { props: { me } }
}

const AdminPage: NextPage<Props> = ({ me }) => {
  const [result, setResult] = useState<string>("")
  const [loadingKey, setLoadingKey] = useState<string>("")
  const [memberId, setMemberId] = useState("1")

  const [postId, setPostId] = useState("1")
  const [commentId, setCommentId] = useState("1")
  const [commentContent, setCommentContent] = useState("")
  const [postTitle, setPostTitle] = useState("")
  const [postContent, setPostContent] = useState("")
  const [postPublished, setPostPublished] = useState(false)
  const [postListed, setPostListed] = useState(false)
  const postContentRef = useRef<HTMLTextAreaElement>(null)

  const [listPage, setListPage] = useState("1")
  const [listPageSize, setListPageSize] = useState("30")
  const [listKw, setListKw] = useState("")
  const [listSort, setListSort] = useState("CREATED_AT")

  const [profileImgMemberId, setProfileImgMemberId] = useState("1")
  const profileImgUrl = useMemo(
    () =>
      `${getApiBaseUrl()}/member/api/v1/members/${profileImgMemberId}/redirectToProfileImg`,
    [profileImgMemberId]
  )

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

  const disabled = (key: string) => loadingKey.length > 0 && loadingKey !== key

  const insertSnippet = (snippet: string) => {
    const textarea = postContentRef.current
    if (!textarea) {
      setPostContent((prev) => `${prev}${prev.endsWith("\n") ? "" : "\n"}${snippet}`)
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const nextContent = `${postContent.slice(0, start)}${snippet}${postContent.slice(end)}`
    setPostContent(nextContent)

    requestAnimationFrame(() => {
      textarea.focus()
      const cursor = start + snippet.length
      textarea.setSelectionRange(cursor, cursor)
    })
  }

  return (
    <Main>
      <h1>Admin Tools</h1>
      <p>
        {me.nickname}({me.username}) 계정으로 관리자 인증됨.
      </p>

      <Section>
        <h2>Auth</h2>
        <Row>
          <Button
            disabled={disabled("me")}
            onClick={() => run("me", () => apiFetch("/member/api/v1/auth/me"))}
          >
            내 정보
          </Button>
          <Button
            disabled={disabled("logout")}
            onClick={() =>
              run("logout", () => apiFetch("/member/api/v1/auth/logout", { method: "DELETE" }))
            }
          >
            로그아웃
          </Button>
        </Row>
      </Section>

      <Section>
        <h2>Member</h2>
        <Row>
          <Button
            disabled={disabled("secureTip")}
            onClick={() =>
              run("secureTip", () =>
                apiFetch("/member/api/v1/members/randomSecureTip").then((tip) => ({ tip }))
              )
            }
          >
            랜덤 보안 팁
          </Button>
          <Input
            placeholder="member id"
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
          />
          <Button
            disabled={disabled("admMemberOne")}
            onClick={() => run("admMemberOne", () => apiFetch(`/member/api/v1/adm/members/${memberId}`))}
          >
            관리자 회원 단건
          </Button>
          <Input
            placeholder="profile member id"
            value={profileImgMemberId}
            onChange={(e) => setProfileImgMemberId(e.target.value)}
          />
          <a href={profileImgUrl} target="_blank" rel="noreferrer">
            프로필 이미지 리다이렉트 열기
          </a>
        </Row>
        <Row>
          <Button
            disabled={disabled("admMemberList")}
            onClick={() =>
              run("admMemberList", () =>
                apiFetch(
                  `/member/api/v1/adm/members?page=${listPage}&pageSize=${listPageSize}&kw=${encodeURIComponent(
                    listKw
                  )}&sort=${encodeURIComponent(listSort)}`
                )
              )
            }
          >
            관리자 회원 목록
          </Button>
        </Row>
      </Section>

      <Section id="post-write">
        <h2>Post</h2>
        <Row>
          <Input placeholder="page" value={listPage} onChange={(e) => setListPage(e.target.value)} />
          <Input
            placeholder="pageSize (1~30)"
            value={listPageSize}
            onChange={(e) => setListPageSize(e.target.value)}
          />
          <Input placeholder="kw" value={listKw} onChange={(e) => setListKw(e.target.value)} />
          <Input placeholder="sort" value={listSort} onChange={(e) => setListSort(e.target.value)} />
          <Button
            disabled={disabled("postList")}
            onClick={() =>
              run("postList", () =>
                apiFetch(
                  `/post/api/v1/posts?page=${listPage}&pageSize=${listPageSize}&kw=${encodeURIComponent(
                    listKw
                  )}&sort=${encodeURIComponent(listSort)}`
                )
              )
            }
          >
            글 목록
          </Button>
          <Button
            disabled={disabled("postMine")}
            onClick={() =>
              run("postMine", () =>
                apiFetch(
                  `/post/api/v1/posts/mine?page=${listPage}&pageSize=${listPageSize}&kw=${encodeURIComponent(
                    listKw
                  )}&sort=${encodeURIComponent(listSort)}`
                )
              )
            }
          >
            내 글 목록
          </Button>
          <Button
            disabled={disabled("postTemp")}
            onClick={() => run("postTemp", () => apiFetch("/post/api/v1/posts/temp", { method: "POST" }))}
          >
            임시글 가져오기/생성
          </Button>
        </Row>

        <Row>
          <Input
            placeholder="title"
            value={postTitle}
            onChange={(e) => setPostTitle(e.target.value)}
          />
          <CheckLabel>
            <input
              type="checkbox"
              checked={postPublished}
              onChange={(e) => setPostPublished(e.target.checked)}
            />
            published
          </CheckLabel>
          <CheckLabel>
            <input
              type="checkbox"
              checked={postListed}
              onChange={(e) => setPostListed(e.target.checked)}
            />
            listed
          </CheckLabel>
          <Button
            disabled={disabled("writePost")}
            onClick={() =>
              run("writePost", () =>
                apiFetch("/post/api/v1/posts", {
                  method: "POST",
                  body: JSON.stringify({
                    title: postTitle,
                    content: postContent,
                    published: postPublished,
                    listed: postListed,
                  }),
                })
              )
            }
          >
            글 작성
          </Button>
        </Row>

        <EditorSection>
          <EditorToolbar>
            <Button
              type="button"
              onClick={() =>
                insertSnippet(
                  "```ts\nconst message = \"Hello, Aquila\";\nconsole.log(message);\n```\n"
                )
              }
            >
              코드블럭
            </Button>
            <Button
              type="button"
              onClick={() =>
                insertSnippet(
                  "```mermaid\ngraph TD\n  A[사용자 요청] --> B{검증}\n  B -->|OK| C[처리]\n  B -->|Fail| D[오류 반환]\n```\n"
                )
              }
            >
              머메이드
            </Button>
            <Button
              type="button"
              onClick={() =>
                insertSnippet(
                  "| 구분 | 내용 |\n| --- | --- |\n| API | /post/api/v1/posts |\n| 상태 | 운영중 |\n"
                )
              }
            >
              테이블
            </Button>
            <Button
              type="button"
              onClick={() =>
                insertSnippet(
                  "> [!TIP]\n> 여기에 핵심 팁을 작성하세요.\n>\n> - 체크리스트\n> - 주의사항\n"
                )
              }
            >
              콜아웃
            </Button>
          </EditorToolbar>
          <EditorGrid>
            <EditorPane>
              <PaneTitle>Markdown 입력</PaneTitle>
              <EditorHint>{markdownGuide}</EditorHint>
              <ContentInput
                ref={postContentRef}
                placeholder="Markdown으로 본문을 작성하세요."
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
              />
            </EditorPane>
            <PreviewPane>
              <PaneTitle>실시간 미리보기</PaneTitle>
              <PreviewCard>
                <NotionRenderer content={postContent} />
              </PreviewCard>
            </PreviewPane>
          </EditorGrid>
        </EditorSection>

        <Row>
          <Input placeholder="post id" value={postId} onChange={(e) => setPostId(e.target.value)} />
          <Button
            disabled={disabled("postOne")}
            onClick={() => run("postOne", () => apiFetch(`/post/api/v1/posts/${postId}`))}
          >
            글 단건
          </Button>
          <Button
            disabled={disabled("modifyPost")}
            onClick={() =>
              run("modifyPost", () =>
                apiFetch(`/post/api/v1/posts/${postId}`, {
                  method: "PUT",
                  body: JSON.stringify({
                    title: postTitle,
                    content: postContent,
                    published: postPublished,
                    listed: postListed,
                  }),
                })
              )
            }
          >
            글 수정
          </Button>
          <Button
            disabled={disabled("deletePost")}
            onClick={() =>
              run("deletePost", () => apiFetch(`/post/api/v1/posts/${postId}`, { method: "DELETE" }))
            }
          >
            글 삭제
          </Button>
          <Button
            disabled={disabled("hitPost")}
            onClick={() =>
              run("hitPost", () => apiFetch(`/post/api/v1/posts/${postId}/hit`, { method: "POST" }))
            }
          >
            조회수 +1
          </Button>
          <Button
            disabled={disabled("likePost")}
            onClick={() =>
              run("likePost", () => apiFetch(`/post/api/v1/posts/${postId}/like`, { method: "POST" }))
            }
          >
            좋아요 토글
          </Button>
        </Row>
      </Section>

      <Section>
        <h2>Comments</h2>
        <Row>
          <Input placeholder="post id" value={postId} onChange={(e) => setPostId(e.target.value)} />
          <Input
            placeholder="comment id"
            value={commentId}
            onChange={(e) => setCommentId(e.target.value)}
          />
          <Input
            placeholder="comment content"
            value={commentContent}
            onChange={(e) => setCommentContent(e.target.value)}
          />
          <Button
            disabled={disabled("commentList")}
            onClick={() => run("commentList", () => apiFetch(`/post/api/v1/posts/${postId}/comments`))}
          >
            댓글 목록
          </Button>
          <Button
            disabled={disabled("commentOne")}
            onClick={() =>
              run("commentOne", () => apiFetch(`/post/api/v1/posts/${postId}/comments/${commentId}`))
            }
          >
            댓글 단건
          </Button>
          <Button
            disabled={disabled("commentWrite")}
            onClick={() =>
              run("commentWrite", () =>
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
            disabled={disabled("commentModify")}
            onClick={() =>
              run("commentModify", () =>
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
            disabled={disabled("commentDelete")}
            onClick={() =>
              run("commentDelete", () =>
                apiFetch(`/post/api/v1/posts/${postId}/comments/${commentId}`, {
                  method: "DELETE",
                })
              )
            }
          >
            댓글 삭제
          </Button>
        </Row>
      </Section>

      <Section>
        <h2>Admin Post</h2>
        <Row>
          <Button
            disabled={disabled("admPostCount")}
            onClick={() => run("admPostCount", () => apiFetch("/post/api/v1/adm/posts/count"))}
          >
            전체 글 개수 + 보안팁
          </Button>
        </Row>
      </Section>

      <ResultPanel>{result || "// API 응답 결과가 여기에 표시됩니다."}</ResultPanel>
    </Main>
  )
}

export default AdminPage

const Main = styled.main`
  max-width: 1080px;
  margin: 0 auto;
  padding: 2rem 1rem 3rem;

  h1 {
    margin: 0 0 0.75rem;
    font-size: 1.8rem;
  }

  p {
    margin: 0 0 1.5rem;
    color: ${({ theme }) => theme.colors.gray11};
  }
`

const Section = styled.section`
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 12px;
  padding: 1rem;
  margin-bottom: 1rem;

  h2 {
    margin: 0 0 0.75rem;
    font-size: 1.05rem;
  }
`

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.5rem;

  a {
    color: ${({ theme }) => theme.colors.blue10};
    text-decoration: underline;
    text-underline-offset: 2px;
  }
`

const Input = styled.input`
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  border-radius: 8px;
  padding: 0.45rem 0.6rem;
  min-width: 120px;
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
`

const Button = styled.button`
  border: 1px solid ${({ theme }) => theme.colors.gray8};
  border-radius: 8px;
  padding: 0.45rem 0.7rem;
  background: ${({ theme }) => theme.colors.gray3};
  color: ${({ theme }) => theme.colors.gray12};
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

const CheckLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.9rem;
`

const EditorSection = styled.div`
  margin: 0.75rem 0 0.25rem;
`

const EditorToolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.65rem;
`

const EditorGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`

const EditorPane = styled.section`
  min-width: 0;
`

const PreviewPane = styled(EditorPane)``

const PaneTitle = styled.h3`
  margin: 0 0 0.4rem;
  font-size: 0.96rem;
  color: ${({ theme }) => theme.colors.gray12};
`

const EditorHint = styled.pre`
  margin: 0 0 0.45rem;
  padding: 0.6rem;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.78rem;
  line-height: 1.45;
  white-space: pre-wrap;
`

const ContentInput = styled.textarea`
  width: 100%;
  min-height: 420px;
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  border-radius: 10px;
  padding: 0.75rem;
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  line-height: 1.6;
  resize: vertical;
`

const PreviewCard = styled.div`
  min-height: 420px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  padding: 0 0.85rem 0.85rem;
`

const ResultPanel = styled.pre`
  margin: 1rem 0 0;
  padding: 1rem;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.82rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 160px;
`
