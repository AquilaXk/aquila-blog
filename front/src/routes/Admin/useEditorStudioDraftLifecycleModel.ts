import {
  useCallback,
  useEffect,
  useMemo,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react"
import type { PostVisibility } from "./editorStudioState"

type StudioSetState<T> = Dispatch<SetStateAction<T>>
type NoticeTone = "idle" | "loading" | "success" | "error"
type PublishNotice = { tone: NoticeTone; text: string }
type PublishTarget = "page" | "modal"
type EditorMode = "create" | "edit"

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

type UseEditorStudioLocalDraftLifecycleParams = {
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
  setPublishStatus: (notice: PublishNotice, target?: PublishTarget) => void
  dedupeStrings: (items: string[]) => string[]
  normalizeCategoryValue: (value: string) => string
  buildLocalDraftFingerprint: (payload: Omit<LocalDraftPayload, "savedAt">) => string
  persistLocalDraft: (payload: LocalDraftPayload) => void
  readLocalDraft: () => LocalDraftPayload | null
  removeLocalDraft: () => void
  lastLocalDraftFingerprintRef: MutableRefObject<string>
  lastWriteFingerprintRef: MutableRefObject<string>
  lastWriteIdempotencyKeyRef: MutableRefObject<string>
}

export const useEditorStudioLocalDraftLifecycle = ({
  buildLocalDraftFingerprint,
  dedupeStrings,
  lastLocalDraftFingerprintRef,
  lastWriteFingerprintRef,
  lastWriteIdempotencyKeyRef,
  normalizeCategoryValue,
  persistLocalDraft,
  postCategory,
  postContent,
  getCurrentPostContent,
  postSummary,
  postTags,
  postThumbnailFocusX,
  postThumbnailFocusY,
  postThumbnailUrl,
  postThumbnailZoom,
  postTitle,
  postVisibility,
  readLocalDraft,
  removeLocalDraft,
  setEditorMode,
  setIsTempDraftMode,
  setKnownTags,
  setLocalDraftSavedAt,
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

  const saveLocalDraft = useCallback((options?: { silent?: boolean }) => {
    const currentLocalDraftCore = {
      ...localDraftCore,
      content: getCurrentPostContent(),
    }
    const currentLocalDraftFingerprint = buildLocalDraftFingerprint(currentLocalDraftCore)

    if (lastLocalDraftFingerprintRef.current === currentLocalDraftFingerprint) {
      return
    }

    const payload: LocalDraftPayload = {
      ...currentLocalDraftCore,
      savedAt: new Date().toISOString(),
    }

    persistLocalDraft(payload)
    lastLocalDraftFingerprintRef.current = currentLocalDraftFingerprint
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
    buildLocalDraftFingerprint,
    getCurrentPostContent,
    lastLocalDraftFingerprintRef,
    localDraftCore,
    persistLocalDraft,
    setLocalDraftSavedAt,
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
    setPublishStatus(
      {
        tone: "success",
        text: `브라우저 임시글을 불러왔습니다${draft.savedAt ? ` (${draft.savedAt.slice(11, 16)})` : ""}.`,
      },
      "page"
    )
  }, [
    buildLocalDraftFingerprint,
    dedupeStrings,
    lastLocalDraftFingerprintRef,
    lastWriteFingerprintRef,
    lastWriteIdempotencyKeyRef,
    normalizeCategoryValue,
    readLocalDraft,
    setEditorMode,
    setIsTempDraftMode,
    setKnownTags,
    setLocalDraftSavedAt,
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
    removeLocalDraft()
    lastLocalDraftFingerprintRef.current = ""
    setLocalDraftSavedAt("")
    setPublishStatus(
      {
        tone: "success",
        text: "브라우저 임시저장을 삭제했습니다.",
      },
      "page"
    )
  }, [lastLocalDraftFingerprintRef, removeLocalDraft, setLocalDraftSavedAt, setPublishStatus])

  useEffect(() => {
    const localDraft = readLocalDraft()
    if (!localDraft?.savedAt) return

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
  }, [
    buildLocalDraftFingerprint,
    dedupeStrings,
    lastLocalDraftFingerprintRef,
    normalizeCategoryValue,
    readLocalDraft,
    setLocalDraftSavedAt,
  ])

  useEffect(() => {
    const hasDraftContent =
      postTitle.trim().length > 0 ||
      postContent.trim().length > 0 ||
      postSummary.trim().length > 0 ||
      postThumbnailUrl.trim().length > 0 ||
      postTags.length > 0 ||
      postCategory.trim().length > 0

    if (!hasDraftContent) return
    if (lastLocalDraftFingerprintRef.current === localDraftFingerprint) return

    const timerId = window.setTimeout(() => {
      saveLocalDraft({ silent: true })
    }, 1200)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [
    lastLocalDraftFingerprintRef,
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
