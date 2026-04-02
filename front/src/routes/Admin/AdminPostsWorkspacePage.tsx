import styled from "@emotion/styled"
import { useQueryClient } from "@tanstack/react-query"
import { GetServerSideProps, NextPage } from "next"
import { IncomingMessage } from "http"
import Link from "next/link"
import { useRouter } from "next/router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { invalidatePublicPostReadCaches } from "src/apis/backend/posts"
import { apiFetch } from "src/apis/backend/client"
import useAuthSession from "src/hooks/useAuthSession"
import { pushRoute } from "src/libs/router"
import { AdminPageProps, getAdminPageProps } from "src/libs/server/adminPage"
import { serverApiFetch } from "src/libs/server/backend"
import { appendSsrDebugTiming, timed } from "src/libs/server/serverTiming"
import { isServerTempDraftPost } from "./editorTempDraft"

type PostListScope = "active" | "deleted"

type AdminPostListItem = {
  id: number
  title: string
  authorName: string
  published: boolean
  listed: boolean
  tempDraft?: boolean
  createdAt: string
  modifiedAt: string
  deletedAt?: string
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

type PostWriteResult = {
  id: number
}

type LocalDraftPayload = {
  title: string
  content: string
  summary: string
  thumbnailUrl: string
  tags: string[]
  category: string
  visibility: "PRIVATE" | "PUBLIC_UNLISTED" | "PUBLIC_LISTED"
  savedAt: string
}

type LocalDraftSummary = {
  title: string
  summary: string
  savedAt: string
  tagCount: number
  visibility: LocalDraftPayload["visibility"]
}

type ListSort = "CREATED_AT" | "CREATED_AT_ASC"
type WorkspaceConfirmState =
  | {
      kind: "delete" | "hardDelete"
      rowId: number
      rowTitle: string
      headline: string
      description: string
      confirmLabel: string
      tone: "danger"
    }
  | null

type WorkspaceToastState =
  | {
      tone: "success" | "error"
      text: string
      actionLabel?: string
      action?: {
        kind: "restore"
        rowId: number
        rowTitle: string
      }
    }
  | null

type WorkspaceRecentAction = {
  id: string
  tone: "success" | "error"
  label: string
  detail: string
  stateLabel: string
  occurredAt: string
}

type ListState = {
  rows: AdminPostListItem[]
  total: number
  loadedAt: string
}

type AdminPostsWorkspaceInitialSnapshot = {
  recentPosts: AdminPostListItem[]
  recentFetchedAt: string | null
  listState: ListState | null
}

type AdminPostsWorkspacePageProps = AdminPageProps & {
  initialSnapshot: AdminPostsWorkspaceInitialSnapshot
}

const LOCAL_DRAFT_STORAGE_KEY = "admin.editor.localDraft.v1"
const EDITOR_NEW_ROUTE_PATH = "/editor/new"
const DEFAULT_PAGE = "1"
const DEFAULT_PAGE_SIZE = "20"
const DEFAULT_SORT: ListSort = "CREATED_AT"
const LIST_SKELETON_ROW_COUNT = 5
const EMPTY_INITIAL_SNAPSHOT: AdminPostsWorkspaceInitialSnapshot = {
  recentPosts: [],
  recentFetchedAt: null,
  listState: null,
}

const toEditorRoute = (query?: Record<string, string>) => {
  if (query?.postId) {
    return `/editor/${encodeURIComponent(query.postId)}`
  }

  const search = query ? new URLSearchParams(query).toString() : ""
  return search ? `${EDITOR_NEW_ROUTE_PATH}?${search}` : EDITOR_NEW_ROUTE_PATH
}

const sanitizeNumberInput = (value: string, fallback: string) => {
  const digits = value.replace(/[^0-9]/g, "")
  return digits.length > 0 ? digits : fallback
}

const readLocalDraft = (): LocalDraftSummary | null => {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(LOCAL_DRAFT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LocalDraftPayload>
    if (!parsed || typeof parsed !== "object") return null

    const title = typeof parsed.title === "string" ? parsed.title.trim() : ""
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : ""
    const content = typeof parsed.content === "string" ? parsed.content.trim() : ""
    const savedAt = typeof parsed.savedAt === "string" ? parsed.savedAt : ""
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : []
    const visibility =
      parsed.visibility === "PRIVATE" || parsed.visibility === "PUBLIC_UNLISTED" || parsed.visibility === "PUBLIC_LISTED"
        ? parsed.visibility
        : "PUBLIC_LISTED"

    if (!title && !summary && !content) return null

    return {
      title: title || "제목 없는 임시저장",
      summary: summary || content.slice(0, 120),
      savedAt,
      tagCount: tags.length,
      visibility,
    }
  } catch {
    return null
  }
}

const formatDateTime = (value?: string) => {
  if (!value) return "-"
  return value.slice(0, 16).replace("T", " ")
}

const toVisibility = (published: boolean, listed: boolean) => {
  if (!published) return "PRIVATE" as const
  if (listed) return "PUBLIC_LISTED" as const
  return "PUBLIC_UNLISTED" as const
}

const visibilityLabel = (published: boolean, listed: boolean) => {
  const visibility = toVisibility(published, listed)
  if (visibility === "PRIVATE") return "비공개"
  if (visibility === "PUBLIC_UNLISTED") return "상세 공개"
  return "전체 공개"
}

const isWorkspaceTempDraft = (row: Pick<AdminPostListItem, "title" | "published" | "listed" | "tempDraft">) =>
  isServerTempDraftPost(row)

const getWorkspaceRowTitle = (row: Pick<AdminPostListItem, "title" | "published" | "listed" | "tempDraft">) =>
  isWorkspaceTempDraft(row) ? "임시 저장" : row.title

const visibilityLabelFromValue = (visibility: LocalDraftPayload["visibility"]) => {
  if (visibility === "PRIVATE") return "비공개"
  if (visibility === "PUBLIC_UNLISTED") return "상세 공개"
  return "전체 공개"
}

const buildRowTitle = (row: Pick<AdminPostListItem, "title" | "published" | "listed" | "tempDraft">) =>
  getWorkspaceRowTitle(row) || "제목 없는 글"

const buildListEndpoint = (scope: PostListScope, options: { page: string; pageSize: string; kw: string; sort: ListSort }) => {
  const query = new URLSearchParams({
    page: options.page,
    pageSize: options.pageSize,
    kw: options.kw,
  })

  const endpoint = scope === "deleted" ? "/post/api/v1/adm/posts/deleted" : "/post/api/v1/adm/posts"
  if (scope === "active") {
    query.set("sort", options.sort)
  }

  return `${endpoint}?${query.toString()}`
}

async function readJsonIfOk<T>(req: IncomingMessage, path: string): Promise<T | null> {
  try {
    const response = await serverApiFetch(req, path)
    if (!response.ok) return null
    const contentLength = response.headers.get("content-length")
    if (contentLength === "0") return null
    return (await response.json()) as T
  } catch {
    return null
  }
}

export const getAdminPostsWorkspacePageProps: GetServerSideProps<AdminPostsWorkspacePageProps> = async (context) => {
  const ssrStartedAt = performance.now()
  const baseResult = await timed(() => getAdminPageProps(context.req))
  if (!baseResult.ok) throw baseResult.error
  if ("redirect" in baseResult.value) return baseResult.value
  if (!("props" in baseResult.value)) return baseResult.value
  const baseProps = await baseResult.value.props
  const fetchedAt = new Date().toISOString()
  const listSourceResult = await timed(() =>
    readJsonIfOk<PageDto<AdminPostListItem>>(
      context.req,
      buildListEndpoint("active", {
        page: DEFAULT_PAGE,
        pageSize: DEFAULT_PAGE_SIZE,
        kw: "",
        sort: DEFAULT_SORT,
      })
    )
  )
  const listSource = listSourceResult.ok ? listSourceResult.value : null
  const recentPosts = [...(listSource?.content || [])]
    .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
    .slice(0, 5)
  const listState =
    listSource
      ? {
          rows: listSource.content || [],
          total: listSource.pageable?.totalElements ?? listSource.content?.length ?? 0,
          loadedAt: fetchedAt,
        }
      : null

  appendSsrDebugTiming(context.req, context.res, [
    {
      name: "admin-posts-auth",
      durationMs: baseResult.durationMs,
      description: "ok",
    },
    {
      name: "admin-posts-list",
      durationMs: listSourceResult.durationMs,
      description: listState ? "ok" : "empty",
    },
    {
      name: "admin-posts-ssr-total",
      durationMs: performance.now() - ssrStartedAt,
      description: "ready",
    },
  ])

  return {
    props: {
      ...baseProps,
      initialSnapshot: {
        recentPosts,
        recentFetchedAt: listSource ? fetchedAt : null,
        listState,
      },
    },
  }
}

export const AdminPostWorkspacePage: NextPage<AdminPostsWorkspacePageProps> = ({
  initialMember,
  initialSnapshot = EMPTY_INITIAL_SNAPSHOT,
}) => {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { me, authStatus } = useAuthSession()
  const sessionMember = authStatus === "loading" || authStatus === "unavailable" ? initialMember : me || initialMember
  const hasInitialRecentPosts = initialSnapshot.recentFetchedAt !== null
  const hasInitialListState = initialSnapshot.listState !== null

  const [localDraft, setLocalDraft] = useState<LocalDraftSummary | null>(null)
  const [recentPosts, setRecentPosts] = useState<AdminPostListItem[]>(() => initialSnapshot.recentPosts)
  const [isRecentLoading, setIsRecentLoading] = useState(!hasInitialRecentPosts)
  const [recentError, setRecentError] = useState("")

  const [listScope, setListScope] = useState<PostListScope>("active")
  const [listKw, setListKw] = useState("")
  const [listPage, setListPage] = useState(DEFAULT_PAGE)
  const [listPageSize, setListPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [listSort, setListSort] = useState<ListSort>(DEFAULT_SORT)
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const [isStickyToolbarCompact, setIsStickyToolbarCompact] = useState(false)
  const [listState, setListState] = useState<ListState>(() => initialSnapshot.listState || { rows: [], total: 0, loadedAt: "" })
  const [isListLoading, setIsListLoading] = useState(!hasInitialListState)
  const [listError, setListError] = useState("")
  const [confirmState, setConfirmState] = useState<WorkspaceConfirmState>(null)
  const [toast, setToast] = useState<WorkspaceToastState>(null)
  const [mutationPending, setMutationPending] = useState<{ rowId: number; kind: "delete" | "restore" | "hardDelete" } | null>(null)
  const [recentActions, setRecentActions] = useState<WorkspaceRecentAction[]>([])

  const continueSectionRef = useRef<HTMLDivElement | null>(null)
  const listSectionRef = useRef<HTMLElement | null>(null)
  const listRequestIdRef = useRef(0)
  const recentRequestIdRef = useRef(0)
  const skipInitialRecentFetchRef = useRef(hasInitialRecentPosts)
  const skipInitialListFetchRef = useRef(hasInitialListState)

  const loadRecentPosts = useCallback(async () => {
    const requestId = recentRequestIdRef.current + 1
    recentRequestIdRef.current = requestId
    setIsRecentLoading(true)
    setRecentError("")

    try {
      const data = await apiFetch<PageDto<AdminPostListItem>>(buildListEndpoint("active", {
        page: "1",
        pageSize: "8",
        kw: "",
        sort: DEFAULT_SORT,
      }))

      if (recentRequestIdRef.current !== requestId) return

      const rows = [...(data.content || [])]
        .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
        .slice(0, 5)
      setRecentPosts(rows)
    } catch (error) {
      if (recentRequestIdRef.current !== requestId) return
      const message = error instanceof Error ? error.message : String(error)
      setRecentError(`최근 글을 불러오지 못했습니다: ${message}`)
      setRecentPosts([])
    } finally {
      if (recentRequestIdRef.current === requestId) {
        setIsRecentLoading(false)
      }
    }
  }, [])

  const loadList = useCallback(async () => {
    const requestId = listRequestIdRef.current + 1
    listRequestIdRef.current = requestId
    setIsListLoading(true)
    setListError("")

    try {
      const data = await apiFetch<PageDto<AdminPostListItem>>(
        buildListEndpoint(listScope, {
          page: sanitizeNumberInput(listPage, DEFAULT_PAGE),
          pageSize: sanitizeNumberInput(listPageSize, DEFAULT_PAGE_SIZE),
          kw: listKw.trim(),
          sort: listSort,
        })
      )

      if (listRequestIdRef.current !== requestId) return

      setListState({
        rows: data.content || [],
        total: data.pageable?.totalElements ?? data.content?.length ?? 0,
        loadedAt: new Date().toISOString(),
      })
    } catch (error) {
      if (listRequestIdRef.current !== requestId) return
      const message = error instanceof Error ? error.message : String(error)
      setListError(`글 목록을 불러오지 못했습니다: ${message}`)
      setListState({ rows: [], total: 0, loadedAt: "" })
    } finally {
      if (listRequestIdRef.current === requestId) {
        setIsListLoading(false)
      }
    }
  }, [listKw, listPage, listPageSize, listScope, listSort])

  useEffect(() => {
    setLocalDraft(readLocalDraft())
    if (skipInitialRecentFetchRef.current) {
      skipInitialRecentFetchRef.current = false
      return
    }
    void loadRecentPosts()
  }, [loadRecentPosts])

  useEffect(() => {
    if (skipInitialListFetchRef.current) {
      skipInitialListFetchRef.current = false
      return
    }
    const timer = window.setTimeout(() => {
      void loadList()
    }, 140)
    return () => window.clearTimeout(timer)
  }, [loadList])

  useEffect(() => {
    if (!router.isReady) return
    if (router.query.surface !== "manage") return
    const timer = window.setTimeout(() => {
      listSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 160)
    return () => window.clearTimeout(timer)
  }, [router.isReady, router.query.surface])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => {
      setToast((current) => (current === toast ? null : current))
    }, toast.action ? 7000 : 4200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!confirmState) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setConfirmState(null)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [confirmState])

  const openWriteRoute = useCallback(
    async (query?: Record<string, string>) => {
      await pushRoute(router, toEditorRoute(query))
    },
    [router]
  )

  const showToast = useCallback((next: WorkspaceToastState) => {
    setToast(next)
  }, [])

  const pushRecentAction = useCallback(
    (tone: WorkspaceRecentAction["tone"], label: string, detail: string, stateLabel: string) => {
    const entry: WorkspaceRecentAction = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tone,
      label,
      detail,
      stateLabel,
      occurredAt: new Date().toISOString(),
    }

    setRecentActions((current) => [entry, ...current].slice(0, 4))
    },
    []
  )

  const performDeletePost = useCallback(
    async (row: Pick<AdminPostListItem, "id" | "title" | "published" | "listed" | "tempDraft">) => {
      try {
        setMutationPending({ rowId: row.id, kind: "delete" })
        setToast(null)
        await apiFetch(`/post/api/v1/posts/${row.id}`, { method: "DELETE" })
        await invalidatePublicPostReadCaches(queryClient, row.id)
        await Promise.all([loadList(), loadRecentPosts()])
        showToast({
          tone: "success",
          text: `#${row.id} ${buildRowTitle(row)} 글을 삭제했습니다.`,
          actionLabel: "되돌리기",
          action: {
            kind: "restore",
            rowId: row.id,
            rowTitle: buildRowTitle(row),
          },
        })
        pushRecentAction("success", "글 삭제", `#${row.id} ${buildRowTitle(row)} 글을 삭제했습니다.`, "되돌리기 가능")
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        showToast({ tone: "error", text: `삭제 실패: ${message}` })
        pushRecentAction("error", "삭제 실패", `#${row.id} ${buildRowTitle(row)} · ${message}`, "재시도 필요")
      } finally {
        setMutationPending(null)
      }
    },
    [loadList, loadRecentPosts, pushRecentAction, queryClient, showToast]
  )

  const performRestorePost = useCallback(
    async (row: Pick<AdminPostListItem, "id" | "title" | "published" | "listed" | "tempDraft">) => {
      try {
        setMutationPending({ rowId: row.id, kind: "restore" })
        setToast(null)
        await apiFetch<PostWriteResult>(`/post/api/v1/adm/posts/${row.id}/restore`, { method: "POST" })
        await invalidatePublicPostReadCaches(queryClient, row.id)
        await Promise.all([loadList(), loadRecentPosts()])
        showToast({
          tone: "success",
          text: `#${row.id} ${buildRowTitle(row)} 글을 복구했습니다.`,
        })
        pushRecentAction("success", "글 복구", `#${row.id} ${buildRowTitle(row)} 글을 복구했습니다.`, "복구 완료")
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        showToast({ tone: "error", text: `복구 실패: ${message}` })
        pushRecentAction("error", "복구 실패", `#${row.id} ${buildRowTitle(row)} · ${message}`, "재시도 필요")
      } finally {
        setMutationPending(null)
      }
    },
    [loadList, loadRecentPosts, pushRecentAction, queryClient, showToast]
  )

  const performHardDeletePost = useCallback(
    async (row: Pick<AdminPostListItem, "id" | "title" | "published" | "listed" | "tempDraft">) => {
      try {
        setMutationPending({ rowId: row.id, kind: "hardDelete" })
        setToast(null)
        await apiFetch(`/post/api/v1/adm/posts/${row.id}/hard`, { method: "DELETE" })
        await invalidatePublicPostReadCaches(queryClient, row.id)
        await Promise.all([loadList(), loadRecentPosts()])
        showToast({
          tone: "success",
          text: `#${row.id} ${buildRowTitle(row)} 글을 영구삭제했습니다.`,
        })
        pushRecentAction("success", "영구삭제", `#${row.id} ${buildRowTitle(row)} 글을 영구삭제했습니다.`, "영구 반영")
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        showToast({ tone: "error", text: `영구삭제 실패: ${message}` })
        pushRecentAction("error", "영구삭제 실패", `#${row.id} ${buildRowTitle(row)} · ${message}`, "재시도 필요")
      } finally {
        setMutationPending(null)
      }
    },
    [loadList, loadRecentPosts, pushRecentAction, queryClient, showToast]
  )

  const handleDeletePost = useCallback(
    async (row: AdminPostListItem) => {
      setConfirmState({
        kind: "delete",
        rowId: row.id,
        rowTitle: buildRowTitle(row),
        headline: "글을 삭제할까요?",
        description: "삭제한 글은 삭제 글 탭에서 바로 복구할 수 있습니다.",
        confirmLabel: "삭제하기",
        tone: "danger",
      })
    },
    []
  )

  const handleRestorePost = useCallback(
    async (row: AdminPostListItem) => {
      await performRestorePost(row)
    },
    [performRestorePost]
  )

  const handleHardDeletePost = useCallback(
    async (row: AdminPostListItem) => {
      setConfirmState({
        kind: "hardDelete",
        rowId: row.id,
        rowTitle: buildRowTitle(row),
        headline: "글을 영구삭제할까요?",
        description: "영구삭제 후에는 복구할 수 없습니다.",
        confirmLabel: "영구삭제",
        tone: "danger",
      })
    },
    []
  )

  const handleContinueRecent = useCallback(
    async (row: AdminPostListItem) => {
      await openWriteRoute({ postId: String(row.id) })
    },
    [openWriteRoute]
  )

  const renderRecentEdited = () => {
    if (isRecentLoading) {
      return (
        <RecentListSkeleton aria-hidden="true">
          <span />
          <span />
          <span />
        </RecentListSkeleton>
      )
    }

    if (recentError) {
      return <MutedText>{recentError}</MutedText>
    }

    if (recentPosts.length === 0) {
      return <MutedText>이어 쓸 원고 없음</MutedText>
    }

    return (
      <RecentPostList>
        {recentPosts.map((row) => (
          <li key={row.id}>
            <button type="button" onClick={() => void handleContinueRecent(row)}>
              <div>
                <strong>{getWorkspaceRowTitle(row)}</strong>
                <span>{formatDateTime(row.modifiedAt)}</span>
              </div>
              <RecentMeta>
                <VisibilityBadge data-tone={toVisibility(row.published, row.listed)}>
                  {visibilityLabel(row.published, row.listed)}
                </VisibilityBadge>
                <span>이어서 쓰기</span>
              </RecentMeta>
            </button>
          </li>
        ))}
      </RecentPostList>
    )
  }

  const hasAnyResumeTarget = Boolean(localDraft) || recentPosts.length > 0
  const shouldRenderResumeGrid = isRecentLoading || Boolean(recentError) || hasAnyResumeTarget
  const hasListFilters = Boolean(
    listKw.trim() ||
      listScope !== "active" ||
      sanitizeNumberInput(listPage, DEFAULT_PAGE) !== DEFAULT_PAGE ||
      sanitizeNumberInput(listPageSize, DEFAULT_PAGE_SIZE) !== DEFAULT_PAGE_SIZE ||
      listSort !== DEFAULT_SORT
  )
  const listSummaryParts = useMemo(() => {
    const parts = [listScope === "active" ? "활성 글" : "삭제 글"]
    if (listKw.trim()) parts.push(`검색 "${listKw.trim()}"`)
    if (listScope === "active") parts.push(listSort === "CREATED_AT" ? "최신순" : "오래된순")
    parts.push(`${sanitizeNumberInput(listPageSize, DEFAULT_PAGE_SIZE)}개씩`)
    if (sanitizeNumberInput(listPage, DEFAULT_PAGE) !== DEFAULT_PAGE) {
      parts.push(`${sanitizeNumberInput(listPage, DEFAULT_PAGE)}페이지`)
    }
    return parts
  }, [listKw, listPage, listPageSize, listScope, listSort])

  const handleResetListFilters = useCallback(() => {
    setListScope("active")
    setListKw("")
    setListPage(DEFAULT_PAGE)
    setListPageSize(DEFAULT_PAGE_SIZE)
    setListSort(DEFAULT_SORT)
  }, [])

  const handleToastAction = useCallback(async () => {
    if (!toast?.action) return
    if (toast.action.kind === "restore") {
      await performRestorePost({
        id: toast.action.rowId,
        title: toast.action.rowTitle,
        published: false,
        listed: false,
        tempDraft: false,
      })
    }
  }, [performRestorePost, toast])

  const handleConfirmAction = useCallback(async () => {
    if (!confirmState) return
    const row = {
      id: confirmState.rowId,
      title: confirmState.rowTitle,
      published: false,
      listed: false,
      tempDraft: false,
    }
    setConfirmState(null)
    if (confirmState.kind === "delete") {
      await performDeletePost(row)
      return
    }
    await performHardDeletePost(row)
  }, [confirmState, performDeletePost, performHardDeletePost])

  if (!sessionMember) return null

  return (
    <Main>
      <PageHeader>
        <ContextLine aria-label="현재 위치" />
      </PageHeader>

      <HeroSection>
        <HeroLabel>지금 할 일</HeroLabel>
        <HeroLayout>
          <HeroCopy>
            <h1>글 작성</h1>
          </HeroCopy>
          <HeroActions>
            <PrimaryCta type="button" onClick={() => void openWriteRoute()}>
              새 글 작성
            </PrimaryCta>
            <SecondaryLinkButton
              type="button"
              onClick={() => continueSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              최근 작업 이어쓰기
            </SecondaryLinkButton>
            <SecondaryLinkButton
              type="button"
              onClick={() => listSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              글 관리
            </SecondaryLinkButton>
          </HeroActions>
        </HeroLayout>
      </HeroSection>

      <ResumeSection ref={continueSectionRef}>
        <SectionHeading>
          <div>
            <h2>이어서 쓰기</h2>
          </div>
        </SectionHeading>
        {shouldRenderResumeGrid ? (
          <ResumeGrid>
            <ResumeCard data-emphasis={localDraft ? "strong" : "soft"}>
              <ResumeHeader>
                <strong>브라우저 임시저장</strong>
                {localDraft?.savedAt ? <span>{formatDateTime(localDraft.savedAt)}</span> : null}
              </ResumeHeader>
              {localDraft ? (
                <>
                  <ResumeTitle>{localDraft.title}</ResumeTitle>
                  <ResumeDescription>{localDraft.summary || "저장된 본문을 이어서 쓸 수 있습니다."}</ResumeDescription>
                  <ResumeMeta>
                    <VisibilityBadge data-tone={localDraft.visibility}>
                      {visibilityLabelFromValue(localDraft.visibility)}
                    </VisibilityBadge>
                    <span>{localDraft.tagCount > 0 ? `태그 ${localDraft.tagCount}개` : "태그 없음"}</span>
                  </ResumeMeta>
                  <ActionRow>
                    <PrimaryInlineButton type="button" onClick={() => void openWriteRoute({ source: "local-draft" })}>
                      이어서 쓰기
                    </PrimaryInlineButton>
                  </ActionRow>
                </>
              ) : (
                <EmptyInlineState>
                  <strong>저장된 임시 저장 없음</strong>
                </EmptyInlineState>
              )}
            </ResumeCard>

            <ResumeCard data-emphasis="soft">
              <ResumeHeader>
                <strong>최근 수정한 글</strong>
                {isRecentLoading ? <span>불러오는 중</span> : null}
              </ResumeHeader>
              {renderRecentEdited()}
            </ResumeCard>
          </ResumeGrid>
        ) : (
          <WorkspaceEmpty>
            <strong>이어 쓸 원고 없음</strong>
            <PrimaryInlineButton type="button" onClick={() => void openWriteRoute()}>
              새 글 작성
            </PrimaryInlineButton>
          </WorkspaceEmpty>
        )}
      </ResumeSection>

      <ListSection ref={listSectionRef}>
        <SectionHeading>
          <div>
            <h2>글 목록</h2>
          </div>
          <ListMeta>
            <GhostButton type="button" onClick={() => void Promise.all([loadList(), loadRecentPosts()])}>
              새로고침
            </GhostButton>
          </ListMeta>
        </SectionHeading>

        <StickyFilterToolbar data-compact={isStickyToolbarCompact}>
          <FilterRail>
            <ScopeTabs role="tablist" aria-label="글 범위 선택">
              <ScopeTabButton type="button" data-active={listScope === "active"} onClick={() => setListScope("active")}>
                활성 글
              </ScopeTabButton>
              <ScopeTabButton type="button" data-active={listScope === "deleted"} onClick={() => setListScope("deleted")}>
                삭제 글
              </ScopeTabButton>
            </ScopeTabs>
            <SearchField>
              <label htmlFor="workspace-post-search">검색어</label>
              <input
                id="workspace-post-search"
                placeholder={listScope === "active" ? "제목이나 본문 검색" : "삭제된 글 검색"}
                value={listKw}
                onChange={(event) => {
                  setListPage(DEFAULT_PAGE)
                  setListKw(event.target.value)
                }}
              />
            </SearchField>
          </FilterRail>

          {!isStickyToolbarCompact ? (
            <AdvancedDisclosure open={isAdvancedOpen}>
              <summary
                onClick={(event) => {
                  event.preventDefault()
                  setIsAdvancedOpen((prev) => !prev)
                }}
              >
                <strong>고급 검색</strong>
                <span>{isAdvancedOpen ? "닫기" : "열기"}</span>
              </summary>
            {isAdvancedOpen && (
                <div className="body">
                  <AdvancedGrid>
                    <FieldBox>
                      <label htmlFor="workspace-page">페이지</label>
                      <input
                        id="workspace-page"
                        type="number"
                        min={1}
                        value={listPage}
                        onChange={(event) => setListPage(sanitizeNumberInput(event.target.value, DEFAULT_PAGE))}
                      />
                    </FieldBox>
                    <FieldBox>
                      <label htmlFor="workspace-page-size">페이지 크기</label>
                      <input
                        id="workspace-page-size"
                        type="number"
                        min={1}
                        max={30}
                        value={listPageSize}
                        onChange={(event) => setListPageSize(sanitizeNumberInput(event.target.value, DEFAULT_PAGE_SIZE))}
                      />
                    </FieldBox>
                    {listScope === "active" && (
                      <FieldBox>
                        <label htmlFor="workspace-sort">정렬</label>
                        <select
                          id="workspace-sort"
                          value={listSort}
                          onChange={(event) => setListSort(event.target.value as ListSort)}
                        >
                          <option value="CREATED_AT">최신순</option>
                          <option value="CREATED_AT_ASC">오래된순</option>
                        </select>
                      </FieldBox>
                    )}
                  </AdvancedGrid>
                </div>
              )}
            </AdvancedDisclosure>
          ) : null}

          <FilterSummaryBar>
            <div className="summaryCopy">
              <strong>현재 조건</strong>
              <SummaryPillRow>
                {listSummaryParts.map((part) => (
                  <SummaryPill key={part}>{part}</SummaryPill>
                ))}
                <SummaryPill data-tone="neutral">
                  총 {listState.total}건{listState.loadedAt ? ` · ${formatDateTime(listState.loadedAt)} 기준` : ""}
                </SummaryPill>
              </SummaryPillRow>
            </div>
            <ToolbarUtilityRow>
              <GhostButton type="button" onClick={() => setIsStickyToolbarCompact((prev) => !prev)}>
                {isStickyToolbarCompact ? "전체 보기" : "요약만 보기"}
              </GhostButton>
              {hasListFilters ? (
                <GhostButton type="button" onClick={handleResetListFilters}>
                  조건 초기화
                </GhostButton>
              ) : null}
            </ToolbarUtilityRow>
          </FilterSummaryBar>
        </StickyFilterToolbar>

        <RecentActionPanel aria-live="polite">
          <div className="panelHead">
            <strong>최근 작업</strong>
            <span>삭제/복구 작업의 마지막 결과를 빠르게 다시 확인할 수 있습니다.</span>
          </div>
          {recentActions.length > 0 ? (
            <RecentActionList>
              {recentActions.map((entry) => (
                <li key={entry.id} data-tone={entry.tone}>
                  <div className="copy">
                    <div className="headline">
                      <strong>{entry.label}</strong>
                      <span className="stateLabel">{entry.stateLabel}</span>
                    </div>
                    <p>{entry.detail}</p>
                  </div>
                  <span className="time">{formatDateTime(entry.occurredAt)}</span>
                </li>
              ))}
            </RecentActionList>
          ) : (
            <MutedText>아직 기록된 작업이 없습니다. 삭제, 복구, 영구삭제 결과가 여기에 쌓입니다.</MutedText>
          )}
        </RecentActionPanel>

        {isListLoading ? (
          <ListCard aria-hidden="true">
            <ListSkeleton>
              <div className="desktopRows">
                <div className="headerRow">
                  <span className="idCell">ID</span>
                  <span>제목</span>
                  <span className="dateCell">{listScope === "active" ? "수정일" : "삭제일"}</span>
                  <span className="actionCell">작업</span>
                </div>
                {Array.from({ length: LIST_SKELETON_ROW_COUNT }, (_, index) => (
                  <div className="row" key={`desktop-skeleton-${index}`}>
                    <div className="cell idCell">
                      <span className="line short" />
                    </div>
                    <div className="cell titleCell">
                      <span className="line medium" />
                      <span className="line wide" />
                      <span className="line short muted" />
                    </div>
                    <div className="cell dateCell">
                      <span className="line medium" />
                    </div>
                    <div className="cell actionCell">
                      <span className="line short" />
                      <span className="line short" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mobileCards">
                {Array.from({ length: 3 }, (_, index) => (
                  <article key={`mobile-skeleton-${index}`}>
                    <div className="metaRow">
                      <span className="line short" />
                      <span className="line short" />
                    </div>
                    <span className="line wide" />
                    <span className="line medium muted" />
                    <span className="line short muted" />
                    <div className="actionRow">
                      <span className="line short" />
                      <span className="line short" />
                    </div>
                  </article>
                ))}
              </div>
            </ListSkeleton>
          </ListCard>
        ) : listError ? (
          <ListEmptyState>
            <strong>목록을 불러오지 못했습니다.</strong>
            <p>{listError}</p>
            <ActionRow>
              <PrimaryInlineButton type="button" onClick={() => void loadList()}>
                다시 시도
              </PrimaryInlineButton>
            </ActionRow>
          </ListEmptyState>
        ) : listState.rows.length === 0 ? (
          <ListEmptyState>
            <strong>{listScope === "active" ? "아직 글이 없습니다." : "삭제된 글이 없습니다."}</strong>
            <p>
              {listScope === "active"
                ? "바로 새 글을 시작하거나, 검색 조건을 조정해 다른 결과를 확인하세요."
                : "복구할 글이 없다면 활성 글 범위로 돌아가 새 작업을 시작하세요."}
            </p>
            <ActionRow>
              <PrimaryInlineButton type="button" onClick={() => void openWriteRoute()}>
                새 글 작성
              </PrimaryInlineButton>
              {listKw.trim() ? (
                <GhostButton
                  type="button"
                  onClick={() => {
                    setListKw("")
                    setListPage(DEFAULT_PAGE)
                  }}
                >
                  검색 초기화
                </GhostButton>
              ) : null}
            </ActionRow>
          </ListEmptyState>
        ) : (
          <ListCard>
            <DesktopListTable>
              <thead>
                <tr>
                  <th className="idCell">ID</th>
                  <th>제목</th>
                  <th className="dateCell">{listScope === "active" ? "수정일" : "삭제일"}</th>
                  <th className="actionCell">작업</th>
                </tr>
              </thead>
              <tbody>
                {listState.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="idCell">#{row.id}</td>
                    <td>
                      <TitleCell>
                        <div className="titleRow">
                          <strong>{getWorkspaceRowTitle(row)}</strong>
                          <VisibilityBadge data-tone={toVisibility(row.published, row.listed)}>
                            {visibilityLabel(row.published, row.listed)}
                          </VisibilityBadge>
                        </div>
                        <span>{row.authorName || "작성자 미상"}</span>
                      </TitleCell>
                    </td>
                    <td className="dateCell">{formatDateTime(listScope === "active" ? row.modifiedAt : row.deletedAt)}</td>
                    <td className="actionCell">
                      <RowActions>
                        {listScope === "active" ? (
                          <>
                            <RowPrimaryButton type="button" onClick={() => void handleContinueRecent(row)}>
                              수정
                            </RowPrimaryButton>
                            <DangerTextButton
                              type="button"
                              disabled={Boolean(mutationPending)}
                              onClick={() => void handleDeletePost(row)}
                            >
                              삭제
                            </DangerTextButton>
                          </>
                        ) : (
                          <>
                            <RowPrimaryButton
                              type="button"
                              disabled={Boolean(mutationPending)}
                              onClick={() => void handleRestorePost(row)}
                            >
                              복구
                            </RowPrimaryButton>
                            <DangerTextButton
                              type="button"
                              disabled={Boolean(mutationPending)}
                              onClick={() => void handleHardDeletePost(row)}
                            >
                              영구삭제
                            </DangerTextButton>
                          </>
                        )}
                      </RowActions>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DesktopListTable>

            <MobileCardList>
              {listState.rows.map((row) => (
                <article key={`mobile-${row.id}`}>
                  <header>
                    <span className="id">#{row.id}</span>
                    <VisibilityBadge data-tone={toVisibility(row.published, row.listed)}>
                      {visibilityLabel(row.published, row.listed)}
                    </VisibilityBadge>
                  </header>
                  <strong>{getWorkspaceRowTitle(row)}</strong>
                  <p>{row.authorName || "작성자 미상"}</p>
                  <span className="date">{formatDateTime(listScope === "active" ? row.modifiedAt : row.deletedAt)}</span>
                  <div className="actions">
                    {listScope === "active" ? (
                      <>
                        <RowPrimaryButton type="button" onClick={() => void handleContinueRecent(row)}>
                          수정
                        </RowPrimaryButton>
                        <DangerTextButton
                          type="button"
                          disabled={Boolean(mutationPending)}
                          onClick={() => void handleDeletePost(row)}
                        >
                          삭제
                        </DangerTextButton>
                      </>
                    ) : (
                      <>
                        <RowPrimaryButton
                          type="button"
                          disabled={Boolean(mutationPending)}
                          onClick={() => void handleRestorePost(row)}
                        >
                          복구
                        </RowPrimaryButton>
                        <DangerTextButton
                          type="button"
                          disabled={Boolean(mutationPending)}
                          onClick={() => void handleHardDeletePost(row)}
                        >
                          영구삭제
                        </DangerTextButton>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </MobileCardList>
          </ListCard>
        )}
      </ListSection>

      <SupportSection>
        <SectionHeading>
          <div>
            <h2>지원 도구</h2>
          </div>
        </SectionHeading>
        <SupportList>
          <Link href="/admin/profile" passHref legacyBehavior>
            <SupportLink>
              <SupportCopy>
                <strong>프로필 정리</strong>
              </SupportCopy>
              <SupportMeta>프로필 열기</SupportMeta>
            </SupportLink>
          </Link>
          <Link href="/admin/dashboard" passHref legacyBehavior>
            <SupportLink>
              <SupportCopy>
                <strong>운영 대시보드</strong>
              </SupportCopy>
              <SupportMeta>대시보드 열기</SupportMeta>
            </SupportLink>
          </Link>
        </SupportList>
      </SupportSection>

      {toast ? (
        <ToastViewport data-tone={toast.tone} role="status" aria-live="polite">
          <div className="copy">
            <strong>{toast.tone === "error" ? "작업 실패" : "작업 완료"}</strong>
            <span>{toast.text}</span>
          </div>
          <div className="actions">
            {toast.action ? (
              <ToastActionButton type="button" onClick={() => void handleToastAction()}>
                {toast.actionLabel}
              </ToastActionButton>
            ) : null}
            <ToastDismissButton type="button" onClick={() => setToast(null)}>
              닫기
            </ToastDismissButton>
          </div>
        </ToastViewport>
      ) : null}

      {confirmState ? (
        <ConfirmBackdrop role="presentation" onClick={() => setConfirmState(null)}>
          <ConfirmDialog
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-confirm-title"
            aria-describedby="workspace-confirm-description"
            onClick={(event) => event.stopPropagation()}
          >
            <strong id="workspace-confirm-title">{confirmState.headline}</strong>
            <p id="workspace-confirm-description">
              <span className="rowTitle">#{confirmState.rowId} {confirmState.rowTitle}</span>
              <span>{confirmState.description}</span>
            </p>
            <ActionRow>
              <GhostButton type="button" onClick={() => setConfirmState(null)}>
                취소
              </GhostButton>
              <ConfirmButton type="button" data-tone={confirmState.tone} onClick={() => void handleConfirmAction()}>
                {confirmState.confirmLabel}
              </ConfirmButton>
            </ActionRow>
          </ConfirmDialog>
        </ConfirmBackdrop>
      ) : null}
    </Main>
  )
}

export default AdminPostWorkspacePage

const Main = styled.main`
  max-width: 1120px;
  margin: 0 auto;
  padding: 1.2rem 1rem 2.8rem;
  display: grid;
  gap: 1.2rem;

  @media (max-width: 767px) {
    gap: 0.9rem;
    padding: 1rem 0.85rem 2rem;
  }
`

const PageHeader = styled.section`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
`

const ContextLine = styled.div`
  display: none;
`

const HeroSection = styled.section`
  display: grid;
  gap: 0.8rem;
  padding: 1.25rem 1.15rem;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.blue7};
  background: ${({ theme }) =>
    theme.scheme === "light"
      ? "linear-gradient(180deg, rgba(255, 255, 255, 0.99) 0%, rgba(241, 247, 255, 0.96) 100%)"
      : "linear-gradient(180deg, rgba(29, 78, 216, 0.12) 0%, rgba(15, 23, 42, 0.95) 100%)"};
`

const HeroLabel = styled.span`
  display: inline-flex;
  width: fit-content;
  min-height: 28px;
  align-items: center;
  padding: 0 0.7rem;
  border-radius: 999px;
  background: rgba(96, 165, 250, 0.14);
  color: ${({ theme }) => theme.colors.blue9};
  font-size: 0.74rem;
  font-weight: 800;
`

const HeroLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: center;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`

const HeroCopy = styled.div`
  display: grid;
  gap: 0.42rem;

  h1 {
    margin: 0;
    font-size: clamp(1.65rem, 3vw, 2.1rem);
    letter-spacing: -0.04em;
  }

  p {
    margin: 0;
    max-width: 34rem;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.55;
  }
`

const HeroActions = styled.div`
  display: grid;
  gap: 0.7rem;
  justify-items: end;

  @media (max-width: 900px) {
    justify-items: stretch;
  }
`

const baseButton = ({ theme }: { theme: any }) => `
  min-height: 48px;
  border-radius: 12px;
  border: 1px solid ${theme.colors.gray5};
  font-size: 0.95rem;
  font-weight: 800;
  cursor: pointer;
`

const PrimaryCta = styled.button`
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.blue9};
  padding: 0;
  font-size: 1rem;
  font-weight: 800;
  cursor: pointer;
`

const SecondaryLinkButton = styled.button`
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
`

const ResumeSection = styled.section`
  display: grid;
  gap: 0.85rem;
`

const SectionHeading = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.75rem;

  h2 {
    margin: 0;
    font-size: 1.22rem;
    font-weight: 800;
    letter-spacing: -0.03em;
  }

  p {
    margin: 0.15rem 0 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.9rem;
  }

  @media (max-width: 767px) {
    flex-direction: column;
    align-items: stretch;
  }
`

const SupportSection = styled.section`
  display: grid;
  gap: 0.8rem;

  h2 {
    font-weight: 800;
  }
`

const SupportList = styled.div`
  display: grid;
  gap: 0.75rem;
`

const SupportLink = styled.a`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.95rem 1rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};
  text-decoration: none;

  @media (max-width: 767px) {
    flex-direction: column;
    align-items: flex-start;
  }
`

const SupportCopy = styled.div`
  display: grid;
  gap: 0.2rem;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.96rem;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.88rem;
    line-height: 1.45;
  }
`

const SupportMeta = styled.span`
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.84rem;
  font-weight: 700;
  white-space: nowrap;
`

const ResumeGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.9rem;

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
`

const ResumeCard = styled.article<{ "data-emphasis"?: "strong" | "soft" }>`
  display: grid;
  gap: 0.7rem;
  padding: 1rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme, "data-emphasis": emphasis }) =>
    emphasis === "strong" ? "rgba(29, 78, 216, 0.08)" : theme.colors.gray2};
`

const ResumeHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;

  strong {
    font-size: 0.94rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
    white-space: nowrap;
  }
`

const ResumeTitle = styled.strong`
  font-size: 1.02rem;
  line-height: 1.4;
`

const ResumeDescription = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.gray11};
  line-height: 1.55;
`

const EmptyInlineState = styled.div`
  display: grid;
  gap: 0.22rem;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.55;
  }
`

const ResumeMeta = styled.div`
  display: flex;
  gap: 0.55rem;
  align-items: center;
  flex-wrap: wrap;

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
  }
`

const VisibilityBadge = styled.span<{ "data-tone": string }>`
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  padding: 0 0.72rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 800;
  border: 1px solid
    ${({ theme, "data-tone": tone }) =>
      tone === "PRIVATE"
        ? theme.colors.gray7
        : tone === "PUBLIC_UNLISTED"
          ? theme.colors.blue8
          : theme.colors.green8};
  color: ${({ theme, "data-tone": tone }) =>
    tone === "PRIVATE"
      ? theme.colors.gray11
      : tone === "PUBLIC_UNLISTED"
        ? theme.colors.blue9
        : theme.colors.green9};
  background: ${({ theme, "data-tone": tone }) =>
    tone === "PRIVATE"
      ? theme.colors.gray2
      : tone === "PUBLIC_UNLISTED"
        ? "rgba(59, 130, 246, 0.12)"
        : "rgba(34, 197, 94, 0.12)"};
`

const ActionRow = styled.div`
  display: flex;
  gap: 0.65rem;
  flex-wrap: wrap;
`

const PrimaryInlineButton = styled.button`
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.blue9};
  padding: 0;
  font-size: 0.92rem;
  font-weight: 800;
  cursor: pointer;
`

const GhostButton = styled.button`
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
`

const WorkspaceEmpty = styled.div`
  display: grid;
  gap: 0.45rem;
  padding: 1rem;
  border-radius: 16px;
  border: 1px dashed ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};

  strong {
    font-size: 1rem;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.55;
  }
`

const MutedText = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.gray10};
  line-height: 1.55;
`

const RecentListSkeleton = styled.div`
  display: grid;
  gap: 0.55rem;

  span {
    display: block;
    height: 56px;
    border-radius: 14px;
    background: ${({ theme }) =>
      theme.scheme === "light"
        ? "linear-gradient(90deg, rgba(148, 163, 184, 0.16), rgba(148, 163, 184, 0.28), rgba(148, 163, 184, 0.16))"
        : "linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.1), rgba(255,255,255,0.06))"};
  }
`

const RecentPostList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.6rem;

  li button {
    width: 100%;
    padding: 0.85rem 0.9rem;
    border-radius: 14px;
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    background: ${({ theme }) => theme.colors.gray1};
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    text-align: left;
    cursor: pointer;
  }

  li button > div {
    display: grid;
    gap: 0.22rem;
    min-width: 0;
  }

  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
  }
`

const RecentMeta = styled.div`
  display: grid;
  justify-items: end;
  gap: 0.28rem;

  span:last-of-type {
    color: ${({ theme }) => theme.colors.gray12};
    font-weight: 700;
  }
`

const ListSection = styled.section`
  display: grid;
  gap: 0.8rem;
`

const ListMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
  }
`

const StickyFilterToolbar = styled.div`
  position: sticky;
  top: calc(var(--app-header-height, 64px) + 0.55rem);
  z-index: 12;
  display: grid;
  gap: 0.72rem;
  padding: 0.88rem 0.92rem;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: color-mix(in srgb, ${({ theme }) => theme.colors.gray1} 88%, transparent);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.12);

  @media (max-width: 767px) {
    top: calc(var(--app-header-height, 64px) + 0.35rem);
    padding: 0.8rem 0.82rem;
  }

  &[data-compact="true"] {
    gap: 0.56rem;
    padding-top: 0.72rem;
    padding-bottom: 0.72rem;
  }
`

const FilterRail = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.75rem;
  align-items: end;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`

const ScopeTabs = styled.div`
  display: inline-flex;
  gap: 0.4rem;
  flex-wrap: wrap;
`

const ScopeTabButton = styled.button<{ "data-active"?: boolean }>`
  ${({ theme }) => baseButton({ theme })};
  min-height: 42px;
  padding: 0 0.85rem;
  background: ${({ theme, "data-active": active }) => (active ? theme.colors.blue8 : theme.colors.gray2)};
  color: ${({ theme, "data-active": active }) => (active ? theme.colors.gray12 : theme.colors.gray12)};
  border-color: ${({ theme, "data-active": active }) => (active ? theme.colors.blue8 : theme.colors.gray5)};
`

const SearchField = styled.div`
  display: grid;
  gap: 0.3rem;

  label {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
    font-weight: 700;
  }

  input {
    min-height: 46px;
    border-radius: 12px;
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    background: ${({ theme }) => theme.colors.gray1};
    color: ${({ theme }) => theme.colors.gray12};
    padding: 0 0.95rem;
    font-size: 0.95rem;
  }
`

const AdvancedDisclosure = styled.details`
  display: grid;
  gap: 0.6rem;
  padding: 0.9rem 1rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};

  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  strong {
    font-size: 0.92rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
  }

  .body {
    display: grid;
    gap: 0.75rem;
  }
`

const AdvancedGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`

const FieldBox = styled.div`
  display: grid;
  gap: 0.3rem;

  label {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
    font-weight: 700;
  }

  input,
  select {
    min-height: 44px;
    border-radius: 12px;
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    background: ${({ theme }) => theme.colors.gray1};
    color: ${({ theme }) => theme.colors.gray12};
    padding: 0 0.85rem;
  }
`

const FilterSummaryBar = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.8rem;
  padding: 0.9rem 1rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};

  .summaryCopy {
    display: grid;
    gap: 0.45rem;
  }

  .summaryCopy > strong {
    font-size: 0.9rem;
    letter-spacing: -0.01em;
  }

  @media (max-width: 767px) {
    flex-direction: column;
    align-items: stretch;
  }
`

const ToolbarUtilityRow = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  flex-wrap: wrap;

  @media (max-width: 767px) {
    justify-content: flex-start;
  }
`

const SummaryPillRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`

const SummaryPill = styled.span<{ "data-tone"?: "neutral" }>`
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 0.72rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme, "data-tone": tone }) => (tone === "neutral" ? theme.colors.gray1 : theme.colors.gray3)};
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.78rem;
  font-weight: 700;
`

const RecentActionPanel = styled.section`
  display: grid;
  gap: 0.72rem;
  padding: 0.92rem 1rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};

  .panelHead {
    display: grid;
    gap: 0.18rem;
  }

  .panelHead > strong {
    font-size: 0.9rem;
    letter-spacing: -0.01em;
  }

  .panelHead > span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
    line-height: 1.5;
  }
`

const RecentActionList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.58rem;

  li {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.72rem;
    padding: 0.8rem 0.88rem;
    border-radius: 14px;
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    background: ${({ theme }) => theme.colors.gray1};
  }

  li[data-tone="error"] {
    border-color: ${({ theme }) => theme.colors.statusDangerBorder};
    background: ${({ theme }) => theme.colors.statusDangerSurface};
  }

  .copy {
    min-width: 0;
    display: grid;
    gap: 0.16rem;
  }

  .headline {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.48rem;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.86rem;
    font-weight: 800;
  }

  .stateLabel {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 0 0.56rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: -0.01em;
  }

  li[data-tone="error"] .stateLabel {
    border-color: ${({ theme }) => theme.colors.statusDangerBorder};
    background: ${({ theme }) => theme.colors.statusDangerSurface};
    color: ${({ theme }) => theme.colors.statusDangerText};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
    line-height: 1.5;
  }

  .time {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.74rem;
    font-weight: 700;
    white-space: nowrap;
  }

  @media (max-width: 767px) {
    li {
      display: grid;
    }

    .time {
      white-space: normal;
    }
  }
`

const ListSkeleton = styled.div`
  .desktopRows {
    display: grid;
  }

  .headerRow,
  .row {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr) 144px 220px;
  }

  .headerRow {
    min-height: 49px;
    align-items: center;
    padding: 0 1rem;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray5};
  }

  .headerRow > span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
    font-weight: 700;
  }

  .row {
    padding: 0 1rem;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray5};
  }

  .row:last-of-type {
    border-bottom: none;
  }

  .cell {
    display: grid;
    align-content: center;
    gap: 0.34rem;
    min-height: 78px;
    padding: 0.95rem 0;
  }

  .actionCell {
    grid-auto-flow: column;
    align-items: center;
    justify-content: start;
    gap: 0.65rem;
  }

  .line {
    display: block;
    height: 12px;
    border-radius: 999px;
    background: ${({ theme }) =>
      theme.scheme === "light"
        ? "linear-gradient(90deg, rgba(148, 163, 184, 0.16), rgba(148, 163, 184, 0.28), rgba(148, 163, 184, 0.16))"
        : "linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.12), rgba(255,255,255,0.06))"};
  }

  .line.short {
    width: 4.5rem;
  }

  .line.medium {
    width: 8.5rem;
  }

  .line.wide {
    width: min(100%, 22rem);
  }

  .line.muted {
    opacity: 0.65;
  }

  .mobileCards {
    display: none;
  }

  @media (max-width: 900px) {
    .desktopRows {
      display: none;
    }

    .mobileCards {
      display: grid;
      gap: 0.75rem;
      padding: 0.95rem;
    }

    .mobileCards article {
      display: grid;
      gap: 0.55rem;
      padding: 0.95rem;
      border-radius: 14px;
      border: 1px solid ${({ theme }) => theme.colors.gray5};
      background: ${({ theme }) => theme.colors.gray1};
    }

    .mobileCards .metaRow,
    .mobileCards .actionRow {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.55rem;
    }
  }
`

const ListEmptyState = styled.div`
  display: grid;
  gap: 0.45rem;
  padding: 1rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};

  strong {
    font-size: 1rem;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.55;
  }
`

const ListCard = styled.div`
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};
  overflow: hidden;
`

const DesktopListTable = styled.table`
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    padding: 0.95rem 1rem;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray5};
    vertical-align: top;
  }

  th {
    text-align: left;
    font-size: 0.8rem;
    color: ${({ theme }) => theme.colors.gray10};
  }

  .idCell {
    width: 88px;
    white-space: nowrap;
    vertical-align: middle;
  }

  .dateCell {
    width: 144px;
    white-space: nowrap;
    vertical-align: middle;
  }

  .actionCell {
    width: 220px;
    vertical-align: middle;
  }

  tbody tr:last-of-type td {
    border-bottom: none;
  }

  @media (max-width: 900px) {
    display: none;
  }
`

const TitleCell = styled.div`
  display: grid;
  gap: 0.28rem;

  .titleRow {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }

  strong {
    font-size: 0.96rem;
    line-height: 1.45;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
  }
`

const RowActions = styled.div`
  display: flex;
  gap: 0.55rem;
  align-items: center;
  flex-wrap: wrap;
`

const RowPrimaryButton = styled.button`
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.blue9};
  padding: 0;
  font-size: 0.86rem;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    opacity: 0.48;
    cursor: wait;
  }
`

const DangerTextButton = styled.button`
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.red11};
  padding: 0;
  font-size: 0.86rem;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.48;
    cursor: wait;
  }
`

const MobileCardList = styled.div`
  display: none;

  @media (max-width: 900px) {
    display: grid;
    gap: 0.75rem;
    padding: 0.95rem;
  }

  article {
    display: grid;
    gap: 0.55rem;
    padding: 0.95rem;
    border-radius: 14px;
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    background: ${({ theme }) => theme.colors.gray1};
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
  }

  .id {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
    font-weight: 700;
  }

  strong {
    font-size: 0.98rem;
    line-height: 1.45;
  }

  p,
  .date {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
  }

  .actions {
    display: flex;
    gap: 0.55rem;
    flex-wrap: wrap;
  }
`

const ToastViewport = styled.div<{ "data-tone": "success" | "error" }>`
  position: fixed;
  right: 1.2rem;
  bottom: 1.2rem;
  z-index: 40;
  display: grid;
  gap: 0.55rem;
  min-width: min(24rem, calc(100vw - 2rem));
  max-width: min(28rem, calc(100vw - 2rem));
  padding: 0.95rem 1rem;
  border-radius: 16px;
  border: 1px solid
    ${({ theme, "data-tone": tone }) =>
      tone === "error" ? theme.colors.statusDangerBorder : theme.colors.statusSuccessBorder};
  background: ${({ theme }) => theme.colors.gray1};
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.18);

  .copy {
    display: grid;
    gap: 0.2rem;
  }

  .copy strong {
    font-size: 0.92rem;
  }

  .copy span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
    line-height: 1.55;
  }

  .actions {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  @media (max-width: 767px) {
    left: 0.85rem;
    right: 0.85rem;
    bottom: 0.85rem;
    min-width: 0;
    max-width: none;
  }
`

const ToastActionButton = styled.button`
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.blue9};
  padding: 0;
  font-size: 0.84rem;
  font-weight: 800;
  cursor: pointer;
`

const ToastDismissButton = styled.button`
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
`

const ConfirmBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.56);
`

const ConfirmDialog = styled.div`
  width: min(28rem, 100%);
  display: grid;
  gap: 0.95rem;
  padding: 1.1rem;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  box-shadow: 0 24px 54px rgba(15, 23, 42, 0.24);

  > strong {
    font-size: 1.02rem;
    letter-spacing: -0.02em;
  }

  > p {
    margin: 0;
    display: grid;
    gap: 0.3rem;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.55;
  }

  .rowTitle {
    color: ${({ theme }) => theme.colors.gray12};
    font-weight: 800;
  }
`

const ConfirmButton = styled.button<{ "data-tone": "danger" }>`
  border: 0;
  background: ${({ theme }) => theme.colors.statusDangerSurface};
  color: ${({ theme }) => theme.colors.statusDangerText};
  min-height: 40px;
  padding: 0 0.85rem;
  border-radius: 10px;
  font-size: 0.92rem;
  font-weight: 800;
  cursor: pointer;
`
