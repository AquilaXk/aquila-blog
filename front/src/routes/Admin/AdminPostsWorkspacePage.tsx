import styled from "@emotion/styled"
import { useQueryClient } from "@tanstack/react-query"
import { GetServerSideProps, NextPage } from "next"
import { IncomingMessage } from "http"
import Link from "next/link"
import { useRouter } from "next/router"
import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { invalidatePublicPostReadCaches } from "src/apis/backend/posts"
import { apiFetch } from "src/apis/backend/client"
import ProfileImage from "src/components/ProfileImage"
import type { AuthMember } from "src/hooks/useAuthSession"
import useAuthSession from "src/hooks/useAuthSession"
import { pushRoute } from "src/libs/router"
import { toCanonicalPostPath } from "src/libs/utils/postPath"
import { AdminPageProps, buildAdminPagePropsFromMember, getAdminPageProps, readAdminProtectedBootstrap } from "src/libs/server/adminPage"
import { hasServerAuthCookie } from "src/libs/server/authSession"
import { serverApiFetch } from "src/libs/server/backend"
import { readServerSnapshot } from "src/libs/server/serverSnapshotCache"
import { appendSsrDebugTiming, timed } from "src/libs/server/serverTiming"
import { isServerTempDraftPost } from "./editorTempDraft"
import AdminShell from "./AdminShell"
import {
  AdminInlineActionRow,
  AdminRailCard,
  AdminSectionHeading,
  AdminStickyRail,
  AdminStatusPill,
  AdminSubtleCard,
  AdminTextActionButton,
  AdminWorkspaceHero,
  AdminWorkspaceHeroActions,
  AdminWorkspaceHeroCopy,
  AdminWorkspaceHeroLayout,
} from "./AdminSurfacePrimitives"

type PostListScope = "active" | "deleted"

type AdminPostListItem = {
  id: number
  title: string
  authorName: string
  authorProfileImgUrl?: string
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

type AdminPostsListSsrSnapshot = {
  listSource: PageDto<AdminPostListItem>
  fetchedAt: string
}

type AdminPostsBootstrapPayload = {
  member: AuthMember
  firstPage: PageDto<AdminPostListItem>
}

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  cancelIdleCallback?: (handle: number) => void
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
const POSTS_WORKSPACE_DEFERRED_PANEL_TIMEOUT_MS = 720
const POSTS_WORKSPACE_MOBILE_LIST_DELAY_MS = 180
const POSTS_WORKSPACE_MOBILE_LIST_QUERY = "(max-width: 900px)"
const EMPTY_INITIAL_SNAPSHOT: AdminPostsWorkspaceInitialSnapshot = {
  recentPosts: [],
  recentFetchedAt: null,
  listState: null,
}
const ADMIN_POSTS_SSR_LIST_CACHE_KEY = `admin-posts:list:${DEFAULT_SORT}:page=1:size=${DEFAULT_PAGE_SIZE}`
const ADMIN_POSTS_SSR_LIST_CACHE_TTL_MS = 5_000

const toEditorRoute = (query?: Record<string, string>) => {
  if (query?.postId) {
    return `/editor/${encodeURIComponent(query.postId)}`
  }

  const search = query ? new URLSearchParams(query).toString() : ""
  return search ? `${EDITOR_NEW_ROUTE_PATH}?${search}` : EDITOR_NEW_ROUTE_PATH
}

const buildCanonicalPostUrl = (postId: string | number) => {
  const path = toCanonicalPostPath(postId)
  if (typeof window === "undefined") return path
  return new URL(path, window.location.origin).toString()
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
  if (visibility === "PUBLIC_UNLISTED") return "링크 공개"
  return "전체 공개"
}

const isWorkspaceTempDraft = (row: Pick<AdminPostListItem, "title" | "published" | "listed" | "tempDraft">) =>
  isServerTempDraftPost(row)

const getWorkspaceRowTitle = (row: Pick<AdminPostListItem, "title" | "published" | "listed" | "tempDraft">) =>
  isWorkspaceTempDraft(row) ? "임시 저장" : row.title

const visibilityLabelFromValue = (visibility: LocalDraftPayload["visibility"]) => {
  if (visibility === "PRIVATE") return "비공개"
  if (visibility === "PUBLIC_UNLISTED") return "링크 공개"
  return "전체 공개"
}

const buildRowTitle = (row: Pick<AdminPostListItem, "title" | "published" | "listed" | "tempDraft">) =>
  getWorkspaceRowTitle(row) || "제목 없는 글"

const buildWorkspaceAuthorFallbackInitial = (authorName: string) => {
  const source = authorName.trim() || "작"
  return source.slice(0, 1).toUpperCase()
}

const canOpenCanonicalPost = (row: Pick<AdminPostListItem, "published" | "tempDraft">) =>
  row.published && row.tempDraft !== true

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
  const bootstrapResultPromise =
    hasServerAuthCookie(context.req)
      ? timed(() =>
          readAdminProtectedBootstrap<AdminPostsBootstrapPayload>(
            context.req,
            "/post/api/v1/adm/posts/bootstrap",
            "/admin/posts"
          )
        )
      : null

  const bootstrapResult = bootstrapResultPromise ? await bootstrapResultPromise : null
  if (bootstrapResult?.ok && !bootstrapResult.value.ok && bootstrapResult.value.destination) {
    return {
      redirect: {
        destination: bootstrapResult.value.destination,
        permanent: false,
      },
    }
  }

  let baseProps: AdminPageProps
  let authDurationMs = 0
  let authDescription = "bootstrap"
  let listSourceResult: { durationMs: number; ok: true; value: { value: AdminPostsListSsrSnapshot | null; source: string } }

  if (bootstrapResult?.ok && bootstrapResult.value.ok) {
    baseProps = buildAdminPagePropsFromMember(bootstrapResult.value.value.member)
    listSourceResult = {
      durationMs: bootstrapResult.durationMs,
      ok: true,
      value: {
        value: {
          listSource: bootstrapResult.value.value.firstPage,
          fetchedAt: new Date().toISOString(),
        },
        source: "bootstrap",
      },
    }
  } else {
    const listSourceResultPromise =
      hasServerAuthCookie(context.req)
        ? timed(() =>
            readServerSnapshot<AdminPostsListSsrSnapshot>(
              ADMIN_POSTS_SSR_LIST_CACHE_KEY,
              ADMIN_POSTS_SSR_LIST_CACHE_TTL_MS,
              async () => {
                const listSource = await readJsonIfOk<PageDto<AdminPostListItem>>(
                  context.req,
                  buildListEndpoint("active", {
                    page: DEFAULT_PAGE,
                    pageSize: DEFAULT_PAGE_SIZE,
                    kw: "",
                    sort: DEFAULT_SORT,
                  })
                )
                if (!listSource) return null
                return {
                  listSource,
                  fetchedAt: new Date().toISOString(),
                }
              }
            )
          )
        : null

    const baseResult = await timed(() => getAdminPageProps(context.req))
    if (!baseResult.ok) throw baseResult.error
    if ("redirect" in baseResult.value) return baseResult.value
    if (!("props" in baseResult.value)) return baseResult.value
    baseProps = await baseResult.value.props
    authDurationMs = baseResult.durationMs
    authDescription = "fallback"
    const fallbackListSourceResult =
      listSourceResultPromise
        ? await listSourceResultPromise
        : await timed(() =>
            readServerSnapshot<AdminPostsListSsrSnapshot>(
              ADMIN_POSTS_SSR_LIST_CACHE_KEY,
              ADMIN_POSTS_SSR_LIST_CACHE_TTL_MS,
              async () => {
                const listSource = await readJsonIfOk<PageDto<AdminPostListItem>>(
                  context.req,
                  buildListEndpoint("active", {
                    page: DEFAULT_PAGE,
                    pageSize: DEFAULT_PAGE_SIZE,
                    kw: "",
                    sort: DEFAULT_SORT,
                  })
                )
                if (!listSource) return null
                return {
                  listSource,
                  fetchedAt: new Date().toISOString(),
                }
              }
            )
          )
    if (!fallbackListSourceResult.ok) throw fallbackListSourceResult.error
    listSourceResult = fallbackListSourceResult
  }

  const listSnapshot = listSourceResult.ok ? listSourceResult.value.value : null
  const listSource = listSnapshot?.listSource ?? null
  const fetchedAt = listSnapshot?.fetchedAt ?? null
  const recentPosts = [...(listSource?.content || [])]
    .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
    .slice(0, 5)
  const listState =
    listSource
      ? {
          rows: listSource.content || [],
          total: listSource.pageable?.totalElements ?? listSource.content?.length ?? 0,
          loadedAt: fetchedAt || new Date().toISOString(),
        }
      : null

  appendSsrDebugTiming(context.req, context.res, [
    {
      name: "admin-posts-auth",
      durationMs: authDurationMs,
      description: authDescription,
    },
    {
      name: "admin-posts-list",
      durationMs: listSourceResult.durationMs,
      description: listState ? (listSourceResult.ok ? listSourceResult.value.source : "ok") : "empty",
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
        recentFetchedAt: fetchedAt,
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
  const [showDeferredSupportPanels, setShowDeferredSupportPanels] = useState(false)
  const [shouldRenderMobileList, setShouldRenderMobileList] = useState(false)

  const continueSectionRef = useRef<HTMLDivElement | null>(null)
  const listSectionRef = useRef<HTMLElement | null>(null)
  const listRequestIdRef = useRef(0)
  const recentRequestIdRef = useRef(0)
  const skipInitialRecentFetchRef = useRef(hasInitialRecentPosts)
  const skipInitialListFetchRef = useRef(hasInitialListState)

  const renderAuthorMeta = (row: Pick<AdminPostListItem, "authorName" | "authorProfileImgUrl">) => {
    const authorName = row.authorName || "작성자 미상"
    const avatarSrc = (row.authorProfileImgUrl || "").trim()

    return (
      <AuthorIdentity>
        <AuthorAvatarFrame aria-hidden="true" data-has-image={avatarSrc ? "true" : "false"}>
          {avatarSrc ? (
            <ProfileImage src={avatarSrc} alt="" fillContainer />
          ) : (
            <span>{buildWorkspaceAuthorFallbackInitial(row.authorName)}</span>
          )}
        </AuthorAvatarFrame>
        <span className="author">{authorName}</span>
      </AuthorIdentity>
    )
  }

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
    if (showDeferredSupportPanels || typeof window === "undefined") return

    const idleWindow = window as IdleWindow
    const activate = () => setShowDeferredSupportPanels(true)

    if (typeof idleWindow.requestIdleCallback === "function") {
      const handle = idleWindow.requestIdleCallback(activate, {
        timeout: POSTS_WORKSPACE_DEFERRED_PANEL_TIMEOUT_MS,
      })
      return () => {
        if (typeof idleWindow.cancelIdleCallback === "function") {
          idleWindow.cancelIdleCallback(handle)
        }
      }
    }

    const handle = window.setTimeout(activate, 320)
    return () => window.clearTimeout(handle)
  }, [showDeferredSupportPanels])

  useEffect(() => {
    if (typeof window === "undefined") return

    const mediaQuery = window.matchMedia(POSTS_WORKSPACE_MOBILE_LIST_QUERY)
    let timer: number | null = null

    const sync = () => {
      if (timer !== null) {
        window.clearTimeout(timer)
        timer = null
      }

      if (!mediaQuery.matches) {
        setShouldRenderMobileList(false)
        return
      }

      timer = window.setTimeout(() => {
        setShouldRenderMobileList(true)
      }, POSTS_WORKSPACE_MOBILE_LIST_DELAY_MS)
    }

    sync()

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", sync)
      return () => {
        if (timer !== null) {
          window.clearTimeout(timer)
        }
        mediaQuery.removeEventListener("change", sync)
      }
    }

    mediaQuery.addListener(sync)
    return () => {
      if (timer !== null) {
        window.clearTimeout(timer)
      }
      mediaQuery.removeListener(sync)
    }
  }, [])

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

  const copyPostDetailLink = useCallback(
    async (row: Pick<AdminPostListItem, "id" | "title" | "published" | "listed" | "tempDraft">) => {
      if (!canOpenCanonicalPost(row)) {
        showToast({ tone: "error", text: `#${row.id} ${buildRowTitle(row)}는 아직 공개 링크가 없습니다.` })
        return
      }
      const url = buildCanonicalPostUrl(row.id)
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url)
          showToast({ tone: "success", text: `#${row.id} ${buildRowTitle(row)} 링크를 복사했습니다.` })
          return
        }
        if (typeof window !== "undefined") {
          window.prompt("링크를 복사하세요.", url)
          showToast({ tone: "success", text: `#${row.id} ${buildRowTitle(row)} 링크를 표시했습니다.` })
          return
        }
        throw new Error("링크를 복사할 수 없는 환경입니다.")
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        showToast({ tone: "error", text: `링크 복사 실패: ${message}` })
      }
    },
    [showToast]
  )

  const openCanonicalPost = useCallback(
    async (
      event: MouseEvent<HTMLAnchorElement>,
      row: Pick<AdminPostListItem, "id" | "published" | "listed" | "tempDraft">
    ) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }

      event.preventDefault()
      if (!canOpenCanonicalPost(row)) return
      await pushRoute(router, toCanonicalPostPath(row.id))
    },
    [router]
  )

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

    const recentRows = recentPosts.slice(0, 3)

    return (
      <RecentPostList>
        {recentRows.map((row) => (
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
    <AdminShell currentSection="posts" member={sessionMember}>
      <Main>
        <HeroSection>
          <AdminWorkspaceHeroLayout>
            <AdminWorkspaceHeroCopy>
              <h1>편집과 검수를 한 화면에서 이어갑니다</h1>
              <p>최근 초안 복귀, 공개 상태 점검, 목록 필터링까지 지금 필요한 글 작업 흐름을 한곳에 모읍니다.</p>
            </AdminWorkspaceHeroCopy>
            <AdminWorkspaceHeroActions>
              <PrimaryCta type="button" onClick={() => void openWriteRoute()}>
                새 글 작성
              </PrimaryCta>
            </AdminWorkspaceHeroActions>
          </AdminWorkspaceHeroLayout>
        </HeroSection>

        <WorkspaceBody>
          <WorkspaceMain>
            <ResumeSection ref={continueSectionRef}>
              <SectionHeading>
                <div>
                  <h2>최근 작업</h2>
                </div>
              </SectionHeading>
              {showDeferredSupportPanels ? (
                shouldRenderResumeGrid ? (
                  <ResumeGrid>
                    {localDraft ? (
                      <ResumeCardButton type="button" onClick={() => void openWriteRoute({ source: "local-draft" })}>
                        <ResumeHeader>
                          <strong>브라우저 임시저장</strong>
                          {localDraft.savedAt ? <span>{formatDateTime(localDraft.savedAt)}</span> : null}
                        </ResumeHeader>
                        <ResumeTitle>{localDraft.title}</ResumeTitle>
                        {localDraft.summary ? <ResumeDescription>{localDraft.summary}</ResumeDescription> : null}
                        <ResumeMeta>
                          <VisibilityBadge data-tone={localDraft.visibility}>
                            {visibilityLabelFromValue(localDraft.visibility)}
                          </VisibilityBadge>
                          <span>{localDraft.tagCount > 0 ? `태그 ${localDraft.tagCount}개` : "태그 없음"}</span>
                        </ResumeMeta>
                      </ResumeCardButton>
                    ) : (
                      <ResumeCard data-empty="true">
                        <ResumeHeader>
                          <strong>브라우저 임시저장</strong>
                        </ResumeHeader>
                        <EmptyInlineState>
                          <strong>임시 저장 없음</strong>
                          <ActionRow>
                            <PrimaryInlineButton type="button" onClick={() => void openWriteRoute()}>
                              새 글 작성
                            </PrimaryInlineButton>
                          </ActionRow>
                        </EmptyInlineState>
                      </ResumeCard>
                    )}

                    <ResumeCard>
                      <ResumeHeader>
                        <strong>최근 수정 3건</strong>
                        {isRecentLoading ? <span>불러오는 중</span> : null}
                      </ResumeHeader>
                      {renderRecentEdited()}
                    </ResumeCard>
                  </ResumeGrid>
                ) : (
                  <WorkspaceEmpty>
                    <strong>최근 작업 없음</strong>
                    <PrimaryInlineButton type="button" onClick={() => void openWriteRoute()}>
                      새 글 작성
                    </PrimaryInlineButton>
                  </WorkspaceEmpty>
                )
              ) : (
                <DeferredPanelPlaceholder data-size="recent">
                  <strong>최근 작업 준비 중</strong>
                  <span>글 목록 워크스페이스를 먼저 표시한 뒤 이어서 최근 작업을 붙입니다.</span>
                </DeferredPanelPlaceholder>
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

              {showDeferredSupportPanels ? (
                <RecentActionPanel aria-live="polite">
                  <div className="panelHead">
                    <strong>작업 기록</strong>
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
              ) : (
                <DeferredPanelPlaceholder data-size="activity">
                  <strong>작업 기록 준비 중</strong>
                  <span>목록이 안정된 뒤 최근 변경 이력을 이어서 불러옵니다.</span>
                </DeferredPanelPlaceholder>
              )}

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
                  {!shouldRenderMobileList ? (
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
                                {canOpenCanonicalPost(row) ? (
                                  <TitleAnchor href={toCanonicalPostPath(row.id)} onClick={(event) => void openCanonicalPost(event, row)}>
                                    {getWorkspaceRowTitle(row)}
                                  </TitleAnchor>
                                ) : (
                                  <TitleText>{getWorkspaceRowTitle(row)}</TitleText>
                                )}
                                <div className="metaRow">
                                  <VisibilityBadge data-tone={toVisibility(row.published, row.listed)}>
                                    {visibilityLabel(row.published, row.listed)}
                                  </VisibilityBadge>
                                  {renderAuthorMeta(row)}
                                </div>
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
                                    {canOpenCanonicalPost(row) ? (
                                      <RowSecondaryButton type="button" onClick={() => void copyPostDetailLink(row)}>
                                        링크 복사
                                      </RowSecondaryButton>
                                    ) : null}
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
                  ) : null}

                  {shouldRenderMobileList ? (
                    <MobileCardList>
                      {listState.rows.map((row) => (
                        <article key={`mobile-${row.id}`}>
                          <header>
                            <span className="id">#{row.id}</span>
                          </header>
                          {canOpenCanonicalPost(row) ? (
                            <TitleAnchor href={toCanonicalPostPath(row.id)} onClick={(event) => void openCanonicalPost(event, row)}>
                              {getWorkspaceRowTitle(row)}
                            </TitleAnchor>
                          ) : (
                            <TitleText>{getWorkspaceRowTitle(row)}</TitleText>
                          )}
                          <div className="metaRow">
                            <VisibilityBadge data-tone={toVisibility(row.published, row.listed)}>
                              {visibilityLabel(row.published, row.listed)}
                            </VisibilityBadge>
                            {renderAuthorMeta(row)}
                          </div>
                          <span className="date">{formatDateTime(listScope === "active" ? row.modifiedAt : row.deletedAt)}</span>
                          <div className="actions">
                            {listScope === "active" ? (
                              <>
                                <RowPrimaryButton type="button" onClick={() => void handleContinueRecent(row)}>
                                  수정
                                </RowPrimaryButton>
                                {canOpenCanonicalPost(row) ? (
                                  <RowSecondaryButton type="button" onClick={() => void copyPostDetailLink(row)}>
                                    링크 복사
                                  </RowSecondaryButton>
                                ) : null}
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
                  ) : null}
                </ListCard>
              )}
            </ListSection>
          </WorkspaceMain>

          <WorkspaceRail>
            <RailCard>
              <RailCardHeader>
                <h2>검수 체크리스트</h2>
                <span>발행 전 마지막 확인</span>
              </RailCardHeader>
              <RailBulletList>
                <li>임시 저장을 열어 제목, 요약, 태그가 최신 초안과 맞는지 확인합니다.</li>
                <li>링크 공개와 전체 공개를 구분해 외부 공유 범위를 다시 점검합니다.</li>
                <li>삭제나 복구 후에는 작업 기록에 결과가 남았는지 확인합니다.</li>
              </RailBulletList>
            </RailCard>

            <RailCard>
              <RailCardHeader>
                <h2>상태 의미</h2>
                <span>목록 배지 해석</span>
              </RailCardHeader>
              <RailMetaList>
                <li>
                  <strong>비공개</strong>
                  <span>편집 중인 초안으로 외부 링크가 아직 열리지 않습니다.</span>
                </li>
                <li>
                  <strong>링크 공개</strong>
                  <span>직접 링크를 가진 사람만 볼 수 있어 검수 공유에 적합합니다.</span>
                </li>
                <li>
                  <strong>전체 공개</strong>
                  <span>피드와 상세 페이지에 모두 노출되는 최종 상태입니다.</span>
                </li>
              </RailMetaList>
            </RailCard>

            <RailCard>
              <RailCardHeader>
                <h2>바로가기</h2>
                <span>옆 작업실 연결</span>
              </RailCardHeader>
              <SupportList>
                <Link href="/admin/profile" passHref legacyBehavior>
                  <SupportLink>
                    <SupportCopy>
                      <strong>프로필 정리</strong>
                      <p>작성자 정보와 소개 문구를 같은 톤으로 맞춥니다.</p>
                    </SupportCopy>
                    <SupportMeta>프로필 열기</SupportMeta>
                  </SupportLink>
                </Link>
                <Link href="/admin/dashboard" passHref legacyBehavior>
                  <SupportLink>
                    <SupportCopy>
                      <strong>운영 대시보드</strong>
                      <p>발행 뒤 모니터링이 필요한 지표와 장애 징후를 확인합니다.</p>
                    </SupportCopy>
                    <SupportMeta>대시보드 열기</SupportMeta>
                  </SupportLink>
                </Link>
              </SupportList>
            </RailCard>
          </WorkspaceRail>
        </WorkspaceBody>

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
    </AdminShell>
  )
}

export default AdminPostWorkspacePage

const Main = styled.main`
  max-width: 1120px;
  margin: 0 auto;
  padding: 1.2rem 1rem 2.8rem;
  display: grid;
  gap: 1rem;

  @media (max-width: 767px) {
    gap: 0.9rem;
    padding: 1rem 0.85rem 2rem;
  }
`

const HeroSection = styled(AdminWorkspaceHero)``

const WorkspaceBody = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(18rem, 20rem);
  gap: 1rem;
  align-items: start;

  @media (max-width: 1180px) {
    grid-template-columns: 1fr;
  }
`

const WorkspaceMain = styled.div`
  display: grid;
  gap: 1rem;
`

const WorkspaceRail = styled(AdminStickyRail)`
  gap: 0.85rem;
  position: sticky;
  top: calc(var(--app-header-height, 64px) + 0.55rem);
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

const ResumeSection = styled.section`
  display: grid;
  gap: 0.72rem;
`

const SectionHeading = styled(AdminSectionHeading)`
  h2 {
    font-size: 1.22rem;
    letter-spacing: -0.03em;
  }
`

const RailCard = styled(AdminRailCard)`
  gap: 0.76rem;
`

const RailCardHeader = styled.div`
  display: grid;
  gap: 0.18rem;

  h2 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.98rem;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
    line-height: 1.5;
  }
`

const RailBulletList = styled.ul`
  margin: 0;
  padding-left: 1.1rem;
  display: grid;
  gap: 0.5rem;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.84rem;
  line-height: 1.55;
`

const RailMetaList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.65rem;

  li {
    display: grid;
    gap: 0.16rem;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.86rem;
    font-weight: 800;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
    line-height: 1.5;
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
  grid-template-columns: minmax(14rem, 0.74fr) minmax(0, 1.26fr);
  gap: 0.6rem;
  align-items: start;

  @media (max-width: 1120px) {
    grid-template-columns: 1fr;
  }
`

const ResumeCard = styled(AdminRailCard)`
  gap: 0.42rem;
  width: 100%;
  padding: 0.72rem 0.78rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};
  text-align: left;
  color: inherit;

  &[data-empty="true"] {
    gap: 0.36rem;
    padding-block: 0.68rem;
  }
`

const ResumeCardButton = styled.button`
  display: grid;
  gap: 0.42rem;
  width: 100%;
  padding: 0.72rem 0.78rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};
  appearance: none;
  text-align: left;
  color: inherit;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;

  &:hover {
    border-color: ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray1};
  }

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => `0 0 0 3px ${theme.colors.gray6}`};
  }
`

const ResumeHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;

  strong {
    font-size: 0.88rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.74rem;
    white-space: nowrap;
  }
`

const ResumeTitle = styled.strong`
  font-size: 0.9rem;
  line-height: 1.32;
`

const ResumeDescription = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.8rem;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`

const EmptyInlineState = styled.div`
  display: grid;
  gap: 0.12rem;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.84rem;
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
    font-size: 0.76rem;
  }
`

const VisibilityBadge = styled(AdminStatusPill)<{ "data-tone": string }>`
  min-height: 28px;
  max-width: 100%;
  padding: 0 0.82rem;
  font-size: 0.78rem;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: ${({ theme, "data-tone": tone }) =>
    tone === "PRIVATE"
      ? theme.colors.gray11
      : tone === "PUBLIC_UNLISTED"
        ? theme.colors.orange9
        : theme.colors.green9};
  background: ${({ theme, "data-tone": tone }) =>
    tone === "PRIVATE"
      ? theme.colors.gray2
      : tone === "PUBLIC_UNLISTED"
        ? "rgba(249, 115, 22, 0.12)"
        : "rgba(34, 197, 94, 0.12)"};
  border-color: ${({ theme, "data-tone": tone }) =>
    tone === "PRIVATE"
      ? theme.colors.gray7
      : tone === "PUBLIC_UNLISTED"
        ? theme.colors.orange8
        : theme.colors.green8};
`

const ActionRow = styled(AdminInlineActionRow)``

const PrimaryInlineButton = styled(AdminTextActionButton)`
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.92rem;
  font-weight: 800;
`

const GhostButton = styled(AdminTextActionButton)`
  font-size: 0.88rem;
  font-weight: 700;
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

const DeferredPanelPlaceholder = styled(AdminRailCard)<{ "data-size": "recent" | "activity" }>`
  display: grid;
  gap: 0.3rem;
  padding: 0.92rem 1rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};
  min-height: ${({ "data-size": size }) => (size === "recent" ? "144px" : "92px")};

  strong {
    font-size: 0.9rem;
    letter-spacing: -0.01em;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
    line-height: 1.55;
  }
`

const RecentListSkeleton = styled.div`
  display: grid;
  gap: 0.45rem;

  span {
    display: block;
    height: 50px;
    border-radius: 12px;
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
  gap: 0.42rem;

  li button {
    width: 100%;
    padding: 0.58rem 0.68rem;
    border-radius: 10px;
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    background: ${({ theme }) => theme.colors.gray2};
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.55rem;
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
    font-size: 0.84rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.72rem;
  }

  @media (max-width: 820px) {
    li button {
      grid-template-columns: 1fr;
      align-items: start;
    }
  }
`

const RecentMeta = styled.div`
  display: grid;
  justify-items: end;
  gap: 0.28rem;
  flex-shrink: 0;

  span:last-of-type {
    color: ${({ theme }) => theme.colors.gray12};
    font-weight: 700;
  }

  @media (max-width: 820px) {
    justify-items: start;
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
  background: ${({ theme, "data-active": active }) => (active ? theme.colors.gray1 : theme.colors.gray2)};
  color: ${({ theme }) => theme.colors.gray12};
  border-color: ${({ theme, "data-active": active }) => (active ? theme.colors.gray6 : theme.colors.gray5)};
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

const RecentActionPanel = styled(AdminRailCard)`
  gap: 0.72rem;
  padding: 0.92rem 1rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};

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

const ListCard = styled(AdminSubtleCard)`
  border-radius: 16px;
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
  gap: 0.38rem;

  .metaRow {
    display: flex;
    gap: 0.55rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .author {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
  }
`

const TitleAnchor = styled.a`
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.96rem;
  font-weight: 800;
  line-height: 1.45;
  text-decoration: none;

  &:hover {
    color: ${({ theme }) => theme.colors.gray12};
    text-decoration: underline;
    text-underline-offset: 0.16em;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.gray8};
    outline-offset: 3px;
    border-radius: 0.32rem;
  }
`

const TitleText = styled.strong`
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.96rem;
  font-weight: 800;
  line-height: 1.45;
`

const AuthorIdentity = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
`

const AuthorAvatarFrame = styled.span`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 1.4rem;
  height: 1.4rem;
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.gray3};
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.66rem;
  font-weight: 800;
  line-height: 1;

  &[data-has-image="true"] {
    background: ${({ theme }) => theme.colors.gray4};
  }

  img {
    width: 100%;
    height: 100%;
  }
`

const RowActions = styled(AdminInlineActionRow)``

const RowPrimaryButton = styled(AdminTextActionButton)`
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.86rem;
  font-weight: 800;

  &:disabled {
    opacity: 0.48;
    cursor: wait;
  }
`

const RowSecondaryButton = styled(AdminTextActionButton)`
  font-size: 0.84rem;
  font-weight: 700;

  &:disabled {
    opacity: 0.48;
    cursor: wait;
  }
`

const DangerTextButton = styled(AdminTextActionButton)`
  color: ${({ theme }) => theme.colors.red11};
  font-size: 0.86rem;
  font-weight: 700;

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
    gap: 0.5rem;
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

  .metaRow {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    flex-wrap: wrap;
  }

  .author,
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
