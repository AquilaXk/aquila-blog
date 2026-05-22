import { memo, type CSSProperties, useEffect, useRef, useState } from "react"
import type { MarkdownImageFigureProps } from "src/libs/markdown/MarkdownRenderer.types"

export const MarkdownImageFigure = memo(
  ({ alt, src, widthPx, eager = false, editable = false, imageIndex, onWidthCommit }: MarkdownImageFigureProps) => {
    const frameRef = useRef<HTMLElement>(null)
    const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null)
    const liveWidthRef = useRef<number | null>(null)
    const [draftWidthPx, setDraftWidthPx] = useState<number | null>(null)

    useEffect(() => {
      setDraftWidthPx(null)
      liveWidthRef.current = null
    }, [src, widthPx])

    const effectiveWidthPx = draftWidthPx ?? widthPx
    const frameStyle = effectiveWidthPx
      ? ({ "--aq-image-width": `${effectiveWidthPx}px` } as CSSProperties)
      : undefined

    return (
      <figure
        ref={frameRef}
        className="aq-image-frame"
        data-width-mode={effectiveWidthPx ? "custom" : "default"}
        data-editable={editable ? "true" : "false"}
        style={frameStyle}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt || ""}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
          draggable={false}
        />
        {editable ? (
          <button
            type="button"
            className="aq-image-resize-handle"
            aria-label="이미지 폭 조절"
            onPointerDown={(event) => {
              if (!frameRef.current) return
              const containerWidth = frameRef.current.parentElement?.clientWidth ?? frameRef.current.clientWidth
              const currentWidth =
                draftWidthPx ??
                widthPx ??
                Math.min(frameRef.current.getBoundingClientRect().width, containerWidth || 960)

              dragStateRef.current = {
                startX: event.clientX,
                startWidth: currentWidth,
              }

              const handlePointerMove = (moveEvent: PointerEvent) => {
                const activeDrag = dragStateRef.current
                if (!activeDrag) return
                const nextWidth = Math.min(
                  Math.max(activeDrag.startWidth + (moveEvent.clientX - activeDrag.startX), 180),
                  Math.max(240, containerWidth || activeDrag.startWidth)
                )
                liveWidthRef.current = Math.round(nextWidth)
                setDraftWidthPx(Math.round(nextWidth))
              }

              const handlePointerUp = () => {
                window.removeEventListener("pointermove", handlePointerMove)
                window.removeEventListener("pointerup", handlePointerUp)
                const nextWidth = liveWidthRef.current ?? widthPx ?? currentWidth
                dragStateRef.current = null
                liveWidthRef.current = null
                setDraftWidthPx(null)
                onWidthCommit?.({ src, alt, index: imageIndex, widthPx: nextWidth })
              }

              window.addEventListener("pointermove", handlePointerMove)
              window.addEventListener("pointerup", handlePointerUp, { once: true })
            }}
          >
            <span />
          </button>
        ) : null}
        {alt ? <figcaption>{alt}</figcaption> : null}
      </figure>
    )
  }
)

MarkdownImageFigure.displayName = "MarkdownImageFigure"
