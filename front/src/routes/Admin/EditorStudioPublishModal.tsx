import type { CSSProperties, ReactNode } from "react"
import type { PostVisibility } from "./editorStudioState"
import {
  EditorStudioPublishCardSettings,
  EditorStudioPublishPreviewCard,
  EditorStudioPublishVisibilitySection,
  type EditorStudioPreviewViewportOption,
  type EditorStudioPublishVisibilityOption,
} from "./EditorStudioPublishModalParts"
import {
  PublishButton,
  PublishDialog,
  PublishModalBackdrop,
  PublishModalBody,
  PublishModalFooter,
  PublishModalHeader,
  PublishModalNotice,
  PublishOverviewGrid,
  PublishPrimaryButton,
} from "./EditorStudioPublishModalStyles"

type NoticeTone = "idle" | "loading" | "success" | "error"

type PublishNoticeState = {
  tone: NoticeTone
  text: string
}

type EditorStudioPublishModalProps<TViewport extends string> = {
  closeToggleLabel: string
  displayName: string
  displayNameInitial: string
  isCompactMobileLayout: boolean
  isMobileMetaEditorOpen: boolean
  isMobileThumbnailEditorOpen: boolean
  loadingKey: string
  modalNotice: PublishNoticeState
  postThumbnailFocusX: number
  postThumbnailFocusY: number
  postThumbnailZoom: number
  postTitle: string
  postVisibility: PostVisibility
  previewAuthorAvatarSrc: string
  previewDateText: string
  previewFrameStyle: CSSProperties
  previewKicker: string
  previewMetaEditorPanel: ReactNode
  previewSummary: string
  previewSummaryFallback: string
  previewThumbnailSrc: string
  previewViewport: TViewport
  previewViewportLabel: string
  previewViewportOptions: Array<EditorStudioPreviewViewportOption<TViewport>>
  previewVisibilityLabel: string
  publishActionButtonDisabled: boolean
  publishActionButtonText: string
  publishActionTitle: string
  setupDescription?: string
  shouldShowNotice: boolean
  thumbnailEditorPanel: ReactNode
  variant?: "drawer"
  visibilityOptions: EditorStudioPublishVisibilityOption[]
  onClose: () => void
  onConfirmPublish: () => void
  onPreviewThumbnailError: () => void
  onPreviewViewportChange: (nextViewport: TViewport) => void
  onPostVisibilityChange: (nextVisibility: PostVisibility) => void
  onToggleMobileMetaEditor: () => void
  onToggleMobileThumbnailEditor: () => void
}

export const EditorStudioPublishModal = <TViewport extends string,>({
  closeToggleLabel,
  displayName,
  displayNameInitial,
  isCompactMobileLayout,
  isMobileMetaEditorOpen,
  isMobileThumbnailEditorOpen,
  loadingKey,
  modalNotice,
  postThumbnailFocusX,
  postThumbnailFocusY,
  postThumbnailZoom,
  postTitle,
  postVisibility,
  previewAuthorAvatarSrc,
  previewDateText,
  previewFrameStyle,
  previewKicker,
  previewMetaEditorPanel,
  previewSummary,
  previewSummaryFallback,
  previewThumbnailSrc,
  previewViewport,
  previewViewportLabel,
  previewViewportOptions,
  previewVisibilityLabel,
  publishActionButtonDisabled,
  publishActionButtonText,
  publishActionTitle,
  setupDescription,
  shouldShowNotice,
  thumbnailEditorPanel,
  variant,
  visibilityOptions,
  onClose,
  onConfirmPublish,
  onPreviewThumbnailError,
  onPreviewViewportChange,
  onPostVisibilityChange,
  onToggleMobileMetaEditor,
  onToggleMobileThumbnailEditor,
}: EditorStudioPublishModalProps<TViewport>) => {
  const isCloseDisabled =
    loadingKey === "writePost" ||
    loadingKey === "modifyPost" ||
    loadingKey === "publishTempPost"

  return (
    <PublishModalBackdrop data-variant={variant} onClick={onClose}>
      <PublishDialog
        role="dialog"
        aria-modal="true"
        aria-label={publishActionTitle}
        data-variant={variant}
        onClick={(event) => event.stopPropagation()}
      >
        <PublishModalHeader>
          <div>
            <h4>{publishActionTitle}</h4>
          </div>
        </PublishModalHeader>
        <PublishModalBody>
          {shouldShowNotice ? (
            <PublishModalNotice data-tone={modalNotice.tone}>{modalNotice.text}</PublishModalNotice>
          ) : null}
          <PublishOverviewGrid>
            <EditorStudioPublishPreviewCard
              displayName={displayName}
              displayNameInitial={displayNameInitial}
              postThumbnailFocusX={postThumbnailFocusX}
              postThumbnailFocusY={postThumbnailFocusY}
              postThumbnailZoom={postThumbnailZoom}
              postTitle={postTitle}
              previewAuthorAvatarSrc={previewAuthorAvatarSrc}
              previewDateText={previewDateText}
              previewFrameStyle={previewFrameStyle}
              previewKicker={previewKicker}
              previewSummary={previewSummary}
              previewSummaryFallback={previewSummaryFallback}
              previewThumbnailSrc={previewThumbnailSrc}
              previewViewport={previewViewport}
              previewViewportLabel={previewViewportLabel}
              previewViewportOptions={previewViewportOptions}
              previewVisibilityLabel={previewVisibilityLabel}
              onPreviewThumbnailError={onPreviewThumbnailError}
              onPreviewViewportChange={onPreviewViewportChange}
            />
            <EditorStudioPublishVisibilitySection
              postVisibility={postVisibility}
              visibilityOptions={visibilityOptions}
              onPostVisibilityChange={onPostVisibilityChange}
            />
          </PublishOverviewGrid>

          <EditorStudioPublishCardSettings
            closeToggleLabel={closeToggleLabel}
            isCompactMobileLayout={isCompactMobileLayout}
            isMobileMetaEditorOpen={isMobileMetaEditorOpen}
            isMobileThumbnailEditorOpen={isMobileThumbnailEditorOpen}
            previewMetaEditorPanel={previewMetaEditorPanel}
            setupDescription={setupDescription}
            thumbnailEditorPanel={thumbnailEditorPanel}
            onToggleMobileMetaEditor={onToggleMobileMetaEditor}
            onToggleMobileThumbnailEditor={onToggleMobileThumbnailEditor}
          />
        </PublishModalBody>
        <PublishModalFooter>
          <PublishButton type="button" disabled={isCloseDisabled} onClick={onClose}>
            닫기
          </PublishButton>
          <PublishPrimaryButton type="button" disabled={publishActionButtonDisabled} onClick={onConfirmPublish}>
            {publishActionButtonText}
          </PublishPrimaryButton>
        </PublishModalFooter>
      </PublishDialog>
    </PublishModalBackdrop>
  )
}
