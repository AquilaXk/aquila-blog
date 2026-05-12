import styled from "@emotion/styled"
import { useQueryClient } from "@tanstack/react-query"
import { GetServerSideProps, NextPage } from "next"
import { useRouter } from "next/router"
import {
  ChangeEvent,
  useDeferredValue,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react"
import { apiFetch, getApiBaseUrl } from "src/apis/backend/client"
import { invalidatePublicPostReadCaches } from "src/apis/backend/posts"
import useAuthSession, { type AuthMember } from "src/hooks/useAuthSession"
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
  deriveComposeViewModel,
  deriveEditorContentMetrics,
  deriveEditorPersistenceState,
  derivePublishActionViewModel,
  getVisibilityLabel,
  toFlags,
  toVisibility,
  type EditorMode,
  type PostVisibility,
  type PublishActionType,
} from "./editorStudioState"
import { WriterEditorHost } from "./WriterEditorHost"
import { useEditorStudioDraftLifecycle } from "./useEditorStudioDraftLifecycle"
import { useEditorStudioPersistence } from "./useEditorStudioPersistence"
import { useEditorStudioRouting } from "./useEditorStudioRouting"
import { useEditorStudioThumbnailControls } from "./useEditorStudioThumbnailControls"
import { useEditorStudioThumbnailPreview } from "./useEditorStudioThumbnailPreview"
import {
  EditorStudioThumbnailEditorPanel,
  EditorStudioThumbnailMetaPanel,
} from "./EditorStudioThumbnailPanels"
import { EditorStudioPublishModal } from "./EditorStudioPublishModal"
import { EditorStudioComposeAssistantPanel } from "./EditorStudioComposeAssistantPanel"
import { EditorStudioMetadataAssistantPanel } from "./EditorStudioMetadataAssistantPanel"
import { EditorStudioSelectedPostPanel } from "./EditorStudioSelectedPostPanel"
import { EditorStudioSelectedPostToolsPanel } from "./EditorStudioSelectedPostToolsPanel"
import { EditorStudioLegacyProfileSection } from "./EditorStudioLegacyProfileSection"
import { EditorStudioLegacyUtilityPanel } from "./EditorStudioLegacyUtilityPanel"
import { EditorStudioResultLogPanel } from "./EditorStudioResultLogPanel"
import { EditorStudioPostQueryPanel } from "./EditorStudioPostQueryPanel"
import { EditorStudioPostListPanel } from "./EditorStudioPostListPanel"
import { EditorStudioMobileStepNavigator } from "./EditorStudioMobileStepNavigator"
import { EditorStudioUndoToast } from "./EditorStudioUndoToast"
import { EditorStudioDeleteConfirmDialog } from "./EditorStudioDeleteConfirmDialog"
import {
  isServerTempDraftPost,
  TEMP_DRAFT_BODY_PLACEHOLDER,
} from "./editorTempDraft"
import {
  PREVIEW_SUMMARY_MAX_CONTENT_LENGTH,
  PREVIEW_SUMMARY_MAX_LENGTH,
  buildEditorStateFingerprint,
  buildLocalDraftFingerprint,
  composeEditorContent,
  computeContentFingerprint,
  dedupeStrings,
  detectPublishPlaceholderIssue,
  extractFirstMarkdownImage,
  formatTagRecommendationReason,
  makePreviewSummary,
  normalizeRecommendedTags,
  normalizeSafeImageUrl,
  normalizeSafePreviewThumbnailUrl,
  resolveEditorMetaSnapshot,
  resolveTagRecommendationErrorMessage,
  type LocalDraftPayload,
  type MetaUsageMap,
  type ResolvedEditorMetaSnapshot,
} from "./editorStudioMetaModel"
import {
  pushRoute,
  replaceShallowRoutePreservingScroll,
} from "src/libs/router"
import { toCanonicalPostPath } from "src/libs/utils/postPath"
import {
  AdminPageProps,
  buildAdminPagePropsFromMember,
  getAdminPageProps,
  readAdminProtectedBootstrap,
} from "src/libs/server/adminPage"
import ProfileImage from "src/components/ProfileImage"
import {
  applyThumbnailTransformToUrl,
  clampThumbnailZoom,
  DEFAULT_THUMBNAIL_FOCUS_X,
  DEFAULT_THUMBNAIL_FOCUS_Y,
  DEFAULT_THUMBNAIL_ZOOM,
  stripThumbnailFocusFromUrl,
} from "src/libs/thumbnailFocus"
import {
  buildImageOptimizationSummary,
  normalizeProfileImageUploadError,
  prepareProfileImageForUpload,
  POST_IMAGE_UPLOAD_RULE_LABEL,
  PROFILE_IMAGE_UPLOAD_RULE_LABEL,
} from "src/libs/profileImageUpload"
import { saveProfileCardWithConflictRetry } from "src/libs/profileCardSave"
import { articleTypographyScale } from "src/libs/markdown/contentTypography"
import type { BlockEditorChangeMeta } from "src/components/editor/blockEditorContract"
import {
  CATEGORY_CATALOG_STORAGE_KEY,
  TAG_CATALOG_STORAGE_KEY,
  persistCatalog,
  persistLocalDraft,
  readLocalDraft,
  readStoredCatalog,
  removeLocalDraft,
} from "./editorStudioStorageModel"

const BLOCK_EDITOR_V2_MERMAID_ENABLED = process.env.NEXT_PUBLIC_EDITOR_V2_MERMAID_ENABLED !== "false"
const ADMIN_POSTS_WORKSPACE_ROUTE = "/admin/posts"
const EDITOR_NEW_ROUTE_PATH = "/editor/new"

const toEditorPostRoute = (id: string | number) => `/editor/${encodeURIComponent(String(id))}`
const buildCanonicalPostUrl = (postId: string | number) => {
  const path = toCanonicalPostPath(postId)
  if (typeof window === "undefined") return path
  return new URL(path, window.location.origin).toString()
}

const extractImageFileFromClipboard = (clipboardData: DataTransfer | null): File | null => {
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

const normalizeEditorReturnRoute = (value: string) => {
  const normalized = value.trim()
  if (!normalized.startsWith("/") || normalized.startsWith("//")) return ""
  if (/[\r\n]/.test(normalized)) return ""
  if (/^\/(?:https?:|javascript:)/i.test(normalized)) return ""
  if (normalized.startsWith("/editor")) return ""
  return normalized
}

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

type PostListScope = "active" | "deleted"

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
type StudioSurface = "manage" | "compose"
type MobileStudioStep = "query" | "list" | "edit" | "publish"
type PreviewViewportMode = "desktop" | "tablet" | "mobile"
type ManageMobileStudioStep = "query" | "list"
type ComposeMobileStudioStep = "edit" | "publish"

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
const EDITOR_BODY_PLACEHOLDER = "내용을 입력하세요."

const syncTitleTextareaHeight = (element: HTMLTextAreaElement | null) => {
  if (!element) return
  element.style.height = "0px"
  element.style.height = `${Math.max(element.scrollHeight, 44)}px`
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
  post: Pick<PostForEditor, "title" | "published" | "listed" | "tempDraft">,
  snapshot: ResolvedEditorMetaSnapshot
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

const SHOW_LEGACY_PROFILE_STUDIO = process.env.NEXT_PUBLIC_SHOW_LEGACY_PROFILE_STUDIO === "true"
const SHOW_LEGACY_CONTENT_STUDIO = process.env.NEXT_PUBLIC_SHOW_LEGACY_CONTENT_STUDIO === "true"
const SHOW_LEGACY_UTILITY_STUDIO = process.env.NEXT_PUBLIC_SHOW_LEGACY_UTILITY_STUDIO === "true"

export const getEditorStudioPageProps: GetServerSideProps<AdminPageProps> = async ({ req }) => {
  const bootstrapResult = await readAdminProtectedBootstrap<{
    member: AuthMember
    profile: Partial<AuthMember>
  }>(req, "/member/api/v1/adm/members/bootstrap", EDITOR_NEW_ROUTE_PATH)

  if (bootstrapResult.ok) {
    const { member, profile } = bootstrapResult.value
    const mergedMember: AuthMember = {
      ...member,
      profileImageDirectUrl:
        profile.profileImageDirectUrl ||
        profile.profileImageUrl ||
        member.profileImageDirectUrl ||
        member.profileImageUrl ||
        "",
      profileImageUrl:
        profile.profileImageUrl ||
        profile.profileImageDirectUrl ||
        member.profileImageUrl ||
        member.profileImageDirectUrl ||
        "",
      profileRole: profile.profileRole || member.profileRole || "",
      profileBio: profile.profileBio || member.profileBio || "",
      aboutRole: profile.aboutRole || member.aboutRole || "",
      aboutBio: profile.aboutBio || member.aboutBio || "",
      aboutDetails: profile.aboutDetails || member.aboutDetails || "",
      blogTitle: profile.blogTitle || member.blogTitle || "",
      homeIntroTitle: profile.homeIntroTitle || member.homeIntroTitle || "",
      homeIntroDescription:
        profile.homeIntroDescription || member.homeIntroDescription || "",
    }

    return {
      props: buildAdminPagePropsFromMember(mergedMember),
    }
  }

  if (bootstrapResult.destination) {
    return {
      redirect: {
        destination: bootstrapResult.destination,
        permanent: false,
      },
    }
  }

  return await getAdminPageProps(req)
}

const pretty = (value: unknown) => JSON.stringify(value, null, 2)

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

const EDITOR_RUNTIME_GUARD_SAMPLE_LIMIT = 240

type RuntimeGuardWindow = Window & {
  __AQ_RUNTIME_GUARD_ENABLED__?: boolean
  __AQ_RUNTIME_GUARD__?: {
    editorCommitSamples?: number[]
  }
}

const recordEditorCommitDurationForRuntimeGuard = (actualDuration: number) => {
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

export const EditorStudioPage: NextPage<AdminPageProps> = ({ initialMember }) => {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { me, authStatus, setMe } = useAuthSession()
  // SSR admin 스냅샷이 있는 전용 편집 라우트는 hydration/auth race 동안에도
  // 최초 보호 상태를 유지해야 한다. bare `me === null`만 보고 즉시 로그인으로
  // 보내면 WebKit 같은 브라우저에서 false logout redirect가 발생할 수 있다.
  const sessionMember = me || initialMember
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
  const deferredPostContent = useDeferredValue(postContent)
  const [, startPostContentTransition] = useTransition()
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
  const postContentLiveRef = useRef(postContent)
  const deferredContentDerivedCacheRef = useRef<{
    fingerprint: string
    summary: string
    firstImage: string
  }>({
    fingerprint: "",
    summary: "",
    firstImage: "",
  })
  const blockEditorLoadGuardStateRef = useRef<BlockEditorLoadGuardState>({
    expectedBody: "",
    ignoreUntilMs: 0,
    ignoredInitialEmpty: false,
  })
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false)
  const [publishActionType, setPublishActionType] = useState<PublishActionType>("create")
  const [previewThumbnailSourceUrl, setPreviewThumbnailSourceUrl] = useState("")
  const [previewViewport, setPreviewViewport] = useState<PreviewViewportMode>("desktop")
  const [localDraftSavedAt, setLocalDraftSavedAt] = useState("")
  const [mobileManageStep, setMobileManageStep] = useState<ManageMobileStudioStep>("query")
  const [mobileComposeStep, setMobileComposeStep] = useState<ComposeMobileStudioStep>("edit")
  const [studioSurface, setStudioSurface] = useState<StudioSurface>("compose")
  const [isCompactMobileLayout, setIsCompactMobileLayout] = useState(false)
  const [isMobileThumbnailEditorOpen, setIsMobileThumbnailEditorOpen] = useState(false)
  const [isMobileMetaEditorOpen, setIsMobileMetaEditorOpen] = useState(false)
  const titleFieldRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    postContentLiveRef.current = postContent
  }, [postContent])

  const handleBlockEditorChange = useCallback((nextMarkdown: string, meta?: BlockEditorChangeMeta) => {
    const previousMarkdown = postContentLiveRef.current
    if (nextMarkdown === previousMarkdown) {
      return
    }

    let nextGuardState = consumeGuardOnExpectedUpdate(blockEditorLoadGuardStateRef.current, nextMarkdown)

    if (meta?.editorFocused) {
      nextGuardState = {
        ...nextGuardState,
        ignoreUntilMs: 0,
        ignoredInitialEmpty: true,
      }
      blockEditorLoadGuardStateRef.current = nextGuardState
      postContentLiveRef.current = nextMarkdown
      startPostContentTransition(() => {
        setPostContent(nextMarkdown)
      })
      return
    }

    if (shouldIgnoreBlockEditorEmptyUpdate({
      nextMarkdown,
      currentMarkdown: previousMarkdown,
      guardState: nextGuardState,
    })) {
      blockEditorLoadGuardStateRef.current = markGuardEmptyUpdateIgnored(nextGuardState)
      return
    }

    blockEditorLoadGuardStateRef.current = nextGuardState
    postContentLiveRef.current = nextMarkdown
    setPostContent(nextMarkdown)
  }, [startPostContentTransition])

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
  const isDedicatedEditorRoute = router.pathname.startsWith("/editor")
  const isDedicatedNewEditorRoute = isDedicatedEditorRoute && router.pathname === EDITOR_NEW_ROUTE_PATH
  const [isNewEditorBootstrapPending, setIsNewEditorBootstrapPending] = useState(isDedicatedNewEditorRoute)
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
    if (!resolvedPostId) return

    const revalidateResponse = await fetch("/api/revalidate", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        paths: [toCanonicalPostPath(resolvedPostId)],
      }),
    })

    if (!revalidateResponse.ok) {
      const reason = (await revalidateResponse.text().catch(() => "")).trim()
      throw new Error(reason || "공개 상세 재검증 요청에 실패했습니다.")
    }
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
  }, [postTitle])

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

  const handleSelectedPostIdChange = useCallback(
    (nextPostId: string) => {
      const normalizedPostId = nextPostId.trim()
      setPostId(normalizedPostId)
      if (normalizedPostId !== postId.trim()) {
        setEditorMode("create")
        setPostVersion(null)
        setIsTempDraftMode(false)
      }
    },
    [postId]
  )

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

  const openPostDetailRoute = useCallback(
    async (targetPostId: string | number) => {
      const resolvedPostId = String(targetPostId).trim()
      if (!resolvedPostId) {
        setPublishStatus({ tone: "error", text: "상세 링크를 열 글 ID가 없습니다." }, "page")
        return
      }

      const path = toCanonicalPostPath(resolvedPostId)
      if (typeof window !== "undefined") {
        const opened = window.open(path, "_blank", "noopener,noreferrer")
        if (opened) return
      }

      try {
        await pushRoute(router, path)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setPublishStatus({ tone: "error", text: `상세 열기 실패: ${message}` }, "page")
      }
    },
    [router, setPublishStatus]
  )

  const copyPostDetailLink = useCallback(
    async (targetPostId: string | number, title?: string) => {
      const resolvedPostId = String(targetPostId).trim()
      if (!resolvedPostId) {
        setPublishStatus({ tone: "error", text: "복사할 상세 링크가 없습니다." }, "page")
        return
      }

      const rowLabel = `#${resolvedPostId} ${title?.trim() || "제목 없는 글"}`
      const url = buildCanonicalPostUrl(resolvedPostId)

      try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url)
          setPublishStatus({ tone: "success", text: `${rowLabel} 링크를 복사했습니다.` }, "page")
          return
        }

        if (typeof window !== "undefined") {
          window.prompt("링크를 복사하세요.", url)
          setPublishStatus({ tone: "success", text: `${rowLabel} 링크를 표시했습니다.` }, "page")
          return
        }

        throw new Error("링크를 복사할 수 없는 환경입니다.")
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setPublishStatus({ tone: "error", text: `링크 복사 실패: ${message}` }, "page")
      }
    },
    [setPublishStatus]
  )

  const syncEditorMeta = useCallback((content: string, contentHtml?: string | null) => {
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

  const {
    clearLocalDraft,
    handleLoadOrCreateTempPost,
    loadPostForEditor,
    restoreLocalDraft,
    saveLocalDraft,
    switchToCreateMode,
  } = useEditorStudioDraftLifecycle({
    router,
    toEditorPostRoute,
    postId,
    postTitle,
    postContent,
    postSummary,
    postThumbnailUrl,
    postThumbnailFocusX,
    postThumbnailFocusY,
    postThumbnailZoom,
    postTags,
    postCategory,
    postVisibility,
    isCompactMobileLayout,
    setEditorMode,
    setIsTempDraftMode,
    setPostId,
    setPostVersion,
    setPreviewThumbnailSourceUrl,
    setPostTitle,
    setPostContent,
    setPostSummary,
    setPostThumbnailUrl,
    setPostThumbnailFocusX,
    setPostThumbnailFocusY,
    setPostThumbnailZoom,
    setPostTags,
    setPostCategory,
    setPostVisibility,
    setKnownTags,
    setLocalDraftSavedAt,
    setLoadingKey,
    setResult,
    setIsNewEditorBootstrapPending,
    setMobileComposeStep,
    activateComposeSurface,
    setPublishStatus,
    dedupeStrings,
    normalizeCategoryValue,
    buildLocalDraftFingerprint,
    persistLocalDraft,
    readLocalDraft,
    removeLocalDraft,
    buildEditorStateFingerprint,
    pretty,
    resolveEditorMetaSnapshot,
    syncEditorMeta,
    buildEmptyEditorMetaSnapshot,
    isBlankServerTempDraft: (post, snapshot) =>
      isBlankServerTempDraft(
        post as Pick<PostForEditor, "title" | "published" | "listed" | "tempDraft">,
        snapshot as ResolvedEditorMetaSnapshot
      ),
    toVisibility,
    requestTempPostWithConflictRetry: async (resolveExistingTempPost) =>
      (await requestTempPostWithConflictRetry(
        async () => (await resolveExistingTempPost()) as PostForEditor | null
      )) as RsData<PostForEditor>,
    defaultThumbnailFocusX: DEFAULT_THUMBNAIL_FOCUS_X,
    defaultThumbnailFocusY: DEFAULT_THUMBNAIL_FOCUS_Y,
    defaultThumbnailZoom: DEFAULT_THUMBNAIL_ZOOM,
    lastLocalDraftFingerprintRef,
    lastWriteFingerprintRef,
    lastWriteIdempotencyKeyRef,
    serverBaselineEditorFingerprintRef,
    tempPostRequestRef,
  })

  const deferredContentDerived = useMemo(() => {
    const fingerprint = computeContentFingerprint(deferredPostContent)
    const cached = deferredContentDerivedCacheRef.current
    if (cached.fingerprint === fingerprint) {
      return cached
    }

    const next = {
      fingerprint,
      summary: makePreviewSummary(deferredPostContent),
      firstImage: extractFirstMarkdownImage(deferredPostContent),
    }
    deferredContentDerivedCacheRef.current = next
    return next
  }, [deferredPostContent])

  const resolvedPreviewSummary = useMemo(() => {
    const manual = postSummary.trim()
    if (manual) return manual
    return deferredContentDerived.summary
  }, [deferredContentDerived.summary, postSummary])

  const resolvedPreviewThumbnail = useMemo(() => {
    const manual = stripThumbnailFocusFromUrl(normalizeSafeImageUrl(postThumbnailUrl))
    if (manual) return manual
    return stripThumbnailFocusFromUrl(normalizeSafeImageUrl(deferredContentDerived.firstImage))
  }, [deferredContentDerived.firstImage, postThumbnailUrl])
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

  const {
    commitPreviewThumbTransform,
    finalizePreviewThumbPointer,
    handlePreviewThumbPointerDown,
    handlePreviewThumbPointerMove,
    isPreviewThumbDragging,
    isPreviewThumbnailError,
    previewThumbFrameRef,
    previewThumbTransformRef,
    setIsPreviewThumbnailError,
  } = useEditorStudioThumbnailPreview({
    safePreviewThumbnail,
    isPublishModalOpen,
    isComposeAssistOpen,
    postThumbnailFocusX,
    postThumbnailFocusY,
    postThumbnailZoom,
    setPostThumbnailFocusX,
    setPostThumbnailFocusY,
    setPostThumbnailZoom,
  })

  const {
    applyFirstBodyImageToThumbnail,
    handleThumbnailUrlModalChange,
    openThumbnailFileInput,
    resetThumbnailToAutoMode,
    setThumbnailImageFileName,
    thumbnailImageFileInputRef,
    thumbnailImageFileName,
  } = useEditorStudioThumbnailControls({
    postContent,
    setPostThumbnailUrl,
    setPostThumbnailFocusX,
    setPostThumbnailFocusY,
    setPostThumbnailZoom,
    setPreviewThumbnailSourceUrl,
    extractFirstMarkdownImage,
    normalizeSafeImageUrl,
  })

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

  const {
    handleBlockEditorFileUpload,
    handleBlockEditorImageUpload,
    handleModifyPost,
    handlePublishTempDraft,
    handleThumbnailImageFileChange,
    handleThumbnailPaste,
    handleWritePost,
  } = useEditorStudioPersistence({
    editorMode,
    postId,
    postVersion,
    postTitle,
    postTags,
    postCategory,
    postSummary,
    postThumbnailUrl,
    postThumbnailFocusX,
    postThumbnailFocusY,
    postThumbnailZoom,
    postVisibility,
    effectiveThumbnailUrl,
    loadingKey,
    postContentLiveRef,
    lastWriteFingerprintRef,
    lastWriteIdempotencyKeyRef,
    lastLocalDraftFingerprintRef,
    serverBaselineEditorFingerprintRef,
    defaultThumbnailFocusX: DEFAULT_THUMBNAIL_FOCUS_X,
    defaultThumbnailFocusY: DEFAULT_THUMBNAIL_FOCUS_Y,
    defaultThumbnailZoom: DEFAULT_THUMBNAIL_ZOOM,
    setEditorMode,
    setIsTempDraftMode,
    setPostId,
    setPostVersion,
    setPostVisibility,
    setKnownTags,
    setLocalDraftSavedAt,
    setPublishStatus,
    setLoadingKey,
    setResult,
    setPostThumbnailUrl,
    setPostThumbnailFocusX,
    setPostThumbnailFocusY,
    setPostThumbnailZoom,
    setPreviewThumbnailSourceUrl,
    setIsPreviewThumbnailError,
    setThumbnailImageFileName,
    composeEditorContent,
    toFlags,
    buildEditorStateFingerprint,
    dedupeStrings,
    detectPublishPlaceholderIssue: (content) => detectPublishPlaceholderIssue(content) || "",
    refreshPublicPostReadViews,
    pretty,
    generateIdempotencyKey,
    removeLocalDraft,
    uploadWithConflictRetry,
    normalizeSafeImageUrl,
    extractImageFileFromClipboard,
  })

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

  const { handleExitDedicatedEditor } = useEditorStudioRouting({
    router,
    authStatus,
    sessionMember,
    postId,
    isDedicatedEditorRoute,
    isDedicatedNewEditorRoute,
    adminPostsWorkspaceRoute: ADMIN_POSTS_WORKSPACE_ROUTE,
    editorNewRoutePath: EDITOR_NEW_ROUTE_PATH,
    toEditorPostRoute,
    normalizeEditorReturnRoute,
    pretty,
    setResult,
    setPostId,
    setIsNewEditorBootstrapPending,
    redirectingRef,
    autoLoadedPostIdRef,
    autoCreatedTempDraftRef,
    restoreLocalDraft,
    loadPostForEditor,
    handleLoadOrCreateTempPost,
  })

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

  const handleProfileImageSelected = (file: File | null, fileName: string) => {
    setProfileImageFileName(fileName)
    if (file) {
      void handleUploadMemberProfileImage(file)
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

  const handleRefreshAdminProfile = () => {
    void run("admMemberProfileRefresh", async () => {
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

  const handleListComments = () => {
    void run("commentList", () => apiFetch(`/post/api/v1/posts/${postId}/comments`))
  }

  const handleReadComment = () => {
    void run("commentOne", () => apiFetch(`/post/api/v1/posts/${postId}/comments/${commentId}`))
  }

  const handleWriteComment = () => {
    void run("commentWrite", () =>
      apiFetch(`/post/api/v1/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: commentContent }),
      })
    )
  }

  const handleModifyComment = () => {
    void run("commentModify", () =>
      apiFetch(`/post/api/v1/posts/${postId}/comments/${commentId}`, {
        method: "PUT",
        body: JSON.stringify({ content: commentContent }),
      })
    )
  }

  const handleDeleteComment = () => {
    void run("commentDelete", () =>
      apiFetch(`/post/api/v1/posts/${postId}/comments/${commentId}`, {
        method: "DELETE",
      })
    )
  }

  const handleReadPostCount = () => {
    void run("admPostCount", () => apiFetch("/post/api/v1/adm/posts/count"))
  }

  const handleReadSystemHealth = () => {
    void run("systemHealth", () => apiFetch("/system/api/v1/adm/health"))
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
    setKnownTags((prev) =>
      dedupeStrings([...prev, ...Object.keys(tagUsageMap), ...customTagCatalog, ...postTags]).sort((a, b) =>
        a.localeCompare(b)
      )
    )
  }, [customTagCatalog, postTags, tagUsageMap])

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

  const openPublishModal = useCallback((actionType: PublishActionType) => {
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
  }, [
    activateComposeSurface,
    isCompactMobileLayout,
    isPreviewThumbnailError,
    publishModalHintByAction,
    safePreviewThumbnail,
  ])

  const handleContinueSelectedPostEditing = useCallback(() => {
    openPublishModal("modify")
  }, [openPublishModal])

  const handleCreateNewPostFromSelectedPanel = useCallback(() => {
    switchToCreateMode({ keepContent: false })
  }, [switchToCreateMode])

  const handleDeleteSelectedPost = useCallback(() => {
    openDeleteConfirm([Number.parseInt(postId, 10)], postTitle)
  }, [openDeleteConfirm, postId, postTitle])

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
  const currentVisibilityText = getVisibilityLabel(currentFlags.published, currentFlags.listed)
  const canOpenCurrentPostDetail = editorMode === "edit" && postId.trim().length > 0
  const composeViewModel = useMemo(
    () =>
      deriveComposeViewModel({
        editorMode,
        isTempDraftMode,
        postId,
        postTitle,
        postSummary,
        postTags,
        currentVisibilityText,
      }),
    [currentVisibilityText, editorMode, isTempDraftMode, postId, postSummary, postTags, postTitle]
  )
  const {
    editorModeLabel,
    hasSelectedManagedPost,
    currentPostLabel,
    selectedPostLabel,
    tagSummaryText,
    composePageTitle,
    composeSurfaceSubtitle,
    composeHeroSummary,
    composeCallToActionLabel,
  } = composeViewModel
  const hasListFiltersApplied =
    listKw.trim().length > 0 ||
    listQuickPreset !== "none" ||
    listPage !== "1" ||
    listPageSize !== "30" ||
    (listScope === "active" && listSort !== "CREATED_AT")
  const deferredContentMetrics = useMemo(
    () => deriveEditorContentMetrics(deferredPostContent),
    [deferredPostContent]
  )
  const contentLength = deferredContentMetrics.trimmedLength
  const lineCount = deferredContentMetrics.lineCount
  const imageCount = deferredContentMetrics.imageCount
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
  const composeSummaryPreview = useMemo(
    () => postSummary.trim() || deferredContentDerived.summary,
    [deferredContentDerived.summary, postSummary]
  )
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
  const publishActionViewModel = derivePublishActionViewModel({
    publishActionType,
    editorMode,
    loadingKey,
    hasEditorMinimumFields,
    hasPlaceholderIssue: Boolean(publishPlaceholderIssue),
    isTempDraftMode,
  })
  const {
    publishActionTitle,
    publishActionButtonText,
    publishActionButtonDisabled,
    publishActionTriggerDisabled,
    mobilePrimaryActionLabel,
    mobilePrimaryActionDisabled,
  } = publishActionViewModel
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
  const [previewNowIso] = useState(() => new Date().toISOString())
  const member = sessionMember || initialMember
  const displayName = member.nickname || member.username || "관리자"
  const displayNameInitial = displayName.slice(0, 2).toUpperCase()
  const previewViewportConfig = PREVIEW_CARD_VIEWPORTS[previewViewport]
  const previewViewportOptions = PREVIEW_CARD_VIEWPORT_ORDER.map((viewport) => ({
    value: viewport,
    label: PREVIEW_CARD_VIEWPORTS[viewport].label,
  }))
  const previewVisibilityLabel = getVisibilityLabel(postVisibility)
  const previewThumbnailSrc = safePreviewThumbnail && !isPreviewThumbnailError ? safePreviewThumbnail : ""
  const shouldShowPublishModalNotice = publishModalNotice.tone !== "idle"
  const previewAuthorAvatarSrc = (
    profileImgInputUrl.trim() ||
    member.profileImageDirectUrl ||
    member.profileImageUrl ||
    ""
  ).trim()
  const previewDateText = formatDate(previewNowIso, "ko")

  const isCompactSplitPreview = false
  const shouldShowGlobalNotice =
    globalNotice.tone !== "idle" || globalNotice.text !== GLOBAL_NOTICE_IDLE_TEXT
  const shouldShowPublishNotice = publishNotice.tone !== "idle"
  const shouldShowTagRecommendationNotice =
    tagRecommendationNotice.tone !== "idle" || tagRecommendationNotice.text !== TAG_RECOMMENDATION_IDLE_TEXT
  const composeStatusEntries = [
    shouldShowPublishNotice
      ? {
          key: "publish",
          label: "발행 상태",
          tone: publishNotice.tone,
          text: publishNotice.text,
        }
      : null,
    shouldShowTagRecommendationNotice
      ? {
          key: "tags",
          label: "태그 상태",
          tone: tagRecommendationNotice.tone,
          text: tagRecommendationNotice.text,
        }
      : null,
    {
      key: "draft",
      label: "브라우저 임시저장",
      tone: localDraftSavedAt ? ("success" as NoticeTone) : ("idle" as NoticeTone),
      text: localDraftSavedAt
        ? `${localDraftSavedAt.slice(11, 16)} 저장본이 있습니다.`
        : "아직 브라우저 임시저장이 없습니다.",
    },
  ].filter(
    (
      item
    ): item is {
      key: string
      label: string
      tone: NoticeTone
      text: string
    } => Boolean(item)
  )
  const mobileComposeStatusPrimary = composeStatusEntries[0] ?? {
    key: "visibility",
    label: "공개 범위",
    tone: "idle" as NoticeTone,
    text: `${currentVisibilityText} · ${postSummary.trim() ? "요약 입력됨" : "요약 자동 생성"}`,
  }
  const mobileComposeStatusSecondary = composeStatusEntries.find((item) => item.key === "draft") ?? null
  const isThumbnailUploadDisabled = disabled("uploadThumbnail")
  const handleThumbnailZoomModalChange = useCallback(
    (nextZoom: number) => {
      commitPreviewThumbTransform({
        ...previewThumbTransformRef.current,
        zoom: clampThumbnailZoom(nextZoom),
      })
    },
    [commitPreviewThumbTransform, previewThumbTransformRef]
  )
  const resetThumbnailZoomInModal = useCallback(() => {
    commitPreviewThumbTransform({
      ...previewThumbTransformRef.current,
      zoom: DEFAULT_THUMBNAIL_ZOOM,
    })
  }, [commitPreviewThumbTransform, previewThumbTransformRef])
  const thumbnailEditorPanel = (
    <EditorStudioThumbnailEditorPanel
      finalizePreviewThumbPointer={finalizePreviewThumbPointer}
      handlePreviewThumbPointerDown={handlePreviewThumbPointerDown}
      handlePreviewThumbPointerMove={handlePreviewThumbPointerMove}
      isPreviewThumbDragging={isPreviewThumbDragging}
      isPreviewThumbnailError={isPreviewThumbnailError}
      postThumbnailZoom={postThumbnailZoom}
      previewThumbFrameRef={previewThumbFrameRef}
      safePreviewThumbnail={safePreviewThumbnail}
      setIsPreviewThumbnailError={setIsPreviewThumbnailError}
      onThumbnailZoomChange={handleThumbnailZoomModalChange}
      onResetThumbnailZoom={resetThumbnailZoomInModal}
    />
  )
  const previewMetaEditorPanel = (
    <EditorStudioThumbnailMetaPanel
      firstBodyImageUrl={deferredContentDerived.firstImage}
      isThumbnailUploadDisabled={isThumbnailUploadDisabled}
      isThumbnailUploading={loadingKey === "uploadThumbnail"}
      postThumbnailUrl={postThumbnailUrl}
      thumbnailImageFileName={thumbnailImageFileName}
      thumbnailUploadRuleLabel={POST_IMAGE_UPLOAD_RULE_LABEL}
      onApplyFirstBodyImage={applyFirstBodyImageToThumbnail}
      onOpenThumbnailFileInput={openThumbnailFileInput}
      onResetThumbnailToAutoMode={resetThumbnailToAutoMode}
      onThumbnailPaste={handleThumbnailPaste}
      onThumbnailUrlChange={handleThumbnailUrlModalChange}
    />
  )
  const editorPrimaryActionType: PublishActionType =
    editorMode === "create" ? "create" : isTempDraftMode ? "temp" : "modify"
  const editorPrimaryActionLabel =
    editorPrimaryActionType === "modify"
      ? "수정 반영"
      : editorPrimaryActionType === "temp"
        ? "새 글 작성"
        : "발행"
  const isBlockEditorDisabled = loadingKey.length > 0
  const handleEditorCommitDuration = useCallback((actualDuration: number) => {
    recordEditorCommitDurationForRuntimeGuard(actualDuration)
  }, [])
  const dedicatedEditorCanvas = useMemo(
    () => (
      <WriterEditorHost
        canvasId="editor-dedicated-canvas"
        markdown={postContent}
        onMarkdownChange={handleBlockEditorChange}
        onImageUpload={handleBlockEditorImageUpload}
        onFileUpload={handleBlockEditorFileUpload}
        mermaidEnabled={BLOCK_EDITOR_V2_MERMAID_ENABLED}
        disabled={isBlockEditorDisabled}
        onCommitDuration={handleEditorCommitDuration}
      />
    ),
    [
      handleBlockEditorChange,
      handleBlockEditorFileUpload,
      handleBlockEditorImageUpload,
      handleEditorCommitDuration,
      isBlockEditorDisabled,
      postContent,
    ]
  )
  const composeEditorCanvas = useMemo(
    () => (
      <WriterEditorHost
        canvasId="editor-compose-canvas"
        markdown={postContent}
        onMarkdownChange={handleBlockEditorChange}
        onImageUpload={handleBlockEditorImageUpload}
        onFileUpload={handleBlockEditorFileUpload}
        mermaidEnabled={BLOCK_EDITOR_V2_MERMAID_ENABLED}
        disabled={isBlockEditorDisabled}
        onCommitDuration={handleEditorCommitDuration}
      />
    ),
    [
      handleBlockEditorChange,
      handleBlockEditorFileUpload,
      handleBlockEditorImageUpload,
      handleEditorCommitDuration,
      isBlockEditorDisabled,
      postContent,
    ]
  )
  const shouldShowEditorLoadingState =
    isDedicatedNewEditorRoute &&
    !postId.trim() &&
    (isNewEditorBootstrapPending || loadingKey === "postTemp")
  const shouldShowResultPanel = Boolean(loadingKey || result)
  const dedicatedEditorTopBar = useMemo(
    () => (
      <EditorStudioTopBar>
        <EditorExitAction type="button" onClick={handleExitDedicatedEditor}>
          ← 나가기
        </EditorExitAction>
        <EditorStudioTopBarActions>
          {composeStatusText ? (
            <EditorStudioSaveState data-tone={composeStatusTone}>{composeStatusText}</EditorStudioSaveState>
          ) : null}
          <PrimaryButton
            type="button"
            disabled={publishActionTriggerDisabled}
            onClick={() => openPublishModal(editorPrimaryActionType)}
          >
            {editorPrimaryActionLabel}
          </PrimaryButton>
        </EditorStudioTopBarActions>
      </EditorStudioTopBar>
    ),
    [
      composeStatusText,
      composeStatusTone,
      editorPrimaryActionLabel,
      editorPrimaryActionType,
      handleExitDedicatedEditor,
      openPublishModal,
      publishActionTriggerDisabled,
    ]
  )
  const dedicatedEditorResultPanel = useMemo(
    () =>
      shouldShowResultPanel ? (
        <EditorStudioResultLogPanel
          idleDescription="원본 응답을 확인할 수 있습니다"
          idleTitle="최근 작업 응답"
          loadingDescription={(currentLoadingKey) => `실행 중: ${currentLoadingKey}`}
          loadingKey={loadingKey}
          loadingTitle="작업 응답 확인 중"
          result={result}
          variant="dedicated"
        />
      ) : null,
    [loadingKey, result, shouldShowResultPanel]
  )

  if (!sessionMember) {
    return null
  }

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
        ref={thumbnailImageFileInputRef}
        type="file"
        accept="image/*"
        onChange={handleThumbnailImageFileChange}
        style={{ display: "none" }}
      />

      {dedicatedEditorTopBar}

      <EditorStudioFrame data-testid="editor-studio-frame">
        <EditorStudioWritingColumn data-testid="editor-writing-column" $compact={isCompactSplitPreview}>
          <EditorStudioMetaSection $compact={isCompactSplitPreview}>
            <EditorTagRow aria-label="태그 입력" $compact={isCompactSplitPreview}>
              {postTags.map((tag) => (
                <SelectedTagChip key={tag}>
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
            <TitleInput
              $compact={isCompactSplitPreview}
              ref={handleTitleFieldRef}
              id="post-title"
              placeholder="제목을 입력하세요"
              rows={1}
              value={postTitle}
              onChange={handleTitleChange}
              onKeyDown={handleTitleKeyDown}
            />
            <EditorHeaderMetaRow>
              <EditorHeaderAuthor>
                <EditorHeaderAvatar $compact={isCompactSplitPreview}>
                  {previewAuthorAvatarSrc ? (
                    <ProfileImage src={previewAuthorAvatarSrc} alt={`${displayName} 프로필 이미지`} fillContainer />
                  ) : (
                    <span className="initial">{displayNameInitial}</span>
                  )}
                </EditorHeaderAvatar>
                <EditorHeaderAuthorText $compact={isCompactSplitPreview}>
                  <strong>{displayName}</strong>
                  <span>{previewDateText}</span>
                </EditorHeaderAuthorText>
              </EditorHeaderAuthor>
              <EditorHeaderMetaActions>
                <EditorHeaderMetaPill $compact={isCompactSplitPreview}>{currentVisibilityText}</EditorHeaderMetaPill>
                {canOpenCurrentPostDetail ? (
                  <>
                    <EditorHeaderActionButton type="button" onClick={() => void openPostDetailRoute(postId)}>
                      상세 열기
                    </EditorHeaderActionButton>
                    <EditorHeaderActionButton type="button" onClick={() => void copyPostDetailLink(postId, postTitle)}>
                      링크 복사
                    </EditorHeaderActionButton>
                  </>
                ) : null}
              </EditorHeaderMetaActions>
            </EditorHeaderMetaRow>
          </EditorStudioMetaSection>

          <EditorStudioCanvas>
            {dedicatedEditorCanvas}
          </EditorStudioCanvas>

          {shouldShowPublishNotice ? <PublishNotice data-tone={publishNotice.tone}>{publishNotice.text}</PublishNotice> : null}
        </EditorStudioWritingColumn>
      </EditorStudioFrame>

      {dedicatedEditorResultPanel}

      {isPublishModalOpen ? (
        <EditorStudioPublishModal
          closeToggleLabel="닫기"
          displayName={displayName}
          displayNameInitial={displayNameInitial}
          isCompactMobileLayout={isCompactMobileLayout}
          isMobileMetaEditorOpen={isMobileMetaEditorOpen}
          isMobileThumbnailEditorOpen={isMobileThumbnailEditorOpen}
          loadingKey={loadingKey}
          modalNotice={publishModalNotice}
          postThumbnailFocusX={postThumbnailFocusX}
          postThumbnailFocusY={postThumbnailFocusY}
          postThumbnailZoom={postThumbnailZoom}
          postTitle={postTitle}
          postVisibility={postVisibility}
          previewAuthorAvatarSrc={previewAuthorAvatarSrc}
          previewDateText={previewDateText}
          previewFrameStyle={{ maxWidth: `${previewViewportConfig.cardWidth}px` }}
          previewKicker="카드 미리보기"
          previewMetaEditorPanel={previewMetaEditorPanel}
          previewSummary={resolvedPreviewSummary}
          previewSummaryFallback="요약을 비워두면 본문에서 자동 생성한 요약이 카드에 반영됩니다."
          previewThumbnailSrc={previewThumbnailSrc}
          previewViewport={previewViewport}
          previewViewportLabel={previewViewportConfig.label}
          previewViewportOptions={previewViewportOptions}
          previewVisibilityLabel={previewVisibilityLabel}
          publishActionButtonDisabled={publishActionButtonDisabled}
          publishActionButtonText={publishActionButtonText}
          publishActionTitle={publishActionTitle}
          shouldShowNotice={shouldShowPublishModalNotice}
          thumbnailEditorPanel={thumbnailEditorPanel}
          variant="drawer"
          visibilityOptions={PUBLISH_VISIBILITY_OPTIONS}
          onClose={closePublishModal}
          onConfirmPublish={() => void handleConfirmPublish()}
          onPostVisibilityChange={setPostVisibility}
          onPreviewThumbnailError={() => setIsPreviewThumbnailError(true)}
          onPreviewViewportChange={setPreviewViewport}
          onToggleMobileMetaEditor={() => setIsMobileMetaEditorOpen((current) => !current)}
          onToggleMobileThumbnailEditor={() => setIsMobileThumbnailEditorOpen((current) => !current)}
        />
      ) : null}
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
            <EditorStudioLegacyProfileSection
              displayName={displayName}
              displayNameInitial={displayNameInitial}
              isProfileCardUpdateDisabled={disabled("admMemberProfileCardUpdate")}
              isProfileImageUploadDisabled={disabled("admMemberProfileImgUpdate")}
              isProfileImageUploading={loadingKey === "admMemberProfileImgUpdate"}
              isProfileRefreshDisabled={disabled("admMemberProfileRefresh")}
              profileBioInput={profileBioInput}
              profileBioStatus={profileBioStatus}
              profileImageFileInputRef={profileImageFileInputRef}
              profileImageHint={profileImageHint}
              profileImageNotice={profileImageNotice}
              profileImageStatus={profileImageStatus}
              profileNotice={profileNotice}
              profilePreviewSrc={profilePreviewSrc}
              profileRoleInput={profileRoleInput}
              profileRoleStatus={profileRoleStatus}
              profileUpdatedText={profileUpdatedText}
              onProfileBioChange={setProfileBioInput}
              onProfileImageSelected={handleProfileImageSelected}
              onProfileRoleChange={setProfileRoleInput}
              onRefreshAdminProfile={handleRefreshAdminProfile}
              onUpdateMemberProfileCard={() => void handleUpdateMemberProfileCard()}
            />
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
            <EditorStudioMobileStepNavigator
              steps={mobileStudioSurfaceSteps}
              activeStep={activeMobileStudioStep}
              stepLabels={MOBILE_STUDIO_STEP_LABEL}
              stepDescriptions={MOBILE_STUDIO_STEP_DESCRIPTION}
              prevStep={mobileStudioPrevStep}
              nextStep={mobileStudioNextStep}
              prevStepLabel={mobileStudioPrevStepLabel}
              nextStepLabel={mobileStudioNextStepLabel}
              isCompactMobileLayout={isCompactMobileLayout}
              onStepChange={setActiveMobileStudioStep}
            />
            <ContentStudioGrid>
              <ContentStudioLeft
                data-mobile-visible={!isCompactMobileLayout || activeMobileStudioStep === "query" || activeMobileStudioStep === "list"}
              >
                <EditorStudioPostQueryPanel
                  activeMobileStep={activeMobileStudioStep as ManageMobileStudioStep}
                  isCompactMobileLayout={isCompactMobileLayout}
                  listScope={listScope}
                  listKeyword={listKw}
                  listQuickPreset={listQuickPreset}
                  hasListFiltersApplied={hasListFiltersApplied}
                  isAdvancedOpen={isListAdvancedOpen}
                  listPage={listPage}
                  listPageSize={listPageSize}
                  listSort={listSort}
                  listSortOptions={LIST_SORT_OPTIONS}
                  isRefreshDisabled={disabled("postList")}
                  isTempPostDisabled={disabled("postTemp")}
                  onListScopeChange={setListScope}
                  onListKeywordChange={setListKw}
                  onRefreshList={() => void loadAdminPosts()}
                  onLoadOrCreateTempPost={() => void handleLoadOrCreateTempPost()}
                  onApplyQuickPreset={applyListQuickPreset}
                  onResetFilters={() => {
                    setListQuickPreset("none")
                    setListKw("")
                    setListPage("1")
                    setListPageSize("30")
                    setListSort("CREATED_AT")
                  }}
                  onToggleAdvanced={() => setIsListAdvancedOpen((prev) => !prev)}
                  onListPageChange={handleListPageChange}
                  onListPageSizeChange={handleListPageSizeChange}
                  onListSortChange={handleListSortChange}
                />
                <EditorStudioPostListPanel
                  mobileVisible={!isCompactMobileLayout || activeMobileStudioStep === "list"}
                  listScope={listScope}
                  selectedPostIds={selectedPostIds}
                  adminPostTotal={adminPostTotal}
                  adminPostRows={adminPostRows}
                  adminPostViewRows={adminPostViewRows}
                  isAllVisiblePostsSelected={isAllVisiblePostsSelected}
                  selectedPostIdSet={selectedPostIdSet}
                  editorMode={editorMode}
                  postId={postId}
                  loadingKey={loadingKey}
                  modifiedSortOrder={modifiedSortOrder}
                  deletedListNotice={deletedListNotice}
                  isRefreshDisabled={disabled("postList")}
                  onToggleSelectAllVisiblePosts={toggleSelectAllVisiblePosts}
                  onClearSelection={() => setSelectedPostIds([])}
                  onRequestDeletePosts={(ids, headline) => openDeleteConfirm(ids, headline)}
                  onRefreshList={() => void loadAdminPosts()}
                  onTogglePostSelection={togglePostSelection}
                  onToggleModifiedSortOrder={() => setModifiedSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
                  onEditPost={(row) => {
                    setPostId(String(row.id))
                    void loadPostForEditor(String(row.id))
                  }}
                  onOpenPostDetail={(id) => void openPostDetailRoute(id)}
                  onCopyPostDetailLink={(id, title) => void copyPostDetailLink(id, title)}
                  onRestoreDeletedPost={(row) => void restoreDeletedPostFromList(row)}
                  onHardDeletePost={(row) => void hardDeleteDeletedPostFromList(row)}
                />
              </ContentStudioLeft>

              <EditorStudioSelectedPostPanel
                mobileVisible={showSelectedPanelInManageSurface}
                hasSelectedManagedPost={hasSelectedManagedPost}
                editorModeLabel={editorModeLabel}
                selectedPostLabel={selectedPostLabel}
                postTitle={postTitle}
                postId={postId}
                postVersion={postVersion}
                isTempDraftMode={isTempDraftMode}
                postVisibility={postVisibility}
                currentVisibilityText={currentVisibilityText}
                isContinueEditingDisabled={editorMode !== "edit" || disabled("modifyPost")}
                isCreateNewPostDisabled={loadingKey.length > 0}
                isDeletePostDisabled={disabled("deletePost")}
                onContinueEditing={handleContinueSelectedPostEditing}
                onCreateNewPost={handleCreateNewPostFromSelectedPanel}
                onDeletePost={handleDeleteSelectedPost}
                toolsPanel={
                  <EditorStudioSelectedPostToolsPanel
                    hasSelectedManagedPost={hasSelectedManagedPost}
                    isDirectLoadOpen={isDirectLoadOpen}
                    onToggleDirectLoad={() => setIsDirectLoadOpen((prev) => !prev)}
                    isSelectedToolsOpen={isSelectedToolsOpen}
                    onToggleSelectedTools={() => setIsSelectedToolsOpen((prev) => !prev)}
                    postId={postId}
                    onPostIdChange={handleSelectedPostIdChange}
                    isLoadPostDisabled={disabled("postOne")}
                    onLoadPost={() => void loadPostForEditor()}
                    isHitPostDisabled={disabled("hitPost")}
                    onRunHitPost={() =>
                      void run("hitPost", () => apiFetch(`/post/api/v1/posts/${postId}/hit`, { method: "POST" }))
                    }
                    isLikePostDisabled={disabled("likePost")}
                    onRunLikePost={() =>
                      void run("likePost", () => apiFetch(`/post/api/v1/posts/${postId}/like`, { method: "PUT" }))
                    }
                  />
                }
              />
            </ContentStudioGrid>

            <EditorStudioUndoToast
              isVisible={Boolean(softDeleteUndoState)}
              message={softDeleteUndoState?.message || ""}
              isUndoDisabled={disabled("undoDeletePost")}
              onUndo={() => void handleUndoSoftDelete()}
            />
          </Section>
          )}

        <EditorStudioDeleteConfirmDialog
          state={deleteConfirmState}
          noticeTone={deleteConfirmNotice.tone}
          noticeText={deleteConfirmNotice.text}
          isDeleteDisabled={loadingKey === "deletePost"}
          onClose={closeDeleteConfirm}
          onConfirm={async (state) => {
            const ok = await deletePostsFromList(state.ids)
            if (ok) closeDeleteConfirm()
          }}
        />
        {studioSurface === "compose" && (
        <ComposeSurfaceSection>
        <EditorSection data-mobile-visible={!isCompactMobileLayout || studioSurface === "compose"}>
          {isCompactMobileLayout ? (
            <MobileComposeStatusBar data-tone={mobileComposeStatusPrimary.tone}>
              <div className="headline">
                <strong>{mobileComposeStatusPrimary.label}</strong>
                <span>{mobileComposeStatusPrimary.text}</span>
              </div>
              <div className="meta">
                <span className="pill">{currentVisibilityText}</span>
                {mobileComposeStatusSecondary ? <span className="pill">{mobileComposeStatusSecondary.text}</span> : null}
              </div>
            </MobileComposeStatusBar>
          ) : null}
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
                      <SelectedTagChip key={tag}>
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
                ref={thumbnailImageFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleThumbnailImageFileChange}
                style={{ display: "none" }}
              />

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
                {composeEditorCanvas}
              </ComposeBodySection>

              <WriterFooterBar>
                <WriterFooterSummary>
                  <span>{tagSummaryText}</span>
                  <span>{contentLength}자 · {lineCount}줄</span>
                </WriterFooterSummary>
                <WriterFooterControls>
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
              <EditorStudioComposeAssistantPanel
                composeHeroSummary={composeHeroSummary}
                publishAction={
                  <PrimaryButton
                    type="button"
                    disabled={mobilePrimaryActionDisabled}
                    onClick={() => openPublishModal(editorMode === "create" ? "create" : isTempDraftMode ? "temp" : "modify")}
                  >
                    {composeCallToActionLabel}
                  </PrimaryButton>
                }
                tagRecommendationAction={
                  <Button
                    type="button"
                    disabled={disabled("recommendTags") || !postContent.trim()}
                    onClick={() => void handleRecommendTags()}
                  >
                    {loadingKey === "recommendTags" ? "태그 제안 중..." : "태그 제안"}
                  </Button>
                }
                composeStatusEntries={composeStatusEntries}
                activeVisibility={postVisibility}
                visibilityOptions={PUBLISH_VISIBILITY_OPTIONS}
                onVisibilityChange={setPostVisibility}
                previewViewport={previewViewport}
                previewViewportLabel={previewViewportConfig.label}
                previewViewportOptions={previewViewportOptions}
                onPreviewViewportChange={(viewport) => setPreviewViewport(viewport)}
                previewFrameStyle={{ width: `min(100%, ${previewViewportConfig.cardWidth}px)` }}
                previewThumbnailSrc={previewThumbnailSrc}
                postThumbnailFocusX={postThumbnailFocusX}
                postThumbnailFocusY={postThumbnailFocusY}
                postThumbnailZoom={postThumbnailZoom}
                onPreviewThumbnailError={() => setIsPreviewThumbnailError(true)}
                previewVisibilityLabel={previewVisibilityLabel}
                postTitle={postTitle}
                summaryPreview={composeSummaryPreview}
                previewDateText={previewDateText}
                previewAuthorAvatarSrc={previewAuthorAvatarSrc}
                displayNameInitial={displayNameInitial}
                displayName={displayName}
                summaryLengthLabel={
                  postSummary.trim() ? `${postSummary.trim().length}/${PREVIEW_SUMMARY_MAX_LENGTH}` : "본문 기준 자동"
                }
                isComposeAssistOpen={isComposeAssistOpen}
                onToggleComposeAssist={() => setIsComposeAssistOpen((prev) => !prev)}
                thumbnailEditorPanel={thumbnailEditorPanel}
                previewMetaEditorPanel={previewMetaEditorPanel}
              >
                <EditorStudioMetadataAssistantPanel
                  isTagPanelOpen={activeMetaPanel === "tag"}
                  onToggleTagPanel={() => setActiveMetaPanel((prev) => (prev === "tag" ? null : "tag"))}
                  isUtilityPanelOpen={isComposeUtilityOpen}
                  onToggleUtilityPanel={() => setIsComposeUtilityOpen((prev) => !prev)}
                  metaNotice={metaNotice}
                  knownTags={knownTags}
                  selectedTags={postTags}
                  tagUsageMap={tagUsageMap}
                  onToggleTag={(tag) => (postTags.includes(tag) ? removeTagFromPost(tag) : addTagToPost(tag))}
                  onDeleteTag={deleteTagFromCatalog}
                  utilityActions={
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
                  }
                />
              </EditorStudioComposeAssistantPanel>
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

        {isPublishModalOpen ? (
          <EditorStudioPublishModal
            closeToggleLabel="접기"
            displayName={displayName}
            displayNameInitial={displayNameInitial}
            isCompactMobileLayout={isCompactMobileLayout}
            isMobileMetaEditorOpen={isMobileMetaEditorOpen}
            isMobileThumbnailEditorOpen={isMobileThumbnailEditorOpen}
            loadingKey={loadingKey}
            modalNotice={publishModalNotice}
            postThumbnailFocusX={postThumbnailFocusX}
            postThumbnailFocusY={postThumbnailFocusY}
            postThumbnailZoom={postThumbnailZoom}
            postTitle={postTitle}
            postVisibility={postVisibility}
            previewAuthorAvatarSrc={previewAuthorAvatarSrc}
            previewDateText={previewDateText}
            previewFrameStyle={{ maxWidth: `${previewViewportConfig.cardWidth}px` }}
            previewKicker="실제 카드 결과"
            previewMetaEditorPanel={previewMetaEditorPanel}
            previewSummary={resolvedPreviewSummary}
            previewSummaryFallback="요약을 비워두면 본문에서 자동 생성한 요약이 카드에 반영됩니다."
            previewThumbnailSrc={previewThumbnailSrc}
            previewViewport={previewViewport}
            previewViewportLabel={previewViewportConfig.label}
            previewViewportOptions={previewViewportOptions}
            previewVisibilityLabel={previewVisibilityLabel}
            publishActionButtonDisabled={publishActionButtonDisabled}
            publishActionButtonText={publishActionButtonText}
            publishActionTitle={publishActionTitle}
            setupDescription="썸네일 위치와 카드 요약만 조정합니다. 결과는 위 카드에서 바로 확인됩니다."
            shouldShowNotice={shouldShowPublishModalNotice}
            thumbnailEditorPanel={thumbnailEditorPanel}
            visibilityOptions={PUBLISH_VISIBILITY_OPTIONS}
            onClose={closePublishModal}
            onConfirmPublish={() => void handleConfirmPublish()}
            onPostVisibilityChange={setPostVisibility}
            onPreviewThumbnailError={() => setIsPreviewThumbnailError(true)}
            onPreviewViewportChange={setPreviewViewport}
            onToggleMobileMetaEditor={() => setIsMobileMetaEditorOpen((current) => !current)}
            onToggleMobileThumbnailEditor={() => setIsMobileThumbnailEditorOpen((current) => !current)}
          />
        ) : null}

          {SHOW_LEGACY_UTILITY_STUDIO && (
            <EditorStudioLegacyUtilityPanel
              commentContent={commentContent}
              commentId={commentId}
              isCommentDeleteDisabled={disabled("commentDelete")}
              isCommentListDisabled={disabled("commentList")}
              isCommentModifyDisabled={disabled("commentModify")}
              isCommentOneDisabled={disabled("commentOne")}
              isCommentWriteDisabled={disabled("commentWrite")}
              isPostCountDisabled={disabled("admPostCount")}
              isSystemHealthDisabled={disabled("systemHealth")}
              postId={postId}
              onCommentContentChange={setCommentContent}
              onCommentIdChange={setCommentId}
              onDeleteComment={handleDeleteComment}
              onListComments={handleListComments}
              onModifyComment={handleModifyComment}
              onPostIdChange={setPostId}
              onReadComment={handleReadComment}
              onReadPostCount={handleReadPostCount}
              onReadSystemHealth={handleReadSystemHealth}
              onWriteComment={handleWriteComment}
            />
          )}
        </WorkspaceMain>

      </WorkspaceGrid>

      <EditorStudioResultLogPanel
        eyebrow="실행 로그"
        idleDescription="접어서 숨길 수 있습니다"
        idleTitle="최근 작업 응답 보기"
        loadingDescription={(currentLoadingKey) => `실행 중: ${currentLoadingKey}`}
        loadingKey={loadingKey}
        loadingTitle="작업 응답 확인 중"
        result={result}
        variant="standard"
      />
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

const Input = styled.input`
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
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

const TitleInput = styled.textarea<{ $compact?: boolean }>`
  width: 100%;
  min-width: 0;
  border: 0;
  border-radius: 0;
  padding: 0;
  min-height: 44px;
  background: transparent;
  box-shadow: none;
  font-family: inherit;
  font-size: ${articleTypographyScale.postTitleFontSize};
  font-weight: 700;
  line-height: ${articleTypographyScale.postTitleLineHeight};
  letter-spacing: 0;
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
    font-size: ${articleTypographyScale.postTitleFontSizeMobile};
    line-height: ${articleTypographyScale.postTitleLineHeightMobile};
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
  border-bottom: 1px dashed ${({ theme }) => theme.colors.gray6};
  outline: none;
  min-height: 32px;
  padding: 0 0.12rem;
  border-radius: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.86rem;
  font-weight: 500;

  &::placeholder {
    color: ${({ theme }) => theme.colors.gray10};
  }
`

const SummaryCounter = styled.span`
  justify-self: end;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.74rem;
  line-height: 1;
`

const ComposeReadableIntro = styled.div`
  width: 100%;
  max-width: var(--article-readable-width, 48rem);
  min-width: 0;
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
  width: 100%;
  max-width: var(--article-readable-width, 48rem);
  min-width: 0;
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

const SelectedTagChip = styled.span`
  display: inline-flex;
  align-items: stretch;
  gap: 0;
  min-width: 0;
  max-width: 100%;
  min-height: 32px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray3};
  overflow: hidden;
  transition:
    border-color 0.18s ease,
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
    padding: 0.38rem 0.78rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.86rem;
    font-weight: 600;
    line-height: 1;
  }

  > button {
    margin-left: 0;
  }

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: stretch;
    min-width: 1.92rem;
    padding: 0 0.52rem;
    border: 0;
    border-left: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray10};
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
      background: ${({ theme }) => theme.colors.gray4};
      color: ${({ theme }) => theme.colors.gray12};
    }
  }
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

const EditorStudioRoot = styled.main`
  width: min(100%, 1600px);
  margin: 0 auto;
  padding: 1.4rem 1.6rem 2rem;
  display: grid;
  gap: 1.2rem;
  overflow-x: clip;

  @media (max-width: 1024px) {
    padding: 1rem 1rem 1.4rem;
  }

  @media (max-width: 768px) {
    padding-top: 0.92rem;
    padding-bottom: 1.2rem;
    padding-left: max(0.82rem, env(safe-area-inset-left, 0px));
    padding-right: max(0.82rem, env(safe-area-inset-right, 0px));
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

  @media (max-width: 1200px) {
    align-items: center;
    flex-direction: row;
    flex-wrap: nowrap;
    justify-content: space-between;
    gap: 0.8rem;
  }

  @media (max-width: 760px) {
    align-items: stretch;
    flex-direction: column;
    gap: 0.7rem;
  }
`

const EditorExitAction = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 0.2rem 0.32rem;
  margin: -0.2rem -0.32rem;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.98rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    color 0.18s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.gray3};
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.blue4};
  }

  @media (max-width: 1200px) {
    justify-content: flex-start;
  }
`

const EditorStudioTopBarActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: nowrap;
  justify-content: flex-end;

  @media (max-width: 1200px) {
    width: auto;
    margin-left: auto;
    justify-content: flex-end;
    flex-wrap: nowrap;
  }

  @media (max-width: 760px) {
    width: 100%;
    margin-left: 0;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
`

const EditorStudioSaveState = styled.span`
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.84rem;
  font-weight: 600;
  white-space: nowrap;
  text-align: right;

  &[data-tone="success"] {
    color: ${({ theme }) => theme.colors.green10};
  }

  &[data-tone="loading"] {
    color: ${({ theme }) => theme.colors.blue9};
  }

  &[data-tone="error"] {
    color: ${({ theme }) => theme.colors.red10};
  }

  @media (max-width: 680px) {
    width: 100%;
  }
`

const EditorStudioFrame = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.4rem;
  align-items: start;
  justify-content: center;
  overflow-x: visible;

  @media (min-width: 1024px) {
    grid-template-columns: minmax(0, 1fr);
    gap: 1.4rem;
  }
`

const EditorStudioWritingColumn = styled.section<{ $compact?: boolean }>`
  display: grid;
  min-width: 0;
  gap: ${({ $compact }) => ($compact ? "0.88rem" : "1rem")};
  overflow-x: visible;
`

const EditorStudioMetaSection = styled.section<{ $compact?: boolean }>`
  width: 100%;
  max-width: var(--article-readable-width, 48rem);
  min-width: 0;
  margin-inline: auto;
  display: grid;
  gap: ${({ $compact }) => ($compact ? "0.72rem" : "0.9rem")};
`

const EditorTagRow = styled.div<{ $compact?: boolean }>`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ $compact }) => ($compact ? "0.44rem" : "0.55rem")};
  min-height: 32px;
`

const EditorHeaderMetaRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.85rem;
  min-width: 0;
`

const EditorHeaderMetaActions = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.45rem;
  min-width: 0;
`

const EditorHeaderAuthor = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.85rem;
  min-width: 0;
`

const EditorHeaderAvatar = styled.div<{ $compact?: boolean }>`
  position: relative;
  width: ${({ $compact }) => ($compact ? "40px" : "48px")};
  height: ${({ $compact }) => ($compact ? "40px" : "48px")};
  flex-shrink: 0;
  border-radius: 999px;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.gray3};

  .initial {
    display: inline-flex;
    width: 100%;
    height: 100%;
    align-items: center;
    justify-content: center;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.84rem;
    font-weight: 800;
    letter-spacing: 0.04em;
  }
`

const EditorHeaderAuthorText = styled.div<{ $compact?: boolean }>`
  display: grid;
  gap: ${({ $compact }) => ($compact ? "0.12rem" : "0.18rem")};
  min-width: 0;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: ${({ $compact }) => ($compact ? "0.94rem" : "1rem")};
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: ${({ $compact }) => ($compact ? "0.82rem" : "0.9rem")};
    font-weight: 500;
  }
`

const EditorHeaderMetaPill = styled.span<{ $compact?: boolean }>`
  display: inline-flex;
  align-items: center;
  min-height: ${({ $compact }) => ($compact ? "30px" : "34px")};
  padding: ${({ $compact }) => ($compact ? "0 0.72rem" : "0 0.82rem")};
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray11};
  font-size: ${({ $compact }) => ($compact ? "0.74rem" : "0.82rem")};
  font-weight: 650;
  line-height: 1;
`

const EditorHeaderActionButton = styled(Button)`
  min-height: 34px;
  padding: 0.45rem 0.7rem;
  border-radius: 999px;
  font-size: 0.78rem;
`

const EditorStudioCanvas = styled.section`
  --compose-pane-readable-width: var(--article-readable-width, 48rem);
  width: 100%;
  max-width: var(--article-readable-width, 48rem);
  min-width: 0;
  margin-inline: auto;
  min-height: clamp(28rem, 70vh, 56rem);
  display: grid;
  gap: 0.72rem;
  overflow-x: visible;
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

const MobileComposeStatusBar = styled.div`
  display: none;

  @media (max-width: 720px) {
    position: sticky;
    top: calc(var(--app-header-height, 64px) + 0.3rem);
    z-index: 22;
    display: grid;
    gap: 0.5rem;
    margin-bottom: 0.72rem;
    padding: 0.72rem 0.82rem;
    border-radius: 14px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: color-mix(in srgb, ${({ theme }) => theme.colors.gray2} 92%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: 0 12px 28px rgba(2, 6, 23, 0.16);

    .headline {
      display: grid;
      gap: 0.16rem;
    }

    .headline strong {
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: -0.01em;
    }

    .headline span {
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.76rem;
      line-height: 1.45;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.42rem;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 26px;
      padding: 0 0.58rem;
      border-radius: 999px;
      border: 1px solid ${({ theme }) => theme.colors.gray6};
      background: ${({ theme }) => theme.colors.gray1};
      color: ${({ theme }) => theme.colors.gray11};
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: -0.01em;
    }

    &[data-tone="loading"] {
      border-color: ${({ theme }) => theme.colors.blue7};
      background: color-mix(in srgb, ${({ theme }) => theme.colors.blue3} 82%, transparent);
    }

    &[data-tone="success"] {
      border-color: ${({ theme }) => theme.colors.green7};
      background: color-mix(in srgb, ${({ theme }) => theme.colors.green3} 84%, transparent);
    }

    &[data-tone="error"] {
      border-color: ${({ theme }) => theme.colors.red7};
      background: color-mix(in srgb, ${({ theme }) => theme.colors.red3} 84%, transparent);
    }
  }
`
