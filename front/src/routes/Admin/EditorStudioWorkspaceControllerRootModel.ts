import type { KeyboardEvent as ReactKeyboardEvent } from "react"
import { getApiBaseUrl } from "src/apis/backend/client"
import { toCanonicalPostPath } from "src/libs/utils/postPath"
import {
  applyThumbnailTransformToUrl,
  DEFAULT_THUMBNAIL_FOCUS_X,
  DEFAULT_THUMBNAIL_FOCUS_Y,
  DEFAULT_THUMBNAIL_ZOOM,
} from "src/libs/thumbnailFocus"
import {
  isServerTempDraftPost,
  TEMP_DRAFT_BODY_PLACEHOLDER,
} from "./editorTempDraft"
import type {
  PostVisibility,
} from "./editorStudioState"
import type {
  ResolvedEditorMetaSnapshot,
} from "./editorStudioMetaModel"

export const MARKDOWN_EDITOR_MERMAID_ENABLED = process.env.NEXT_PUBLIC_EDITOR_V2_MERMAID_ENABLED !== "false"
export const ADMIN_POSTS_WORKSPACE_ROUTE = "/admin/posts"
export const EDITOR_NEW_ROUTE_PATH = "/editor/new"

export const toEditorPostRoute = (id: string | number) => `/editor/${encodeURIComponent(String(id))}`

export const buildCanonicalPostUrl = (postId: string | number) => {
  const path = toCanonicalPostPath(postId)
  if (typeof window === "undefined") return path
  return new URL(path, window.location.origin).toString()
}

export const extractImageFileFromClipboard = (clipboardData: DataTransfer | null): File | null => {
  if (!clipboardData) return null

  const directFile = Array.from(clipboardData.files || []).find((file) => file.type.startsWith("image/"))
  if (directFile) return directFile

  const clipboardItem = Array.from(clipboardData.items || []).find(
    (item) => item.kind === "file" && item.type.startsWith("image/")
  )
  if (!clipboardItem) return null

  const pastedFile = clipboardItem.getAsFile()
  if (!pastedFile || !pastedFile.type.startsWith("image/")) return null
  return pastedFile
}

export const normalizeEditorReturnRoute = (value: string) => {
  const normalized = value.trim()
  if (!normalized.startsWith("/") || normalized.startsWith("//")) return ""
  if (/[\r\n]/.test(normalized)) return ""
  if (/^\/(?:https?:|javascript:)/i.test(normalized)) return ""
  if (normalized.startsWith("/editor")) return ""
  return normalized
}

export type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null

export type PostForEditor = {
  id: number
  title: string
  content: string
  contentHtml?: string
  version?: number
  published: boolean
  listed: boolean
  tempDraft?: boolean
}

export type RsData<T> = {
  resultCode: string
  msg: string
  data: T
}

export type NoticeTone = "idle" | "loading" | "success" | "error"
export type NoticeState = {
  tone: NoticeTone
  text: string
}
export type StudioSurface = "manage" | "compose"
export type MobileStudioStep = "query" | "list" | "edit" | "publish"
export type PreviewViewportMode = "desktop" | "tablet" | "mobile"
export type ManageMobileStudioStep = "query" | "list"
export type ComposeMobileStudioStep = "edit" | "publish"

export const GLOBAL_NOTICE_IDLE_TEXT = "운영 작업 상태가 여기에 표시됩니다."
export const TAG_RECOMMENDATION_IDLE_TEXT = "AI 태그 추천 상태가 여기에 표시됩니다."
export const MANAGE_MOBILE_STUDIO_STEPS = ["query", "list"] as const
export const COMPOSE_MOBILE_STUDIO_STEPS = ["edit", "publish"] as const

export const MOBILE_STUDIO_STEP_LABEL: Record<MobileStudioStep, string> = {
  query: "조회",
  list: "목록",
  edit: "편집",
  publish: "발행",
}

export const MOBILE_STUDIO_STEP_DESCRIPTION: Record<MobileStudioStep, string> = {
  query: "페이지/키워드/정렬 조건을 먼저 정리하고 목록을 불러오세요.",
  list: "목록에서 대상 글을 선택하거나 post id를 확인해 편집 단계로 넘깁니다.",
  edit: "본문, 태그, 메타를 정리한 뒤 발행 설정으로 이동합니다.",
  publish: "노출 범위와 카드 미리보기를 확인하고 최종 반영하세요.",
}

export const getMobileStudioStepMoveLabel = (step: MobileStudioStep) =>
  `${MOBILE_STUDIO_STEP_LABEL[step]}${MOBILE_STUDIO_STEP_LABEL[step].endsWith("집") ? "으로" : "로"} 이동`

const PROFILE_IMAGE_UPLOAD_RETRY_DELAY_MS = 700
const IMAGE_UPLOAD_CONFLICT_MAX_RETRIES = 3
const EDITOR_BODY_PLACEHOLDER = "내용을 입력하세요."

export const syncTitleTextareaHeight = (element: HTMLTextAreaElement | null) => {
  if (!element) return
  element.style.height = "0px"
  element.style.height = `${Math.max(element.scrollHeight, 44)}px`
}

export const PREVIEW_CARD_VIEWPORTS: Record<
  PreviewViewportMode,
  {
    label: string
    description: string
    cardWidth: number
  }
> = {
  desktop: {
    label: "Desktop",
    description: "1440px 메인 카드 폭",
    cardWidth: 368,
  },
  tablet: {
    label: "iPad mini",
    description: "768px 2열 카드 폭",
    cardWidth: 320,
  },
  mobile: {
    label: "iPhone 15 Pro",
    description: "393px 1열 카드 폭",
    cardWidth: 286,
  },
}

const isTempDraftBodyPlaceholder = (value: string) => {
  const normalized = value.replace(/\r\n?/g, "\n").trim()
  return normalized === TEMP_DRAFT_BODY_PLACEHOLDER || normalized === EDITOR_BODY_PLACEHOLDER
}

export const isBlankServerTempDraft = (
  post: Pick<PostForEditor, "title" | "published" | "listed" | "tempDraft">,
  snapshot: ResolvedEditorMetaSnapshot
) => isServerTempDraftPost(post) && isTempDraftBodyPlaceholder(snapshot.body)

export const buildEmptyEditorMetaSnapshot = (): ResolvedEditorMetaSnapshot => ({
  body: "",
  tags: [],
  category: "",
  summary: "",
  thumbnailUrl: "",
  thumbnailFocusX: DEFAULT_THUMBNAIL_FOCUS_X,
  thumbnailFocusY: DEFAULT_THUMBNAIL_FOCUS_Y,
  thumbnailZoom: DEFAULT_THUMBNAIL_ZOOM,
})

export const PREVIEW_CARD_VIEWPORT_ORDER: PreviewViewportMode[] = ["desktop", "tablet", "mobile"]

export const PUBLISH_VISIBILITY_OPTIONS: Array<{
  value: PostVisibility
  label: string
  description: string
}> = [
  {
    value: "PUBLIC_LISTED",
    label: "전체 공개",
    description: "메인 목록과 검색에 노출됩니다.",
  },
  {
    value: "PUBLIC_UNLISTED",
    label: "링크 공개",
    description: "URL을 아는 사람만 볼 수 있습니다.",
  },
  {
    value: "PRIVATE",
    label: "비공개",
    description: "관리자만 확인합니다.",
  },
]

export const SHOW_LEGACY_PROFILE_STUDIO = process.env.NEXT_PUBLIC_SHOW_LEGACY_PROFILE_STUDIO === "true"
export const SHOW_LEGACY_CONTENT_STUDIO = process.env.NEXT_PUBLIC_SHOW_LEGACY_CONTENT_STUDIO === "true"
export const SHOW_LEGACY_UTILITY_STUDIO = process.env.NEXT_PUBLIC_SHOW_LEGACY_UTILITY_STUDIO === "true"

export const pretty = (value: unknown) => JSON.stringify(value, null, 2)

export const isComposingKeyboardEvent = (
  event: ReactKeyboardEvent<HTMLElement>
) => {
  const nativeEvent = event.nativeEvent as KeyboardEvent & { isComposing?: boolean; keyCode?: number }
  return nativeEvent.isComposing === true || nativeEvent.keyCode === 229
}

export const generateIdempotencyKey = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `post-write-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const EDITOR_RUNTIME_GUARD_SAMPLE_LIMIT = 240

type RuntimeGuardWindow = Window & {
  __AQ_RUNTIME_GUARD_ENABLED__?: boolean
  __AQ_RUNTIME_GUARD__?: {
    editorCommitSamples?: number[]
  }
}

export const recordEditorCommitDurationForRuntimeGuard = (actualDuration: number) => {
  if (typeof window === "undefined" || !Number.isFinite(actualDuration) || actualDuration <= 0) return
  const runtimeWindow = window as RuntimeGuardWindow
  if (!runtimeWindow.__AQ_RUNTIME_GUARD_ENABLED__) return

  const store = (runtimeWindow.__AQ_RUNTIME_GUARD__ ??= {})
  const nextSamples = [...(store.editorCommitSamples ?? []), actualDuration]
  if (nextSamples.length > EDITOR_RUNTIME_GUARD_SAMPLE_LIMIT) {
    nextSamples.splice(0, nextSamples.length - EDITOR_RUNTIME_GUARD_SAMPLE_LIMIT)
  }
  store.editorCommitSamples = nextSamples
}

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

const waitFor = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })

const computeConflictRetryDelay = (attempt: number): number =>
  PROFILE_IMAGE_UPLOAD_RETRY_DELAY_MS * Math.max(1, attempt + 1)

const TEMP_POST_CONFLICT_MAX_RETRIES = 2

export const requestTempPostWithConflictRetry = async (
  resolveExistingTempPost: () => Promise<PostForEditor | null>,
  maxRetries: number = TEMP_POST_CONFLICT_MAX_RETRIES
): Promise<RsData<PostForEditor>> => {
  let lastConflictBody = ""

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(`${getApiBaseUrl()}/post/api/v1/posts/temp`, {
      method: "POST",
      credentials: "include",
    })

    if (response.status !== 409) {
      if (!response.ok) {
        const body = await parseResponseErrorBody(response)
        throw new Error(body || `임시글 불러오기 실패 (${response.status})`)
      }

      return (await response.json()) as RsData<PostForEditor>
    }

    lastConflictBody = await parseResponseErrorBody(response)
    if (attempt < maxRetries) {
      await waitFor(computeConflictRetryDelay(attempt))
      continue
    }
  }

  const recoveredTempPost = await resolveExistingTempPost()
  if (recoveredTempPost) {
    return {
      resultCode: "200-1",
      msg: "기존 임시저장 글을 불러옵니다.",
      data: recoveredTempPost,
    }
  }

  throw new Error(lastConflictBody || "요청 충돌이 발생했습니다. 다시 시도해주세요.")
}

export const uploadWithConflictRetry = async (
  requestUpload: () => Promise<Response>,
  maxRetries: number = IMAGE_UPLOAD_CONFLICT_MAX_RETRIES
): Promise<Response> => {
  let lastConflictBody = ""

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await requestUpload()
    if (response.status !== 409) {
      if (!response.ok) {
        const body = await parseResponseErrorBody(response)
        throw new Error(`이미지 업로드 실패 (${response.status}): ${body}`)
      }
      return response
    }

    lastConflictBody = await parseResponseErrorBody(response)
    if (attempt >= maxRetries) {
      throw new Error(
        `이미지 업로드 실패 (409): ${lastConflictBody || "요청 충돌이 반복되어 업로드를 완료하지 못했습니다."}`
      )
    }

    await waitFor(computeConflictRetryDelay(attempt))
  }

  throw new Error(
    `이미지 업로드 실패 (409): ${lastConflictBody || "요청 충돌이 반복되어 업로드를 완료하지 못했습니다."}`
  )
}

export const buildEffectiveThumbnailUrl = ({
  postThumbnailFocusX,
  postThumbnailFocusY,
  postThumbnailZoom,
  resolvedPreviewThumbnail,
}: {
  postThumbnailFocusX: number
  postThumbnailFocusY: number
  postThumbnailZoom: number
  resolvedPreviewThumbnail: string
}) => {
  const normalizedThumbnail = resolvedPreviewThumbnail.trim()
  if (!normalizedThumbnail) return ""
  return applyThumbnailTransformToUrl(normalizedThumbnail, {
    focusX: postThumbnailFocusX,
    focusY: postThumbnailFocusY,
    zoom: postThumbnailZoom,
  })
}
