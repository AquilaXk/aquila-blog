import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useRef,
  useState,
} from "react"
import {
  DEFAULT_THUMBNAIL_FOCUS_X,
  DEFAULT_THUMBNAIL_FOCUS_Y,
  DEFAULT_THUMBNAIL_ZOOM,
  getThumbnailFocusXFromUrl,
  getThumbnailFocusYFromUrl,
  getThumbnailZoomFromUrl,
  parseThumbnailFocusXFromUrl,
  parseThumbnailFocusYFromUrl,
  parseThumbnailZoomFromUrl,
  stripThumbnailFocusFromUrl,
} from "src/libs/thumbnailFocus"

type UseEditorStudioThumbnailControlsOptions = {
  postContent: string
  setPostThumbnailUrl: Dispatch<SetStateAction<string>>
  setPostThumbnailFocusX: Dispatch<SetStateAction<number>>
  setPostThumbnailFocusY: Dispatch<SetStateAction<number>>
  setPostThumbnailZoom: Dispatch<SetStateAction<number>>
  setPreviewThumbnailSourceUrl: Dispatch<SetStateAction<string>>
  extractFirstMarkdownImage: (content: string) => string
  normalizeSafeImageUrl: (raw: string) => string
}

export type EditorStudioThumbnailControls = {
  applyFirstBodyImageToThumbnail: () => void
  handleThumbnailUrlModalChange: (nextValue: string) => void
  openThumbnailFileInput: () => void
  resetThumbnailToAutoMode: () => void
  setThumbnailImageFileName: Dispatch<SetStateAction<string>>
  thumbnailImageFileInputRef: RefObject<HTMLInputElement | null>
  thumbnailImageFileName: string
}

export const useEditorStudioThumbnailControls = ({
  postContent,
  setPostThumbnailUrl,
  setPostThumbnailFocusX,
  setPostThumbnailFocusY,
  setPostThumbnailZoom,
  setPreviewThumbnailSourceUrl,
  extractFirstMarkdownImage,
  normalizeSafeImageUrl,
}: UseEditorStudioThumbnailControlsOptions): EditorStudioThumbnailControls => {
  const thumbnailImageFileInputRef = useRef<HTMLInputElement>(null)
  const [thumbnailImageFileName, setThumbnailImageFileName] = useState("")

  const handleThumbnailUrlModalChange = useCallback((nextValue: string) => {
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
  }, [
    setPostThumbnailFocusX,
    setPostThumbnailFocusY,
    setPostThumbnailUrl,
    setPostThumbnailZoom,
    setPreviewThumbnailSourceUrl,
  ])

  const applyFirstBodyImageToThumbnail = useCallback(() => {
    const extractedThumbnailUrl = normalizeSafeImageUrl(extractFirstMarkdownImage(postContent))
    setPostThumbnailUrl(stripThumbnailFocusFromUrl(extractedThumbnailUrl))
    setPostThumbnailFocusX(parseThumbnailFocusXFromUrl(extractedThumbnailUrl, DEFAULT_THUMBNAIL_FOCUS_X))
    setPostThumbnailFocusY(parseThumbnailFocusYFromUrl(extractedThumbnailUrl, DEFAULT_THUMBNAIL_FOCUS_Y))
    setPostThumbnailZoom(parseThumbnailZoomFromUrl(extractedThumbnailUrl, DEFAULT_THUMBNAIL_ZOOM))
    setPreviewThumbnailSourceUrl("")
  }, [
    extractFirstMarkdownImage,
    normalizeSafeImageUrl,
    postContent,
    setPostThumbnailFocusX,
    setPostThumbnailFocusY,
    setPostThumbnailUrl,
    setPostThumbnailZoom,
    setPreviewThumbnailSourceUrl,
  ])

  const resetThumbnailToAutoMode = useCallback(() => {
    setPostThumbnailUrl("")
    setPostThumbnailFocusX(DEFAULT_THUMBNAIL_FOCUS_X)
    setPostThumbnailFocusY(DEFAULT_THUMBNAIL_FOCUS_Y)
    setPostThumbnailZoom(DEFAULT_THUMBNAIL_ZOOM)
    setPreviewThumbnailSourceUrl("")
  }, [
    setPostThumbnailFocusX,
    setPostThumbnailFocusY,
    setPostThumbnailUrl,
    setPostThumbnailZoom,
    setPreviewThumbnailSourceUrl,
  ])

  const openThumbnailFileInput = useCallback(() => {
    thumbnailImageFileInputRef.current?.click()
  }, [])

  return {
    applyFirstBodyImageToThumbnail,
    handleThumbnailUrlModalChange,
    openThumbnailFileInput,
    resetThumbnailToAutoMode,
    setThumbnailImageFileName,
    thumbnailImageFileInputRef,
    thumbnailImageFileName,
  }
}
