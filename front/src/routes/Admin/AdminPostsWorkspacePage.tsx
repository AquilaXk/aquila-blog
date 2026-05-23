import { useQueryClient } from "@tanstack/react-query"
import { NextPage } from "next"
import { useRouter } from "next/router"
import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { invalidatePublicPostReadCaches } from "src/apis/backend/posts"
import { apiFetch } from "src/apis/backend/client"
import useAuthSession from "src/hooks/useAuthSession"
import { pushRoute } from "src/libs/router"
import { toCanonicalPostPath } from "src/libs/utils/postPath"
import {
  buildListEndpoint,
  buildRowTitle,
  canOpenCanonicalPost,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
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
import {
  EMPTY_INITIAL_SNAPSHOT,
  POSTS_LIST_LOAD_ERROR_MESSAGE,
  RECENT_POSTS_UNAVAILABLE_MESSAGE,
  buildPostsWorkspacePageCommands,
  type AdminPostsWorkspacePageProps,
  type IdleWindow,
} from "./AdminPostsWorkspacePageCommands"
import { AdminPostsWorkspacePageView } from "./AdminPostsWorkspacePageView"

export { getAdminPostsWorkspacePageProps } from "./AdminPostsWorkspacePageCommands"

const postsWorkspaceCommands = buildPostsWorkspacePageCommands()

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
      await pushRoute(router, postsWorkspaceCommands.toEditorRoute(query))
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
      const url = postsWorkspaceCommands.buildCanonicalPostUrl(row.id)
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
    <AdminPostsWorkspacePageView
      confirmState={confirmState}
      continueSectionRef={continueSectionRef}
      copyPostDetailLink={copyPostDetailLink}
      handleConfirmAction={handleConfirmAction}
      handleContinueRecent={handleContinueRecent}
      handleDeletePost={handleDeletePost}
      handleHardDeletePost={handleHardDeletePost}
      handleResetListFilters={handleResetListFilters}
      handleRestorePost={handleRestorePost}
      handleToastAction={handleToastAction}
      hasListFilters={hasListFilters}
      isAdvancedOpen={isAdvancedOpen}
      isListLoading={isListLoading}
      isRecentLoading={isRecentLoading}
      isStickyToolbarCompact={isStickyToolbarCompact}
      listError={listError}
      listKw={listKw}
      listPage={listPage}
      listPageSize={listPageSize}
      listScope={listScope}
      listSectionRef={listSectionRef}
      listSort={listSort}
      listState={listState}
      listSummaryParts={listSummaryParts}
      loadList={loadList}
      loadRecentPosts={loadRecentPosts}
      localDraft={localDraft}
      mutationPending={mutationPending}
      openCanonicalPost={openCanonicalPost}
      openWriteRoute={openWriteRoute}
      recentActions={recentActions}
      recentError={recentError}
      recentPosts={recentPosts}
      sessionMember={sessionMember}
      setConfirmState={setConfirmState}
      setIsAdvancedOpen={setIsAdvancedOpen}
      setIsStickyToolbarCompact={setIsStickyToolbarCompact}
      setListKw={setListKw}
      setListPage={setListPage}
      setListPageSize={setListPageSize}
      setListScope={setListScope}
      setListSort={setListSort}
      setToast={setToast}
      shouldRenderMobileList={shouldRenderMobileList}
      showDeferredSupportPanels={showDeferredSupportPanels}
      toast={toast}
    />
  )
}

export default AdminPostWorkspacePage
