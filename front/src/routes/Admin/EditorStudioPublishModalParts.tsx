import type { CSSProperties, ReactNode } from "react"
import ProfileImage from "src/components/ProfileImage"
import {
  CompactPublishEditorCard,
  CompactPublishEditorStack,
  CompactPublishEditorToggle,
  FieldHelp,
  PostPreviewHeader,
  PostPreviewSetup,
  PreviewEditorGrid,
  PreviewResultCard,
  PreviewResultFrame,
  PreviewResultHeader,
  PreviewResultPanel,
  PreviewViewportButton,
  PreviewViewportTabs,
  PreviewVisibilityBadge,
  SectionKicker,
  VisibilityCard,
  VisibilityOptionButton,
  VisibilityOptionGrid,
} from "./EditorStudioPublishModalStyles"
import AppIcon from "src/components/icons/AppIcon"
import type { PostVisibility } from "./editorStudioState"

export type EditorStudioPublishVisibilityOption = {
  value: PostVisibility
  label: string
  description: string
}

export type EditorStudioPreviewViewportOption<TViewport extends string> = {
  value: TViewport
  label: string
}

type VisibilitySectionProps = {
  postVisibility: PostVisibility
  visibilityOptions: EditorStudioPublishVisibilityOption[]
  onPostVisibilityChange: (nextVisibility: PostVisibility) => void
}

export const EditorStudioPublishVisibilitySection = ({
  postVisibility,
  visibilityOptions,
  onPostVisibilityChange,
}: VisibilitySectionProps) => (
  <VisibilityCard>
    <SectionKicker>노출 범위</SectionKicker>
    <strong>누가 이 글을 볼 수 있나요?</strong>
    <VisibilityOptionGrid role="group" aria-label="노출 범위 선택">
      {visibilityOptions.map((option) => (
        <VisibilityOptionButton
          key={option.value}
          type="button"
          data-active={postVisibility === option.value}
          aria-pressed={postVisibility === option.value}
          onClick={() => onPostVisibilityChange(option.value)}
        >
          <strong>{option.label}</strong>
          <span>{option.description}</span>
        </VisibilityOptionButton>
      ))}
    </VisibilityOptionGrid>
    <FieldHelp>메인 피드 노출은 전체 공개에서만 활성화됩니다.</FieldHelp>
  </VisibilityCard>
)

type PreviewCardProps<TViewport extends string> = {
  displayName: string
  displayNameInitial: string
  postThumbnailFocusX: number
  postThumbnailFocusY: number
  postThumbnailZoom: number
  postTitle: string
  previewAuthorAvatarSrc: string
  previewDateText: string
  previewFrameStyle: CSSProperties
  previewKicker: string
  previewSummary: string
  previewSummaryFallback: string
  previewThumbnailSrc: string
  previewViewport: TViewport
  previewViewportLabel: string
  previewViewportOptions: Array<EditorStudioPreviewViewportOption<TViewport>>
  previewVisibilityLabel: string
  onPreviewThumbnailError: () => void
  onPreviewViewportChange: (nextViewport: TViewport) => void
}

export const EditorStudioPublishPreviewCard = <TViewport extends string,>({
  displayName,
  displayNameInitial,
  postThumbnailFocusX,
  postThumbnailFocusY,
  postThumbnailZoom,
  postTitle,
  previewAuthorAvatarSrc,
  previewDateText,
  previewFrameStyle,
  previewKicker,
  previewSummary,
  previewSummaryFallback,
  previewThumbnailSrc,
  previewViewport,
  previewViewportLabel,
  previewViewportOptions,
  previewVisibilityLabel,
  onPreviewThumbnailError,
  onPreviewViewportChange,
}: PreviewCardProps<TViewport>) => (
  <PreviewResultPanel>
    <PreviewResultHeader>
      <div>
        <SectionKicker>{previewKicker}</SectionKicker>
        <strong>{previewViewportLabel}</strong>
      </div>
      <PreviewViewportTabs role="tablist" aria-label="포스트 카드 미리보기 기기">
        {previewViewportOptions.map((viewport) => (
          <PreviewViewportButton
            key={viewport.value}
            type="button"
            role="tab"
            aria-selected={previewViewport === viewport.value}
            data-active={previewViewport === viewport.value}
            onClick={() => onPreviewViewportChange(viewport.value)}
          >
            {viewport.label}
          </PreviewViewportButton>
        ))}
      </PreviewViewportTabs>
    </PreviewResultHeader>
    <PreviewResultFrame style={previewFrameStyle}>
      <PreviewResultCard>
        <div className="thumbnail">
          {previewThumbnailSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewThumbnailSrc}
              alt="실제 카드 기준 포스트 썸네일 미리보기"
              style={{
                objectFit: "cover",
                objectPosition: `${postThumbnailFocusX}% ${postThumbnailFocusY}%`,
                transform: `scale(${postThumbnailZoom})`,
                transformOrigin: `${postThumbnailFocusX}% ${postThumbnailFocusY}%`,
              }}
              onError={onPreviewThumbnailError}
            />
          ) : (
            <div className="thumbnail-placeholder">
              <em>썸네일 없음</em>
              <span>본문 첫 이미지가 자동 카드 썸네일로 사용됩니다.</span>
            </div>
          )}
        </div>
        <div className="content">
          <PreviewVisibilityBadge>{previewVisibilityLabel}</PreviewVisibilityBadge>
          <h4>{postTitle.trim() || "제목을 입력하면 카드 결과가 여기에 표시됩니다."}</h4>
          <p className="summary">{previewSummary || previewSummaryFallback}</p>
          <div className="meta">
            <span>{previewDateText}</span>
            <span className="dot">·</span>
            <span className="comment">
              <AppIcon name="message" />
              0개의 댓글
            </span>
          </div>
          <div className="footer">
            <div className="author">
              <span className="avatar" aria-hidden="true">
                {previewAuthorAvatarSrc ? (
                  <ProfileImage src={previewAuthorAvatarSrc} alt="" fillContainer />
                ) : (
                  <span className="initial">{displayNameInitial}</span>
                )}
              </span>
              <span className="by">by</span>
              <strong>{displayName}</strong>
            </div>
            <div className="like">
              <AppIcon name="heart" />
              <span>0</span>
            </div>
          </div>
        </div>
      </PreviewResultCard>
    </PreviewResultFrame>
  </PreviewResultPanel>
)

type CardSettingsProps = {
  closeToggleLabel: string
  isCompactMobileLayout: boolean
  isMobileMetaEditorOpen: boolean
  isMobileThumbnailEditorOpen: boolean
  previewMetaEditorPanel: ReactNode
  setupDescription?: string
  thumbnailEditorPanel: ReactNode
  onToggleMobileMetaEditor: () => void
  onToggleMobileThumbnailEditor: () => void
}

export const EditorStudioPublishCardSettings = ({
  closeToggleLabel,
  isCompactMobileLayout,
  isMobileMetaEditorOpen,
  isMobileThumbnailEditorOpen,
  previewMetaEditorPanel,
  setupDescription,
  thumbnailEditorPanel,
  onToggleMobileMetaEditor,
  onToggleMobileThumbnailEditor,
}: CardSettingsProps) => (
  <PostPreviewSetup>
    <PostPreviewHeader>
      <strong>카드 요소 편집</strong>
      {setupDescription ? <span>{setupDescription}</span> : null}
    </PostPreviewHeader>
    {isCompactMobileLayout ? (
      <CompactPublishEditorStack>
        <CompactPublishEditorCard>
          <CompactPublishEditorToggle
            type="button"
            aria-expanded={isMobileThumbnailEditorOpen}
            onClick={onToggleMobileThumbnailEditor}
          >
            <div>
              <strong>썸네일 위치 조정</strong>
              <span>드래그/확대로 카드 크롭을 빠르게 맞춥니다.</span>
            </div>
            <span>{isMobileThumbnailEditorOpen ? closeToggleLabel : "열기"}</span>
          </CompactPublishEditorToggle>
          {isMobileThumbnailEditorOpen ? thumbnailEditorPanel : null}
        </CompactPublishEditorCard>
        <CompactPublishEditorCard>
          <CompactPublishEditorToggle
            type="button"
            aria-expanded={isMobileMetaEditorOpen}
            onClick={onToggleMobileMetaEditor}
          >
            <div>
              <strong>카드 메타 편집</strong>
              <span>썸네일 URL과 요약만 따로 정리합니다.</span>
            </div>
            <span>{isMobileMetaEditorOpen ? closeToggleLabel : "열기"}</span>
          </CompactPublishEditorToggle>
          {isMobileMetaEditorOpen ? previewMetaEditorPanel : null}
        </CompactPublishEditorCard>
      </CompactPublishEditorStack>
    ) : (
      <PreviewEditorGrid>
        {thumbnailEditorPanel}
        {previewMetaEditorPanel}
      </PreviewEditorGrid>
    )}
  </PostPreviewSetup>
)

export { PublishButton, PublishModalNotice, PublishOverviewGrid, PublishPrimaryButton } from "./EditorStudioPublishModalStyles"

