import { normalizePersistedSummary } from "src/libs/postSummary"
import { normalizeCategoryValue } from "src/libs/utils"
import {
  clampThumbnailFocusX,
  clampThumbnailFocusY,
  clampThumbnailZoom,
  DEFAULT_THUMBNAIL_FOCUS_X,
  DEFAULT_THUMBNAIL_FOCUS_Y,
  DEFAULT_THUMBNAIL_ZOOM,
  parseThumbnailFocusXFromUrl,
  parseThumbnailFocusYFromUrl,
  parseThumbnailZoomFromUrl,
  stripThumbnailFocusFromUrl,
} from "src/libs/thumbnailFocus"
import {
  dedupeStrings,
  normalizeSafeImageUrl,
  type LocalDraftPayload,
} from "./editorStudioMetaModel"

export const TAG_CATALOG_STORAGE_KEY = "admin.editor.customTags"
export const CATEGORY_CATALOG_STORAGE_KEY = "admin.editor.customCategories"
export const LOCAL_DRAFT_STORAGE_KEY = "admin.editor.localDraft.v1"
export const LOCAL_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export const isLocalDraftExpired = (savedAt: string, nowMs: number = Date.now()) => {
  const savedAtMs = Date.parse(savedAt)
  if (!Number.isFinite(savedAtMs)) return true
  if (savedAtMs > nowMs) return true
  return nowMs - savedAtMs >= LOCAL_DRAFT_MAX_AGE_MS
}

export const readStoredCatalog = (storageKey: string) => {
  if (typeof window === "undefined") return []

  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? dedupeStrings(parsed.filter((item): item is string => typeof item === "string"))
      : []
  } catch {
    return []
  }
}

export const persistCatalog = (storageKey: string, values: string[]) => {
  if (typeof window === "undefined") return
  window.localStorage.setItem(storageKey, JSON.stringify(dedupeStrings(values)))
}

export const readLocalDraft = (): LocalDraftPayload | null => {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(LOCAL_DRAFT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LocalDraftPayload>
    if (!parsed || typeof parsed !== "object") return null
    const savedAt = typeof parsed.savedAt === "string" ? parsed.savedAt : ""
    if (isLocalDraftExpired(savedAt)) {
      removeLocalDraft()
      return null
    }

    const visibility = parsed.visibility
    const isValidVisibility =
      visibility === "PRIVATE" || visibility === "PUBLIC_UNLISTED" || visibility === "PUBLIC_LISTED"
    const rawThumbnailUrl =
      typeof parsed.thumbnailUrl === "string" ? normalizeSafeImageUrl(parsed.thumbnailUrl) : ""
    const legacyFocusX = parseThumbnailFocusXFromUrl(rawThumbnailUrl, DEFAULT_THUMBNAIL_FOCUS_X)
    const legacyFocusY = parseThumbnailFocusYFromUrl(rawThumbnailUrl, DEFAULT_THUMBNAIL_FOCUS_Y)
    const legacyZoom = parseThumbnailZoomFromUrl(rawThumbnailUrl, DEFAULT_THUMBNAIL_ZOOM)
    const parsedFocusX =
      typeof parsed.thumbnailFocusX === "number"
        ? clampThumbnailFocusX(parsed.thumbnailFocusX)
        : legacyFocusX
    const parsedFocusY =
      typeof parsed.thumbnailFocusY === "number"
        ? clampThumbnailFocusY(parsed.thumbnailFocusY)
        : legacyFocusY
    const parsedZoom =
      typeof parsed.thumbnailZoom === "number"
        ? clampThumbnailZoom(parsed.thumbnailZoom)
        : legacyZoom

    return {
      title: typeof parsed.title === "string" ? parsed.title : "",
      content: typeof parsed.content === "string" ? parsed.content : "",
      summary: normalizePersistedSummary(parsed.summary),
      thumbnailUrl: stripThumbnailFocusFromUrl(rawThumbnailUrl),
      thumbnailFocusX: parsedFocusX,
      thumbnailFocusY: parsedFocusY,
      thumbnailZoom: parsedZoom,
      tags: Array.isArray(parsed.tags)
        ? dedupeStrings(parsed.tags.filter((item): item is string => typeof item === "string"))
        : [],
      category: typeof parsed.category === "string" ? normalizeCategoryValue(parsed.category) : "",
      visibility: isValidVisibility ? visibility : "PUBLIC_LISTED",
      savedAt,
    }
  } catch {
    return null
  }
}

export const persistLocalDraft = (payload: LocalDraftPayload) => {
  if (typeof window === "undefined") return
  window.localStorage.setItem(LOCAL_DRAFT_STORAGE_KEY, JSON.stringify(payload))
}

export const removeLocalDraft = () => {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(LOCAL_DRAFT_STORAGE_KEY)
}
