import styled from "@emotion/styled"
import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/router"
import {
  type ChangeEvent,
  useDeferredValue,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react"
import { getApiBaseUrl } from "src/apis/backend/client"
import { invalidatePublicPostReadCaches } from "src/apis/backend/posts"
import useAuthSession from "src/hooks/useAuthSession"
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
import { useEditorStudioAdminPostFlow } from "./useEditorStudioAdminPostFlow"
import { useEditorStudioDraftLifecycle } from "./useEditorStudioDraftLifecycle"
import { useEditorStudioPersistence } from "./useEditorStudioPersistence"
import { useEditorStudioRouting } from "./useEditorStudioRouting"
import {
  LIST_SORT_OPTIONS,
  useEditorStudioListConditions,
} from "./useEditorStudioListConditions"
import { useEditorStudioThumbnailControls } from "./useEditorStudioThumbnailControls"
import { useEditorStudioThumbnailPreview } from "./useEditorStudioThumbnailPreview"
import { useEditorStudioMetaCatalog } from "./useEditorStudioMetaCatalog"
import { useEditorStudioPublishModalFlow } from "./useEditorStudioPublishModalFlow"
import { useEditorStudioProfileCommands } from "./useEditorStudioProfileCommands"
import { useEditorStudioUtilityCommands } from "./useEditorStudioUtilityCommands"
import {
  EditorStudioThumbnailEditorPanel,
  EditorStudioThumbnailMetaPanel,
} from "./EditorStudioThumbnailPanels"
import { EditorStudioPublishModal } from "./EditorStudioPublishModal"
import { EditorStudioLegacyProfileSection } from "./EditorStudioLegacyProfileSection"
import { EditorStudioLegacyUtilityPanel } from "./EditorStudioLegacyUtilityPanel"
import { EditorStudioResultLogPanel } from "./EditorStudioResultLogPanel"
import { EditorStudioDeleteConfirmDialog } from "./EditorStudioDeleteConfirmDialog"
import { EditorStudioComposeWorkspace } from "./EditorStudioComposeWorkspace"
import { EditorStudioContentWorkspace } from "./EditorStudioContentWorkspace"
import {
  EditorStudioDedicatedEditorLoadingState,
  EditorStudioDedicatedEditorSurface,
} from "./EditorStudioDedicatedEditorSurface"
import {
  isServerTempDraftPost,
  TEMP_DRAFT_BODY_PLACEHOLDER,
} from "./editorTempDraft"
import {
  PREVIEW_SUMMARY_MAX_LENGTH,
  buildEditorStateFingerprint,
  buildLocalDraftFingerprint,
  composeEditorContent,
  computeContentFingerprint,
  dedupeStrings,
  detectPublishPlaceholderIssue,
  extractFirstMarkdownImage,
  makePreviewSummary,
  normalizeSafeImageUrl,
  normalizeSafePreviewThumbnailUrl,
  resolveEditorMetaSnapshot,
  type LocalDraftPayload,
  type MetaUsageMap,
  type ResolvedEditorMetaSnapshot,
} from "./editorStudioMetaModel"
import {
  pushRoute,
  replaceShallowRoutePreservingScroll,
} from "src/libs/router"
import { toCanonicalPostPath } from "src/libs/utils/postPath"
import type { AdminPageProps } from "src/libs/server/adminPage"
import {
  applyThumbnailTransformToUrl,
  clampThumbnailZoom,
  DEFAULT_THUMBNAIL_FOCUS_X,
  DEFAULT_THUMBNAIL_FOCUS_Y,
  DEFAULT_THUMBNAIL_ZOOM,
  stripThumbnailFocusFromUrl,
} from "src/libs/thumbnailFocus"
import {
  POST_IMAGE_UPLOAD_RULE_LABEL,
  PROFILE_IMAGE_UPLOAD_RULE_LABEL,
} from "src/libs/profileImageUpload"
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

type RsData<T> = {
  resultCode: string
  msg: string
  data: T
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

const GLOBAL_NOTICE_IDLE_TEXT = "운영 작업 상태가 여기에 표시됩니다."
const TAG_RECOMMENDATION_IDLE_TEXT = "AI 태그 추천 상태가 여기에 표시됩니다."
const MANAGE_MOBILE_STUDIO_STEPS = ["query", "list"] as const
const COMPOSE_MOBILE_STUDIO_STEPS = ["edit", "publish"] as const

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

export const EditorStudioWorkspaceController = ({ initialMember }: AdminPageProps) => {
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

    if (shouldIgnoreBlockEditorEmptyUpdate({
      nextMarkdown,
      currentMarkdown: previousMarkdown,
      guardState: nextGuardState,
    })) {
      blockEditorLoadGuardStateRef.current = markGuardEmptyUpdateIgnored(nextGuardState)
      return
    }

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

    blockEditorLoadGuardStateRef.current = nextGuardState
    postContentLiveRef.current = nextMarkdown
    setPostContent(nextMarkdown)
  }, [startPostContentTransition])

  const {
    listPage,
    listPageSize,
    listKw,
    setListKw,
    listSort,
    listScope,
    setListScope,
    listQuickPreset,
    setListQuickPreset,
    isListAdvancedOpen,
    handleListPageChange,
    handleListPageSizeChange,
    handleListSortChange,
    applyListQuickPreset,
    resetListFilters,
    toggleListAdvanced,
  } = useEditorStudioListConditions()
  const [isDirectLoadOpen, setIsDirectLoadOpen] = useState(false)
  const [isSelectedToolsOpen, setIsSelectedToolsOpen] = useState(false)

  const isDedicatedEditorRoute = router.pathname.startsWith("/editor")
  const isDedicatedNewEditorRoute = isDedicatedEditorRoute && router.pathname === EDITOR_NEW_ROUTE_PATH
  const [isNewEditorBootstrapPending, setIsNewEditorBootstrapPending] = useState(isDedicatedNewEditorRoute)
  const redirectingRef = useRef(false)
  const hydratedAdminIdRef = useRef<number | null>(null)
  const autoLoadedPostIdRef = useRef<string | null>(null)
  const autoCreatedTempDraftRef = useRef(false)
  const tempPostRequestRef = useRef<Promise<RsData<PostForEditor>> | null>(null)
  const lastWriteFingerprintRef = useRef<string>("")
  const lastWriteIdempotencyKeyRef = useRef<string>("")
  const lastLocalDraftFingerprintRef = useRef("")
  const serverBaselineEditorFingerprintRef = useRef("")
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

  const {
    applyProfileState,
    handleProfileImageSelected,
    handleRefreshAdminProfile,
    handleUpdateMemberProfileCard,
    member,
    profileBioInput,
    profileImageFileInputRef,
    profileImageFileName,
    profileImageNotice,
    profileImgInputUrl,
    profileNotice,
    profileRoleInput,
    setProfileBioInput,
    setProfileNotice,
    setProfileRoleInput,
  } = useEditorStudioProfileCommands({
    initialMember,
    pretty,
    queryClient,
    run,
    sessionMember,
    setLoadingKey,
    setMe,
    setResult,
    uploadWithConflictRetry,
  })

  const {
    handleDeleteComment,
    handleHitPost,
    handleLikePost,
    handleListComments,
    handleModifyComment,
    handleReadComment,
    handleReadPostCount,
    handleReadSystemHealth,
    handleWriteComment,
  } = useEditorStudioUtilityCommands({
    commentContent,
    commentId,
    postId,
    run,
  })

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
    postContentLiveRef.current = snapshot.body
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

  const {
    addTagsToPost,
    addTagToPost,
    deleteTagFromCatalog,
    handleRecommendTags,
    refreshEditorMetaCatalog,
    removeTagFromPost,
  } = useEditorStudioMetaCatalog({
    customTagCatalog,
    postContent,
    postTags,
    postTitle,
    setCustomTagCatalog,
    setKnownTags,
    setLoadingKey,
    setMetaCatalogLoading,
    setMetaNotice,
    setPostTags,
    setTagDraft,
    setTagRecommendationNotice,
    setTagUsageMap,
    tagUsageMap,
  })

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

  const {
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
  } = useEditorStudioAdminPostFlow({
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
  })

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
    setCustomTagCatalog(readStoredCatalog(TAG_CATALOG_STORAGE_KEY))
    setCustomCategoryCatalog(
      dedupeStrings(readStoredCatalog(CATEGORY_CATALOG_STORAGE_KEY).map(normalizeCategoryValue)).sort(
        compareCategoryValues
      )
    )
  }, [])

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
  }, [applyProfileState, refreshEditorMetaCatalog, sessionMember, setProfileNotice])

  const {
    closePublishModal,
    handleConfirmPublish,
    openPublishModal,
  } = useEditorStudioPublishModalFlow({
    activateComposeSurface,
    handleModifyPost,
    handlePublishTempDraft,
    handleWritePost,
    isCompactMobileLayout,
    isPreviewThumbnailError,
    loadingKey,
    publishActionType,
    publishModalHintByAction,
    safePreviewThumbnail,
    setIsMobileMetaEditorOpen,
    setIsMobileThumbnailEditorOpen,
    setIsPublishModalOpen,
    setMobileComposeStep,
    setPreviewViewport,
    setPublishActionType,
    setPublishModalNotice,
    setTagRecommendationNotice,
    tagRecommendationIdleText: TAG_RECOMMENDATION_IDLE_TEXT,
  })

  const handleContinueSelectedPostEditing = useCallback(() => {
    openPublishModal("modify")
  }, [openPublishModal])

  const handleCreateNewPostFromSelectedPanel = useCallback(() => {
    switchToCreateMode({ keepContent: false })
  }, [switchToCreateMode])

  const handleDeleteSelectedPost = useCallback(() => {
    openDeleteConfirm([Number.parseInt(postId, 10)], postTitle)
  }, [openDeleteConfirm, postId, postTitle])

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
    return <EditorStudioDedicatedEditorLoadingState />
  }

  if (isDedicatedEditorRoute) {
    return (
      <EditorStudioDedicatedEditorSurface
        thumbnailImageFileInputRef={thumbnailImageFileInputRef}
        onThumbnailImageFileChange={handleThumbnailImageFileChange}
        onExit={handleExitDedicatedEditor}
        saveStateText={composeStatusText}
        saveStateTone={composeStatusTone}
        primaryActionDisabled={publishActionTriggerDisabled}
        primaryActionLabel={editorPrimaryActionLabel}
        onPrimaryAction={() => openPublishModal(editorPrimaryActionType)}
        isCompactSplitPreview={isCompactSplitPreview}
        postTags={postTags}
        tagDraft={tagDraft}
        onTagDraftChange={setTagDraft}
        onAddTags={addTagsToPost}
        onAddTag={addTagToPost}
        onRemoveTag={removeTagFromPost}
        titleInputRef={handleTitleFieldRef}
        postTitle={postTitle}
        onPostTitleChange={handleTitleChange}
        onPostTitleKeyDown={handleTitleKeyDown}
        authorName={displayName}
        authorInitial={displayNameInitial}
        authorAvatarSrc={previewAuthorAvatarSrc}
        previewDateText={previewDateText}
        currentVisibilityText={currentVisibilityText}
        canOpenCurrentPostDetail={canOpenCurrentPostDetail}
        onOpenPostDetail={() => void openPostDetailRoute(postId)}
        onCopyPostDetailLink={() => void copyPostDetailLink(postId, postTitle)}
        editorCanvas={dedicatedEditorCanvas}
        showPublishNotice={shouldShowPublishNotice}
        publishNoticeTone={publishNotice.tone}
        publishNoticeText={publishNotice.text}
        resultPanel={dedicatedEditorResultPanel}
        publishModal={
          isPublishModalOpen ? (
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
          ) : null
        }
      />
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
            <EditorStudioContentWorkspace
              shouldShowGlobalNotice={shouldShowGlobalNotice}
              globalNotice={globalNotice}
              mobileStudioSurfaceSteps={mobileStudioSurfaceSteps}
              activeMobileStudioStep={activeMobileStudioStep}
              mobileStudioStepLabels={MOBILE_STUDIO_STEP_LABEL}
              mobileStudioStepDescriptions={MOBILE_STUDIO_STEP_DESCRIPTION}
              mobileStudioPrevStep={mobileStudioPrevStep}
              mobileStudioNextStep={mobileStudioNextStep}
              mobileStudioPrevStepLabel={mobileStudioPrevStepLabel}
              mobileStudioNextStepLabel={mobileStudioNextStepLabel}
              isCompactMobileLayout={isCompactMobileLayout}
              onMobileStepChange={setActiveMobileStudioStep}
              listScope={listScope}
              listKeyword={listKw}
              listQuickPreset={listQuickPreset}
              hasListFiltersApplied={hasListFiltersApplied}
              isListAdvancedOpen={isListAdvancedOpen}
              listPage={listPage}
              listPageSize={listPageSize}
              listSort={listSort}
              listSortOptions={LIST_SORT_OPTIONS}
              isListRefreshDisabled={disabled("postList")}
              isTempPostDisabled={disabled("postTemp")}
              onListScopeChange={setListScope}
              onListKeywordChange={setListKw}
              onRefreshList={() => void loadAdminPosts()}
              onLoadOrCreateTempPost={() => void handleLoadOrCreateTempPost()}
              onApplyQuickPreset={applyListQuickPreset}
              onResetFilters={resetListFilters}
              onToggleListAdvanced={toggleListAdvanced}
              onListPageChange={handleListPageChange}
              onListPageSizeChange={handleListPageSizeChange}
              onListSortChange={handleListSortChange}
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
              onToggleSelectAllVisiblePosts={toggleSelectAllVisiblePosts}
              onClearSelection={() => setSelectedPostIds([])}
              onRequestDeletePosts={(ids, headline) => openDeleteConfirm(ids, headline)}
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
              showSelectedPanelInManageSurface={showSelectedPanelInManageSurface}
              hasSelectedManagedPost={hasSelectedManagedPost}
              editorModeLabel={editorModeLabel}
              selectedPostLabel={selectedPostLabel}
              postTitle={postTitle}
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
              isDirectLoadOpen={isDirectLoadOpen}
              onToggleDirectLoad={() => setIsDirectLoadOpen((prev) => !prev)}
              isSelectedToolsOpen={isSelectedToolsOpen}
              onToggleSelectedTools={() => setIsSelectedToolsOpen((prev) => !prev)}
              onPostIdChange={handleSelectedPostIdChange}
              isLoadPostDisabled={disabled("postOne")}
              onLoadPost={() => void loadPostForEditor()}
              isHitPostDisabled={disabled("hitPost")}
              onRunHitPost={() =>
                handleHitPost()
              }
              isLikePostDisabled={disabled("likePost")}
              onRunLikePost={() =>
                handleLikePost()
              }
              softDeleteUndoMessage={softDeleteUndoState?.message || ""}
              isSoftDeleteUndoVisible={Boolean(softDeleteUndoState)}
              isUndoDisabled={disabled("undoDeletePost")}
              onUndoSoftDelete={() => void handleUndoSoftDelete()}
            />
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
          <EditorStudioComposeWorkspace
            isCompactMobileLayout={isCompactMobileLayout}
            isPublishModalOpen={isPublishModalOpen}
            mobilePrimaryStatus={mobileComposeStatusPrimary}
            mobileSecondaryStatusText={mobileComposeStatusSecondary?.text}
            mobilePrimaryActionLabel={mobilePrimaryActionLabel}
            composeCallToActionLabel={composeCallToActionLabel}
            mobilePrimaryActionDisabled={mobilePrimaryActionDisabled}
            onPrimaryAction={() => openPublishModal(editorPrimaryActionType)}
            currentVisibilityText={currentVisibilityText}
            editorModeLabel={editorModeLabel}
            composePageTitle={composePageTitle}
            composeSurfaceSubtitle={composeSurfaceSubtitle}
            composeStatusText={composeStatusText}
            composeStatusTone={composeStatusTone}
            postSummary={postSummary}
            postSummaryMaxLength={PREVIEW_SUMMARY_MAX_LENGTH}
            onPostSummaryChange={setPostSummary}
            isFillSummaryFromBodyDisabled={!postContent.trim()}
            onFillSummaryFromBody={() => setPostSummary(makePreviewSummary(postContent))}
            postTags={postTags}
            tagDraft={tagDraft}
            onTagDraftChange={setTagDraft}
            onAddTags={addTagsToPost}
            onAddTag={addTagToPost}
            onRemoveTag={removeTagFromPost}
            titleInputRef={handleTitleFieldRef}
            postTitle={postTitle}
            onPostTitleChange={handleTitleChange}
            onPostTitleKeyDown={handleTitleKeyDown}
            thumbnailImageFileInputRef={thumbnailImageFileInputRef}
            onThumbnailImageFileChange={handleThumbnailImageFileChange}
            contentLength={contentLength}
            lineCount={lineCount}
            imageCount={imageCount}
            editorCanvas={composeEditorCanvas}
            tagSummaryText={tagSummaryText}
            isSaveDraftDisabled={loadingKey.length > 0}
            onSaveLocalDraft={saveLocalDraft}
            composeHeroSummary={composeHeroSummary}
            isRecommendTagsDisabled={disabled("recommendTags") || !postContent.trim()}
            isRecommendTagsLoading={loadingKey === "recommendTags"}
            onRecommendTags={() => void handleRecommendTags()}
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
            isTagPanelOpen={activeMetaPanel === "tag"}
            onToggleTagPanel={() => setActiveMetaPanel((prev) => (prev === "tag" ? null : "tag"))}
            isUtilityPanelOpen={isComposeUtilityOpen}
            onToggleUtilityPanel={() => setIsComposeUtilityOpen((prev) => !prev)}
            metaNotice={metaNotice}
            knownTags={knownTags}
            tagUsageMap={tagUsageMap}
            onToggleKnownTag={(tag) => (postTags.includes(tag) ? removeTagFromPost(tag) : addTagToPost(tag))}
            onDeleteKnownTag={deleteTagFromCatalog}
            onRestoreLocalDraft={restoreLocalDraft}
            onClearLocalDraft={clearLocalDraft}
            isClearLocalDraftDisabled={loadingKey.length > 0 || !localDraftSavedAt}
          />
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

export default EditorStudioWorkspaceController

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
