import styled from "@emotion/styled"
import type { CSSProperties, ReactNode } from "react"
import ProfileImage from "src/components/ProfileImage"
import AppIcon from "src/components/icons/AppIcon"
import type { PostVisibility } from "./editorStudioState"

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
  tagRecommendationAction: ReactNode
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
  tagRecommendationAction,
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
        {tagRecommendationAction}
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

const ComposeAssistantPanel = styled.div`
  display: grid;
  gap: 0.85rem;

  @media (min-width: 1180px) {
    position: sticky;
    top: calc(var(--app-header-height, 56px) + 1rem);
  }
`

const ComposeAssistantGroup = styled.section`
  display: grid;
  gap: 0.72rem;
  padding: 0.9rem 0.95rem;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 16px;
  background: ${({ theme }) => theme.colors.gray2};
`

const ComposeAssistantGroupHeader = styled.div`
  display: grid;
  gap: 0.16rem;

  > div {
    display: grid;
    gap: 0.16rem;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.92rem;
    font-weight: 760;
    line-height: 1.28;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.76rem;
    line-height: 1.45;
  }
`

const ComposeAssistantActionBar = styled.div`
  display: grid;
  gap: 0.56rem;

  > button {
    width: 100%;
  }
`

const VisibilityOptionGrid = styled.div`
  display: grid;
  gap: 0.5rem;
`

const VisibilityOptionButton = styled.button`
  display: grid;
  gap: 0.16rem;
  width: 100%;
  padding: 0.72rem 0.78rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    box-shadow 0.18s ease;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.84rem;
    font-weight: 700;
    line-height: 1.3;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.75rem;
    line-height: 1.45;
  }

  &[data-active="true"] {
    border-color: ${({ theme }) => theme.colors.blue8};
    background: ${({ theme }) => theme.colors.blue3};
    box-shadow: 0 0 0 1px ${({ theme }) => theme.colors.blue6} inset;
  }
`

const PreviewResultHeader = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;

  > div:first-of-type {
    display: grid;
    gap: 0.16rem;
    min-width: 0;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.9rem;
    font-weight: 700;
    line-height: 1.3;
  }

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.76rem;
    line-height: 1.45;
  }

  @media (max-width: 1079px) {
    flex-direction: column;
  }
`

const PreviewViewportTabs = styled.div`
  display: inline-flex;
  flex-wrap: nowrap;
  gap: 0.4rem;
  max-width: 100%;
  overflow-x: auto;
  padding-bottom: 0.1rem;
`

const PreviewViewportButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray10};
  padding: 0 0.78rem;
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;

  &[data-active="true"] {
    border-color: ${({ theme }) => theme.colors.gray7};
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
    box-shadow: 0 0 0 1px ${({ theme }) => theme.colors.gray5} inset;
  }

  &:hover:not([data-active="true"]) {
    border-color: ${({ theme }) => theme.colors.gray8};
    color: ${({ theme }) => theme.colors.gray12};
  }
`

const PreviewResultFrame = styled.div`
  width: 100%;
  margin: 0 auto;
`

const PreviewVisibilityBadge = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  width: fit-content;
  border-radius: 999px;
  border: 1px solid rgba(45, 212, 191, 0.34);
  background: rgba(20, 184, 166, 0.12);
  color: #99f6e4;
  padding: 0 0.56rem;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1;
`

const PreviewResultCard = styled.article`
  overflow: hidden;
  width: 100%;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray4};
  background: ${({ theme }) => theme.colors.gray1};
  box-shadow: 0 10px 28px rgba(2, 6, 23, 0.22);

  .thumbnail {
    position: relative;
    aspect-ratio: 1.94 / 1;
    overflow: hidden;
    background:
      radial-gradient(circle at top left, rgba(96, 165, 250, 0.08), transparent 48%),
      ${({ theme }) => theme.colors.gray3};
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray4};
  }

  .thumbnail img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .thumbnail-placeholder {
    width: 100%;
    height: 100%;
    display: grid;
    place-content: center;
    gap: 0.28rem;
    padding: 1rem;
    text-align: center;
  }

  .thumbnail-placeholder em {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
    font-style: normal;
    font-weight: 700;
  }

  .thumbnail-placeholder span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.74rem;
    line-height: 1.45;
  }

  .content {
    display: grid;
    gap: 0.72rem;
    padding: 1rem;
  }

  h4 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1rem;
    font-weight: 760;
    line-height: 1.33;
    letter-spacing: -0.015em;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .summary {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.86rem;
    line-height: 1.55;
    min-height: calc(1.55em * 3);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .meta,
  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.65rem;
    flex-wrap: wrap;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.75rem;
  }

  .meta {
    padding-top: 0.05rem;
  }

  .meta .dot {
    opacity: 0.7;
  }

  .comment,
  .like,
  .author {
    display: inline-flex;
    align-items: center;
    gap: 0.34rem;
  }

  .author {
    min-width: 0;
  }

  .author strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.86rem;
    font-weight: 700;
  }

  .author .by {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.75rem;
    font-weight: 600;
  }

  .avatar {
    position: relative;
    flex: 0 0 1.85rem;
    width: 1.85rem;
    height: 1.85rem;
    border-radius: 999px;
    overflow: hidden;
    background: ${({ theme }) => theme.colors.gray4};
    border: 1px solid ${({ theme }) => theme.colors.gray5};
  }

  .initial {
    display: grid;
    place-content: center;
    width: 100%;
    height: 100%;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.72rem;
    font-weight: 800;
  }

  .like {
    color: ${({ theme }) => theme.colors.gray11};
    font-weight: 700;
  }
`

const PreviewEditorGrid = styled.div`
  display: grid;
  gap: 0.8rem;

  @media (min-width: 840px) {
    grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
    align-items: start;
  }
`

const ComposeStatusBoard = styled.div`
  display: grid;
  gap: 0.56rem;
`

const ComposeStatusRow = styled.div`
  display: grid;
  gap: 0.16rem;
  padding: 0.68rem 0.76rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.76rem;
    font-weight: 800;
    letter-spacing: -0.01em;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.79rem;
    line-height: 1.48;
  }

  &[data-tone="loading"] {
    border-color: ${({ theme }) => theme.colors.blue7};
    background: ${({ theme }) => theme.colors.blue3};

    span {
      color: ${({ theme }) => theme.colors.blue11};
    }
  }

  &[data-tone="success"] {
    border-color: ${({ theme }) => theme.colors.green7};
    background: ${({ theme }) => theme.colors.green3};

    span {
      color: ${({ theme }) => theme.colors.green11};
    }
  }

  &[data-tone="error"] {
    border-color: ${({ theme }) => theme.colors.red7};
    background: ${({ theme }) => theme.colors.red3};

    span {
      color: ${({ theme }) => theme.colors.red11};
    }
  }
`

const PublishSettingsSummary = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.36rem;
`

const SummaryPill = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  border-radius: 6px;
  padding: 0 0.48rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.74rem;
  font-weight: 600;
`

const ComposeSidebarSummaryText = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.84rem;
  line-height: 1.65;
  white-space: pre-line;
`

const AssistantDisclosure = styled.details`
  margin-top: 0.68rem;
  border-top: 1px dashed ${({ theme }) => theme.colors.gray6};
  padding-top: 0.68rem;

  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.72rem;
    list-style: none;
    cursor: pointer;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.78rem;
    line-height: 1.45;

    &::-webkit-details-marker {
      display: none;
    }
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.8rem;
    font-weight: 700;
  }

  summary > span:last-of-type {
    flex: 0 0 auto;
    color: ${({ theme }) => theme.colors.blue11};
    font-size: 0.76rem;
    font-weight: 700;
  }

  .body {
    display: grid;
    gap: 0.62rem;
    margin-top: 0.72rem;
  }
`
