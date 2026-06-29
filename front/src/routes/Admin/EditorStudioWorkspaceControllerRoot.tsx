import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/router"
import {
  useDeferredValue,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react"
import { apiFetch } from "src/apis/backend/client"
import useAuthSession from "src/hooks/useAuthSession"
import {
  compareCategoryValues,
  normalizeCategoryValue,
} from "src/libs/utils"
import {
  consumeGuardOnExpectedUpdate,
  createMarkdownEditorLoadGuardState,
  markGuardEmptyUpdateIgnored,
  restoreMarkdownEditorCodeLossUpdate,
  shouldIgnoreMarkdownEditorEmptyUpdate,
  type MarkdownEditorLoadGuardState,
} from "./markdownLoadSyncGuard"
import {
  toFlags,
  toVisibility,
  type EditorMode,
  type PostVisibility,
  type PublishActionType,
} from "./editorStudioState"
import { useEditorStudioAdminPostFlow } from "./useEditorStudioAdminPostFlow"
import { useEditorStudioDraftLifecycle } from "./useEditorStudioDraftLifecycle"
import { useEditorStudioPersistence } from "./useEditorStudioPersistence"
import { useEditorStudioRouting } from "./useEditorStudioRouting"
import { useEditorStudioListConditions } from "./useEditorStudioListConditions"
import { useEditorStudioThumbnailControls } from "./useEditorStudioThumbnailControls"
import { useEditorStudioThumbnailPreview } from "./useEditorStudioThumbnailPreview"
import { useEditorStudioMetaCatalog } from "./useEditorStudioMetaCatalog"
import { useEditorStudioPublishModalFlow } from "./useEditorStudioPublishModalFlow"
import { useEditorStudioProfileCommands } from "./useEditorStudioProfileCommands"
import { useEditorStudioUtilityCommands } from "./useEditorStudioUtilityCommands"
import { useEditorStudioWorkspaceControllerRuntime } from "./useEditorStudioWorkspaceControllerRuntime"
import { EditorStudioWorkspaceControllerRootView } from "./EditorStudioWorkspaceControllerRootView"
import {
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
  type MetaUsageMap,
  type ResolvedEditorMetaSnapshot,
} from "./editorStudioMetaModel"
import { replaceShallowRoutePreservingScroll } from "src/libs/router"
import type { AdminPageProps } from "src/libs/server/adminPage"
import {
  DEFAULT_THUMBNAIL_FOCUS_X,
  DEFAULT_THUMBNAIL_FOCUS_Y,
  DEFAULT_THUMBNAIL_ZOOM,
  stripThumbnailFocusFromUrl,
} from "src/libs/thumbnailFocus"
import {
  CATEGORY_CATALOG_STORAGE_KEY,
  TAG_CATALOG_STORAGE_KEY,
  persistCatalog,
  persistLocalDraft,
  readLocalDraft,
  readStoredCatalog,
  removeLocalDraft,
} from "./editorStudioStorageModel"
import {
  ADMIN_POSTS_WORKSPACE_ROUTE,
  EDITOR_NEW_ROUTE_PATH,
  GLOBAL_NOTICE_IDLE_TEXT,
  buildEffectiveThumbnailUrl,
  buildEmptyEditorMetaSnapshot,
  extractImageFileFromClipboard,
  generateIdempotencyKey,
  isBlankServerTempDraft,
  normalizeEditorReturnRoute,
  pretty,
  requestTempPostWithConflictRetry,
  toEditorPostRoute,
  uploadWithConflictRetry,
  type ComposeMobileStudioStep,
  type ManageMobileStudioStep,
  type NoticeState,
  type PostForEditor,
  type PreviewViewportMode,
  type RsData,
  type StudioSurface,
} from "./EditorStudioWorkspaceControllerRootModel"

type MarkdownEditorFlush = () => string
type MarkdownEditorChangeMeta = {
  editorFocused: boolean
}

type EditorStudioWorkspaceControllerProps = AdminPageProps & {
  initialEditorPost?: PostForEditor | null
}

export const EditorStudioWorkspaceController = ({
  initialEditorPost = null,
  initialMember,
}: EditorStudioWorkspaceControllerProps) => {
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
  const flushEditorMarkdownRef = useRef<MarkdownEditorFlush | null>(null)
  const deferredContentDerivedCacheRef = useRef<{
    fingerprint: string
    summary: string
    firstImage: string
  }>({
    fingerprint: "",
    summary: "",
    firstImage: "",
  })
  const markdownEditorLoadGuardStateRef = useRef<MarkdownEditorLoadGuardState>({
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

  useEffect(() => {
    postContentLiveRef.current = postContent
  }, [postContent])

  const handleMarkdownEditorChange = useCallback((nextMarkdown: string, meta?: MarkdownEditorChangeMeta) => {
    const previousMarkdown = postContentLiveRef.current
    if (nextMarkdown === previousMarkdown) {
      return
    }

    let nextGuardState = consumeGuardOnExpectedUpdate(markdownEditorLoadGuardStateRef.current, nextMarkdown)

    if (shouldIgnoreMarkdownEditorEmptyUpdate({
      nextMarkdown,
      currentMarkdown: previousMarkdown,
      guardState: nextGuardState,
    })) {
      markdownEditorLoadGuardStateRef.current = markGuardEmptyUpdateIgnored(nextGuardState)
      return
    }

    const restoredCodeLossUpdate = restoreMarkdownEditorCodeLossUpdate({
      nextMarkdown,
      currentMarkdown: previousMarkdown,
      guardState: nextGuardState,
      editorFocused: meta?.editorFocused === true,
    })

    if (restoredCodeLossUpdate.changed) {
      const restoredMarkdown = restoredCodeLossUpdate.markdown
      markdownEditorLoadGuardStateRef.current = consumeGuardOnExpectedUpdate(nextGuardState, restoredMarkdown)
      postContentLiveRef.current = restoredMarkdown
      setPostContent(restoredMarkdown)
      return
    }

    if (meta?.editorFocused) {
      nextGuardState = {
        ...nextGuardState,
        ignoreUntilMs: 0,
        ignoredInitialEmpty: true,
      }
      markdownEditorLoadGuardStateRef.current = nextGuardState
      postContentLiveRef.current = nextMarkdown
      startPostContentTransition(() => {
        setPostContent(nextMarkdown)
      })
      return
    }

    markdownEditorLoadGuardStateRef.current = nextGuardState
    postContentLiveRef.current = nextMarkdown
    setPostContent(nextMarkdown)
  }, [startPostContentTransition])

  const handleFlushMarkdownReady = useCallback((flush: MarkdownEditorFlush | null) => {
    flushEditorMarkdownRef.current = flush
  }, [])

  const getCurrentPostContent = useCallback(() => {
    const flushedMarkdown = flushEditorMarkdownRef.current?.()
    if (typeof flushedMarkdown === "string") {
      postContentLiveRef.current = flushedMarkdown
      return flushedMarkdown
    }
    return postContentLiveRef.current
  }, [])

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
  const {
    copyPostDetailLink,
    disabled,
    handleSelectedPostIdChange,
    handleTitleChange,
    handleTitleFieldRef,
    handleTitleKeyDown,
    openPostDetailRoute,
    publishModalHintByAction,
    refreshPublicPostReadViews,
    run,
    setPublishStatus,
  } = useEditorStudioWorkspaceControllerRuntime({
    isPublishModalOpen,
    loadingKey,
    postId,
    postTitle,
    queryClient,
    router,
    setEditorMode,
    setGlobalNotice,
    setIsTempDraftMode,
    setLoadingKey,
    setPostId,
    setPostTitle,
    setPostVersion,
    setPublishModalNotice,
    setPublishNotice,
    setResult,
  })

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

  const syncEditorMeta = useCallback((content: string, contentHtml?: string | null) => {
    const snapshot = resolveEditorMetaSnapshot(content, contentHtml)
    markdownEditorLoadGuardStateRef.current = createMarkdownEditorLoadGuardState(snapshot.body)
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
    getCurrentPostContent,
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
    return buildEffectiveThumbnailUrl({
      postThumbnailFocusX,
      postThumbnailFocusY,
      postThumbnailZoom,
      resolvedPreviewThumbnail,
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
    refreshEditorMetaCatalog,
    removeTagFromPost,
  } = useEditorStudioMetaCatalog({
    customTagCatalog,
    postTags,
    setCustomTagCatalog,
    setKnownTags,
    setMetaCatalogLoading,
    setMetaNotice,
    setPostTags,
    setTagDraft,
    setTagUsageMap,
    tagUsageMap,
  })

  const {
    handleMarkdownEditorFileUpload,
    handleMarkdownEditorImageUpload,
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
    getCurrentPostContent,
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
    initialEditorPost,
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
  })

  const handleContinueSelectedPostEditing = useCallback(() => {
    openPublishModal("modify")
  }, [openPublishModal])

  const handleCreateNewPostFromSelectedPanel = useCallback(() => {
    switchToCreateMode({ keepContent: false })
  }, [switchToCreateMode])

  const handleLogout = useCallback(async () => {
    await apiFetch("/member/api/v1/auth/logout", { method: "DELETE" }).catch(() => undefined)
    setMe(null)
    const rawNextPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
    const nextPath = rawNextPath.startsWith("/") && !rawNextPath.startsWith("//") ? rawNextPath : "/editor/new"
    window.location.href = `/login?next=${encodeURIComponent(nextPath)}`
  }, [setMe])

  const handleDeleteSelectedPost = useCallback(() => {
    openDeleteConfirm([Number.parseInt(postId, 10)], postTitle)
  }, [openDeleteConfirm, postId, postTitle])

  return (
    <EditorStudioWorkspaceControllerRootView
      props={{
        activeMetaPanel, addTagsToPost, addTagToPost, adminPostRows, adminPostTotal,
        adminPostViewRows, applyFirstBodyImageToThumbnail, applyListQuickPreset, clearLocalDraft, closeDeleteConfirm,
        closePublishModal, commentContent, commentId, commitPreviewThumbTransform, copyPostDetailLink,
        deferredPostContent, deferredContentDerived, deleteConfirmNotice, deleteConfirmState, deletePostsFromList,
        deletedListNotice,
        deleteTagFromCatalog, disabled, editorMode, finalizePreviewThumbPointer, globalNotice,
        handleMarkdownEditorChange, handleMarkdownEditorFileUpload, handleMarkdownEditorImageUpload, handleConfirmPublish, handleContinueSelectedPostEditing,
        handleCreateNewPostFromSelectedPanel, handleDeleteComment, handleDeleteSelectedPost, handleExitDedicatedEditor, handleFlushMarkdownReady, handleHitPost,
        handleLikePost, handleListComments, handleListPageChange, handleListPageSizeChange, handleListSortChange, handleLogout,
        handleLoadOrCreateTempPost, handleModifyComment, handlePreviewThumbPointerDown, handlePreviewThumbPointerMove, handleProfileImageSelected,
        handleReadComment, handleReadPostCount, handleReadSystemHealth, handleRefreshAdminProfile,
        handleSelectedPostIdChange, handleThumbnailImageFileChange, handleThumbnailPaste, handleThumbnailUrlModalChange, handleTitleChange,
        handleTitleFieldRef, handleTitleKeyDown, handleUndoSoftDelete, handleUpdateMemberProfileCard, handleWriteComment,
        hardDeleteDeletedPostFromList, isAllVisiblePostsSelected, isCompactMobileLayout, isComposeAssistOpen, isComposeUtilityOpen,
        isDedicatedEditorRoute, isDedicatedNewEditorRoute, isDirectLoadOpen, isListAdvancedOpen, isMobileMetaEditorOpen,
        isMobileThumbnailEditorOpen, isNewEditorBootstrapPending, isPreviewThumbDragging, isPreviewThumbnailError, isPublishModalOpen,
        isSelectedToolsOpen, isTempDraftMode, knownTags, lastLocalDraftFingerprintRef, listKw,
        listPage,
        listPageSize, listQuickPreset, listScope, listSort, loadAdminPosts,
        loadPostForEditor, loadingKey, localDraftSavedAt, member, metaNotice,
        mobileComposeStep, mobileManageStep, modifiedSortOrder, openDeleteConfirm, openPostDetailRoute,
        openPublishModal, openThumbnailFileInput, postCategory, postContent, postId,
        postSummary, postTags, postThumbnailFocusX, postThumbnailFocusY, postThumbnailUrl,
        postThumbnailZoom, postTitle, postVersion, postVisibility, profileBioInput,
        profileImageFileInputRef, profileImageFileName, profileImageNotice, profileImgInputUrl, profileNotice,
        profileRoleInput, publishActionType, publishModalNotice, publishNotice, previewThumbFrameRef,
        previewThumbTransformRef, previewViewport, resolvedPreviewSummary, resetListFilters, resetThumbnailToAutoMode,
        removeTagFromPost, restoreDeletedPostFromList, restoreLocalDraft, result, safePreviewThumbnail,
        saveLocalDraft,
        selectedPostIdSet, selectedPostIds, serverBaselineEditorFingerprintRef, sessionMember, setActiveMetaPanel,
        setCommentContent, setCommentId, setIsComposeAssistOpen, setIsComposeUtilityOpen, setIsDirectLoadOpen,
        setIsMobileMetaEditorOpen,
        setIsMobileThumbnailEditorOpen, setIsPreviewThumbnailError, setIsSelectedToolsOpen, setListKw, setListScope,
        setMobileComposeStep,
        setMobileManageStep, setModifiedSortOrder, setPostId, setPostSummary, setPostVisibility,
        setPreviewViewport, setProfileBioInput, setProfileRoleInput, setSelectedPostIds, setTagDraft,
        softDeleteUndoState, studioSurface, tagDraft, tagUsageMap,
        thumbnailImageFileInputRef, thumbnailImageFileName, toggleListAdvanced, togglePostSelection, toggleSelectAllVisiblePosts,
      }}
    />
  )
}

export default EditorStudioWorkspaceController
