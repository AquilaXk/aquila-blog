import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react"
import {
  localDraftSourcesEqual,
  type LocalDraftPayload,
  type LocalDraftSource,
} from "./editorStudioMetaModel"
import type { PostVisibility } from "./editorStudioState"
import {
  describeLocalDraftSlot,
  migrateLocalDraftV1Once,
  resolveLocalDraftSource,
} from "./editorStudioStorageModel"

type StudioSetState<T> = Dispatch<SetStateAction<T>>
type NoticeTone = "idle" | "loading" | "success" | "error"
type PublishNotice = { tone: NoticeTone; text: string }
type PublishTarget = "page" | "modal"
type EditorMode = "create" | "edit"

/** loadingKey values whose settle should adopt editor fingerprint as autosave baseline. */
export const LOCAL_DRAFT_BASELINE_SETTLE_LOADING_KEYS = new Set([
  "postOne",
  "postTemp",
  "writePost",
  "modifyPost",
  "publishTempPost",
])

export const isLocalDraftBaselineSettleLoadingKey = (loadingKey: string): boolean =>
  LOCAL_DRAFT_BASELINE_SETTLE_LOADING_KEYS.has(loadingKey)

/**
 * ID field edits switch editorMode to create while keeping the previous body and a
 * non-empty postId. Autosave must stay gated until a successful load settles into edit.
 */
export const isLocalDraftAutosaveGatedForPostIdTransition = (
  editorMode: "create" | "edit",
  postId: string
): boolean => editorMode === "create" && postId.trim().length > 0

const CREATE_WRITE_MISSING_POST_ID_STATUS_TEXT =
  "글 작성 응답에 글 ID가 없습니다. 로컬 임시저장은 유지됩니다. 다시 시도해주세요."

export type CreateWritePostIdResolution =
  | { ok: true; postId: string }
  | { ok: false; statusText: string }

/** Create-mode write success must include a non-empty post id before draft cleanup. */
export const resolveCreateWritePostId = (
  writeResult: { id?: number | string } | null | undefined
): CreateWritePostIdResolution => {
  const rawId = writeResult?.id
  if (rawId == null || rawId === "") {
    return { ok: false, statusText: CREATE_WRITE_MISSING_POST_ID_STATUS_TEXT }
  }

  const postId = String(rawId).trim()
  if (!postId) {
    return { ok: false, statusText: CREATE_WRITE_MISSING_POST_ID_STATUS_TEXT }
  }

  return { ok: true, postId }
}

export type LocalDraftAutosaveDecisionInput = {
  loadingKey: string
  /**
   * True only when a successful post-load / publish signal just settled.
   * Failed settles and unrelated settles (list refresh, upload, profile, …) must stay
   * false so pending edits are rescheduled instead of being adopted as a saved baseline.
   */
  shouldAdoptBaseline: boolean
  /**
   * True while post-id field transition keeps create mode with a pending postId.
   * Blocks create-slot autosave of foreign edit body until load settles.
   */
  isPostIdTransitionGated: boolean
  hasDraftContent: boolean
  editorFingerprint: string
  lastArmedFingerprint: string
  /**
   * Fingerprint of a restorable slot draft, if any.
   * Used to block server-baseline overwrite before the post-load baseline is adopted.
   */
  pendingRestorableDraftFingerprint: string | null
}

export type LocalDraftAutosaveDecision =
  | { action: "skip" }
  | { action: "adopt-baseline"; fingerprint: string }
  | { action: "schedule" }

/**
 * Decide whether autosave should write, adopt the editor as a non-persist baseline,
 * or stay idle. Callers must apply `adopt-baseline` to lastArmedFingerprint without
 * writing storage.
 */
export const decideLocalDraftAutosave = (
  input: LocalDraftAutosaveDecisionInput
): LocalDraftAutosaveDecision => {
  if (input.loadingKey.length > 0) {
    return { action: "skip" }
  }

  // After successful post load / publish settles: arm baseline to current editor so we
  // neither overwrite a restorable draft with server content nor recreate a cleared slot.
  if (input.shouldAdoptBaseline) {
    return { action: "adopt-baseline", fingerprint: input.editorFingerprint }
  }

  // ID-change create transition: do not autosave previous edit body into create.v2.
  if (input.isPostIdTransitionGated) {
    return { action: "skip" }
  }

  if (!input.hasDraftContent) {
    return { action: "skip" }
  }

  if (input.lastArmedFingerprint === input.editorFingerprint) {
    return { action: "skip" }
  }

  // Pending restoreable draft still pointed at by lastArmed means load UI hydrated the
  // stored draft fingerprint before server content arrived — do not overwrite the slot.
  if (
    input.pendingRestorableDraftFingerprint != null &&
    input.pendingRestorableDraftFingerprint !== input.editorFingerprint &&
    input.lastArmedFingerprint === input.pendingRestorableDraftFingerprint
  ) {
    return { action: "skip" }
  }

  return { action: "schedule" }
}

type UseEditorStudioLocalDraftLifecycleParams = {
  editorMode: EditorMode
  postId: string
  postVersion: number | null
  loadingKey: string
  postTitle: string
  postContent: string
  getCurrentPostContent: () => string
  postSummary: string
  postThumbnailUrl: string
  postThumbnailFocusX: number
  postThumbnailFocusY: number
  postThumbnailZoom: number
  postTags: string[]
  postCategory: string
  postVisibility: PostVisibility
  setEditorMode: StudioSetState<EditorMode>
  setIsTempDraftMode: StudioSetState<boolean>
  setPostId: StudioSetState<string>
  setPostVersion: StudioSetState<number | null>
  setPreviewThumbnailSourceUrl: StudioSetState<string>
  setPostTitle: StudioSetState<string>
  setPostContent: StudioSetState<string>
  setPostSummary: StudioSetState<string>
  setPostThumbnailUrl: StudioSetState<string>
  setPostThumbnailFocusX: StudioSetState<number>
  setPostThumbnailFocusY: StudioSetState<number>
  setPostThumbnailZoom: StudioSetState<number>
  setPostTags: StudioSetState<string[]>
  setPostCategory: StudioSetState<string>
  setPostVisibility: StudioSetState<PostVisibility>
  setKnownTags: StudioSetState<string[]>
  setLocalDraftSavedAt: StudioSetState<string>
  setLocalDraftSlotLabel: StudioSetState<string>
  setPublishStatus: (notice: PublishNotice, target?: PublishTarget) => void
  dedupeStrings: (items: string[]) => string[]
  normalizeCategoryValue: (value: string) => string
  buildLocalDraftFingerprint: (payload: Omit<LocalDraftPayload, "savedAt" | "source" | "postVersion">) => string
  persistLocalDraft: (payload: LocalDraftPayload) => void
  readLocalDraft: (source: LocalDraftSource) => LocalDraftPayload | null
  removeLocalDraft: (source: LocalDraftSource) => void
  lastLocalDraftFingerprintRef: MutableRefObject<string>
  lastWriteFingerprintRef: MutableRefObject<string>
  lastWriteIdempotencyKeyRef: MutableRefObject<string>
}

export const useEditorStudioLocalDraftLifecycle = ({
  buildLocalDraftFingerprint,
  dedupeStrings,
  editorMode,
  lastLocalDraftFingerprintRef,
  lastWriteFingerprintRef,
  lastWriteIdempotencyKeyRef,
  loadingKey,
  normalizeCategoryValue,
  persistLocalDraft,
  postCategory,
  postContent,
  getCurrentPostContent,
  postId,
  postSummary,
  postTags,
  postThumbnailFocusX,
  postThumbnailFocusY,
  postThumbnailUrl,
  postThumbnailZoom,
  postTitle,
  postVersion,
  postVisibility,
  readLocalDraft,
  removeLocalDraft,
  setEditorMode,
  setIsTempDraftMode,
  setKnownTags,
  setLocalDraftSavedAt,
  setLocalDraftSlotLabel,
  setPostCategory,
  setPostContent,
  setPostId,
  setPostSummary,
  setPostTags,
  setPostThumbnailFocusX,
  setPostThumbnailFocusY,
  setPostThumbnailUrl,
  setPostThumbnailZoom,
  setPostTitle,
  setPostVersion,
  setPostVisibility,
  setPreviewThumbnailSourceUrl,
  setPublishStatus,
}: UseEditorStudioLocalDraftLifecycleParams) => {
  const draftSource = useMemo(
    () => resolveLocalDraftSource(editorMode, postId),
    [editorMode, postId]
  )
  const draftSourceRef = useRef(draftSource)
  draftSourceRef.current = draftSource
  const loadingKeyRef = useRef(loadingKey)
  loadingKeyRef.current = loadingKey
  const postVersionRef = useRef(postVersion)
  postVersionRef.current = postVersion
  const pendingSuccessfulBaselineSettleRef = useRef(false)
  const isPostIdTransitionGated = isLocalDraftAutosaveGatedForPostIdTransition(
    editorMode,
    postId
  )
  const isPostIdTransitionGatedRef = useRef(isPostIdTransitionGated)
  isPostIdTransitionGatedRef.current = isPostIdTransitionGated

  const signalLocalDraftBaselineReady = useCallback(() => {
    pendingSuccessfulBaselineSettleRef.current = true
  }, [])

  const localDraftCore = useMemo(
    () => ({
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
    }),
    [
      dedupeStrings,
      normalizeCategoryValue,
      postCategory,
      postContent,
      postSummary,
      postTags,
      postThumbnailFocusX,
      postThumbnailFocusY,
      postThumbnailUrl,
      postThumbnailZoom,
      postTitle,
      postVisibility,
    ]
  )

  const localDraftFingerprint = useMemo(
    () => buildLocalDraftFingerprint(localDraftCore),
    [buildLocalDraftFingerprint, localDraftCore]
  )

  const saveLocalDraft = useCallback((options?: {
    silent?: boolean
    expectedSource?: LocalDraftSource
  }) => {
    // Skip while load/switch transitions: postId/editorMode can settle before content does.
    if (loadingKeyRef.current.length > 0) {
      return
    }
    // ID field changed to create+pending postId: do not write previous body into create.v2.
    if (isPostIdTransitionGatedRef.current) {
      return
    }

    const source = draftSourceRef.current
    if (options?.expectedSource && !localDraftSourcesEqual(options.expectedSource, source)) {
      return
    }

    const currentLocalDraftCore = {
      ...localDraftCore,
      content: getCurrentPostContent(),
    }
    const currentLocalDraftFingerprint = buildLocalDraftFingerprint(currentLocalDraftCore)

    if (lastLocalDraftFingerprintRef.current === currentLocalDraftFingerprint) {
      return
    }

    const resolvedPostVersion =
      source.kind === "post" && typeof postVersionRef.current === "number"
        ? postVersionRef.current
        : null

    const payload: LocalDraftPayload = {
      ...currentLocalDraftCore,
      savedAt: new Date().toISOString(),
      source,
      postVersion: resolvedPostVersion,
    }

    persistLocalDraft(payload)
    lastLocalDraftFingerprintRef.current = currentLocalDraftFingerprint
    setLocalDraftSavedAt(payload.savedAt)
    setLocalDraftSlotLabel(describeLocalDraftSlot(payload))

    if (!options?.silent) {
      setPublishStatus(
        {
          tone: "success",
          text: `브라우저 임시저장 완료 (${describeLocalDraftSlot(payload)})`,
        },
        "page"
      )
    }
  }, [
    buildLocalDraftFingerprint,
    getCurrentPostContent,
    lastLocalDraftFingerprintRef,
    localDraftCore,
    persistLocalDraft,
    setLocalDraftSavedAt,
    setLocalDraftSlotLabel,
    setPublishStatus,
  ])

  const restoreLocalDraft = useCallback(() => {
    migrateLocalDraftV1Once()
    const draft = readLocalDraft(draftSource)
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

    if (draft.source.kind === "post") {
      setEditorMode("edit")
      setPostId(draft.source.postId)
      if (typeof draft.postVersion === "number") {
        setPostVersion(draft.postVersion)
      } else if (postId !== draft.source.postId) {
        setPostVersion(null)
      }
      // Same post without stored version: keep current postVersion for modify/temp-publish.
    } else {
      setEditorMode("create")
      setPostId("")
      setPostVersion(null)
    }
    setIsTempDraftMode(false)
    lastWriteFingerprintRef.current = ""
    lastWriteIdempotencyKeyRef.current = ""
    lastLocalDraftFingerprintRef.current = buildLocalDraftFingerprint({
      title: draft.title,
      content: draft.content,
      summary: draft.summary,
      thumbnailUrl: draft.thumbnailUrl,
      thumbnailFocusX: draft.thumbnailFocusX,
      thumbnailFocusY: draft.thumbnailFocusY,
      thumbnailZoom: draft.thumbnailZoom,
      tags: dedupeStrings(draft.tags),
      category: draft.category ? normalizeCategoryValue(draft.category) : "",
      visibility: draft.visibility,
    })

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
    setLocalDraftSlotLabel(describeLocalDraftSlot(draft))
    setPublishStatus(
      {
        tone: "success",
        text: `브라우저 임시글을 불러왔습니다 (${describeLocalDraftSlot(draft)}).`,
      },
      "page"
    )
  }, [
    buildLocalDraftFingerprint,
    dedupeStrings,
    draftSource,
    lastLocalDraftFingerprintRef,
    lastWriteFingerprintRef,
    lastWriteIdempotencyKeyRef,
    normalizeCategoryValue,
    postId,
    readLocalDraft,
    setEditorMode,
    setIsTempDraftMode,
    setKnownTags,
    setLocalDraftSavedAt,
    setLocalDraftSlotLabel,
    setPostCategory,
    setPostContent,
    setPostId,
    setPostSummary,
    setPostTags,
    setPostThumbnailFocusX,
    setPostThumbnailFocusY,
    setPostThumbnailUrl,
    setPostThumbnailZoom,
    setPostTitle,
    setPostVersion,
    setPostVisibility,
    setPreviewThumbnailSourceUrl,
    setPublishStatus,
  ])

  const clearLocalDraft = useCallback(() => {
    removeLocalDraft(draftSource)
    // Keep editor fingerprint as baseline so autosave does not recreate the cleared slot.
    lastLocalDraftFingerprintRef.current = localDraftFingerprint
    setLocalDraftSavedAt("")
    setLocalDraftSlotLabel("")
    setPublishStatus(
      {
        tone: "success",
        text: "브라우저 임시저장을 삭제했습니다.",
      },
      "page"
    )
  }, [
    draftSource,
    lastLocalDraftFingerprintRef,
    localDraftFingerprint,
    removeLocalDraft,
    setLocalDraftSavedAt,
    setLocalDraftSlotLabel,
    setPublishStatus,
  ])

  useEffect(() => {
    migrateLocalDraftV1Once()
    const localDraft = readLocalDraft(draftSource)
    if (!localDraft?.savedAt) {
      // Do not reset lastArmedFingerprint to "" — that re-arms autosave after publish/clear.
      setLocalDraftSavedAt("")
      setLocalDraftSlotLabel("")
      return
    }

    // Restore UI only. Do not point lastArmedFingerprint at the stored draft; that would
    // make server-loaded editor content look dirty and overwrite the restorable slot.
    setLocalDraftSavedAt(localDraft.savedAt)
    setLocalDraftSlotLabel(describeLocalDraftSlot(localDraft))
  }, [
    draftSource,
    readLocalDraft,
    setLocalDraftSavedAt,
    setLocalDraftSlotLabel,
  ])

  const wasLoadingRef = useRef(loadingKey.length > 0)
  const lastNonEmptyLoadingKeyRef = useRef(loadingKey)

  useEffect(() => {
    if (loadingKey.length > 0) {
      lastNonEmptyLoadingKeyRef.current = loadingKey
    }
    const wasLoading = wasLoadingRef.current
    const isLoading = loadingKey.length > 0
    wasLoadingRef.current = isLoading
    const settledBaselineKey =
      wasLoading &&
      !isLoading &&
      isLocalDraftBaselineSettleLoadingKey(lastNonEmptyLoadingKeyRef.current)
    const shouldAdoptBaseline =
      settledBaselineKey && pendingSuccessfulBaselineSettleRef.current
    if (wasLoading && !isLoading) {
      pendingSuccessfulBaselineSettleRef.current = false
    }

    const hasDraftContent =
      postTitle.trim().length > 0 ||
      postContent.trim().length > 0 ||
      postSummary.trim().length > 0 ||
      postThumbnailUrl.trim().length > 0 ||
      postTags.length > 0 ||
      postCategory.trim().length > 0

    const pendingDraft = readLocalDraft(draftSource)
    const pendingRestorableDraftFingerprint =
      pendingDraft?.savedAt
        ? buildLocalDraftFingerprint({
            title: pendingDraft.title,
            content: pendingDraft.content,
            summary: pendingDraft.summary,
            thumbnailUrl: pendingDraft.thumbnailUrl,
            thumbnailFocusX: pendingDraft.thumbnailFocusX,
            thumbnailFocusY: pendingDraft.thumbnailFocusY,
            thumbnailZoom: pendingDraft.thumbnailZoom,
            tags: dedupeStrings(pendingDraft.tags),
            category: pendingDraft.category
              ? normalizeCategoryValue(pendingDraft.category)
              : "",
            visibility: pendingDraft.visibility,
          })
        : null

    const decision = decideLocalDraftAutosave({
      loadingKey,
      shouldAdoptBaseline,
      isPostIdTransitionGated,
      hasDraftContent,
      editorFingerprint: localDraftFingerprint,
      lastArmedFingerprint: lastLocalDraftFingerprintRef.current,
      pendingRestorableDraftFingerprint,
    })

    if (decision.action === "skip") {
      return
    }

    if (decision.action === "adopt-baseline") {
      lastLocalDraftFingerprintRef.current = decision.fingerprint
      return
    }

    const expectedSource = draftSource
    const timerId = window.setTimeout(() => {
      saveLocalDraft({ silent: true, expectedSource })
    }, 1200)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [
    buildLocalDraftFingerprint,
    dedupeStrings,
    draftSource,
    isPostIdTransitionGated,
    lastLocalDraftFingerprintRef,
    loadingKey,
    localDraftFingerprint,
    normalizeCategoryValue,
    postCategory,
    postContent,
    postSummary,
    postTags,
    postThumbnailUrl,
    postTitle,
    readLocalDraft,
    saveLocalDraft,
  ])

  return {
    localDraftFingerprint,
    saveLocalDraft,
    restoreLocalDraft,
    clearLocalDraft,
    signalLocalDraftBaselineReady,
  }
}
