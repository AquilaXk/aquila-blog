import styled from "@emotion/styled"
import Image from "next/image"
import { NextPage } from "next"
import { useRouter } from "next/router"
import { ChangeEvent, ClipboardEvent, useEffect, useMemo, useRef, useState } from "react"
import { apiFetch, getApiBaseUrl } from "src/apis/backend/client"
import { isNavigationCancelledError } from "src/libs/router"
import NotionRenderer from "src/routes/Detail/components/NotionRenderer"

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null

type MemberMe = {
  id: number
  createdAt?: string
  modifiedAt?: string
  username: string
  nickname: string
  isAdmin?: boolean
  profileImageUrl?: string
  profileImageDirectUrl?: string
  profileRole?: string
  profileBio?: string
}

type PostForEditor = {
  id: number
  title: string
  content: string
  published: boolean
  listed: boolean
}

type PostVisibility = "PRIVATE" | "PUBLIC_UNLISTED" | "PUBLIC_LISTED"

type UploadPostImageResponse = {
  data: {
    key: string
    url: string
    markdown: string
  }
}

type RsData<T> = {
  resultCode: string
  msg: string
  data: T
}

type PostWriteResult = {
  id: number
  title: string
  published: boolean
  listed: boolean
}

type AdminPostListItem = {
  id: number
  title: string
  authorName: string
  published: boolean
  listed: boolean
  createdAt: string
  modifiedAt: string
}

type PageDto<T> = {
  content: T[]
  pageable?: {
    pageNumber?: number
    pageSize?: number
    totalElements?: number
    totalPages?: number
  }
}

type NoticeTone = "idle" | "loading" | "success" | "error"
type ToolbarAction = {
  label: string
  onClick: () => void
  primary?: boolean
  calloutTrigger?: boolean
}
type ToolbarGroup = {
  label: string
  description: string
  actions: ToolbarAction[]
}

const toVisibility = (published: boolean, listed: boolean): PostVisibility => {
  if (!published) return "PRIVATE"
  if (!listed) return "PUBLIC_UNLISTED"
  return "PUBLIC_LISTED"
}

const toFlags = (visibility: PostVisibility): { published: boolean; listed: boolean } => {
  if (visibility === "PRIVATE") return { published: false, listed: false }
  if (visibility === "PUBLIC_UNLISTED") return { published: true, listed: false }
  return { published: true, listed: true }
}

const pretty = (value: JsonValue) => JSON.stringify(value, null, 2)

const parseResponseErrorBody = async (response: Response): Promise<string> => {
  const text = await response.text().catch(() => "")
  if (!text) return ""

  try {
    const parsed = JSON.parse(text) as { resultCode?: string; msg?: string }
    const msg = parsed.msg?.trim()
    if (!msg) return text
    return parsed.resultCode ? `${msg} (${parsed.resultCode})` : msg
  } catch {
    return text
  }
}

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
  const [postId, setPostId] = useState("1")
  const [commentId, setCommentId] = useState("1")
  const [commentContent, setCommentContent] = useState("")
  const [postTitle, setPostTitle] = useState("")
  const [postContent, setPostContent] = useState("")
  const [postVisibility, setPostVisibility] = useState<PostVisibility>("PUBLIC_LISTED")
  const [publishNotice, setPublishNotice] = useState<{
    tone: NoticeTone
    text: string
  }>({
    tone: "idle",
    text: "작성 후 ‘글 발행’을 누르면 결과가 여기에 표시됩니다.",
  })
  const [profileNotice, setProfileNotice] = useState<{
    tone: NoticeTone
    text: string
  }>({
    tone: "idle",
    text: "현재 저장된 관리자 프로필 값이 입력창에 자동으로 채워집니다.",
  })
  const [isCalloutMenuOpen, setIsCalloutMenuOpen] = useState(false)
  const postContentRef = useRef<HTMLTextAreaElement>(null)
  const postImageFileInputRef = useRef<HTMLInputElement>(null)

  const [listPage, setListPage] = useState("1")
  const [listPageSize, setListPageSize] = useState("30")
  const [listKw, setListKw] = useState("")
  const [listSort, setListSort] = useState("CREATED_AT")

  const [profileImgInputUrl, setProfileImgInputUrl] = useState("")
  const [profileRoleInput, setProfileRoleInput] = useState("")
  const [profileBioInput, setProfileBioInput] = useState("")
  const [profileImageFileName, setProfileImageFileName] = useState("")
  const profileImageFileInputRef = useRef<HTMLInputElement>(null)
  const [adminPostRows, setAdminPostRows] = useState<AdminPostListItem[]>([])
  const [adminPostTotal, setAdminPostTotal] = useState<number>(0)
  const [modifiedSortOrder, setModifiedSortOrder] = useState<"desc" | "asc">("desc")
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<AdminPostListItem | null>(null)
  const redirectingRef = useRef(false)

  const syncProfileState = (member: MemberMe) => {
    setMe(member)
    setProfileRoleInput(member.profileRole || "")
    setProfileBioInput(member.profileBio || "")
    setProfileImgInputUrl((member.profileImageDirectUrl || member.profileImageUrl || "").trim())
  }

  const refreshAdminProfile = async (memberId: number, fallback?: MemberMe) => {
    try {
      const detailed = await apiFetch<MemberMe>(`/member/api/v1/adm/members/${memberId}`)
      syncProfileState(detailed)
      return detailed
    } catch {
      if (fallback) syncProfileState(fallback)
      return fallback ?? null
    }
  }

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

  const loadPostForEditor = async (targetPostId: string = postId) => {
    try {
      setLoadingKey("postOne")
      const post = await apiFetch<PostForEditor>(`/post/api/v1/posts/${targetPostId}`)

      setPostTitle(post.title ?? "")
      setPostContent(post.content ?? "")
      setPostVisibility(toVisibility(!!post.published, !!post.listed))
      setPostId(String(post.id))
      setResult(pretty(post as unknown as JsonValue))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setResult(pretty({ error: message }))
    } finally {
      setLoadingKey("")
    }
  }

  const handleWritePost = async () => {
    if (!postTitle.trim()) {
      const msg = "제목을 입력해주세요."
      setPublishNotice({ tone: "error", text: msg })
      setResult(pretty({ error: msg }))
      return
    }

    if (!postContent.trim()) {
      const msg = "본문을 입력해주세요."
      setPublishNotice({ tone: "error", text: msg })
      setResult(pretty({ error: msg }))
      return
    }

    try {
      setLoadingKey("writePost")
      setPublishNotice({ tone: "loading", text: "글 발행 중입니다..." })

      const response = await apiFetch<RsData<PostWriteResult>>("/post/api/v1/posts", {
        method: "POST",
        body: JSON.stringify({
          title: postTitle,
          content: postContent,
          ...toFlags(postVisibility),
        }),
      })

      setResult(pretty(response as unknown as JsonValue))
      if (response?.data?.id) setPostId(String(response.data.id))

      const visibilityText =
        postVisibility === "PUBLIC_LISTED"
          ? "전체 공개(목록 노출)"
          : postVisibility === "PUBLIC_UNLISTED"
            ? "링크 공개(목록 미노출)"
            : "비공개"

      setPublishNotice({
        tone: "success",
        text: `발행 완료: ${response.msg} (공개 범위: ${visibilityText})`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setResult(pretty({ error: message }))
      setPublishNotice({ tone: "error", text: `발행 실패: ${message}` })
    } finally {
      setLoadingKey("")
    }
  }

  const visibilityLabel = (published: boolean, listed: boolean) => {
    if (!published) return "비공개"
    if (!listed) return "링크 공개"
    return "전체 공개"
  }

  const adminPostViewRows = useMemo(() => {
    const copy = [...adminPostRows]
    copy.sort((a, b) => {
      const aMs = new Date(a.modifiedAt).getTime()
      const bMs = new Date(b.modifiedAt).getTime()
      if (Number.isNaN(aMs) || Number.isNaN(bMs)) return 0
      return modifiedSortOrder === "desc" ? bMs - aMs : aMs - bMs
    })
    return copy
  }, [adminPostRows, modifiedSortOrder])

  const loadAdminPosts = async () => {
    try {
      setLoadingKey("postList")
      const data = await apiFetch<PageDto<AdminPostListItem>>(
        `/post/api/v1/adm/posts?page=${listPage}&pageSize=${listPageSize}&kw=${encodeURIComponent(
          listKw
        )}&sort=${encodeURIComponent(listSort)}`
      )
      setAdminPostRows(data.content || [])
      setAdminPostTotal(data.pageable?.totalElements ?? data.content?.length ?? 0)
      setResult(pretty(data as unknown as JsonValue))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setResult(pretty({ error: message }))
      setAdminPostRows([])
      setAdminPostTotal(0)
    } finally {
      setLoadingKey("")
    }
  }

  const deletePostFromList = async (targetId: number) => {
    try {
      setLoadingKey(`deletePost-${targetId}`)
      const data = await apiFetch<JsonValue>(`/post/api/v1/posts/${targetId}`, {
        method: "DELETE",
      })
      setResult(pretty(data))
      setAdminPostRows((prev) => prev.filter((row) => row.id !== targetId))
      setAdminPostTotal((prev) => Math.max(0, prev - 1))
      if (postId === String(targetId)) {
        setPostId("")
        setPostTitle("")
        setPostContent("")
      }
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setResult(pretty({ error: message }))
      return false
    } finally {
      setLoadingKey("")
    }
  }

  const handleUploadMemberProfileImage = async (selectedFile?: File) => {
    const file = selectedFile || profileImageFileInputRef.current?.files?.[0]
    if (!file) {
      setResult(pretty({ error: "업로드할 이미지 파일을 선택해주세요." }))
      return
    }

    if (!me?.id) {
      setResult(pretty({ error: "현재 관리자 정보를 확인할 수 없습니다." }))
      return
    }

    try {
      setLoadingKey("admMemberProfileImgUpdate")
      setProfileNotice({ tone: "loading", text: "프로필 이미지를 업로드하고 있습니다..." })

      const formData = new FormData()
      formData.append("file", file)

      const uploadResponse = await fetch(
        `${getApiBaseUrl()}/member/api/v1/adm/members/${me.id}/profileImageFile`,
        {
          method: "POST",
          credentials: "include",
          body: formData,
        }
      )

      if (!uploadResponse.ok) {
        const body = await parseResponseErrorBody(uploadResponse)
        throw new Error(`이미지 업로드 실패 (${uploadResponse.status}) ${body}`.trim())
      }

      const uploadData = (await uploadResponse.json()) as MemberMe
      const uploadedUrl = (uploadData?.profileImageDirectUrl || uploadData?.profileImageUrl || "").trim()
      if (!uploadedUrl) {
        throw new Error("업로드 응답에 이미지 URL이 없습니다.")
      }

      syncProfileState(uploadData)
      setProfileNotice({
        tone: "success",
        text: "프로필 이미지가 저장되었습니다. 현재 미리보기에 반영된 상태가 저장값입니다.",
      })
      setResult(
        pretty({
          uploadedUrl,
          member: uploadData,
        })
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setProfileNotice({ tone: "error", text: `프로필 이미지 저장 실패: ${message}` })
      setResult(pretty({ error: message }))
    } finally {
      setLoadingKey("")
    }
  }

  const handleUpdateMemberProfileCard = async () => {
    if (!me?.id) {
      setResult(pretty({ error: "현재 관리자 정보를 확인할 수 없습니다." }))
      return
    }

    try {
      setLoadingKey("admMemberProfileCardUpdate")
      setProfileNotice({ tone: "loading", text: "역할과 소개 문구를 저장하고 있습니다..." })
      const updated = await apiFetch<MemberMe>(
        `/member/api/v1/adm/members/${me.id}/profileCard`,
        {
          method: "PATCH",
          body: JSON.stringify({
            role: profileRoleInput.trim(),
            bio: profileBioInput.trim(),
          }),
        }
      )
      syncProfileState(updated)
      setProfileNotice({
        tone: "success",
        text: "역할과 소개 문구가 저장되었습니다. 입력창과 미리보기에 현재 저장값이 반영되었습니다.",
      })
      setResult(pretty(updated as unknown as JsonValue))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setProfileNotice({ tone: "error", text: `프로필 저장 실패: ${message}` })
      setResult(pretty({ error: message }))
    } finally {
      setLoadingKey("")
    }
  }

  useEffect(() => {
    let mounted = true
    const verifyAdmin = async () => {
      try {
        const member = await apiFetch<MemberMe>("/member/api/v1/auth/me")
        if (!mounted) return

        if (!member?.isAdmin) {
          if (!redirectingRef.current && router.asPath !== "/") {
            redirectingRef.current = true
            try {
              await router.replace("/")
            } catch (error) {
              if (!isNavigationCancelledError(error)) {
                setResult(pretty({ error: error instanceof Error ? error.message : String(error) }))
              }
            }
          }
          return
        }

        let refreshed: MemberMe | null = null
        try {
          refreshed = await apiFetch<MemberMe>(`/member/api/v1/adm/members/${member.id}`)
        } catch {
          refreshed = member
        }
        if (!mounted || !refreshed) return
        syncProfileState(refreshed)
        setProfileNotice({
          tone: "idle",
          text: "현재 저장된 관리자 프로필을 불러왔습니다. 입력창 값이 실제 저장값입니다.",
        })
      } catch {
        if (!mounted) return
        const target = `/login?next=${encodeURIComponent("/admin")}`
        if (!redirectingRef.current && router.asPath !== target) {
          redirectingRef.current = true
          try {
            await router.replace(target)
          } catch (error) {
            if (!isNavigationCancelledError(error)) {
              setResult(pretty({ error: error instanceof Error ? error.message : String(error) }))
            }
          }
        }
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

  const insertBlockSnippet = (snippet: string) => {
    const normalized = snippet.trim()
    if (!normalized) return

    const apply = (base: string, start: number, end: number) => {
      const before = base.slice(0, start)
      const after = base.slice(end)
      const prefix = before.length === 0 ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n"
      const suffix = after.length === 0 ? "\n" : after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n"
      const inserted = `${prefix}${normalized}${suffix}`
      return {
        nextContent: `${before}${inserted}${after}`,
        selectionStart: before.length + prefix.length,
        selectionEnd: before.length + prefix.length + normalized.length,
      }
    }

    const textarea = postContentRef.current
    if (!textarea) {
      setPostContent((prev) => apply(prev, prev.length, prev.length).nextContent)
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const { nextContent, selectionStart, selectionEnd } = apply(postContent, start, end)
    setPostContent(nextContent)

    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(selectionStart, selectionEnd)
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
    insertBlockSnippet("---")
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
    insertBlockSnippet(`> [!${kind}]\n> ${body}`)
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

  const uploadPostImageFile = async (file: File): Promise<UploadPostImageResponse> => {
    const formData = new FormData()
    formData.append("file", file)

    const response = await fetch(`${getApiBaseUrl()}/post/api/v1/posts/images`, {
      method: "POST",
      credentials: "include",
      body: formData,
    })

    if (!response.ok) {
      const body = await parseResponseErrorBody(response)
      throw new Error(`이미지 업로드 실패 (${response.status}): ${body}`)
    }

    return (await response.json()) as UploadPostImageResponse
  }

  const handlePostImageFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    void run("uploadPostImage", async () => {
      setPublishNotice({
        tone: "loading",
        text: `이미지 "${file.name}" 업로드 중입니다. 업로드가 끝나면 본문에 자동 삽입됩니다.`,
      })

      try {
        const uploaded = await uploadPostImageFile(file)
        const markdown = uploaded.data?.markdown
        if (!markdown) throw new Error("업로드 응답 형식이 올바르지 않습니다.")
        insertBlockSnippet(markdown)
        setPublishNotice({
          tone: "success",
          text: `이미지 업로드가 완료되었습니다. 본문과 미리보기에서 반응형 크기로 확인할 수 있습니다.`,
        })
        return uploaded
      } catch (error) {
        setPublishNotice({
          tone: "error",
          text: `이미지 업로드 실패: ${error instanceof Error ? error.message : String(error)}`,
        })
        throw error
      }
    })
  }

  const currentFlags = toFlags(postVisibility)
  const currentVisibilityText = visibilityLabel(currentFlags.published, currentFlags.listed)
  const currentPostLabel = postTitle.trim() || (postId.trim() ? `#${postId} 불러온 글` : "새 글 초안")
  const selectedPostLabel = postId.trim() ? `선택된 글 ID #${postId}` : "선택된 글이 없습니다."
  const contentLength = postContent.trim().length
  const lineCount = postContent ? postContent.split("\n").length : 0
  const imageCount = (postContent.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length
  const codeBlockCount = (postContent.match(/```[\s\S]*?```/g) || []).length
  const profilePreviewSrc = profileImgInputUrl.trim()
  const profileImageStatus = profilePreviewSrc ? "설정됨" : "기본 이미지 사용 중"
  const profileRoleStatus = profileRoleInput.trim() || "미설정"
  const profileBioStatus = profileBioInput.trim() || "미설정"
  const profileUpdatedText = me?.modifiedAt ? me.modifiedAt.slice(0, 16).replace("T", " ") : "확인 전"
  const profileImageHint = profileImageFileName
    ? `선택 파일: ${profileImageFileName}`
    : "아직 선택된 파일이 없습니다."
  const toolbarGroups: ToolbarGroup[] = [
    {
      label: "구조",
      description: "문서 구조와 기본 블록",
      actions: [
        { label: "제목1", onClick: () => applyHeadingStyle(1) },
        { label: "제목2", onClick: () => applyHeadingStyle(2) },
        { label: "제목3", onClick: () => applyHeadingStyle(3) },
        { label: "텍스트", onClick: () => applyHeadingStyle(0) },
        { label: "토글", onClick: insertToggle },
        { label: "구분선", onClick: insertDivider },
        { label: "체크리스트", onClick: applyChecklist },
      ],
    },
    {
      label: "강조",
      description: "문장 강조와 링크",
      actions: [
        { label: "굵게", onClick: () => wrapSelection("**", "**", "굵은 텍스트") },
        { label: "기울임", onClick: () => wrapSelection("*", "*", "기울임 텍스트") },
        { label: "취소선", onClick: () => wrapSelection("~~", "~~", "취소선 텍스트") },
        { label: "인라인코드", onClick: () => wrapSelection("`", "`", "코드") },
        { label: "링크", onClick: insertLink },
      ],
    },
    {
      label: "삽입",
      description: "이미지, 콜아웃, 코드, 다이어그램",
      actions: [
        { label: "이미지 업로드", onClick: () => postImageFileInputRef.current?.click(), primary: true },
        { label: "콜아웃", onClick: () => setIsCalloutMenuOpen((prev) => !prev), calloutTrigger: true },
        {
          label: "코드블럭",
          onClick: () =>
            insertBlockSnippet(
              "```ts\nconst message = \"Hello, Aquila\";\nconsole.log(message);\n```"
            ),
        },
        {
          label: "머메이드",
          onClick: () =>
            insertBlockSnippet(
              "```mermaid\ngraph TD\n  A[사용자 요청] --> B{검증}\n  B -->|OK| C[처리]\n  B -->|Fail| D[오류 반환]\n```"
            ),
        },
        {
          label: "테이블",
          onClick: () =>
            insertBlockSnippet(
              "| 구분 | 내용 |\n| --- | --- |\n| API | /post/api/v1/posts |\n| 상태 | 운영중 |"
            ),
        },
      ],
    },
  ]
  const adminTools = [
    { href: "#profile-studio", label: "프로필" },
    { href: "#content-studio", label: "글 관리" },
    { href: "#comment-studio", label: "댓글" },
    { href: "#system-tools", label: "시스템" },
  ]

  if (authLoading || !me) {
    return <Main>관리자 인증 확인 중...</Main>
  }

  return (
    <Main>
      <HeroCard>
        <HeroIntro>
          <HeroEyebrow>Admin Workspace</HeroEyebrow>
          <h1>운영 대시보드</h1>
          <p>
            프로필, 글 발행, 댓글, 시스템 도구를 한 화면에서 관리합니다. 자주 쓰는 작업이 상단에
            먼저 오도록 배치했습니다.
          </p>
          <HeroNav>
            {adminTools.map((tool) => (
              <AnchorButton key={tool.href} href={tool.href}>
                {tool.label}
              </AnchorButton>
            ))}
          </HeroNav>
        </HeroIntro>
        <HeroAside>
          <MetricGrid>
            <MetricCard>
              <span>현재 계정</span>
              <strong>{me.username}</strong>
            </MetricCard>
            <MetricCard>
              <span>작업 중 글</span>
              <strong>{currentPostLabel}</strong>
            </MetricCard>
            <MetricCard>
              <span>공개 범위</span>
              <strong>{currentVisibilityText}</strong>
            </MetricCard>
            <MetricCard>
              <span>불러온 글 수</span>
              <strong>{adminPostRows.length > 0 ? `${adminPostRows.length}개` : "미조회"}</strong>
            </MetricCard>
          </MetricGrid>
          <ActionCluster>
            <PrimaryButton
              type="button"
              disabled={disabled("postList")}
              onClick={() => void loadAdminPosts()}
            >
              글 목록 새로고침
            </PrimaryButton>
            <Button
              type="button"
              disabled={disabled("me")}
              onClick={() =>
                run("me", async () => {
                  const member = await apiFetch<MemberMe>("/member/api/v1/auth/me")
                  const refreshed = await refreshAdminProfile(member.id, member)
                  if (refreshed) {
                    setProfileNotice({
                      tone: "success",
                      text: "현재 로그인 정보와 프로필 저장값을 다시 동기화했습니다.",
                    })
                  }
                  return (refreshed || member) as unknown as JsonValue
                })
              }
            >
              내 정보
            </Button>
            <Button
              type="button"
              disabled={disabled("logout")}
              onClick={() =>
                run("logout", () => apiFetch("/member/api/v1/auth/logout", { method: "DELETE" }))
              }
            >
              로그아웃
            </Button>
          </ActionCluster>
        </HeroAside>
      </HeroCard>

      <WorkspaceGrid>
        <WorkspaceMain>
          <Section id="profile-studio">
            <SectionTop>
              <div>
                <SectionEyebrow>Profile Studio</SectionEyebrow>
                <h2>관리자 프로필 관리</h2>
                <SectionDescription>
                  현재 로그인한 관리자 1명의 프로필만 여기서 수정합니다. 프로필 사진은 파일 선택 즉시
                  업로드되고, 역할과 소개 문구는 별도 저장으로 반영됩니다.
                </SectionDescription>
              </div>
            </SectionTop>
            <ProfileStudioGrid>
              <ProfileCardPanel>
                <ProfilePreview>
                  {profilePreviewSrc ? (
                    <Image
                      className="previewImage"
                      src={profilePreviewSrc}
                      alt="profile preview"
                      width={120}
                      height={120}
                      unoptimized={profilePreviewSrc.includes("/redirectToProfileImg")}
                    />
                  ) : (
                    <ProfileFallback>{me.username.slice(0, 2).toUpperCase()}</ProfileFallback>
                  )}
                </ProfilePreview>
                <ProfileSummary>
                  <strong>{me.username}</strong>
                  <span>{profileRoleInput.trim() || "역할을 아직 입력하지 않았습니다."}</span>
                  <p>{profileBioInput.trim() || "소개 문구를 입력하면 메인 프로필 카드에 반영됩니다."}</p>
                </ProfileSummary>
                <input
                  ref={profileImageFileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    setProfileImageFileName(file?.name || "")
                    if (file) {
                      void handleUploadMemberProfileImage(file)
                    }
                  }}
                />
                <PrimaryButton
                  type="button"
                  disabled={disabled("admMemberProfileImgUpdate")}
                  onClick={() => profileImageFileInputRef.current?.click()}
                >
                  {loadingKey === "admMemberProfileImgUpdate" ? "업로드 중..." : "프로필 이미지 선택"}
                </PrimaryButton>
                <InlineHint title={profileImageHint}>{profileImageHint}</InlineHint>
              </ProfileCardPanel>

              <FormPanelCard>
                <ProfileMetaCard>
                  <span>편집 대상 관리자</span>
                  <strong>@{me.username}</strong>
                  <small>member #{me.id}</small>
                </ProfileMetaCard>
                <ProfileCurrentGrid>
                  <ProfileCurrentItem>
                    <label>현재 프로필 이미지</label>
                    <strong>{profileImageStatus}</strong>
                  </ProfileCurrentItem>
                  <ProfileCurrentItem>
                    <label>현재 역할</label>
                    <strong>{profileRoleStatus}</strong>
                  </ProfileCurrentItem>
                  <ProfileCurrentItem className="wide">
                    <label>현재 소개</label>
                    <strong>{profileBioStatus}</strong>
                  </ProfileCurrentItem>
                  <ProfileCurrentItem>
                    <label>마지막 반영 시각</label>
                    <strong>{profileUpdatedText}</strong>
                  </ProfileCurrentItem>
                </ProfileCurrentGrid>
                <InlineStatus data-tone={profileNotice.tone}>{profileNotice.text}</InlineStatus>
                <FieldGrid>
                  <FieldBox>
                    <FieldLabel htmlFor="profile-role">프로필 역할</FieldLabel>
                    <Input
                      id="profile-role"
                      placeholder="예: backend developer"
                      value={profileRoleInput}
                      onChange={(e) => setProfileRoleInput(e.target.value)}
                    />
                  </FieldBox>
                  <FieldBox className="wide">
                    <FieldLabel htmlFor="profile-bio">소개 문구</FieldLabel>
                    <Input
                      id="profile-bio"
                      placeholder="메인 페이지 소개문구"
                      value={profileBioInput}
                      onChange={(e) => setProfileBioInput(e.target.value)}
                    />
                  </FieldBox>
                </FieldGrid>
                <ActionRow>
                  <Button
                    type="button"
                    disabled={disabled("admMemberProfileRefresh")}
                    onClick={() =>
                      run("admMemberProfileRefresh", async () => {
                        if (!me?.id) throw new Error("현재 관리자 정보를 확인할 수 없습니다.")
                        setProfileNotice({ tone: "loading", text: "현재 저장값을 다시 불러오는 중입니다..." })
                        const refreshed = await refreshAdminProfile(me.id, me)
                        if (!refreshed) throw new Error("현재 저장값을 불러오지 못했습니다.")
                        setProfileNotice({
                          tone: "success",
                          text: "현재 저장값을 다시 불러왔습니다. 입력창과 미리보기가 최신 상태입니다.",
                        })
                        return refreshed as unknown as JsonValue
                      })
                    }
                  >
                    현재 저장값 다시 불러오기
                  </Button>
                  <PrimaryButton
                    type="button"
                    disabled={disabled("admMemberProfileCardUpdate")}
                    onClick={() => void handleUpdateMemberProfileCard()}
                  >
                    역할/소개 저장
                  </PrimaryButton>
                </ActionRow>
              </FormPanelCard>
            </ProfileStudioGrid>
          </Section>

          <Section id="content-studio">
            <SectionTop>
              <div>
                <SectionEyebrow>Content Studio</SectionEyebrow>
                <h2>글 작성 및 목록 관리</h2>
                <SectionDescription>
                  조회 조건, 관리자 글 리스트, 에디터를 한 구역에 모아서 운영 흐름이 끊기지 않도록
                  정리했습니다.
                </SectionDescription>
              </div>
            </SectionTop>
        <QueryPanel>
          <QueryHeader>
            <h3>글 목록 조회 조건</h3>
            <p>전체 글, 내 글, 임시글을 불러오는 조건입니다.</p>
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
              onClick={() => void loadAdminPosts()}
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
        <ListPanel>
          <ListHeader>
            <h3>관리자 글 리스트</h3>
            <span>총 {adminPostTotal}건</span>
          </ListHeader>
          {adminPostRows.length === 0 ? (
            <ListEmpty>목록이 없습니다. 상단의 `전체 글 목록 조회`를 눌러 불러오세요.</ListEmpty>
          ) : (
            <ListTable>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>제목</th>
                  <th>공개상태</th>
                  <th>작성자</th>
                  <th>
                    <SortHeaderButton
                      type="button"
                      onClick={() =>
                        setModifiedSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))
                      }
                    >
                      수정일 {modifiedSortOrder === "desc" ? "↓" : "↑"}
                    </SortHeaderButton>
                  </th>
                  <th>작업</th>
                </tr>
              </thead>
              <tbody>
                {adminPostViewRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td className="title">{row.title}</td>
                    <td>
                      <VisibilityBadge data-tone={toVisibility(row.published, row.listed)}>
                        {visibilityLabel(row.published, row.listed)}
                      </VisibilityBadge>
                    </td>
                    <td>{row.authorName}</td>
                    <td>{row.modifiedAt.slice(0, 10)}</td>
                    <td>
                      <InlineActions>
                        <Button
                          type="button"
                          disabled={loadingKey.length > 0}
                          onClick={() => {
                            setPostId(String(row.id))
                            void loadPostForEditor(String(row.id))
                          }}
                        >
                          불러오기
                        </Button>
                        <Button
                          type="button"
                          disabled={loadingKey.length > 0 && loadingKey !== `deletePost-${row.id}`}
                          onClick={() => setDeleteConfirmTarget(row)}
                        >
                          삭제
                        </Button>
                      </InlineActions>
                    </td>
                  </tr>
                ))}
              </tbody>
            </ListTable>
          )}
        </ListPanel>

        <SelectedPostPanel>
          <SelectedPostHeader>
            <div>
              <h3>선택한 글 작업</h3>
              <p>목록에서 불러온 글이나 직접 입력한 `post id` 기준으로 수정, 삭제, 동작 점검을 수행합니다.</p>
            </div>
            <SelectedPostBadge>{selectedPostLabel}</SelectedPostBadge>
          </SelectedPostHeader>
          <SelectedPostGrid>
            <FieldBox>
              <FieldLabel htmlFor="selected-post-id">post id</FieldLabel>
              <Input
                id="selected-post-id"
                placeholder="예: 1"
                value={postId}
                onChange={(e) => setPostId(e.target.value)}
              />
            </FieldBox>
          </SelectedPostGrid>
          <ActionRow>
            <Button
              type="button"
              disabled={disabled("postOne")}
              onClick={() => void loadPostForEditor()}
            >
              글 불러오기
            </Button>
            <Button
              type="button"
              disabled={disabled("modifyPost")}
              onClick={() =>
                run("modifyPost", () =>
                  apiFetch(`/post/api/v1/posts/${postId}`, {
                    method: "PUT",
                    body: JSON.stringify({
                      title: postTitle,
                      content: postContent,
                      ...toFlags(postVisibility),
                    }),
                  })
                )
              }
            >
              글 수정
            </Button>
            <Button
              type="button"
              disabled={disabled("deletePost")}
              onClick={() =>
                run("deletePost", () => apiFetch(`/post/api/v1/posts/${postId}`, { method: "DELETE" }))
              }
            >
              글 삭제
            </Button>
          </ActionRow>
          <SubActionRow>
            <Button
              type="button"
              disabled={disabled("hitPost")}
              onClick={() =>
                run("hitPost", () => apiFetch(`/post/api/v1/posts/${postId}/hit`, { method: "POST" }))
              }
            >
              조회수 테스트
            </Button>
            <Button
              type="button"
              disabled={disabled("likePost")}
              onClick={() =>
                run("likePost", () => apiFetch(`/post/api/v1/posts/${postId}/like`, { method: "POST" }))
              }
            >
              좋아요 테스트
            </Button>
          </SubActionRow>
        </SelectedPostPanel>

        {deleteConfirmTarget && (
          <ModalBackdrop
            onClick={() => {
              if (loadingKey.startsWith("deletePost-")) return
              setDeleteConfirmTarget(null)
            }}
          >
            <ConfirmModal onClick={(e) => e.stopPropagation()}>
              <h4>글 삭제 확인</h4>
              <p>
                정말 삭제할까요?
                <br />
                <strong>#{deleteConfirmTarget.id} {deleteConfirmTarget.title}</strong>
              </p>
              <div className="actions">
                <Button
                  type="button"
                  disabled={loadingKey.startsWith("deletePost-")}
                  onClick={() => setDeleteConfirmTarget(null)}
                >
                  취소
                </Button>
                <PrimaryButton
                  type="button"
                  disabled={loadingKey.startsWith("deletePost-")}
                  onClick={async () => {
                    const ok = await deletePostFromList(deleteConfirmTarget.id)
                    if (ok) setDeleteConfirmTarget(null)
                  }}
                >
                  {loadingKey.startsWith("deletePost-") ? "삭제 중..." : "삭제 확정"}
                </PrimaryButton>
              </div>
            </ConfirmModal>
          </ModalBackdrop>
        )}

        <EditorSection>
          <WriterHeader>
            <div className="titleField">
              <FieldLabel htmlFor="post-title">글 제목</FieldLabel>
              <TitleInput
                id="post-title"
                placeholder="제목을 입력하세요"
                value={postTitle}
                onChange={(e) => setPostTitle(e.target.value)}
              />
            </div>
            <VisibilityWrap>
              <FieldLabel htmlFor="post-visibility">공개 범위</FieldLabel>
              <VisibilitySelect
                id="post-visibility"
                value={postVisibility}
                onChange={(e) => setPostVisibility(e.target.value as PostVisibility)}
              >
                <option value="PRIVATE">비공개</option>
                <option value="PUBLIC_UNLISTED">링크 공개 (목록 미노출)</option>
                <option value="PUBLIC_LISTED">전체 공개 (목록 노출)</option>
              </VisibilitySelect>
            </VisibilityWrap>
            <PublishActionWrap>
              <PrimaryButton disabled={disabled("writePost")} onClick={() => void handleWritePost()}>
                {loadingKey === "writePost" ? "발행 중..." : "글 발행"}
              </PrimaryButton>
            </PublishActionWrap>
          </WriterHeader>
          <EditorMetaRow>
            <SmallHint>메인 페이지 노출 조건: `공개` + `목록 노출`</SmallHint>
            <EditorContextChip>{currentPostLabel}</EditorContextChip>
          </EditorMetaRow>
          <PublishNotice data-tone={publishNotice.tone}>{publishNotice.text}</PublishNotice>
          <EditorInsightGrid>
            <EditorInsightCard>
              <span>현재 문서</span>
              <strong>{currentPostLabel}</strong>
            </EditorInsightCard>
            <EditorInsightCard>
              <span>공개 상태</span>
              <strong>{currentVisibilityText}</strong>
            </EditorInsightCard>
            <EditorInsightCard>
              <span>본문 분량</span>
              <strong>{contentLength}자 · {lineCount}줄</strong>
            </EditorInsightCard>
            <EditorInsightCard>
              <span>삽입 블록</span>
              <strong>이미지 {imageCount}개 · 코드 {codeBlockCount}개</strong>
            </EditorInsightCard>
          </EditorInsightGrid>

          <input
            ref={postImageFileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePostImageFileChange}
            style={{ display: "none" }}
          />
          <EditorToolbar>
            {toolbarGroups.map((group) => (
              <ToolbarGroup key={group.label}>
                <ToolbarGroupHeader>
                  <strong>{group.label}</strong>
                  <span>{group.description}</span>
                </ToolbarGroupHeader>
                <ToolbarActionGrid>
                  {group.actions.map((action) =>
                    action.calloutTrigger ? (
                      <CalloutDropdown key={action.label}>
                        <ToolbarActionButton type="button" onClick={action.onClick}>
                          {action.label} ▾
                        </ToolbarActionButton>
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
                    ) : (
                      <ToolbarActionButton
                        key={action.label}
                        type="button"
                        disabled={action.primary ? disabled("uploadPostImage") : false}
                        data-variant={action.primary ? "primary" : "default"}
                        onClick={action.onClick}
                      >
                        {action.label}
                      </ToolbarActionButton>
                    )
                  )}
                </ToolbarActionGrid>
              </ToolbarGroup>
            ))}
          </EditorToolbar>
          <EditorSupportNote>
            이미지는 업로드 후 본문에 블록 형태로 삽입되고, 미리보기와 실제 글에서 자동으로 폭이 제한됩니다.
            콜아웃은 유형을 고르면 바로 템플릿이 들어갑니다.
          </EditorSupportNote>
          <EditorGrid>
            <EditorPane>
              <PaneHeader>
                <div>
                  <PaneTitle>Markdown 입력</PaneTitle>
                  <PaneDescription>본문을 직접 작성하거나 위 도구로 블록 템플릿을 삽입합니다.</PaneDescription>
                </div>
                <PaneChip>{lineCount} lines</PaneChip>
              </PaneHeader>
              <ContentInput
                ref={postContentRef}
                placeholder="Markdown으로 본문을 작성하세요."
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
                onPaste={handlePasteFromNotion}
              />
            </EditorPane>
            <PreviewPane>
              <PaneHeader>
                <div>
                  <PaneTitle>실시간 미리보기</PaneTitle>
                  <PaneDescription>실제 글 상세 화면과 같은 렌더러로 바로 확인합니다.</PaneDescription>
                </div>
                <PaneChip>{imageCount} images</PaneChip>
              </PaneHeader>
              <PreviewCard>
                <NotionRenderer content={postContent} />
              </PreviewCard>
            </PreviewPane>
          </EditorGrid>
        </EditorSection>

          </Section>

          <UtilityGrid>
            <Section id="comment-studio">
              <SectionTop>
                <div>
                  <SectionEyebrow>Comment Studio</SectionEyebrow>
                  <h2>댓글 테스트 도구</h2>
                  <SectionDescription>댓글 CRUD 동작을 빠르게 점검할 때 사용하는 영역입니다.</SectionDescription>
                </div>
              </SectionTop>
              <FieldGrid>
                <FieldBox>
                  <FieldLabel htmlFor="comment-post-id">post id</FieldLabel>
                  <Input
                    id="comment-post-id"
                    placeholder="예: 1"
                    value={postId}
                    onChange={(e) => setPostId(e.target.value)}
                  />
                </FieldBox>
                <FieldBox>
                  <FieldLabel htmlFor="comment-id">comment id</FieldLabel>
                  <Input
                    id="comment-id"
                    placeholder="예: 1"
                    value={commentId}
                    onChange={(e) => setCommentId(e.target.value)}
                  />
                </FieldBox>
                <FieldBox className="wide">
                  <FieldLabel htmlFor="comment-content">comment content</FieldLabel>
                  <Input
                    id="comment-content"
                    placeholder="댓글 내용을 입력하세요"
                    value={commentContent}
                    onChange={(e) => setCommentContent(e.target.value)}
                  />
                </FieldBox>
              </FieldGrid>
              <ActionRow>
                <Button
                  type="button"
                  disabled={disabled("commentList")}
                  onClick={() => run("commentList", () => apiFetch(`/post/api/v1/posts/${postId}/comments`))}
                >
                  댓글 목록
                </Button>
                <Button
                  type="button"
                  disabled={disabled("commentOne")}
                  onClick={() =>
                    run("commentOne", () => apiFetch(`/post/api/v1/posts/${postId}/comments/${commentId}`))
                  }
                >
                  댓글 단건
                </Button>
                <Button
                  type="button"
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
                  type="button"
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
                  type="button"
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
              </ActionRow>
            </Section>

            <Section id="system-tools">
              <SectionTop>
                <div>
                  <SectionEyebrow>System Tools</SectionEyebrow>
                  <h2>운영 점검 도구</h2>
                  <SectionDescription>자주 확인하는 관리성 API를 한곳에 모았습니다.</SectionDescription>
                </div>
              </SectionTop>
              <ActionRow>
                <Button
                  type="button"
                  disabled={disabled("admPostCount")}
                  onClick={() => run("admPostCount", () => apiFetch("/post/api/v1/adm/posts/count"))}
                >
                  전체 글 개수 확인
                </Button>
                <Button
                  type="button"
                  disabled={disabled("systemHealth")}
                  onClick={() => run("systemHealth", () => apiFetch("/system/api/v1/adm/health"))}
                >
                  서버 상태 조회
                </Button>
              </ActionRow>
            </Section>
          </UtilityGrid>
        </WorkspaceMain>

        <WorkspaceAside>
          <StickyAsideCard>
            <AsideHeader>
              <div>
                <SectionEyebrow>Console</SectionEyebrow>
                <h2>최근 API 응답</h2>
              </div>
              <span>{loadingKey ? `실행 중: ${loadingKey}` : "대기 중"}</span>
            </AsideHeader>
            <ResultPanel>{result || "// API 응답 결과가 여기에 표시됩니다."}</ResultPanel>
          </StickyAsideCard>
        </WorkspaceAside>
      </WorkspaceGrid>
    </Main>
  )
}

export default AdminPage

const Main = styled.main`
  max-width: 1360px;
  margin: 0 auto;
  padding: 2rem 1rem 3.2rem;
`

const HeroCard = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
  gap: 1rem;
  border-radius: 24px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background:
    radial-gradient(circle at top left, rgba(37, 99, 235, 0.12), transparent 34%),
    linear-gradient(180deg, ${({ theme }) => theme.colors.gray2}, ${({ theme }) => theme.colors.gray1});
  padding: 1.2rem;
  margin-bottom: 1rem;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`

const HeroIntro = styled.div`
  display: grid;
  gap: 0.8rem;

  h1 {
    margin: 0;
    font-size: clamp(1.9rem, 3vw, 2.7rem);
    letter-spacing: -0.05em;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0;
    max-width: 44rem;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.7;
  }
`

const HeroEyebrow = styled.span`
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

const HeroNav = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`

const AnchorButton = styled.a`
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  text-decoration: none;
  padding: 0.52rem 0.8rem;
  font-size: 0.82rem;
  font-weight: 600;
`

const HeroAside = styled.aside`
  display: grid;
  gap: 0.85rem;
`

const MetricGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`

const MetricCard = styled.div`
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  padding: 0.85rem 0.9rem;

  span {
    display: block;
    font-size: 0.76rem;
    color: ${({ theme }) => theme.colors.gray11};
    margin-bottom: 0.32rem;
  }

  strong {
    display: block;
    font-size: 0.98rem;
    color: ${({ theme }) => theme.colors.gray12};
    line-height: 1.45;
  }
`

const ActionCluster = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
`

const WorkspaceGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 1rem;

  @media (max-width: 1180px) {
    grid-template-columns: 1fr;
  }
`

const WorkspaceMain = styled.div`
  min-width: 0;
`

const WorkspaceAside = styled.aside`
  min-width: 0;
`

const StickyAsideCard = styled.section`
  position: sticky;
  top: 1rem;
  border-radius: 20px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  padding: 1rem;

  @media (max-width: 1180px) {
    position: static;
  }
`

const AsideHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;

  h2 {
    margin: 0.2rem 0 0;
    font-size: 1rem;
    color: ${({ theme }) => theme.colors.gray12};
  }

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.76rem;
    white-space: nowrap;
  }
`

const Section = styled.section`
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 20px;
  padding: 1.1rem;
  margin-bottom: 1rem;
  background: ${({ theme }) => theme.colors.gray1};

  h2 {
    margin: 0;
    font-size: 1.2rem;
    color: ${({ theme }) => theme.colors.gray12};
  }
`

const SectionTop = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.95rem;
`

const SectionEyebrow = styled.span`
  display: inline-flex;
  margin-bottom: 0.35rem;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`

const SectionDescription = styled.p`
  margin: 0.3rem 0 0;
  color: ${({ theme }) => theme.colors.gray11};
  line-height: 1.65;
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

  &.wide {
    grid-column: span 2;

    @media (max-width: 720px) {
      grid-column: span 1;
    }
  }
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

const ProfileStudioGrid = styled.div`
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 0.9rem;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`

const ProfileCardPanel = styled.div`
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  padding: 1rem;
  display: grid;
  gap: 0.7rem;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  justify-items: center;
  text-align: center;
`

const ProfilePreview = styled.div`
  padding: 0.15rem;
  width: 124px;
  height: 124px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  overflow: hidden;
  flex-shrink: 0;

  .previewImage {
    width: 120px;
    height: 120px;
    object-fit: cover;
    border-radius: 999px;
    display: block;
    border: 1px solid ${({ theme }) => theme.colors.gray7};
  }
`

const ProfileFallback = styled.div`
  width: 120px;
  height: 120px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, ${({ theme }) => theme.colors.blue8}, ${({ theme }) => theme.colors.green8});
  color: #fff;
  font-size: 1.6rem;
  font-weight: 800;
`

const ProfileSummary = styled.div`
  display: grid;
  gap: 0.18rem;
  width: 100%;
  min-width: 0;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1rem;
    overflow-wrap: anywhere;
  }

  span {
    color: ${({ theme }) => theme.colors.blue11};
    font-size: 0.84rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  p {
    margin: 0.2rem 0 0;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.6;
    font-size: 0.85rem;
    overflow-wrap: anywhere;
  }
`

const InlineHint = styled.p`
  margin: 0;
  width: 100%;
  min-width: 0;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.8rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
  word-break: break-word;
`

const FormPanelCard = styled.div`
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  padding: 1rem;
`

const ProfileMetaCard = styled.div`
  display: grid;
  gap: 0.18rem;
  padding: 0.8rem 0.9rem;
  margin-bottom: 0.85rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1rem;
  }

  small {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.8rem;
  }
`

const ProfileCurrentGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
  margin-bottom: 0.85rem;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`

const ProfileCurrentItem = styled.div`
  display: grid;
  gap: 0.2rem;
  padding: 0.72rem 0.78rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  min-width: 0;

  &.wide {
    grid-column: span 2;

    @media (max-width: 720px) {
      grid-column: span 1;
    }
  }

  label {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.74rem;
    font-weight: 700;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.86rem;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
`

const InlineStatus = styled.div`
  margin-bottom: 0.85rem;
  padding: 0.62rem 0.72rem;
  border-radius: 12px;
  font-size: 0.82rem;
  line-height: 1.5;

  &[data-tone="idle"] {
    color: ${({ theme }) => theme.colors.gray11};
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray1};
  }

  &[data-tone="loading"] {
    color: ${({ theme }) => theme.colors.blue11};
    border: 1px solid ${({ theme }) => theme.colors.blue7};
    background: ${({ theme }) => theme.colors.blue3};
  }

  &[data-tone="success"] {
    color: ${({ theme }) => theme.colors.green11};
    border: 1px solid ${({ theme }) => theme.colors.green7};
    background: ${({ theme }) => theme.colors.green3};
  }

  &[data-tone="error"] {
    color: ${({ theme }) => theme.colors.red11};
    border: 1px solid ${({ theme }) => theme.colors.red7};
    background: ${({ theme }) => theme.colors.red3};
  }
`

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`

const ActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-top: 0.85rem;
`

const UtilityGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`

const Input = styled.input`
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  border-radius: 12px;
  padding: 0.72rem 0.8rem;
  min-width: 120px;
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: 0 0 0 4px ${({ theme }) => theme.colors.blue4};
  }
`

const TitleInput = styled(Input)`
  width: 100%;
  min-width: 260px;
  font-size: 1rem;
  border-radius: 10px;
  padding: 0.68rem 0.78rem;
`

const SmallHint = styled.p`
  margin: 0;
  font-size: 0.76rem;
  color: ${({ theme }) => theme.colors.gray11};
`

const Button = styled.button`
  border: 1px solid ${({ theme }) => theme.colors.gray8};
  border-radius: 999px;
  padding: 0.58rem 0.88rem;
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;

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

const VisibilityWrap = styled.div`
  display: grid;
  gap: 0.22rem;
  min-width: 220px;
`

const VisibilitySelect = styled.select`
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  border-radius: 10px;
  padding: 0.52rem 0.62rem;
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.86rem;
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
  grid-template-columns: minmax(0, 1fr) minmax(280px, 380px) auto;
  gap: 0.75rem;
  align-items: flex-end;
  margin-bottom: 0.45rem;

  @media (max-width: 980px) {
    grid-template-columns: minmax(0, 1fr) minmax(220px, 1fr);
  }

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }

  .titleField {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }
`

const PublishActionWrap = styled.div`
  display: grid;
  align-items: end;

  ${PrimaryButton} {
    min-height: 46px;
    padding-inline: 1.1rem;
    white-space: nowrap;
  }

  @media (max-width: 720px) {
    ${PrimaryButton} {
      width: 100%;
    }
  }
`

const EditorMetaRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 0.7rem;
`

const EditorContextChip = styled.span`
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.3rem 0.62rem;
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.76rem;
  font-weight: 600;
`

const PublishNotice = styled.div`
  margin: 0 0 0.7rem;
  padding: 0.55rem 0.7rem;
  border-radius: 10px;
  font-size: 0.83rem;
  line-height: 1.4;

  &[data-tone="idle"] {
    color: ${({ theme }) => theme.colors.gray11};
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
  }

  &[data-tone="loading"] {
    color: ${({ theme }) => theme.colors.blue11};
    border: 1px solid ${({ theme }) => theme.colors.blue7};
    background: ${({ theme }) => theme.colors.blue3};
  }

  &[data-tone="success"] {
    color: ${({ theme }) => theme.colors.green11};
    border: 1px solid ${({ theme }) => theme.colors.green7};
    background: ${({ theme }) => theme.colors.green3};
  }

  &[data-tone="error"] {
    color: ${({ theme }) => theme.colors.red11};
    border: 1px solid ${({ theme }) => theme.colors.red7};
    background: ${({ theme }) => theme.colors.red3};
  }
`

const EditorToolbar = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.7rem;
  margin-bottom: 0.6rem;
  padding-bottom: 0.8rem;
  border-bottom: 1px dashed ${({ theme }) => theme.colors.gray7};

  @media (max-width: 1080px) {
    grid-template-columns: 1fr;
  }
`

const ToolbarGroup = styled.div`
  display: grid;
  gap: 0.5rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  padding: 0.72rem;
`

const ToolbarGroupHeader = styled.div`
  display: grid;
  gap: 0.18rem;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.84rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.76rem;
    line-height: 1.45;
  }
`

const ToolbarActionGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
`

const ToolbarActionButton = styled(Button)`
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.gray2};
  min-height: 38px;

  &[data-variant="primary"] {
    border-color: ${({ theme }) => theme.colors.blue8};
    background: ${({ theme }) => theme.colors.blue3};
    color: ${({ theme }) => theme.colors.blue11};
  }
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
  grid-template-columns: minmax(0, 1.05fr) minmax(340px, 0.95fr);
  gap: 0.9rem;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`

const ListPanel = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.gray1};
  padding: 0.7rem;
  margin: 0.7rem 0 0.2rem;
`

const ListHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.55rem;

  h3 {
    margin: 0;
    font-size: 0.92rem;
    color: ${({ theme }) => theme.colors.gray12};
  }

  span {
    font-size: 0.78rem;
    color: ${({ theme }) => theme.colors.gray11};
  }
`

const ListEmpty = styled.p`
  margin: 0.2rem 0 0.1rem;
  font-size: 0.82rem;
  color: ${({ theme }) => theme.colors.gray11};
`

const SelectedPostPanel = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.gray2};
  padding: 0.8rem;
  margin: 0.7rem 0 0.2rem;
`

const SelectedPostHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.7rem;

  h3 {
    margin: 0;
    font-size: 0.95rem;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0.22rem 0 0;
    font-size: 0.82rem;
    line-height: 1.55;
    color: ${({ theme }) => theme.colors.gray11};
  }

  @media (max-width: 720px) {
    flex-direction: column;
  }
`

const SelectedPostBadge = styled.span`
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.34rem 0.68rem;
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.76rem;
  font-weight: 700;
  white-space: nowrap;
`

const SelectedPostGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 320px);
  gap: 0.7rem;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`

const SubActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.55rem;

  ${Button} {
    border-style: dashed;
  }
`

const ListTable = styled.table`
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
    padding: 0.45rem 0.4rem;
    text-align: left;
    font-size: 0.79rem;
    color: ${({ theme }) => theme.colors.gray12};
    vertical-align: middle;
  }

  th {
    font-size: 0.74rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-weight: 700;
  }

  tbody tr:last-of-type td {
    border-bottom: 0;
  }

  td.title {
    max-width: 320px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`

const SortHeaderButton = styled.button`
  border: 0;
  background: transparent;
  padding: 0;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.74rem;
  font-weight: 700;
  cursor: pointer;
`

const VisibilityBadge = styled.span`
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.16rem 0.46rem;
  font-size: 0.72rem;
  border: 1px solid ${({ theme }) => theme.colors.gray7};

  &[data-tone="PRIVATE"] {
    color: ${({ theme }) => theme.colors.gray11};
    background: ${({ theme }) => theme.colors.gray3};
  }

  &[data-tone="PUBLIC_UNLISTED"] {
    color: ${({ theme }) => theme.colors.blue11};
    background: ${({ theme }) => theme.colors.blue3};
    border-color: ${({ theme }) => theme.colors.blue7};
  }

  &[data-tone="PUBLIC_LISTED"] {
    color: ${({ theme }) => theme.colors.green11};
    background: ${({ theme }) => theme.colors.green3};
    border-color: ${({ theme }) => theme.colors.green7};
  }
`

const InlineActions = styled.div`
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
`

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.42);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 120;
  padding: 1rem;
`

const ConfirmModal = styled.div`
  width: min(440px, 100%);
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  background: ${({ theme }) => theme.colors.gray1};
  padding: 0.9rem;

  h4 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0 0 0.85rem;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.45;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
`

const EditorPane = styled.section`
  min-width: 0;
`

const PreviewPane = styled(EditorPane)``

const PaneHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.55rem;
`

const PaneTitle = styled.h3`
  margin: 0;
  font-size: 0.92rem;
  color: ${({ theme }) => theme.colors.gray12};
`

const PaneDescription = styled.p`
  margin: 0.18rem 0 0;
  font-size: 0.78rem;
  color: ${({ theme }) => theme.colors.gray11};
  line-height: 1.5;
`

const PaneChip = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.74rem;
  font-weight: 700;
  min-height: 30px;
  padding: 0 0.62rem;
`

const ContentInput = styled.textarea`
  width: 100%;
  min-height: 560px;
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  border-radius: 16px;
  padding: 1rem 1.05rem;
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  line-height: 1.7;
  font-size: 0.94rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace;
  resize: vertical;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.04);
`

const PreviewCard = styled.div`
  min-height: 560px;
  max-height: 820px;
  overflow: auto;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  padding: 0.15rem 1.05rem 1rem;

  > .aq-markdown {
    margin-top: 0.35rem;
  }
`

const EditorInsightGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.6rem;
  margin-bottom: 0.8rem;

  @media (max-width: 980px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`

const EditorInsightCard = styled.div`
  display: grid;
  gap: 0.2rem;
  min-width: 0;
  padding: 0.72rem 0.78rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.74rem;
    font-weight: 700;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.88rem;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
`

const EditorSupportNote = styled.p`
  margin: 0 0 0.85rem;
  padding: 0.72rem 0.82rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.8rem;
  line-height: 1.6;
`

const ResultPanel = styled.pre`
  margin: 0;
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
