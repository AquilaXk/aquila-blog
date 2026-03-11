import styled from "@emotion/styled"
import { NextPage } from "next"
import { useRouter } from "next/router"
import { useEffect, useMemo, useRef, useState } from "react"
import { apiFetch, getApiBaseUrl } from "src/apis/backend/client"
import NotionRenderer from "src/routes/Detail/components/NotionRenderer"

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null

type MemberMe = {
  id: number
  username: string
  nickname: string
  isAdmin?: boolean
}

const pretty = (value: JsonValue) => JSON.stringify(value, null, 2)

const AdminPage: NextPage = () => {
  const router = useRouter()
  const [me, setMe] = useState<MemberMe | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
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
  const [isCalloutMenuOpen, setIsCalloutMenuOpen] = useState(false)
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

  useEffect(() => {
    let mounted = true
    const verifyAdmin = async () => {
      try {
        const member = await apiFetch<MemberMe>("/member/api/v1/auth/me")
        if (!mounted) return

        if (!member?.isAdmin) {
          await router.replace("/")
          return
        }

        setMe(member)
      } catch {
        if (!mounted) return
        await router.replace(`/login?next=${encodeURIComponent("/admin")}`)
        return
      } finally {
        if (mounted) setAuthLoading(false)
      }
    }

    void verifyAdmin()

    return () => {
      mounted = false
    }
  }, [router])

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

  const applyHeadingStyle = (level: 1 | 2 | 3 | 0) => {
    const textarea = postContentRef.current
    const prefix = level === 0 ? "" : `${"#".repeat(level)} `

    if (!textarea) {
      const fallback = level === 0 ? "본문 텍스트" : `${prefix}제목`
      setPostContent((prev) => `${prev}${prev.endsWith("\n") ? "" : "\n"}${fallback}\n`)
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const blockStart = postContent.lastIndexOf("\n", Math.max(0, start - 1)) + 1
    const nextNewline = postContent.indexOf("\n", end)
    const blockEnd = nextNewline === -1 ? postContent.length : nextNewline
    const selectedBlock = postContent.slice(blockStart, blockEnd)

    const nextBlock = selectedBlock
      .split("\n")
      .map((line) => {
        if (!line.trim()) return line
        const stripped = line.replace(/^#{1,3}\s+/, "")
        return prefix ? `${prefix}${stripped}` : stripped
      })
      .join("\n")

    const nextContent = `${postContent.slice(0, blockStart)}${nextBlock}${postContent.slice(blockEnd)}`
    setPostContent(nextContent)

    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(blockStart, blockStart + nextBlock.length)
    })
  }

  const insertToggle = () => {
    const textarea = postContentRef.current
    const defaultBody = "내용을 입력하세요."

    if (!textarea) {
      setPostContent(
        (prev) =>
          `${prev}${prev.endsWith("\n") ? "" : "\n"}:::toggle 토글 제목\n${defaultBody}\n:::\n`
      )
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = postContent.slice(start, end).trim()
    const body = selected || defaultBody
    const snippet = `:::toggle 토글 제목\n${body}\n:::\n`
    const nextContent = `${postContent.slice(0, start)}${snippet}${postContent.slice(end)}`
    setPostContent(nextContent)

    requestAnimationFrame(() => {
      textarea.focus()
      const titleStart = start + ":::toggle ".length
      textarea.setSelectionRange(titleStart, titleStart + "토글 제목".length)
    })
  }

  const wrapSelection = (prefix: string, suffix = "", placeholder = "텍스트") => {
    const textarea = postContentRef.current

    if (!textarea) {
      setPostContent((prev) => `${prev}${prev.endsWith("\n") ? "" : "\n"}${prefix}${placeholder}${suffix}`)
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = postContent.slice(start, end) || placeholder
    const inserted = `${prefix}${selected}${suffix}`
    const nextContent = `${postContent.slice(0, start)}${inserted}${postContent.slice(end)}`
    setPostContent(nextContent)

    requestAnimationFrame(() => {
      textarea.focus()
      if (start === end) {
        const selectionStart = start + prefix.length
        textarea.setSelectionRange(selectionStart, selectionStart + placeholder.length)
        return
      }
      textarea.setSelectionRange(start, start + inserted.length)
    })
  }

  const applyChecklist = () => {
    const textarea = postContentRef.current
    if (!textarea) {
      insertSnippet("- [ ] 체크 항목\n")
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const blockStart = postContent.lastIndexOf("\n", Math.max(0, start - 1)) + 1
    const nextNewline = postContent.indexOf("\n", end)
    const blockEnd = nextNewline === -1 ? postContent.length : nextNewline
    const selectedBlock = postContent.slice(blockStart, blockEnd)

    const nextBlock = selectedBlock
      .split("\n")
      .map((line) => {
        if (!line.trim()) return "- [ ] "
        if (line.startsWith("- [ ] ") || line.startsWith("- [x] ")) return line
        return `- [ ] ${line}`
      })
      .join("\n")

    const nextContent = `${postContent.slice(0, blockStart)}${nextBlock}${postContent.slice(blockEnd)}`
    setPostContent(nextContent)

    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(blockStart, blockStart + nextBlock.length)
    })
  }

  const insertDivider = () => {
    insertSnippet("\n---\n")
  }

  const insertLink = () => {
    const textarea = postContentRef.current
    if (!textarea) {
      insertSnippet("[링크 텍스트](https://example.com)")
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = postContent.slice(start, end) || "링크 텍스트"
    const url = "https://example.com"
    const snippet = `[${selected}](${url})`
    const nextContent = `${postContent.slice(0, start)}${snippet}${postContent.slice(end)}`
    setPostContent(nextContent)

    requestAnimationFrame(() => {
      textarea.focus()
      const urlStart = start + selected.length + 3
      textarea.setSelectionRange(urlStart, urlStart + url.length)
    })
  }

  const insertCallout = (
    kind: "TIP" | "INFO" | "WARNING" | "OUTLINE" | "EXAMPLE" | "SUMMARY",
    body: string
  ) => {
    insertSnippet(`> [!${kind}]\n> ${body}\n`)
    setIsCalloutMenuOpen(false)
  }

  if (authLoading || !me) {
    return <Main>관리자 인증 확인 중...</Main>
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

        <EditorSection>
          <WriterHeader>
            <div className="titleGroup">
              <label htmlFor="post-title">글 제목</label>
              <TitleInput
                id="post-title"
                placeholder="제목을 입력하세요"
                value={postTitle}
                onChange={(e) => setPostTitle(e.target.value)}
              />
            </div>
            <div className="actions">
              <CheckLabel>
                <input
                  type="checkbox"
                  checked={postPublished}
                  onChange={(e) => setPostPublished(e.target.checked)}
                />
                공개
              </CheckLabel>
              <CheckLabel>
                <input
                  type="checkbox"
                  checked={postListed}
                  onChange={(e) => setPostListed(e.target.checked)}
                />
                목록 노출
              </CheckLabel>
              <PrimaryButton
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
                글 발행
              </PrimaryButton>
            </div>
          </WriterHeader>

          <EditorToolbar>
            <Button type="button" onClick={() => applyHeadingStyle(1)}>
              제목1
            </Button>
            <Button type="button" onClick={() => applyHeadingStyle(2)}>
              제목2
            </Button>
            <Button type="button" onClick={() => applyHeadingStyle(3)}>
              제목3
            </Button>
            <Button type="button" onClick={() => applyHeadingStyle(0)}>
              텍스트
            </Button>
            <Button type="button" onClick={insertToggle}>
              토글
            </Button>
            <Button type="button" onClick={insertDivider}>
              구분선
            </Button>
            <Button type="button" onClick={applyChecklist}>
              체크리스트
            </Button>
            <Button type="button" onClick={() => wrapSelection("**", "**", "굵은 텍스트")}>
              굵게
            </Button>
            <Button type="button" onClick={() => wrapSelection("*", "*", "기울임 텍스트")}>
              기울임
            </Button>
            <Button type="button" onClick={() => wrapSelection("~~", "~~", "취소선 텍스트")}>
              취소선
            </Button>
            <Button type="button" onClick={() => wrapSelection("`", "`", "코드")}>
              인라인코드
            </Button>
            <Button type="button" onClick={insertLink}>
              링크
            </Button>
            <CalloutDropdown>
              <Button type="button" onClick={() => setIsCalloutMenuOpen((prev) => !prev)}>
                콜아웃 ▾
              </Button>
              {isCalloutMenuOpen && (
                <CalloutMenu>
                  <button type="button" onClick={() => insertCallout("TIP", "핵심 팁을 작성하세요.")}>
                    TIP
                  </button>
                  <button type="button" onClick={() => insertCallout("INFO", "참고 정보를 작성하세요.")}>
                    INFO
                  </button>
                  <button
                    type="button"
                    onClick={() => insertCallout("WARNING", "주의해야 할 내용을 작성하세요.")}
                  >
                    WARNING
                  </button>
                  <button
                    type="button"
                    onClick={() => insertCallout("OUTLINE", "모범 개요를 작성하세요.")}
                  >
                    OUTLINE
                  </button>
                  <button
                    type="button"
                    onClick={() => insertCallout("EXAMPLE", "예시 답안을 작성하세요.")}
                  >
                    EXAMPLE
                  </button>
                  <button
                    type="button"
                    onClick={() => insertCallout("SUMMARY", "핵심 개념을 정리하세요.")}
                  >
                    SUMMARY
                  </button>
                </CalloutMenu>
              )}
            </CalloutDropdown>
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
          </EditorToolbar>
          <EditorGrid>
            <EditorPane>
              <PaneTitle>Markdown 입력</PaneTitle>
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
  padding: 1.1rem;
  margin-bottom: 1rem;
  background: ${({ theme }) => theme.colors.gray1};

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
  padding: 0.5rem 0.65rem;
  min-width: 120px;
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
`

const TitleInput = styled(Input)`
  width: 100%;
  min-width: 260px;
  font-size: 1rem;
  border-radius: 10px;
  padding: 0.68rem 0.78rem;
`

const Button = styled.button`
  border: 1px solid ${({ theme }) => theme.colors.gray8};
  border-radius: 999px;
  padding: 0.42rem 0.72rem;
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  cursor: pointer;
  font-size: 0.8rem;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

const PrimaryButton = styled(Button)`
  border-radius: 10px;
  padding: 0.6rem 0.88rem;
  border-color: ${({ theme }) => theme.colors.blue9};
  background: ${({ theme }) => theme.colors.blue9};
  color: #fff;
  font-weight: 700;
`

const CheckLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.9rem;
`

const EditorSection = styled.div`
  margin: 0.85rem 0 0.25rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 14px;
  padding: 0.85rem;
  background: ${({ theme }) => theme.colors.gray2};
`

const WriterHeader = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: end;
  margin-bottom: 0.7rem;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }

  .titleGroup {
    display: grid;
    gap: 0.35rem;
  }

  .titleGroup label {
    font-size: 0.82rem;
    color: ${({ theme }) => theme.colors.gray11};
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
`

const EditorToolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.65rem;
  border-bottom: 1px dashed ${({ theme }) => theme.colors.gray7};
`

const CalloutDropdown = styled.div`
  position: relative;
`

const CalloutMenu = styled.div`
  position: absolute;
  z-index: 20;
  top: calc(100% + 0.35rem);
  left: 0;
  min-width: 10rem;
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.gray1};
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
  padding: 0.3rem;
  display: grid;
  gap: 0.25rem;

  button {
    border: 1px solid transparent;
    border-radius: 8px;
    padding: 0.4rem 0.55rem;
    text-align: left;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray12};
    cursor: pointer;
    font-size: 0.82rem;

    &:hover {
      background: ${({ theme }) => theme.colors.gray3};
      border-color: ${({ theme }) => theme.colors.gray6};
    }
  }
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
  margin: 0 0 0.45rem;
  font-size: 0.92rem;
  color: ${({ theme }) => theme.colors.gray12};
`

const ContentInput = styled.textarea`
  width: 100%;
  min-height: 420px;
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  border-radius: 10px;
  padding: 0.82rem;
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  line-height: 1.6;
  resize: vertical;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.04);
`

const PreviewCard = styled.div`
  min-height: 420px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  padding: 0 1rem 0.9rem;
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
