import styled from "@emotion/styled"
import type { CSSProperties, ReactNode } from "react"
import ProfileImage from "src/components/ProfileImage"
import AppIcon from "src/components/icons/AppIcon"
import type { PostVisibility } from "./editorStudioState"

type NoticeTone = "idle" | "loading" | "success" | "error"

type PublishNoticeState = {
  tone: NoticeTone
  text: string
}

type PublishVisibilityOption = {
  value: PostVisibility
  label: string
  description: string
}

type PreviewViewportOption<TViewport extends string> = {
  value: TViewport
  label: string
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
  previewViewportOptions: Array<PreviewViewportOption<TViewport>>
  previewVisibilityLabel: string
  publishActionButtonDisabled: boolean
  publishActionButtonText: string
  publishActionTitle: string
  setupDescription?: string
  shouldShowNotice: boolean
  thumbnailEditorPanel: ReactNode
  variant?: "drawer"
  visibilityOptions: PublishVisibilityOption[]
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
          </PublishOverviewGrid>

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
  display: grid;
  gap: 0.75rem;

  h4 {
    margin: 0;
    font-size: 1.08rem;
    color: ${({ theme }) => theme.colors.gray12};
  }
`

const PublishModalBody = styled.div`
  display: grid;
  gap: 0.8rem;
  padding-bottom: 0.6rem;

  @media (max-width: 720px) {
    gap: 0.7rem;
  }
`

const PublishModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  flex-wrap: wrap;
  position: sticky;
  bottom: 0;
  z-index: 2;
  margin: 0 -1rem;
  padding: 0.9rem 1rem 1rem;
  border-top: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  box-shadow: 0 -10px 28px rgba(2, 6, 23, 0.12);

  @media (max-width: 720px) {
    margin: 0 -0.82rem;
    padding: 0.82rem 0.82rem calc(0.9rem + env(safe-area-inset-bottom, 0px));
  }
`

const PublishOverviewGrid = styled.div`
  display: grid;
  gap: 0.8rem;

  @media (min-width: 1080px) {
    grid-template-columns: minmax(0, 1fr) minmax(320px, 368px);
    align-items: start;
  }
`

const VisibilityCard = styled.section`
  display: grid;
  gap: 0.62rem;
  align-content: start;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0)),
    ${({ theme }) => theme.colors.gray1};
  padding: 0.9rem;

  > strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.94rem;
    font-weight: 700;
    line-height: 1.35;
  }
`

const SectionKicker = styled.span`
  display: inline-flex;
  align-items: center;
  width: fit-content;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
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

const FieldHelp = styled.span`
  display: block;
  width: 100%;
  min-width: 0;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.74rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
  word-break: break-word;

  @media (max-width: 720px) {
    display: none;
  }
`

const PreviewResultPanel = styled.div`
  display: grid;
  gap: 0.75rem;
  min-width: 0;
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0)),
    ${({ theme }) => theme.colors.gray1};
  padding: 0.9rem;
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

const PostPreviewSetup = styled.section`
  display: grid;
  gap: 0.82rem;
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 0;
`

const PostPreviewHeader = styled.div`
  display: grid;
  gap: 0.18rem;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.92rem;
    font-weight: 700;
    line-height: 1.3;
  }

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.76rem;
    line-height: 1.45;
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

const CompactPublishEditorStack = styled.div`
  display: grid;
  gap: 0.7rem;
`

const CompactPublishEditorCard = styled.div`
  display: grid;
  gap: 0.62rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.gray2};
  padding: 0.72rem;
`

const CompactPublishEditorToggle = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
  width: 100%;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;

  > div {
    display: grid;
    gap: 0.14rem;
    min-width: 0;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.86rem;
    font-weight: 700;
    line-height: 1.3;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.76rem;
    line-height: 1.45;
  }

  > span:last-of-type {
    flex: 0 0 auto;
    color: ${({ theme }) => theme.colors.blue11};
    font-weight: 700;
  }
`

const PublishModalNotice = styled.div`
  margin: 0;
  padding: 0.55rem 0.7rem;
  border-radius: 10px;
  font-size: 0.83rem;
  line-height: 1.4;
  width: 100%;
  box-sizing: border-box;

  &[data-tone="idle"] {
    color: ${({ theme }) => theme.colors.gray11};
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
  }

  &[data-tone="loading"] {
    color: ${({ theme }) => theme.colors.blue11};
    border: 1px solid ${({ theme }) => theme.colors.blue7};
    background: ${({ theme }) => theme.colors.blue3};
  }

  &[data-tone="success"] {
    color: ${({ theme }) => theme.colors.green11};
    border: 1px solid ${({ theme }) => theme.colors.green7};
    background: ${({ theme }) => theme.colors.green3};
  }

  &[data-tone="error"] {
    color: ${({ theme }) => theme.colors.red11};
    border: 1px solid ${({ theme }) => theme.colors.red7};
    background: ${({ theme }) => theme.colors.red3};
  }

  @media (max-width: 720px) {
    width: 100%;
  }
`

const PublishButton = styled.button`
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

const PublishPrimaryButton = styled(PublishButton)`
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
