import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { apiFetch } from "src/apis/backend/client"
import { isServerTempDraftPost } from "./editorTempDraft"
import { LIST_SORT_OPTIONS, type ListQuickPreset, type PostListScope } from "./useEditorStudioListConditions"

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null

type NoticeState = {
  tone: "idle" | "loading" | "success" | "error"
  text: string
}

export type EditorStudioAdminPostListItem = {
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

export type EditorStudioDeleteConfirmState = {
  ids: number[]
  headline: string
}

type SoftDeleteUndoState = {
  ids: number[]
  expiresAt: number
  message: string
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

type RsData<T> = {
  data: T
  msg: string
}

type PostWriteResult = {
  id: number
  title: string
  version?: number
  published: boolean
  listed: boolean
}

type UseEditorStudioAdminPostFlowParams = {
  activateManageSurface: () => void
  isCompactMobileLayout: boolean
  listKw: string
  listPage: string
  listPageSize: string
  listQuickPreset: ListQuickPreset
  listScope: PostListScope
  listSort: string
  postId: string
  pretty: (value: unknown) => string
  refreshPublicPostReadViews: (affectedPostId?: string | number) => Promise<void>
  setGlobalNotice: Dispatch<SetStateAction<NoticeState>>
  setListQuickPreset: Dispatch<SetStateAction<ListQuickPreset>>
  setLoadingKey: Dispatch<SetStateAction<string>>
  setMobileManageStep: Dispatch<SetStateAction<"query" | "list">>
  setResult: Dispatch<SetStateAction<string>>
  switchToCreateMode: (options?: { keepContent?: boolean }) => void
}

const LIST_CACHE_TTL_MS = 45_000

const getTodayDateKey = () => new Date().toISOString().slice(0, 10)

const buildListCacheKey = (params: {
  scope: PostListScope
  page: string
  pageSize: string
  kw: string
  sort: string
}) => [
  params.scope,
  params.page,
  params.pageSize,
  params.kw.trim(),
  params.sort,
].join("|")

export const useEditorStudioAdminPostFlow = ({
  activateManageSurface,
  isCompactMobileLayout,
  listKw,
  listPage,
  listPageSize,
  listQuickPreset,
  listScope,
  listSort,
  postId,
  pretty,
  refreshPublicPostReadViews,
  setGlobalNotice,
  setListQuickPreset,
  setLoadingKey,
  setMobileManageStep,
  setResult,
  switchToCreateMode,
}: UseEditorStudioAdminPostFlowParams) => {
  const [adminPostRows, setAdminPostRows] = useState<EditorStudioAdminPostListItem[]>([])
  const [adminPostTotal, setAdminPostTotal] = useState<number>(0)
  const [modifiedSortOrder, setModifiedSortOrder] = useState<"desc" | "asc">("desc")
  const [selectedPostIds, setSelectedPostIds] = useState<number[]>([])
  const [softDeleteUndoState, setSoftDeleteUndoState] = useState<SoftDeleteUndoState | null>(null)
  const [deleteConfirmState, setDeleteConfirmState] = useState<EditorStudioDeleteConfirmState | null>(null)
  const [deleteConfirmNotice, setDeleteConfirmNotice] = useState<NoticeState>({
    tone: "idle",
    text: "",
  })
  const [deletedListNotice, setDeletedListNotice] = useState<NoticeState>({
    tone: "idle",
    text: "",
  })
  const listCacheRef = useRef(
    new Map<string, { rows: EditorStudioAdminPostListItem[]; total: number; storedAt: number }>()
  )

  const todayDateKey = useMemo(() => getTodayDateKey(), [])

  const adminPostViewRows = useMemo(() => {
    const copy = [...adminPostRows]
    copy.sort((a, b) => {
      const aBaseTime = listScope === "deleted" ? a.deletedAt || a.modifiedAt : a.modifiedAt
      const bBaseTime = listScope === "deleted" ? b.deletedAt || b.modifiedAt : b.modifiedAt
      const aMs = new Date(aBaseTime).getTime()
      const bMs = new Date(bBaseTime).getTime()
      if (Number.isNaN(aMs) || Number.isNaN(bMs)) return 0
      return modifiedSortOrder === "desc" ? bMs - aMs : aMs - bMs
    })

    if (listScope !== "active") {
      return copy
    }
    if (listQuickPreset === "today") {
      return copy.filter((row) => row.modifiedAt?.startsWith(todayDateKey))
    }
    if (listQuickPreset === "temp") {
      return copy.filter((row) => isServerTempDraftPost(row))
    }
    return copy
  }, [adminPostRows, listScope, modifiedSortOrder, listQuickPreset, todayDateKey])

  const selectedPostIdSet = useMemo(() => new Set(selectedPostIds), [selectedPostIds])
  const isAllVisiblePostsSelected = useMemo(
    () => adminPostViewRows.length > 0 && adminPostViewRows.every((row) => selectedPostIdSet.has(row.id)),
    [adminPostViewRows, selectedPostIdSet]
  )

  const loadAdminPosts = useCallback(async () => {
    activateManageSurface()
    const safePage = listPage || "1"
    const safePageSize = listPageSize || "30"
    const safeSort =
      LIST_SORT_OPTIONS.find((option) => option.value === listSort)?.value || LIST_SORT_OPTIONS[0].value
    const cacheKey = buildListCacheKey({
      scope: listScope,
      page: safePage,
      pageSize: safePageSize,
      kw: listKw,
      sort: safeSort,
    })

    const cached = listCacheRef.current.get(cacheKey)
    if (cached && Date.now() - cached.storedAt < LIST_CACHE_TTL_MS) {
      setAdminPostRows(cached.rows)
      setAdminPostTotal(cached.total)
      setGlobalNotice({
        tone: "success",
        text: `목록을 최근 캐시로 즉시 표시했습니다. (총 ${cached.total}건)`,
      })
      setResult(
        pretty({
          source: "memory-cache",
          total: cached.total,
          rows: cached.rows.length,
        })
      )
      return
    }

    try {
      setLoadingKey("postList")
      setGlobalNotice({ tone: "loading", text: "글 목록을 불러오는 중입니다..." })
      const query = new URLSearchParams({
        page: safePage,
        pageSize: safePageSize,
        kw: listKw,
      })
      const endpoint =
        listScope === "deleted"
          ? "/post/api/v1/adm/posts/deleted"
          : "/post/api/v1/adm/posts"
      if (listScope === "active") {
        query.set("sort", safeSort)
      }
      const data = await apiFetch<PageDto<EditorStudioAdminPostListItem>>(
        `${endpoint}?${query.toString()}`
      )
      const nextRows = data.content || []
      const nextTotal = data.pageable?.totalElements ?? data.content?.length ?? 0
      setAdminPostRows(nextRows)
      setAdminPostTotal(nextTotal)
      listCacheRef.current.set(cacheKey, {
        rows: nextRows,
        total: nextTotal,
        storedAt: Date.now(),
      })
      if (listScope === "deleted") {
        setSelectedPostIds([])
      }
      setGlobalNotice({
        tone: "success",
        text: `목록 조회 완료: ${nextTotal}건`,
      })
      if (isCompactMobileLayout) {
        setMobileManageStep("list")
      }
      setResult(pretty(data as unknown as JsonValue))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setResult(pretty({ error: message }))
      setGlobalNotice({ tone: "error", text: `목록 조회 실패: ${message}` })
      setAdminPostRows([])
      setAdminPostTotal(0)
    } finally {
      setLoadingKey("")
    }
  }, [
    activateManageSurface,
    isCompactMobileLayout,
    listKw,
    listPage,
    listPageSize,
    listScope,
    listSort,
    pretty,
    setGlobalNotice,
    setLoadingKey,
    setMobileManageStep,
    setResult,
  ])

  const togglePostSelection = useCallback((id: number) => {
    if (listScope === "deleted") return
    setSelectedPostIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id)
      return [...prev, id]
    })
  }, [listScope])

  const toggleSelectAllVisiblePosts = useCallback(() => {
    if (listScope === "deleted") return
    if (adminPostViewRows.length === 0) return
    setSelectedPostIds((prev) => {
      const next = new Set(prev)
      const allSelected = adminPostViewRows.every((row) => next.has(row.id))
      if (allSelected) {
        adminPostViewRows.forEach((row) => next.delete(row.id))
      } else {
        adminPostViewRows.forEach((row) => next.add(row.id))
      }
      return Array.from(next)
    })
  }, [adminPostViewRows, listScope])

  const openDeleteConfirm = useCallback((ids: number[], titleHint?: string) => {
    const uniqueIds = Array.from(new Set(ids)).filter((id) => Number.isFinite(id))
    if (uniqueIds.length === 0) return
    setDeleteConfirmNotice({
      tone: "idle",
      text: "",
    })
    const headline =
      uniqueIds.length === 1
        ? `#${uniqueIds[0]} ${titleHint?.trim() || "선택한 글"}`
        : `${uniqueIds.length}개의 글`
    setDeleteConfirmState({
      ids: uniqueIds,
      headline,
    })
  }, [])

  const closeDeleteConfirm = useCallback(() => {
    setDeleteConfirmState(null)
    setDeleteConfirmNotice({
      tone: "idle",
      text: "",
    })
  }, [])

  const deletePostsFromList = useCallback(async (targetIds: number[]) => {
    const uniqueIds = Array.from(new Set(targetIds)).filter((id) => Number.isFinite(id))
    if (uniqueIds.length === 0) return true

    try {
      setLoadingKey("deletePost")
      setDeleteConfirmNotice({
        tone: "loading",
        text: `${uniqueIds.length}개 글을 삭제하고 있습니다...`,
      })
      const successIds: number[] = []
      const failedIds: string[] = []

      for (const id of uniqueIds) {
        try {
          await apiFetch<JsonValue>(`/post/api/v1/posts/${id}`, { method: "DELETE" })
          successIds.push(id)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          failedIds.push(`#${id}(${message})`)
        }
      }

      setResult(
        pretty(
          {
            deletedIds: successIds,
            failed: failedIds,
          }
        )
      )
      setAdminPostRows((prev) => prev.filter((row) => !successIds.includes(row.id)))
      setAdminPostTotal((prev) => Math.max(0, prev - successIds.length))
      setSelectedPostIds((prev) => prev.filter((id) => !successIds.includes(id)))
      const selectedPostId = Number.parseInt(postId, 10)
      if (Number.isFinite(selectedPostId) && successIds.includes(selectedPostId)) {
        switchToCreateMode({ keepContent: false })
      }
      if (successIds.length > 0) {
        await refreshPublicPostReadViews(successIds[0])
      }

      if (failedIds.length === 0) {
        setSoftDeleteUndoState({
          ids: successIds,
          expiresAt: Date.now() + 12_000,
          message: `${successIds.length}개 글을 삭제했습니다. 실행 취소 가능`,
        })
        setDeleteConfirmNotice({
          tone: "success",
          text: `${successIds.length}개 글을 삭제했습니다.`,
        })
        return true
      }

      setDeleteConfirmNotice({
        tone: "error",
        text: `${failedIds.length}개 글 삭제에 실패했습니다. 다시 시도해주세요.`,
      })
      return false
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setResult(pretty({ error: message }))
      setDeleteConfirmNotice({
        tone: "error",
        text: `삭제 실패: ${message}`,
      })
      return false
    } finally {
      setLoadingKey("")
    }
  }, [postId, pretty, refreshPublicPostReadViews, setLoadingKey, setResult, switchToCreateMode])

  const restoreDeletedPostFromList = useCallback(async (row: EditorStudioAdminPostListItem) => {
    try {
      setLoadingKey("restoreDeletedPost")
      setGlobalNotice({ tone: "loading", text: `#${row.id} 글 복구 중...` })
      setDeletedListNotice({
        tone: "loading",
        text: `#${row.id} 글을 복구하고 있습니다...`,
      })

      const response = await apiFetch<RsData<PostWriteResult>>(`/post/api/v1/adm/posts/${row.id}/restore`, {
        method: "POST",
      })

      setResult(pretty(response as unknown as JsonValue))
      await refreshPublicPostReadViews(row.id)
      setAdminPostRows((prev) => prev.filter((item) => item.id !== row.id))
      setAdminPostTotal((prev) => Math.max(0, prev - 1))
      setDeletedListNotice({
        tone: "success",
        text: `#${row.id} 글을 복구했습니다.`,
      })
      setGlobalNotice({ tone: "success", text: `#${row.id} 글 복구 완료` })
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setDeletedListNotice({
        tone: "error",
        text: `복구 실패: ${message}`,
      })
      setGlobalNotice({ tone: "error", text: `복구 실패: ${message}` })
      setResult(pretty({ error: message }))
      return false
    } finally {
      setLoadingKey("")
    }
  }, [pretty, refreshPublicPostReadViews, setGlobalNotice, setLoadingKey, setResult])

  const hardDeleteDeletedPostFromList = useCallback(async (row: EditorStudioAdminPostListItem) => {
    const confirmed = window.confirm(`#${row.id} 글을 영구삭제할까요?\n영구삭제 후에는 복구할 수 없습니다.`)
    if (!confirmed) return false

    try {
      setLoadingKey("hardDeleteDeletedPost")
      setGlobalNotice({ tone: "loading", text: `#${row.id} 글 영구삭제 중...` })
      setDeletedListNotice({
        tone: "loading",
        text: `#${row.id} 글을 영구삭제하고 있습니다...`,
      })

      const response = await apiFetch<JsonValue>(`/post/api/v1/adm/posts/${row.id}/hard`, {
        method: "DELETE",
      })

      setResult(pretty(response))
      await refreshPublicPostReadViews(row.id)
      setAdminPostRows((prev) => prev.filter((item) => item.id !== row.id))
      setAdminPostTotal((prev) => Math.max(0, prev - 1))
      setDeletedListNotice({
        tone: "success",
        text: `#${row.id} 글을 영구삭제했습니다.`,
      })
      setGlobalNotice({ tone: "success", text: `#${row.id} 글 영구삭제 완료` })
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setDeletedListNotice({
        tone: "error",
        text: `영구삭제 실패: ${message}`,
      })
      setGlobalNotice({ tone: "error", text: `영구삭제 실패: ${message}` })
      setResult(pretty({ error: message }))
      return false
    } finally {
      setLoadingKey("")
    }
  }, [pretty, refreshPublicPostReadViews, setGlobalNotice, setLoadingKey, setResult])

  const handleUndoSoftDelete = useCallback(async () => {
    if (!softDeleteUndoState || softDeleteUndoState.ids.length === 0) return

    try {
      setLoadingKey("undoDeletePost")
      setGlobalNotice({ tone: "loading", text: "삭제 실행을 취소하는 중입니다..." })
      const restoredIds: number[] = []
      const failedIds: number[] = []

      for (const id of softDeleteUndoState.ids) {
        try {
          await apiFetch<RsData<PostWriteResult>>(`/post/api/v1/adm/posts/${id}/restore`, {
            method: "POST",
          })
          restoredIds.push(id)
        } catch {
          failedIds.push(id)
        }
      }

      setResult(
        pretty({
          restoredIds,
          failedIds,
        })
      )

      if (restoredIds.length > 0) {
        await refreshPublicPostReadViews(restoredIds[0])
        await loadAdminPosts()
      }

      if (failedIds.length === 0) {
        setGlobalNotice({ tone: "success", text: `${restoredIds.length}개 글 복구를 완료했습니다.` })
      } else {
        setGlobalNotice({
          tone: "error",
          text: `복구 일부 실패: 성공 ${restoredIds.length}건 / 실패 ${failedIds.length}건`,
        })
      }
    } finally {
      setSoftDeleteUndoState(null)
      setLoadingKey("")
    }
  }, [loadAdminPosts, pretty, refreshPublicPostReadViews, setGlobalNotice, setLoadingKey, setResult, softDeleteUndoState])

  useEffect(() => {
    if (adminPostRows.length === 0) {
      setSelectedPostIds([])
      return
    }

    const rowIdSet = new Set(adminPostRows.map((row) => row.id))
    setSelectedPostIds((prev) => prev.filter((id) => rowIdSet.has(id)))
  }, [adminPostRows])

  useEffect(() => {
    setSelectedPostIds([])
    setAdminPostRows([])
    setAdminPostTotal(0)
    setListQuickPreset("none")
    setDeletedListNotice({
      tone: "idle",
      text: "",
    })
  }, [listScope, setListQuickPreset])

  useEffect(() => {
    if (!softDeleteUndoState) return
    const timeout = window.setTimeout(
      () => setSoftDeleteUndoState(null),
      Math.max(0, softDeleteUndoState.expiresAt - Date.now())
    )
    return () => window.clearTimeout(timeout)
  }, [softDeleteUndoState])

  return {
    adminPostRows,
    adminPostTotal,
    adminPostViewRows,
    closeDeleteConfirm,
    deleteConfirmNotice,
    deleteConfirmState,
    deletePostsFromList,
    deletedListNotice,
    handleUndoSoftDelete,
    hardDeleteDeletedPostFromList,
    isAllVisiblePostsSelected,
    loadAdminPosts,
    modifiedSortOrder,
    openDeleteConfirm,
    restoreDeletedPostFromList,
    selectedPostIdSet,
    selectedPostIds,
    setModifiedSortOrder,
    setSelectedPostIds,
    softDeleteUndoState,
    togglePostSelection,
    toggleSelectAllVisiblePosts,
  }
}
