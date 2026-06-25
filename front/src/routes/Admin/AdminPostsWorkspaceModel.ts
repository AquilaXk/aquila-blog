import { isServerTempDraftPost } from "./editorTempDraft"
import {
  isLocalDraftExpired,
  LOCAL_DRAFT_STORAGE_KEY,
} from "./editorStudioStorageModel"

export type PostListScope = "active" | "deleted"
export type PostStatusFilter = "all" | "draft" | "published" | "private" | "deleted"

export type AdminPostListItem = {
  id: number
  title: string
  authorName: string
  authorProfileImgUrl?: string
  category?: string | string[]
  tags?: string[]
  published: boolean
  listed: boolean
  tempDraft?: boolean
  createdAt: string
  modifiedAt: string
  deletedAt?: string
  hitCount?: number
}

export type PageDto<T> = {
  content: T[]
  pageable?: {
    pageNumber?: number
    pageSize?: number
    totalElements?: number
    totalPages?: number
  }
}

export type PostWriteResult = {
  id: number
}

export type LocalDraftPayload = {
  title: string
  content: string
  summary: string
  thumbnailUrl: string
  tags: string[]
  category: string
  visibility: "PRIVATE" | "PUBLIC_UNLISTED" | "PUBLIC_LISTED"
  savedAt: string
}

export type LocalDraftSummary = {
  title: string
  savedAt: string
  tagCount: number
  visibility: LocalDraftPayload["visibility"]
}

export type ListSort = "MODIFIED_AT" | "CREATED_AT" | "CREATED_AT_ASC"

export type WorkspaceConfirmState =
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

export type WorkspaceToastState =
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

export type WorkspaceRecentAction = {
  id: string
  tone: "success" | "error"
  label: string
  detail: string
  stateLabel: string
  occurredAt: string
}

export type ListState = {
  rows: AdminPostListItem[]
  total: number
  loadedAt: string
}

export const EDITOR_NEW_ROUTE_PATH = "/editor/new"
export const DEFAULT_PAGE = "1"
export const DEFAULT_PAGE_SIZE = "20"
export const DEFAULT_SORT: ListSort = "MODIFIED_AT"
export const LIST_SKELETON_ROW_COUNT = 5
export const POSTS_WORKSPACE_DEFERRED_PANEL_TIMEOUT_MS = 720
export const POSTS_WORKSPACE_MOBILE_LIST_DELAY_MS = 180
export const POSTS_WORKSPACE_MOBILE_LIST_QUERY = "(max-width: 900px)"

export const formatDateTime = (value?: string) => {
  if (!value) return "-"
  return value.slice(0, 16).replace("T", " ")
}

export const toVisibility = (published: boolean, listed: boolean) => {
  if (!published) return "PRIVATE" as const
  if (listed) return "PUBLIC_LISTED" as const
  return "PUBLIC_UNLISTED" as const
}

export const visibilityLabel = (published: boolean, listed: boolean) => {
  const visibility = toVisibility(published, listed)
  if (visibility === "PRIVATE") return "비공개"
  if (visibility === "PUBLIC_UNLISTED") return "링크 공개"
  return "전체 공개"
}

export const getWorkspacePostStatusFilter = (
  row: Pick<AdminPostListItem, "title" | "published" | "listed" | "tempDraft">
): Exclude<PostStatusFilter, "all" | "deleted"> => {
  if (isServerTempDraftPost(row)) return "draft"
  if (!row.published) return "private"
  return "published"
}

export const workspaceStatusLabel = (row: Pick<AdminPostListItem, "title" | "published" | "listed" | "tempDraft">) => {
  const status = getWorkspacePostStatusFilter(row)
  if (status === "draft") return "초안"
  if (status === "published") return "발행"
  return "비공개"
}

export const getWorkspaceTopicLabel = (row: Pick<AdminPostListItem, "category" | "tags">) => {
  if (typeof row.category === "string" && row.category.trim()) return row.category.trim()
  const firstCategory = Array.isArray(row.category) ? row.category.find((category) => category.trim()) : undefined
  if (firstCategory?.trim()) return firstCategory.trim()
  const firstTag = row.tags?.find((tag) => tag.trim())
  return firstTag?.trim() || "-"
}

export const formatWorkspaceViews = (row: Pick<AdminPostListItem, "hitCount">) =>
  typeof row.hitCount === "number" ? String(row.hitCount) : "-"

export const isWorkspaceTempDraft = (row: Pick<AdminPostListItem, "title" | "published" | "listed" | "tempDraft">) =>
  isServerTempDraftPost(row)

export const getWorkspaceRowTitle = (row: Pick<AdminPostListItem, "title" | "published" | "listed" | "tempDraft">) =>
  isWorkspaceTempDraft(row) ? "임시 저장" : row.title

export const visibilityLabelFromValue = (visibility: LocalDraftPayload["visibility"]) => {
  if (visibility === "PRIVATE") return "비공개"
  if (visibility === "PUBLIC_UNLISTED") return "링크 공개"
  return "전체 공개"
}

export const buildRowTitle = (row: Pick<AdminPostListItem, "title" | "published" | "listed" | "tempDraft">) =>
  getWorkspaceRowTitle(row) || "제목 없는 글"

export const buildWorkspaceAuthorFallbackInitial = (authorName: string) => {
  const source = authorName.trim() || "작"
  return source.slice(0, 1).toUpperCase()
}

export const canOpenCanonicalPost = (row: Pick<AdminPostListItem, "published" | "tempDraft">) =>
  row.published && row.tempDraft !== true

export const sanitizeNumberInput = (value: string, fallback: string) => {
  const digits = value.replace(/[^0-9]/g, "")
  return digits.length > 0 ? digits : fallback
}

export const buildListEndpoint = (
  scope: PostListScope,
  options: { page: string; pageSize: string; kw: string; sort: ListSort; status?: PostStatusFilter }
) => {
  const query = new URLSearchParams({
    page: options.page,
    pageSize: options.pageSize,
    kw: options.kw,
  })

  const endpoint = scope === "deleted" ? "/post/api/v1/adm/posts/deleted" : "/post/api/v1/adm/posts"
  if (scope === "active") {
    query.set("sort", options.sort)
    if (options.status && options.status !== "all" && options.status !== "deleted") {
      query.set("status", options.status)
    }
  }

  return `${endpoint}?${query.toString()}`
}

export const readLocalDraft = (): LocalDraftSummary | null => {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(LOCAL_DRAFT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LocalDraftPayload>
    if (!parsed || typeof parsed !== "object") return null

    const title = typeof parsed.title === "string" ? parsed.title.trim() : ""
    const content = typeof parsed.content === "string" ? parsed.content.trim() : ""
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : ""
    const savedAt = typeof parsed.savedAt === "string" ? parsed.savedAt : ""
    if (isLocalDraftExpired(savedAt)) {
      window.localStorage.removeItem(LOCAL_DRAFT_STORAGE_KEY)
      return null
    }
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
      savedAt,
      tagCount: tags.length,
      visibility,
    }
  } catch {
    return null
  }
}
