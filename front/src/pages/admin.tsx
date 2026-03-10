import styled from "@emotion/styled"
import { FormEvent, useMemo, useState } from "react"
import { apiFetch, getApiBaseUrl } from "src/apis/backend/client"

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null

const pretty = (value: JsonValue) => JSON.stringify(value, null, 2)

const AdminPage = () => {
  const [result, setResult] = useState<string>("")
  const [loadingKey, setLoadingKey] = useState<string>("")

  const [loginUsername, setLoginUsername] = useState("")
  const [loginPassword, setLoginPassword] = useState("")
  const [joinUsername, setJoinUsername] = useState("")
  const [joinPassword, setJoinPassword] = useState("")
  const [joinNickname, setJoinNickname] = useState("")
  const [memberId, setMemberId] = useState("1")

  const [postId, setPostId] = useState("1")
  const [commentId, setCommentId] = useState("1")
  const [commentContent, setCommentContent] = useState("")
  const [postTitle, setPostTitle] = useState("")
  const [postContent, setPostContent] = useState("")
  const [postPublished, setPostPublished] = useState(false)
  const [postListed, setPostListed] = useState(false)

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

  const request = <T,>(path: string, init?: RequestInit): Promise<T> => apiFetch<T>(path, init)

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

  const onJoin = async (e: FormEvent) => {
    e.preventDefault()
    await run("join", () =>
      request("/member/api/v1/members", {
        method: "POST",
        body: JSON.stringify({
          username: joinUsername,
          password: joinPassword,
          nickname: joinNickname,
        }),
      })
    )
  }

  const onWritePost = async (e: FormEvent) => {
    e.preventDefault()
    await run("writePost", () =>
      request("/post/api/v1/posts", {
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

  const onModifyPost = async (e: FormEvent) => {
    e.preventDefault()
    await run("modifyPost", () =>
      request(`/post/api/v1/posts/${postId}`, {
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

  return (
    <Main>
      <h1>Backend Admin Tools</h1>
      <p>
        백엔드 API 전 기능을 브라우저 UI에서 호출할 수 있는 운영 페이지입니다. 결과는
        하단 JSON 패널에서 확인하세요.
      </p>

      <Section>
        <h2>Auth</h2>
        <Row>
          <Input
            placeholder="username"
            value={loginUsername}
            onChange={(e) => setLoginUsername(e.target.value)}
          />
          <Input
            placeholder="password"
            type="password"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
          />
          <Button
            disabled={disabled("login")}
            onClick={() =>
              run("login", () =>
                request("/member/api/v1/auth/login", {
                  method: "POST",
                  body: JSON.stringify({
                    username: loginUsername,
                    password: loginPassword,
                  }),
                })
              )
            }
          >
            로그인
          </Button>
          <Button
            disabled={disabled("logout")}
            onClick={() => run("logout", () => request("/member/api/v1/auth/logout", { method: "DELETE" }))}
          >
            로그아웃
          </Button>
          <Button disabled={disabled("me")} onClick={() => run("me", () => request("/member/api/v1/auth/me"))}>
            내 정보
          </Button>
        </Row>
      </Section>

      <Section>
        <h2>Member</h2>
        <form onSubmit={onJoin}>
          <Row>
            <Input
              placeholder="join username"
              value={joinUsername}
              onChange={(e) => setJoinUsername(e.target.value)}
            />
            <Input
              placeholder="join password"
              type="password"
              value={joinPassword}
              onChange={(e) => setJoinPassword(e.target.value)}
            />
            <Input
              placeholder="nickname"
              value={joinNickname}
              onChange={(e) => setJoinNickname(e.target.value)}
            />
            <Button type="submit" disabled={disabled("join")}>
              회원가입
            </Button>
          </Row>
        </form>
        <Row>
          <Button
            disabled={disabled("secureTip")}
            onClick={() =>
              run("secureTip", () =>
                request("/member/api/v1/members/randomSecureTip").then((tip) => ({ tip }))
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
            onClick={() => run("admMemberOne", () => request(`/member/api/v1/adm/members/${memberId}`))}
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
                request(
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

      <Section>
        <h2>System</h2>
        <Row>
          <a href={getApiBaseUrl()} target="_blank" rel="noreferrer">
            API 서버 루트 열기
          </a>
          <Button
            disabled={disabled("session")}
            onClick={() => run("session", () => request("/session"))}
          >
            세션 확인
          </Button>
        </Row>
      </Section>

      <Section>
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
                request(
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
                request(
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
            onClick={() => run("postTemp", () => request("/post/api/v1/posts/temp", { method: "POST" }))}
          >
            임시글 가져오기/생성
          </Button>
        </Row>

        <form onSubmit={onWritePost}>
          <Row>
            <Input
              placeholder="title"
              value={postTitle}
              onChange={(e) => setPostTitle(e.target.value)}
            />
            <LongInput
              placeholder="content"
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
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
            <Button type="submit" disabled={disabled("writePost")}>
              글 작성
            </Button>
          </Row>
        </form>

        <form onSubmit={onModifyPost}>
          <Row>
            <Input placeholder="post id" value={postId} onChange={(e) => setPostId(e.target.value)} />
            <Button
              type="button"
              disabled={disabled("postOne")}
              onClick={() => run("postOne", () => request(`/post/api/v1/posts/${postId}`))}
            >
              글 단건
            </Button>
            <Button type="submit" disabled={disabled("modifyPost")}>
              글 수정
            </Button>
            <Button
              type="button"
              disabled={disabled("deletePost")}
              onClick={() =>
                run("deletePost", () => request(`/post/api/v1/posts/${postId}`, { method: "DELETE" }))
              }
            >
              글 삭제
            </Button>
            <Button
              type="button"
              disabled={disabled("hitPost")}
              onClick={() =>
                run("hitPost", () => request(`/post/api/v1/posts/${postId}/hit`, { method: "POST" }))
              }
            >
              조회수 +1
            </Button>
            <Button
              type="button"
              disabled={disabled("likePost")}
              onClick={() =>
                run("likePost", () => request(`/post/api/v1/posts/${postId}/like`, { method: "POST" }))
              }
            >
              좋아요 토글
            </Button>
          </Row>
        </form>
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
            onClick={() =>
              run("commentList", () => request(`/post/api/v1/posts/${postId}/comments`))
            }
          >
            댓글 목록
          </Button>
          <Button
            disabled={disabled("commentOne")}
            onClick={() =>
              run("commentOne", () =>
                request(`/post/api/v1/posts/${postId}/comments/${commentId}`)
              )
            }
          >
            댓글 단건
          </Button>
          <Button
            disabled={disabled("commentWrite")}
            onClick={() =>
              run("commentWrite", () =>
                request(`/post/api/v1/posts/${postId}/comments`, {
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
                request(`/post/api/v1/posts/${postId}/comments/${commentId}`, {
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
                request(`/post/api/v1/posts/${postId}/comments/${commentId}`, {
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
            onClick={() => run("admPostCount", () => request("/post/api/v1/adm/posts/count"))}
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

  form + form {
    margin-top: 0.75rem;
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

const LongInput = styled(Input)`
  min-width: 320px;
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
