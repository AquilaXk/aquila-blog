import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react"
import { apiFetch } from "src/apis/backend/client"
import { isTempDraftTitlePlaceholder } from "./editorTempDraft"
import { useEditorStudioPersistenceUploads } from "./useEditorStudioPersistenceModel"

type StudioSetState<T> = Dispatch<SetStateAction<T>>
type NoticeTone = "idle" | "loading" | "success" | "error"
type PublishNotice = { tone: NoticeTone; text: string }
type PublishTarget = "page" | "modal"
type EditorMode = "create" | "edit"
type PublishActionType = "create" | "modify" | "temp"
type PostVisibility = "PRIVATE" | "PUBLIC_UNLISTED" | "PUBLIC_LISTED"

type RsData<T> = {
  data?: T
  msg: string
}

type PostWriteResult = {
  id?: number | string
  version?: number
}

type EditorFingerprintPayload = {
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
}

type UseEditorStudioPersistenceParams = {
  editorMode: EditorMode
  postId: string
  postVersion: number | null
  postTitle: string
  postTags: string[]
  postCategory: string
  postSummary: string
  postThumbnailUrl: string
  postThumbnailFocusX: number
  postThumbnailFocusY: number
  postThumbnailZoom: number
  postVisibility: PostVisibility
  effectiveThumbnailUrl: string
  loadingKey: string
  postContentLiveRef: MutableRefObject<string>
  lastWriteFingerprintRef: MutableRefObject<string>
  lastWriteIdempotencyKeyRef: MutableRefObject<string>
  lastLocalDraftFingerprintRef: MutableRefObject<string>
  serverBaselineEditorFingerprintRef: MutableRefObject<string>
  defaultThumbnailFocusX: number
  defaultThumbnailFocusY: number
  defaultThumbnailZoom: number
  setEditorMode: StudioSetState<EditorMode>
  setIsTempDraftMode: StudioSetState<boolean>
  setPostId: StudioSetState<string>
  setPostVersion: StudioSetState<number | null>
  setPostVisibility: StudioSetState<PostVisibility>
  setKnownTags: StudioSetState<string[]>
  setLocalDraftSavedAt: StudioSetState<string>
  setPublishStatus: (notice: PublishNotice, target?: PublishTarget) => void
  setLoadingKey: StudioSetState<string>
  setResult: StudioSetState<string>
  setPostThumbnailUrl: StudioSetState<string>
  setPostThumbnailFocusX: StudioSetState<number>
  setPostThumbnailFocusY: StudioSetState<number>
  setPostThumbnailZoom: StudioSetState<number>
  setPreviewThumbnailSourceUrl: StudioSetState<string>
  setIsPreviewThumbnailError: StudioSetState<boolean>
  setThumbnailImageFileName: StudioSetState<string>
  composeEditorContent: (
    content: string,
    tags: string[],
    meta: { category: string; summary: string; thumbnail: string }
  ) => string
  toFlags: (visibility: PostVisibility) => { published: boolean; listed: boolean }
  buildEditorStateFingerprint: (payload: EditorFingerprintPayload) => string
  dedupeStrings: (items: string[]) => string[]
  detectPublishPlaceholderIssue: (content: string) => string
  refreshPublicPostReadViews: (affectedPostId?: string | number) => Promise<void>
  pretty: (value: unknown) => string
  generateIdempotencyKey: () => string
  removeLocalDraft: () => void
  uploadWithConflictRetry: <T>(requestUpload: () => Promise<Response>) => Promise<Response>
  normalizeSafeImageUrl: (raw: string) => string
  extractImageFileFromClipboard: (clipboardData: DataTransfer | null) => File | null
}

export const useEditorStudioPersistence = ({
  buildEditorStateFingerprint,
  composeEditorContent,
  dedupeStrings,
  defaultThumbnailFocusX,
  defaultThumbnailFocusY,
  defaultThumbnailZoom,
  detectPublishPlaceholderIssue,
  editorMode,
  effectiveThumbnailUrl,
  extractImageFileFromClipboard,
  generateIdempotencyKey,
  lastLocalDraftFingerprintRef,
  lastWriteFingerprintRef,
  lastWriteIdempotencyKeyRef,
  loadingKey,
  normalizeSafeImageUrl,
  postCategory,
  postContentLiveRef,
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
  pretty,
  refreshPublicPostReadViews,
  removeLocalDraft,
  serverBaselineEditorFingerprintRef,
  setEditorMode,
  setIsPreviewThumbnailError,
  setIsTempDraftMode,
  setKnownTags,
  setLoadingKey,
  setLocalDraftSavedAt,
  setPostId,
  setPostThumbnailFocusX,
  setPostThumbnailFocusY,
  setPostThumbnailUrl,
  setPostThumbnailZoom,
  setPostVersion,
  setPostVisibility,
  setPreviewThumbnailSourceUrl,
  setPublishStatus,
  setResult,
  setThumbnailImageFileName,
  toFlags,
  uploadWithConflictRetry,
}: UseEditorStudioPersistenceParams) => {
  const {
    handleBlockEditorImageUpload,
    handleBlockEditorFileUpload,
    handleUploadThumbnailImage,
    handleThumbnailImageFileChange,
    handleThumbnailPaste,
  } = useEditorStudioPersistenceUploads({
    defaultThumbnailFocusX,
    defaultThumbnailFocusY,
    defaultThumbnailZoom,
    extractImageFileFromClipboard,
    loadingKey,
    normalizeSafeImageUrl,
    setIsPreviewThumbnailError,
    setLoadingKey,
    setPostThumbnailFocusX,
    setPostThumbnailFocusY,
    setPostThumbnailUrl,
    setPostThumbnailZoom,
    setPreviewThumbnailSourceUrl,
    setPublishStatus,
    setThumbnailImageFileName,
    uploadWithConflictRetry,
  })

  const handleWritePost = useCallback(async (): Promise<boolean> => {
    const currentPostContent = postContentLiveRef.current
    if (editorMode === "edit" || postId.trim()) {
      const message = "현재는 수정 모드입니다. 새 글을 만들려면 먼저 '새 글 모드 전환'을 눌러주세요."
      setPublishStatus({ tone: "error", text: message })
      setResult(pretty({ error: message }))
      return false
    }

    if (!postTitle.trim()) {
      const message = "제목을 입력해주세요."
      setPublishStatus({ tone: "error", text: message })
      setResult(pretty({ error: message }))
      return false
    }

    if (!currentPostContent.trim()) {
      const message = "본문을 입력해주세요."
      setPublishStatus({ tone: "error", text: message })
      setResult(pretty({ error: message }))
      return false
    }

    const placeholderIssue = detectPublishPlaceholderIssue(currentPostContent)
    if (placeholderIssue) {
      setPublishStatus({ tone: "error", text: placeholderIssue })
      setResult(pretty({ error: placeholderIssue }))
      return false
    }

    try {
      setLoadingKey("writePost")
      setPublishStatus({ tone: "loading", text: "글 작성 중입니다..." })
      const contentWithMetadata = composeEditorContent(currentPostContent, postTags, {
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

      setResult(pretty(response))
      if (response?.data?.id) {
        setPostId(String(response.data.id))
        setPostVersion(typeof response.data.version === "number" ? response.data.version : null)
        setEditorMode("edit")
        setIsTempDraftMode(false)
        serverBaselineEditorFingerprintRef.current = buildEditorStateFingerprint({
          title: postTitle,
          content: currentPostContent,
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
      lastLocalDraftFingerprintRef.current = ""
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
  }, [
    buildEditorStateFingerprint,
    composeEditorContent,
    dedupeStrings,
    detectPublishPlaceholderIssue,
    editorMode,
    effectiveThumbnailUrl,
    generateIdempotencyKey,
    lastLocalDraftFingerprintRef,
    lastWriteFingerprintRef,
    lastWriteIdempotencyKeyRef,
    postCategory,
    postContentLiveRef,
    postId,
    postSummary,
    postTags,
    postThumbnailFocusX,
    postThumbnailFocusY,
    postThumbnailUrl,
    postThumbnailZoom,
    postTitle,
    postVisibility,
    pretty,
    refreshPublicPostReadViews,
    removeLocalDraft,
    serverBaselineEditorFingerprintRef,
    setEditorMode,
    setIsTempDraftMode,
    setKnownTags,
    setLoadingKey,
    setLocalDraftSavedAt,
    setPostId,
    setPostVersion,
    setPublishStatus,
    setResult,
    toFlags,
  ])

  const handleModifyPost = useCallback(async (): Promise<boolean> => {
    const currentPostContent = postContentLiveRef.current
    if (editorMode !== "edit" || !postId.trim()) {
      const message = "수정할 글 ID를 먼저 선택해주세요."
      setPublishStatus({ tone: "error", text: message })
      setResult(pretty({ error: message }))
      return false
    }

    if (!postTitle.trim()) {
      const message = "제목을 입력해주세요."
      setPublishStatus({ tone: "error", text: message })
      setResult(pretty({ error: message }))
      return false
    }

    if (!currentPostContent.trim()) {
      const message = "본문을 입력해주세요."
      setPublishStatus({ tone: "error", text: message })
      setResult(pretty({ error: message }))
      return false
    }

    const placeholderIssue = detectPublishPlaceholderIssue(currentPostContent)
    if (placeholderIssue) {
      setPublishStatus({ tone: "error", text: placeholderIssue })
      setResult(pretty({ error: placeholderIssue }))
      return false
    }

    if (postVersion == null) {
      const message = "최신 글 버전을 불러오지 못했습니다. 글을 다시 열어주세요."
      setPublishStatus({ tone: "error", text: message })
      setResult(pretty({ error: message }))
      return false
    }

    try {
      setLoadingKey("modifyPost")
      setPublishStatus({ tone: "loading", text: "글 수정 중입니다..." })

      const response = await apiFetch<RsData<PostWriteResult>>(`/post/api/v1/posts/${postId}`, {
        method: "PUT",
        body: JSON.stringify({
          title: postTitle,
          content: composeEditorContent(currentPostContent, postTags, {
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
        content: currentPostContent,
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
      setResult(pretty(response))
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setPublishStatus({ tone: "error", text: `수정 실패: ${message}` })
      setResult(pretty({ error: message }))
      return false
    } finally {
      setLoadingKey("")
    }
  }, [
    buildEditorStateFingerprint,
    composeEditorContent,
    dedupeStrings,
    detectPublishPlaceholderIssue,
    editorMode,
    effectiveThumbnailUrl,
    postCategory,
    postContentLiveRef,
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
    pretty,
    refreshPublicPostReadViews,
    serverBaselineEditorFingerprintRef,
    setIsTempDraftMode,
    setKnownTags,
    setLoadingKey,
    setPostVersion,
    setPublishStatus,
    setResult,
    toFlags,
  ])

  const handlePublishTempDraft = useCallback(async (): Promise<boolean> => {
    const currentPostContent = postContentLiveRef.current
    if (editorMode !== "edit" || !postId.trim()) {
      const message = "작성할 새 글을 먼저 불러와주세요."
      setPublishStatus({ tone: "error", text: message })
      setResult(pretty({ error: message }))
      return false
    }

    if (!postTitle.trim()) {
      const message = "제목을 입력해주세요."
      setPublishStatus({ tone: "error", text: message })
      setResult(pretty({ error: message }))
      return false
    }

    if (!currentPostContent.trim()) {
      const message = "본문을 입력해주세요."
      setPublishStatus({ tone: "error", text: message })
      setResult(pretty({ error: message }))
      return false
    }

    const placeholderIssue = detectPublishPlaceholderIssue(currentPostContent)
    if (placeholderIssue) {
      setPublishStatus({ tone: "error", text: placeholderIssue })
      setResult(pretty({ error: placeholderIssue }))
      return false
    }

    if (postVersion == null) {
      const message = "새 글 버전을 불러오지 못했습니다. 글을 다시 열어주세요."
      setPublishStatus({ tone: "error", text: message })
      setResult(pretty({ error: message }))
      return false
    }

    try {
      setLoadingKey("publishTempPost")
      setPublishStatus({ tone: "loading", text: "새 글을 작성하는 중입니다..." })

      const response = await apiFetch<RsData<PostWriteResult>>(`/post/api/v1/posts/${postId}`, {
        method: "PUT",
        body: JSON.stringify({
          title: postTitle,
          content: composeEditorContent(currentPostContent, postTags, {
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
        content: currentPostContent,
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
      setResult(pretty(response))
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setPublishStatus({ tone: "error", text: `새 글 작성 실패: ${message}` })
      setResult(pretty({ error: message }))
      return false
    } finally {
      setLoadingKey("")
    }
  }, [
    buildEditorStateFingerprint,
    composeEditorContent,
    detectPublishPlaceholderIssue,
    editorMode,
    effectiveThumbnailUrl,
    postCategory,
    postContentLiveRef,
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
    pretty,
    refreshPublicPostReadViews,
    serverBaselineEditorFingerprintRef,
    setIsTempDraftMode,
    setLoadingKey,
    setPostVersion,
    setPostVisibility,
    setPublishStatus,
    setResult,
    toFlags,
  ])

  return {
    handleBlockEditorImageUpload,
    handleBlockEditorFileUpload,
    handleUploadThumbnailImage,
    handleThumbnailImageFileChange,
    handleThumbnailPaste,
    handleWritePost,
    handleModifyPost,
    handlePublishTempDraft,
  }
}
