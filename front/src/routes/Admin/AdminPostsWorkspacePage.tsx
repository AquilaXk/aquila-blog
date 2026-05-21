import styled from "@emotion/styled"
import { useQueryClient } from "@tanstack/react-query"
import { GetServerSideProps, NextPage } from "next"
import { IncomingMessage } from "http"
import { useRouter } from "next/router"
import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { invalidatePublicPostReadCaches } from "src/apis/backend/posts"
import { apiFetch } from "src/apis/backend/client"
import type { AuthMember } from "src/hooks/useAuthSession"
import useAuthSession from "src/hooks/useAuthSession"
import { pushRoute } from "src/libs/router"
import { toCanonicalPostPath } from "src/libs/utils/postPath"
import { AdminPageProps, buildAdminPagePropsFromMember, getAdminPageProps, readAdminProtectedBootstrap } from "src/libs/server/adminPage"
import { hasServerAuthCookie } from "src/libs/server/authSession"
import { serverApiFetch } from "src/libs/server/backend"
import { readServerSnapshot } from "src/libs/server/serverSnapshotCache"
import { appendSsrDebugTiming, timed } from "src/libs/server/serverTiming"
import AdminShell from "./AdminShell"
import { AdminPostsWorkspaceFeedbackLayer } from "./AdminPostsWorkspaceFeedbackLayer"
import { AdminPostsWorkspaceFilterToolbar } from "./AdminPostsWorkspaceFilterToolbar"
import { AdminPostsWorkspaceList } from "./AdminPostsWorkspaceList"
import {
  buildListEndpoint,
  buildRowTitle,
  canOpenCanonicalPost,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  EDITOR_NEW_ROUTE_PATH,
  formatDateTime,
  POSTS_WORKSPACE_DEFERRED_PANEL_TIMEOUT_MS,
  POSTS_WORKSPACE_MOBILE_LIST_DELAY_MS,
  POSTS_WORKSPACE_MOBILE_LIST_QUERY,
  readLocalDraft,
  sanitizeNumberInput,
  type AdminPostListItem,
  type LocalDraftSummary,
  type ListSort,
  type ListState,
  type PageDto,
  type PostListScope,
  type PostWriteResult,
  type WorkspaceConfirmState,
  type WorkspaceRecentAction,
  type WorkspaceToastState,
} from "./AdminPostsWorkspaceModel"
import { AdminPostsWorkspaceRecentWork } from "./AdminPostsWorkspaceRecentWork"
import {
  AdminRailCard,
  AdminSectionHeading,
  AdminTextActionButton,
  AdminWorkspaceHero,
  AdminWorkspaceHeroActions,
  AdminWorkspaceHeroCopy,
  AdminWorkspaceHeroLayout,
} from "./AdminSurfacePrimitives"

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

const EMPTY_INITIAL_SNAPSHOT: AdminPostsWorkspaceInitialSnapshot = {
  recentPosts: [],
  recentFetchedAt: null,
  listState: null,
}
const ADMIN_POSTS_SSR_LIST_CACHE_KEY = `admin-posts:list:${DEFAULT_SORT}:page=1:size=${DEFAULT_PAGE_SIZE}`
const ADMIN_POSTS_SSR_LIST_CACHE_TTL_MS = 5_000
const POSTS_LIST_LOAD_ERROR_MESSAGE = "글 목록 서버와 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."
const RECENT_POSTS_UNAVAILABLE_MESSAGE = "목록 연결 후 최근 수정 글을 표시합니다."

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
    } catch {
      if (recentRequestIdRef.current !== requestId) return
      setRecentError(RECENT_POSTS_UNAVAILABLE_MESSAGE)
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
    } catch {
      if (listRequestIdRef.current !== requestId) return
      setListError(POSTS_LIST_LOAD_ERROR_MESSAGE)
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
            <PostsHeroCopy>
              <h1>편집과 검수를 한 화면에서 이어갑니다</h1>
            </PostsHeroCopy>
            <AdminWorkspaceHeroActions>
              <PrimaryCta type="button" onClick={() => void openWriteRoute()}>
                새 글 작성
              </PrimaryCta>
            </AdminWorkspaceHeroActions>
          </AdminWorkspaceHeroLayout>
        </HeroSection>

        <WorkspaceBody>
          <WorkspaceMain>
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

              <AdminPostsWorkspaceFilterToolbar
                listScope={listScope}
                listKw={listKw}
                listPage={listPage}
                listPageSize={listPageSize}
                listSort={listSort}
                listState={listState}
                isAdvancedOpen={isAdvancedOpen}
                isStickyToolbarCompact={isStickyToolbarCompact}
                hasListFilters={hasListFilters}
                listSummaryParts={listSummaryParts}
                onScopeChange={setListScope}
                onKeywordChange={(value) => {
                  setListPage(DEFAULT_PAGE)
                  setListKw(value)
                }}
                onPageChange={setListPage}
                onPageSizeChange={setListPageSize}
                onSortChange={setListSort}
                onAdvancedToggle={() => setIsAdvancedOpen((prev) => !prev)}
                onCompactToggle={() => setIsStickyToolbarCompact((prev) => !prev)}
                onResetFilters={handleResetListFilters}
              />

              <AdminPostsWorkspaceList
                listScope={listScope}
                listKw={listKw}
                listState={listState}
                isListLoading={isListLoading}
                listError={listError}
                shouldRenderMobileList={shouldRenderMobileList}
                mutationPending={mutationPending}
                onLoadList={() => void loadList()}
                onOpenWriteRoute={(query) => void openWriteRoute(query)}
                onResetSearch={() => {
                  setListKw("")
                  setListPage(DEFAULT_PAGE)
                }}
                onContinueRecent={(row) => void handleContinueRecent(row)}
                onCopyPostDetailLink={(row) => void copyPostDetailLink(row)}
                onOpenCanonicalPost={(event, row) => void openCanonicalPost(event, row)}
                onDeletePost={(row) => void handleDeletePost(row)}
                onRestorePost={(row) => void handleRestorePost(row)}
                onHardDeletePost={(row) => void handleHardDeletePost(row)}
              />

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
            </ListSection>

            <div ref={continueSectionRef}>
              <AdminPostsWorkspaceRecentWork
                localDraft={localDraft}
                recentPosts={recentPosts}
                isRecentLoading={isRecentLoading}
                recentError={recentError}
                showDeferredSupportPanels={showDeferredSupportPanels}
                onOpenWriteRoute={(query) => void openWriteRoute(query)}
                onContinueRecent={(row) => void handleContinueRecent(row)}
              />
            </div>
          </WorkspaceMain>

        </WorkspaceBody>

      <AdminPostsWorkspaceFeedbackLayer
        toast={toast}
        confirmState={confirmState}
        onToastAction={() => void handleToastAction()}
        onToastDismiss={() => setToast(null)}
        onConfirmCancel={() => setConfirmState(null)}
        onConfirmAction={() => void handleConfirmAction()}
      />
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

const PostsHeroCopy = styled(AdminWorkspaceHeroCopy)`
  min-width: 0;

  h1 {
    max-width: 100%;
    overflow-wrap: anywhere;
  }
`

const WorkspaceBody = styled.div`
  display: grid;
  gap: 1rem;
`

const WorkspaceMain = styled.div`
  display: grid;
  gap: 1rem;
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

const ListSection = styled.section`
  display: grid;
  gap: 0.8rem;
`

const SectionHeading = styled(AdminSectionHeading)`
  h2 {
    font-size: 1.22rem;
    letter-spacing: -0.03em;
  }
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

const GhostButton = styled(AdminTextActionButton)`
  font-size: 0.88rem;
  font-weight: 700;
`

const MutedText = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.gray10};
  line-height: 1.55;
`

const DeferredPanelPlaceholder = styled(AdminRailCard)<{ "data-size": "activity" }>`
  display: grid;
  gap: 0.3rem;
  padding: 0.92rem 1rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};
  min-height: 92px;

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
