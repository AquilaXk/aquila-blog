import type { ChangeEvent, ClipboardEvent as ReactClipboardEvent, Dispatch, SetStateAction } from "react"
import { useCallback } from "react"
import { getApiBaseUrl } from "src/apis/backend/client"
import { parseStandaloneMarkdownImageLine } from "src/libs/markdown/rendering"
import {
  buildImageOptimizationSummary,
  preparePostImageForUpload,
} from "src/libs/profileImageUpload"
import { stripThumbnailFocusFromUrl } from "src/libs/thumbnailFocus"
import { resolveEditorUploadFailureRecovery } from "./editorFailureRecoveryModel"

type StudioSetState<T> = Dispatch<SetStateAction<T>>
type NoticeTone = "idle" | "loading" | "success" | "error"
type PublishNotice = { tone: NoticeTone; text: string }

type UploadPostImageResponse = {
  data?: {
    url?: string
    markdown?: string
  }
}

type UploadPostImageResult = {
  uploaded: UploadPostImageResponse
  prepared: {
    summary: string
  }
}

type UploadPostFileResponse = {
  data?: {
    url?: string
    name?: string
  }
}

const isBrowserOnline = () => typeof navigator === "undefined" ? undefined : navigator.onLine

export type MarkdownImageUploadAttrs = {
  src: string
  alt: string
  title?: string
  widthPx?: number
  align: "left" | "center" | "right" | "wide" | "full"
}

export type MarkdownFileUploadAttrs = {
  url: string
  name: string
  description: string
  mimeType: string
  sizeBytes: number
}

type UseEditorStudioPersistenceUploadsParams = {
  defaultThumbnailFocusX: number
  defaultThumbnailFocusY: number
  defaultThumbnailZoom: number
  extractImageFileFromClipboard: (clipboardData: DataTransfer | null) => File | null
  loadingKey: string
  normalizeSafeImageUrl: (raw: string) => string
  setIsPreviewThumbnailError: StudioSetState<boolean>
  setLoadingKey: StudioSetState<string>
  setPostThumbnailFocusX: StudioSetState<number>
  setPostThumbnailFocusY: StudioSetState<number>
  setPostThumbnailUrl: StudioSetState<string>
  setPostThumbnailZoom: StudioSetState<number>
  setPreviewThumbnailSourceUrl: StudioSetState<string>
  setPublishStatus: (notice: PublishNotice) => void
  setThumbnailImageFileName: StudioSetState<string>
  uploadWithConflictRetry: <T>(requestUpload: () => Promise<Response>) => Promise<Response>
}

export const useEditorStudioPersistenceUploads = ({
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
}: UseEditorStudioPersistenceUploadsParams) => {
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
  }, [uploadWithConflictRetry])

  const handleMarkdownEditorImageUpload = useCallback(async (file: File): Promise<MarkdownImageUploadAttrs> => {
    setPublishStatus({
      tone: "loading",
      text: `이미지 "${file.name}" 최적화/업로드 중입니다. 완료되면 본문에 바로 삽입됩니다.`,
    })

    try {
      const uploaded = await uploadPostImageFile(file)
      const markdown = uploaded.uploaded.data?.markdown?.trim()
      const uploadedUrl = uploaded.uploaded.data?.url?.trim()
      if (!markdown && !uploadedUrl) throw new Error("업로드 응답 형식이 올바르지 않습니다.")

      const parsed = markdown ? parseStandaloneMarkdownImageLine(markdown) : null
      if (markdown && !parsed && !uploadedUrl) throw new Error("이미지 markdown 메타데이터를 해석하지 못했습니다.")
      const safeUploadedUrl = normalizeSafeImageUrl(parsed?.src || uploadedUrl || "")
      if (!safeUploadedUrl) throw new Error("허용되지 않은 이미지 URL 형식입니다.")

      setPublishStatus({
        tone: "success",
        text: `이미지 업로드가 완료되었습니다. ${uploaded.prepared.summary}`,
      })

      return {
        src: safeUploadedUrl,
        alt: parsed?.alt || file.name,
        title: parsed?.title,
        widthPx: parsed?.widthPx,
        align: parsed?.align || "center",
      }
    } catch (error) {
      const recovery = resolveEditorUploadFailureRecovery(error, {
        kind: "image",
        fileName: file.name,
        isOnline: isBrowserOnline(),
      })
      setPublishStatus({
        tone: "error",
        text: recovery.statusText,
      })
      throw error
    }
  }, [normalizeSafeImageUrl, setPublishStatus, uploadPostImageFile])

  const uploadPostAttachmentFile = useCallback(async (file: File): Promise<UploadPostFileResponse> => {
    const formData = new FormData()
    formData.append("file", file, file.name)

    const response = await uploadWithConflictRetry(async () =>
      fetch(`${getApiBaseUrl()}/post/api/v1/posts/files`, {
        method: "POST",
        credentials: "include",
        body: formData,
      })
    )

    return (await response.json()) as UploadPostFileResponse
  }, [uploadWithConflictRetry])

  const handleMarkdownEditorFileUpload = useCallback(async (file: File): Promise<MarkdownFileUploadAttrs> => {
    setPublishStatus({
      tone: "loading",
      text: `첨부 파일 "${file.name}" 업로드 중입니다. 완료되면 Markdown 링크로 삽입됩니다.`,
    })

    try {
      const uploaded = await uploadPostAttachmentFile(file)
      const uploadedUrl = String(uploaded.data?.url || "").trim()
      const uploadedName = String(uploaded.data?.name || file.name).trim() || file.name
      if (!uploadedUrl) throw new Error("업로드 응답 형식이 올바르지 않습니다.")

      setPublishStatus({
        tone: "success",
        text: `첨부 파일 업로드가 완료되었습니다. ${uploadedName}`,
      })

      return {
        url: uploadedUrl,
        name: uploadedName,
        description: "",
        mimeType: file.type || "",
        sizeBytes: file.size,
      }
    } catch (error) {
      const recovery = resolveEditorUploadFailureRecovery(error, {
        kind: "file",
        fileName: file.name,
        isOnline: isBrowserOnline(),
      })
      setPublishStatus({
        tone: "error",
        text: recovery.statusText,
      })
      throw error
    }
  }, [setPublishStatus, uploadPostAttachmentFile])

  const handleUploadThumbnailImage = useCallback(async (file: File) => {
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
      setPostThumbnailFocusX(defaultThumbnailFocusX)
      setPostThumbnailFocusY(defaultThumbnailFocusY)
      setPostThumbnailZoom(defaultThumbnailZoom)
      setPreviewThumbnailSourceUrl(stripThumbnailFocusFromUrl(safeUploadedUrl))
      setIsPreviewThumbnailError(false)
      setPublishStatus({
        tone: "success",
        text: `썸네일 파일 업로드가 완료되었습니다. ${uploaded.prepared.summary}`,
      })
    } catch (error) {
      const recovery = resolveEditorUploadFailureRecovery(error, {
        kind: "thumbnail",
        fileName: file.name,
        isOnline: isBrowserOnline(),
      })
      setPublishStatus({
        tone: "error",
        text: recovery.statusText,
      })
    } finally {
      setLoadingKey("")
    }
  }, [
    defaultThumbnailFocusX,
    defaultThumbnailFocusY,
    defaultThumbnailZoom,
    normalizeSafeImageUrl,
    setIsPreviewThumbnailError,
    setLoadingKey,
    setPostThumbnailFocusX,
    setPostThumbnailFocusY,
    setPostThumbnailUrl,
    setPostThumbnailZoom,
    setPreviewThumbnailSourceUrl,
    setPublishStatus,
    uploadPostImageFile,
  ])

  const handleThumbnailImageFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setThumbnailImageFileName(file.name)
    void handleUploadThumbnailImage(file)
  }, [handleUploadThumbnailImage, setThumbnailImageFileName])

  const handleThumbnailPaste = useCallback((event: ReactClipboardEvent<HTMLElement>) => {
    const imageFile = extractImageFileFromClipboard(event.clipboardData)
    if (!imageFile) return
    if (loadingKey === "uploadThumbnail") return
    event.preventDefault()
    event.stopPropagation()
    setThumbnailImageFileName(imageFile.name || "clipboard-image.png")
    void handleUploadThumbnailImage(imageFile)
  }, [extractImageFileFromClipboard, handleUploadThumbnailImage, loadingKey, setThumbnailImageFileName])

  return {
    handleMarkdownEditorImageUpload,
    handleMarkdownEditorFileUpload,
    handleUploadThumbnailImage,
    handleThumbnailImageFileChange,
    handleThumbnailPaste,
  }
}
