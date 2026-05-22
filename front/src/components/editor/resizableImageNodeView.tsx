
import styled from "@emotion/styled"
import { Node, mergeAttributes } from "@tiptap/core"
import { type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react"
import { PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react"
import { clampImageWidthPx, normalizeImageAlign } from "src/libs/markdown/rendering"

const IMAGE_ALIGN_OPTIONS = [
  { value: "left", label: "좌측" },
  { value: "center", label: "가운데" },
  { value: "wide", label: "와이드" },
  { value: "full", label: "전체 폭" },
] as const

const DEFAULT_IMAGE_WIDTH = 720
const RESIZE_MIN_WIDTH = 240

export const ResizableImageView = ({ node, updateAttributes, selected }: NodeViewProps) => {
  const frameRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<{
    pointerId: number
    startX: number
    startWidth: number
  } | null>(null)
  const rafRef = useRef<number | null>(null)
  const draftWidthRef = useRef<number | null>(null)
  const [draftWidth, setDraftWidth] = useState<number | null>(null)

  const align = normalizeImageAlign(String(node.attrs?.align || "")) || "center"
  const persistedWidth =
    typeof node.attrs?.widthPx === "number" ? clampImageWidthPx(Number(node.attrs.widthPx)) : null
  const effectiveWidth = draftWidth ?? persistedWidth ?? DEFAULT_IMAGE_WIDTH

  useEffect(() => {
    if (!draggingRef.current) {
      setDraftWidth(null)
      draftWidthRef.current = null
    }
  }, [node.attrs?.widthPx])

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
      }
    }
  }, [])

  const commitDraftWidth = () => {
    const nextWidth = draftWidthRef.current ?? persistedWidth ?? DEFAULT_IMAGE_WIDTH
    setDraftWidth(null)
    draftWidthRef.current = null
    updateAttributes({ widthPx: clampImageWidthPx(nextWidth) })
  }

  const handlePointerMove = (event: PointerEvent) => {
    const activeDrag = draggingRef.current
    if (!activeDrag) return
    const frameWidth = frameRef.current?.clientWidth || DEFAULT_IMAGE_WIDTH
    const nextWidth = clampImageWidthPx(
      Math.min(
        frameWidth,
        Math.max(RESIZE_MIN_WIDTH, activeDrag.startWidth + (event.clientX - activeDrag.startX))
      )
    )
    draftWidthRef.current = nextWidth
    if (typeof window !== "undefined" && rafRef.current === null) {
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null
        setDraftWidth(draftWidthRef.current)
      })
    }
  }

  const finalizePointer = () => {
    draggingRef.current = null
    commitDraftWidth()
    if (typeof window !== "undefined") {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", finalizePointer)
      window.removeEventListener("pointercancel", finalizePointer)
    }
  }

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()

    const frameWidth = frameRef.current?.clientWidth || DEFAULT_IMAGE_WIDTH
    draggingRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: Math.min(frameWidth, effectiveWidth),
    }

    if (typeof window !== "undefined") {
      window.addEventListener("pointermove", handlePointerMove)
      window.addEventListener("pointerup", finalizePointer)
      window.addEventListener("pointercancel", finalizePointer)
    }
  }

  const imageStyle = useMemo(() => {
    const widthStyle =
      align === "full"
        ? "100%"
        : align === "wide"
          ? `min(100%, ${Math.max(effectiveWidth, 860)}px)`
          : `${effectiveWidth}px`

    return {
      width: widthStyle,
      maxWidth: "100%",
    }
  }, [align, effectiveWidth])

  return (
    <ImageBlockWrapper data-selected={selected} data-align={align}>
      <ImageToolbar>
        <ImageToolbarGroup>
          {IMAGE_ALIGN_OPTIONS.map((option) => (
            <ImageToolbarButton
              key={option.value}
              type="button"
              data-active={align === option.value}
              onClick={() => updateAttributes({ align: option.value })}
            >
              {option.label}
            </ImageToolbarButton>
          ))}
        </ImageToolbarGroup>
        <ImageToolbarMeta>{`${Math.round(effectiveWidth)}px`}</ImageToolbarMeta>
      </ImageToolbar>
      <ImageFrame ref={frameRef} data-align={align}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={String(node.attrs?.src || "")}
          alt={String(node.attrs?.alt || "")}
          title={String(node.attrs?.title || "")}
          style={imageStyle}
          draggable={false}
        />
        <ImageResizeHandle
          type="button"
          aria-label="이미지 폭 조절"
          onPointerDown={handleResizePointerDown}
        />
      </ImageFrame>
    </ImageBlockWrapper>
  )
}

export const ResizableImage = Node.create({
  name: "resizableImage",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  isolating: true,

  addAttributes() {
    return {
      src: {
        default: "",
      },
      alt: {
        default: "",
      },
      title: {
        default: "",
      },
      widthPx: {
        default: null,
      },
      align: {
        default: "center",
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-resizable-image]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-resizable-image": "true" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView)
  },
})

const ImageBlockWrapper = styled(NodeViewWrapper)`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin: 1.25rem 0;
`

const ImageToolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
`

const ImageToolbarGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`

const ImageToolbarButton = styled.button`
  min-height: 2rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.08)")};
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(18, 21, 26, 0.95)")};
  color: var(--color-gray10);
  font-size: 0.82rem;
  font-weight: 700;
  padding: 0 0.85rem;

  &[data-active="true"] {
    border-color: ${({ theme }) => (theme.scheme === "light" ? "rgba(37, 99, 235, 0.42)" : "rgba(59, 130, 246, 0.54)")};
    background: ${({ theme }) => (theme.scheme === "light" ? "rgba(37, 99, 235, 0.1)" : "rgba(37, 99, 235, 0.18)")};
    color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.blue9 : "#93c5fd")};
  }
`

const ImageToolbarMeta = styled.span`
  font-size: 0.82rem;
  color: var(--color-gray10);
`

const ImageFrame = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  padding-bottom: 1.1rem;

  &[data-align="left"] {
    justify-content: flex-start;
  }

  &[data-align="center"],
  &[data-align="wide"],
  &[data-align="full"] {
    justify-content: center;
  }

  img {
    display: block;
    border-radius: 1rem;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.22);
    user-select: none;
  }
`

const ImageResizeHandle = styled.button`
  position: absolute;
  right: calc(50% - 1rem);
  bottom: 0;
  width: 2rem;
  height: 0.5rem;
  border: 0;
  border-radius: 999px;
  background: rgba(96, 165, 250, 0.92);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12);
  cursor: ew-resize;
`

export const ResizableImageNodeViewStyles = {
  ImageBlockWrapper,
  ImageToolbar,
  ImageToolbarGroup,
  ImageToolbarButton,
  ImageToolbarMeta,
  ImageFrame,
  ImageResizeHandle,
}
