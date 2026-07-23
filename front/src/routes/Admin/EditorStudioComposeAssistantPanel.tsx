import type { CSSProperties, ReactNode } from "react"
import ProfileImage from "src/components/ProfileImage"
import AppIcon from "src/components/icons/AppIcon"
import type { PostVisibility } from "./editorStudioState"
import {
  AssistantDisclosure,
  ComposeAssistantActionBar,
  ComposeAssistantGroup,
  ComposeAssistantGroupHeader,
  ComposeAssistantPanel,
  ComposeSidebarSummaryText,
  ComposeStatusBoard,
  ComposeStatusRow,
  PreviewEditorGrid,
  PreviewResultCard,
  PreviewResultFrame,
  PreviewResultHeader,
  PreviewViewportButton,
  PreviewViewportTabs,
  PreviewVisibilityBadge,
  PublishSettingsSummary,
  SummaryPill,
  VisibilityOptionButton,
  VisibilityOptionGrid,
} from "./EditorStudioComposeAssistantPanelParts"

type PreviewViewportMode = "desktop" | "tablet" | "mobile"
type ComposeStatusTone = "idle" | "loading" | "success" | "error"

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
  tone: ComposeStatusTone
}

type EditorStudioComposeAssistantPanelProps = {
  composeHeroSummary: string[]
  publishAction: ReactNode
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
  postTitle: string
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
  children?: ReactNode
}

export const EditorStudioComposeAssistantPanel = ({
  composeHeroSummary,
  publishAction,
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
  postTitle,
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
  children,
}: EditorStudioComposeAssistantPanelProps) => (
  <ComposeAssistantPanel>
    <ComposeAssistantGroup>
      <ComposeAssistantGroupHeader>
        <div>
          <strong>발행 상태</strong>
          <span>지금 상태를 확인하고 발행 전 마지막 설정을 정리합니다.</span>
        </div>
      </ComposeAssistantGroupHeader>
      <PublishSettingsSummary aria-label="현재 발행 설정 요약">
        {composeHeroSummary.map((item) => (
          <SummaryPill key={item}>{item}</SummaryPill>
        ))}
      </PublishSettingsSummary>
      <ComposeAssistantActionBar>
        {publishAction}
      </ComposeAssistantActionBar>
      <ComposeStatusBoard aria-label="작성 상태 요약">
        {composeStatusEntries.map((item) => (
          <ComposeStatusRow key={item.key} data-tone={item.tone}>
            <strong>{item.label}</strong>
            <span>{item.text}</span>
          </ComposeStatusRow>
        ))}
      </ComposeStatusBoard>
    </ComposeAssistantGroup>

    <ComposeAssistantGroup>
      <ComposeAssistantGroupHeader>
        <div>
          <strong>공개 범위</strong>
          <span>발행 전 노출 범위를 정합니다.</span>
        </div>
      </ComposeAssistantGroupHeader>
      <VisibilityOptionGrid role="group" aria-label="노출 범위 선택">
        {visibilityOptions.map((option) => (
          <VisibilityOptionButton
            key={option.value}
            type="button"
            data-active={activeVisibility === option.value}
            aria-pressed={activeVisibility === option.value}
            onClick={() => onVisibilityChange(option.value)}
          >
            <strong>{option.label}</strong>
            <span>{option.description}</span>
          </VisibilityOptionButton>
        ))}
      </VisibilityOptionGrid>
    </ComposeAssistantGroup>

    <ComposeAssistantGroup>
      <PreviewResultHeader>
        <div>
          <strong>카드 미리보기</strong>
          <span>{previewViewportLabel} 폭에서 결과를 확인합니다.</span>
        </div>
        <PreviewViewportTabs role="tablist" aria-label="포스트 카드 미리보기 기기">
          {previewViewportOptions.map((option) => (
            <PreviewViewportButton
              key={option.value}
              type="button"
              role="tab"
              aria-selected={previewViewport === option.value}
              data-active={previewViewport === option.value}
              onClick={() => onPreviewViewportChange(option.value)}
            >
              {option.label}
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
                <span>본문 첫 이미지가 있으면 자동으로 반영됩니다.</span>
              </div>
            )}
          </div>
          <div className="content">
            <PreviewVisibilityBadge>{previewVisibilityLabel}</PreviewVisibilityBadge>
            <h4>{postTitle.trim() || "제목을 입력하면 카드 결과가 여기에 표시됩니다."}</h4>
            <p className="summary">
              {summaryPreview || "요약을 비워두면 본문에서 자동 생성한 요약이 반영됩니다."}
            </p>
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
    </ComposeAssistantGroup>

    <ComposeAssistantGroup>
      <ComposeAssistantGroupHeader>
        <div>
          <strong>카드 요약</strong>
          <span>{summaryLengthLabel}</span>
        </div>
      </ComposeAssistantGroupHeader>
      <ComposeSidebarSummaryText>
        {summaryPreview || "요약을 입력하면 카드 결과와 발행 요약에 함께 반영됩니다."}
      </ComposeSidebarSummaryText>
    </ComposeAssistantGroup>

    <AssistantDisclosure open={isComposeAssistOpen}>
      <summary
        onClick={(event) => {
          event.preventDefault()
          onToggleComposeAssist()
        }}
      >
        <strong>썸네일과 카드 설정</strong>
        <span>{isComposeAssistOpen ? "닫기" : "열기"}</span>
      </summary>
      {isComposeAssistOpen && (
        <div className="body">
          <PreviewEditorGrid>
            {thumbnailEditorPanel}
            {previewMetaEditorPanel}
          </PreviewEditorGrid>
        </div>
      )}
    </AssistantDisclosure>

    {children}
  </ComposeAssistantPanel>
)
