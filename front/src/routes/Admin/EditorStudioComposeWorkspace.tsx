import styled from "@emotion/styled"
import type {
  ChangeEventHandler,
  CSSProperties,
  KeyboardEventHandler,
  ReactNode,
  Ref,
} from "react"
import type { PostVisibility } from "./editorStudioState"
import { EditorStudioComposeAssistantPanel } from "./EditorStudioComposeAssistantPanel"
import {
  EditorStudioComposeMobileChrome,
  type EditorStudioComposeMobileStatus,
} from "./EditorStudioComposeMobileChrome"
import { EditorStudioComposeWritingSurface } from "./EditorStudioComposeWritingSurface"
import { EditorStudioMetadataAssistantPanel } from "./EditorStudioMetadataAssistantPanel"

type NoticeTone = "idle" | "loading" | "success" | "error"
type PreviewViewportMode = "desktop" | "tablet" | "mobile"

type VisibilityOption = {
  value: PostVisibility
  label: string
  description: string
}

type PreviewViewportOption = {
  value: PreviewViewportMode
  label: string
}

type ComposeStatusEntry = {
  key: string
  label: string
  text: string
  tone: NoticeTone
}

type EditorStudioComposeWorkspaceProps = {
  isCompactMobileLayout: boolean
  isPublishModalOpen: boolean
  mobilePrimaryStatus: EditorStudioComposeMobileStatus
  mobileSecondaryStatusText?: string | null
  mobilePrimaryActionLabel: string
  composeCallToActionLabel: string
  mobilePrimaryActionDisabled: boolean
  onPrimaryAction: () => void
  currentVisibilityText: string
  editorModeLabel: string
  composePageTitle: string
  composeSurfaceSubtitle: string
  composeStatusText: string
  composeStatusTone: string
  postSummary: string
  postSummaryMaxLength: number
  onPostSummaryChange: (value: string) => void
  isFillSummaryFromBodyDisabled: boolean
  onFillSummaryFromBody: () => void
  postTags: string[]
  tagDraft: string
  onTagDraftChange: (value: string) => void
  onAddTags: (values: string[]) => void
  onAddTag: (value: string) => void
  onRemoveTag: (value: string) => void
  titleInputRef: (node: HTMLTextAreaElement | null) => void
  postTitle: string
  onPostTitleChange: ChangeEventHandler<HTMLTextAreaElement>
  onPostTitleKeyDown: KeyboardEventHandler<HTMLTextAreaElement>
  thumbnailImageFileInputRef: Ref<HTMLInputElement>
  onThumbnailImageFileChange: ChangeEventHandler<HTMLInputElement>
  contentLength: number
  lineCount: number
  imageCount: number
  editorCanvas: ReactNode
  tagSummaryText: string
  isSaveDraftDisabled: boolean
  onSaveLocalDraft: () => void
  composeHeroSummary: string[]
  isRecommendTagsDisabled: boolean
  isRecommendTagsLoading: boolean
  onRecommendTags: () => void
  composeStatusEntries: ComposeStatusEntry[]
  activeVisibility: PostVisibility
  visibilityOptions: VisibilityOption[]
  onVisibilityChange: (visibility: PostVisibility) => void
  previewViewport: PreviewViewportMode
  previewViewportLabel: string
  previewViewportOptions: PreviewViewportOption[]
  onPreviewViewportChange: (viewport: PreviewViewportMode) => void
  previewFrameStyle?: CSSProperties
  previewThumbnailSrc: string
  postThumbnailFocusX: number
  postThumbnailFocusY: number
  postThumbnailZoom: number
  onPreviewThumbnailError: () => void
  previewVisibilityLabel: string
  summaryPreview: string
  previewDateText: string
  previewAuthorAvatarSrc: string
  displayNameInitial: string
  displayName: string
  summaryLengthLabel: string
  isComposeAssistOpen: boolean
  onToggleComposeAssist: () => void
  thumbnailEditorPanel: ReactNode
  previewMetaEditorPanel: ReactNode
  isTagPanelOpen: boolean
  onToggleTagPanel: () => void
  isUtilityPanelOpen: boolean
  onToggleUtilityPanel: () => void
  metaNotice: {
    tone: NoticeTone
    text: string
  }
  knownTags: string[]
  tagUsageMap: Record<string, number>
  onToggleKnownTag: (tag: string) => void
  onDeleteKnownTag: (tag: string) => void
  onRestoreLocalDraft: () => void
  onClearLocalDraft: () => void
  isClearLocalDraftDisabled: boolean
}

export const EditorStudioComposeWorkspace = ({
  isCompactMobileLayout,
  isPublishModalOpen,
  mobilePrimaryStatus,
  mobileSecondaryStatusText,
  mobilePrimaryActionLabel,
  composeCallToActionLabel,
  mobilePrimaryActionDisabled,
  onPrimaryAction,
  currentVisibilityText,
  editorModeLabel,
  composePageTitle,
  composeSurfaceSubtitle,
  composeStatusText,
  composeStatusTone,
  postSummary,
  postSummaryMaxLength,
  onPostSummaryChange,
  isFillSummaryFromBodyDisabled,
  onFillSummaryFromBody,
  postTags,
  tagDraft,
  onTagDraftChange,
  onAddTags,
  onAddTag,
  onRemoveTag,
  titleInputRef,
  postTitle,
  onPostTitleChange,
  onPostTitleKeyDown,
  thumbnailImageFileInputRef,
  onThumbnailImageFileChange,
  contentLength,
  lineCount,
  imageCount,
  editorCanvas,
  tagSummaryText,
  isSaveDraftDisabled,
  onSaveLocalDraft,
  composeHeroSummary,
  isRecommendTagsDisabled,
  isRecommendTagsLoading,
  onRecommendTags,
  composeStatusEntries,
  activeVisibility,
  visibilityOptions,
  onVisibilityChange,
  previewViewport,
  previewViewportLabel,
  previewViewportOptions,
  onPreviewViewportChange,
  previewFrameStyle,
  previewThumbnailSrc,
  postThumbnailFocusX,
  postThumbnailFocusY,
  postThumbnailZoom,
  onPreviewThumbnailError,
  previewVisibilityLabel,
  summaryPreview,
  previewDateText,
  previewAuthorAvatarSrc,
  displayNameInitial,
  displayName,
  summaryLengthLabel,
  isComposeAssistOpen,
  onToggleComposeAssist,
  thumbnailEditorPanel,
  previewMetaEditorPanel,
  isTagPanelOpen,
  onToggleTagPanel,
  isUtilityPanelOpen,
  onToggleUtilityPanel,
  metaNotice,
  knownTags,
  tagUsageMap,
  onToggleKnownTag,
  onDeleteKnownTag,
  onRestoreLocalDraft,
  onClearLocalDraft,
  isClearLocalDraftDisabled,
}: EditorStudioComposeWorkspaceProps) => (
  <ComposeSurfaceSection>
    <EditorSection>
      <EditorStudioComposeMobileChrome
        showStatus={isCompactMobileLayout}
        showAction={isCompactMobileLayout && !isPublishModalOpen}
        primaryStatus={mobilePrimaryStatus}
        visibilityText={currentVisibilityText}
        secondaryStatusText={mobileSecondaryStatusText}
        primaryActionLabel={mobilePrimaryActionLabel}
        primaryActionDisabled={mobilePrimaryActionDisabled}
        onPrimaryAction={onPrimaryAction}
      />
      <ComposeStudioLayout>
        <EditorStudioComposeWritingSurface
          editorModeLabel={editorModeLabel}
          composePageTitle={composePageTitle}
          composeSurfaceSubtitle={composeSurfaceSubtitle}
          composeStatusText={composeStatusText}
          composeStatusTone={composeStatusTone}
          currentVisibilityText={currentVisibilityText}
          postSummary={postSummary}
          postSummaryMaxLength={postSummaryMaxLength}
          onPostSummaryChange={onPostSummaryChange}
          isFillSummaryFromBodyDisabled={isFillSummaryFromBodyDisabled}
          onFillSummaryFromBody={onFillSummaryFromBody}
          postTags={postTags}
          tagDraft={tagDraft}
          onTagDraftChange={onTagDraftChange}
          onAddTags={onAddTags}
          onAddTag={onAddTag}
          onRemoveTag={onRemoveTag}
          titleInputRef={titleInputRef}
          postTitle={postTitle}
          onPostTitleChange={onPostTitleChange}
          onPostTitleKeyDown={onPostTitleKeyDown}
          thumbnailImageFileInputRef={thumbnailImageFileInputRef}
          onThumbnailImageFileChange={onThumbnailImageFileChange}
          contentLength={contentLength}
          lineCount={lineCount}
          imageCount={imageCount}
          editorCanvas={editorCanvas}
          tagSummaryText={tagSummaryText}
          isSaveDraftDisabled={isSaveDraftDisabled}
          onSaveDraft={onSaveLocalDraft}
          primaryActionDisabled={mobilePrimaryActionDisabled}
          primaryActionLabel={composeCallToActionLabel}
          onPrimaryAction={onPrimaryAction}
        />

        <ComposeAssistantColumn>
          <EditorStudioComposeAssistantPanel
            composeHeroSummary={composeHeroSummary}
            publishAction={
              <PrimaryButton type="button" disabled={mobilePrimaryActionDisabled} onClick={onPrimaryAction}>
                {composeCallToActionLabel}
              </PrimaryButton>
            }
            tagRecommendationAction={
              <Button type="button" disabled={isRecommendTagsDisabled} onClick={onRecommendTags}>
                {isRecommendTagsLoading ? "태그 제안 중..." : "태그 제안"}
              </Button>
            }
            composeStatusEntries={composeStatusEntries}
            activeVisibility={activeVisibility}
            visibilityOptions={visibilityOptions}
            onVisibilityChange={onVisibilityChange}
            previewViewport={previewViewport}
            previewViewportLabel={previewViewportLabel}
            previewViewportOptions={previewViewportOptions}
            onPreviewViewportChange={onPreviewViewportChange}
            previewFrameStyle={previewFrameStyle}
            previewThumbnailSrc={previewThumbnailSrc}
            postThumbnailFocusX={postThumbnailFocusX}
            postThumbnailFocusY={postThumbnailFocusY}
            postThumbnailZoom={postThumbnailZoom}
            onPreviewThumbnailError={onPreviewThumbnailError}
            previewVisibilityLabel={previewVisibilityLabel}
            postTitle={postTitle}
            summaryPreview={summaryPreview}
            previewDateText={previewDateText}
            previewAuthorAvatarSrc={previewAuthorAvatarSrc}
            displayNameInitial={displayNameInitial}
            displayName={displayName}
            summaryLengthLabel={summaryLengthLabel}
            isComposeAssistOpen={isComposeAssistOpen}
            onToggleComposeAssist={onToggleComposeAssist}
            thumbnailEditorPanel={thumbnailEditorPanel}
            previewMetaEditorPanel={previewMetaEditorPanel}
          >
            <EditorStudioMetadataAssistantPanel
              isTagPanelOpen={isTagPanelOpen}
              onToggleTagPanel={onToggleTagPanel}
              isUtilityPanelOpen={isUtilityPanelOpen}
              onToggleUtilityPanel={onToggleUtilityPanel}
              metaNotice={metaNotice}
              knownTags={knownTags}
              selectedTags={postTags}
              tagUsageMap={tagUsageMap}
              onToggleTag={onToggleKnownTag}
              onDeleteTag={onDeleteKnownTag}
              utilityActions={
                <SubActionRow>
                  <Button type="button" disabled={isSaveDraftDisabled} onClick={onSaveLocalDraft}>
                    브라우저 임시저장
                  </Button>
                  <Button type="button" disabled={isSaveDraftDisabled} onClick={onRestoreLocalDraft}>
                    임시저장 불러오기
                  </Button>
                  <Button type="button" disabled={isClearLocalDraftDisabled} onClick={onClearLocalDraft}>
                    임시저장 삭제
                  </Button>
                </SubActionRow>
              }
            />
          </EditorStudioComposeAssistantPanel>
        </ComposeAssistantColumn>
      </ComposeStudioLayout>
    </EditorSection>
  </ComposeSurfaceSection>
)

const ComposeSurfaceSection = styled.section`
  display: grid;
  gap: 1.2rem;
  border: 1px solid ${({ theme }) => theme.colors.gray4};
  border-radius: 14px;
  padding: 1.1rem 1.1rem 1.3rem;
  margin-bottom: 1.2rem;
  background:
    radial-gradient(circle at top left, rgba(96, 165, 250, 0.04), transparent 24%),
    ${({ theme }) => theme.colors.gray1};
  box-shadow: none;

  h2 {
    margin: 0;
    font-size: 1.2rem;
    color: ${({ theme }) => theme.colors.gray12};
  }

  @media (max-width: 420px) {
    gap: 1rem;
    border-radius: 12px;
    padding: 0.82rem 0.82rem 1rem;
    margin-bottom: 0.95rem;
  }
`

const EditorSection = styled.div`
  margin: 1.12rem 0 0.25rem;
  border: none;
  border-radius: 0;
  padding: 0;
  background: transparent;

  @media (max-width: 720px) {
    padding: 0;
    margin-top: 0.92rem;
  }
`

const ComposeStudioLayout = styled.div`
  display: grid;
  gap: 1.4rem;
  align-items: start;

  @media (min-width: 1180px) {
    grid-template-columns: minmax(0, 1fr) minmax(300px, 340px);
  }

  @media (max-width: 720px) {
    gap: 1rem;
  }
`

const ComposeAssistantColumn = styled.aside`
  min-width: 0;
`

const SubActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.65rem;
  padding-top: 0.65rem;
  border-top: 1px dashed ${({ theme }) => theme.colors.gray6};

  > button {
    border-style: dashed;
  }

  @media (max-width: 720px) {
    display: grid;
    grid-template-columns: 1fr;

    > button {
      width: 100%;
      justify-content: center;
    }
  }
`

const Button = styled.button`
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 8px;
  padding: 0.62rem 0.92rem;
  min-height: 44px;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray10};
  cursor: pointer;
  font-size: 0.84rem;
  font-weight: 600;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.gray8};
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.blue4};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

const PrimaryButton = styled(Button)`
  border-radius: 8px;
  padding: 0.6rem 0.88rem;
  border-color: ${({ theme }) => theme.colors.blue9};
  background: ${({ theme }) => theme.colors.blue9};
  color: ${({ theme }) => theme.colors.gray1};
  font-weight: 700;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.blue10};
    background: ${({ theme }) => theme.colors.blue10};
    color: ${({ theme }) => theme.colors.gray1};
  }
`
