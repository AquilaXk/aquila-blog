import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import useViewportImageEditor from "src/libs/imageEditor/useViewportImageEditor"
import {
  clampThumbnailFocusX,
  clampThumbnailFocusY,
  clampThumbnailZoom,
} from "src/libs/thumbnailFocus"

type ThumbnailSourceSize = {
  width: number
  height: number
}

export type ThumbnailTransformState = {
  focusX: number
  focusY: number
  zoom: number
}

export const THUMBNAIL_FRAME_ASPECT_RATIO = 1.94

const DEFAULT_THUMBNAIL_SOURCE_SIZE: ThumbnailSourceSize = {
  width: THUMBNAIL_FRAME_ASPECT_RATIO,
  height: 1,
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

type UseEditorStudioThumbnailPreviewOptions = {
  safePreviewThumbnail: string
  isPublishModalOpen: boolean
  isComposeAssistOpen: boolean
  postThumbnailFocusX: number
  postThumbnailFocusY: number
  postThumbnailZoom: number
  setPostThumbnailFocusX: Dispatch<SetStateAction<number>>
  setPostThumbnailFocusY: Dispatch<SetStateAction<number>>
  setPostThumbnailZoom: Dispatch<SetStateAction<number>>
}

export const useEditorStudioThumbnailPreview = ({
  safePreviewThumbnail,
  isPublishModalOpen,
  isComposeAssistOpen,
  postThumbnailFocusX,
  postThumbnailFocusY,
  postThumbnailZoom,
  setPostThumbnailFocusX,
  setPostThumbnailFocusY,
  setPostThumbnailZoom,
}: UseEditorStudioThumbnailPreviewOptions) => {
  const [isPreviewThumbnailError, setIsPreviewThumbnailError] = useState(false)
  const [previewThumbSourceSize, setPreviewThumbSourceSize] = useState<ThumbnailSourceSize>(DEFAULT_THUMBNAIL_SOURCE_SIZE)
  const previewThumbFrameRef = useRef<HTMLDivElement>(null)
  const previewThumbSourceSeqRef = useRef(0)

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
    [applyPreviewThumbStyle, setPostThumbnailFocusX, setPostThumbnailFocusY, setPostThumbnailZoom]
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
    enabled: Boolean(safePreviewThumbnail && !isPreviewThumbnailError && (isPublishModalOpen || isComposeAssistOpen)),
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
    if (!safePreviewThumbnail || isPreviewThumbnailError || (!isPublishModalOpen && !isComposeAssistOpen)) {
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
  }, [
    commitPreviewThumbTransform,
    isComposeAssistOpen,
    isPreviewThumbnailError,
    isPublishModalOpen,
    previewThumbTransformRef,
    safePreviewThumbnail,
  ])

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

  return {
    commitPreviewThumbTransform,
    finalizePreviewThumbPointer,
    handlePreviewThumbPointerDown,
    handlePreviewThumbPointerMove,
    isPreviewThumbDragging,
    isPreviewThumbnailError,
    previewThumbFrameRef,
    previewThumbTransformRef,
    setIsPreviewThumbnailError,
  }
}
