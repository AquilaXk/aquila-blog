import styled from "@emotion/styled"
import type {
  ClipboardEventHandler,
  PointerEventHandler,
  RefObject,
} from "react"

type ThumbnailSourceTone = "manual" | "auto" | "empty"

type EditorStudioThumbnailEditorPanelProps = {
  finalizePreviewThumbPointer: PointerEventHandler<HTMLDivElement>
  handlePreviewThumbPointerDown: PointerEventHandler<HTMLDivElement>
  handlePreviewThumbPointerMove: PointerEventHandler<HTMLDivElement>
  isPreviewThumbDragging: boolean
  isPreviewThumbnailError: boolean
  postThumbnailZoom: number
  previewThumbFrameRef: RefObject<HTMLDivElement>
  safePreviewThumbnail: string
  setIsPreviewThumbnailError: (nextValue: boolean) => void
  onThumbnailZoomChange: (nextZoom: number) => void
  onResetThumbnailZoom: () => void
}

type EditorStudioThumbnailMetaPanelProps = {
  firstBodyImageUrl: string
  isThumbnailUploadDisabled: boolean
  isThumbnailUploading: boolean
  postThumbnailUrl: string
  thumbnailImageFileName: string
  thumbnailUploadRuleLabel: string
  onApplyFirstBodyImage: () => void
  onOpenThumbnailFileInput: () => void
  onResetThumbnailToAutoMode: () => void
  onThumbnailPaste: ClipboardEventHandler<HTMLElement>
  onThumbnailUrlChange: (nextValue: string) => void
}

export const EditorStudioThumbnailEditorPanel = ({
  finalizePreviewThumbPointer,
  handlePreviewThumbPointerDown,
  handlePreviewThumbPointerMove,
  isPreviewThumbDragging,
  isPreviewThumbnailError,
  postThumbnailZoom,
  previewThumbFrameRef,
  safePreviewThumbnail,
  setIsPreviewThumbnailError,
  onThumbnailZoomChange,
  onResetThumbnailZoom,
}: EditorStudioThumbnailEditorPanelProps) => (
  <PreviewEditorSection>
    <PreviewEditorSectionHeader>
      <strong>썸네일 위치 조정</strong>
    </PreviewEditorSectionHeader>
    <PreviewThumbFrame
      ref={previewThumbFrameRef}
      data-draggable={safePreviewThumbnail && !isPreviewThumbnailError}
      data-dragging={isPreviewThumbDragging}
      onPointerDown={handlePreviewThumbPointerDown}
      onPointerMove={handlePreviewThumbPointerMove}
      onPointerUp={finalizePreviewThumbPointer}
      onPointerCancel={finalizePreviewThumbPointer}
    >
      {safePreviewThumbnail && !isPreviewThumbnailError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={safePreviewThumbnail}
          alt="포스트 미리보기 썸네일"
          style={{
            width: "var(--preview-thumb-width)",
            height: "var(--preview-thumb-height)",
            left: "var(--preview-thumb-left)",
            top: "var(--preview-thumb-top)",
            maxWidth: "none",
            transform: "translateZ(0)",
          }}
          onError={() => setIsPreviewThumbnailError(true)}
        />
      ) : (
        <div className="placeholder">
          <em>썸네일 없음</em>
        </div>
      )}
    </PreviewThumbFrame>
    {safePreviewThumbnail && !isPreviewThumbnailError ? (
      <ZoomControlRow>
        <ThumbnailFieldLabel htmlFor="post-thumbnail-zoom-modal">썸네일 배율</ThumbnailFieldLabel>
        <ZoomRangeInput
          id="post-thumbnail-zoom-modal"
          type="range"
          min={1}
          max={2.5}
          step={0.01}
          value={postThumbnailZoom}
          onChange={(event) => onThumbnailZoomChange(Number(event.target.value))}
        />
        <ZoomControlMeta>
          <ZoomValue>{postThumbnailZoom.toFixed(2)}x</ZoomValue>
          <ThumbnailButton type="button" onClick={onResetThumbnailZoom}>
            배율 초기화
          </ThumbnailButton>
        </ZoomControlMeta>
      </ZoomControlRow>
    ) : null}
  </PreviewEditorSection>
)

export const EditorStudioThumbnailMetaPanel = ({
  firstBodyImageUrl,
  isThumbnailUploadDisabled,
  isThumbnailUploading,
  postThumbnailUrl,
  thumbnailImageFileName,
  thumbnailUploadRuleLabel,
  onApplyFirstBodyImage,
  onOpenThumbnailFileInput,
  onResetThumbnailToAutoMode,
  onThumbnailPaste,
  onThumbnailUrlChange,
}: EditorStudioThumbnailMetaPanelProps) => {
  const hasManualThumbnail = postThumbnailUrl.trim().length > 0
  const hasFirstBodyImage = firstBodyImageUrl.trim().length > 0
  const sourceTone: ThumbnailSourceTone = hasManualThumbnail ? "manual" : hasFirstBodyImage ? "auto" : "empty"
  const sourceLabel = hasManualThumbnail
    ? "수동 썸네일 URL 사용 중"
    : hasFirstBodyImage
      ? "본문 첫 이미지를 자동으로 사용 중"
      : "현재 썸네일이 없습니다"

  return (
    <PreviewEditorSection onPasteCapture={onThumbnailPaste}>
      <PreviewEditorSectionHeader>
        <strong>썸네일 이미지</strong>
        <ThumbnailSourceStatus data-tone={sourceTone}>{sourceLabel}</ThumbnailSourceStatus>
      </PreviewEditorSectionHeader>
      <ThumbnailFieldLabel htmlFor="post-thumbnail-url-modal">썸네일 URL</ThumbnailFieldLabel>
      <ThumbnailInput
        id="post-thumbnail-url-modal"
        placeholder="https://... (비우면 본문 첫 이미지 자동 사용)"
        value={postThumbnailUrl}
        onChange={(event) => onThumbnailUrlChange(event.target.value)}
        onPaste={onThumbnailPaste}
      />
      <MetaPrimaryActionRow>
        <ThumbnailPrimaryButton
          type="button"
          title={thumbnailUploadRuleLabel}
          disabled={isThumbnailUploadDisabled}
          onClick={onOpenThumbnailFileInput}
        >
          {isThumbnailUploading ? "업로드 중..." : "썸네일 파일 업로드"}
        </ThumbnailPrimaryButton>
      </MetaPrimaryActionRow>
      <MetaSecondaryActionRow>
        <ThumbnailButton type="button" disabled={!hasFirstBodyImage} onClick={onApplyFirstBodyImage}>
          본문 첫 이미지 사용
        </ThumbnailButton>
        <ThumbnailButton type="button" data-variant="text" onClick={onResetThumbnailToAutoMode}>
          자동 모드로 되돌리기
        </ThumbnailButton>
      </MetaSecondaryActionRow>
      {thumbnailImageFileName ? <ThumbnailFieldHelp>선택 파일: {thumbnailImageFileName}</ThumbnailFieldHelp> : null}
    </PreviewEditorSection>
  )
}

const PreviewEditorSection = styled.div`
  display: grid;
  gap: 0.58rem;
  min-width: 0;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.gray2};
  padding: 0.85rem;
`

const PreviewEditorSectionHeader = styled.div`
  display: grid;
  gap: 0.14rem;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.86rem;
    font-weight: 700;
    line-height: 1.3;
  }

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.74rem;
    line-height: 1.45;
  }
`

const PreviewThumbFrame = styled.div`
  --preview-thumb-width: 100%;
  --preview-thumb-height: 100%;
  --preview-thumb-left: 0%;
  --preview-thumb-top: 0%;

  position: relative;
  width: min(100%, 360px);
  justify-self: start;
  aspect-ratio: 1.94 / 1;
  border-radius: ${({ theme }) => `${theme.variables.ui.card.radius}px`};
  border: ${({ theme }) => `${theme.variables.ui.card.borderWidth}px solid ${theme.colors.gray4}`};
  background: ${({ theme }) => theme.colors.gray4};
  overflow: hidden;
  user-select: none;
  isolation: isolate;

  &[data-draggable="true"] {
    cursor: grab;
    touch-action: none;
  }

  &[data-dragging="true"] {
    cursor: grabbing;
  }

  @media (max-width: 780px) {
    width: 100%;
  }

  img {
    position: absolute;
    display: block;
    pointer-events: none;
    user-select: none;
    touch-action: none;
    -webkit-user-drag: none;
    will-change: top, left, width, height;
  }

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0) 45%, rgba(0, 0, 0, 0.16) 100%);
    opacity: 0.9;
    pointer-events: none;
  }

  .placeholder {
    width: 100%;
    height: 100%;
    display: grid;
    place-content: center;
    text-align: center;
    gap: 0.24rem;
    padding: 0.7rem;

    em {
      font-style: normal;
      color: ${({ theme }) => theme.colors.gray10};
      font-weight: 700;
      font-size: 0.84rem;
    }

    span {
      color: ${({ theme }) => theme.colors.gray11};
      font-size: 0.74rem;
      line-height: 1.4;
    }
  }
`

const ThumbnailFieldLabel = styled.label`
  font-size: 0.8rem;
  font-weight: 650;
  color: ${({ theme }) => theme.colors.gray11};
`

const ThumbnailInput = styled.input`
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 8px;
  padding: 0.72rem 0.8rem;
  min-height: 44px;
  min-width: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: 0 0 0 4px ${({ theme }) => theme.colors.blue4};
  }
`

const ThumbnailButton = styled.button`
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

  &[data-variant="text"] {
    min-height: auto;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
  }

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.gray8};
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &[data-variant="text"]:hover:not(:disabled) {
    border-color: transparent;
    background: transparent;
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

const ThumbnailPrimaryButton = styled(ThumbnailButton)`
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

const ZoomControlRow = styled.div`
  display: grid;
  gap: 0.42rem;
  align-items: start;
  justify-items: start;
  width: min(100%, 360px);

  @media (max-width: 780px) {
    width: 100%;
  }
`

const ZoomRangeInput = styled.input`
  width: 100%;
  accent-color: ${({ theme }) => theme.colors.blue9};
`

const ZoomValue = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  padding: 0 0.55rem;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.78rem;
  line-height: 1;
  font-weight: 700;
`

const ZoomControlMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
`

const ThumbnailSourceStatus = styled.span`
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 24px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  padding: 0 0.54rem;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1;

  &[data-tone="manual"] {
    border-color: ${({ theme }) => theme.colors.blue7};
    background: ${({ theme }) => theme.colors.blue3};
    color: ${({ theme }) => theme.colors.blue11};
  }

  &[data-tone="auto"] {
    border-color: ${({ theme }) => theme.colors.green7};
    background: ${({ theme }) => theme.colors.green3};
    color: ${({ theme }) => theme.colors.green11};
  }
`

const MetaPrimaryActionRow = styled.div`
  display: grid;

  > button {
    width: 100%;
    justify-content: center;
    text-align: center;
    white-space: normal;
    line-height: 1.32;
  }
`

const MetaSecondaryActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.55rem;

  > button:first-of-type {
    flex: 1 1 11rem;
  }

  > button[data-variant="text"] {
    flex: 0 0 auto;
    text-align: left;
  }
`

const ThumbnailFieldHelp = styled.span`
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
