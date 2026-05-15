import type { PointerEventHandler, Ref } from "react"
import AppIcon from "src/components/icons/AppIcon"
import { PROFILE_IMAGE_EDIT_MAX_ZOOM, PROFILE_IMAGE_EDIT_MIN_ZOOM } from "src/libs/profileImageUpload"
import {
  GhostButton,
  ModalActions,
  ModalCard,
  ModalCloseButton,
  ModalConstraintList,
  ModalEditorFrame,
  ModalEmptyState,
  ModalFooter,
  ModalHeader,
  ModalNotice,
  ModalOverlay,
  ModalSliderWrap,
  PrimaryButton,
} from "src/routes/Admin/AdminProfileWorkspace.styles"

type ModalNoticeTone = "idle" | "loading" | "success" | "error"

export type AdminProfileImageEditorModalProps = {
  frameRef: Ref<HTMLDivElement>
  hasDraftFile: boolean
  isDragging: boolean
  isUploading: boolean
  notice: {
    tone: ModalNoticeTone
    text: string
  }
  onApply: () => void
  onClear: () => void
  onPointerCancel: PointerEventHandler<HTMLDivElement>
  onPointerDown: PointerEventHandler<HTMLDivElement>
  onPointerMove: PointerEventHandler<HTMLDivElement>
  onPointerUp: PointerEventHandler<HTMLDivElement>
  onRequestClose: () => void
  onSelectFile: () => void
  onZoomChange: (zoom: number) => void
  previewUrl: string
  zoom: number
}

export default function AdminProfileImageEditorModal({
  frameRef,
  hasDraftFile,
  isDragging,
  isUploading,
  notice,
  onApply,
  onClear,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onRequestClose,
  onSelectFile,
  onZoomChange,
  previewUrl,
  zoom,
}: AdminProfileImageEditorModalProps) {
  const closeWhenIdle = () => {
    if (isUploading) return
    onRequestClose()
  }

  return (
    <ModalOverlay
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          closeWhenIdle()
        }
      }}
    >
      <ModalCard role="dialog" aria-modal="true" aria-label="프로필 이미지 편집">
        <ModalHeader>
          <div>
            <h2>프로필 이미지 편집</h2>
          </div>
          <ModalCloseButton type="button" disabled={isUploading} onClick={closeWhenIdle}>
            <AppIcon name="close" />
          </ModalCloseButton>
        </ModalHeader>

        <ModalConstraintList>
          <li>지원 형식: JPG/PNG/GIF/WebP</li>
          <li>업로드 기준: 자동 최적화 후 최대 2MB</li>
        </ModalConstraintList>

        <ModalActions>
          <GhostButton type="button" onClick={onSelectFile} disabled={isUploading}>
            파일 선택
          </GhostButton>
          <GhostButton type="button" onClick={onClear} disabled={isUploading}>
            편집값 초기화
          </GhostButton>
        </ModalActions>

        {previewUrl ? (
          <>
            <ModalEditorFrame
              ref={frameRef}
              data-draggable={hasDraftFile ? "true" : "false"}
              data-dragging={isDragging ? "true" : "false"}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="프로필 편집 미리보기"
                loading="eager"
                decoding="async"
                style={{
                  objectFit: "cover",
                  width: "var(--profile-draft-width)",
                  height: "var(--profile-draft-height)",
                  left: "var(--profile-draft-left)",
                  top: "var(--profile-draft-top)",
                  maxWidth: "none",
                  transform: "translateZ(0)",
                }}
                draggable={false}
              />
            </ModalEditorFrame>

            <ModalSliderWrap>
              <label htmlFor="profile-image-zoom">확대/축소</label>
              <input
                id="profile-image-zoom"
                type="range"
                min={PROFILE_IMAGE_EDIT_MIN_ZOOM}
                max={PROFILE_IMAGE_EDIT_MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(event) => onZoomChange(Number(event.target.value))}
              />
              <span>{zoom.toFixed(2)}x</span>
            </ModalSliderWrap>
          </>
        ) : (
          <ModalEmptyState>먼저 프로필 이미지를 선택해주세요.</ModalEmptyState>
        )}

        {notice.text ? <ModalNotice data-tone={notice.tone}>{notice.text}</ModalNotice> : null}

        <ModalFooter>
          <GhostButton type="button" disabled={isUploading} onClick={closeWhenIdle}>
            취소
          </GhostButton>
          <PrimaryButton type="button" disabled={isUploading || !hasDraftFile} onClick={onApply}>
            {isUploading ? "저장 중..." : "편집 결과 저장"}
          </PrimaryButton>
        </ModalFooter>
      </ModalCard>
    </ModalOverlay>
  )
}
