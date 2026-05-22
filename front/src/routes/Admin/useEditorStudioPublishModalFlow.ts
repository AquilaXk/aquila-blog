import { useCallback, type Dispatch, type SetStateAction } from "react"

type NoticeState = {
  tone: "idle" | "loading" | "success" | "error"
  text: string
}

type PublishActionType = "create" | "modify" | "temp"
type PreviewViewportMode = "desktop" | "tablet" | "mobile"

type UseEditorStudioPublishModalFlowParams = {
  activateComposeSurface: () => void
  handleModifyPost: () => Promise<boolean>
  handlePublishTempDraft: () => Promise<boolean>
  handleWritePost: () => Promise<boolean>
  isCompactMobileLayout: boolean
  isPreviewThumbnailError: boolean
  loadingKey: string
  publishActionType: PublishActionType
  publishModalHintByAction: (actionType: PublishActionType) => string
  safePreviewThumbnail: string
  tagRecommendationIdleText: string
  setIsMobileMetaEditorOpen: Dispatch<SetStateAction<boolean>>
  setIsMobileThumbnailEditorOpen: Dispatch<SetStateAction<boolean>>
  setIsPublishModalOpen: Dispatch<SetStateAction<boolean>>
  setMobileComposeStep: Dispatch<SetStateAction<"edit" | "publish">>
  setPreviewViewport: Dispatch<SetStateAction<PreviewViewportMode>>
  setPublishActionType: Dispatch<SetStateAction<PublishActionType>>
  setPublishModalNotice: Dispatch<SetStateAction<NoticeState>>
  setTagRecommendationNotice: Dispatch<SetStateAction<NoticeState>>
}

export const useEditorStudioPublishModalFlow = ({
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
  tagRecommendationIdleText,
}: UseEditorStudioPublishModalFlowParams) => {
  const openPublishModal = useCallback((actionType: PublishActionType) => {
    activateComposeSurface()
    setPublishActionType(actionType)
    setPublishModalNotice({
      tone: "idle",
      text: publishModalHintByAction(actionType),
    })
    setTagRecommendationNotice({
      tone: "idle",
      text: tagRecommendationIdleText,
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
    setIsMobileMetaEditorOpen,
    setIsMobileThumbnailEditorOpen,
    setIsPublishModalOpen,
    setMobileComposeStep,
    setPreviewViewport,
    setPublishActionType,
    setPublishModalNotice,
    setTagRecommendationNotice,
    tagRecommendationIdleText,
  ])

  const closePublishModal = useCallback(() => {
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
      text: tagRecommendationIdleText,
    })
    setIsPublishModalOpen(false)
    if (isCompactMobileLayout) {
      setMobileComposeStep("edit")
    }
  }, [
    isCompactMobileLayout,
    loadingKey,
    publishActionType,
    publishModalHintByAction,
    setIsPublishModalOpen,
    setMobileComposeStep,
    setPublishModalNotice,
    setTagRecommendationNotice,
    tagRecommendationIdleText,
  ])

  const handleConfirmPublish = useCallback(async () => {
    const success =
      publishActionType === "create"
        ? await handleWritePost()
        : publishActionType === "modify"
          ? await handleModifyPost()
          : await handlePublishTempDraft()

    if (success) {
      setIsPublishModalOpen(false)
    }
  }, [handleModifyPost, handlePublishTempDraft, handleWritePost, publishActionType, setIsPublishModalOpen])

  return {
    closePublishModal,
    handleConfirmPublish,
    openPublishModal,
  }
}
