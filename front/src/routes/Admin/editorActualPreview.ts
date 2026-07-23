import type { TPost } from "src/types"

export type EditorActualPreviewVisibility = "PRIVATE" | "PUBLIC_UNLISTED" | "PUBLIC_LISTED"

export type EditorActualPreviewSnapshot = {
  id: string
  title: string
  content: string
  summary: string
  tags: string[]
  visibility: EditorActualPreviewVisibility
  thumbnailUrl: string
  authorName: string
  authorImageUrl: string
  createdAt: string
}

const STORAGE_PREFIX = "editor.actual-preview.v1:"
const FALLBACK_ID = "draft-preview"

export const toEditorActualPreviewRoute = (id?: string | number) =>
  `/editor/preview/${encodeURIComponent(String(id || FALLBACK_ID))}`

export const getEditorActualPreviewStorageKey = (id?: string | number) =>
  `${STORAGE_PREFIX}${String(id || FALLBACK_ID)}`

export const writeEditorActualPreviewSnapshot = (id: string | number | undefined, snapshot: EditorActualPreviewSnapshot) => {
  if (typeof window === "undefined") return
  window.localStorage.setItem(getEditorActualPreviewStorageKey(id), JSON.stringify(snapshot))
}

export const readEditorActualPreviewSnapshot = (
  id: string | number | undefined
): EditorActualPreviewSnapshot | null => {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(getEditorActualPreviewStorageKey(id))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<EditorActualPreviewSnapshot>
    if (!parsed || typeof parsed !== "object") return null

    return {
      id: typeof parsed.id === "string" ? parsed.id : String(id || FALLBACK_ID),
      title: typeof parsed.title === "string" ? parsed.title : "",
      content: typeof parsed.content === "string" ? parsed.content : "",
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((item): item is string => typeof item === "string") : [],
      visibility:
        parsed.visibility === "PRIVATE" ||
        parsed.visibility === "PUBLIC_UNLISTED" ||
        parsed.visibility === "PUBLIC_LISTED"
          ? parsed.visibility
          : "PUBLIC_LISTED",
      thumbnailUrl: typeof parsed.thumbnailUrl === "string" ? parsed.thumbnailUrl : "",
      authorName: typeof parsed.authorName === "string" ? parsed.authorName : "",
      authorImageUrl: typeof parsed.authorImageUrl === "string" ? parsed.authorImageUrl : "",
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export const toPreviewPostStatus = (visibility: EditorActualPreviewVisibility): TPost["status"] => {
  if (visibility === "PRIVATE") return ["Private"]
  if (visibility === "PUBLIC_UNLISTED") return ["PublicOnDetail"]
  return ["Public"]
}
