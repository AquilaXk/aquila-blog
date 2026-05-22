import styled from "@emotion/styled"
import type { CSSProperties, ReactNode } from "react"
import type { PostVisibility } from "./editorStudioState"
import {
  EditorStudioPublishCardSettings,
  EditorStudioPublishPreviewCard,
  EditorStudioPublishVisibilitySection,
  PublishButton,
  PublishModalNotice,
  PublishOverviewGrid,
  PublishPrimaryButton,
  type EditorStudioPreviewViewportOption,
  type EditorStudioPublishVisibilityOption,
} from "./EditorStudioPublishModalParts"

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
    loadingKey === "publishTempPost" ||
    loadingKey === "recommendTags"

  return (
    <PublishModalBackdrop data-variant={variant} onClick={onClose}>
      <PublishDialog data-variant={variant} onClick={(event) => event.stopPropagation()}>
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
            <EditorStudioPublishVisibilitySection
              postVisibility={postVisibility}
              visibilityOptions={visibilityOptions}
              onPostVisibilityChange={onPostVisibilityChange}
            />
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

const PublishModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.42);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 120;
  padding: 1rem;

  &[data-variant="drawer"] {
    justify-content: flex-end;
    padding: 0;
  }
`

const PublishDialog = styled.div`
  width: min(1120px, calc(100vw - 2rem));
  max-height: min(86vh, 920px);
  overflow: auto;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  padding: 1rem 1rem 0;
  display: grid;
  gap: 0.8rem;

  &[data-variant="drawer"] {
    width: min(560px, 100vw);
    max-height: 100vh;
    height: 100vh;
    border-radius: 0;
    border-left: 1px solid ${({ theme }) => theme.colors.gray6};
    border-right: 0;
    border-top: 0;
    border-bottom: 0;
    padding-top: max(1rem, env(safe-area-inset-top, 0px));
    padding-bottom: 0;
  }

  @media (max-width: 720px) {
    width: min(100%, 34rem);
    max-height: min(92vh, 980px);
    padding: 0.82rem 0.82rem 0;
    gap: 0.78rem;
  }
`

const PublishModalHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;

  h4 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.04rem;
    font-weight: 750;
  }
`

const PublishModalBody = styled.div`
  display: grid;
  gap: 0.86rem;
  padding-bottom: 0.95rem;
`

const PublishModalFooter = styled.div`
  position: sticky;
  bottom: 0;
  display: flex;
  justify-content: flex-end;
  gap: 0.52rem;
  padding: 0.78rem 0;
  border-top: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};

  @media (max-width: 480px) {
    flex-direction: column-reverse;

    > button {
      width: 100%;
      justify-content: center;
    }
  }
`
