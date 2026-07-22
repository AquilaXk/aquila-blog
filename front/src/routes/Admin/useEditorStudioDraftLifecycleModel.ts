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
    lastLocalDraftFingerprintRef.current = ""
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
    removeLocalDraft,
    setLocalDraftSavedAt,
    setLocalDraftSlotLabel,
    setPublishStatus,
  ])

  useEffect(() => {
    migrateLocalDraftV1Once()
    const localDraft = readLocalDraft(draftSource)
    if (!localDraft?.savedAt) {
      lastLocalDraftFingerprintRef.current = ""
      setLocalDraftSavedAt("")
      setLocalDraftSlotLabel("")
      return
    }

    lastLocalDraftFingerprintRef.current = buildLocalDraftFingerprint({
      title: localDraft.title,
      content: localDraft.content,
      summary: localDraft.summary,
      thumbnailUrl: localDraft.thumbnailUrl,
      thumbnailFocusX: localDraft.thumbnailFocusX,
      thumbnailFocusY: localDraft.thumbnailFocusY,
      thumbnailZoom: localDraft.thumbnailZoom,
      tags: dedupeStrings(localDraft.tags),
      category: localDraft.category ? normalizeCategoryValue(localDraft.category) : "",
      visibility: localDraft.visibility,
    })
    setLocalDraftSavedAt(localDraft.savedAt)
    setLocalDraftSlotLabel(describeLocalDraftSlot(localDraft))
  }, [
    buildLocalDraftFingerprint,
    dedupeStrings,
    draftSource,
    lastLocalDraftFingerprintRef,
    normalizeCategoryValue,
    readLocalDraft,
    setLocalDraftSavedAt,
    setLocalDraftSlotLabel,
  ])

  useEffect(() => {
    // Gate autosave until load/switch settles so post A content never lands in post B / create.
    if (loadingKey.length > 0) return

    const hasDraftContent =
      postTitle.trim().length > 0 ||
      postContent.trim().length > 0 ||
      postSummary.trim().length > 0 ||
      postThumbnailUrl.trim().length > 0 ||
      postTags.length > 0 ||
      postCategory.trim().length > 0

    if (!hasDraftContent) return
    if (lastLocalDraftFingerprintRef.current === localDraftFingerprint) return

    const expectedSource = draftSource
    const timerId = window.setTimeout(() => {
      saveLocalDraft({ silent: true, expectedSource })
    }, 1200)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [
    draftSource,
    lastLocalDraftFingerprintRef,
    loadingKey,
    localDraftFingerprint,
    postCategory,
    postContent,
    postSummary,
    postTags,
    postThumbnailUrl,
    postTitle,
    saveLocalDraft,
  ])

  return {
    localDraftFingerprint,
    saveLocalDraft,
    restoreLocalDraft,
    clearLocalDraft,
  }
}
