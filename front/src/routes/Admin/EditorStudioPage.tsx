import styled from "@emotion/styled"
import { useQueryClient } from "@tanstack/react-query"
import { GetServerSideProps, NextPage } from "next"
import dynamic from "next/dynamic"
import { useRouter } from "next/router"
import {
  ChangeEvent,
  ClipboardEvent,
  CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { apiFetch, getApiBaseUrl } from "src/apis/backend/client"
import { invalidatePublicPostReadCaches } from "src/apis/backend/posts"
import useAuthSession from "src/hooks/useAuthSession"
import { setAdminProfileCache, toAdminProfile } from "src/hooks/useAdminProfile"
import {
  compareCategoryValues,
  formatDate,
  normalizeCategoryValue,
} from "src/libs/utils"
import {
  consumeGuardOnExpectedUpdate,
  createBlockEditorLoadGuardState,
  markGuardEmptyUpdateIgnored,
  shouldIgnoreBlockEditorEmptyUpdate,
  type BlockEditorLoadGuardState,
} from "./editorLoadSyncGuard"
import {
  deriveEditorPersistenceState,
  isPublishActionDisabled,
} from "./editorStudioState"
import {
  isServerTempDraftPost,
  isTempDraftTitlePlaceholder,
  TEMP_DRAFT_BODY_PLACEHOLDER,
  TEMP_DRAFT_TITLE_PLACEHOLDER,
} from "./editorTempDraft"
import {
  isNavigationCancelledError,
  pushRoute,
  replaceRoute,
  replaceShallowRoutePreservingScroll,
  toLoginPath,
} from "src/libs/router"
import { AdminPageProps, getAdminPageProps } from "src/libs/server/adminPage"
import ProfileImage from "src/components/ProfileImage"
import AppIcon from "src/components/icons/AppIcon"
import {
  applyThumbnailTransformToUrl,
  clampThumbnailFocusX,
  clampThumbnailFocusY,
  clampThumbnailZoom,
  DEFAULT_THUMBNAIL_FOCUS_X,
  DEFAULT_THUMBNAIL_FOCUS_Y,
  DEFAULT_THUMBNAIL_ZOOM,
  getThumbnailFocusXFromUrl,
  getThumbnailFocusYFromUrl,
  getThumbnailZoomFromUrl,
  parseThumbnailFocusXFromUrl,
  parseThumbnailZoomFromUrl,
  parseThumbnailFocusYFromUrl,
  stripThumbnailFocusFromUrl,
} from "src/libs/thumbnailFocus"
import {
  buildImageOptimizationSummary,
  normalizeProfileImageUploadError,
  preparePostImageForUpload,
  prepareProfileImageForUpload,
  POST_IMAGE_UPLOAD_RULE_LABEL,
  PROFILE_IMAGE_UPLOAD_RULE_LABEL,
} from "src/libs/profileImageUpload"
import { saveProfileCardWithConflictRetry } from "src/libs/profileCardSave"
import useViewportImageEditor from "src/libs/imageEditor/useViewportImageEditor"
import {
  parseStandaloneMarkdownImageLine,
  serializeStandaloneMarkdownImageLine,
} from "src/libs/markdown/rendering"
import { serializeMarkdownTableLayoutComment } from "src/libs/markdown/tableMetadata"
import { buildPreviewSummaryFromMarkdown } from "src/libs/postSummary"
import type { BlockEditorChangeMeta } from "src/components/editor/BlockEditorShell"

const BLOCK_EDITOR_V2_ENABLED = process.env.NEXT_PUBLIC_EDITOR_V2_ENABLED !== "false"
const BLOCK_EDITOR_V2_MERMAID_ENABLED = process.env.NEXT_PUBLIC_EDITOR_V2_MERMAID_ENABLED === "true"
const ADMIN_POSTS_WORKSPACE_ROUTE = "/admin/posts"
const EDITOR_NEW_ROUTE_PATH = "/editor/new"

const toEditorPostRoute = (id: string | number) => `/editor/${encodeURIComponent(String(id))}`
const LIVE_PREVIEW_VIEWPORTS: Record<
  PreviewViewportMode,
  { label: string; maxWidth: string }
> = {
  desktop: { label: "데스크톱", maxWidth: "100%" },
  tablet: { label: "태블릿", maxWidth: "820px" },
  mobile: { label: "모바일", maxWidth: "430px" },
}

const LazyBlockEditorShell = dynamic(() => import("src/components/editor/BlockEditorShell"), {
  ssr: false,
  loading: () => <div style={{ padding: "1rem 1.1rem", color: "var(--color-gray10)" }}>블록 에디터 준비 중...</div>,
})

const LazyMarkdownRenderer = dynamic(() => import("src/routes/Detail/components/MarkdownRenderer"), {
  ssr: false,
  loading: () => <div style={{ padding: "1rem 1.1rem", color: "var(--color-gray10)" }}>미리보기 렌더 준비 중...</div>,
})

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
  aboutRole?: string
  aboutBio?: string
  aboutDetails?: string
  blogTitle?: string
  homeIntroTitle?: string
  homeIntroDescription?: string
}

type PostForEditor = {
  id: number
  title: string
  content: string
  contentHtml?: string
  version?: number
  published: boolean
  listed: boolean
  tempDraft?: boolean
}

type PostVisibility = "PRIVATE" | "PUBLIC_UNLISTED" | "PUBLIC_LISTED"
type PostListScope = "active" | "deleted"

type UploadPostImageResponse = {
  data: {
    key: string
    url: string
    markdown: string
  }
}
type UploadPostImageResult = {
  uploaded: UploadPostImageResponse
  prepared: {
    summary: string
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
  version?: number
  published: boolean
  listed: boolean
}

type PublicPostContentFallback = {
  content?: string
  contentHtml?: string
}

type RecommendTagsPayload = {
  tags?: string[]
  provider?: string
  model?: string | null
  reason?: string | null
  degraded?: boolean
  traceId?: string | null
}

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

type DeleteConfirmState = {
  ids: number[]
  headline: string
}

type ListQuickPreset = "none" | "today" | "temp"

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

type TagUsageDto = {
  tag: string
  count: number
}

type NoticeTone = "idle" | "loading" | "success" | "error"
type NoticeState = {
  tone: NoticeTone
  text: string
}
type EditorMode = "create" | "edit"
type PublishActionType = "create" | "modify" | "temp"
type StudioSurface = "manage" | "compose"
type MobileStudioStep = "query" | "list" | "edit" | "publish"
type ParsedEditorMeta = {
  body: string
  tags: string[]
  category: string
  summary: string
  thumbnail: string
}

type ResolvedEditorMetaSnapshot = {
  body: string
  tags: string[]
  category: string
  summary: string
  thumbnailUrl: string
  thumbnailFocusX: number
  thumbnailFocusY: number
  thumbnailZoom: number
}

type MetaUsageMap = Record<string, number>
type LocalDraftPayload = {
  title: string
  content: string
  summary: string
  thumbnailUrl: string
  thumbnailFocusX: number
  thumbnailFocusY: number
  thumbnailZoom: number
  tags: string[]
  category: string
  visibility: PostVisibility
  savedAt: string
}

type ThumbnailSourceSize = {
  width: number
  height: number
}

type ThumbnailTransformState = {
  focusX: number
  focusY: number
  zoom: number
}

type PreviewViewportMode = "desktop" | "tablet" | "mobile"
type ComposeViewMode = "editor" | "split" | "preview"
type ManageMobileStudioStep = "query" | "list"
type ComposeMobileStudioStep = "edit" | "publish"

const TAG_CATALOG_STORAGE_KEY = "admin.editor.customTags"
const CATEGORY_CATALOG_STORAGE_KEY = "admin.editor.customCategories"
const LOCAL_DRAFT_STORAGE_KEY = "admin.editor.localDraft.v1"
const LIST_CONDITION_STORAGE_KEY = "admin.contentStudio.listConditions.v1"
const LIST_CACHE_TTL_MS = 45_000
const GLOBAL_NOTICE_IDLE_TEXT = "운영 작업 상태가 여기에 표시됩니다."
const TAG_RECOMMENDATION_IDLE_TEXT = "AI 태그 추천 상태가 여기에 표시됩니다."
const MANAGE_MOBILE_STUDIO_STEPS = ["query", "list"] as const
const COMPOSE_MOBILE_STUDIO_STEPS = ["edit", "publish"] as const

const LIST_SORT_OPTIONS = [
  { value: "CREATED_AT", label: "최신순" },
  { value: "CREATED_AT_ASC", label: "오래된순" },
] as const

const MOBILE_STUDIO_STEP_LABEL: Record<MobileStudioStep, string> = {
  query: "조회",
  list: "목록",
  edit: "편집",
  publish: "발행",
}
const MOBILE_STUDIO_STEP_DESCRIPTION: Record<MobileStudioStep, string> = {
  query: "페이지/키워드/정렬 조건을 먼저 정리하고 목록을 불러오세요.",
  list: "목록에서 대상 글을 선택하거나 post id를 확인해 편집 단계로 넘깁니다.",
  edit: "본문, 태그, 메타를 정리한 뒤 발행 설정으로 이동합니다.",
  publish: "노출 범위와 카드 미리보기를 확인하고 최종 반영하세요.",
}

const getMobileStudioStepMoveLabel = (step: MobileStudioStep) =>
  `${MOBILE_STUDIO_STEP_LABEL[step]}${MOBILE_STUDIO_STEP_LABEL[step].endsWith("집") ? "으로" : "로"} 이동`

const PROFILE_IMAGE_UPLOAD_RETRY_DELAY_MS = 700
const IMAGE_UPLOAD_CONFLICT_MAX_RETRIES = 3
const THUMBNAIL_FRAME_ASPECT_RATIO = 1.94
const EDITOR_BODY_PLACEHOLDER = "내용을 입력하세요."

const syncTitleTextareaHeight = (element: HTMLTextAreaElement | null) => {
  if (!element) return
  element.style.height = "0px"
  element.style.height = `${Math.max(element.scrollHeight, 44)}px`
}
const EDITOR_TOGGLE_TITLE_PLACEHOLDER = "토글 제목"
const DEFAULT_THUMBNAIL_SOURCE_SIZE: ThumbnailSourceSize = {
  width: THUMBNAIL_FRAME_ASPECT_RATIO,
  height: 1,
}
const PREVIEW_CARD_VIEWPORTS: Record<
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

const isBlankServerTempDraft = (
  post: Pick<PostForEditor, "title" | "published" | "listed">,
  snapshot: Pick<ResolvedEditorMetaSnapshot, "body">
) => isServerTempDraftPost(post) && isTempDraftBodyPlaceholder(snapshot.body)

const buildEmptyEditorMetaSnapshot = (): ResolvedEditorMetaSnapshot => ({
  body: "",
  tags: [],
  category: "",
  summary: "",
  thumbnailUrl: "",
  thumbnailFocusX: DEFAULT_THUMBNAIL_FOCUS_X,
  thumbnailFocusY: DEFAULT_THUMBNAIL_FOCUS_Y,
  thumbnailZoom: DEFAULT_THUMBNAIL_ZOOM,
})
const PREVIEW_CARD_VIEWPORT_ORDER: PreviewViewportMode[] = ["desktop", "tablet", "mobile"]
const PUBLISH_VISIBILITY_OPTIONS: Array<{
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

const TAG_TONES = [
  {
    bg: "rgba(59, 130, 246, 0.12)",
    border: "rgba(96, 165, 250, 0.36)",
    text: "#bfdbfe",
    shadow: "none",
    divider: "rgba(147, 197, 253, 0.22)",
    buttonBg: "rgba(15, 23, 42, 0.1)",
    buttonText: "#bfdbfe",
  },
  {
    bg: "rgba(20, 184, 166, 0.12)",
    border: "rgba(45, 212, 191, 0.34)",
    text: "#99f6e4",
    shadow: "none",
    divider: "rgba(153, 246, 228, 0.2)",
    buttonBg: "rgba(15, 23, 42, 0.1)",
    buttonText: "#99f6e4",
  },
  {
    bg: "rgba(139, 92, 246, 0.12)",
    border: "rgba(167, 139, 250, 0.34)",
    text: "#ddd6fe",
    shadow: "none",
    divider: "rgba(196, 181, 253, 0.2)",
    buttonBg: "rgba(15, 23, 42, 0.1)",
    buttonText: "#ddd6fe",
  },
  {
    bg: "rgba(249, 115, 22, 0.12)",
    border: "rgba(251, 146, 60, 0.34)",
    text: "#fed7aa",
    shadow: "none",
    divider: "rgba(253, 186, 116, 0.22)",
    buttonBg: "rgba(15, 23, 42, 0.1)",
    buttonText: "#fed7aa",
  },
  {
    bg: "rgba(16, 185, 129, 0.12)",
    border: "rgba(52, 211, 153, 0.34)",
    text: "#a7f3d0",
    shadow: "none",
    divider: "rgba(110, 231, 183, 0.2)",
    buttonBg: "rgba(15, 23, 42, 0.1)",
    buttonText: "#a7f3d0",
  },
] as const

const INLINE_TEXT_COLOR_OPTIONS = [
  { label: "하늘", value: "#60a5fa" },
  { label: "바이올렛", value: "#a78bfa" },
  { label: "그린", value: "#34d399" },
  { label: "오렌지", value: "#fb923c" },
  { label: "로즈", value: "#f472b6" },
  { label: "옐로", value: "#facc15" },
  { label: "슬레이트", value: "#94a3b8" },
] as const

const SHOW_LEGACY_PROFILE_STUDIO = process.env.NEXT_PUBLIC_SHOW_LEGACY_PROFILE_STUDIO === "true"
const SHOW_LEGACY_CONTENT_STUDIO = process.env.NEXT_PUBLIC_SHOW_LEGACY_CONTENT_STUDIO === "true"
const SHOW_LEGACY_UTILITY_STUDIO = process.env.NEXT_PUBLIC_SHOW_LEGACY_UTILITY_STUDIO === "true"

export const getEditorStudioPageProps: GetServerSideProps<AdminPageProps> = async ({ req }) => {
  return await getAdminPageProps(req)
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

const dedupeStrings = (items: string[]) =>
  Array.from(
    new Set(
      items
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )

const hashString = (value: string) =>
  Array.from(value).reduce((acc, char) => acc * 31 + char.charCodeAt(0), 7)

const getTagToneStyle = (value: string): CSSProperties => {
  const tone = TAG_TONES[Math.abs(hashString(value)) % TAG_TONES.length]

  return {
    "--tag-chip-bg": tone.bg,
    "--tag-chip-border": tone.border,
    "--tag-chip-text": tone.text,
    "--tag-chip-shadow": tone.shadow,
    "--tag-chip-divider": tone.divider,
    "--tag-chip-button-bg": tone.buttonBg,
    "--tag-chip-button-text": tone.buttonText,
  } as CSSProperties
}

const isComposingKeyboardEvent = (
  event: React.KeyboardEvent<HTMLElement>
) => {
  const nativeEvent = event.nativeEvent as KeyboardEvent & { isComposing?: boolean; keyCode?: number }
  return nativeEvent.isComposing === true || nativeEvent.keyCode === 229
}

const generateIdempotencyKey = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `post-write-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const normalizeMetaItems = (raw: string): string[] => {
  const normalized = raw.trim().replace(/^\[|\]$/g, "")
  if (!normalized) return []

  return dedupeStrings(
    normalized
      .split(",")
      .map((token) => token.trim().replace(/^['"]|['"]$/g, ""))
  )
}

const normalizeMetaScalar = (raw: string) => raw.trim().replace(/^['"]|['"]$/g, "")

const markdownImagePattern = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/
const markdownImageGlobalPattern = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
const mermaidFenceRegex = /```mermaid\b[\s\S]*?```/gi
const PREVIEW_SUMMARY_MAX_LENGTH = 150
const PREVIEW_SUMMARY_MAX_CONTENT_LENGTH = 50_000
const EDITOR_PREVIEW_HEAVY_LENGTH = 16_000
const EDITOR_PREVIEW_HEAVY_MERMAID_LENGTH = 8_000
const EDITOR_PREVIEW_HEAVY_MERMAID_BLOCKS = 2
const EDITOR_PREVIEW_DELAY_LIGHT_MS = 120
const EDITOR_PREVIEW_DELAY_MEDIUM_MS = 260
const EDITOR_PREVIEW_DELAY_IMAGE_MS = 420
const EDITOR_PREVIEW_DELAY_HEAVY_MS = 520
const EDITOR_PREVIEW_DELAY_HEAVY_IMAGE_MS = 760
const EDITOR_PREVIEW_DELAY_HEAVY_MERMAID_MS = 900
const PREVIEW_THUMBNAIL_ALLOWED_PATH_PREFIX = "/post/api/v1/images/posts/"
const PREVIEW_THUMBNAIL_DISALLOWED_CHAR_REGEX = /[\u0000-\u001F\u007F<>"'`\\]/
const PREVIEW_THUMBNAIL_ALLOWED_PATH_REGEX = /^\/post\/api\/v1\/images\/posts\/[A-Za-z0-9._~/%-]+$/
const PREVIEW_THUMBNAIL_ALLOWED_QUERY_REGEX = /^\?(?:[A-Za-z0-9._~/%=&-]*)$/

const extractFirstMarkdownImage = (content: string): string => {
  const match = markdownImagePattern.exec(content)
  return match?.[1]?.trim() || ""
}

const countMarkdownMermaidBlocks = (content: string): number =>
  (content.match(mermaidFenceRegex) || []).length

const countMarkdownImages = (content: string): number =>
  (content.match(markdownImageGlobalPattern) || []).length

const updateStandaloneImageWidthInMarkdown = (
  content: string,
  targetImageIndex: number,
  widthPx: number
) => {
  const lines = content.split("\n")
  let activeFenceMarker: "`" | "~" | null = null
  let imageIndex = 0

  const parseFenceMarker = (line: string): "`" | "~" | null => {
    const match = line.trim().match(/^([`~]{3,})(.*)$/)
    if (!match) return null
    const marker = match[1][0] as "`" | "~"
    if (!match[1].split("").every((char) => char === marker)) return null
    return marker
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const fenceMarker = parseFenceMarker(line)

    if (activeFenceMarker) {
      if (fenceMarker === activeFenceMarker) {
        activeFenceMarker = null
      }
      continue
    }

    if (fenceMarker) {
      activeFenceMarker = fenceMarker
      continue
    }

    const parsed = parseStandaloneMarkdownImageLine(line)
    if (!parsed) continue

    if (imageIndex === targetImageIndex) {
      lines[index] = serializeStandaloneMarkdownImageLine({
        ...parsed,
        widthPx,
      })
      return lines.join("\n")
    }

    imageIndex += 1
  }

  return content
}

const resolveEditorPreviewDelay = (
  contentLength: number,
  mermaidBlockCount: number,
  imageCount: number
): number => {
  if (
    contentLength >= EDITOR_PREVIEW_HEAVY_MERMAID_LENGTH &&
    mermaidBlockCount >= EDITOR_PREVIEW_HEAVY_MERMAID_BLOCKS
  ) {
    return EDITOR_PREVIEW_DELAY_HEAVY_MERMAID_MS
  }
  if (imageCount >= 3 || (imageCount > 0 && contentLength >= EDITOR_PREVIEW_HEAVY_LENGTH)) {
    return EDITOR_PREVIEW_DELAY_HEAVY_IMAGE_MS
  }
  if (contentLength >= EDITOR_PREVIEW_HEAVY_LENGTH) return EDITOR_PREVIEW_DELAY_HEAVY_MS
  if (imageCount > 0) return EDITOR_PREVIEW_DELAY_IMAGE_MS
  if (contentLength >= 5_000 || mermaidBlockCount > 0) return EDITOR_PREVIEW_DELAY_MEDIUM_MS
  return EDITOR_PREVIEW_DELAY_LIGHT_MS
}

const normalizeSafeImageUrl = (raw: string): string => {
  const value = raw.trim()
  if (!value) return ""

  if (value.startsWith("/")) {
    return value.startsWith("//") ? "" : value
  }

  if (value.startsWith("./") || value.startsWith("../")) {
    return value
  }

  try {
    const parsed = new URL(value)
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString()
    }
  } catch {
    return ""
  }

  return ""
}

const toSafePreviewThumbnailPath = (pathname: string, search: string): string => {
  if (!PREVIEW_THUMBNAIL_ALLOWED_PATH_REGEX.test(pathname)) return ""
  if (!search) return pathname
  if (!PREVIEW_THUMBNAIL_ALLOWED_QUERY_REGEX.test(search)) return ""
  return `${pathname}${search}`
}

const resolvePreviewThumbnailApiOrigin = (): string => {
  try {
    return new URL(getApiBaseUrl()).origin
  } catch {
    return ""
  }
}

const normalizeSafePreviewThumbnailUrl = (raw: string): string => {
  const value = raw.trim()
  if (!value) return ""
  if (PREVIEW_THUMBNAIL_DISALLOWED_CHAR_REGEX.test(value)) return ""

  if (value.startsWith("/")) {
    if (value.startsWith("//")) return ""
    try {
      const parsed = new URL(value, "https://preview.local")
      const safePath = toSafePreviewThumbnailPath(parsed.pathname, parsed.search)
      if (!safePath) return ""
      const apiOrigin = resolvePreviewThumbnailApiOrigin()
      if (typeof window !== "undefined" && apiOrigin && window.location.origin !== apiOrigin) {
        return `${apiOrigin}${safePath}`
      }
      return safePath
    } catch {
      return ""
    }
  }

  try {
    const parsed = new URL(value)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return ""
    if (parsed.username || parsed.password) return ""

    const allowedHosts = new Set<string>()
    const baseUrl = getApiBaseUrl()
    try {
      allowedHosts.add(new URL(baseUrl).host)
    } catch {
      return ""
    }
    if (typeof window !== "undefined" && window.location.host) {
      allowedHosts.add(window.location.host)
    }
    if (!allowedHosts.has(parsed.host)) return ""
    if (!parsed.pathname.startsWith(PREVIEW_THUMBNAIL_ALLOWED_PATH_PREFIX)) return ""
    const safePath = toSafePreviewThumbnailPath(parsed.pathname, parsed.search)
    if (!safePath) return ""
    const apiOrigin = resolvePreviewThumbnailApiOrigin()
    if (typeof window !== "undefined" && parsed.origin === window.location.origin) {
      return safePath
    }
    if (apiOrigin && parsed.origin === apiOrigin) {
      return `${apiOrigin}${safePath}`
    }
    return `${parsed.origin}${safePath}`
  } catch {
    return ""
  }
}

const clampRatio = (value: number): number => Math.min(1, Math.max(0, value))

const resolveThumbnailDrawRatios = (
  sourceSize: ThumbnailSourceSize,
  zoom: number
): { drawWidth: number; drawHeight: number } => {
  const safeZoom = clampThumbnailZoom(zoom)
  const sourceWidth = Math.max(1, sourceSize.width)
  const sourceHeight = Math.max(1, sourceSize.height)
  const sourceAspect = sourceWidth / sourceHeight

  const baseDrawWidth = sourceAspect >= THUMBNAIL_FRAME_ASPECT_RATIO ? sourceAspect / THUMBNAIL_FRAME_ASPECT_RATIO : 1
  const baseDrawHeight = sourceAspect >= THUMBNAIL_FRAME_ASPECT_RATIO ? 1 : THUMBNAIL_FRAME_ASPECT_RATIO / sourceAspect

  return {
    drawWidth: baseDrawWidth * safeZoom,
    drawHeight: baseDrawHeight * safeZoom,
  }
}

const clampThumbnailFocusBySource = ({
  focusX,
  focusY,
  zoom: _zoom,
  sourceSize: _sourceSize,
}: {
  focusX: number
  focusY: number
  zoom: number
  sourceSize: ThumbnailSourceSize
}): { focusX: number; focusY: number } => {
  return {
    focusX: clampThumbnailFocusX(focusX),
    focusY: clampThumbnailFocusY(focusY),
  }
}

const resolveThumbnailFramePositionFromFocus = ({
  focusX,
  focusY,
  drawWidth,
  drawHeight,
}: {
  focusX: number
  focusY: number
  drawWidth: number
  drawHeight: number
}) => {
  const normalizedFocusX = clampThumbnailFocusX(focusX) / 100
  const normalizedFocusY = clampThumbnailFocusY(focusY) / 100

  return {
    leftRatio: (1 - drawWidth) * normalizedFocusX,
    topRatio: (1 - drawHeight) * normalizedFocusY,
  }
}

const resolveThumbnailFocusFromFramePosition = ({
  leftRatio,
  topRatio,
  drawWidth,
  drawHeight,
}: {
  leftRatio: number
  topRatio: number
  drawWidth: number
  drawHeight: number
}) => {
  const focusXRatio =
    Math.abs(1 - drawWidth) < 0.000001 ? 0.5 : clampRatio(leftRatio / (1 - drawWidth))
  const focusYRatio =
    Math.abs(1 - drawHeight) < 0.000001 ? 0.5 : clampRatio(topRatio / (1 - drawHeight))

  return {
    focusX: clampThumbnailFocusX(focusXRatio * 100),
    focusY: clampThumbnailFocusY(focusYRatio * 100),
  }
}

const readThumbnailSourceSizeFromUrl = (url: string): Promise<ThumbnailSourceSize> =>
  new Promise((resolve, reject) => {
    const image = new window.Image()
    image.onload = () => {
      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height
      if (width <= 0 || height <= 0) {
        reject(new Error("썸네일 해상도를 확인할 수 없습니다."))
        return
      }
      resolve({ width, height })
    }
    image.onerror = () => reject(new Error("썸네일 이미지를 읽지 못했습니다."))
    image.src = url
  })

const makePreviewSummary = (content: string, maxLength = PREVIEW_SUMMARY_MAX_LENGTH) =>
  buildPreviewSummaryFromMarkdown(content, maxLength, "요약을 생성할 수 없습니다.")

const normalizeRecommendedTags = (value: unknown, maxTags: number) => {
  if (!Array.isArray(value)) return []
  const map = new Map<string, string>()
  value.forEach((item) => {
    if (typeof item !== "string") return
    const normalized = item.replace(/[\r\n]/g, " ").replace(/#/g, "").replace(/\s+/g, " ").trim()
    if (!normalized) return
    if (normalized.length < 2 || normalized.length > 24) return
    if (!/[\p{L}\p{N}]/u.test(normalized)) return
    if (normalized.toLowerCase() === "aside") return
    const key = normalized.toLowerCase()
    if (map.has(key) || map.size >= maxTags) return
    map.set(key, normalized)
  })
  return Array.from(map.values())
}

const resolveTagRecommendationErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.trim()
  if (!normalized) return "태그 추천 요청 처리 중 오류가 발생했습니다."

  const lowered = normalized.toLowerCase()
  if (lowered.includes("failed to fetch")) {
    return "네트워크 연결 또는 API 응답 수신에 실패했습니다."
  }

  if (lowered.includes("abort") || lowered.includes("timeout")) {
    return "태그 추천 응답 대기 시간이 초과되었습니다."
  }

  return normalized
}

const fetchRecommendedTags = async (
  payload: {
    title: string
    content: string
    existingTags: string[]
    maxTags: number
  }
): Promise<RsData<RecommendTagsPayload>> => {
  const controller = new AbortController()
  const timeoutMs = 12_000
  const timeoutId = setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), timeoutMs)

  try {
    const response = await fetch("/api/post/recommend-tags", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!response.ok) {
      const raw = await response.text().catch(() => "")
      if (raw) {
        let parsedMessage = ""
        try {
          const parsed = JSON.parse(raw) as { msg?: unknown; message?: unknown }
          const msg = typeof parsed.msg === "string" ? parsed.msg.trim() : ""
          const message = typeof parsed.message === "string" ? parsed.message.trim() : ""
          parsedMessage = msg || message
        } catch {}
        throw new Error(parsedMessage || `status=${response.status}`)
      }
      throw new Error(`status=${response.status}`)
    }

    return (await response.json()) as RsData<RecommendTagsPayload>
  } catch (error) {
    if (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new Error("태그 추천 응답 대기 시간이 초과되었습니다.")
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

const formatTagRecommendationReason = (rawReason?: string | null) => {
  const reason = (rawReason || "").trim()
  switch (reason) {
    case "ai-disabled":
      return "AI 태그 추천이 비활성화됨"
    case "api-key-missing":
      return "Gemini API 키 누락"
    case "rate-limited":
      return "요청 제한으로 규칙 추천 사용"
    case "quota-exhausted":
      return "AI API 사용 한도 초과"
    case "status-503":
    case "status-504":
      return "AI API 통신 실패"
    case "transport":
      return "AI API 전송 실패"
    case "parse-error":
      return "AI 태그 응답 파싱 실패"
    case "empty-tags":
      return "AI가 태그를 반환하지 않음"
    case "internal-error":
      return "서버 내부 처리 실패"
    case "proxy-transport":
      return "프록시 통신 실패(규칙 추천 대체)"
    default:
      if (reason.startsWith("proxy-upstream-")) {
        return `프록시 업스트림 오류(${reason.slice("proxy-upstream-".length)})`
      }
      if (reason.startsWith("status-")) return `AI API 상태코드 ${reason.slice("status-".length)}`
      return reason
  }
}

const FRONTMATTER_DELIMITER_REGEX = /^\s*---\s*$/
const LEADING_EDITOR_METADATA_LINE_REGEX =
  /^\s*(tags?|categories?|summary|thumbnail|thumb|cover|coverimage|cover_image)\s*:\s*(.+)\s*$/i

const splitFrontmatterBlock = (content: string) => {
  const normalized = content.replace(/\r\n?/g, "\n").trimStart()
  const lines = normalized.split("\n")
  if (!FRONTMATTER_DELIMITER_REGEX.test(lines[0] || "")) {
    return {
      metadataLines: [] as string[],
      body: normalized,
    }
  }

  for (let index = 1; index < lines.length; index += 1) {
    if (!FRONTMATTER_DELIMITER_REGEX.test(lines[index] || "")) continue
    return {
      metadataLines: lines.slice(1, index),
      body: lines
        .slice(index + 1)
        .join("\n")
        .replace(/^\n+/, ""),
    }
  }

  return {
    metadataLines: [] as string[],
    body: normalized,
  }
}

const stripLeadingEditorMetadataLines = (content: string) => {
  const normalized = content.replace(/\r\n?/g, "\n")
  const lines = normalized.split("\n")
  let consumed = 0

  for (const line of lines) {
    if (!line.trim()) {
      consumed += 1
      break
    }
    if (!LEADING_EDITOR_METADATA_LINE_REGEX.test(line)) break
    consumed += 1
  }

  return {
    consumed,
    body: consumed > 0 ? lines.slice(consumed).join("\n").trimStart() : normalized,
  }
}

const resolveEditorBodyFallback = (content: string, parsedBody: string) => {
  const normalized = content.replace(/\r\n?/g, "\n").trimStart()
  if (parsedBody.trim().length > 0 || normalized.trim().length === 0) return parsedBody

  const frontmatterSplit = splitFrontmatterBlock(normalized)
  const inlineMetadataSplit = stripLeadingEditorMetadataLines(frontmatterSplit.body)
  return inlineMetadataSplit.body.trim().length > 0 ? inlineMetadataSplit.body : parsedBody
}

const resolveEditorMetaSnapshot = (content: string, contentHtml?: string): ResolvedEditorMetaSnapshot => {
  const parsed = parseEditorMeta(content)
  const normalizedRawContent = content.replace(/\r\n?/g, "\n").trim()
  const markdownFromHtml = contentHtml?.trim() ? convertHtmlToMarkdown(contentHtml).trim() : ""
  const resolvedBody = parsed.body.trim() || markdownFromHtml || normalizedRawContent
  const parsedThumbnail = normalizeSafeImageUrl(parsed.thumbnail)
  const fallbackThumbnail = normalizeSafeImageUrl(extractFirstMarkdownImage(resolvedBody))
  const syncedThumbnail = stripThumbnailFocusFromUrl(parsedThumbnail || fallbackThumbnail)
  const syncedThumbnailFocusX = parseThumbnailFocusXFromUrl(
    parsedThumbnail || fallbackThumbnail,
    DEFAULT_THUMBNAIL_FOCUS_X
  )
  const syncedThumbnailFocusY = parseThumbnailFocusYFromUrl(
    parsedThumbnail || fallbackThumbnail,
    DEFAULT_THUMBNAIL_FOCUS_Y
  )
  const syncedThumbnailZoom = parseThumbnailZoomFromUrl(parsedThumbnail || fallbackThumbnail, DEFAULT_THUMBNAIL_ZOOM)

  return {
    body: resolvedBody,
    tags: parsed.tags,
    category: parsed.category,
    summary: parsed.summary || makePreviewSummary(resolvedBody),
    thumbnailUrl: syncedThumbnail,
    thumbnailFocusX: syncedThumbnailFocusX,
    thumbnailFocusY: syncedThumbnailFocusY,
    thumbnailZoom: syncedThumbnailZoom,
  }
}

const buildEditorStateFingerprint = ({
  title,
  content,
  summary,
  thumbnailUrl,
  thumbnailFocusX,
  thumbnailFocusY,
  thumbnailZoom,
  tags,
  category,
  visibility,
}: {
  title: string
  content: string
  summary: string
  thumbnailUrl: string
  thumbnailFocusX: number
  thumbnailFocusY: number
  thumbnailZoom: number
  tags: string[]
  category: string
  visibility: PostVisibility
}) =>
  JSON.stringify({
    title,
    content,
    summary,
    thumbnailUrl,
    thumbnailFocusX,
    thumbnailFocusY,
    thumbnailZoom,
    tags: dedupeStrings(tags),
    category: category ? normalizeCategoryValue(category) : "",
    visibility,
  })

const parseEditorMeta = (content: string): ParsedEditorMeta => {
  let trimmed = content.replace(/\r\n?/g, "\n").trimStart()
  const tags: string[] = []
  let category = ""
  let summary = ""
  let thumbnail = ""

  const pushTags = (items: string[]) => {
    dedupeStrings(items).forEach((item) => {
      if (!tags.includes(item)) tags.push(item)
    })
  }

  const setCategory = (items: string[]) => {
    const nextCategory = dedupeStrings(items).map(normalizeCategoryValue)[0] || ""
    if (nextCategory) category = nextCategory
  }

  const frontmatterSplit = splitFrontmatterBlock(trimmed)
  if (frontmatterSplit.metadataLines.length > 0) {
    frontmatterSplit.metadataLines.forEach((line) => {
      const [rawKey, ...rest] = line.split(":")
      if (!rawKey || rest.length === 0) return
      const key = rawKey.trim().toLowerCase()
      const value = rest.join(":").trim()
      if (!value) return

      if (key === "tags" || key === "tag") pushTags(normalizeMetaItems(value))
      if (key === "category" || key === "categories") setCategory(normalizeMetaItems(value))
      if (key === "summary") summary = normalizeMetaScalar(value)
      if (key === "thumbnail" || key === "thumb" || key === "cover" || key === "coverimage" || key === "cover_image") {
        thumbnail = normalizeMetaScalar(value)
      }
    })
    trimmed = frontmatterSplit.body.trimStart()
  }

  const leadingMetadataSplit = stripLeadingEditorMetadataLines(trimmed)
  if (leadingMetadataSplit.consumed > 0) {
    trimmed
      .split("\n")
      .slice(0, leadingMetadataSplit.consumed)
      .forEach((line) => {
        const match = line.match(LEADING_EDITOR_METADATA_LINE_REGEX)
        if (!match) return

        const key = match[1].toLowerCase()
        const value = match[2]
        if (key === "tag" || key === "tags") pushTags(normalizeMetaItems(value))
        if (key === "category" || key === "categories") setCategory(normalizeMetaItems(value))
        if (key === "summary") summary = normalizeMetaScalar(value)
        if (key === "thumbnail" || key === "thumb" || key === "cover" || key === "coverimage" || key === "cover_image") {
          thumbnail = normalizeMetaScalar(value)
        }
      })
    trimmed = leadingMetadataSplit.body
  }

  return {
    body: resolveEditorBodyFallback(content, trimmed),
    tags,
    category,
    summary,
    thumbnail,
  }
}

const shouldHydrateEditorBodyFallback = (content: string, contentHtml?: string) => {
  const parsed = parseEditorMeta(content)
  if (parsed.body.trim().length > 0) return false
  if (contentHtml?.trim()) return false
  return true
}

const serializeMetaItems = (items: string[]) => items.map((item) => JSON.stringify(item)).join(", ")

const composeEditorContent = (
  body: string,
  tags: string[],
  options?: { category?: string; summary?: string; thumbnail?: string }
) => {
  const normalizedBody = body.trim()
  const normalizedTags = dedupeStrings(tags)
  const normalizedCategory = options?.category ? normalizeCategoryValue(options.category) : ""
  const normalizedSummary = options?.summary?.trim() || ""
  const normalizedThumbnail = options?.thumbnail?.trim() || ""
  const metadataLines: string[] = []

  if (normalizedTags.length > 0) metadataLines.push(`tags: [${serializeMetaItems(normalizedTags)}]`)
  if (normalizedCategory) metadataLines.push(`category: [${serializeMetaItems([normalizedCategory])}]`)
  if (normalizedThumbnail) metadataLines.push(`thumbnail: ${JSON.stringify(normalizedThumbnail)}`)
  if (normalizedSummary) metadataLines.push(`summary: ${JSON.stringify(normalizedSummary)}`)

  if (metadataLines.length === 0) return normalizedBody
  if (!normalizedBody) return `---\n${metadataLines.join("\n")}\n---`

  return `---\n${metadataLines.join("\n")}\n---\n\n${normalizedBody}`
}

const readStoredCatalog = (storageKey: string) => {
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

const persistCatalog = (storageKey: string, values: string[]) => {
  if (typeof window === "undefined") return
  window.localStorage.setItem(storageKey, JSON.stringify(dedupeStrings(values)))
}

const readLocalDraft = (): LocalDraftPayload | null => {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(LOCAL_DRAFT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LocalDraftPayload>
    if (!parsed || typeof parsed !== "object") return null

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
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      thumbnailUrl: stripThumbnailFocusFromUrl(rawThumbnailUrl),
      thumbnailFocusX: parsedFocusX,
      thumbnailFocusY: parsedFocusY,
      thumbnailZoom: parsedZoom,
      tags: Array.isArray(parsed.tags)
        ? dedupeStrings(parsed.tags.filter((item): item is string => typeof item === "string"))
        : [],
      category: typeof parsed.category === "string" ? normalizeCategoryValue(parsed.category) : "",
      visibility: isValidVisibility ? visibility : "PUBLIC_LISTED",
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
    }
  } catch {
    return null
  }
}

const persistLocalDraft = (payload: LocalDraftPayload) => {
  if (typeof window === "undefined") return
  window.localStorage.setItem(LOCAL_DRAFT_STORAGE_KEY, JSON.stringify(payload))
}

const removeLocalDraft = () => {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(LOCAL_DRAFT_STORAGE_KEY)
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

const requestTempPostWithConflictRetry = async (
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

const uploadWithConflictRetry = async (
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

const escapePipes = (value: string) => value.replace(/[\\|]/g, "\\$&")

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

  const columnWidths = Array.from(el.querySelectorAll("colgroup > col")).map((col) => {
    const colElement = col as HTMLTableColElement
    const width =
      Number.parseInt(colElement.getAttribute("width") || "", 10) ||
      Number.parseInt(colElement.style.width.replace(/px$/, ""), 10)
    return Number.isFinite(width) && width > 0 ? width : null
  })
  const rowHeights = rows.map((row) => {
    const explicitHeight =
      Number.parseInt((row as HTMLElement).dataset.rowHeight || "", 10) ||
      Number.parseInt(row.style.height.replace(/px$/, ""), 10)
    return Number.isFinite(explicitHeight) && explicitHeight > 0 ? explicitHeight : null
  })
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
  const metadataComment = serializeMarkdownTableLayoutComment({
    columnWidths,
    rowHeights,
  })

  const markdownTable = [
    `| ${head.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n")

  return metadataComment ? `${metadataComment}\n${markdownTable}` : markdownTable
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
  const title = summary?.textContent?.trim() || EDITOR_TOGGLE_TITLE_PLACEHOLDER

  const contentNodes = Array.from(el.childNodes).filter((node) => node !== summary)
  const body = contentNodes
    .map((node) => (node.nodeType === Node.ELEMENT_NODE ? blockToMarkdown(node as HTMLElement) : inlineToMarkdown(node)))
    .join("\n")
    .trim() || EDITOR_BODY_PLACEHOLDER

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
  const hasToggleClass = /(^|\s)[a-z0-9_-]*toggle[a-z0-9_-]*(\s|$)/i.test(classNames)
  if (hasToggleClass) {
    const title =
      el.querySelector("summary, [class*='toggle-summary'], [class*='summary']")?.textContent?.trim() ||
      EDITOR_TOGGLE_TITLE_PLACEHOLDER
    const body =
      el.querySelector("[class*='toggle-content'], [class*='content']")?.textContent?.trim() ||
      EDITOR_BODY_PLACEHOLDER
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

const detectPublishPlaceholderIssue = (content: string): string | null => {
  let inFence = false

  for (const rawLine of content.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = rawLine.trim()
    if (!trimmed) continue

    if (/^```/.test(trimmed)) {
      inFence = !inFence
      continue
    }

    if (inFence || trimmed.startsWith(">")) continue

    if (trimmed === EDITOR_BODY_PLACEHOLDER) {
      return "본문에 기본 placeholder 문구가 남아 있습니다. 실제 내용으로 교체한 뒤 다시 시도해주세요."
    }

    if (trimmed === `:::toggle ${EDITOR_TOGGLE_TITLE_PLACEHOLDER}`) {
      return "토글 제목이 기본값으로 남아 있습니다. 실제 제목으로 바꾼 뒤 다시 시도해주세요."
    }
  }

  return null
}

const sanitizeNumberInput = (value: string) => value.replace(/[^\d]/g, "")

const getTodayDateKey = () => new Date().toISOString().slice(0, 10)

const buildListCacheKey = (params: {
  scope: PostListScope
  page: string
  pageSize: string
  kw: string
  sort: string
}) =>
  JSON.stringify({
    scope: params.scope,
    page: params.page.trim(),
    pageSize: params.pageSize.trim(),
    kw: params.kw.trim(),
    sort: params.sort.trim(),
  })

const normalizePreviewSyncText = (value: string) =>
  value
    .replace(/^(?:[#>*-]|\d+\.)+\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()

const resolveEditorSyncSnippet = (content: string, selectionStart: number, topVisibleLineIndex?: number) => {
  const lines = content.split(/\r?\n/)
  if (lines.length === 0) return ""

  let lineIndex: number
  if (typeof topVisibleLineIndex === "number" && Number.isFinite(topVisibleLineIndex)) {
    lineIndex = Math.max(0, Math.min(lines.length - 1, topVisibleLineIndex))
  } else {
    const safeSelectionStart = Math.max(0, Math.min(content.length, selectionStart))
    lineIndex = content.slice(0, safeSelectionStart).split(/\r?\n/).length - 1
  }

  const candidateIndexes = [lineIndex, lineIndex + 1, lineIndex - 1]
  for (const candidateIndex of candidateIndexes) {
    if (candidateIndex < 0 || candidateIndex >= lines.length) continue
    const normalized = normalizePreviewSyncText(lines[candidateIndex] || "")
    if (normalized.length >= 3) return normalized
  }

  return ""
}

export const EditorStudioPage: NextPage<AdminPageProps> = ({ initialMember }) => {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { me, authStatus, setMe } = useAuthSession()
  const sessionMember = authStatus === "loading" || authStatus === "unavailable" ? initialMember : me
  const [result, setResult] = useState<string>("")
  const [loadingKey, setLoadingKey] = useState<string>("")
  const [postId, setPostId] = useState("")
  const [postVersion, setPostVersion] = useState<number | null>(null)
  const [editorMode, setEditorMode] = useState<EditorMode>("create")
  const [isTempDraftMode, setIsTempDraftMode] = useState(false)
  const [commentId, setCommentId] = useState("1")
  const [commentContent, setCommentContent] = useState("")
  const [postTitle, setPostTitle] = useState("")
  const [postContent, setPostContent] = useState("")
  const [postSummary, setPostSummary] = useState("")
  const [postThumbnailUrl, setPostThumbnailUrl] = useState("")
  const [postThumbnailFocusX, setPostThumbnailFocusX] = useState(DEFAULT_THUMBNAIL_FOCUS_X)
  const [postThumbnailFocusY, setPostThumbnailFocusY] = useState(DEFAULT_THUMBNAIL_FOCUS_Y)
  const [postThumbnailZoom, setPostThumbnailZoom] = useState(DEFAULT_THUMBNAIL_ZOOM)
  const [postTags, setPostTags] = useState<string[]>([])
  const [postCategory, setPostCategory] = useState("")
  const [tagDraft, setTagDraft] = useState("")
  const [customTagCatalog, setCustomTagCatalog] = useState<string[]>([])
  const [customCategoryCatalog, setCustomCategoryCatalog] = useState<string[]>([])
  const [knownTags, setKnownTags] = useState<string[]>([])
  const [tagUsageMap, setTagUsageMap] = useState<MetaUsageMap>({})
  const [, setMetaCatalogLoading] = useState(false)
  const [postVisibility, setPostVisibility] = useState<PostVisibility>("PUBLIC_LISTED")
  const [publishNotice, setPublishNotice] = useState<NoticeState>({
    tone: "idle",
    text: "작성 후 ‘글 작성’을 누르면 결과가 여기에 표시됩니다.",
  })
  const [publishModalNotice, setPublishModalNotice] = useState<NoticeState>({
    tone: "idle",
    text: "발행 전 설정을 점검한 뒤 실행하면 결과가 여기에 표시됩니다.",
  })
  const [tagRecommendationNotice, setTagRecommendationNotice] = useState<NoticeState>({
    tone: "idle",
    text: TAG_RECOMMENDATION_IDLE_TEXT,
  })
  const [globalNotice, setGlobalNotice] = useState<NoticeState>({
    tone: "idle",
    text: GLOBAL_NOTICE_IDLE_TEXT,
  })
  const [profileImageNotice, setProfileImageNotice] = useState<NoticeState>({
    tone: "idle",
    text: `프로필 이미지를 선택하면 자동 최적화 후 즉시 업로드됩니다. (${PROFILE_IMAGE_UPLOAD_RULE_LABEL})`,
  })
  const [profileNotice, setProfileNotice] = useState<NoticeState>({
    tone: "idle",
    text: "현재 저장된 관리자 프로필 값이 입력창에 자동으로 채워집니다.",
  })
  const [metaNotice, setMetaNotice] = useState<NoticeState>({
    tone: "idle",
    text: "기존 글의 태그를 선택하거나 새 값을 추가할 수 있습니다. 사용 중인 태그는 삭제할 수 없습니다.",
  })
  const [activeMetaPanel, setActiveMetaPanel] = useState<"tag" | "category" | null>(null)
  const [isComposeAssistOpen, setIsComposeAssistOpen] = useState(false)
  const [isComposeUtilityOpen, setIsComposeUtilityOpen] = useState(false)
  const [isComposePreviewOpen, setIsComposePreviewOpen] = useState(false)
  const [isCalloutMenuOpen, setIsCalloutMenuOpen] = useState(false)
  const [isColorMenuOpen, setIsColorMenuOpen] = useState(false)
  const postContentRef = useRef<HTMLTextAreaElement>(null)
  const postContentLiveRef = useRef(postContent)
  const blockEditorLoadGuardStateRef = useRef<BlockEditorLoadGuardState>({
    expectedBody: "",
    ignoreUntilMs: 0,
    ignoredInitialEmpty: false,
  })
  const [previewContent, setPreviewContent] = useState(postContent)
  const [isPreviewSyncPending, setIsPreviewSyncPending] = useState(false)
  const postImageFileInputRef = useRef<HTMLInputElement>(null)
  const thumbnailImageFileInputRef = useRef<HTMLInputElement>(null)
  const [thumbnailImageFileName, setThumbnailImageFileName] = useState("")
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false)
  const [publishActionType, setPublishActionType] = useState<PublishActionType>("create")
  const [isPreviewThumbnailError, setIsPreviewThumbnailError] = useState(false)
  const [previewThumbnailSourceUrl, setPreviewThumbnailSourceUrl] = useState("")
  const [previewThumbSourceSize, setPreviewThumbSourceSize] = useState<ThumbnailSourceSize>(DEFAULT_THUMBNAIL_SOURCE_SIZE)
  const [previewViewport, setPreviewViewport] = useState<PreviewViewportMode>("desktop")
  const [localDraftSavedAt, setLocalDraftSavedAt] = useState("")
  const [mobileManageStep, setMobileManageStep] = useState<ManageMobileStudioStep>("query")
  const [mobileComposeStep, setMobileComposeStep] = useState<ComposeMobileStudioStep>("edit")
  const [studioSurface, setStudioSurface] = useState<StudioSurface>("compose")
  const [isCompactMobileLayout, setIsCompactMobileLayout] = useState(false)
  const [isWideEditorViewport, setIsWideEditorViewport] = useState(false)
  const [composeViewMode, setComposeViewMode] = useState<ComposeViewMode>("editor")
  const [editorStudioViewMode, setEditorStudioViewMode] = useState<ComposeViewMode>("editor")
  const [isMobileThumbnailEditorOpen, setIsMobileThumbnailEditorOpen] = useState(false)
  const [isMobileMetaEditorOpen, setIsMobileMetaEditorOpen] = useState(false)
  const previewScrollRef = useRef<HTMLDivElement>(null)
  const previewScrollSyncRafRef = useRef<number | null>(null)
  const editorScrollRatioRef = useRef(0)
  const titleFieldRef = useRef<HTMLTextAreaElement | null>(null)

  const postContentMermaidBlockCount = useMemo(
    () => countMarkdownMermaidBlocks(postContent),
    [postContent]
  )
  const postContentImageCount = useMemo(
    () => countMarkdownImages(postContent),
    [postContent]
  )
  const previewContentLength = previewContent.length
  const previewMermaidBlockCount = useMemo(
    () => countMarkdownMermaidBlocks(previewContent),
    [previewContent]
  )

  useEffect(() => {
    postContentLiveRef.current = postContent
  }, [postContent])

  const handleBlockEditorChange = useCallback((nextMarkdown: string, meta?: BlockEditorChangeMeta) => {
    let nextGuardState = consumeGuardOnExpectedUpdate(blockEditorLoadGuardStateRef.current, nextMarkdown)

    if (meta?.editorFocused) {
      nextGuardState = {
        ...nextGuardState,
        ignoreUntilMs: 0,
        ignoredInitialEmpty: true,
      }
      blockEditorLoadGuardStateRef.current = nextGuardState
      setPostContent(nextMarkdown)
      return
    }

    if (shouldIgnoreBlockEditorEmptyUpdate({
      nextMarkdown,
      currentMarkdown: postContentLiveRef.current,
      guardState: nextGuardState,
    })) {
      blockEditorLoadGuardStateRef.current = markGuardEmptyUpdateIgnored(nextGuardState)
      return
    }

    blockEditorLoadGuardStateRef.current = nextGuardState
    setPostContent(nextMarkdown)
  }, [])

  const isPreviewHeavyDocument = useMemo(() => {
    if (previewContentLength >= EDITOR_PREVIEW_HEAVY_LENGTH) return true
    if (
      previewContentLength >= EDITOR_PREVIEW_HEAVY_MERMAID_LENGTH &&
      previewMermaidBlockCount >= EDITOR_PREVIEW_HEAVY_MERMAID_BLOCKS
    ) {
      return true
    }
    return false
  }, [previewContentLength, previewMermaidBlockCount])

  const [listPage, setListPage] = useState("1")
  const [listPageSize, setListPageSize] = useState("30")
  const [listKw, setListKw] = useState("")
  const [listSort, setListSort] = useState("CREATED_AT")
  const [listScope, setListScope] = useState<PostListScope>("active")
  const [listQuickPreset, setListQuickPreset] = useState<ListQuickPreset>("none")
  const [isListAdvancedOpen, setIsListAdvancedOpen] = useState(false)
  const [isDirectLoadOpen, setIsDirectLoadOpen] = useState(false)
  const [isSelectedToolsOpen, setIsSelectedToolsOpen] = useState(false)

  const [profileImgInputUrl, setProfileImgInputUrl] = useState(() =>
    (initialMember.profileImageDirectUrl || initialMember.profileImageUrl || "").trim()
  )
  const [profileRoleInput, setProfileRoleInput] = useState(initialMember.profileRole || "")
  const [profileBioInput, setProfileBioInput] = useState(initialMember.profileBio || "")
  const [profileImageFileName, setProfileImageFileName] = useState("")
  const profileImageFileInputRef = useRef<HTMLInputElement>(null)
  const [adminPostRows, setAdminPostRows] = useState<AdminPostListItem[]>([])
  const [adminPostTotal, setAdminPostTotal] = useState<number>(0)
  const [modifiedSortOrder, setModifiedSortOrder] = useState<"desc" | "asc">("desc")
  const [selectedPostIds, setSelectedPostIds] = useState<number[]>([])
  const [softDeleteUndoState, setSoftDeleteUndoState] = useState<SoftDeleteUndoState | null>(null)
  const [deleteConfirmState, setDeleteConfirmState] = useState<DeleteConfirmState | null>(null)
  const [deleteConfirmNotice, setDeleteConfirmNotice] = useState<NoticeState>({
    tone: "idle",
    text: "",
  })
  const [deletedListNotice, setDeletedListNotice] = useState<NoticeState>({
    tone: "idle",
    text: "",
  })
  const redirectingRef = useRef(false)
  const hydratedAdminIdRef = useRef<number | null>(null)
  const autoLoadedPostIdRef = useRef<string | null>(null)
  const autoCreatedTempDraftRef = useRef(false)
  const tempPostRequestRef = useRef<Promise<RsData<PostForEditor>> | null>(null)
  const lastWriteFingerprintRef = useRef<string>("")
  const lastWriteIdempotencyKeyRef = useRef<string>("")
  const lastLocalDraftFingerprintRef = useRef("")
  const serverBaselineEditorFingerprintRef = useRef("")
  const listCacheRef = useRef(
    new Map<string, { rows: AdminPostListItem[]; total: number; storedAt: number }>()
  )
  const previewThumbFrameRef = useRef<HTMLDivElement>(null)
  const previewThumbSourceSeqRef = useRef(0)
  const applyProfileState = useCallback((member: MemberMe) => {
    setProfileRoleInput(member.profileRole || "")
    setProfileBioInput(member.profileBio || "")
    setProfileImgInputUrl((member.profileImageDirectUrl || member.profileImageUrl || "").trim())
  }, [])

  const syncProfileState = useCallback((member: MemberMe) => {
    setMe(member)
    setAdminProfileCache(queryClient, toAdminProfile(member))
    applyProfileState(member)
  }, [applyProfileState, queryClient, setMe])

  const refreshPublicPostReadViews = useCallback(async (affectedPostId?: string | number) => {
    const resolvedPostId =
      typeof affectedPostId === "number"
        ? affectedPostId
        : typeof affectedPostId === "string"
          ? affectedPostId.trim()
          : postId.trim()

    await invalidatePublicPostReadCaches(queryClient, resolvedPostId || undefined)
  }, [postId, queryClient])

  const refreshAdminProfile = useCallback(async (memberId: number, fallback?: MemberMe) => {
    try {
      const detailed = await apiFetch<MemberMe>(`/member/api/v1/adm/members/${memberId}`)
      syncProfileState(detailed)
      return detailed
    } catch {
      if (fallback) syncProfileState(fallback)
      return fallback ?? null
    }
  }, [syncProfileState])

  const run = async (key: string, fn: () => Promise<JsonValue>) => {
    try {
      setLoadingKey(key)
      setGlobalNotice({ tone: "loading", text: `작업 실행 중: ${key}` })
      const data = await fn()
      setResult(pretty(data))
      setGlobalNotice({ tone: "success", text: `작업 완료: ${key}` })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setResult(pretty({ error: message }))
      setGlobalNotice({ tone: "error", text: `작업 실패: ${message}` })
    } finally {
      setLoadingKey("")
    }
  }

  const disabled = (key: string) => loadingKey.length > 0 && loadingKey !== key

  useEffect(() => {
    if (typeof window === "undefined") return

    const media = window.matchMedia("(max-width: 720px)")
    const sync = () => {
      setIsCompactMobileLayout(media.matches)
    }

    sync()

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", sync)
      return () => media.removeEventListener("change", sync)
    }

    media.addListener(sync)
    return () => media.removeListener(sync)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    const media = window.matchMedia("(min-width: 1024px)")
    const sync = () => {
      setIsWideEditorViewport(media.matches)
    }

    sync()

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", sync)
      return () => media.removeEventListener("change", sync)
    }

    media.addListener(sync)
    return () => media.removeListener(sync)
  }, [])

  useEffect(() => {
    setComposeViewMode((prev) => {
      if (isCompactMobileLayout) {
        return prev === "preview" ? "preview" : "editor"
      }
      return prev === "editor" ? "split" : prev
    })
  }, [isCompactMobileLayout])

  useEffect(() => {
    if (isWideEditorViewport) return
    setEditorStudioViewMode((prev) => (prev === "split" ? "editor" : prev))
  }, [isWideEditorViewport])

  const syncPreviewScrollFromEditor = useCallback(() => {
    const preview = previewScrollRef.current
    if (!preview) return

    const editor = postContentRef.current
    let nextScrollRatio = editorScrollRatioRef.current

    if (editor) {
      const editorScrollableHeight = editor.scrollHeight - editor.clientHeight
      if (editorScrollableHeight <= 0) {
        nextScrollRatio = 0
      } else {
        nextScrollRatio = editor.scrollTop / editorScrollableHeight
      }
      editorScrollRatioRef.current = nextScrollRatio
    }

    const previewScrollableHeight = preview.scrollHeight - preview.clientHeight

    if (previewScrollableHeight <= 0) {
      preview.scrollTop = 0
      return
    }

    if (editor) {
      const computedStyle = window.getComputedStyle(editor)
      const lineHeight =
        Number.parseFloat(computedStyle.lineHeight) ||
        Number.parseFloat(computedStyle.fontSize) * 1.6 ||
        24
      const paddingTop = Number.parseFloat(computedStyle.paddingTop) || 0
      const topVisibleLineIndex = Math.max(0, Math.floor(Math.max(0, editor.scrollTop - paddingTop) / Math.max(lineHeight, 1)))
      const syncSnippet = resolveEditorSyncSnippet(postContent, editor.selectionStart, topVisibleLineIndex)

      if (syncSnippet) {
        const previewBlocks = Array.from(
          preview.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, p, li, blockquote, summary, pre, td, th")
        )
        const matchedBlock = previewBlocks.find((block) => normalizePreviewSyncText(block.textContent || "").includes(syncSnippet))

        if (matchedBlock) {
          const targetOffset = Math.max(0, matchedBlock.offsetTop - preview.clientHeight * 0.18)
          preview.scrollTop = Math.min(targetOffset, previewScrollableHeight)
          return
        }
      }
    }

    preview.scrollTop = nextScrollRatio * previewScrollableHeight
  }, [postContent])

  const schedulePreviewScrollSync = useCallback(() => {
    if (typeof window === "undefined") return
    if (previewScrollSyncRafRef.current !== null) {
      window.cancelAnimationFrame(previewScrollSyncRafRef.current)
    }
    previewScrollSyncRafRef.current = window.requestAnimationFrame(() => {
      previewScrollSyncRafRef.current = null
      syncPreviewScrollFromEditor()
    })
  }, [syncPreviewScrollFromEditor])

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && previewScrollSyncRafRef.current !== null) {
        window.cancelAnimationFrame(previewScrollSyncRafRef.current)
      }
    }
  }, [])

  useEffect(() => {
    setStudioSurface("compose")
  }, [])

  const activateManageSurface = useCallback(() => {
    setStudioSurface("manage")
    if (!router.isReady) return
    const nextQuery = { ...router.query, surface: "manage" }
    void replaceShallowRoutePreservingScroll(router, { query: nextQuery })
  }, [router])

  const activateComposeSurface = useCallback(() => {
    setStudioSurface("compose")
    if (!router.isReady) return
    const nextQuery = { ...router.query }
    delete nextQuery.surface
    void replaceShallowRoutePreservingScroll(router, { query: nextQuery })
  }, [router])

  useEffect(() => {
    if (BLOCK_EDITOR_V2_ENABLED) {
      if (previewContent !== postContent) {
        setPreviewContent(postContent)
      }
      setIsPreviewSyncPending(false)
      return
    }

    if (previewContent === postContent) {
      setIsPreviewSyncPending(false)
      return
    }

    setIsPreviewSyncPending(true)
    const delay = resolveEditorPreviewDelay(
      postContent.length,
      postContentMermaidBlockCount,
      postContentImageCount
    )
    const timer = window.setTimeout(() => {
      setPreviewContent(postContent)
      setIsPreviewSyncPending(false)
    }, delay)

    return () => window.clearTimeout(timer)
  }, [postContent, postContentImageCount, postContentMermaidBlockCount, previewContent])

  useEffect(() => {
    if (composeViewMode === "editor") return
    schedulePreviewScrollSync()
  }, [composeViewMode, previewContent, schedulePreviewScrollSync])

  const handleTitleFieldRef = useCallback((node: HTMLTextAreaElement | null) => {
    titleFieldRef.current = node
    syncTitleTextareaHeight(node)
  }, [])

  const handleTitleChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setPostTitle(event.target.value.replace(/\r\n?/g, "\n"))
    syncTitleTextareaHeight(event.target)
  }, [])

  const handleTitleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isComposingKeyboardEvent(event)) return
    if (event.key === "Enter") {
      event.preventDefault()
    }
  }, [])

  useEffect(() => {
    syncTitleTextareaHeight(titleFieldRef.current)
  }, [postTitle, editorStudioViewMode])

  const handlePreviewImageWidthCommit = useCallback(
    (payload: { src: string; alt: string; index: number; widthPx: number }) => {
      const currentContent = postContentLiveRef.current
      const nextContent = updateStandaloneImageWidthInMarkdown(currentContent, payload.index, payload.widthPx)
      if (nextContent === currentContent) return

      postContentLiveRef.current = nextContent
      setPostContent(nextContent)
      setPreviewContent(nextContent)
      setIsPreviewSyncPending(false)

      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          schedulePreviewScrollSync()
        })
      }
    },
    [schedulePreviewScrollSync]
  )

  const handleListPageChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setListPage(sanitizeNumberInput(e.target.value))
  }, [])

  const handleListPageSizeChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setListPageSize(sanitizeNumberInput(e.target.value))
  }, [])

  const handleListSortChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    setListSort(e.target.value)
  }, [])

  const applyListQuickPreset = useCallback((preset: ListQuickPreset) => {
    setListScope("active")
    setListPage("1")
    setListPageSize("30")
    if (preset === "today") {
      setListKw("")
      setListSort("CREATED_AT")
    } else if (preset === "temp") {
      setListKw("")
      setListSort("MODIFIED_AT")
    }
    setListQuickPreset(preset)
  }, [])

  const publishModalHintByAction = useCallback((actionType: PublishActionType): string => {
    if (actionType === "create") return "작성 전 확인이 필요한 항목만 이곳에 표시됩니다."
    if (actionType === "modify") return "수정 전 확인이 필요한 항목만 이곳에 표시됩니다."
    return "새 글 작성 전 확인이 필요한 항목만 이곳에 표시됩니다."
  }, [])

  const setPublishStatus = useCallback(
    (next: NoticeState, target: "auto" | "page" | "modal" = "auto") => {
      setGlobalNotice(next)
      if (target === "page") {
        setPublishNotice(next)
        return
      }

      if (target === "modal") {
        setPublishModalNotice(next)
        return
      }

      if (isPublishModalOpen) {
        setPublishModalNotice(next)
        return
      }

      setPublishNotice(next)
    },
    [isPublishModalOpen]
  )

  const saveLocalDraft = useCallback((options?: { silent?: boolean }) => {
    const payload: LocalDraftPayload = {
      title: postTitle,
      content: postContent,
      summary: postSummary,
      thumbnailUrl: postThumbnailUrl,
      thumbnailFocusX: postThumbnailFocusX,
      thumbnailFocusY: postThumbnailFocusY,
      thumbnailZoom: postThumbnailZoom,
      tags: dedupeStrings(postTags),
      category: postCategory ? normalizeCategoryValue(postCategory) : "",
      visibility: postVisibility,
      savedAt: new Date().toISOString(),
    }

    persistLocalDraft(payload)
    lastLocalDraftFingerprintRef.current = JSON.stringify(payload)
    setLocalDraftSavedAt(payload.savedAt)

    if (!options?.silent) {
      setPublishStatus(
        {
          tone: "success",
          text: `브라우저 임시저장 완료 (${payload.savedAt.slice(11, 16)})`,
        },
        "page"
      )
    }
  }, [
    postCategory,
    postContent,
    postSummary,
    postTags,
    postThumbnailFocusX,
    postThumbnailFocusY,
    postThumbnailZoom,
    postThumbnailUrl,
    postTitle,
    postVisibility,
    setPublishStatus,
  ])

  const restoreLocalDraft = useCallback(() => {
    const draft = readLocalDraft()
    if (!draft) {
      setPublishStatus(
        {
          tone: "error",
          text: "저장된 브라우저 임시글이 없습니다.",
        },
        "page"
      )
      return
    }

    setEditorMode("create")
    setIsTempDraftMode(false)
    setPostId("")
    setPostVersion(null)
    lastWriteFingerprintRef.current = ""
    lastWriteIdempotencyKeyRef.current = ""

    setPostTitle(draft.title)
    setPostContent(draft.content)
    setPostSummary(draft.summary)
    setPostThumbnailUrl(draft.thumbnailUrl)
    setPostThumbnailFocusX(draft.thumbnailFocusX)
    setPostThumbnailFocusY(draft.thumbnailFocusY)
    setPostThumbnailZoom(draft.thumbnailZoom)
    setPreviewThumbnailSourceUrl("")
    setPostTags(draft.tags)
    setPostCategory(draft.category)
    setPostVisibility(draft.visibility)

    setKnownTags((prev) => dedupeStrings([...prev, ...draft.tags]).sort((a, b) => a.localeCompare(b)))
    setLocalDraftSavedAt(draft.savedAt || "")
    setPublishStatus(
      {
        tone: "success",
        text: `브라우저 임시글을 불러왔습니다${draft.savedAt ? ` (${draft.savedAt.slice(11, 16)})` : ""}.`,
      },
      "page"
    )
  }, [setPublishStatus])

  const clearLocalDraft = useCallback(() => {
    removeLocalDraft()
    setLocalDraftSavedAt("")
    setPublishStatus(
      {
        tone: "success",
        text: "브라우저 임시저장을 삭제했습니다.",
      },
      "page"
    )
  }, [setPublishStatus])

  const syncEditorMeta = useCallback((content: string, contentHtml?: string) => {
    const snapshot = resolveEditorMetaSnapshot(content, contentHtml)
    blockEditorLoadGuardStateRef.current = createBlockEditorLoadGuardState(snapshot.body)
    setPostContent(snapshot.body)
    setPostSummary(snapshot.summary)
    setPostThumbnailUrl(snapshot.thumbnailUrl)
    setPostThumbnailFocusX(snapshot.thumbnailFocusX)
    setPostThumbnailFocusY(snapshot.thumbnailFocusY)
    setPostThumbnailZoom(snapshot.thumbnailZoom)
    setPreviewThumbnailSourceUrl(snapshot.thumbnailUrl)
    setPostTags(snapshot.tags)
    setPostCategory(snapshot.category)
    setKnownTags((prev) => dedupeStrings([...prev, ...snapshot.tags]).sort((a, b) => a.localeCompare(b)))
    return snapshot
  }, [])

  const resolvedPreviewSummary = useMemo(() => {
    const manual = postSummary.trim()
    if (manual) return manual
    return makePreviewSummary(postContent)
  }, [postContent, postSummary])

  const resolvedPreviewThumbnail = useMemo(() => {
    const manual = stripThumbnailFocusFromUrl(normalizeSafeImageUrl(postThumbnailUrl))
    if (manual) return manual
    return stripThumbnailFocusFromUrl(normalizeSafeImageUrl(extractFirstMarkdownImage(postContent)))
  }, [postContent, postThumbnailUrl])
  const effectiveThumbnailUrl = useMemo(() => {
    const normalizedThumbnail = resolvedPreviewThumbnail.trim()
    if (!normalizedThumbnail) return ""
    return applyThumbnailTransformToUrl(normalizedThumbnail, {
      focusX: postThumbnailFocusX,
      focusY: postThumbnailFocusY,
      zoom: postThumbnailZoom,
    })
  }, [postThumbnailFocusX, postThumbnailFocusY, postThumbnailZoom, resolvedPreviewThumbnail])
  const safePreviewThumbnail = useMemo(() => {
    const preferredSource = previewThumbnailSourceUrl || resolvedPreviewThumbnail
    return normalizeSafePreviewThumbnailUrl(preferredSource)
  }, [previewThumbnailSourceUrl, resolvedPreviewThumbnail])

  const applyPreviewThumbStyle = useCallback((transform: ThumbnailTransformState) => {
    const frame = previewThumbFrameRef.current
    if (!frame) return

    const { drawWidth, drawHeight } = resolveThumbnailDrawRatios(previewThumbSourceSize, transform.zoom)
    const { leftRatio, topRatio } = resolveThumbnailFramePositionFromFocus({
      focusX: transform.focusX,
      focusY: transform.focusY,
      drawWidth,
      drawHeight,
    })

    frame.style.setProperty("--preview-thumb-width", `${drawWidth * 100}%`)
    frame.style.setProperty("--preview-thumb-height", `${drawHeight * 100}%`)
    frame.style.setProperty("--preview-thumb-left", `${leftRatio * 100}%`)
    frame.style.setProperty("--preview-thumb-top", `${topRatio * 100}%`)
  }, [previewThumbSourceSize])

  const normalizePreviewThumbTransform = useCallback((next: ThumbnailTransformState) => {
    const zoom = clampThumbnailZoom(next.zoom)
    const clampedFocus = clampThumbnailFocusBySource({
      focusX: next.focusX,
      focusY: next.focusY,
      zoom,
      sourceSize: previewThumbSourceSize,
    })

    return {
      focusX: clampedFocus.focusX,
      focusY: clampedFocus.focusY,
      zoom,
    }
  }, [previewThumbSourceSize])

  const computeAnchoredThumbnailTransform = useCallback(
    (
      baseTransform: ThumbnailTransformState,
      nextZoom: number,
      anchorXRatio: number,
      anchorYRatio: number
    ): ThumbnailTransformState => {
      const { drawWidth: prevDrawWidth, drawHeight: prevDrawHeight } = resolveThumbnailDrawRatios(
        previewThumbSourceSize,
        baseTransform.zoom
      )
      const { drawWidth: nextDrawWidth, drawHeight: nextDrawHeight } = resolveThumbnailDrawRatios(
        previewThumbSourceSize,
        nextZoom
      )
      const { leftRatio: prevLeft, topRatio: prevTop } = resolveThumbnailFramePositionFromFocus({
        focusX: baseTransform.focusX,
        focusY: baseTransform.focusY,
        drawWidth: prevDrawWidth,
        drawHeight: prevDrawHeight,
      })

      const pointerImageX = clampRatio((anchorXRatio - prevLeft) / prevDrawWidth)
      const pointerImageY = clampRatio((anchorYRatio - prevTop) / prevDrawHeight)

      const nextLeft = anchorXRatio - pointerImageX * nextDrawWidth
      const nextTop = anchorYRatio - pointerImageY * nextDrawHeight
      const nextFocus = resolveThumbnailFocusFromFramePosition({
        leftRatio: nextLeft,
        topRatio: nextTop,
        drawWidth: nextDrawWidth,
        drawHeight: nextDrawHeight,
      })

      return {
        focusX: nextFocus.focusX,
        focusY: nextFocus.focusY,
        zoom: nextZoom,
      }
    },
    [previewThumbSourceSize]
  )

  const computeDraggedThumbnailTransform = useCallback(
    (
      baseTransform: ThumbnailTransformState,
      deltaXRatio: number,
      deltaYRatio: number
    ): ThumbnailTransformState => {
      const { drawWidth, drawHeight } = resolveThumbnailDrawRatios(
        previewThumbSourceSize,
        baseTransform.zoom
      )
      const { leftRatio: startLeft, topRatio: startTop } = resolveThumbnailFramePositionFromFocus({
        focusX: baseTransform.focusX,
        focusY: baseTransform.focusY,
        drawWidth,
        drawHeight,
      })
      const nextFocus = resolveThumbnailFocusFromFramePosition({
        leftRatio: startLeft + deltaXRatio,
        topRatio: startTop + deltaYRatio,
        drawWidth,
        drawHeight,
      })

      return {
        focusX: nextFocus.focusX,
        focusY: nextFocus.focusY,
        zoom: baseTransform.zoom,
      }
    },
    [previewThumbSourceSize]
  )

  const applyCommittedPreviewThumbTransform = useCallback(
    (normalized: ThumbnailTransformState) => {
      applyPreviewThumbStyle(normalized)
      setPostThumbnailFocusX((prev) => (Math.abs(prev - normalized.focusX) > 0.0001 ? normalized.focusX : prev))
      setPostThumbnailFocusY((prev) => (Math.abs(prev - normalized.focusY) > 0.0001 ? normalized.focusY : prev))
      setPostThumbnailZoom((prev) => (Math.abs(prev - normalized.zoom) > 0.0001 ? normalized.zoom : prev))
    },
    [applyPreviewThumbStyle]
  )

  const {
    commitTransform: commitPreviewThumbTransform,
    finalizePointer: finalizePreviewThumbPointer,
    handlePointerDown: handlePreviewThumbPointerDown,
    handlePointerMove: handlePreviewThumbPointerMove,
    isDragging: isPreviewThumbDragging,
    resetInteractions: resetPreviewThumbInteractions,
    scheduleTransform: schedulePreviewThumbTransform,
    transformRef: previewThumbTransformRef,
  } = useViewportImageEditor<ThumbnailTransformState>({
    frameRef: previewThumbFrameRef,
    initialTransform: {
      focusX: postThumbnailFocusX,
      focusY: postThumbnailFocusY,
      zoom: postThumbnailZoom,
    },
    enabled: Boolean(safePreviewThumbnail && !isPreviewThumbnailError),
    clampZoom: clampThumbnailZoom,
    normalizeTransform: normalizePreviewThumbTransform,
    computeAnchoredZoomTransform: computeAnchoredThumbnailTransform,
    computeDraggedTransform: computeDraggedThumbnailTransform,
    onCommit: applyCommittedPreviewThumbTransform,
  })

  useEffect(() => {
    setIsPreviewThumbnailError(false)
  }, [safePreviewThumbnail])

  useEffect(() => {
    if (!safePreviewThumbnail || isPreviewThumbnailError) {
      previewThumbSourceSeqRef.current += 1
      setPreviewThumbSourceSize(DEFAULT_THUMBNAIL_SOURCE_SIZE)
      return
    }

    const nextSeq = previewThumbSourceSeqRef.current + 1
    previewThumbSourceSeqRef.current = nextSeq
    void readThumbnailSourceSizeFromUrl(safePreviewThumbnail)
      .then((sourceSize) => {
        if (previewThumbSourceSeqRef.current !== nextSeq) return
        setPreviewThumbSourceSize(sourceSize)
        commitPreviewThumbTransform(previewThumbTransformRef.current)
      })
      .catch(() => {
        if (previewThumbSourceSeqRef.current !== nextSeq) return
        setPreviewThumbSourceSize(DEFAULT_THUMBNAIL_SOURCE_SIZE)
        commitPreviewThumbTransform(previewThumbTransformRef.current)
      })
  }, [commitPreviewThumbTransform, isPreviewThumbnailError, previewThumbTransformRef, safePreviewThumbnail])

  useEffect(() => {
    if (!safePreviewThumbnail || isPreviewThumbnailError) return
    commitPreviewThumbTransform({
      focusX: postThumbnailFocusX,
      focusY: postThumbnailFocusY,
      zoom: postThumbnailZoom,
    })
  }, [
    commitPreviewThumbTransform,
    isPreviewThumbnailError,
    postThumbnailFocusX,
    postThumbnailFocusY,
    postThumbnailZoom,
    safePreviewThumbnail,
  ])

  useEffect(() => {
    if (!isPublishModalOpen) return
    if (!safePreviewThumbnail || isPreviewThumbnailError) return
    if (!previewThumbFrameRef.current) return

    applyPreviewThumbStyle(previewThumbTransformRef.current)
  }, [applyPreviewThumbStyle, isPreviewThumbnailError, isPublishModalOpen, previewThumbTransformRef, safePreviewThumbnail])

  useEffect(() => {
    if (safePreviewThumbnail && !isPreviewThumbnailError) return
    resetPreviewThumbInteractions()
  }, [isPreviewThumbnailError, resetPreviewThumbInteractions, safePreviewThumbnail])

  useEffect(() => {
    if (isPublishModalOpen) return
    resetPreviewThumbInteractions()
  }, [isPublishModalOpen, resetPreviewThumbInteractions])

  useEffect(() => {
    if (!safePreviewThumbnail || isPreviewThumbnailError) return
    schedulePreviewThumbTransform(previewThumbTransformRef.current)
  }, [isPreviewThumbnailError, previewThumbSourceSize, previewThumbTransformRef, safePreviewThumbnail, schedulePreviewThumbTransform])

  const refreshEditorMetaCatalog = useCallback(async () => {
    setMetaCatalogLoading(true)

    try {
      const nextTagUsageMap: MetaUsageMap = {}
      const tagRows = await apiFetch<TagUsageDto[]>("/post/api/v1/posts/tags").catch(() => [] as TagUsageDto[])

      tagRows.forEach((row) => {
        const key = typeof row.tag === "string" ? row.tag.trim() : ""
        if (!key) return
        nextTagUsageMap[key] = Number.isFinite(row.count) ? row.count : 0
      })

      setTagUsageMap(nextTagUsageMap)
      setKnownTags(
        dedupeStrings([...Object.keys(nextTagUsageMap), ...customTagCatalog]).sort((a, b) =>
          a.localeCompare(b)
        )
      )
    } finally {
      setMetaCatalogLoading(false)
    }
  }, [customTagCatalog])

  const addTagsToPost = (values: string[]) => {
    const normalizedTags = dedupeStrings(values.map((value) => value.trim()).filter(Boolean))
    if (normalizedTags.length === 0) return []

    setPostTags((prev) => dedupeStrings([...prev, ...normalizedTags]))
    setKnownTags((prev) => dedupeStrings([...prev, ...normalizedTags]).sort((a, b) => a.localeCompare(b)))
    setCustomTagCatalog((prev) => dedupeStrings([...prev, ...normalizedTags]).sort((a, b) => a.localeCompare(b)))
    setMetaNotice({
      tone: "success",
      text:
        normalizedTags.length === 1
          ? `태그 "${normalizedTags[0]}"를 추가했습니다. 현재 글에서 바로 사용할 수 있습니다.`
          : `태그 ${normalizedTags.length}개를 추가했습니다. 현재 글에서 바로 사용할 수 있습니다.`,
    })

    return normalizedTags
  }

  const addTagToPost = (value: string) => {
    const added = addTagsToPost([value])
    if (added.length > 0) setTagDraft("")
  }

  const removeTagFromPost = (value: string) => {
    setPostTags((prev) => prev.filter((tag) => tag !== value))
  }

  const deleteTagFromCatalog = (tag: string) => {
    const usageCount = tagUsageMap[tag] || 0

    if (usageCount > 0) {
      setMetaNotice({
        tone: "error",
        text: `사용 중인 태그 "${tag}"는 삭제할 수 없습니다. 현재 ${usageCount}개 글에서 사용 중입니다.`,
      })
      return
    }

    setCustomTagCatalog((prev) => prev.filter((item) => item !== tag))
    setKnownTags((prev) => prev.filter((item) => item !== tag))
    setPostTags((prev) => prev.filter((item) => item !== tag))
    setMetaNotice({
      tone: "success",
      text: `태그 "${tag}"를 카탈로그에서 삭제했습니다.`,
    })
  }

  const switchToCreateMode = useCallback((options?: { keepContent?: boolean }) => {
    const keepContent = options?.keepContent ?? true
    activateComposeSurface()
    setEditorMode("create")
    setIsTempDraftMode(false)
    setPostId("")
    setPostVersion(null)
    setPreviewThumbnailSourceUrl("")
    serverBaselineEditorFingerprintRef.current = ""
    lastWriteFingerprintRef.current = ""
    lastWriteIdempotencyKeyRef.current = ""
    if (!keepContent) {
      setPostTitle("")
      setPostContent("")
      setPostSummary("")
      setPostThumbnailUrl("")
      setPostThumbnailFocusX(DEFAULT_THUMBNAIL_FOCUS_X)
      setPostThumbnailFocusY(DEFAULT_THUMBNAIL_FOCUS_Y)
      setPostThumbnailZoom(DEFAULT_THUMBNAIL_ZOOM)
      setPostTags([])
      setPostCategory("")
    }
    setPublishStatus(
      {
        tone: "idle",
        text: "새 글 모드입니다. 글 작성 버튼은 새 글 생성에만 사용됩니다.",
      },
      "page"
    )
    if (isCompactMobileLayout) {
      setMobileComposeStep("edit")
    }
  }, [activateComposeSurface, isCompactMobileLayout, setPublishStatus])

  const applyLoadedPostContext = useCallback((post: PostForEditor) => {
    activateComposeSurface()
    setPostId(String(post.id))
    setPostVersion(typeof post.version === "number" ? post.version : null)
    setEditorMode("edit")
    setIsTempDraftMode(isServerTempDraftPost(post))
    lastWriteFingerprintRef.current = ""
    lastWriteIdempotencyKeyRef.current = ""
    if (isCompactMobileLayout) {
      setMobileComposeStep("edit")
    }
  }, [activateComposeSurface, isCompactMobileLayout])

  const loadPostForEditor = useCallback(async (targetPostId: string = postId) => {
    try {
      setLoadingKey("postOne")
      const post = await apiFetch<PostForEditor>(`/post/api/v1/adm/posts/${targetPostId}`)
      let resolvedPost = post

      if (shouldHydrateEditorBodyFallback(post.content ?? "", post.contentHtml)) {
        try {
          const publicPost = await apiFetch<PublicPostContentFallback>(`/post/api/v1/posts/${targetPostId}`)
          if (!shouldHydrateEditorBodyFallback(publicPost.content ?? "", publicPost.contentHtml)) {
            resolvedPost = {
              ...post,
              content: publicPost.content ?? post.content,
              contentHtml: publicPost.contentHtml ?? post.contentHtml,
            }
          }
        } catch {
          // 비공개/삭제 글 등 공개 읽기 폴백이 불가능한 경우 admin payload를 그대로 사용한다.
        }
      }

      const rawSnapshot = resolveEditorMetaSnapshot(resolvedPost.content ?? "", resolvedPost.contentHtml)
      const shouldMaskTempTitle = isServerTempDraftPost(resolvedPost)
      const shouldMaskTempPlaceholder = isBlankServerTempDraft(resolvedPost, rawSnapshot)
      const nextTitle = shouldMaskTempTitle ? "" : resolvedPost.title ?? ""
      const nextVisibility = toVisibility(!!resolvedPost.published, !!resolvedPost.listed)
      const snapshot = shouldMaskTempPlaceholder
        ? (syncEditorMeta("") ?? buildEmptyEditorMetaSnapshot())
        : syncEditorMeta(resolvedPost.content ?? "", resolvedPost.contentHtml)
      setPostTitle(nextTitle)
      setPostVisibility(nextVisibility)
      serverBaselineEditorFingerprintRef.current = buildEditorStateFingerprint({
        title: nextTitle,
        content: snapshot.body,
        summary: snapshot.summary,
        thumbnailUrl: snapshot.thumbnailUrl,
        thumbnailFocusX: snapshot.thumbnailFocusX,
        thumbnailFocusY: snapshot.thumbnailFocusY,
        thumbnailZoom: snapshot.thumbnailZoom,
        tags: snapshot.tags,
        category: snapshot.category,
        visibility: nextVisibility,
      })
      applyLoadedPostContext(resolvedPost)
      setResult(pretty(resolvedPost as unknown as JsonValue))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setResult(pretty({ error: message }))
    } finally {
      setLoadingKey("")
    }
  }, [applyLoadedPostContext, postId, syncEditorMeta])

  const loadExistingTempPostForRecovery = useCallback(async (): Promise<PostForEditor | null> => {
    try {
      const data = await apiFetch<PageDto<AdminPostListItem>>(
        "/post/api/v1/adm/posts?page=1&pageSize=30&kw=&sort=MODIFIED_AT"
      )
      const tempRow = (data.content || []).find(
        (row) =>
          isServerTempDraftPost(row) &&
          !row.deletedAt
      )
      if (!tempRow?.id) return null
      return await apiFetch<PostForEditor>(`/post/api/v1/adm/posts/${tempRow.id}`)
    } catch {
      return null
    }
  }, [])

  const handleRecommendTags = useCallback(async () => {
    const content = postContent.trim()
    if (!content) {
      setTagRecommendationNotice({ tone: "error", text: "본문을 먼저 입력한 뒤 태그 추천을 실행해주세요." })
      return
    }
    if (content.length > PREVIEW_SUMMARY_MAX_CONTENT_LENGTH) {
      const message = `태그 추천용 본문은 최대 ${PREVIEW_SUMMARY_MAX_CONTENT_LENGTH.toLocaleString()}자까지 지원됩니다.`
      setTagRecommendationNotice({ tone: "error", text: message })
      return
    }

    try {
      setLoadingKey("recommendTags")
      setTagRecommendationNotice({ tone: "loading", text: "AI 태그 추천 생성 중입니다..." })

      const response = await fetchRecommendedTags({
        title: postTitle,
        content: postContent,
        existingTags: postTags,
        maxTags: 6,
      })

      const recommended = normalizeRecommendedTags(response?.data?.tags, 6)
      if (recommended.length === 0) {
        throw new Error("태그 추천 결과가 비어 있습니다.")
      }

      const currentTagSet = new Set(postTags.map((tag) => tag.toLowerCase()))
      const tagsToAdd = recommended.filter((tag) => !currentTagSet.has(tag.toLowerCase()))
      if (tagsToAdd.length > 0) {
        setPostTags((prev) => dedupeStrings([...prev, ...tagsToAdd]))
        setKnownTags((prev) => dedupeStrings([...prev, ...tagsToAdd]).sort((a, b) => a.localeCompare(b)))
        setCustomTagCatalog((prev) => dedupeStrings([...prev, ...tagsToAdd]).sort((a, b) => a.localeCompare(b)))
      }

      const isRuleFallback = response?.data?.provider === "rule"
      const traceHint = response?.data?.traceId ? ` · trace=${response.data.traceId}` : ""
      const reasonHint =
        response?.data?.provider === "rule" ? formatTagRecommendationReason(response?.data?.reason) : ""

      if (isRuleFallback) {
        const fallbackNoticeText = `규칙 기반 태그 추천 반영 (${reasonHint || "AI 태그 추천 실패"})${traceHint}`
        setTagRecommendationNotice({ tone: "error", text: fallbackNoticeText })
        return
      }

      if (tagsToAdd.length === 0) {
        setTagRecommendationNotice({
          tone: "success",
          text: `AI 추천 태그가 이미 모두 적용된 상태입니다.${traceHint}`,
        })
        return
      }

      const tagNoticeText = `태그 ${tagsToAdd.length}개를 추천 반영했습니다.${traceHint}`
      setTagRecommendationNotice({ tone: "success", text: tagNoticeText })
    } catch (error) {
      const errorMessage = resolveTagRecommendationErrorMessage(error)
      const failMessage = `태그 추천 실패: ${errorMessage}`
      setTagRecommendationNotice({ tone: "error", text: failMessage })
    } finally {
      setLoadingKey("")
    }
  }, [postContent, postTags, postTitle])

  const handleWritePost = async (): Promise<boolean> => {
    if (editorMode === "edit" || postId.trim()) {
      const msg = "현재는 수정 모드입니다. 새 글을 만들려면 먼저 '새 글 모드 전환'을 눌러주세요."
      setPublishStatus({ tone: "error", text: msg })
      setResult(pretty({ error: msg }))
      return false
    }

    if (!postTitle.trim()) {
      const msg = "제목을 입력해주세요."
      setPublishStatus({ tone: "error", text: msg })
      setResult(pretty({ error: msg }))
      return false
    }

    if (!postContent.trim()) {
      const msg = "본문을 입력해주세요."
      setPublishStatus({ tone: "error", text: msg })
      setResult(pretty({ error: msg }))
      return false
    }

    const placeholderIssue = detectPublishPlaceholderIssue(postContent)
    if (placeholderIssue) {
      setPublishStatus({ tone: "error", text: placeholderIssue })
      setResult(pretty({ error: placeholderIssue }))
      return false
    }

    try {
      setLoadingKey("writePost")
      setPublishStatus({ tone: "loading", text: "글 작성 중입니다..." })
      const contentWithMetadata = composeEditorContent(postContent, postTags, {
        category: postCategory,
        summary: postSummary,
        thumbnail: effectiveThumbnailUrl,
      })

      const fingerprint = `${postTitle}\n---\n${contentWithMetadata}\n---\n${postVisibility}`
      if (lastWriteFingerprintRef.current !== fingerprint || !lastWriteIdempotencyKeyRef.current) {
        lastWriteFingerprintRef.current = fingerprint
        lastWriteIdempotencyKeyRef.current = generateIdempotencyKey()
      }

      const response = await apiFetch<RsData<PostWriteResult>>("/post/api/v1/posts", {
        method: "POST",
        headers: {
          "Idempotency-Key": lastWriteIdempotencyKeyRef.current,
        },
        body: JSON.stringify({
          title: postTitle,
          content: contentWithMetadata,
          ...toFlags(postVisibility),
        }),
      })

      setResult(pretty(response as unknown as JsonValue))
      if (response?.data?.id) {
        setPostId(String(response.data.id))
        setPostVersion(typeof response.data.version === "number" ? response.data.version : null)
        setEditorMode("edit")
        setIsTempDraftMode(false)
        serverBaselineEditorFingerprintRef.current = buildEditorStateFingerprint({
          title: postTitle,
          content: postContent,
          summary: postSummary,
          thumbnailUrl: postThumbnailUrl,
          thumbnailFocusX: postThumbnailFocusX,
          thumbnailFocusY: postThumbnailFocusY,
          thumbnailZoom: postThumbnailZoom,
          tags: postTags,
          category: postCategory,
          visibility: postVisibility,
        })
        lastWriteFingerprintRef.current = ""
        lastWriteIdempotencyKeyRef.current = ""
      }
      await refreshPublicPostReadViews(response?.data?.id)

      const visibilityText =
        postVisibility === "PUBLIC_LISTED"
          ? "전체 공개(목록 노출)"
          : postVisibility === "PUBLIC_UNLISTED"
            ? "링크 공개(목록 미노출)"
            : "비공개"

      removeLocalDraft()
      setLocalDraftSavedAt("")

      setPublishStatus(
        {
          tone: "success",
          text: `작성 완료: ${response.msg} (공개 범위: ${visibilityText})`,
        },
        "page"
      )
      setKnownTags((prev) => dedupeStrings([...prev, ...postTags]).sort((a, b) => a.localeCompare(b)))
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setResult(pretty({ error: message }))
      setPublishStatus({ tone: "error", text: `작성 실패: ${message}` })
      return false
    } finally {
      setLoadingKey("")
    }
  }

  const handleModifyPost = async (): Promise<boolean> => {
    if (editorMode !== "edit" || !postId.trim()) {
      const msg = "수정할 글 ID를 먼저 선택해주세요."
      setPublishStatus({ tone: "error", text: msg })
      setResult(pretty({ error: msg }))
      return false
    }

    if (!postTitle.trim()) {
      const msg = "제목을 입력해주세요."
      setPublishStatus({ tone: "error", text: msg })
      setResult(pretty({ error: msg }))
      return false
    }

    if (!postContent.trim()) {
      const msg = "본문을 입력해주세요."
      setPublishStatus({ tone: "error", text: msg })
      setResult(pretty({ error: msg }))
      return false
    }

    const placeholderIssue = detectPublishPlaceholderIssue(postContent)
    if (placeholderIssue) {
      setPublishStatus({ tone: "error", text: placeholderIssue })
      setResult(pretty({ error: placeholderIssue }))
      return false
    }

    if (postVersion == null) {
      const msg = "최신 글 버전을 불러오지 못했습니다. 글을 다시 열어주세요."
      setPublishStatus({ tone: "error", text: msg })
      setResult(pretty({ error: msg }))
      return false
    }

    try {
      setLoadingKey("modifyPost")
      setPublishStatus({ tone: "loading", text: "글 수정 중입니다..." })

      const response = await apiFetch<RsData<PostWriteResult>>(`/post/api/v1/posts/${postId}`, {
        method: "PUT",
        body: JSON.stringify({
          title: postTitle,
          content: composeEditorContent(postContent, postTags, {
            category: postCategory,
            summary: postSummary,
            thumbnail: effectiveThumbnailUrl,
          }),
          ...toFlags(postVisibility),
          version: postVersion,
        }),
      })

      setKnownTags((prev) => dedupeStrings([...prev, ...postTags]).sort((a, b) => a.localeCompare(b)))
      setPostVersion(typeof response?.data?.version === "number" ? response.data.version : postVersion)
      setIsTempDraftMode(isTempDraftTitlePlaceholder(postTitle) && postVisibility === "PRIVATE")
      serverBaselineEditorFingerprintRef.current = buildEditorStateFingerprint({
        title: postTitle,
        content: postContent,
        summary: postSummary,
        thumbnailUrl: postThumbnailUrl,
        thumbnailFocusX: postThumbnailFocusX,
        thumbnailFocusY: postThumbnailFocusY,
        thumbnailZoom: postThumbnailZoom,
        tags: postTags,
        category: postCategory,
        visibility: postVisibility,
      })
      await refreshPublicPostReadViews(postId)
      setPublishStatus({ tone: "success", text: `수정 완료: ${response.msg}` }, "page")
      setResult(pretty(response as unknown as JsonValue))
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setPublishStatus({ tone: "error", text: `수정 실패: ${message}` })
      setResult(pretty({ error: message }))
      return false
    } finally {
      setLoadingKey("")
    }
  }

  const handleLoadOrCreateTempPost = useCallback(async (options?: { redirectToEditor?: boolean; source?: string }) => {
    try {
      setLoadingKey("postTemp")
      setPublishStatus({ tone: "loading", text: "새 글을 준비하고 있습니다..." }, "page")
      if (!tempPostRequestRef.current) {
        tempPostRequestRef.current = requestTempPostWithConflictRetry(loadExistingTempPostForRecovery).finally(() => {
          tempPostRequestRef.current = null
        })
      }
      const response = await tempPostRequestRef.current
      const tempPost = response.data
      const rawSnapshot = resolveEditorMetaSnapshot(tempPost.content ?? "", tempPost.contentHtml)
      const shouldMaskTempTitle = isServerTempDraftPost(tempPost)
      const shouldMaskTempPlaceholder = isBlankServerTempDraft(tempPost, rawSnapshot)
      const nextTitle = shouldMaskTempTitle ? "" : tempPost.title ?? ""
      const nextVisibility = toVisibility(!!tempPost.published, !!tempPost.listed)
      const snapshot = shouldMaskTempPlaceholder
        ? (syncEditorMeta("") ?? buildEmptyEditorMetaSnapshot())
        : syncEditorMeta(tempPost.content ?? "", tempPost.contentHtml)
      setPostTitle(nextTitle)
      setPostVisibility(nextVisibility)
      serverBaselineEditorFingerprintRef.current = buildEditorStateFingerprint({
        title: nextTitle,
        content: snapshot.body,
        summary: snapshot.summary,
        thumbnailUrl: snapshot.thumbnailUrl,
        thumbnailFocusX: snapshot.thumbnailFocusX,
        thumbnailFocusY: snapshot.thumbnailFocusY,
        thumbnailZoom: snapshot.thumbnailZoom,
        tags: snapshot.tags,
        category: snapshot.category,
        visibility: nextVisibility,
      })
      applyLoadedPostContext(tempPost)
      setIsTempDraftMode(true)
      setPublishStatus(
        {
          tone: "success",
          text: shouldMaskTempPlaceholder ? "새 글을 시작할 수 있습니다." : "저장된 임시 저장본을 불러왔습니다.",
        },
        "page"
      )
      if (isCompactMobileLayout) {
        setMobileComposeStep("edit")
      }
      setResult(pretty(response as unknown as JsonValue))
      if (options?.redirectToEditor && tempPost.id) {
        const destination = options.source
          ? `${toEditorPostRoute(tempPost.id)}?source=${encodeURIComponent(options.source)}`
          : toEditorPostRoute(tempPost.id)
        await replaceRoute(router, destination)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setPublishStatus({ tone: "error", text: `새 글 불러오기 실패: ${message}` }, "page")
      setResult(pretty({ error: message }))
    } finally {
      setLoadingKey("")
    }
  }, [applyLoadedPostContext, isCompactMobileLayout, loadExistingTempPostForRecovery, router, setPublishStatus, syncEditorMeta])

  const handlePublishTempDraft = async (): Promise<boolean> => {
    if (editorMode !== "edit" || !postId.trim()) {
      const msg = "작성할 새 글을 먼저 불러와주세요."
      setPublishStatus({ tone: "error", text: msg })
      setResult(pretty({ error: msg }))
      return false
    }

    if (!postTitle.trim()) {
      const msg = "제목을 입력해주세요."
      setPublishStatus({ tone: "error", text: msg })
      setResult(pretty({ error: msg }))
      return false
    }

    if (!postContent.trim()) {
      const msg = "본문을 입력해주세요."
      setPublishStatus({ tone: "error", text: msg })
      setResult(pretty({ error: msg }))
      return false
    }

    const placeholderIssue = detectPublishPlaceholderIssue(postContent)
    if (placeholderIssue) {
      setPublishStatus({ tone: "error", text: placeholderIssue })
      setResult(pretty({ error: placeholderIssue }))
      return false
    }

    if (postVersion == null) {
      const msg = "새 글 버전을 불러오지 못했습니다. 글을 다시 열어주세요."
      setPublishStatus({ tone: "error", text: msg })
      setResult(pretty({ error: msg }))
      return false
    }

    try {
      setLoadingKey("publishTempPost")
      setPublishStatus({ tone: "loading", text: "새 글을 작성하는 중입니다..." })

      const response = await apiFetch<RsData<PostWriteResult>>(`/post/api/v1/posts/${postId}`, {
        method: "PUT",
        body: JSON.stringify({
          title: postTitle,
          content: composeEditorContent(postContent, postTags, {
            category: postCategory,
            summary: postSummary,
            thumbnail: effectiveThumbnailUrl,
          }),
          ...toFlags(postVisibility),
          version: postVersion,
        }),
      })
      setPostVisibility(postVisibility)
      setPostVersion(typeof response?.data?.version === "number" ? response.data.version : postVersion)
      setIsTempDraftMode(false)
      serverBaselineEditorFingerprintRef.current = buildEditorStateFingerprint({
        title: postTitle,
        content: postContent,
        summary: postSummary,
        thumbnailUrl: postThumbnailUrl,
        thumbnailFocusX: postThumbnailFocusX,
        thumbnailFocusY: postThumbnailFocusY,
        thumbnailZoom: postThumbnailZoom,
        tags: postTags,
        category: postCategory,
        visibility: postVisibility,
      })
      await refreshPublicPostReadViews(postId)
      setPublishStatus({ tone: "success", text: "새 글 작성이 완료되었습니다." }, "page")
      setResult(pretty(response as unknown as JsonValue))
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setPublishStatus({ tone: "error", text: `새 글 작성 실패: ${message}` })
      setResult(pretty({ error: message }))
      return false
    } finally {
      setLoadingKey("")
    }
  }

  const visibilityLabel = (published: boolean, listed: boolean) => {
    if (!published) return "비공개"
    if (!listed) return "링크 공개"
    return "전체 공개"
  }

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
    const safePage = sanitizeNumberInput(listPage || "1") || "1"
    const safePageSize = sanitizeNumberInput(listPageSize || "30") || "30"
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
      const data = await apiFetch<PageDto<AdminPostListItem>>(
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
  }, [activateManageSurface, isCompactMobileLayout, listKw, listPage, listPageSize, listScope, listSort])

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
      text: "삭제는 즉시 반영되며 되돌릴 수 없습니다.",
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
    if (loadingKey === "deletePost") return
    setDeleteConfirmState(null)
    setDeleteConfirmNotice({
      tone: "idle",
      text: "",
    })
  }, [loadingKey])

  const deletePostsFromList = async (targetIds: number[]) => {
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
  }

  const restoreDeletedPostFromList = useCallback(async (row: AdminPostListItem) => {
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
  }, [refreshPublicPostReadViews])

  const hardDeleteDeletedPostFromList = useCallback(async (row: AdminPostListItem) => {
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
  }, [refreshPublicPostReadViews])

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
  }, [loadAdminPosts, refreshPublicPostReadViews, softDeleteUndoState])

  const isDedicatedEditorRoute = router.pathname.startsWith("/editor")
  const activeEditorRoute = useMemo(() => {
    if (postId.trim()) return toEditorPostRoute(postId.trim())
    return EDITOR_NEW_ROUTE_PATH
  }, [postId])

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
  }, [listScope])

  useEffect(() => {
    if (!softDeleteUndoState) return
    const timeout = window.setTimeout(
      () => setSoftDeleteUndoState(null),
      Math.max(0, softDeleteUndoState.expiresAt - Date.now())
    )
    return () => window.clearTimeout(timeout)
  }, [softDeleteUndoState])

  const handleUploadMemberProfileImage = async (selectedFile?: File) => {
    const file = selectedFile || profileImageFileInputRef.current?.files?.[0]
    if (!file) {
      setResult(pretty({ error: "업로드할 이미지 파일을 선택해주세요." }))
      return
    }

    if (!sessionMember?.id) {
      setResult(pretty({ error: "현재 관리자 정보를 확인할 수 없습니다." }))
      return
    }

    try {
      setLoadingKey("admMemberProfileImgUpdate")
      setProfileImageNotice({ tone: "loading", text: "프로필 이미지를 최적화하고 업로드하고 있습니다..." })
      const prepared = await prepareProfileImageForUpload(file)
      const requestUpload = async () => {
        const formData = new FormData()
        formData.append("file", prepared.file, prepared.file.name)
        return await fetch(
          `${getApiBaseUrl()}/member/api/v1/adm/members/${sessionMember.id}/profileImageFile`,
          {
            method: "POST",
            credentials: "include",
            body: formData,
          }
        )
      }

      setProfileImageNotice({ tone: "loading", text: "요청 충돌 여부를 확인하며 업로드 중입니다..." })
      const uploadResponse = await uploadWithConflictRetry(requestUpload)

      const uploadData = (await uploadResponse.json()) as MemberMe
      const uploadedUrl = (uploadData?.profileImageDirectUrl || uploadData?.profileImageUrl || "").trim()
      if (!uploadedUrl) {
        throw new Error("업로드 응답에 이미지 URL이 없습니다.")
      }

      syncProfileState(uploadData)
      setProfileImageNotice({
        tone: "success",
        text: `프로필 이미지가 저장되었습니다. ${buildImageOptimizationSummary(prepared)}`,
      })
      setResult(
        pretty({
          uploadedUrl,
          optimization: buildImageOptimizationSummary(prepared),
          member: uploadData,
        })
      )
    } catch (error) {
      const message = normalizeProfileImageUploadError(error)
      setProfileImageNotice({ tone: "error", text: `프로필 이미지 저장 실패: ${message}` })
      setResult(pretty({ error: message }))
    } finally {
      if (profileImageFileInputRef.current) {
        profileImageFileInputRef.current.value = ""
      }
      setLoadingKey("")
    }
  }

  const handleUpdateMemberProfileCard = async () => {
    if (!sessionMember?.id) {
      setResult(pretty({ error: "현재 관리자 정보를 확인할 수 없습니다." }))
      return
    }

    try {
      setLoadingKey("admMemberProfileCardUpdate")
      setProfileNotice({ tone: "loading", text: "역할과 소개 문구를 저장하고 있습니다..." })
      const updated = await saveProfileCardWithConflictRetry(() =>
        apiFetch<MemberMe>(`/member/api/v1/adm/members/${sessionMember.id}/profileCard`, {
          method: "PATCH",
          body: JSON.stringify({
            role: profileRoleInput.trim(),
            bio: profileBioInput.trim(),
            aboutRole: (sessionMember.aboutRole || "").trim(),
            aboutBio: (sessionMember.aboutBio || "").trim(),
            aboutDetails: (sessionMember.aboutDetails || "").trim(),
            blogTitle: (sessionMember.blogTitle || "").trim(),
            homeIntroTitle: (sessionMember.homeIntroTitle || "").trim(),
            homeIntroDescription: (sessionMember.homeIntroDescription || "").trim(),
          }),
        })
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
    setCustomTagCatalog(readStoredCatalog(TAG_CATALOG_STORAGE_KEY))
    setCustomCategoryCatalog(
      dedupeStrings(readStoredCatalog(CATEGORY_CATALOG_STORAGE_KEY).map(normalizeCategoryValue)).sort(
        compareCategoryValues
      )
    )
    try {
      const raw = localStorage.getItem(LIST_CONDITION_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<{
          page: string
          pageSize: string
          kw: string
          sort: string
          scope: PostListScope
          preset: ListQuickPreset
        }>
        if (typeof parsed.page === "string") setListPage(sanitizeNumberInput(parsed.page) || "1")
        if (typeof parsed.pageSize === "string") setListPageSize(sanitizeNumberInput(parsed.pageSize) || "30")
        if (typeof parsed.kw === "string") setListKw(parsed.kw)
        if (typeof parsed.sort === "string") {
          const hasOption = LIST_SORT_OPTIONS.some((option) => option.value === parsed.sort)
          setListSort(hasOption ? parsed.sort : LIST_SORT_OPTIONS[0].value)
        }
        if (parsed.scope === "active" || parsed.scope === "deleted") setListScope(parsed.scope)
        if (parsed.preset === "none" || parsed.preset === "today" || parsed.preset === "temp") {
          setListQuickPreset(parsed.preset)
        }
      }
    } catch {
      // noop: 깨진 저장값은 무시하고 기본값 사용
    }
    const localDraft = readLocalDraft()
    if (localDraft?.savedAt) {
      setLocalDraftSavedAt(localDraft.savedAt)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(
      LIST_CONDITION_STORAGE_KEY,
      JSON.stringify({
        page: listPage,
        pageSize: listPageSize,
        kw: listKw,
        sort: listSort,
        scope: listScope,
        preset: listQuickPreset,
      })
    )
  }, [listKw, listPage, listPageSize, listQuickPreset, listScope, listSort])

  useEffect(() => {
    persistCatalog(TAG_CATALOG_STORAGE_KEY, customTagCatalog)
  }, [customTagCatalog])

  useEffect(() => {
    persistCatalog(CATEGORY_CATALOG_STORAGE_KEY, customCategoryCatalog)
  }, [customCategoryCatalog])

  useEffect(() => {
    const hasDraftContent =
      postTitle.trim().length > 0 ||
      postContent.trim().length > 0 ||
      postSummary.trim().length > 0 ||
      postThumbnailUrl.trim().length > 0 ||
      postTags.length > 0 ||
      postCategory.trim().length > 0

    if (!hasDraftContent) return

    const timerId = window.setTimeout(() => {
      saveLocalDraft({ silent: true })
    }, 1200)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [postCategory, postContent, postSummary, postTags, postThumbnailUrl, postTitle, saveLocalDraft])

  useEffect(() => {
    setKnownTags((prev) =>
      dedupeStrings([...prev, ...Object.keys(tagUsageMap), ...customTagCatalog, ...postTags]).sort((a, b) =>
        a.localeCompare(b)
      )
    )
  }, [customTagCatalog, postTags, tagUsageMap])

  useEffect(() => {
    if (authStatus === "loading" || authStatus === "unavailable") return

    if (!me) {
      const target = toLoginPath(router.asPath || activeEditorRoute, activeEditorRoute)
      if (!redirectingRef.current && router.asPath !== target) {
        redirectingRef.current = true
        void (async () => {
          try {
            await replaceRoute(router, target, { preferHardNavigation: true })
          } catch (error) {
            if (!isNavigationCancelledError(error)) {
              setResult(pretty({ error: error instanceof Error ? error.message : String(error) }))
            }
          }
        })()
      }
      return
    }

    if (!me.isAdmin) {
      if (!redirectingRef.current && router.asPath !== "/") {
        redirectingRef.current = true
        void (async () => {
          try {
            await replaceRoute(router, "/", { preferHardNavigation: true })
          } catch (error) {
            if (!isNavigationCancelledError(error)) {
              setResult(pretty({ error: error instanceof Error ? error.message : String(error) }))
            }
          }
        })()
      }
      return
    }
  }, [activeEditorRoute, authStatus, me, router])

  useEffect(() => {
    if (!sessionMember) return
    if (hydratedAdminIdRef.current === sessionMember.id) return

    hydratedAdminIdRef.current = sessionMember.id
    // auth/me 응답에는 관리자 프로필 카드 필드가 포함되어 있으므로,
    // 관리자 상세 재조회가 끝날 때까지 패널을 비워두지 않고 즉시 화면을 채운다.
    applyProfileState(sessionMember)
    setProfileNotice({
      tone: "idle",
      text: "현재 로그인 세션의 관리자 프로필 값을 불러왔습니다. 필요하면 아래 버튼으로 저장값을 다시 조회할 수 있습니다.",
    })
    void refreshEditorMetaCatalog()
  }, [applyProfileState, refreshEditorMetaCatalog, sessionMember])

  useEffect(() => {
    if (!router.isReady) return

    const queryPostId =
      typeof router.query.id === "string"
        ? router.query.id.trim()
        : typeof router.query.postId === "string"
          ? router.query.postId.trim()
          : ""
    if (!queryPostId) return
    if (autoLoadedPostIdRef.current === queryPostId) return

    autoLoadedPostIdRef.current = queryPostId
    setPostId(queryPostId)
    void loadPostForEditor(queryPostId)
  }, [loadPostForEditor, router.isReady, router.query.id, router.query.postId])

  useEffect(() => {
    if (!router.isReady) return
    const source = typeof router.query.source === "string" ? router.query.source.trim() : ""
    if (source !== "local-draft") return
    restoreLocalDraft()
    const nextQuery = { ...router.query }
    delete nextQuery.source
    void replaceShallowRoutePreservingScroll(router, { query: nextQuery })
  }, [restoreLocalDraft, router])

  useEffect(() => {
    if (!router.isReady || !isDedicatedEditorRoute || authStatus !== "authenticated" || !sessionMember?.isAdmin) return
    if (router.pathname !== EDITOR_NEW_ROUTE_PATH) return
    if (autoCreatedTempDraftRef.current) return

    autoCreatedTempDraftRef.current = true
    const source = typeof router.query.source === "string" ? router.query.source.trim() : ""
    void handleLoadOrCreateTempPost({
      redirectToEditor: true,
      source: source || undefined,
    })
  }, [authStatus, handleLoadOrCreateTempPost, isDedicatedEditorRoute, router, sessionMember?.isAdmin])

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

  const insertBlockSnippet = (
    snippet: string,
    options?: {
      selectionMode?: "select" | "after"
    }
  ) => {
    const normalized = snippet.trim()
    if (!normalized) return
    const selectionMode = options?.selectionMode ?? "select"

    const apply = (base: string, start: number, end: number) => {
      const before = base.slice(0, start)
      const after = base.slice(end)
      const prefix = before.length === 0 ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n"
      const suffix = after.length === 0 ? "\n" : after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n"
      const inserted = `${prefix}${normalized}${suffix}`
      const insertedStart = before.length + prefix.length
      const insertedEnd = insertedStart + normalized.length
      const cursorAfter = before.length + inserted.length
      return {
        nextContent: `${before}${inserted}${after}`,
        selectionStart: selectionMode === "after" ? cursorAfter : insertedStart,
        selectionEnd: selectionMode === "after" ? cursorAfter : insertedEnd,
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
    const defaultBody = EDITOR_BODY_PLACEHOLDER

    if (!textarea) {
      setPostContent(
        (prev) =>
          `${prev}${prev.endsWith("\n") ? "" : "\n"}:::toggle ${EDITOR_TOGGLE_TITLE_PLACEHOLDER}\n${defaultBody}\n:::\n`
      )
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = postContent.slice(start, end).trim()
    const body = selected || defaultBody
    const snippet = `:::toggle ${EDITOR_TOGGLE_TITLE_PLACEHOLDER}\n${body}\n:::\n`
    const nextContent = `${postContent.slice(0, start)}${snippet}${postContent.slice(end)}`
    setPostContent(nextContent)

    requestAnimationFrame(() => {
      textarea.focus()
      const titleStart = start + ":::toggle ".length
      textarea.setSelectionRange(titleStart, titleStart + EDITOR_TOGGLE_TITLE_PLACEHOLDER.length)
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

  const applyInlineTextColor = (color: string) => {
    wrapSelection(`{{color:${color}|`, "}}", "색상 텍스트")
    setIsColorMenuOpen(false)
  }

  const handlePasteFromHtml = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData("text/html")
    if (!html) return

    e.preventDefault()
    const markdown = convertHtmlToMarkdown(html)
    if (!markdown.trim()) return
    insertSnippet(markdown)
  }

  const uploadPostImageFile = useCallback(async (file: File): Promise<UploadPostImageResult> => {
    const prepared = await preparePostImageForUpload(file)
    const requestUpload = async () => {
      const formData = new FormData()
      formData.append("file", prepared.file, prepared.file.name)
      return await fetch(`${getApiBaseUrl()}/post/api/v1/posts/images`, {
        method: "POST",
        credentials: "include",
        body: formData,
      })
    }

    const response = await uploadWithConflictRetry(requestUpload)

    return {
      uploaded: (await response.json()) as UploadPostImageResponse,
      prepared: {
        summary: buildImageOptimizationSummary(prepared),
      },
    }
  }, [])

  const handlePostImageFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    void run("uploadPostImage", async () => {
      setPublishStatus({
        tone: "loading",
        text: `이미지 "${file.name}" 최적화/업로드 중입니다. 완료되면 본문에 자동 삽입됩니다.`,
      })

      try {
        const uploaded = await uploadPostImageFile(file)
        const markdown = uploaded.uploaded.data?.markdown
        if (!markdown) throw new Error("업로드 응답 형식이 올바르지 않습니다.")
        insertBlockSnippet(markdown, { selectionMode: "after" })
        setPublishStatus({
          tone: "success",
          text: `이미지 업로드가 완료되었습니다. ${uploaded.prepared.summary}`,
        })
        return uploaded
      } catch (error) {
        const message = normalizeProfileImageUploadError(error)
        setPublishStatus({
          tone: "error",
          text: `이미지 업로드 실패: ${message}`,
        })
        throw error
      }
    })
  }

  const handleBlockEditorImageUpload = useCallback(
    async (file: File) => {
      setPublishStatus({
        tone: "loading",
        text: `이미지 "${file.name}" 최적화/업로드 중입니다. 완료되면 블록에 바로 삽입됩니다.`,
      })

      try {
        const uploaded = await uploadPostImageFile(file)
        const markdown = uploaded.uploaded.data?.markdown
        if (!markdown) throw new Error("업로드 응답 형식이 올바르지 않습니다.")

        const parsed = parseStandaloneMarkdownImageLine(markdown)
        if (!parsed) throw new Error("이미지 markdown 메타데이터를 해석하지 못했습니다.")

        setPublishStatus({
          tone: "success",
          text: `이미지 업로드가 완료되었습니다. ${uploaded.prepared.summary}`,
        })

        return {
          src: parsed.src,
          alt: parsed.alt,
          title: parsed.title,
          widthPx: parsed.widthPx,
          align: parsed.align || "center",
        }
      } catch (error) {
        const message = normalizeProfileImageUploadError(error)
        setPublishStatus({
          tone: "error",
          text: `이미지 업로드 실패: ${message}`,
        })
        throw error
      }
    },
    [setPublishStatus, uploadPostImageFile]
  )

  const handleUploadThumbnailImage = async (file: File) => {
    try {
      setLoadingKey("uploadThumbnail")
      setPublishStatus({
        tone: "loading",
        text: `썸네일 "${file.name}" 최적화/업로드 중입니다...`,
      })
      const uploaded = await uploadPostImageFile(file)
      const uploadedUrl = uploaded.uploaded.data?.url?.trim()
      if (!uploadedUrl) throw new Error("업로드 응답 형식이 올바르지 않습니다.")
      const safeUploadedUrl = normalizeSafeImageUrl(uploadedUrl)
      if (!safeUploadedUrl) throw new Error("허용되지 않은 썸네일 URL 형식입니다.")

      setPostThumbnailUrl(stripThumbnailFocusFromUrl(safeUploadedUrl))
      setPostThumbnailFocusX(DEFAULT_THUMBNAIL_FOCUS_X)
      setPostThumbnailFocusY(DEFAULT_THUMBNAIL_FOCUS_Y)
      setPostThumbnailZoom(DEFAULT_THUMBNAIL_ZOOM)
      setPreviewThumbnailSourceUrl(stripThumbnailFocusFromUrl(safeUploadedUrl))
      setIsPreviewThumbnailError(false)
      setPublishStatus({
        tone: "success",
        text: `썸네일 파일 업로드가 완료되었습니다. ${uploaded.prepared.summary}`,
      })
    } catch (error) {
      const message = normalizeProfileImageUploadError(error)
      setPublishStatus({
        tone: "error",
        text: `썸네일 업로드 실패: ${message}`,
      })
    } finally {
      setLoadingKey("")
    }
  }

  const handleThumbnailImageFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setThumbnailImageFileName(file.name)
    void handleUploadThumbnailImage(file)
  }

  const openPublishModal = (actionType: PublishActionType) => {
    activateComposeSurface()
    setPublishActionType(actionType)
    setPublishModalNotice({
      tone: "idle",
      text: publishModalHintByAction(actionType),
    })
    setTagRecommendationNotice({
      tone: "idle",
      text: TAG_RECOMMENDATION_IDLE_TEXT,
    })
    if (typeof window !== "undefined") {
      const nextViewport: PreviewViewportMode =
        window.innerWidth <= 480 ? "mobile" : window.innerWidth <= 1024 ? "tablet" : "desktop"
      setPreviewViewport(nextViewport)
    } else {
      setPreviewViewport("desktop")
    }
    const shouldOpenThumbnailEditorByDefault = Boolean(safePreviewThumbnail && !isPreviewThumbnailError)
    setIsMobileThumbnailEditorOpen(shouldOpenThumbnailEditorByDefault)
    setIsMobileMetaEditorOpen(!shouldOpenThumbnailEditorByDefault)
    setIsPublishModalOpen(true)
    if (isCompactMobileLayout) {
      setMobileComposeStep("publish")
    }
  }

  const closePublishModal = () => {
    if (
      loadingKey === "writePost" ||
      loadingKey === "modifyPost" ||
      loadingKey === "publishTempPost" ||
      loadingKey === "recommendTags"
    ) return
    setPublishModalNotice({
      tone: "idle",
      text: publishModalHintByAction(publishActionType),
    })
    setTagRecommendationNotice({
      tone: "idle",
      text: TAG_RECOMMENDATION_IDLE_TEXT,
    })
    setIsPublishModalOpen(false)
    if (isCompactMobileLayout) {
      setMobileComposeStep("edit")
    }
  }

  const handleConfirmPublish = async () => {
    const success =
      publishActionType === "create"
        ? await handleWritePost()
        : publishActionType === "modify"
          ? await handleModifyPost()
          : await handlePublishTempDraft()

    if (success) {
      setIsPublishModalOpen(false)
    }
  }

  const currentFlags = toFlags(postVisibility)
  const editorStateFingerprint = useMemo(
    () =>
      buildEditorStateFingerprint({
        title: postTitle,
        content: postContent,
        summary: postSummary,
        thumbnailUrl: postThumbnailUrl,
        thumbnailFocusX: postThumbnailFocusX,
        thumbnailFocusY: postThumbnailFocusY,
        thumbnailZoom: postThumbnailZoom,
        tags: postTags,
        category: postCategory,
        visibility: postVisibility,
      }),
    [
      postCategory,
      postContent,
      postSummary,
      postTags,
      postThumbnailFocusX,
      postThumbnailFocusY,
      postThumbnailZoom,
      postThumbnailUrl,
      postTitle,
      postVisibility,
    ]
  )
  const currentVisibilityText = visibilityLabel(currentFlags.published, currentFlags.listed)
  const editorModeLabel = editorMode === "edit" ? "원고 편집" : "새 글"
  const hasSelectedManagedPost = editorMode === "edit" && postId.trim().length > 0
  const currentPostLabel =
    hasSelectedManagedPost
      ? `${postTitle.trim() || "제목 없음"} · #${postId}`
      : postTitle.trim()
  const selectedPostLabel =
    hasSelectedManagedPost ? `선택된 글 ID #${postId}` : "선택된 글이 없습니다."
  const hasListFiltersApplied =
    listKw.trim().length > 0 ||
    listQuickPreset !== "none" ||
    listPage !== "1" ||
    listPageSize !== "30" ||
    (listScope === "active" && listSort !== "CREATED_AT")
  const contentLength = postContent.trim().length
  const lineCount = postContent ? postContent.split("\n").length : 0
  const imageCount = (postContent.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length
  const tagSummaryText = postTags.length > 0 ? `${postTags.length}개 선택` : "미선택"
  const composePageTitle = editorMode === "edit" ? "원고 편집" : "새 글"
  const composeSurfaceSubtitle = hasSelectedManagedPost
    ? `#${postId} 원고를 다듬고 있습니다.`
    : "기술 원고를 차분하게 다듬는 공간입니다."
  const hasEditorDraftContent = Boolean(postTitle.trim() || postContent.trim())
  const hasEditorMinimumFields = Boolean(postTitle.trim() && postContent.trim())
  const publishPlaceholderIssue = hasEditorMinimumFields
    ? detectPublishPlaceholderIssue(postContent)
    : null
  const editorPersistenceState = deriveEditorPersistenceState({
    editorMode,
    hasSelectedManagedPost,
    hasEditorDraftContent,
    editorStateFingerprint,
    serverBaselineFingerprint: serverBaselineEditorFingerprintRef.current,
    localDraftFingerprint: lastLocalDraftFingerprintRef.current,
    localDraftSavedAt,
    loadingKey,
    publishNoticeTone: publishNotice.tone,
  })
  const composeStatusText = editorPersistenceState.text
  const composeStatusTone = editorPersistenceState.tone
  const composeHeroSummary = [
    currentVisibilityText,
    postSummary.trim() ? `요약 ${postSummary.trim().length}자` : "요약 자동",
    postTags.length > 0 ? `태그 ${postTags.length}개` : "태그 미설정",
  ]
  const composeCallToActionLabel =
    editorMode === "create" ? "발행 준비" : isTempDraftMode ? "새 글 작성" : "수정 사항 확인"
  const composeSummaryPreview = postSummary.trim() || makePreviewSummary(postContent)
  const profilePreviewSrc = profileImgInputUrl.trim()
  const profileImageStatus = profilePreviewSrc ? "설정됨" : "기본 이미지 사용 중"
  const profileRoleStatus = profileRoleInput.trim() || "미설정"
  const profileBioStatus = profileBioInput.trim() || "미설정"
  const profileUpdatedText = sessionMember?.modifiedAt
    ? sessionMember.modifiedAt.slice(0, 16).replace("T", " ")
    : "확인 전"
  const profileImageHint = profileImageFileName
    ? `선택 파일: ${profileImageFileName}`
    : `${PROFILE_IMAGE_UPLOAD_RULE_LABEL} (선택 즉시 업로드)`
  const publishActionTitle =
    publishActionType === "create"
      ? "발행 설정"
      : publishActionType === "modify"
        ? "수정 설정"
        : "새 글 작성"
  const publishActionDescription =
    publishActionType === "create"
      ? "공개 범위와 카드 결과를 확인한 뒤 발행합니다."
      : publishActionType === "modify"
        ? "공개 범위와 카드 결과를 확인한 뒤 변경 내용을 반영합니다."
        : "공개 범위와 카드 결과를 확인한 뒤 새 글로 작성합니다."
  const publishActionButtonText =
    publishActionType === "create"
      ? loadingKey === "writePost"
        ? "발행 중..."
        : "발행하기"
      : publishActionType === "modify"
        ? loadingKey === "modifyPost"
          ? "반영 중..."
          : "변경 반영"
        : loadingKey === "publishTempPost"
          ? "작성 중..."
          : "새 글 작성"
  const publishActionButtonDisabled = isPublishActionDisabled({
    publishActionType,
    editorMode,
    loadingKey,
    hasEditorMinimumFields,
    hasPlaceholderIssue: Boolean(publishPlaceholderIssue),
  })
  const publishActionTriggerDisabled =
    loadingKey === "writePost" ||
    loadingKey === "modifyPost" ||
    loadingKey === "publishTempPost" ||
    loadingKey === "postTemp"
  const mobilePrimaryActionLabel =
    editorMode === "create"
      ? "발행 설정 열기"
      : isTempDraftMode
        ? "새 글 작성"
        : "수정 설정 열기"
  const mobilePrimaryActionDisabled = publishActionTriggerDisabled
  const activeMobileStudioStep = studioSurface === "manage" ? mobileManageStep : mobileComposeStep
  const mobileStudioSurfaceSteps =
    studioSurface === "manage"
      ? ([...MANAGE_MOBILE_STUDIO_STEPS] as MobileStudioStep[])
      : ([...COMPOSE_MOBILE_STUDIO_STEPS] as MobileStudioStep[])
  const mobileStudioStepIndex = mobileStudioSurfaceSteps.indexOf(activeMobileStudioStep)
  const mobileStudioPrevStep: MobileStudioStep | null =
    mobileStudioStepIndex > 0 ? mobileStudioSurfaceSteps[mobileStudioStepIndex - 1] ?? null : null
  const mobileStudioNextStep: MobileStudioStep | null =
    mobileStudioStepIndex < mobileStudioSurfaceSteps.length - 1
      ? mobileStudioSurfaceSteps[mobileStudioStepIndex + 1] ?? null
      : null
  const mobileStudioPrevStepLabel =
    mobileStudioPrevStep === null ? "이전 단계 없음" : getMobileStudioStepMoveLabel(mobileStudioPrevStep)
  const mobileStudioNextStepLabel =
    mobileStudioNextStep === null ? "마지막 단계" : `${MOBILE_STUDIO_STEP_LABEL[mobileStudioNextStep]} 단계로 이동`
  const setActiveMobileStudioStep = (step: MobileStudioStep) => {
    if (step === "query" || step === "list") {
      setMobileManageStep(step)
      return
    }
    setMobileComposeStep(step)
  }
  const isCompactManageSurface = isCompactMobileLayout && studioSurface === "manage"
  const showSelectedPanelInManageSurface = !isCompactMobileLayout || activeMobileStudioStep !== "list" || hasSelectedManagedPost
  const closeToolbarMenus = () => {
    setIsCalloutMenuOpen(false)
    setIsColorMenuOpen(false)
  }

  const runToolbarAction = (action: () => void) => {
    action()
    closeToolbarMenus()
  }

  const codeBlockTemplate = "```ts\nconst message = \"Hello, Aquila\";\nconsole.log(message);\n```"
  const mermaidTemplate = "```mermaid\ngraph TD\n  A[사용자 요청] --> B{검증}\n  B -->|OK| C[처리]\n  B -->|Fail| D[오류 반환]\n```"
  const tableTemplate = "| 구분 | 내용 |\n| --- | --- |\n| API | /post/api/v1/posts |\n| 상태 | 운영중 |"
  if (!sessionMember) {
    return null
  }

  const member = sessionMember
  const displayName = member.nickname || member.username || "관리자"
  const displayNameInitial = displayName.slice(0, 2).toUpperCase()
  const previewViewportConfig = PREVIEW_CARD_VIEWPORTS[previewViewport]
  const previewVisibilityLabel =
    postVisibility === "PRIVATE"
      ? "비공개"
      : postVisibility === "PUBLIC_UNLISTED"
        ? "링크 공개"
        : "전체 공개"
  const previewThumbnailSrc = safePreviewThumbnail && !isPreviewThumbnailError ? safePreviewThumbnail : ""
  const shouldShowPublishModalNotice = publishModalNotice.tone !== "idle"
  const previewAuthorAvatarSrc = (
    profileImgInputUrl.trim() ||
    member.profileImageDirectUrl ||
    member.profileImageUrl ||
    ""
  ).trim()
  const previewDateText = formatDate(new Date().toISOString(), "ko")
  const composeViewModeOptions: { value: ComposeViewMode; label: string; icon: "edit" | "split" | "eye" }[] = [
    { value: "editor", label: "작성", icon: "edit" },
    { value: "split", label: "작성+미리보기", icon: "split" },
    { value: "preview", label: "미리보기", icon: "eye" },
  ]
  const isCompactSplitPreview = editorStudioViewMode === "split" && isWideEditorViewport
  const editorStudioViewModeOptions = composeViewModeOptions.filter(
    (option) => isWideEditorViewport || option.value !== "split"
  )
  const shouldShowGlobalNotice =
    globalNotice.tone !== "idle" || globalNotice.text !== GLOBAL_NOTICE_IDLE_TEXT
  const shouldShowPublishNotice = publishNotice.tone !== "idle"
  const shouldShowTagRecommendationNotice =
    tagRecommendationNotice.tone !== "idle" || tagRecommendationNotice.text !== TAG_RECOMMENDATION_IDLE_TEXT
  const thumbnailEditorPanel = (
    <PreviewEditorSection>
      <PreviewEditorSectionHeader>
        <strong>썸네일 위치 조정</strong>
        <span>드래그로 위치를 바꾸고, 휠 또는 슬라이더로 확대/축소합니다.</span>
      </PreviewEditorSectionHeader>
      <PreviewThumbFrame
        ref={previewThumbFrameRef}
        data-draggable={safePreviewThumbnail && !isPreviewThumbnailError}
        data-dragging={isPreviewThumbDragging}
        onPointerDown={handlePreviewThumbPointerDown}
        onPointerMove={handlePreviewThumbPointerMove}
        onPointerUp={finalizePreviewThumbPointer}
        onPointerCancel={finalizePreviewThumbPointer}
      >
        {safePreviewThumbnail && !isPreviewThumbnailError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={safePreviewThumbnail}
            alt="포스트 미리보기 썸네일"
            style={{
              width: "var(--preview-thumb-width)",
              height: "var(--preview-thumb-height)",
              left: "var(--preview-thumb-left)",
              top: "var(--preview-thumb-top)",
              maxWidth: "none",
              transform: "translateZ(0)",
            }}
            onError={() => setIsPreviewThumbnailError(true)}
          />
        ) : (
          <div className="placeholder">
            <em>썸네일 없음</em>
            <span>본문 첫 이미지가 있으면 자동으로 사용됩니다.</span>
          </div>
        )}
      </PreviewThumbFrame>
      {safePreviewThumbnail && !isPreviewThumbnailError ? (
        <ZoomControlRow>
          <FieldLabel htmlFor="post-thumbnail-zoom-modal">썸네일 배율</FieldLabel>
          <ZoomRangeInput
            id="post-thumbnail-zoom-modal"
            type="range"
            min={1}
            max={2.5}
            step={0.01}
            value={postThumbnailZoom}
            onChange={(e) =>
              commitPreviewThumbTransform({
                ...previewThumbTransformRef.current,
                zoom: clampThumbnailZoom(Number(e.target.value)),
              })
            }
          />
          <ZoomControlMeta>
            <ZoomValue>{postThumbnailZoom.toFixed(2)}x</ZoomValue>
            <Button
              type="button"
              onClick={() =>
                commitPreviewThumbTransform({
                  ...previewThumbTransformRef.current,
                  zoom: DEFAULT_THUMBNAIL_ZOOM,
                })
              }
            >
              배율 초기화
            </Button>
          </ZoomControlMeta>
        </ZoomControlRow>
      ) : null}
    </PreviewEditorSection>
  )
  const previewMetaEditorPanel = (
    <PreviewEditorSection>
      <PreviewEditorSectionHeader>
        <strong>썸네일 소스</strong>
        <span>카드에 사용할 대표 이미지를 정리합니다.</span>
      </PreviewEditorSectionHeader>
      <FieldLabel htmlFor="post-thumbnail-url-modal">썸네일 URL</FieldLabel>
      <Input
        id="post-thumbnail-url-modal"
        placeholder="https://... (비우면 본문 첫 이미지 자동 사용)"
        value={postThumbnailUrl}
        onChange={(e) => {
          const nextValue = e.target.value
          setPostThumbnailUrl(nextValue)
          const focusXFromInput = getThumbnailFocusXFromUrl(nextValue)
          if (focusXFromInput !== null) {
            setPostThumbnailFocusX(focusXFromInput)
          }
          const focusFromInput = getThumbnailFocusYFromUrl(nextValue)
          if (focusFromInput !== null) {
            setPostThumbnailFocusY(focusFromInput)
          }
          const zoomFromInput = getThumbnailZoomFromUrl(nextValue)
          if (zoomFromInput !== null) {
            setPostThumbnailZoom(zoomFromInput)
          }
          setPreviewThumbnailSourceUrl("")
        }}
      />
      <MetaActionRow>
        <Button
          type="button"
          title={POST_IMAGE_UPLOAD_RULE_LABEL}
          disabled={disabled("uploadThumbnail")}
          onClick={() => thumbnailImageFileInputRef.current?.click()}
        >
          {loadingKey === "uploadThumbnail" ? "업로드 중..." : "썸네일 파일 업로드"}
        </Button>
        <Button
          type="button"
          onClick={() => {
            const extractedThumbnailUrl = normalizeSafeImageUrl(extractFirstMarkdownImage(postContent))
            setPostThumbnailUrl(stripThumbnailFocusFromUrl(extractedThumbnailUrl))
            setPostThumbnailFocusX(parseThumbnailFocusXFromUrl(extractedThumbnailUrl, DEFAULT_THUMBNAIL_FOCUS_X))
            setPostThumbnailFocusY(parseThumbnailFocusYFromUrl(extractedThumbnailUrl, DEFAULT_THUMBNAIL_FOCUS_Y))
            setPostThumbnailZoom(parseThumbnailZoomFromUrl(extractedThumbnailUrl, DEFAULT_THUMBNAIL_ZOOM))
            setPreviewThumbnailSourceUrl("")
          }}
        >
          본문 첫 이미지 가져오기
        </Button>
        <Button
          type="button"
          onClick={() => {
            setPostThumbnailUrl("")
            setPostThumbnailFocusX(DEFAULT_THUMBNAIL_FOCUS_X)
            setPostThumbnailFocusY(DEFAULT_THUMBNAIL_FOCUS_Y)
            setPostThumbnailZoom(DEFAULT_THUMBNAIL_ZOOM)
            setPreviewThumbnailSourceUrl("")
          }}
      >
          자동 모드로 되돌리기
        </Button>
      </MetaActionRow>
      {thumbnailImageFileName ? <FieldHelp>선택 파일: {thumbnailImageFileName}</FieldHelp> : null}
    </PreviewEditorSection>
  )

  const livePreviewViewportConfig = LIVE_PREVIEW_VIEWPORTS[previewViewport]
  const editorPrimaryActionType: PublishActionType =
    editorMode === "create" ? "create" : isTempDraftMode ? "temp" : "modify"
  const editorPrimaryActionLabel =
    editorPrimaryActionType === "modify"
      ? "수정 반영"
      : editorPrimaryActionType === "temp"
        ? "새 글 작성"
        : "발행"
  const shouldShowEditorLoadingState =
    isDedicatedEditorRoute &&
    router.pathname === EDITOR_NEW_ROUTE_PATH &&
    !postId.trim() &&
    loadingKey === "postTemp"
  const shouldShowResultPanel = Boolean(loadingKey || result)

  if (shouldShowEditorLoadingState) {
    return (
      <EditorStudioRoot>
        <EditorStudioLoadingState>
          <strong>편집 화면을 준비하고 있습니다.</strong>
          <span>잠시만 기다려 주세요.</span>
        </EditorStudioLoadingState>
      </EditorStudioRoot>
    )
  }

  if (isDedicatedEditorRoute) {
    return (
      <EditorStudioRoot>
      <input
        ref={postImageFileInputRef}
        type="file"
        accept="image/*"
        onChange={handlePostImageFileChange}
        style={{ display: "none" }}
      />
      <input
        ref={thumbnailImageFileInputRef}
        type="file"
        accept="image/*"
        onChange={handleThumbnailImageFileChange}
        style={{ display: "none" }}
      />

      <EditorStudioTopBar>
        <Button type="button" data-variant="text" onClick={() => void pushRoute(router, ADMIN_POSTS_WORKSPACE_ROUTE)}>
          ← 나가기
        </Button>
        <EditorStudioTopBarActions>
          <EditorStudioViewSwitch role="tablist" aria-label="편집 화면 보기 모드">
            {editorStudioViewModeOptions.map((option) => (
              <ComposeViewSwitchButton
                key={option.value}
                type="button"
                role="tab"
                aria-selected={editorStudioViewMode === option.value}
                data-active={editorStudioViewMode === option.value}
                onClick={() => setEditorStudioViewMode(option.value)}
              >
                {option.icon === "split" ? (
                  <SplitViewGlyph aria-hidden="true">
                    <span />
                    <span />
                  </SplitViewGlyph>
                ) : (
                  <AppIcon name={option.icon} aria-hidden="true" />
                )}
                <span>{option.label}</span>
              </ComposeViewSwitchButton>
            ))}
          </EditorStudioViewSwitch>
          {composeStatusText ? <EditorStudioSaveState data-tone={composeStatusTone}>{composeStatusText}</EditorStudioSaveState> : null}
          <PrimaryButton
            type="button"
            disabled={publishActionTriggerDisabled}
            onClick={() => openPublishModal(editorPrimaryActionType)}
          >
            {editorPrimaryActionLabel}
          </PrimaryButton>
        </EditorStudioTopBarActions>
      </EditorStudioTopBar>

      <EditorStudioFrame $viewMode={editorStudioViewMode} $splitAvailable={isWideEditorViewport}>
        <EditorStudioWritingColumn $viewMode={editorStudioViewMode}>
          <EditorStudioMetaSection>
            <TitleInput
              ref={handleTitleFieldRef}
              id="post-title"
              placeholder="제목을 입력하세요"
              rows={1}
              value={postTitle}
              onChange={handleTitleChange}
              onKeyDown={handleTitleKeyDown}
            />
            <EditorTagRow aria-label="태그 입력">
              {postTags.map((tag) => (
                <SelectedTagChip key={tag} style={getTagToneStyle(tag)}>
                  <span className="label">{tag}</span>
                  <button type="button" onClick={() => removeTagFromPost(tag)} aria-label={`${tag} 삭제`}>
                    ×
                  </button>
                </SelectedTagChip>
              ))}
              <InlineMetaInput
                placeholder="태그 입력 후 Enter"
                value={tagDraft}
                onChange={(e) => {
                  const nextValue = e.target.value
                  const commaSeparated = /[,，]/
                  if (!commaSeparated.test(nextValue)) {
                    setTagDraft(nextValue)
                    return
                  }

                  const fragments = nextValue.split(commaSeparated)
                  const tailDraft = fragments.pop() ?? ""
                  const tagsToAdd = fragments.map((fragment) => fragment.trim()).filter(Boolean)
                  if (tagsToAdd.length > 0) addTagsToPost(tagsToAdd)
                  setTagDraft(tailDraft)
                }}
                onKeyDown={(e) => {
                  if (isComposingKeyboardEvent(e)) return
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault()
                    addTagToPost(e.currentTarget.value)
                  }
                }}
              />
            </EditorTagRow>
          </EditorStudioMetaSection>

          <EditorStudioCanvas>
            {BLOCK_EDITOR_V2_ENABLED ? (
              <LazyBlockEditorShell
                value={postContent}
                onChange={handleBlockEditorChange}
                onUploadImage={handleBlockEditorImageUpload}
                enableMermaidBlocks={BLOCK_EDITOR_V2_MERMAID_ENABLED}
                disabled={loadingKey.length > 0}
              />
            ) : (
              <>
                <EditorStudioLegacyToolbar role="toolbar" aria-label="기본 편집 도구">
                  <ToolbarIconButton type="button" title="제목" aria-label="제목" onClick={() => runToolbarAction(() => applyHeadingStyle(1))}>
                    <span className="textIcon">H1</span>
                  </ToolbarIconButton>
                  <ToolbarIconButton type="button" title="소제목" aria-label="소제목" onClick={() => runToolbarAction(() => applyHeadingStyle(2))}>
                    <span className="textIcon">H2</span>
                  </ToolbarIconButton>
                  <ToolbarIconButton type="button" title="굵게" aria-label="굵게" onClick={() => runToolbarAction(() => wrapSelection("**", "**", "굵은 텍스트"))}>
                    <span className="textIcon strong">B</span>
                  </ToolbarIconButton>
                  <ToolbarIconButton type="button" title="기울임" aria-label="기울임" onClick={() => runToolbarAction(() => wrapSelection("*", "*", "기울임 텍스트"))}>
                    <span className="textIcon italic">I</span>
                  </ToolbarIconButton>
                  <ToolbarIconButton type="button" title="목록" aria-label="목록" onClick={() => runToolbarAction(applyChecklist)}>
                    <AppIcon name="check-circle" />
                  </ToolbarIconButton>
                  <ToolbarIconButton type="button" title="코드 블록" aria-label="코드 블록" onClick={() => runToolbarAction(() => insertBlockSnippet(codeBlockTemplate))}>
                    <span className="textIcon code">{"{ }"}</span>
                  </ToolbarIconButton>
                </EditorStudioLegacyToolbar>
                <ContentInput
                  ref={postContentRef}
                  placeholder="당신의 이야기를 적어보세요..."
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  onScroll={schedulePreviewScrollSync}
                  onClick={schedulePreviewScrollSync}
                  onKeyUp={schedulePreviewScrollSync}
                  onSelect={schedulePreviewScrollSync}
                  onPaste={handlePasteFromHtml}
                />
              </>
            )}
          </EditorStudioCanvas>

          {!BLOCK_EDITOR_V2_ENABLED ? (
            <InlineDisclosure open={isComposeUtilityOpen}>
              <summary
                onClick={(event) => {
                  event.preventDefault()
                  setIsComposeUtilityOpen((prev) => !prev)
                }}
              >
                <strong>Markdown 편집</strong>
                <span>{isComposeUtilityOpen ? "닫기" : "열기"}</span>
              </summary>
              {isComposeUtilityOpen && (
                <div className="body">
                  <RawEditorSection>
                    <FieldLabel htmlFor="raw-markdown-editor">Markdown</FieldLabel>
                    <RawMarkdownTextarea
                      id="raw-markdown-editor"
                      value={postContent}
                      onChange={(e) => setPostContent(e.target.value)}
                      placeholder="당신의 이야기를 적어보세요..."
                    />
                    <SubActionRow>
                      <Button type="button" disabled={loadingKey.length > 0} onClick={() => saveLocalDraft()}>
                        임시 저장
                      </Button>
                      <Button type="button" disabled={loadingKey.length > 0} onClick={restoreLocalDraft}>
                        임시저장 불러오기
                      </Button>
                      <Button
                        type="button"
                        disabled={loadingKey.length > 0 || !localDraftSavedAt}
                        onClick={clearLocalDraft}
                      >
                        임시저장 삭제
                      </Button>
                    </SubActionRow>
                  </RawEditorSection>
                </div>
              )}
            </InlineDisclosure>
          ) : null}

          {shouldShowPublishNotice ? <PublishNotice data-tone={publishNotice.tone}>{publishNotice.text}</PublishNotice> : null}
        </EditorStudioWritingColumn>

        <EditorStudioPreviewColumn $viewMode={editorStudioViewMode} $splitAvailable={isWideEditorViewport}>
          <EditorStudioPreviewHeader $compact={isCompactSplitPreview}>
            <div>
              <strong>실시간 미리보기</strong>
              <span>{isCompactSplitPreview ? "집필 중 흐름만 가볍게 확인합니다." : "공개 글과 같은 흐름으로 확인합니다."}</span>
            </div>
            <PreviewViewportTabs role="tablist" aria-label="미리보기 기기 폭">
              {Object.entries(LIVE_PREVIEW_VIEWPORTS).map(([viewport, config]) => (
                <PreviewViewportButton
                  key={viewport}
                  type="button"
                  role="tab"
                  aria-selected={previewViewport === viewport}
                  data-active={previewViewport === viewport}
                  onClick={() => setPreviewViewport(viewport as PreviewViewportMode)}
                >
                  {config.label}
                </PreviewViewportButton>
              ))}
            </PreviewViewportTabs>
          </EditorStudioPreviewHeader>

          <EditorStudioPreviewSurface
            style={{ "--preview-live-width": livePreviewViewportConfig.maxWidth } as CSSProperties}
            data-preview-density={isCompactSplitPreview ? "compact" : "full"}
          >
            <EditorStudioPreviewArticle>
              {(previewThumbnailSrc || postTitle.trim() || resolvedPreviewSummary || postTags.length > 0) && (
                <EditorStudioPreviewArticleHeader $compact={isCompactSplitPreview}>
                  {!isCompactSplitPreview && previewThumbnailSrc ? (
                    <div className="cover">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewThumbnailSrc}
                        alt="미리보기 대표 이미지"
                        style={{
                          objectFit: "cover",
                          objectPosition: `${postThumbnailFocusX}% ${postThumbnailFocusY}%`,
                          transform: `scale(${postThumbnailZoom})`,
                          transformOrigin: `${postThumbnailFocusX}% ${postThumbnailFocusY}%`,
                        }}
                        onError={() => setIsPreviewThumbnailError(true)}
                      />
                    </div>
                  ) : null}
                  <h1>{postTitle.trim() || "제목을 입력하세요"}</h1>
                  {resolvedPreviewSummary ? <p className="summary">{resolvedPreviewSummary}</p> : null}
                  {!isCompactSplitPreview && postTags.length > 0 ? (
                    <div className="tags">
                      {postTags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  ) : null}
                  {!isCompactSplitPreview ? (
                    <div className="meta">
                      <span>{displayName}</span>
                      <span className="dot">·</span>
                      <span>{previewDateText}</span>
                      <span className="dot">·</span>
                      <span>{currentVisibilityText}</span>
                    </div>
                  ) : null}
                </EditorStudioPreviewArticleHeader>
              )}

              <EditorStudioPreviewArticleBody ref={previewScrollRef} $compact={isCompactSplitPreview}>
                <PreviewContentFrame $compact={isCompactSplitPreview}>
                  {isPreviewHeavyDocument && !isCompactSplitPreview ? (
                    <PreviewHintNotice>
                      긴 본문 보호 모드입니다. Mermaid는 코드 블록으로 렌더합니다.
                    </PreviewHintNotice>
                  ) : null}
                  <LazyMarkdownRenderer content={previewContent} disableMermaid={isPreviewHeavyDocument} />
                </PreviewContentFrame>
              </EditorStudioPreviewArticleBody>
            </EditorStudioPreviewArticle>
          </EditorStudioPreviewSurface>
        </EditorStudioPreviewColumn>
      </EditorStudioFrame>

      {shouldShowResultPanel ? (
        <EditorStudioResultPanel>
          <details open={Boolean(loadingKey)}>
            <summary>
              <strong>{loadingKey ? "작업 응답 확인 중" : "최근 작업 응답"}</strong>
              <span>{loadingKey ? `실행 중: ${loadingKey}` : "원본 응답을 확인할 수 있습니다"}</span>
            </summary>
            <ResultPanel>{result || "// API 응답 결과가 여기에 표시됩니다."}</ResultPanel>
          </details>
        </EditorStudioResultPanel>
      ) : null}

      {isPublishModalOpen && (
        <ModalBackdrop data-variant="drawer" onClick={closePublishModal}>
          <PublishModal data-variant="drawer" onClick={(e) => e.stopPropagation()}>
            <PublishModalHeader>
              <div>
                <h4>{publishActionTitle}</h4>
                <p>{publishActionDescription}</p>
              </div>
            </PublishModalHeader>
            <PublishModalBody>
              {shouldShowPublishModalNotice ? (
                <PublishNotice data-tone={publishModalNotice.tone}>{publishModalNotice.text}</PublishNotice>
              ) : null}
              <PublishOverviewGrid>
                <VisibilityCard>
                  <SectionKicker>노출 범위</SectionKicker>
                  <strong>누가 이 글을 볼 수 있나요?</strong>
                  <VisibilityOptionGrid role="group" aria-label="노출 범위 선택">
                    {PUBLISH_VISIBILITY_OPTIONS.map((option) => (
                      <VisibilityOptionButton
                        key={option.value}
                        type="button"
                        data-active={postVisibility === option.value}
                        aria-pressed={postVisibility === option.value}
                        onClick={() => setPostVisibility(option.value)}
                      >
                        <strong>{option.label}</strong>
                        <span>{option.description}</span>
                      </VisibilityOptionButton>
                    ))}
                  </VisibilityOptionGrid>
                  <FieldHelp>메인 피드 노출은 전체 공개에서만 활성화됩니다.</FieldHelp>
                </VisibilityCard>
                <PreviewResultPanel>
                  <PreviewResultHeader>
                    <div>
                      <SectionKicker>카드 미리보기</SectionKicker>
                      <strong>{previewViewportConfig.label}</strong>
                      <span>제목, 요약, 썸네일 잘림만 확인합니다.</span>
                    </div>
                    <PreviewViewportTabs role="tablist" aria-label="포스트 카드 미리보기 기기">
                      {PREVIEW_CARD_VIEWPORT_ORDER.map((viewport) => {
                        const viewportConfig = PREVIEW_CARD_VIEWPORTS[viewport]
                        return (
                          <PreviewViewportButton
                            key={viewport}
                            type="button"
                            role="tab"
                            aria-selected={previewViewport === viewport}
                            data-active={previewViewport === viewport}
                            onClick={() => setPreviewViewport(viewport)}
                          >
                            {viewportConfig.label}
                          </PreviewViewportButton>
                        )
                      })}
                    </PreviewViewportTabs>
                  </PreviewResultHeader>
                  <PreviewResultFrame style={{ maxWidth: `${previewViewportConfig.cardWidth}px` }}>
                    <PreviewResultCard>
                      <div className="thumbnail">
                        {previewThumbnailSrc ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={previewThumbnailSrc}
                            alt="실제 카드 기준 포스트 썸네일 미리보기"
                            style={{
                              objectFit: "cover",
                              objectPosition: `${postThumbnailFocusX}% ${postThumbnailFocusY}%`,
                              transform: `scale(${postThumbnailZoom})`,
                              transformOrigin: `${postThumbnailFocusX}% ${postThumbnailFocusY}%`,
                            }}
                            onError={() => setIsPreviewThumbnailError(true)}
                          />
                        ) : (
                          <div className="thumbnail-placeholder">
                            <em>썸네일 없음</em>
                            <span>본문 첫 이미지가 자동 카드 썸네일로 사용됩니다.</span>
                          </div>
                        )}
                      </div>
                      <div className="content">
                        <PreviewVisibilityBadge>{previewVisibilityLabel}</PreviewVisibilityBadge>
                        <h4>{postTitle.trim() || "제목을 입력하면 카드 결과가 여기에 표시됩니다."}</h4>
                        <p className="summary">
                          {resolvedPreviewSummary || "요약을 비워두면 본문에서 자동 생성한 요약이 카드에 반영됩니다."}
                        </p>
                        <div className="meta">
                          <span>{previewDateText}</span>
                          <span className="dot">·</span>
                          <span className="comment">
                            <AppIcon name="message" />
                            0개의 댓글
                          </span>
                        </div>
                        <div className="footer">
                          <div className="author">
                            <span className="avatar" aria-hidden="true">
                              {previewAuthorAvatarSrc ? (
                                <ProfileImage src={previewAuthorAvatarSrc} alt="" fillContainer />
                              ) : (
                                <span className="initial">{displayNameInitial}</span>
                              )}
                            </span>
                            <span className="by">by</span>
                            <strong>{displayName}</strong>
                          </div>
                          <div className="like">
                            <AppIcon name="heart" />
                            <span>0</span>
                          </div>
                        </div>
                      </div>
                    </PreviewResultCard>
                  </PreviewResultFrame>
                </PreviewResultPanel>
              </PublishOverviewGrid>

              <PostPreviewSetup>
                <PostPreviewHeader>
                  <strong>카드 요소 편집</strong>
                  <span>썸네일 위치와 카드 요약을 발행 전에 정리합니다.</span>
                </PostPreviewHeader>
                {isCompactMobileLayout ? (
                  <CompactPublishEditorStack>
                    <CompactPublishEditorCard>
                      <CompactPublishEditorToggle
                        type="button"
                        aria-expanded={isMobileThumbnailEditorOpen}
                        onClick={() => setIsMobileThumbnailEditorOpen((current) => !current)}
                      >
                        <div>
                          <strong>썸네일 위치 조정</strong>
                          <span>드래그/확대로 카드 크롭을 빠르게 맞춥니다.</span>
                        </div>
                        <span>{isMobileThumbnailEditorOpen ? "닫기" : "열기"}</span>
                      </CompactPublishEditorToggle>
                      {isMobileThumbnailEditorOpen ? thumbnailEditorPanel : null}
                    </CompactPublishEditorCard>
                    <CompactPublishEditorCard>
                      <CompactPublishEditorToggle
                        type="button"
                        aria-expanded={isMobileMetaEditorOpen}
                        onClick={() => setIsMobileMetaEditorOpen((current) => !current)}
                      >
                        <div>
                          <strong>카드 메타 편집</strong>
                          <span>썸네일 URL과 요약만 따로 정리합니다.</span>
                        </div>
                        <span>{isMobileMetaEditorOpen ? "닫기" : "열기"}</span>
                      </CompactPublishEditorToggle>
                      {isMobileMetaEditorOpen ? previewMetaEditorPanel : null}
                    </CompactPublishEditorCard>
                  </CompactPublishEditorStack>
                ) : (
                  <PreviewEditorGrid>
                    {thumbnailEditorPanel}
                    {previewMetaEditorPanel}
                  </PreviewEditorGrid>
                )}
              </PostPreviewSetup>
            </PublishModalBody>
            <PublishModalFooter>
              <Button
                type="button"
                disabled={
                  loadingKey === "writePost" ||
                  loadingKey === "modifyPost" ||
                  loadingKey === "publishTempPost" ||
                  loadingKey === "recommendTags"
                }
                onClick={closePublishModal}
              >
                닫기
              </Button>
              <PrimaryButton type="button" disabled={publishActionButtonDisabled} onClick={() => void handleConfirmPublish()}>
                {publishActionButtonText}
              </PrimaryButton>
            </PublishModalFooter>
          </PublishModal>
        </ModalBackdrop>
      )}
      </EditorStudioRoot>
    )
  }

  return (
    <Main>
      <HeroCard data-compact-manage={isCompactManageSurface}>
        <HeroIntro data-compact-manage={isCompactManageSurface}>
          <h1>{composePageTitle}</h1>
          <p>제목과 본문에 집중하고, 발행 전 설정은 오른쪽에서 차분하게 마무리합니다.</p>
          <StudioStatusStrip aria-label="글 작업실 상태 요약">
            <StudioStatusItem>
              <span>현재 작업</span>
              <strong>{composePageTitle}</strong>
            </StudioStatusItem>
            {currentPostLabel ? (
              <StudioStatusItem>
                <span>원고</span>
                <strong>{currentPostLabel}</strong>
              </StudioStatusItem>
            ) : null}
            <StudioStatusItem data-optional="true">
              <span>공개 범위</span>
              <strong>{currentVisibilityText}</strong>
            </StudioStatusItem>
            {composeStatusText ? (
              <StudioStatusItem data-optional="true">
                <span>저장 상태</span>
                <strong>{composeStatusText}</strong>
              </StudioStatusItem>
            ) : null}
          </StudioStatusStrip>
        </HeroIntro>
      </HeroCard>

      <WorkspaceGrid>
        <WorkspaceMain>
          {SHOW_LEGACY_PROFILE_STUDIO && (
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
                    <ProfileImage
                      className="previewImage"
                      src={profilePreviewSrc}
                      alt="profile preview"
                      width={120}
                      height={120}
                      priority
                    />
                  ) : (
                    <ProfileFallback>{displayNameInitial}</ProfileFallback>
                  )}
                </ProfilePreview>
                <ProfileSummary>
                  <strong>{displayName}</strong>
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
                <InlineStatus data-tone={profileImageNotice.tone}>{profileImageNotice.text}</InlineStatus>
              </ProfileCardPanel>

              <FormPanelCard>
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
                    <label>최종 수정 시각</label>
                    <strong>{profileUpdatedText}</strong>
                  </ProfileCurrentItem>
                </ProfileCurrentGrid>
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
                    <ProfileBioTextArea
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
                        if (!member.id) throw new Error("현재 관리자 정보를 확인할 수 없습니다.")
                        setProfileNotice({ tone: "loading", text: "현재 저장값을 다시 불러오는 중입니다..." })
                        const refreshed = await refreshAdminProfile(member.id, member)
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
                <InlineStatus data-tone={profileNotice.tone}>{profileNotice.text}</InlineStatus>
              </FormPanelCard>
            </ProfileStudioGrid>
          </Section>
          )}

          {SHOW_LEGACY_CONTENT_STUDIO && (
          <Section id="content-studio">
            <SectionTop>
              <div>
                <h2>글 목록 관리</h2>
                <SectionDescription>조회·선택·편집만 남겨 정리에 집중합니다.</SectionDescription>
              </div>
            </SectionTop>
            {shouldShowGlobalNotice ? (
              <GlobalNoticeBar data-tone={globalNotice.tone}>{globalNotice.text}</GlobalNoticeBar>
            ) : null}
            <MobileStudioStepper role="tablist" aria-label="모바일 작업 단계">
              {mobileStudioSurfaceSteps.map((step) => (
                <button
                  key={step}
                  type="button"
                  role="tab"
                  aria-selected={activeMobileStudioStep === step}
                  data-active={activeMobileStudioStep === step}
                  onClick={() => setActiveMobileStudioStep(step)}
                >
                  {MOBILE_STUDIO_STEP_LABEL[step]}
                </button>
              ))}
            </MobileStudioStepper>
            {isCompactMobileLayout ? (
              <MobileStepGuide role="status" aria-live="polite">
                <strong>{`현재 단계: ${MOBILE_STUDIO_STEP_LABEL[activeMobileStudioStep]}`}</strong>
                <p>{MOBILE_STUDIO_STEP_DESCRIPTION[activeMobileStudioStep]}</p>
                <div>
                  <Button
                    type="button"
                    disabled={!mobileStudioPrevStep}
                    onClick={() => {
                      if (!mobileStudioPrevStep) return
                      setActiveMobileStudioStep(mobileStudioPrevStep)
                    }}
                  >
                    {mobileStudioPrevStepLabel}
                  </Button>
                  <PrimaryButton
                    type="button"
                    disabled={!mobileStudioNextStep}
                    onClick={() => {
                      if (!mobileStudioNextStep) return
                      setActiveMobileStudioStep(mobileStudioNextStep)
                    }}
                  >
                    {mobileStudioNextStepLabel}
                  </PrimaryButton>
                </div>
              </MobileStepGuide>
            ) : null}
            <ContentStudioGrid>
              <ContentStudioLeft
                data-mobile-visible={!isCompactMobileLayout || activeMobileStudioStep === "query" || activeMobileStudioStep === "list"}
              >
                <QueryPanel data-mobile-visible={!isCompactMobileLayout || activeMobileStudioStep === "query"}>
                  <QueryHeader>
                    <h3>글 목록 조회 조건</h3>
                    <p>
                      {listScope === "active"
                        ? "최근 글을 빠르게 다시 열고 필요한 경우만 고급 조건을 펼쳐 조회합니다."
                        : "삭제 글만 확인하고 복구 대상을 고릅니다."}
                    </p>
                    <ListScopeTabs>
                      <ListScopeButton
                        type="button"
                        data-active={listScope === "active"}
                        onClick={() => setListScope("active")}
                      >
                        활성 글
                      </ListScopeButton>
                      <ListScopeButton
                        type="button"
                        data-active={listScope === "deleted"}
                        onClick={() => setListScope("deleted")}
                      >
                        삭제 글
                      </ListScopeButton>
                    </ListScopeTabs>
                  </QueryHeader>
                  <FieldBox>
                    <FieldLabel htmlFor="list-kw">검색어</FieldLabel>
                    <Input
                      id="list-kw"
                      placeholder={listScope === "active" ? "제목/본문 키워드" : "삭제된 글 제목/본문 키워드"}
                      value={listKw}
                      onChange={(e) => setListKw(e.target.value)}
                    />
                  </FieldBox>

                  <QueryActions>
                    <PrimaryButton
                      disabled={disabled("postList")}
                      onClick={() => void loadAdminPosts()}
                    >
                      {listScope === "active" ? "목록 새로고침" : "삭제 글 조회"}
                    </PrimaryButton>
                    {listScope === "active" && (
                      <Button disabled={disabled("postTemp")} onClick={() => void handleLoadOrCreateTempPost()}>
                        임시 저장 열기
                      </Button>
                    )}
                  </QueryActions>
                  {listScope === "active" && (
                    <PresetRow role="group" aria-label="빠른 프리셋">
                      <PresetButton
                        type="button"
                        data-active={listQuickPreset === "today"}
                        onClick={() => applyListQuickPreset("today")}
                      >
                        오늘 수정
                      </PresetButton>
                      <PresetButton
                        type="button"
                        data-active={listQuickPreset === "temp"}
                        onClick={() => applyListQuickPreset("temp")}
                      >
                        임시 저장
                      </PresetButton>
                      {hasListFiltersApplied && (
                        <PresetButton
                          type="button"
                          data-active={false}
                          onClick={() => {
                            setListQuickPreset("none")
                            setListKw("")
                            setListPage("1")
                            setListPageSize("30")
                            setListSort("CREATED_AT")
                          }}
                        >
                          조건 초기화
                        </PresetButton>
                      )}
                    </PresetRow>
                  )}
                  <InlineDisclosure open={isListAdvancedOpen}>
                    <summary onClick={(event) => {
                      event.preventDefault()
                      setIsListAdvancedOpen((prev) => !prev)
                    }}>
                      <strong>고급 조회 옵션</strong>
                      <span>{isListAdvancedOpen ? "닫기" : "열기"}</span>
                    </summary>
                    {isListAdvancedOpen && (
                      <div className="body">
                        <QueryGrid>
                          <FieldBox className="listPage">
                            <FieldLabel htmlFor="list-page">페이지</FieldLabel>
                            <Input
                              id="list-page"
                              type="number"
                              inputMode="numeric"
                              min={1}
                              placeholder="예: 1"
                              value={listPage}
                              onChange={handleListPageChange}
                            />
                          </FieldBox>
                          <FieldBox className="listPageSize">
                            <FieldLabel htmlFor="list-page-size">페이지 크기</FieldLabel>
                            <Input
                              id="list-page-size"
                              type="number"
                              inputMode="numeric"
                              min={1}
                              max={30}
                              placeholder="1~30"
                              value={listPageSize}
                              onChange={handleListPageSizeChange}
                            />
                          </FieldBox>
                          {listScope === "active" && (
                            <FieldBox className="listSort">
                              <FieldLabel htmlFor="list-sort">정렬 기준</FieldLabel>
                              <FieldSelect
                                id="list-sort"
                                value={listSort}
                                onChange={handleListSortChange}
                              >
                                {LIST_SORT_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </FieldSelect>
                            </FieldBox>
                          )}
                        </QueryGrid>
                      </div>
                    )}
                  </InlineDisclosure>
                </QueryPanel>

              <ListPanel data-mobile-visible={!isCompactMobileLayout || activeMobileStudioStep === "list"}>
                <ListHeader>
                  <h3>{listScope === "active" ? "관리자 글 리스트" : "삭제 글 리스트"}</h3>
                  <ListHeaderActions>
                    <span>{selectedPostIds.length > 0 ? `${selectedPostIds.length}개 선택` : `총 ${adminPostTotal}건`}</span>
                    {listScope === "active" ? (
                      adminPostViewRows.length > 0 ? (
                        <Button
                          type="button"
                          disabled={loadingKey.length > 0}
                          onClick={toggleSelectAllVisiblePosts}
                        >
                          {isAllVisiblePostsSelected ? "현재 목록 선택 해제" : "현재 목록 전체 선택"}
                        </Button>
                      ) : null
                    ) : (
                      <ReadOnlyHint>삭제 글은 복구 또는 영구삭제로 정리할 수 있습니다.</ReadOnlyHint>
                    )}
                  </ListHeaderActions>
                </ListHeader>
                {listScope === "active" && selectedPostIds.length > 0 && (
                  <SelectionStickyBar role="status" aria-live="polite">
                    <strong>{selectedPostIds.length}개 선택됨</strong>
                    <div>
                      <Button type="button" onClick={() => setSelectedPostIds([])} disabled={loadingKey.length > 0}>
                        선택 해제
                      </Button>
                      <Button
                        type="button"
                        data-variant="danger"
                        disabled={loadingKey.length > 0}
                        onClick={() => openDeleteConfirm(selectedPostIds)}
                      >
                        선택 삭제
                      </Button>
                    </div>
                  </SelectionStickyBar>
                )}
                {adminPostRows.length === 0 ? (
                  <ListEmpty>
                    <p>
                      {listScope === "active"
                        ? "목록이 없습니다. 위 조회 조건에서 목록 새로고침을 눌러 시작하세요."
                        : "삭제된 글이 없습니다. 삭제 글 목록을 조회해 최신 상태를 확인하세요."}
                    </p>
                    <div className="actions">
                      <PrimaryButton
                        type="button"
                        disabled={disabled("postList")}
                        onClick={() => void loadAdminPosts()}
                      >
                        {listScope === "active" ? "목록 새로고침" : "삭제 글 목록 조회"}
                      </PrimaryButton>
                    </div>
                  </ListEmpty>
                ) : (
                  <>
                    <ListTableWrap>
                      <ListTable>
                      <thead>
                        <tr>
                          {listScope === "active" && (
                            <th className="checkboxCell">
                              <input
                                type="checkbox"
                                aria-label="현재 목록 전체 선택"
                                checked={isAllVisiblePostsSelected}
                                onChange={toggleSelectAllVisiblePosts}
                              />
                            </th>
                          )}
                          <th className="idCell">ID</th>
                          <th>제목</th>
                          <th className="dateCell">
                            {listScope === "active" ? (
                              <SortHeaderButton
                                type="button"
                                onClick={() =>
                                  setModifiedSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))
                                }
                              >
                                수정일 {modifiedSortOrder === "desc" ? "↓" : "↑"}
                              </SortHeaderButton>
                            ) : (
                              "삭제일"
                            )}
                          </th>
                          <th className="actionsCell">작업</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminPostViewRows.map((row) => {
                          const isLoadedRow = listScope === "active" && editorMode === "edit" && postId.trim() === String(row.id)
                          return (
                            <tr key={row.id} data-active={isLoadedRow}>
                              {listScope === "active" && (
                                <td className="checkboxCell">
                                  <input
                                    type="checkbox"
                                    aria-label={`${row.id}번 글 선택`}
                                    checked={selectedPostIdSet.has(row.id)}
                                    onChange={() => togglePostSelection(row.id)}
                                  />
                                </td>
                              )}
                              <td className="idCell">{row.id}</td>
                              <td className="title">
                                <TitleCell>
                                  <div className="titleMain">
                                    <span className="text">{row.title}</span>
                                    {isLoadedRow && <LoadedBadge>현재 편집 중</LoadedBadge>}
                                    {listScope === "deleted" && <DeletedBadge>삭제됨</DeletedBadge>}
                                    <VisibilityBadge className="inlineVisibility" data-tone={toVisibility(row.published, row.listed)}>
                                      {visibilityLabel(row.published, row.listed)}
                                    </VisibilityBadge>
                                  </div>
                                  <span className="meta">{row.authorName || "작성자 미상"}</span>
                                </TitleCell>
                              </td>
                              <td className="dateCell">{(listScope === "deleted" ? row.deletedAt : row.modifiedAt)?.slice(0, 10) || "-"}</td>
                              <td className="actionsCell">
                                <InlineActions>
                                  {listScope === "active" ? (
                                    <>
                                      <RowActionButton
                                        type="button"
                                        data-variant="primary"
                                        disabled={loadingKey.length > 0}
                                        onClick={() => {
                                          setPostId(String(row.id))
                                          void loadPostForEditor(String(row.id))
                                        }}
                                      >
                                        <AppIcon name="edit" />
                                        <span>{isLoadedRow ? "계속 편집" : "편집"}</span>
                                      </RowActionButton>
                                      <RowActionMenu>
                                        <summary>
                                          <span>더보기</span>
                                          <AppIcon name="chevron-down" />
                                        </summary>
                                        <div className="menu">
                                          <button
                                            type="button"
                                            disabled={loadingKey.length > 0}
                                            onClick={() => openDeleteConfirm([row.id], row.title)}
                                          >
                                            삭제
                                          </button>
                                        </div>
                                      </RowActionMenu>
                                    </>
                                  ) : (
                                    <>
                                      <RowActionButton
                                        type="button"
                                        data-variant="primary"
                                        disabled={loadingKey.length > 0}
                                        onClick={() => void restoreDeletedPostFromList(row)}
                                      >
                                        <AppIcon name="check-circle" />
                                        <span>복구</span>
                                      </RowActionButton>
                                      <RowActionMenu>
                                        <summary>
                                          <span>더보기</span>
                                          <AppIcon name="chevron-down" />
                                        </summary>
                                        <div className="menu">
                                          <button
                                            type="button"
                                            disabled={loadingKey.length > 0}
                                            onClick={() => void hardDeleteDeletedPostFromList(row)}
                                          >
                                            영구삭제
                                          </button>
                                        </div>
                                      </RowActionMenu>
                                    </>
                                  )}
                                </InlineActions>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      </ListTable>
                    </ListTableWrap>

                    <MobileListCards>
                      {adminPostViewRows.map((row) => {
                        const isLoadedRow = listScope === "active" && editorMode === "edit" && postId.trim() === String(row.id)
                        return (
                        <article key={`mobile-${row.id}`} data-active={isLoadedRow}>
                          <header>
                            <div className="metaLeading">
                              {listScope === "active" && (
                                <input
                                  type="checkbox"
                                  aria-label={`${row.id}번 글 선택`}
                                  checked={selectedPostIdSet.has(row.id)}
                                  onChange={() => togglePostSelection(row.id)}
                                />
                              )}
                              <span className="rowId">#{row.id}</span>
                            </div>
                            {isLoadedRow ? <LoadedBadge>현재 편집 중</LoadedBadge> : null}
                          </header>
                          <h4>{row.title}</h4>
                          <p className="metaLine">
                            <span>
                              {row.authorName}
                              <span className="dot">•</span>
                              {(listScope === "deleted" ? row.deletedAt : row.modifiedAt)?.slice(0, 10) || "-"}
                            </span>
                            <VisibilityBadge data-tone={toVisibility(row.published, row.listed)}>
                              {visibilityLabel(row.published, row.listed)}
                            </VisibilityBadge>
                          </p>
                          <div className="mainAction">
                            {listScope === "active" ? (
                              <>
                                <RowActionButton
                                  type="button"
                                  data-variant="primary"
                                  disabled={loadingKey.length > 0}
                                  onClick={() => {
                                    setPostId(String(row.id))
                                    void loadPostForEditor(String(row.id))
                                  }}
                                >
                                  <AppIcon name="edit" />
                                  <span>{isLoadedRow ? "계속 편집" : "편집"}</span>
                                </RowActionButton>
                                <RowActionMenu>
                                  <summary>
                                    <span>더보기</span>
                                    <AppIcon name="chevron-down" />
                                  </summary>
                                  <div className="menu">
                                    <button
                                      type="button"
                                      disabled={loadingKey.length > 0}
                                      onClick={() => openDeleteConfirm([row.id], row.title)}
                                    >
                                      삭제
                                    </button>
                                  </div>
                                </RowActionMenu>
                              </>
                            ) : (
                              <>
                                <RowActionButton
                                  type="button"
                                  data-variant="primary"
                                  disabled={loadingKey.length > 0}
                                  onClick={() => void restoreDeletedPostFromList(row)}
                                >
                                  <AppIcon name="check-circle" />
                                  <span>복구</span>
                                </RowActionButton>
                                <RowActionMenu>
                                  <summary>
                                    <span>더보기</span>
                                    <AppIcon name="chevron-down" />
                                  </summary>
                                  <div className="menu">
                                    <button
                                      type="button"
                                      disabled={loadingKey.length > 0}
                                      onClick={() => void hardDeleteDeletedPostFromList(row)}
                                    >
                                      영구삭제
                                    </button>
                                  </div>
                                </RowActionMenu>
                              </>
                            )}
                          </div>
                        </article>
                      )})}
                    </MobileListCards>
                  </>
                )}
                {listScope === "deleted" && deletedListNotice.text && (
                  <InlineStatus data-tone={deletedListNotice.tone}>{deletedListNotice.text}</InlineStatus>
                )}
              </ListPanel>
              </ContentStudioLeft>

              <SelectedPostPanel data-mobile-visible={showSelectedPanelInManageSurface}>
                <SelectedPostHeader>
                  <div>
                    <h3>{hasSelectedManagedPost ? "선택한 글" : "빠른 작업"}</h3>
                    <p>
                      {hasSelectedManagedPost
                        ? "선택한 글만 바로 이어서 다룹니다."
                        : "새 글 작성이나 번호 불러오기만 남깁니다."}
                    </p>
                  </div>
                  <SelectedPostBadge>{`${editorModeLabel} · ${selectedPostLabel}`}</SelectedPostBadge>
                </SelectedPostHeader>
                {hasSelectedManagedPost ? (
                  <>
                    <SelectedPostStateCard data-tone="active">
                      <div className="headline">
                        <strong>{postTitle.trim() || "제목 없음"}</strong>
                        {isTempDraftMode ? (
                          <LoadedBadge>임시 저장</LoadedBadge>
                        ) : (
                          <VisibilityBadge data-tone={postVisibility}>{currentVisibilityText}</VisibilityBadge>
                        )}
                      </div>
                      <p>추가 작업은 필요할 때만 엽니다.</p>
                      <div className="meta">
                        <span>{`post id #${postId}`}</span>
                        <span>{`버전 ${postVersion ?? "-"}`}</span>
                      </div>
                    </SelectedPostStateCard>
                    <ActionRow>
                      <PrimaryButton
                        type="button"
                        disabled={editorMode !== "edit" || disabled("modifyPost")}
                        onClick={() => openPublishModal("modify")}
                      >
                        편집 계속
                      </PrimaryButton>
                      <Button
                        type="button"
                        disabled={loadingKey.length > 0}
                        onClick={() => switchToCreateMode({ keepContent: false })}
                      >
                        새 글 작성
                      </Button>
                      <Button
                        type="button"
                        data-variant="danger"
                        disabled={disabled("deletePost")}
                        onClick={() => openDeleteConfirm([Number.parseInt(postId, 10)], postTitle)}
                      >
                        글 삭제
                      </Button>
                    </ActionRow>
                    <InlineDisclosure open={isDirectLoadOpen}>
                      <summary
                        onClick={(event) => {
                          event.preventDefault()
                          setIsDirectLoadOpen((prev) => !prev)
                        }}
                      >
                        <strong>다른 글 직접 불러오기</strong>
                        <span>{isDirectLoadOpen ? "닫기" : "열기"}</span>
                      </summary>
                      {isDirectLoadOpen && (
                        <div className="body">
                          <SelectedPostGrid>
                            <FieldBox>
                              <FieldLabel htmlFor="selected-post-id">post id</FieldLabel>
                              <Input
                                id="selected-post-id"
                                placeholder="예: 1"
                                value={postId}
                                onChange={(e) => {
                                  const nextId = e.target.value.trim()
                                  setPostId(nextId)
                                  if (nextId !== postId.trim()) {
                                    setEditorMode("create")
                                    setPostVersion(null)
                                    setIsTempDraftMode(false)
                                  }
                                }}
                              />
                            </FieldBox>
                          </SelectedPostGrid>
                          <SelectedPostHint>번호를 알고 있을 때만 씁니다.</SelectedPostHint>
                          <ActionRow>
                            <Button
                              type="button"
                              disabled={disabled("postOne")}
                              onClick={() => void loadPostForEditor()}
                            >
                              글 불러오기
                            </Button>
                          </ActionRow>
                        </div>
                      )}
                    </InlineDisclosure>
                    <InlineDisclosure open={isSelectedToolsOpen}>
                      <summary
                        onClick={(event) => {
                          event.preventDefault()
                          setIsSelectedToolsOpen((prev) => !prev)
                        }}
                      >
                        <strong>진단 도구</strong>
                        <span>{isSelectedToolsOpen ? "닫기" : "열기"}</span>
                      </summary>
                      {isSelectedToolsOpen && (
                        <div className="body">
                          <SelectedPostHint>진단이 필요할 때만 실행합니다.</SelectedPostHint>
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
                                run("likePost", () => apiFetch(`/post/api/v1/posts/${postId}/like`, { method: "PUT" }))
                              }
                            >
                              좋아요 반영 테스트
                            </Button>
                          </SubActionRow>
                        </div>
                      )}
                    </InlineDisclosure>
                  </>
                ) : (
                  <>
                    <SelectedPostStateCard data-tone="idle">
                      <strong>목록에서 글을 고르면 바로 이어집니다.</strong>
                      <p>새 글 작성이나 번호 불러오기만 사용합니다.</p>
                    </SelectedPostStateCard>
                    <ActionRow>
                      <PrimaryButton
                        type="button"
                        disabled={loadingKey.length > 0}
                        onClick={() => switchToCreateMode({ keepContent: false })}
                      >
                        새 글 작성 시작
                      </PrimaryButton>
                    </ActionRow>
                    <InlineDisclosure open={isDirectLoadOpen}>
                      <summary
                        onClick={(event) => {
                          event.preventDefault()
                          setIsDirectLoadOpen((prev) => !prev)
                        }}
                      >
                        <strong>post id 직접 불러오기</strong>
                        <span>{isDirectLoadOpen ? "닫기" : "열기"}</span>
                      </summary>
                      {isDirectLoadOpen && (
                        <div className="body">
                          <SelectedPostGrid>
                            <FieldBox>
                              <FieldLabel htmlFor="selected-post-id">post id</FieldLabel>
                              <Input
                                id="selected-post-id"
                                placeholder="예: 1"
                                value={postId}
                                onChange={(e) => {
                                  const nextId = e.target.value.trim()
                                  setPostId(nextId)
                                  if (nextId !== postId.trim()) {
                                    setEditorMode("create")
                                    setPostVersion(null)
                                    setIsTempDraftMode(false)
                                  }
                                }}
                              />
                            </FieldBox>
                          </SelectedPostGrid>
                          <SelectedPostHint>특정 글 번호를 알고 있을 때만 씁니다.</SelectedPostHint>
                          <ActionRow>
                            <Button
                              type="button"
                              disabled={disabled("postOne")}
                              onClick={() => void loadPostForEditor()}
                            >
                              글 불러오기
                            </Button>
                          </ActionRow>
                        </div>
                      )}
                    </InlineDisclosure>
                  </>
                )}
              </SelectedPostPanel>
            </ContentStudioGrid>

            {softDeleteUndoState && (
              <UndoToast role="status" aria-live="polite">
                <p>{softDeleteUndoState?.message}</p>
                <Button type="button" onClick={() => void handleUndoSoftDelete()} disabled={disabled("undoDeletePost")}>
                  실행 취소
                </Button>
              </UndoToast>
            )}
          </Section>
          )}

        {deleteConfirmState && (
          <ModalBackdrop onClick={closeDeleteConfirm}>
            <ConfirmModal onClick={(e) => e.stopPropagation()}>
              <div className="header">
                <h4>글 삭제 확인</h4>
                <p>
                  정말 삭제할까요?
                  <br />
                  <strong>{deleteConfirmState?.headline}</strong>
                </p>
              </div>
              {deleteConfirmNotice.text ? (
                <PublishNotice data-tone={deleteConfirmNotice.tone}>{deleteConfirmNotice.text}</PublishNotice>
              ) : null}
              <div className="actions">
                <Button
                  type="button"
                  disabled={loadingKey === "deletePost"}
                  onClick={closeDeleteConfirm}
                >
                  취소
                </Button>
                <PrimaryButton
                  type="button"
                  disabled={loadingKey === "deletePost"}
                  onClick={async () => {
                    const ok = await deletePostsFromList(deleteConfirmState?.ids || [])
                    if (ok) closeDeleteConfirm()
                  }}
                >
                  {loadingKey === "deletePost" ? "삭제 중..." : "삭제 확정"}
                </PrimaryButton>
              </div>
            </ConfirmModal>
          </ModalBackdrop>
        )}
        {studioSurface === "compose" && (
        <ComposeSurfaceSection>
        <EditorSection data-mobile-visible={!isCompactMobileLayout || studioSurface === "compose"}>
          <ComposeStudioLayout>
            <ComposeMainColumn>
              <ComposeStudioHeader>
                <ComposeStudioHeaderCopy>
                  <ComposeStudioKicker>{editorModeLabel}</ComposeStudioKicker>
                  <h2>{composePageTitle}</h2>
                  <p>{composeSurfaceSubtitle}</p>
                </ComposeStudioHeaderCopy>
                <ComposeStudioContextBar aria-label="원고 상태">
                  {composeStatusText ? (
                    <ComposeStudioContextItem data-tone={composeStatusTone}>
                      <span>상태</span>
                      <strong>{composeStatusText}</strong>
                    </ComposeStudioContextItem>
                  ) : null}
                  <ComposeStudioContextItem>
                    <span>공개 범위</span>
                    <strong>{currentVisibilityText}</strong>
                  </ComposeStudioContextItem>
                  <ComposeStudioContextItem>
                    <span>카드 요약</span>
                    <strong>{postSummary.trim() ? `${postSummary.trim().length}자` : "자동 생성"}</strong>
                  </ComposeStudioContextItem>
                </ComposeStudioContextBar>
              </ComposeStudioHeader>

              <ComposeReadableIntro>
                <WriterHeader>
                  <div className="titleField">
                    <TitleInput
                      ref={handleTitleFieldRef}
                      id="post-title"
                      placeholder="제목을 입력하세요"
                      rows={1}
                      value={postTitle}
                      onChange={handleTitleChange}
                      onKeyDown={handleTitleKeyDown}
                    />
                    <WriterAccent />
                  </div>
                </WriterHeader>
                <ComposeSummaryField>
                  <FieldLabel htmlFor="post-summary-inline">요약</FieldLabel>
                  <ComposeSummaryInput
                    id="post-summary-inline"
                    placeholder="이 글의 핵심을 짧게 정리하세요"
                    value={postSummary}
                    maxLength={PREVIEW_SUMMARY_MAX_LENGTH}
                    onChange={(e) => setPostSummary(e.target.value)}
                  />
                  <ComposeSummaryMeta>
                    <SummaryCounter>
                      {postSummary.length}/{PREVIEW_SUMMARY_MAX_LENGTH}
                    </SummaryCounter>
                    <Button
                      type="button"
                      disabled={!postContent.trim()}
                      onClick={() => setPostSummary(makePreviewSummary(postContent))}
                    >
                      본문 기준으로 채우기
                    </Button>
                  </ComposeSummaryMeta>
                </ComposeSummaryField>
                <InlineTagComposer>
                  <div className="headerRow">
                    <span className="label">태그</span>
                  </div>
                  <InlineTagList>
                    {postTags.map((tag) => (
                      <SelectedTagChip key={tag} style={getTagToneStyle(tag)}>
                        <span className="label">{tag}</span>
                        <button type="button" onClick={() => removeTagFromPost(tag)} aria-label={`${tag} 삭제`}>
                          ×
                        </button>
                      </SelectedTagChip>
                    ))}
                    <InlineMetaInput
                      placeholder="태그 입력 후 Enter"
                      value={tagDraft}
                      onChange={(e) => {
                        const nextValue = e.target.value
                        const commaSeparated = /[,，]/
                        if (!commaSeparated.test(nextValue)) {
                          setTagDraft(nextValue)
                          return
                        }

                        const fragments = nextValue.split(commaSeparated)
                        const tailDraft = fragments.pop() ?? ""
                        const tagsToAdd = fragments.map((fragment) => fragment.trim()).filter(Boolean)
                        if (tagsToAdd.length > 0) addTagsToPost(tagsToAdd)
                        setTagDraft(tailDraft)
                      }}
                      onKeyDown={(e) => {
                        if (isComposingKeyboardEvent(e)) return
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault()
                          addTagToPost(e.currentTarget.value)
                        }
                      }}
                    />
                  </InlineTagList>
                </InlineTagComposer>
              </ComposeReadableIntro>

              <input
                ref={postImageFileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePostImageFileChange}
                style={{ display: "none" }}
              />
              <input
                ref={thumbnailImageFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleThumbnailImageFileChange}
                style={{ display: "none" }}
              />

              {BLOCK_EDITOR_V2_ENABLED ? (
                <ComposeBodySection>
                  <ComposeBodyHeader>
                    <ComposeBodyTitleGroup>
                      <h3>본문</h3>
                    </ComposeBodyTitleGroup>
                    <ComposeBodyMetrics>
                      <span>{contentLength.toLocaleString()}자</span>
                      <span>{lineCount}줄</span>
                      <span>{imageCount}개 이미지</span>
                    </ComposeBodyMetrics>
                  </ComposeBodyHeader>
                  <LazyBlockEditorShell
                    value={postContent}
                    onChange={handleBlockEditorChange}
                    onUploadImage={handleBlockEditorImageUpload}
                    enableMermaidBlocks={BLOCK_EDITOR_V2_MERMAID_ENABLED}
                    disabled={loadingKey.length > 0}
                  />
                </ComposeBodySection>
              ) : (
                <>
                  <ComposeBodySection>
                    <ComposeBodyHeader>
                      <ComposeBodyTitleGroup>
                        <h3>본문</h3>
                      </ComposeBodyTitleGroup>
                      <ComposeBodyMetrics>
                        <span>{contentLength.toLocaleString()}자</span>
                        <span>{lineCount}줄</span>
                        <span>{imageCount}개 이미지</span>
                      </ComposeBodyMetrics>
                    </ComposeBodyHeader>
                    <EditorToolbar>
              <ToolbarQuickBar role="toolbar" aria-label="글쓰기 서식 툴바">
                  <ToolbarCluster>
                    <ToolbarIconButton type="button" title="제목1" aria-label="제목1" onClick={() => runToolbarAction(() => applyHeadingStyle(1))}>
                      <span className="textIcon">H1</span>
                    </ToolbarIconButton>
                    <ToolbarIconButton type="button" title="제목2" aria-label="제목2" onClick={() => runToolbarAction(() => applyHeadingStyle(2))}>
                      <span className="textIcon">H2</span>
                    </ToolbarIconButton>
                    <ToolbarIconButton type="button" title="제목3" aria-label="제목3" onClick={() => runToolbarAction(() => applyHeadingStyle(3))}>
                      <span className="textIcon">H3</span>
                    </ToolbarIconButton>
                    <ToolbarIconButton type="button" title="일반 텍스트" aria-label="일반 텍스트" onClick={() => runToolbarAction(() => applyHeadingStyle(0))}>
                      <span className="textIcon">T</span>
                    </ToolbarIconButton>
                  </ToolbarCluster>

                  <ToolbarDivider aria-hidden="true" />

                  <ToolbarCluster>
                    <ToolbarIconButton type="button" title="굵게" aria-label="굵게" onClick={() => runToolbarAction(() => wrapSelection("**", "**", "굵은 텍스트"))}>
                      <span className="textIcon strong">B</span>
                    </ToolbarIconButton>
                    <ToolbarIconButton type="button" title="기울임" aria-label="기울임" onClick={() => runToolbarAction(() => wrapSelection("*", "*", "기울임 텍스트"))}>
                      <span className="textIcon italic">I</span>
                    </ToolbarIconButton>
                    <ToolbarIconButton type="button" title="취소선" aria-label="취소선" onClick={() => runToolbarAction(() => wrapSelection("~~", "~~", "취소선 텍스트"))}>
                      <span className="textIcon strike">S</span>
                    </ToolbarIconButton>
                    <ToolbarIconButton type="button" title="인라인 코드" aria-label="인라인 코드" onClick={() => runToolbarAction(() => wrapSelection("`", "`", "코드"))}>
                      <span className="textIcon code">&lt;/&gt;</span>
                    </ToolbarIconButton>
                  </ToolbarCluster>

                  <ToolbarDivider aria-hidden="true" />

                  <ToolbarCluster>
                    <ToolbarIconButton type="button" title="체크리스트" aria-label="체크리스트" onClick={() => runToolbarAction(applyChecklist)}>
                      <AppIcon name="check-circle" />
                    </ToolbarIconButton>
                    <ToolbarIconButton type="button" title="구분선" aria-label="구분선" onClick={() => runToolbarAction(insertDivider)}>
                      <span className="textIcon">—</span>
                    </ToolbarIconButton>
                    <ToolbarIconButton type="button" title="토글 블록" aria-label="토글 블록" onClick={() => runToolbarAction(insertToggle)}>
                      <AppIcon name="chevron-down" />
                    </ToolbarIconButton>
                    <ToolbarIconButton type="button" title="링크" aria-label="링크" onClick={() => runToolbarAction(insertLink)}>
                      <AppIcon name="link" />
                    </ToolbarIconButton>
                    <ColorDropdown>
                      <ToolbarIconButton
                        type="button"
                        title="글자색"
                        aria-label="글자색"
                        data-active={isColorMenuOpen}
                        onClick={() => {
                          setIsColorMenuOpen((prev) => !prev)
                          setIsCalloutMenuOpen(false)
                        }}
                      >
                        <span className="textIcon">A</span>
                      </ToolbarIconButton>
                      {isColorMenuOpen && (
                        <ColorMenu>
                          {INLINE_TEXT_COLOR_OPTIONS.map((option) => (
                            <button
                              type="button"
                              key={option.value}
                              onClick={() => applyInlineTextColor(option.value)}
                            >
                              <ColorSwatch style={{ background: option.value }} aria-hidden="true" />
                              <span>{option.label}</span>
                            </button>
                          ))}
                        </ColorMenu>
                      )}
                    </ColorDropdown>
                    <CalloutDropdown>
                      <ToolbarIconButton
                        type="button"
                        title="콜아웃"
                        aria-label="콜아웃"
                        data-active={isCalloutMenuOpen}
                        onClick={() => {
                          setIsCalloutMenuOpen((prev) => !prev)
                          setIsColorMenuOpen(false)
                        }}
                      >
                        <span className="textIcon">❝</span>
                      </ToolbarIconButton>
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
                          <button type="button" onClick={() => insertCallout("OUTLINE", "모범 개요를 작성하세요.")}>
                            OUTLINE
                          </button>
                          <button type="button" onClick={() => insertCallout("EXAMPLE", "예시 답안을 작성하세요.")}>
                            EXAMPLE
                          </button>
                          <button type="button" onClick={() => insertCallout("SUMMARY", "핵심 개념을 정리하세요.")}>
                            SUMMARY
                          </button>
                        </CalloutMenu>
                      )}
                    </CalloutDropdown>
                  </ToolbarCluster>

                  <ToolbarDivider aria-hidden="true" />

                  <ToolbarCluster>
                    <ToolbarIconButton
                      type="button"
                      title={`이미지 업로드 (${POST_IMAGE_UPLOAD_RULE_LABEL})`}
                      aria-label={`이미지 업로드 (${POST_IMAGE_UPLOAD_RULE_LABEL})`}
                      data-variant="primary"
                      disabled={disabled("uploadPostImage")}
                      onClick={() => runToolbarAction(() => postImageFileInputRef.current?.click())}
                    >
                      <AppIcon name="camera" />
                    </ToolbarIconButton>
                    <ToolbarIconButton type="button" title="코드 블록" aria-label="코드 블록" onClick={() => runToolbarAction(() => insertBlockSnippet(codeBlockTemplate))}>
                      <span className="textIcon code">{"{ }"}</span>
                    </ToolbarIconButton>
                    <ToolbarIconButton type="button" title="Mermaid" aria-label="Mermaid 다이어그램" onClick={() => runToolbarAction(() => insertBlockSnippet(mermaidTemplate))}>
                      <span className="textIcon">◇</span>
                    </ToolbarIconButton>
                    <ToolbarIconButton type="button" title="테이블" aria-label="테이블" onClick={() => runToolbarAction(() => insertBlockSnippet(tableTemplate))}>
                      <span className="textIcon">▦</span>
                    </ToolbarIconButton>
                  </ToolbarCluster>
                </ToolbarQuickBar>
              </EditorToolbar>
              <ComposeViewSwitch role="tablist" aria-label="편집 화면 보기 모드">
                {composeViewModeOptions.map((option) => (
                  <ComposeViewSwitchButton
                    key={option.value}
                    type="button"
                    role="tab"
                    aria-selected={composeViewMode === option.value}
                    data-active={composeViewMode === option.value}
                    onClick={() => setComposeViewMode(option.value)}
                  >
                    {option.icon === "split" ? (
                      <SplitViewGlyph aria-hidden="true">
                        <span />
                        <span />
                      </SplitViewGlyph>
                    ) : (
                      <AppIcon name={option.icon} aria-hidden="true" />
                    )}
                    <span>{option.label}</span>
                  </ComposeViewSwitchButton>
                ))}
              </ComposeViewSwitch>
              <EditorGrid data-view-mode={composeViewMode}>
                {composeViewMode !== "preview" ? (
                <EditorPane>
                  <PaneHeader>
                    <div>
                      <PaneTitle>본문</PaneTitle>
                    </div>
                    <PaneChip>{lineCount}줄</PaneChip>
                  </PaneHeader>
                  <ContentInput
                    ref={postContentRef}
                    placeholder="본문을 시작하세요"
                    value={postContent}
                    onChange={(e) => setPostContent(e.target.value)}
                    onScroll={schedulePreviewScrollSync}
                    onClick={schedulePreviewScrollSync}
                    onKeyUp={schedulePreviewScrollSync}
                    onSelect={schedulePreviewScrollSync}
                    onPaste={handlePasteFromHtml}
                  />
                </EditorPane>
                ) : null}
                {composeViewMode !== "editor" ? (
                  <PreviewPane>
                    <PaneHeader>
                      <div>
                        <PaneTitle>공개 결과 미리보기</PaneTitle>
                      </div>
                      <PaneChip>
                        {isPreviewSyncPending ? "갱신 중" : `${imageCount}개 이미지`}
                      </PaneChip>
                    </PaneHeader>
                    <PreviewCard ref={previewScrollRef}>
                      <PreviewContentFrame>
                        {isPreviewHeavyDocument ? (
                          <PreviewHintNotice>
                            긴 본문 보호 모드입니다. Mermaid는 코드 블록으로 렌더합니다.
                            {isPreviewSyncPending
                              ? ` (갱신 대기 · 본문 ${postContent.length.toLocaleString()}자 · Mermaid ${postContentMermaidBlockCount}개)`
                              : ` (본문 ${previewContentLength.toLocaleString()}자 · Mermaid ${previewMermaidBlockCount}개)`}
                          </PreviewHintNotice>
                        ) : null}
                        <LazyMarkdownRenderer
                          content={previewContent}
                          disableMermaid={isPreviewHeavyDocument}
                          editableImages
                          onImageWidthCommit={handlePreviewImageWidthCommit}
                        />
                      </PreviewContentFrame>
                    </PreviewCard>
                  </PreviewPane>
                ) : null}
              </EditorGrid>
                  </ComposeBodySection>
                </>
              )}

              <WriterFooterBar>
                <WriterFooterSummary>
                  <span>{tagSummaryText}</span>
                  <span>{contentLength}자 · {lineCount}줄</span>
                </WriterFooterSummary>
                <WriterFooterControls>
                  {shouldShowPublishNotice ? <PublishNotice data-tone={publishNotice.tone}>{publishNotice.text}</PublishNotice> : null}
                  <WriterFooterActions>
                    <Button type="button" disabled={loadingKey.length > 0} onClick={() => saveLocalDraft()}>
                      임시 저장
                    </Button>
                    <PrimaryButton
                      type="button"
                      disabled={mobilePrimaryActionDisabled}
                      onClick={() => openPublishModal(editorMode === "create" ? "create" : isTempDraftMode ? "temp" : "modify")}
                    >
                      {composeCallToActionLabel}
                    </PrimaryButton>
                  </WriterFooterActions>
                </WriterFooterControls>
              </WriterFooterBar>
            </ComposeMainColumn>

            <ComposeAssistantColumn>
              <ComposeAssistantPanel>
                <ComposeAssistantGroup>
                  <ComposeAssistantGroupHeader>
                    <div>
                      <strong>발행 상태</strong>
                      <span>지금 상태를 확인하고 발행 전 마지막 설정을 정리합니다.</span>
                    </div>
                  </ComposeAssistantGroupHeader>
                  <PublishSettingsSummary aria-label="현재 발행 설정 요약">
                    {composeHeroSummary.map((item) => (
                      <SummaryPill key={item}>{item}</SummaryPill>
                    ))}
                  </PublishSettingsSummary>
                  <ComposeAssistantActionBar>
                    <PrimaryButton
                      type="button"
                      disabled={mobilePrimaryActionDisabled}
                      onClick={() => openPublishModal(editorMode === "create" ? "create" : isTempDraftMode ? "temp" : "modify")}
                    >
                      {composeCallToActionLabel}
                    </PrimaryButton>
                    <Button
                      type="button"
                      disabled={disabled("recommendTags") || !postContent.trim()}
                      onClick={() => void handleRecommendTags()}
                    >
                      {loadingKey === "recommendTags" ? "태그 제안 중..." : "태그 제안"}
                    </Button>
                  </ComposeAssistantActionBar>
                  {shouldShowTagRecommendationNotice ? (
                    <SummaryActionStatus data-tone={tagRecommendationNotice.tone}>
                      {tagRecommendationNotice.text}
                    </SummaryActionStatus>
                  ) : null}
                </ComposeAssistantGroup>

                <ComposeAssistantGroup>
                  <ComposeAssistantGroupHeader>
                    <div>
                      <strong>공개 범위</strong>
                      <span>발행 전 노출 범위를 정합니다.</span>
                    </div>
                  </ComposeAssistantGroupHeader>
                  <VisibilityOptionGrid role="group" aria-label="노출 범위 선택">
                    {PUBLISH_VISIBILITY_OPTIONS.map((option) => (
                      <VisibilityOptionButton
                        key={option.value}
                        type="button"
                        data-active={postVisibility === option.value}
                        aria-pressed={postVisibility === option.value}
                        onClick={() => setPostVisibility(option.value)}
                      >
                        <strong>{option.label}</strong>
                        <span>{option.description}</span>
                      </VisibilityOptionButton>
                    ))}
                  </VisibilityOptionGrid>
                </ComposeAssistantGroup>

                <ComposeAssistantGroup>
                  <PreviewResultHeader>
                    <div>
                      <strong>카드 미리보기</strong>
                      <span>{previewViewportConfig.label} 폭에서 결과를 확인합니다.</span>
                    </div>
                    <PreviewViewportTabs role="tablist" aria-label="포스트 카드 미리보기 기기">
                      {PREVIEW_CARD_VIEWPORT_ORDER.map((viewport) => {
                        const viewportConfig = PREVIEW_CARD_VIEWPORTS[viewport]
                        return (
                          <PreviewViewportButton
                            key={viewport}
                            type="button"
                            role="tab"
                            aria-selected={previewViewport === viewport}
                            data-active={previewViewport === viewport}
                            onClick={() => setPreviewViewport(viewport)}
                          >
                            {viewportConfig.label}
                          </PreviewViewportButton>
                        )
                      })}
                    </PreviewViewportTabs>
                  </PreviewResultHeader>
                  <PreviewResultFrame style={{ width: `min(100%, ${previewViewportConfig.cardWidth}px)` }}>
                    <PreviewResultCard>
                      <div className="thumbnail">
                        {previewThumbnailSrc ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={previewThumbnailSrc}
                            alt="실제 카드 기준 포스트 썸네일 미리보기"
                            style={{
                              objectFit: "cover",
                              objectPosition: `${postThumbnailFocusX}% ${postThumbnailFocusY}%`,
                              transform: `scale(${postThumbnailZoom})`,
                              transformOrigin: `${postThumbnailFocusX}% ${postThumbnailFocusY}%`,
                            }}
                            onError={() => setIsPreviewThumbnailError(true)}
                          />
                        ) : (
                          <div className="thumbnail-placeholder">
                            <em>썸네일 없음</em>
                            <span>본문 첫 이미지가 있으면 자동으로 반영됩니다.</span>
                          </div>
                        )}
                      </div>
                      <div className="content">
                        <PreviewVisibilityBadge>{previewVisibilityLabel}</PreviewVisibilityBadge>
                        <h4>{postTitle.trim() || "제목을 입력하면 카드 결과가 여기에 표시됩니다."}</h4>
                        <p className="summary">
                          {composeSummaryPreview || "요약을 비워두면 본문에서 자동 생성한 요약이 반영됩니다."}
                        </p>
                        <div className="meta">
                          <span>{previewDateText}</span>
                          <span className="dot">·</span>
                          <span className="comment">
                            <AppIcon name="message" />
                            0개의 댓글
                          </span>
                        </div>
                        <div className="footer">
                          <div className="author">
                            <span className="avatar" aria-hidden="true">
                              {previewAuthorAvatarSrc ? (
                                <ProfileImage src={previewAuthorAvatarSrc} alt="" fillContainer />
                              ) : (
                                <span className="initial">{displayNameInitial}</span>
                              )}
                            </span>
                            <span className="by">by</span>
                            <strong>{displayName}</strong>
                          </div>
                          <div className="like">
                            <AppIcon name="heart" />
                            <span>0</span>
                          </div>
                        </div>
                      </div>
                    </PreviewResultCard>
                  </PreviewResultFrame>
                </ComposeAssistantGroup>

                <ComposeAssistantGroup>
                  <ComposeAssistantGroupHeader>
                    <div>
                      <strong>카드 요약</strong>
                      <span>{postSummary.trim() ? `${postSummary.trim().length}/${PREVIEW_SUMMARY_MAX_LENGTH}` : "본문 기준 자동"}</span>
                    </div>
                  </ComposeAssistantGroupHeader>
                  <ComposeSidebarSummaryText>
                    {composeSummaryPreview || "요약을 입력하면 카드 결과와 발행 요약에 함께 반영됩니다."}
                  </ComposeSidebarSummaryText>
                </ComposeAssistantGroup>

                <InlineDisclosure open={isComposeAssistOpen}>
                  <summary
                    onClick={(event) => {
                      event.preventDefault()
                      setIsComposeAssistOpen((prev) => !prev)
                    }}
                  >
                    <strong>썸네일과 카드 설정</strong>
                    <span>{isComposeAssistOpen ? "닫기" : "열기"}</span>
                  </summary>
                  {isComposeAssistOpen && (
                    <div className="body">
                      <PreviewEditorGrid>
                        {thumbnailEditorPanel}
                        {previewMetaEditorPanel}
                      </PreviewEditorGrid>
                    </div>
                  )}
                </InlineDisclosure>

                <InlineDisclosure open={activeMetaPanel === "tag"}>
                  <summary
                    onClick={(event) => {
                      event.preventDefault()
                      setActiveMetaPanel((prev) => (prev === "tag" ? null : "tag"))
                    }}
                  >
                    <strong>태그 정리</strong>
                    <span>{activeMetaPanel === "tag" ? "닫기" : "열기"}</span>
                  </summary>
                  <div className="body">
                    <MetadataStatus data-tone={metaNotice.tone}>{metaNotice.text}</MetadataStatus>
                    <MetadataPanel>
                      <label>태그 선택</label>
                      <SelectionRow>
                        {knownTags.map((tag) => (
                          <TagCatalogChipGroup
                            key={tag}
                            data-active={postTags.includes(tag)}
                            style={postTags.includes(tag) ? getTagToneStyle(tag) : undefined}
                          >
                            <TagCatalogToggle
                              type="button"
                              data-active={postTags.includes(tag)}
                              onClick={() => (postTags.includes(tag) ? removeTagFromPost(tag) : addTagToPost(tag))}
                            >
                              <span className="label">{tag}</span>
                              {(tagUsageMap[tag] || 0) > 0 ? (
                                <span className="count">{tagUsageMap[tag] || 0}</span>
                              ) : null}
                            </TagCatalogToggle>
                            <TagCatalogDeleteButton
                              type="button"
                              data-active={postTags.includes(tag)}
                              disabled={(tagUsageMap[tag] || 0) > 0}
                              title={
                                (tagUsageMap[tag] || 0) > 0
                                  ? "사용 중인 태그는 삭제할 수 없습니다."
                                  : "태그 삭제"
                              }
                              onClick={() => deleteTagFromCatalog(tag)}
                            >
                              ×
                            </TagCatalogDeleteButton>
                          </TagCatalogChipGroup>
                        ))}
                        {knownTags.length === 0 ? <EmptyMetaText>아직 저장된 태그가 없습니다.</EmptyMetaText> : null}
                      </SelectionRow>
                    </MetadataPanel>
                  </div>
                </InlineDisclosure>

                <InlineDisclosure open={isComposePreviewOpen}>
                  <summary
                    onClick={(event) => {
                      event.preventDefault()
                      setIsComposePreviewOpen((prev) => !prev)
                    }}
                  >
                    <strong>공개 결과 미리보기</strong>
                    <span>{isComposePreviewOpen ? "닫기" : "열기"}</span>
                  </summary>
                  {isComposePreviewOpen && (
                    <div className="body">
                      <PreviewCard>
                        <PreviewContentFrame>
                          <LazyMarkdownRenderer content={postContent} />
                        </PreviewContentFrame>
                      </PreviewCard>
                    </div>
                  )}
                </InlineDisclosure>

                <InlineDisclosure open={isComposeUtilityOpen}>
                  <summary
                    onClick={(event) => {
                      event.preventDefault()
                      setIsComposeUtilityOpen((prev) => !prev)
                    }}
                  >
                    <strong>보조 작업</strong>
                    <span>{isComposeUtilityOpen ? "닫기" : "열기"}</span>
                  </summary>
                  {isComposeUtilityOpen && (
                    <div className="body">
                      <SubActionRow>
                        <Button type="button" disabled={loadingKey.length > 0} onClick={() => saveLocalDraft()}>
                          브라우저 임시저장
                        </Button>
                        <Button type="button" disabled={loadingKey.length > 0} onClick={restoreLocalDraft}>
                          임시저장 불러오기
                        </Button>
                        <Button
                          type="button"
                          disabled={loadingKey.length > 0 || !localDraftSavedAt}
                          onClick={clearLocalDraft}
                        >
                          임시저장 삭제
                        </Button>
                      </SubActionRow>
                    </div>
                  )}
                </InlineDisclosure>
              </ComposeAssistantPanel>
            </ComposeAssistantColumn>
          </ComposeStudioLayout>
        </EditorSection>
        </ComposeSurfaceSection>
        )}

        {isCompactMobileLayout && studioSurface === "compose" && !isPublishModalOpen && (
          <MobilePrimaryActionBar>
            <PrimaryButton
              type="button"
              disabled={mobilePrimaryActionDisabled}
              onClick={() => openPublishModal(editorMode === "create" ? "create" : isTempDraftMode ? "temp" : "modify")}
            >
              {mobilePrimaryActionLabel}
            </PrimaryButton>
          </MobilePrimaryActionBar>
        )}

        {isPublishModalOpen && (
          <ModalBackdrop onClick={closePublishModal}>
            <PublishModal onClick={(e) => e.stopPropagation()}>
              <PublishModalHeader>
                <div>
                  <h4>{publishActionTitle}</h4>
                  <p>{publishActionDescription}</p>
                </div>
              </PublishModalHeader>
              <PublishModalBody>
                {shouldShowPublishModalNotice ? (
                  <PublishNotice data-tone={publishModalNotice.tone}>{publishModalNotice.text}</PublishNotice>
                ) : null}
                <PublishOverviewGrid>
                  <VisibilityCard>
                    <SectionKicker>노출 범위</SectionKicker>
                    <strong>누가 이 글을 볼 수 있나요?</strong>
                    <VisibilityOptionGrid role="group" aria-label="노출 범위 선택">
                      {PUBLISH_VISIBILITY_OPTIONS.map((option) => (
                        <VisibilityOptionButton
                          key={option.value}
                          type="button"
                          data-active={postVisibility === option.value}
                          aria-pressed={postVisibility === option.value}
                          onClick={() => setPostVisibility(option.value)}
                        >
                          <strong>{option.label}</strong>
                          <span>{option.description}</span>
                        </VisibilityOptionButton>
                      ))}
                    </VisibilityOptionGrid>
                    <FieldHelp>메인 피드 노출은 전체 공개에서만 활성화됩니다.</FieldHelp>
                  </VisibilityCard>
                  <PreviewResultPanel>
                    <PreviewResultHeader>
                      <div>
                        <SectionKicker>실제 카드 결과</SectionKicker>
                        <strong>{previewViewportConfig.label}</strong>
                        <span>제목, 요약, 썸네일 잘림만 확인합니다.</span>
                      </div>
                      <PreviewViewportTabs role="tablist" aria-label="포스트 카드 미리보기 기기">
                        {PREVIEW_CARD_VIEWPORT_ORDER.map((viewport) => {
                          const viewportConfig = PREVIEW_CARD_VIEWPORTS[viewport]
                          return (
                            <PreviewViewportButton
                              key={viewport}
                              type="button"
                              role="tab"
                              aria-selected={previewViewport === viewport}
                              data-active={previewViewport === viewport}
                              onClick={() => setPreviewViewport(viewport)}
                            >
                              {viewportConfig.label}
                            </PreviewViewportButton>
                          )
                        })}
                      </PreviewViewportTabs>
                    </PreviewResultHeader>
                    <PreviewResultFrame style={{ maxWidth: `${previewViewportConfig.cardWidth}px` }}>
                      <PreviewResultCard>
                        <div className="thumbnail">
                          {previewThumbnailSrc ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={previewThumbnailSrc}
                              alt="실제 카드 기준 포스트 썸네일 미리보기"
                              style={{
                                objectFit: "cover",
                                objectPosition: `${postThumbnailFocusX}% ${postThumbnailFocusY}%`,
                                transform: `scale(${postThumbnailZoom})`,
                                transformOrigin: `${postThumbnailFocusX}% ${postThumbnailFocusY}%`,
                              }}
                              onError={() => setIsPreviewThumbnailError(true)}
                            />
                          ) : (
                            <div className="thumbnail-placeholder">
                              <em>썸네일 없음</em>
                              <span>본문 첫 이미지가 자동 카드 썸네일로 사용됩니다.</span>
                            </div>
                          )}
                        </div>
                        <div className="content">
                          <PreviewVisibilityBadge>{previewVisibilityLabel}</PreviewVisibilityBadge>
                          <h4>{postTitle.trim() || "제목을 입력하면 카드 결과가 여기에 표시됩니다."}</h4>
                          <p className="summary">
                            {resolvedPreviewSummary || "요약을 비워두면 본문에서 자동 생성한 요약이 카드에 반영됩니다."}
                          </p>
                          <div className="meta">
                            <span>{previewDateText}</span>
                            <span className="dot">·</span>
                            <span className="comment">
                              <AppIcon name="message" />
                              0개의 댓글
                            </span>
                          </div>
                          <div className="footer">
                            <div className="author">
                              <span className="avatar" aria-hidden="true">
                                {previewAuthorAvatarSrc ? (
                                  <ProfileImage src={previewAuthorAvatarSrc} alt="" fillContainer />
                                ) : (
                                  <span className="initial">{displayNameInitial}</span>
                                )}
                              </span>
                              <span className="by">by</span>
                              <strong>{displayName}</strong>
                            </div>
                            <div className="like">
                              <AppIcon name="heart" />
                              <span>0</span>
                            </div>
                          </div>
                        </div>
                      </PreviewResultCard>
                    </PreviewResultFrame>
                  </PreviewResultPanel>
                </PublishOverviewGrid>

                <PostPreviewSetup>
                  <PostPreviewHeader>
                    <strong>카드 요소 편집</strong>
                    <span>썸네일 위치와 카드 요약만 조정합니다. 결과는 위 카드에서 바로 확인됩니다.</span>
                  </PostPreviewHeader>

                  {isCompactMobileLayout ? (
                    <CompactPublishEditorStack>
                      <CompactPublishEditorCard>
                        <CompactPublishEditorToggle
                          type="button"
                          aria-expanded={isMobileThumbnailEditorOpen}
                          onClick={() => setIsMobileThumbnailEditorOpen((current) => !current)}
                        >
                          <div>
                            <strong>썸네일 위치 조정</strong>
                            <span>드래그/확대로 카드 크롭을 빠르게 맞춥니다.</span>
                          </div>
                          <span>{isMobileThumbnailEditorOpen ? "접기" : "열기"}</span>
                        </CompactPublishEditorToggle>
                        {isMobileThumbnailEditorOpen ? thumbnailEditorPanel : null}
                      </CompactPublishEditorCard>
                      <CompactPublishEditorCard>
                        <CompactPublishEditorToggle
                          type="button"
                          aria-expanded={isMobileMetaEditorOpen}
                          onClick={() => setIsMobileMetaEditorOpen((current) => !current)}
                        >
                          <div>
                            <strong>카드 메타 편집</strong>
                            <span>썸네일 URL과 요약만 따로 정리합니다.</span>
                          </div>
                          <span>{isMobileMetaEditorOpen ? "접기" : "열기"}</span>
                        </CompactPublishEditorToggle>
                        {isMobileMetaEditorOpen ? previewMetaEditorPanel : null}
                      </CompactPublishEditorCard>
                    </CompactPublishEditorStack>
                  ) : (
                    <PreviewEditorGrid>
                      {thumbnailEditorPanel}
                      {previewMetaEditorPanel}
                    </PreviewEditorGrid>
                  )}
                </PostPreviewSetup>
              </PublishModalBody>
              <PublishModalFooter>
                <Button
                  type="button"
                  disabled={
                    loadingKey === "writePost" ||
                    loadingKey === "modifyPost" ||
                    loadingKey === "publishTempPost" ||
                    loadingKey === "recommendTags"
                  }
                  onClick={closePublishModal}
                >
                  닫기
                </Button>
                <PrimaryButton
                  type="button"
                  disabled={publishActionButtonDisabled}
                  onClick={() => void handleConfirmPublish()}
                >
                  {publishActionButtonText}
                </PrimaryButton>
              </PublishModalFooter>
            </PublishModal>
          </ModalBackdrop>
        )}

          {SHOW_LEGACY_UTILITY_STUDIO && (
          <UtilityGrid>
            <Section id="comment-studio">
              <SectionTop>
                <div>
                  <SectionEyebrow>댓글 점검</SectionEyebrow>
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
                  <SectionEyebrow>시스템 점검</SectionEyebrow>
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
          )}
        </WorkspaceMain>

      </WorkspaceGrid>

      {(loadingKey || result) && (
        <DevConsoleSection>
          <details open={Boolean(loadingKey)}>
            <summary>
              <div>
                <SectionEyebrow>실행 로그</SectionEyebrow>
                <strong>{loadingKey ? "작업 응답 확인 중" : "최근 작업 응답 보기"}</strong>
              </div>
              <span>{loadingKey ? `실행 중: ${loadingKey}` : "접어서 숨길 수 있습니다"}</span>
            </summary>
            <ResultPanel>{result || "// API 응답 결과가 여기에 표시됩니다."}</ResultPanel>
          </details>
        </DevConsoleSection>
      )}
    </Main>
  )
}

export default EditorStudioPage

const Main = styled.main`
  max-width: 1360px;
  margin: 0 auto;
  padding: 1.5rem 1rem 2.8rem;

  @media (max-width: 720px) {
    padding-bottom: calc(7rem + env(safe-area-inset-bottom, 0px));
  }

  @media (max-width: 720px) {
    padding:
      1rem
      max(0.78rem, env(safe-area-inset-right))
      calc(7rem + env(safe-area-inset-bottom, 0px))
      max(0.78rem, env(safe-area-inset-left));
  }
`

const HeroCard = styled.section`
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.72rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};
  box-shadow: none;
  padding: 0.88rem 0.96rem;
  margin-bottom: 0.92rem;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
    gap: 0.78rem;
    border-radius: 16px;
    box-shadow: none;
    padding: 0.88rem 0.92rem;
  }

  &[data-compact-manage="true"] {
    margin-bottom: 0.7rem;

    @media (max-width: 760px) {
      gap: 0.6rem;
      padding: 0.72rem 0.8rem;
    }
  }
`

const HeroIntro = styled.div`
  display: grid;
  gap: 0.42rem;

  h1 {
    margin: 0;
    font-size: clamp(1.74rem, 2.7vw, 2.3rem);
    line-height: 1.14;
    font-weight: 800;
    letter-spacing: -0.02em;
    word-break: keep-all;
    text-wrap: balance;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0;
    max-width: 32rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.84rem;
    line-height: 1.5;
  }

  &[data-compact-manage="true"] {
    gap: 0.5rem;

    p {
      font-size: 0.86rem;
      line-height: 1.55;
    }
  }
`

const StudioStatusStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.42rem;

  @media (max-width: 1100px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`

const StudioStatusItem = styled.div`
  display: grid;
  gap: 0.18rem;
  min-width: 0;
  padding: 0.48rem 0.58rem;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.72rem;
    font-weight: 700;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.82rem;
    line-height: 1.35;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (max-width: 760px) {
    &[data-optional="true"] {
      display: none;
    }
  }
`

const WorkspaceGrid = styled.div`
  display: block;
`

const WorkspaceMain = styled.div`
  min-width: 0;
`

const Section = styled.section`
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 14px;
  padding: 0.9rem;
  margin-bottom: 1.2rem;
  background: ${({ theme }) => theme.colors.gray2};
  box-shadow: none;

  h2 {
    margin: 0;
    font-size: 1.2rem;
    color: ${({ theme }) => theme.colors.gray12};
  }

  &[id="content-studio"] {
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    border-radius: 14px;
    padding: 0.96rem;
    background: ${({ theme }) => theme.colors.gray2};
    box-shadow: none;
    margin-bottom: 1.05rem;
  }

  @media (max-width: 420px) {
    border-radius: 12px;
    padding: 0.74rem;
    margin-bottom: 0.95rem;
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
  display: none;
`

const SectionDescription = styled.p`
  margin: 0.22rem 0 0;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.82rem;
  line-height: 1.5;
`

const GlobalNoticeBar = styled.div`
  margin-bottom: 0.9rem;
  padding: 0.66rem 0.78rem;
  border-radius: 10px;
  font-size: 0.84rem;
  line-height: 1.5;
  border: 1px solid ${({ theme }) => theme.colors.gray6};

  &[data-tone="idle"] {
    color: ${({ theme }) => theme.colors.gray10};
    background: ${({ theme }) => theme.colors.gray2};
    border-color: ${({ theme }) => theme.colors.gray6};
  }

  &[data-tone="loading"] {
    color: ${({ theme }) => theme.colors.blue11};
    background: ${({ theme }) => theme.colors.blue3};
    border-color: ${({ theme }) => theme.colors.blue7};
  }

  &[data-tone="success"] {
    color: ${({ theme }) => theme.colors.green11};
    background: ${({ theme }) => theme.colors.green3};
    border-color: ${({ theme }) => theme.colors.green7};
  }

  &[data-tone="error"] {
    color: ${({ theme }) => theme.colors.red11};
    background: ${({ theme }) => theme.colors.red3};
    border-color: ${({ theme }) => theme.colors.red7};
  }

  @media (max-width: 420px) {
    margin-bottom: 0.7rem;
    padding: 0.58rem 0.62rem;
    font-size: 0.8rem;
  }
`

const ContentStudioGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;
  align-items: start;

  @media (min-width: 1320px) {
    grid-template-columns: minmax(0, 1fr) minmax(320px, 360px);
  }

  @media (max-width: 720px) {
    gap: 0.76rem;
  }
`

const MobileStudioStepper = styled.div`
  display: none;

  @media (max-width: 720px) {
    position: sticky;
    top: calc(var(--app-header-height, 56px) + 0.32rem);
    z-index: 12;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.4rem;
    margin: 0.2rem 0 0.4rem;
    padding: 0.5rem;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    border-radius: 10px;
    background: ${({ theme }) => theme.colors.gray2};

    > button {
      min-height: 38px;
      border-radius: 999px;
      border: 1px solid ${({ theme }) => theme.colors.gray6};
      background: transparent;
      color: ${({ theme }) => theme.colors.gray11};
      font-size: 0.77rem;
      font-weight: 700;
      cursor: pointer;
    }

    > button[data-active="true"] {
      border-color: ${({ theme }) => theme.colors.blue8};
      color: ${({ theme }) => theme.colors.blue11};
      background: ${({ theme }) => theme.colors.blue3};
    }
  }
`

const MobileStepGuide = styled.section`
  display: none;

  @media (max-width: 720px) {
    display: grid;
    gap: 0.58rem;
    margin-bottom: 0.28rem;
    padding: 0.66rem 0.72rem;
    border-radius: 10px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};

    strong {
      font-size: 0.86rem;
      color: ${({ theme }) => theme.colors.gray12};
      line-height: 1.4;
    }

    p {
      margin: 0;
      font-size: 0.76rem;
      line-height: 1.5;
      color: ${({ theme }) => theme.colors.gray10};
    }

    > div {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.5rem;
    }

    button {
      min-height: 38px;
      width: 100%;
      justify-content: center;
    }
  }

  @media (max-width: 520px) {
    > div {
      grid-template-columns: 1fr;
    }
  }
`

const ContentStudioLeft = styled.div`
  display: grid;
  gap: 0.95rem;
  min-width: 0;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.gray1};
  padding: 0.9rem;
  box-shadow: none;
  overflow: hidden;

  @media (max-width: 720px) {
    padding: 0.72rem;
    gap: 0.8rem;
  }

  @media (max-width: 720px) {
    &[data-mobile-visible="false"] {
      display: none;
    }
  }
`

const QueryPanel = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.gray2};
  padding: 0.72rem 0.72rem 0.82rem;
  margin: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};

  @media (max-width: 420px) {
    padding: 0.62rem 0.62rem 0.72rem;
  }

  @media (max-width: 720px) {
    &[data-mobile-visible="false"] {
      display: none;
    }
  }
`

const QueryHeader = styled.div`
  margin-bottom: 0.72rem;

  h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 720;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0.18rem 0 0;
    font-size: 0.78rem;
    line-height: 1.5;
    color: ${({ theme }) => theme.colors.gray10};
  }
`

const ListScopeTabs = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.38rem;
  margin-top: 0.55rem;
  padding: 0;
  border-radius: 999px;
  border: none;
  background: transparent;
`

const ListScopeButton = styled.button`
  border: 0;
  border-radius: 999px;
  min-height: 36px;
  padding: 0 0.82rem;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease;

  &[data-active="true"] {
    background: transparent;
    color: ${({ theme }) => theme.colors.gray12};
    text-decoration: underline;
    text-underline-offset: 4px;
  }
`

const QueryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;

  @media (min-width: 1280px) {
    grid-template-columns: 110px 140px minmax(260px, 1fr) 180px;
    align-items: end;

    .listKw {
      min-width: 0;
    }
  }

  @media (max-width: 720px) {
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
  font-size: 0.8rem;
  font-weight: 650;
  color: ${({ theme }) => theme.colors.gray11};
`

const QueryActions = styled.div`
  margin-top: 0.72rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;

  > button {
    min-width: 9.5rem;
  }

  @media (max-width: 720px) {
    display: grid;
    grid-template-columns: 1fr;

    > button {
      width: 100%;
    }
  }
`

const InlineDisclosure = styled.details`
  margin-top: 0.68rem;
  border-top: 1px dashed ${({ theme }) => theme.colors.gray6};
  padding-top: 0.68rem;

  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.72rem;
    list-style: none;
    cursor: pointer;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.78rem;
    line-height: 1.45;

    &::-webkit-details-marker {
      display: none;
    }
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.8rem;
    font-weight: 700;
  }

  summary > span:last-of-type {
    flex: 0 0 auto;
    color: ${({ theme }) => theme.colors.blue11};
    font-size: 0.76rem;
    font-weight: 700;
  }

  .body {
    display: grid;
    gap: 0.62rem;
    margin-top: 0.72rem;
  }
`

const PresetRow = styled.div`
  margin-top: 0.6rem;
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;

  @media (max-width: 420px) {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 0.18rem;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;

    &::-webkit-scrollbar {
      display: none;
    }
  }
`

const PresetButton = styled.button`
  min-height: 36px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.78rem;
  font-weight: 700;
  padding: 0 0.72rem;
  cursor: pointer;

  &[data-active="true"] {
    color: ${({ theme }) => theme.colors.gray12};
    border-color: ${({ theme }) => theme.colors.gray7};
    text-decoration: underline;
    text-underline-offset: 4px;
  }
`

const ProfileStudioGrid = styled.div`
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 0.9rem;
  align-items: start;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`

const ProfileCardPanel = styled.div`
  border-radius: 0;
  border: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  padding: 0 0 0.9rem;
  display: grid;
  gap: 0.85rem;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  justify-items: center;
  text-align: center;
  align-content: start;
`

const ProfilePreview = styled.div`
  display: grid;
  place-items: center;
  padding: 0.15rem;
  width: 124px;
  height: 124px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  overflow: hidden;
  flex-shrink: 0;

  .previewImage {
    width: 120px;
    height: 120px;
    object-fit: cover;
    object-position: center 38%;
    border-radius: 999px;
    display: block;
    border: none;
  }
`

const ProfileFallback = styled.div`
  width: 120px;
  height: 120px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: ${({ theme }) => theme.colors.gray4};
  color: ${({ theme }) => theme.colors.gray11};
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
    white-space: pre-line;
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
  border-radius: 0;
  border: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  padding: 0 0 0.9rem;
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
  padding: 0.56rem 0;
  border-radius: 0;
  border: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  min-width: 0;

  &.wide {
    grid-column: span 2;

    @media (max-width: 720px) {
      grid-column: span 1;
    }

    strong {
      white-space: pre-line;
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
  border-radius: 8px;
  font-size: 0.82rem;
  line-height: 1.5;
  width: 100%;
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;

  &[data-tone="idle"] {
    color: ${({ theme }) => theme.colors.gray11};
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
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
  align-items: center;

  > button {
    min-width: 8.8rem;
  }

  @media (max-width: 720px) {
    display: grid;
    grid-template-columns: 1fr;

    > button {
      width: 100%;
    }
  }
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
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 8px;
  padding: 0.72rem 0.8rem;
  min-height: 44px;
  min-width: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: 0 0 0 4px ${({ theme }) => theme.colors.blue4};
  }
`

const ProfileBioTextArea = styled.textarea`
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 8px;
  padding: 0.72rem 0.8rem;
  min-height: 96px;
  min-width: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};
  line-height: 1.6;
  resize: vertical;

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: 0 0 0 4px ${({ theme }) => theme.colors.blue4};
  }
`

const FieldSelect = styled.select`
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 8px;
  padding: 0.72rem 0.8rem;
  min-height: 44px;
  min-width: 0;
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.95rem;

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: 0 0 0 4px ${({ theme }) => theme.colors.blue4};
  }
`

const TitleInput = styled.textarea`
  width: 100%;
  min-width: 0;
  border: 0;
  border-radius: 0;
  padding: 0;
  min-height: 44px;
  background: transparent;
  box-shadow: none;
  font-family: inherit;
  font-size: clamp(1.7rem, 3vw, 2.45rem);
  font-weight: 720;
  line-height: 1.22;
  letter-spacing: -0.025em;
  resize: none;
  overflow: hidden;
  white-space: pre-wrap;
  overflow-wrap: anywhere;

  &::placeholder {
    color: ${({ theme }) => theme.colors.gray9};
  }

  &:focus {
    box-shadow: none;
    border-color: transparent;
  }

  @media (max-width: 720px) {
    font-size: clamp(1.45rem, 6vw, 2rem);
  }
`

const Button = styled.button`
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 8px;
  padding: 0.62rem 0.92rem;
  min-height: 44px;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray10};
  cursor: pointer;
  font-size: 0.84rem;
  font-weight: 600;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;

  &[data-variant="danger"] {
    border-color: ${({ theme }) => theme.colors.red8};
    background: ${({ theme }) => theme.colors.red3};
    color: ${({ theme }) => theme.colors.red11};
  }

  &[data-variant="text"] {
    min-height: auto;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
  }

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.gray8};
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &[data-variant="text"]:hover:not(:disabled) {
    border-color: transparent;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray12};
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.blue4};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

const PrimaryButton = styled(Button)`
  border-radius: 8px;
  padding: 0.6rem 0.88rem;
  border-color: ${({ theme }) => theme.colors.blue9};
  background: ${({ theme }) => theme.colors.blue9};
  color: ${({ theme }) => theme.colors.gray1};
  font-weight: 700;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.blue10};
    background: ${({ theme }) => theme.colors.blue10};
    color: ${({ theme }) => theme.colors.gray1};
  }
`

const EditorSection = styled.div`
  margin: 1.12rem 0 0.25rem;
  border: none;
  border-radius: 0;
  padding: 0;
  background: transparent;

  @media (max-width: 720px) {
    padding: 0;
    margin-top: 0.92rem;
  }

  @media (max-width: 720px) {
    &[data-mobile-visible="false"] {
      display: none;
    }
  }
`

const ComposeSurfaceSection = styled(Section)`
  display: grid;
  gap: 1.2rem;
  padding: 1.1rem 1.1rem 1.3rem;
  border-color: ${({ theme }) => theme.colors.gray4};
  background:
    radial-gradient(circle at top left, rgba(96, 165, 250, 0.04), transparent 24%),
    ${({ theme }) => theme.colors.gray1};

  @media (max-width: 420px) {
    gap: 1rem;
    padding: 0.82rem 0.82rem 1rem;
  }
`

const ComposeStudioLayout = styled.div`
  display: grid;
  gap: 1.4rem;
  align-items: start;

  @media (min-width: 1180px) {
    grid-template-columns: minmax(0, 1fr) minmax(300px, 340px);
  }

  @media (max-width: 720px) {
    gap: 1rem;
  }
`

const ComposeMainColumn = styled.div`
  display: grid;
  gap: 1.1rem;
  min-width: 0;
`

const ComposeAssistantColumn = styled.aside`
  min-width: 0;
`

const ComposeAssistantPanel = styled.div`
  display: grid;
  gap: 0.85rem;

  @media (min-width: 1180px) {
    position: sticky;
    top: calc(var(--app-header-height, 56px) + 1rem);
  }
`

const ComposeAssistantGroup = styled.section`
  display: grid;
  gap: 0.72rem;
  padding: 0.9rem 0.95rem;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 16px;
  background: ${({ theme }) => theme.colors.gray2};
`

const ComposeAssistantGroupHeader = styled.div`
  display: grid;
  gap: 0.16rem;

  > div {
    display: grid;
    gap: 0.16rem;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.92rem;
    font-weight: 760;
    line-height: 1.28;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.76rem;
    line-height: 1.45;
  }
`

const ComposeAssistantActionBar = styled.div`
  display: grid;
  gap: 0.56rem;

  > button {
    width: 100%;
  }
`

const ComposeStudioHeader = styled.div`
  display: grid;
  gap: 0.9rem;

  @media (min-width: 960px) {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
  }
`

const ComposeStudioHeaderCopy = styled.div`
  display: grid;
  gap: 0.28rem;
  min-width: 0;

  h2 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: clamp(1.45rem, 2.3vw, 2rem);
    line-height: 1.15;
    font-weight: 760;
    letter-spacing: -0.02em;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.92rem;
    line-height: 1.58;
    max-width: 34rem;
  }
`

const ComposeStudioKicker = styled.span`
  display: inline-flex;
  align-items: center;
  width: fit-content;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
`

const ComposeStudioContextBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  justify-content: flex-start;

  @media (min-width: 960px) {
    justify-content: flex-end;
  }
`

const ComposeStudioContextItem = styled.div`
  display: grid;
  gap: 0.08rem;
  min-width: 7rem;
  padding: 0.5rem 0.68rem;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.gray2};

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.68rem;
    font-weight: 700;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.82rem;
    font-weight: 720;
    line-height: 1.35;
  }

  &[data-tone="loading"] strong {
    color: ${({ theme }) => theme.colors.blue11};
  }

  &[data-tone="success"] strong {
    color: ${({ theme }) => theme.colors.green11};
  }

  &[data-tone="error"] strong {
    color: ${({ theme }) => theme.colors.red11};
  }
`

const WriterHeader = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  margin-bottom: 0.55rem;

  .titleField {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }
`

const WriterAccent = styled.div`
  width: 5rem;
  height: 0.42rem;
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.gray8};
`

const InlineTagComposer = styled.div`
  display: grid;
  gap: 0.55rem;
  min-width: 0;

  .label {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.88rem;
    font-weight: 700;
  }

  .headerRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .status {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.78rem;
    font-weight: 600;
  }
`

const InlineTagList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  min-height: auto;
  align-items: center;
  border-radius: 0;
  border: none;
  background: transparent;
  padding: 0;
`

const InlineMetaInput = styled(Input)`
  flex: 1 1 12rem;
  min-width: 11rem;
  border: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  outline: none;
  min-height: 2rem;
  padding: 0 0.12rem;
  border-radius: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};

  &::placeholder {
    color: ${({ theme }) => theme.colors.gray10};
  }
`

const PostPreviewSetup = styled.section`
  display: grid;
  gap: 0.82rem;
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 0;
`

const PostPreviewHeader = styled.div`
  display: grid;
  gap: 0.18rem;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.92rem;
    font-weight: 700;
    line-height: 1.3;
  }

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.76rem;
    line-height: 1.45;
  }
`

const SectionKicker = styled.span`
  display: inline-flex;
  align-items: center;
  width: fit-content;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
`

const PublishOverviewGrid = styled.div`
  display: grid;
  gap: 0.8rem;

  @media (min-width: 1080px) {
    grid-template-columns: minmax(0, 1fr) minmax(320px, 368px);
    align-items: start;
  }
`

const VisibilityCard = styled.section`
  display: grid;
  gap: 0.62rem;
  align-content: start;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0)),
    ${({ theme }) => theme.colors.gray1};
  padding: 0.9rem;

  > strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.94rem;
    font-weight: 700;
    line-height: 1.35;
  }
`

const VisibilityOptionGrid = styled.div`
  display: grid;
  gap: 0.5rem;
`

const VisibilityOptionButton = styled.button`
  display: grid;
  gap: 0.16rem;
  width: 100%;
  padding: 0.72rem 0.78rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    box-shadow 0.18s ease;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.84rem;
    font-weight: 700;
    line-height: 1.3;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.75rem;
    line-height: 1.45;
  }

  &[data-active="true"] {
    border-color: ${({ theme }) => theme.colors.blue8};
    background: ${({ theme }) => theme.colors.blue3};
    box-shadow: 0 0 0 1px ${({ theme }) => theme.colors.blue6} inset;
  }
`

const PreviewResultPanel = styled.div`
  display: grid;
  gap: 0.75rem;
  min-width: 0;
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0)),
    ${({ theme }) => theme.colors.gray1};
  padding: 0.9rem;
`

const PreviewResultHeader = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;

  > div:first-of-type {
    display: grid;
    gap: 0.16rem;
    min-width: 0;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.9rem;
    font-weight: 700;
    line-height: 1.3;
  }

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.76rem;
    line-height: 1.45;
  }

  @media (max-width: 1079px) {
    flex-direction: column;
  }
`

const PreviewViewportTabs = styled.div`
  display: inline-flex;
  flex-wrap: nowrap;
  gap: 0.4rem;
  max-width: 100%;
  overflow-x: auto;
  padding-bottom: 0.1rem;
`

const PreviewViewportButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray10};
  padding: 0 0.78rem;
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;

  &[data-active="true"] {
    border-color: ${({ theme }) => theme.colors.gray7};
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
    box-shadow: 0 0 0 1px ${({ theme }) => theme.colors.gray5} inset;
  }

  &:hover:not([data-active="true"]) {
    border-color: ${({ theme }) => theme.colors.gray8};
    color: ${({ theme }) => theme.colors.gray12};
  }
`

const PreviewResultFrame = styled.div`
  width: 100%;
  margin: 0 auto;
`

const PreviewVisibilityBadge = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  width: fit-content;
  border-radius: 999px;
  border: 1px solid rgba(45, 212, 191, 0.34);
  background: rgba(20, 184, 166, 0.12);
  color: #99f6e4;
  padding: 0 0.56rem;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1;
`

const PreviewResultCard = styled.article`
  overflow: hidden;
  width: 100%;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray4};
  background: ${({ theme }) => theme.colors.gray1};
  box-shadow: 0 10px 28px rgba(2, 6, 23, 0.22);

  .thumbnail {
    position: relative;
    aspect-ratio: ${THUMBNAIL_FRAME_ASPECT_RATIO} / 1;
    overflow: hidden;
    background:
      radial-gradient(circle at top left, rgba(96, 165, 250, 0.08), transparent 48%),
      ${({ theme }) => theme.colors.gray3};
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray4};
  }

  .thumbnail img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .thumbnail-placeholder {
    width: 100%;
    height: 100%;
    display: grid;
    place-content: center;
    gap: 0.28rem;
    padding: 1rem;
    text-align: center;
  }

  .thumbnail-placeholder em {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
    font-style: normal;
    font-weight: 700;
  }

  .thumbnail-placeholder span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.74rem;
    line-height: 1.45;
  }

  .content {
    display: grid;
    gap: 0.72rem;
    padding: 1rem;
  }

  h4 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1rem;
    font-weight: 760;
    line-height: 1.33;
    letter-spacing: -0.015em;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .summary {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.86rem;
    line-height: 1.55;
    min-height: calc(1.55em * 3);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .meta,
  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.65rem;
    flex-wrap: wrap;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.75rem;
  }

  .meta {
    padding-top: 0.05rem;
  }

  .meta .dot {
    opacity: 0.7;
  }

  .comment,
  .like,
  .author {
    display: inline-flex;
    align-items: center;
    gap: 0.34rem;
  }

  .author {
    min-width: 0;
  }

  .author strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.86rem;
    font-weight: 700;
  }

  .author .by {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.75rem;
    font-weight: 600;
  }

  .avatar {
    position: relative;
    flex: 0 0 1.85rem;
    width: 1.85rem;
    height: 1.85rem;
    border-radius: 999px;
    overflow: hidden;
    background: ${({ theme }) => theme.colors.gray4};
    border: 1px solid ${({ theme }) => theme.colors.gray5};
  }

  .initial {
    display: grid;
    place-content: center;
    width: 100%;
    height: 100%;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.72rem;
    font-weight: 800;
  }

  .like {
    color: ${({ theme }) => theme.colors.gray11};
    font-weight: 700;
  }
`

const PreviewEditorGrid = styled.div`
  display: grid;
  gap: 0.8rem;

  @media (min-width: 840px) {
    grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
    align-items: start;
  }
`

const CompactPublishEditorStack = styled.div`
  display: grid;
  gap: 0.7rem;
`

const CompactPublishEditorCard = styled.div`
  display: grid;
  gap: 0.62rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.gray2};
  padding: 0.72rem;
`

const CompactPublishEditorToggle = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
  width: 100%;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;

  > div {
    display: grid;
    gap: 0.14rem;
    min-width: 0;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.86rem;
    font-weight: 700;
    line-height: 1.3;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.76rem;
    line-height: 1.45;
  }

  > span:last-of-type {
    flex: 0 0 auto;
    color: ${({ theme }) => theme.colors.blue11};
    font-weight: 700;
  }
`

const PreviewEditorSection = styled.div`
  display: grid;
  gap: 0.58rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.gray2};
  padding: 0.85rem;
`

const PreviewEditorSectionHeader = styled.div`
  display: grid;
  gap: 0.14rem;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.86rem;
    font-weight: 700;
    line-height: 1.3;
  }

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.74rem;
    line-height: 1.45;
  }
`

const PreviewThumbFrame = styled.div`
  --preview-thumb-width: 100%;
  --preview-thumb-height: 100%;
  --preview-thumb-left: 0%;
  --preview-thumb-top: 0%;

  position: relative;
  width: min(100%, 360px);
  justify-self: start;
  aspect-ratio: ${THUMBNAIL_FRAME_ASPECT_RATIO} / 1;
  border-radius: ${({ theme }) => `${theme.variables.ui.card.radius}px`};
  border: ${({ theme }) => `${theme.variables.ui.card.borderWidth}px solid ${theme.colors.gray4}`};
  background: ${({ theme }) => theme.colors.gray4};
  overflow: hidden;
  user-select: none;
  isolation: isolate;

  &[data-draggable="true"] {
    cursor: grab;
    touch-action: none;
  }

  &[data-dragging="true"] {
    cursor: grabbing;
  }

  @media (max-width: 780px) {
    width: 100%;
  }

  img {
    position: absolute;
    display: block;
    pointer-events: none;
    user-select: none;
    touch-action: none;
    -webkit-user-drag: none;
    will-change: top, left, width, height;
  }

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0) 45%, rgba(0, 0, 0, 0.16) 100%);
    opacity: 0.9;
    pointer-events: none;
  }

  .placeholder {
    width: 100%;
    height: 100%;
    display: grid;
    place-content: center;
    text-align: center;
    gap: 0.24rem;
    padding: 0.7rem;

    em {
      font-style: normal;
      color: ${({ theme }) => theme.colors.gray10};
      font-weight: 700;
      font-size: 0.84rem;
    }

    span {
      color: ${({ theme }) => theme.colors.gray11};
      font-size: 0.74rem;
      line-height: 1.4;
    }
  }
`

const SummaryCounter = styled.span`
  justify-self: end;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.74rem;
  line-height: 1;
`

const SummaryActionStatus = styled.div`
  padding: 0.48rem 0.6rem;
  border-radius: 8px;
  font-size: 0.78rem;
  line-height: 1.45;

  &[data-tone="idle"] {
    color: ${({ theme }) => theme.colors.gray11};
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
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

const ZoomControlRow = styled.div`
  display: grid;
  gap: 0.42rem;
  align-items: start;
  justify-items: start;
  width: min(100%, 360px);

  @media (max-width: 780px) {
    width: 100%;
  }
`

const ZoomRangeInput = styled.input`
  width: 100%;
  accent-color: ${({ theme }) => theme.colors.blue9};
`

const ZoomValue = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  padding: 0 0.55rem;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.78rem;
  line-height: 1;
  font-weight: 700;
`

const ZoomControlMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
`

const MetaActionRow = styled.div`
  display: flex;
  gap: 0.55rem;
  flex-wrap: wrap;
`

const PublishSettingsSummary = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.36rem;
`

const SummaryPill = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  border-radius: 6px;
  padding: 0 0.48rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.74rem;
  font-weight: 600;
`

const ComposeReadableIntro = styled.div`
  width: min(100%, var(--article-readable-width, 48rem));
  max-width: 100%;
  margin-inline: auto;
  display: grid;
  gap: 1rem;
`

const ComposeSummaryField = styled.div`
  display: grid;
  gap: 0.45rem;
`

const ComposeSummaryInput = styled.textarea`
  width: 100%;
  min-height: 5.6rem;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 16px;
  padding: 0.95rem 1rem;
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 1rem;
  line-height: 1.7;
  resize: vertical;

  &::placeholder {
    color: ${({ theme }) => theme.colors.gray10};
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.gray7};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.blue4};
  }
`

const ComposeSummaryMeta = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
  flex-wrap: wrap;
`

const ComposeBodySection = styled.section`
  display: grid;
  gap: 0.82rem;
`

const ComposeBodyHeader = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.75rem;
  width: min(100%, var(--article-readable-width, 48rem));
  max-width: 100%;
  margin-inline: auto;
  padding-top: 0.2rem;

  @media (max-width: 720px) {
    flex-direction: column;
    align-items: flex-start;
  }
`

const ComposeBodyTitleGroup = styled.div`
  display: grid;
  gap: 0.14rem;

  h3 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.98rem;
    font-weight: 760;
    line-height: 1.3;
  }
`

const ComposeBodyMetrics = styled.div`
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.76rem;
  line-height: 1.4;
`

const ComposeSidebarSummaryText = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.84rem;
  line-height: 1.65;
  white-space: pre-line;
`

const FieldHelp = styled.span`
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.74rem;
  line-height: 1.45;

  @media (max-width: 720px) {
    display: none;
  }
`

const PublishNotice = styled.div`
  margin: 0;
  padding: 0.55rem 0.7rem;
  border-radius: 10px;
  font-size: 0.83rem;
  line-height: 1.4;
  width: 100%;
  box-sizing: border-box;

  &[data-tone="idle"] {
    color: ${({ theme }) => theme.colors.gray11};
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
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

  @media (max-width: 720px) {
    width: 100%;
  }
`

const MetadataStatus = styled.div`
  padding: 0.62rem 0.74rem;
  border-radius: 8px;
  font-size: 0.8rem;
  line-height: 1.5;

  &[data-tone="idle"] {
    color: ${({ theme }) => theme.colors.gray11};
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
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

const MetadataPanel = styled.div`
  display: grid;
  gap: 0.65rem;
  min-width: 0;
  padding: 0.55rem 0;
  border-radius: 0;
  border: none;
  background: transparent;

  label {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.84rem;
    font-weight: 700;
  }
`

const SelectionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  min-width: 0;
`

const SelectedTagChip = styled.span`
  display: inline-flex;
  align-items: stretch;
  gap: 0;
  min-width: 0;
  max-width: 100%;
  min-height: 2.1rem;
  border-radius: 999px;
  border: 1px solid var(--tag-chip-border, ${({ theme }) => theme.colors.blue8});
  background: var(--tag-chip-bg, ${({ theme }) => theme.colors.blue3});
  overflow: hidden;
  box-shadow: var(--tag-chip-shadow, none);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease,
    background 0.18s ease;

  &:hover {
    transform: none;
  }

  .label {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0.5rem 0.88rem;
    color: var(--tag-chip-text, ${({ theme }) => theme.colors.blue12});
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1.2;
  }

  > button {
    margin-left: 0;
  }

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: stretch;
    min-width: 2.05rem;
    padding: 0 0.58rem;
    border: 0;
    border-left: 1px solid var(--tag-chip-divider, rgba(147, 197, 253, 0.24));
    background: var(--tag-chip-button-bg, rgba(15, 23, 42, 0.16));
    color: var(--tag-chip-button-text, ${({ theme }) => theme.colors.blue11});
    cursor: pointer;
    flex: 0 0 auto;
    font-size: 0.98rem;
    line-height: 1;
    transition:
      transform 0.18s ease,
      background 0.18s ease,
      color 0.18s ease;

    &:hover {
      transform: none;
      background: rgba(15, 23, 42, 0.16);
      color: currentColor;
    }
  }
`

const TagCatalogChipGroup = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0;
  min-width: 0;
  max-width: 100%;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  overflow: hidden;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease,
    background 0.18s ease;

  &[data-active="true"] {
    border-color: var(--tag-chip-border, ${({ theme }) => theme.colors.blue8});
    background: var(--tag-chip-bg, ${({ theme }) => theme.colors.blue3});
    box-shadow: var(--tag-chip-shadow, none);
  }

  &:hover {
    transform: none;
  }
`

const TagCatalogToggle = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.46rem;
  min-width: 0;
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0.5rem 0.88rem;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease;

  .label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.35rem;
    min-height: 1.35rem;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.16);
    color: currentColor;
    font-size: 0.7rem;
    line-height: 1;
  }

  &:hover {
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &[data-active="true"] {
    color: var(--tag-chip-text, ${({ theme }) => theme.colors.blue12});

    &:hover {
      background: transparent;
      color: var(--tag-chip-text, ${({ theme }) => theme.colors.blue12});
    }

    .count {
      background: rgba(15, 23, 42, 0.2);
    }
  }
`

const TagCatalogDeleteButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  min-width: 2.05rem;
  padding: 0 0.58rem;
  border: 0;
  border-left: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  cursor: pointer;
  flex: 0 0 auto;
  font-size: 0.98rem;
  line-height: 1;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease;

  &[data-active="true"] {
    border-left-color: var(--tag-chip-divider, rgba(147, 197, 253, 0.24));
    background: var(--tag-chip-button-bg, rgba(15, 23, 42, 0.16));
    color: var(--tag-chip-button-text, ${({ theme }) => theme.colors.blue11});
  }

  &:hover:not(:disabled) {
    transform: none;
    background: ${({ theme }) => theme.colors.red3};
    color: ${({ theme }) => theme.colors.red11};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

const EmptyMetaText = styled.span`
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.78rem;
  line-height: 1.5;
`

const EditorToolbar = styled.div`
  display: grid;
  gap: 0.52rem;
  margin: 0 0 0.72rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.gray2};
`

const ToolbarQuickBar = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.38rem;
  row-gap: 0.48rem;
`

const ToolbarCluster = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  flex-wrap: wrap;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
`

const ToolbarDivider = styled.span`
  width: 1px;
  align-self: stretch;
  min-height: 1.9rem;
  background: ${({ theme }) => theme.colors.gray7};
  margin: 0 0.2rem;
`

const ToolbarIconButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.28rem;
  min-height: 2.28rem;
  padding: 0 0.48rem;
  border-radius: 6px;
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  cursor: pointer;
  font-size: 0.92rem;
  font-weight: 650;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    transform 0.12s ease;

  svg {
    width: 1rem;
    height: 1rem;
  }

  .textIcon {
    font-size: 0.76rem;
    letter-spacing: -0.01em;
    font-weight: 700;

    &.strong {
      font-weight: 800;
      font-size: 0.92rem;
    }

    &.italic {
      font-style: italic;
      font-size: 0.9rem;
    }

    &.strike {
      text-decoration: line-through;
      font-size: 0.88rem;
    }

    &.code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
  }

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.gray4};
    color: ${({ theme }) => theme.colors.gray12};
    transform: none;
  }

  &[data-active="true"] {
    background: ${({ theme }) => theme.colors.blue4};
    color: ${({ theme }) => theme.colors.blue11};
  }

  &[data-variant="primary"] {
    background: ${({ theme }) => theme.colors.blue4};
    color: ${({ theme }) => theme.colors.blue11};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none;
  }

  @media (max-width: 720px) {
    min-width: 2.38rem;
    min-height: 2.38rem;
  }
`

const CalloutDropdown = styled.div`
  position: relative;
`

const ColorDropdown = styled(CalloutDropdown)``

const CalloutMenu = styled.div`
  position: absolute;
  z-index: 20;
  top: calc(100% + 0.35rem);
  left: 0;
  min-width: 10rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.gray2};
  box-shadow: none;
  padding: 0.3rem;
  display: grid;
  gap: 0.25rem;

  button {
    border: 1px solid transparent;
    border-radius: 8px;
    min-height: 36px;
    padding: 0.48rem 0.6rem;
    text-align: left;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray12};
    cursor: pointer;
    font-size: 0.84rem;

    &:hover {
      background: ${({ theme }) => theme.colors.gray3};
      border-color: ${({ theme }) => theme.colors.gray6};
    }
  }
`

const ColorMenu = styled(CalloutMenu)`
  min-width: 9.2rem;

  button {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }
`

const ColorSwatch = styled.span`
  width: 0.88rem;
  height: 0.88rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.24);
`

const ComposeViewSwitch = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.32rem;
  margin-bottom: 0.72rem;
  padding: 0.26rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};

  @media (max-width: 720px) {
    width: 100%;
    justify-content: stretch;
  }
`

const ComposeViewSwitchButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.44rem;
  min-height: 40px;
  padding: 0 0.78rem;
  border-radius: 10px;
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.78rem;
  font-weight: 700;
  transition: background-color 0.16s ease, color 0.16s ease;

  svg {
    font-size: 1rem;
  }

  &[data-active="true"] {
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
  }

  @media (max-width: 720px) {
    flex: 1 1 0;
    justify-content: center;
    padding: 0 0.58rem;
  }
`

const SplitViewGlyph = styled.span`
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.16rem;
  width: 1rem;
  height: 1rem;

  span {
    border-radius: 3px;
    border: 1.5px solid currentColor;
  }
`

const EditorGrid = styled.div`
  --pane-body-height: clamp(28rem, calc(100vh - 20rem), 46rem);
  --compose-readable-width: var(--article-readable-width, 48rem);
  --compose-pane-readable-width: var(--compose-readable-width);
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.85rem;
  border: 0;
  border-radius: 0;
  background: transparent;
  overflow: visible;
  align-items: stretch;

  &[data-view-mode="editor"],
  &[data-view-mode="preview"] {
    width: min(100%, calc(var(--compose-pane-readable-width) + 2rem));
    margin-inline: auto;
  }

  &[data-view-mode="split"] {
    --compose-pane-readable-width: min(var(--editor-split-readable-width, 42rem), calc((100vw - 7rem) / 2));
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  @media (max-width: 1024px) {
    --pane-body-height: clamp(18rem, 52vh, 34rem);
    --compose-pane-readable-width: var(--compose-readable-width);
    grid-template-columns: 1fr;
    gap: 0.78rem;
  }
`

const ListPanel = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.gray1};
  padding: 0.82rem;
  margin: 0;
  min-width: 0;
  display: grid;
  gap: 0.62rem;

  @media (max-width: 720px) {
    &[data-mobile-visible="false"] {
      display: none;
    }
  }
`

const ListHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.64rem;
  margin-bottom: 0.75rem;

  h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 720;
    color: ${({ theme }) => theme.colors.gray12};
  }

  span {
    font-size: 0.8rem;
    color: ${({ theme }) => theme.colors.gray11};
  }

  @media (max-width: 920px) {
    flex-direction: column;
  }
`

const ListHeaderActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: flex-end;
  align-items: center;

  span {
    display: inline-flex;
    align-items: center;
    min-height: 34px;
    padding: 0 0.72rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.8rem;
    font-weight: 700;
    white-space: nowrap;
  }

  @media (max-width: 920px) {
    justify-content: flex-start;
  }

  @media (max-width: 720px) {
    width: 100%;

    span {
      width: 100%;
      margin-right: 0;
    }

    > button {
      width: 100%;
      justify-content: center;
    }
  }
`

const ReadOnlyHint = styled.span`
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray11};
  min-height: 28px;
  padding: 0 0.58rem;
  font-size: 0.72rem;
  font-weight: 600;
`

const ListEmpty = styled.div`
  margin: 0;
  min-height: 13.5rem;
  display: grid;
  place-items: center;
  text-align: center;
  padding: 0.8rem 1rem;
  border-radius: 10px;
  border: 1px dashed ${({ theme }) => theme.colors.gray6};
  color: ${({ theme }) => theme.colors.gray11};
  gap: 0.72rem;

  p {
    margin: 0;
    font-size: 0.86rem;
    line-height: 1.65;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
  }
`

const ListTableWrap = styled.div`
  width: 100%;
  overflow-x: auto;
  overflow-y: auto;
  max-height: 52vh;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 10px;
  overscroll-behavior: contain;

  @media (max-width: 1100px) {
    display: none;
  }
`

const SelectedPostPanel = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.gray1};
  padding: 0.72rem;
  margin: 0;
  box-shadow: none;

  @media (min-width: 1320px) {
    position: sticky;
    top: calc(var(--app-header-height, 56px) + 0.72rem);
  }

  @media (max-width: 420px) {
    border-radius: 10px;
    padding: 0.68rem;
  }

  @media (max-width: 720px) {
    &[data-mobile-visible="false"] {
      display: none;
    }
  }
`

const SelectedPostHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.72rem;

  h3 {
    margin: 0;
    font-size: 0.94rem;
    font-weight: 720;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0.24rem 0 0;
    font-size: 0.76rem;
    line-height: 1.45;
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
  padding: 0.3rem 0.62rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.74rem;
  font-weight: 700;
  white-space: nowrap;

  @media (max-width: 420px) {
    white-space: normal;
    line-height: 1.45;
  }
`

const SelectedPostGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.7rem;
`

const SelectedPostStateCard = styled.div`
  display: grid;
  gap: 0.52rem;
  padding: 0.72rem 0.76rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  margin-bottom: 0.72rem;

  &[data-tone="active"] {
    border-color: ${({ theme }) => theme.colors.blue7};
    background: ${({ theme }) => theme.colors.blue3};
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.84rem;
    font-weight: 760;
    line-height: 1.45;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.76rem;
    line-height: 1.58;
  }

  .headline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.55rem;
    flex-wrap: wrap;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.42rem;
  }

  .meta span {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    padding: 0 0.62rem;
    font-size: 0.74rem;
    font-weight: 700;
  }
`

const SelectedPostHint = styled.p`
  margin: 0.1rem 0 0;
  font-size: 0.74rem;
  color: ${({ theme }) => theme.colors.gray11};
  line-height: 1.45;
`

const SubActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.65rem;
  padding-top: 0.65rem;
  border-top: 1px dashed ${({ theme }) => theme.colors.gray6};

  > button {
    border-style: dashed;
  }

  @media (max-width: 720px) {
    display: grid;
    grid-template-columns: 1fr;

    > button {
      width: 100%;
      justify-content: center;
    }
  }
`

const SelectionStickyBar = styled.div`
  position: sticky;
  top: 0;
  z-index: 2;
  margin: 0 0 0.68rem;
  padding: 0.55rem 0.62rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.gray2};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.8rem;
  }

  > div {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  @media (max-width: 900px) {
    top: calc(var(--app-header-height, 56px) + 0.35rem);
  }
`

const ListTable = styled.table`
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
  table-layout: fixed;

  th,
  td {
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
    padding: 0.5rem 0.45rem;
    text-align: left;
    font-size: 0.8rem;
    color: ${({ theme }) => theme.colors.gray12};
    vertical-align: middle;
  }

  th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: ${({ theme }) => theme.colors.gray2};
    font-size: 0.75rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-weight: 700;
  }

  tbody tr:last-of-type td {
    border-bottom: 0;
  }

  tbody tr {
    transition: background-color 0.18s ease, box-shadow 0.18s ease;
  }

  tbody tr:hover td {
    background: rgba(255, 255, 255, 0.02);
  }

  tbody tr[data-active="true"] td {
    background:
      linear-gradient(90deg, rgba(59, 130, 246, 0.14) 0, rgba(59, 130, 246, 0.04) 28px, rgba(255, 255, 255, 0.02) 28px);
  }

  .checkboxCell {
    width: 2rem;
    text-align: center;
    padding-left: 0.2rem;
    padding-right: 0.2rem;
  }

  th.idCell,
  td.idCell {
    width: 4.75rem;
    white-space: nowrap;
  }

  input[type="checkbox"] {
    width: 0.92rem;
    height: 0.92rem;
    cursor: pointer;
    accent-color: ${({ theme }) => theme.colors.blue9};
  }

  td.title {
    min-width: 0;
  }

  th.dateCell,
  td.dateCell {
    width: 112px;
    white-space: nowrap;
  }

  th.actionsCell,
  td.actionsCell {
    width: 132px;
    min-width: 132px;
  }

  @media (max-width: 1520px) {
    th.actionsCell,
    td.actionsCell {
      width: 124px;
      min-width: 124px;
    }
  }
`

const TitleCell = styled.div`
  display: grid;
  gap: 0.36rem;
  max-width: 100%;
  min-width: 0;

  .titleMain {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    flex-wrap: wrap;
  }

  .text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: ${({ theme }) => theme.colors.gray12};
    font-weight: 700;
  }

  .meta {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.72rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .inlineVisibility {
    display: inline-flex;
  }
`

const DeletedBadge = styled.span`
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.12rem 0.42rem;
  flex: 0 0 auto;
`

const LoadedBadge = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.blue7};
  background: ${({ theme }) => theme.colors.blue3};
  color: ${({ theme }) => theme.colors.blue11};
  padding: 0 0.5rem;
  font-size: 0.7rem;
  font-weight: 800;
  line-height: 1;
  flex: 0 0 auto;
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
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  color: ${({ theme }) => theme.colors.gray11};
  background: ${({ theme }) => theme.colors.gray2};

  &[data-tone="PRIVATE"] {
    color: ${({ theme }) => theme.colors.gray11};
  }

  &[data-tone="PUBLIC_UNLISTED"] {
    color: ${({ theme }) => theme.colors.blue11};
    border-color: ${({ theme }) => theme.colors.blue7};
    background: ${({ theme }) => theme.colors.blue3};
  }

  &[data-tone="PUBLIC_LISTED"] {
    color: ${({ theme }) => theme.colors.green11};
    border-color: ${({ theme }) => theme.colors.green7};
    background: ${({ theme }) => theme.colors.green3};
  }
`

const InlineActions = styled.div`
  display: grid;
  gap: 0.42rem;
  align-items: stretch;
`

const RowActionButton = styled(Button)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.42rem;
  width: 100%;
  min-height: 40px;
  padding: 0.42rem 0.62rem;
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;

  svg {
    flex: 0 0 auto;
  }

  span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &[data-variant="primary"] {
    border-color: ${({ theme }) => theme.colors.blue8};
    background: ${({ theme }) => theme.colors.blue3};
    color: ${({ theme }) => theme.colors.blue11};
  }

  &[data-variant="primary"]:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.blue9};
    background: ${({ theme }) => theme.colors.blue4};
    color: ${({ theme }) => theme.colors.blue12};
  }

  &[data-variant="soft-danger"] {
    border-color: rgba(239, 68, 68, 0.38);
    background: rgba(127, 29, 29, 0.16);
    color: ${({ theme }) => theme.colors.red11};
  }

  &[data-variant="soft-danger"]:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.red8};
    background: ${({ theme }) => theme.colors.red3};
    color: ${({ theme }) => theme.colors.red11};
  }

  &[data-variant="subtle-danger"] {
    border-color: transparent;
    background: transparent;
    color: ${({ theme }) => theme.colors.red10};
  }

  &[data-variant="subtle-danger"]:hover:not(:disabled) {
    border-color: rgba(239, 68, 68, 0.22);
    background: rgba(127, 29, 29, 0.12);
    color: ${({ theme }) => theme.colors.red11};
  }
`

const RowActionMenu = styled.details`
  position: relative;

  summary {
    list-style: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    width: 100%;
    min-height: 40px;
    border-radius: 8px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.76rem;
    font-weight: 700;
    cursor: pointer;

    &::-webkit-details-marker {
      display: none;
    }
  }

  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 0.3rem);
    z-index: 8;
    display: grid;
    min-width: 7rem;
    padding: 0.32rem;
    border-radius: 10px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    box-shadow: none;
  }

  .menu button {
    min-height: 36px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: ${({ theme }) => theme.colors.red11};
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
  }

  .menu button:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.red3};
  }

  .menu button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

const MobileListCards = styled.div`
  display: none;
  margin-top: 0.65rem;

  @media (max-width: 1100px) {
    display: grid;
    gap: 0.6rem;
  }

  article {
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    border-radius: 10px;
    padding: 0.62rem;
    background: ${({ theme }) => theme.colors.gray2};
    display: grid;
    gap: 0.5rem;
    content-visibility: auto;
    contain-intrinsic-size: 1px 172px;
    transition: background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
  }

  article[data-active="true"] {
    border-color: ${({ theme }) => theme.colors.blue7};
    background: ${({ theme }) => theme.colors.blue3};
    box-shadow: none;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.45rem;
  }

  .metaLeading {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }

  .metaLeading input[type="checkbox"] {
    width: 1rem;
    height: 1rem;
    accent-color: ${({ theme }) => theme.colors.gray10};
  }

  h4 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.9rem;
    line-height: 1.45;
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  p {
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
  }

  .metaLine {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.42rem;

    .dot {
      margin: 0 0.26rem;
      opacity: 0.65;
    }
  }

  .mainAction {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.42rem;
  }

  .mainAction > button {
    width: 100%;
    justify-content: center;
  }

  .rowId {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
  }

  @media (max-width: 420px) {
    gap: 0.52rem;

    article {
      padding: 0.56rem;
    }

    p {
      align-items: flex-start;
      flex-wrap: wrap;
      justify-content: flex-start;
    }

    .mainAction {
      grid-template-columns: 1fr;
    }
  }
`

const UndoToast = styled.div`
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 140;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.72rem;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.8rem;
  }

  @media (max-width: 720px) {
    left: 0.85rem;
    right: 0.85rem;
    bottom: calc(0.85rem + env(safe-area-inset-bottom));
    flex-wrap: wrap;
  }
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

  &[data-variant="drawer"] {
    justify-content: flex-end;
    padding: 0;
  }
`

const ConfirmModal = styled.div`
  width: min(440px, 100%);
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  padding: 1rem;
  display: grid;
  gap: 0.75rem;

  .header {
    display: grid;
    gap: 0.5rem;
  }

  h4 {
    margin: 0;
    font-size: 1rem;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.45;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
`

const PublishModal = styled.div`
  width: min(1120px, calc(100vw - 2rem));
  max-height: min(86vh, 920px);
  overflow: auto;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  padding: 1rem 1rem 0;
  display: grid;
  gap: 0.8rem;

  &[data-variant="drawer"] {
    width: min(560px, 100vw);
    max-height: 100vh;
    height: 100vh;
    border-radius: 0;
    border-left: 1px solid ${({ theme }) => theme.colors.gray6};
    border-right: 0;
    border-top: 0;
    border-bottom: 0;
    padding-top: max(1rem, env(safe-area-inset-top, 0px));
    padding-bottom: 0;
  }

  @media (max-width: 720px) {
    width: min(100%, 34rem);
    max-height: min(92vh, 980px);
    padding: 0.82rem 0.82rem 0;
    gap: 0.78rem;
  }
`

const PublishModalHeader = styled.div`
  display: grid;
  gap: 0.75rem;

  h4 {
    margin: 0;
    font-size: 1.08rem;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0.24rem 0 0;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.8rem;
    line-height: 1.5;
  }
`

const PublishModalBody = styled.div`
  display: grid;
  gap: 0.8rem;
  padding-bottom: 0.6rem;

  @media (max-width: 720px) {
    gap: 0.7rem;
  }
`

const PublishModeHint = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray11};
  border-radius: 12px;
  padding: 0.62rem 0.74rem;
  font-size: 0.8rem;
  line-height: 1.5;
`

const PublishModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  flex-wrap: wrap;
  position: sticky;
  bottom: 0;
  z-index: 2;
  margin: 0 -1rem;
  padding: 0.9rem 1rem 1rem;
  border-top: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  box-shadow: 0 -10px 28px rgba(2, 6, 23, 0.12);

  @media (max-width: 720px) {
    margin: 0 -0.82rem;
    padding: 0.82rem 0.82rem calc(0.9rem + env(safe-area-inset-bottom, 0px));
  }
`

const EditorStudioRoot = styled.main`
  width: min(100%, 1600px);
  margin: 0 auto;
  padding: 1.4rem 1.6rem 2rem;
  display: grid;
  gap: 1.2rem;

  @media (max-width: 1024px) {
    padding: 1rem 1rem 1.4rem;
  }
`

const EditorStudioLoadingState = styled.div`
  min-height: calc(100vh - 10rem);
  display: grid;
  place-content: center;
  gap: 0.4rem;
  text-align: center;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.1rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.9rem;
  }
`

const EditorStudioTopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 48px;

  @media (max-width: 1120px) {
    align-items: flex-start;
    flex-direction: column;
  }
`

const EditorStudioTopBarActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: flex-end;

  @media (max-width: 1120px) {
    width: 100%;
    justify-content: space-between;
  }
`

const EditorStudioSaveState = styled.span`
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.84rem;
  font-weight: 600;

  &[data-tone="success"] {
    color: ${({ theme }) => theme.colors.green10};
  }

  &[data-tone="loading"] {
    color: ${({ theme }) => theme.colors.blue9};
  }

  &[data-tone="error"] {
    color: ${({ theme }) => theme.colors.red10};
  }
`

const EditorStudioViewSwitch = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.32rem;
  padding: 0.26rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};

  @media (max-width: 1120px) {
    order: 2;
  }
`

const EditorStudioFrame = styled.div<{ $viewMode: ComposeViewMode; $splitAvailable: boolean }>`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${({ $viewMode }) => ($viewMode === "split" ? "2rem" : "1.4rem")};
  align-items: start;

  @media (min-width: 1024px) {
    grid-template-columns: ${({ $viewMode, $splitAvailable }) =>
      $splitAvailable && $viewMode === "split"
        ? "minmax(0, 1fr) minmax(22rem, 0.82fr)"
        : "minmax(0, 1fr)"};
  }
`

const EditorStudioWritingColumn = styled.section<{ $viewMode: ComposeViewMode }>`
  ${({ $viewMode }) => ($viewMode === "preview" ? "display: none;" : "display: grid;")}
  min-width: 0;
  gap: 1rem;
`

const EditorStudioMetaSection = styled.section`
  width: min(100%, var(--article-readable-width, 48rem));
  display: grid;
  gap: 0.9rem;
`

const EditorTagRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem;
  min-height: 40px;
  padding-bottom: 0.45rem;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray5};
`

const EditorStudioCanvas = styled.section`
  width: min(100%, var(--article-readable-width, 48rem));
  min-height: clamp(28rem, 70vh, 56rem);
  display: grid;
  gap: 0.72rem;
`

const EditorStudioLegacyToolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  padding-bottom: 0.35rem;
`

const RawEditorSection = styled.div`
  display: grid;
  gap: 0.72rem;
`

const RawMarkdownTextarea = styled.textarea`
  width: 100%;
  min-height: 18rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  padding: 0.95rem 1rem;
  resize: vertical;
  line-height: 1.7;
  font-size: 0.94rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue8};
  }
`

const EditorStudioPreviewColumn = styled.aside<{ $viewMode: ComposeViewMode; $splitAvailable: boolean }>`
  ${({ $viewMode }) => ($viewMode === "editor" ? "display: none;" : "display: grid;")}
  position: ${({ $viewMode, $splitAvailable }) =>
    $splitAvailable && $viewMode === "split" ? "sticky" : "static"};
  top: calc(var(--app-header-height, 64px) + 1rem);
  min-width: 0;
  gap: 0.8rem;

  @media (max-width: 1023px) {
    display: ${({ $viewMode }) => ($viewMode === "preview" ? "grid" : "none")};
    position: static;
  }
`

const EditorStudioPreviewHeader = styled.div<{ $compact?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  min-width: 0;

  strong {
    display: block;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: ${({ $compact }) => ($compact ? "0.92rem" : "0.95rem")};
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: ${({ $compact }) => ($compact ? "0.76rem" : "0.78rem")};
  }

  @media (max-width: 720px) {
    flex-direction: column;
    align-items: flex-start;
  }
`

const EditorStudioPreviewSurface = styled.section`
  border: 0;
  border-radius: 0;
  background: transparent;
  overflow: hidden;
  min-width: 0;
`

const EditorStudioPreviewArticle = styled.article`
  display: grid;
  gap: 0;
  min-width: 0;
`

const EditorStudioPreviewArticleHeader = styled.header<{ $compact?: boolean }>`
  display: grid;
  gap: ${({ $compact }) => ($compact ? "0.7rem" : "0.9rem")};
  padding: 0 0 ${({ $compact }) => ($compact ? "0.85rem" : "1rem")};
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray5};
  min-width: 0;

  .cover {
    border-radius: 16px;
    overflow: hidden;
    aspect-ratio: 16 / 9;
    background: ${({ theme }) => theme.colors.gray3};
  }

  .cover img {
    width: 100%;
    height: 100%;
  }

  h1 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: ${({ $compact }) =>
      $compact ? "clamp(1.24rem, 1rem + 0.8vw, 1.72rem)" : "clamp(1.75rem, 1.2rem + 1.8vw, 2.45rem)"};
    line-height: 1.14;
    letter-spacing: -0.03em;
    overflow-wrap: anywhere;
  }

  .summary {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: ${({ $compact }) => ($compact ? "0.88rem" : "0.98rem")};
    line-height: ${({ $compact }) => ($compact ? "1.55" : "1.75")};
    overflow-wrap: anywhere;
    ${({ $compact }) =>
      $compact
        ? `
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    `
        : ""}
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .tags span {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 0 0.72rem;
    border-radius: 999px;
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.74rem;
    font-weight: 600;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
  }

  .dot {
    opacity: 0.55;
  }
`

const EditorStudioPreviewArticleBody = styled.div<{ $compact?: boolean }>`
  max-height: ${({ $compact }) => ($compact ? "calc(100vh - 14rem)" : "calc(100vh - 15rem)")};
  overflow-y: auto;
  overflow-x: hidden;
  padding: ${({ $compact }) => ($compact ? "0.95rem 0 1.1rem" : "1.1rem 0 1.4rem")};
  min-width: 0;

  > div {
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }

  > div > .aq-markdown {
    width: 100%;
    margin: 0 auto;
    min-width: 0;
    overflow-x: hidden;
  }

  > div > .aq-markdown .aq-table-shell,
  > div > .aq-markdown .aq-table-scroll {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }

  > div > .aq-markdown .aq-table-scroll {
    overscroll-behavior-x: contain;
  }

  @media (max-width: 1200px) {
    max-height: none;
  }
`

const EditorStudioResultPanel = styled.section`
  width: min(100%, var(--article-readable-width, 48rem));
  border-top: 1px solid ${({ theme }) => theme.colors.gray5};
  padding-top: 0.9rem;

  details {
    display: grid;
    gap: 0.75rem;
  }

  summary {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.8rem;
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.92rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.76rem;
  }
`

const EditorPane = styled.section`
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.gray2};
  overflow: hidden;
  transition: border-color 0.16s ease;

  &:focus-within {
    border-color: ${({ theme }) => theme.colors.blue8};
  }
`

const PreviewPane = styled(EditorPane)`
  border-color: ${({ theme }) => theme.colors.gray7};
  background: ${({ theme }) => theme.colors.gray1};

  @media (max-width: 760px) {
    border-left: 1px solid ${({ theme }) => theme.colors.gray7};
    border-top: 1px solid ${({ theme }) => theme.colors.gray7};
  }
`

const PaneHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0;
  padding: 0.9rem 1rem 0.78rem;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
`

const PaneTitle = styled.h3`
  margin: 0;
  font-size: 1.04rem;
  color: ${({ theme }) => theme.colors.gray12};
`

const PaneChip = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray3};
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.72rem;
  font-weight: 700;
  min-height: 26px;
  padding: 0 0.62rem;
`

const ContentInput = styled.textarea`
  width: min(100%, calc(var(--compose-pane-readable-width) + 2rem));
  height: var(--pane-body-height);
  min-height: var(--pane-body-height);
  max-height: var(--pane-body-height);
  border: 0;
  border-radius: 0;
  margin: 0 auto;
  padding: 1rem 1rem 1.15rem;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};
  line-height: 1.82;
  font-size: 1.02rem;
  font-family: inherit;
  resize: none;
  overflow-y: auto;
  scrollbar-gutter: stable both-edges;
  box-sizing: border-box;
  box-shadow: none;

  &:focus {
    outline: none;
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.gray9};
  }
`

const PreviewContentFrame = styled.div<{ $compact?: boolean }>`
  width: ${({ $compact }) =>
    $compact ? "100%" : "min(100%, var(--compose-pane-readable-width), var(--preview-live-width))"};
  max-width: 100%;
  min-width: 0;
  margin-inline: auto;
  overflow-x: hidden;

  > .aq-markdown {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow-x: hidden;
  }

  ${({ $compact, theme }) =>
    $compact
      ? `
    > .aq-markdown {
      font-size: 0.96rem;
      line-height: 1.72;
    }

    > .aq-markdown h1,
    > .aq-markdown h2,
    > .aq-markdown h3,
    > .aq-markdown h4,
    > .aq-markdown p,
    > .aq-markdown ul,
    > .aq-markdown ol,
    > .aq-markdown blockquote,
    > .aq-markdown pre,
    > .aq-markdown table,
    > .aq-markdown .aq-mermaid-stage {
      max-width: 100%;
      min-width: 0;
    }

    > .aq-markdown h1 {
      font-size: 1.7rem;
      line-height: 1.15;
      margin-top: 0;
    }

    > .aq-markdown h2 {
      font-size: 1.34rem;
      line-height: 1.22;
      margin-top: 1.8rem;
    }

    > .aq-markdown h3 {
      font-size: 1.12rem;
      line-height: 1.28;
      margin-top: 1.5rem;
    }

    > .aq-markdown p,
    > .aq-markdown li,
    > .aq-markdown blockquote {
      font-size: 0.96rem;
      line-height: 1.72;
      color: ${theme.colors.gray11};
    }

    > .aq-markdown img,
    > .aq-markdown video,
    > .aq-markdown iframe,
    > .aq-markdown pre,
    > .aq-markdown table {
      max-width: 100%;
    }
  `
      : ""}
`

const PreviewCard = styled.div`
  height: var(--pane-body-height);
  min-height: var(--pane-body-height);
  max-height: var(--pane-body-height);
  overflow: auto;
  scrollbar-gutter: stable both-edges;
  padding: 1rem 1rem 1.15rem;
  box-sizing: border-box;
  background: transparent;

  > ${PreviewContentFrame} {
    min-width: 0;
  }

  > ${PreviewContentFrame} > .aq-markdown {
    width: 100%;
    margin-top: 0;
    margin-inline: 0;
  }
`

const PreviewHintNotice = styled.div`
  margin-bottom: 0.75rem;
  padding: 0.52rem 0.62rem;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.78rem;
  line-height: 1.5;
`

const WriterFooterBar = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.8rem;
  flex-wrap: wrap;
  margin-top: 0.84rem;
  padding-top: 0.72rem;
  border-top: 1px solid ${({ theme }) => theme.colors.gray6};
`

const WriterFooterSummary = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.52rem 0.72rem;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.76rem;
  line-height: 1.45;
`

const WriterFooterControls = styled.div`
  display: grid;
  gap: 0.52rem;
  justify-items: stretch;
  flex: 1 1 34rem;
  width: min(100%, 48rem);
  min-width: min(100%, 34rem);
  max-width: 100%;
  margin-left: auto;

  @media (max-width: 720px) {
    width: 100%;
    min-width: 100%;
  }
`

const WriterFooterActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  justify-content: flex-end;
  align-items: center;

  @media (max-width: 720px) {
    display: none;
  }
`

const MobilePrimaryActionBar = styled.div`
  display: none;

  @media (max-width: 720px) {
    position: fixed;
    left: max(0.72rem, env(safe-area-inset-left, 0px));
    right: max(0.72rem, env(safe-area-inset-right, 0px));
    bottom: calc(0.72rem + env(safe-area-inset-bottom, 0px));
    z-index: 145;
    display: grid;
    gap: 0.42rem;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    border-radius: 12px;
    background: ${({ theme }) => theme.colors.gray2};
    padding: 0.54rem;
    box-shadow: 0 12px 28px rgba(2, 6, 23, 0.28);

    > button {
      width: 100%;
      justify-content: center;
      min-height: 40px;
    }
  }
`

const ResultPanel = styled.pre`
  margin: 0;
  padding: 1rem;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.82rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 160px;
`

const DevConsoleSection = styled.section`
  margin-top: 1rem;
  border-radius: 0;
  border: 0;
  border-top: 1px solid ${({ theme }) => theme.colors.gray6};
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  overflow: hidden;

  details {
    display: grid;
  }

  summary {
    list-style: none;
    cursor: pointer;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 0.95rem 1rem;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  strong {
    display: block;
    margin-top: 0.18rem;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.96rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.78rem;
    line-height: 1.5;
    white-space: nowrap;
  }

  > details > pre {
    margin: 0 1rem 1rem;
  }

  @media (max-width: 720px) {
    summary {
      flex-direction: column;
    }

    span {
      white-space: normal;
    }
  }
`
