import styled from "@emotion/styled"
import { NextPage } from "next"
import { useRouter } from "next/router"
import { ClipboardEvent, useEffect, useRef, useState } from "react"
import { apiFetch } from "src/apis/backend/client"
import NotionRenderer from "src/routes/Detail/components/NotionRenderer"

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null

type MemberMe = {
  id: number
  username: string
  nickname: string
  isAdmin?: boolean
}

const pretty = (value: JsonValue) => JSON.stringify(value, null, 2)

const escapePipes = (value: string) => value.replace(/\|/g, "\\|")

const nodeText = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || ""
  if (node.nodeType !== Node.ELEMENT_NODE) return ""
  const el = node as HTMLElement
  return Array.from(el.childNodes).map(nodeText).join("")
}

const inlineToMarkdown = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || ""
  if (node.nodeType !== Node.ELEMENT_NODE) return ""

  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()
  const inner = Array.from(el.childNodes).map(inlineToMarkdown).join("")

  if (tag === "strong" || tag === "b") return `**${inner}**`
  if (tag === "em" || tag === "i") return `*${inner}*`
  if (tag === "s" || tag === "del" || tag === "strike") return `~~${inner}~~`
  if (tag === "code" && el.parentElement?.tagName.toLowerCase() !== "pre") return `\`${inner}\``
  if (tag === "a") {
    const href = el.getAttribute("href") || ""
    if (!href) return inner
    return `[${inner || href}](${href})`
  }
  if (tag === "br") return "\n"

  return inner
}

const blockquoteToMarkdown = (el: HTMLElement): string => {
  const content = Array.from(el.childNodes).map(inlineToMarkdown).join("").trim()
  if (!content) return ""
  return content
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n")
}

const listToMarkdown = (el: HTMLElement, ordered: boolean): string => {
  const items = Array.from(el.children).filter(
    (child): child is HTMLLIElement => child.tagName.toLowerCase() === "li"
  )

  return items
    .map((li, idx) => {
      const checkbox = li.querySelector<HTMLInputElement>("input[type='checkbox']")
      const hasCheckbox = !!checkbox
      const checked = checkbox?.checked
      const marker = ordered ? `${idx + 1}.` : hasCheckbox ? (checked ? "- [x]" : "- [ ]") : "-"
      if (checkbox) checkbox.remove()

      const content = Array.from(li.childNodes).map(inlineToMarkdown).join("").trim() || "내용"
      return `${marker} ${content}`
    })
    .join("\n")
}

const tableToMarkdown = (el: HTMLTableElement): string => {
  const rows = Array.from(el.querySelectorAll("tr"))
  if (!rows.length) return ""

  const matrix = rows.map((row) =>
    Array.from(row.querySelectorAll("th,td")).map((cell) =>
      escapePipes(Array.from(cell.childNodes).map(inlineToMarkdown).join("").replace(/\n+/g, " ").trim())
    )
  )

  const maxCols = Math.max(...matrix.map((row) => row.length))
  const normalized = matrix.map((row) => {
    const copy = [...row]
    while (copy.length < maxCols) copy.push("")
    return copy
  })

  const head = normalized[0]
  const separator = Array.from({ length: maxCols }, () => "---")
  const body = normalized.slice(1)

  return [
    `| ${head.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n")
}

const preToMarkdown = (el: HTMLElement): string => {
  const codeEl = el.querySelector("code")
  const codeText = (codeEl?.textContent || el.textContent || "").trimEnd()
  const className = codeEl?.className || ""
  const lang = (className.match(/language-([a-zA-Z0-9_-]+)/)?.[1] || "").trim()
  return `\`\`\`${lang}\n${codeText}\n\`\`\``
}

const detailsToMarkdown = (el: HTMLElement): string => {
  const summary = el.querySelector("summary")
  const title = summary?.textContent?.trim() || "토글 제목"

  const contentNodes = Array.from(el.childNodes).filter((node) => node !== summary)
  const body = contentNodes
    .map((node) => (node.nodeType === Node.ELEMENT_NODE ? blockToMarkdown(node as HTMLElement) : inlineToMarkdown(node)))
    .join("\n")
    .trim() || "내용을 입력하세요."

  return `:::toggle ${title}\n${body}\n:::`
}

const blockToMarkdown = (el: HTMLElement): string => {
  const tag = el.tagName.toLowerCase()

  if (tag === "h1") return `# ${Array.from(el.childNodes).map(inlineToMarkdown).join("").trim()}`
  if (tag === "h2") return `## ${Array.from(el.childNodes).map(inlineToMarkdown).join("").trim()}`
  if (tag === "h3") return `### ${Array.from(el.childNodes).map(inlineToMarkdown).join("").trim()}`
  if (tag === "p") return Array.from(el.childNodes).map(inlineToMarkdown).join("").trim()
  if (tag === "hr") return "---"
  if (tag === "blockquote") return blockquoteToMarkdown(el)
  if (tag === "ul") return listToMarkdown(el, false)
  if (tag === "ol") return listToMarkdown(el, true)
  if (tag === "pre") return preToMarkdown(el)
  if (tag === "table") return tableToMarkdown(el as HTMLTableElement)
  if (tag === "details") return detailsToMarkdown(el)

  const classNames = el.className || ""
  if (classNames.includes("notion-toggle")) {
    const title = el.querySelector(".notion-toggle-summary")?.textContent?.trim() || "토글 제목"
    const body = el.querySelector(".notion-toggle-content")?.textContent?.trim() || "내용을 입력하세요."
    return `:::toggle ${title}\n${body}\n:::`
  }

  return Array.from(el.childNodes)
    .map((node) =>
      node.nodeType === Node.ELEMENT_NODE
        ? blockToMarkdown(node as HTMLElement)
        : inlineToMarkdown(node)
    )
    .join("\n")
    .trim()
}

const convertHtmlToMarkdown = (html: string): string => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")
  const lines = Array.from(doc.body.childNodes)
    .map((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        return blockToMarkdown(node as HTMLElement)
      }
      return inlineToMarkdown(node).trim()
    })
    .map((line) => line.trimEnd())
    .filter(Boolean)

  return lines.join("\n\n").replace(/\n{3,}/g, "\n\n")
}

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
  const [profileImgInputUrl, setProfileImgInputUrl] = useState("")

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

  const handlePasteFromNotion = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData("text/html")
    if (!html) return

    e.preventDefault()
    const markdown = convertHtmlToMarkdown(html)
    if (!markdown.trim()) return
    insertSnippet(markdown)
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
          <Input
            placeholder="https://... 프로필 이미지 URL"
            value={profileImgInputUrl}
            onChange={(e) => setProfileImgInputUrl(e.target.value)}
          />
          <Button
            disabled={disabled("admMemberProfileImgUpdate")}
            onClick={() => {
              const nextUrl = profileImgInputUrl.trim()
              if (!nextUrl) {
                setResult(pretty({ error: "프로필 이미지 URL을 입력해주세요." }))
                return
              }

              void run("admMemberProfileImgUpdate", () =>
                apiFetch(`/member/api/v1/adm/members/${profileImgMemberId}/profileImgUrl`, {
                  method: "PATCH",
                  body: JSON.stringify({
                    profileImgUrl: nextUrl,
                  }),
                })
              )
            }}
          >
            프로필 이미지 변경
          </Button>
        </Row>
        {profileImgInputUrl.trim().length > 0 && (
          <ProfilePreview>
            <img
              className="previewImage"
              src={profileImgInputUrl.trim()}
              alt="profile preview"
            />
          </ProfilePreview>
        )}
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
        <QueryPanel>
          <QueryHeader>
            <h3>글 목록 조회 조건</h3>
            <p>아래 조건으로 전체 글/내 글 목록을 조회할 수 있습니다.</p>
          </QueryHeader>
          <QueryGrid>
            <FieldBox>
              <FieldLabel htmlFor="list-page">페이지</FieldLabel>
              <Input
                id="list-page"
                placeholder="예: 1"
                value={listPage}
                onChange={(e) => setListPage(e.target.value)}
              />
            </FieldBox>
            <FieldBox>
              <FieldLabel htmlFor="list-page-size">페이지 크기</FieldLabel>
              <Input
                id="list-page-size"
                placeholder="1~30"
                value={listPageSize}
                onChange={(e) => setListPageSize(e.target.value)}
              />
            </FieldBox>
            <FieldBox>
              <FieldLabel htmlFor="list-kw">검색어</FieldLabel>
              <Input
                id="list-kw"
                placeholder="제목/본문 키워드"
                value={listKw}
                onChange={(e) => setListKw(e.target.value)}
              />
            </FieldBox>
            <FieldBox>
              <FieldLabel htmlFor="list-sort">정렬 기준</FieldLabel>
              <Input
                id="list-sort"
                placeholder="예: CREATED_AT"
                value={listSort}
                onChange={(e) => setListSort(e.target.value)}
              />
            </FieldBox>
          </QueryGrid>

          <QueryActions>
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
              전체 글 목록 조회
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
              내 글 목록 조회
            </Button>
            <Button
              disabled={disabled("postTemp")}
              onClick={() => run("postTemp", () => apiFetch("/post/api/v1/posts/temp", { method: "POST" }))}
            >
              임시글 불러오기/없으면 생성
            </Button>
          </QueryActions>
        </QueryPanel>

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
                onPaste={handlePasteFromNotion}
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

const QueryPanel = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.gray2};
  padding: 0.8rem;
  margin-bottom: 0.7rem;
`

const QueryHeader = styled.div`
  margin-bottom: 0.55rem;

  h3 {
    margin: 0;
    font-size: 0.95rem;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0.2rem 0 0;
    font-size: 0.82rem;
    color: ${({ theme }) => theme.colors.gray11};
  }
`

const QueryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.55rem;

  @media (max-width: 980px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`

const FieldBox = styled.div`
  display: grid;
  gap: 0.26rem;
`

const FieldLabel = styled.label`
  font-size: 0.78rem;
  color: ${({ theme }) => theme.colors.gray11};
`

const QueryActions = styled.div`
  margin-top: 0.65rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
`

const ProfilePreview = styled.div`
  margin: 0.5rem 0 0.7rem;
  padding: 0.55rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 10px;
  width: fit-content;
  background: ${({ theme }) => theme.colors.gray2};

  .previewImage {
    width: 92px;
    height: 92px;
    object-fit: cover;
    border-radius: 999px;
    display: block;
    border: 1px solid ${({ theme }) => theme.colors.gray7};
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
