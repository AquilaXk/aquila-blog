import styled from "@emotion/styled"
import { Node, mergeAttributes } from "@tiptap/core"
import { NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react"
import {
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import useMermaidEffect from "src/libs/markdown/hooks/useMermaidEffect"
import type { CalloutKind } from "src/libs/markdown/rendering"
import { clampImageWidthPx, normalizeImageAlign } from "src/libs/markdown/rendering"
import { extractNormalizedMermaidSource } from "src/libs/markdown/mermaid"

const RAW_BLOCK_REASON_LABELS: Record<string, string> = {
  "unsupported-mermaid": "Mermaid 원문 블록",
  "unsupported-callout": "콜아웃 원문 블록",
  "unsupported-toggle": "토글 원문 블록",
  "manual-raw": "원문 블록",
}

const IMAGE_ALIGN_OPTIONS = [
  { value: "left", label: "좌측" },
  { value: "center", label: "가운데" },
  { value: "wide", label: "와이드" },
  { value: "full", label: "전체 폭" },
] as const

const CALLOUT_KIND_OPTIONS: Array<{ value: CalloutKind; label: string }> = [
  { value: "tip", label: "TIP" },
  { value: "info", label: "INFO" },
  { value: "warning", label: "WARNING" },
  { value: "outline", label: "OUTLINE" },
  { value: "example", label: "EXAMPLE" },
  { value: "summary", label: "SUMMARY" },
]

const DEFAULT_IMAGE_WIDTH = 720
const RESIZE_MIN_WIDTH = 240
const TEXTAREA_DEBOUNCE_MS = 180
const MERMAID_PREVIEW_ROOT_MARGIN = "240px 0px"
const MERMAID_TEMPLATE = ["flowchart TD", "  A[사용자 요청] --> B{검증}", "  B -->|OK| C[처리]", "  B -->|Fail| D[오류 반환]"].join(
  "\n"
)

const useAutosizeTextarea = (ref: { current: HTMLTextAreaElement | null }, value: string) => {
  useEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.height = "0px"
    element.style.height = `${Math.max(element.scrollHeight, 88)}px`
  }, [ref, value])
}

const useDebouncedAttributeCommit = (
  updateAttributes: NodeViewProps["updateAttributes"],
  delay = TEXTAREA_DEBOUNCE_MS
) => {
  const debounceRef = useRef<number | null>(null)
  const latestAttrsRef = useRef<Record<string, unknown> | null>(null)

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current)
      }
    }
  }, [])

  const cancel = () => {
    if (typeof window !== "undefined" && debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
  }

  const flush = () => {
    if (!latestAttrsRef.current) return
    cancel()
    updateAttributes(latestAttrsRef.current)
    latestAttrsRef.current = null
  }

  const schedule = (attrs: Record<string, unknown>) => {
    latestAttrsRef.current = attrs
    if (typeof window === "undefined") {
      updateAttributes(attrs)
      return
    }

    cancel()

    debounceRef.current = window.setTimeout(() => {
      if (latestAttrsRef.current) {
        updateAttributes(latestAttrsRef.current)
        latestAttrsRef.current = null
      }
      debounceRef.current = null
    }, delay)
  }

  return {
    schedule,
    flush,
    cancel,
  }
}

const MermaidBlockView = ({ node, updateAttributes, selected }: NodeViewProps) => {
  const [draftSource, setDraftSource] = useState(String(node.attrs?.source || MERMAID_TEMPLATE))
  const [isPreviewVisible, setIsPreviewVisible] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previewRootRef = useRef<HTMLDivElement>(null)
  const { schedule: scheduleCommit, flush: flushCommit } = useDebouncedAttributeCommit(updateAttributes)

  useAutosizeTextarea(textareaRef, draftSource)

  useEffect(() => {
    setDraftSource(String(node.attrs?.source || MERMAID_TEMPLATE))
  }, [node.attrs?.source])

  useEffect(() => {
    const target = previewRootRef.current
    if (!target || typeof window === "undefined") return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsPreviewVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: MERMAID_PREVIEW_ROOT_MARGIN }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  const normalizedSource = useMemo(() => extractNormalizedMermaidSource(draftSource).trim(), [draftSource])
  useMermaidEffect(previewRootRef, `editor-mermaid:${normalizedSource}`, isPreviewVisible && normalizedSource.length > 0)

  return (
    <RichBlockWrapper data-selected={selected}>
      <RichBlockHeader>
        <div>
          <strong>Mermaid</strong>
          <span>본문에 저장될 원문과 미리보기를 함께 관리합니다.</span>
        </div>
      </RichBlockHeader>
      <BlockTextarea
        ref={textareaRef}
        value={draftSource}
        spellCheck={false}
        onBlur={flushCommit}
        onChange={(event) => {
          const nextValue = event.target.value
          setDraftSource(nextValue)
          scheduleCommit({ source: nextValue })
        }}
      />
      <MermaidPreviewCard ref={previewRootRef}>
        {normalizedSource ? (
          isPreviewVisible ? (
            <pre className="aq-mermaid" data-aq-mermaid="true" data-mermaid-rendered="pending">
              <code>{normalizedSource}</code>
              <div className="aq-mermaid-stage" />
            </pre>
          ) : (
            <MermaidPreviewPlaceholder>스크롤 구간에 들어오면 다이어그램 미리보기를 렌더합니다.</MermaidPreviewPlaceholder>
          )
        ) : (
          <MermaidPreviewPlaceholder>Mermaid 원문을 입력하면 다이어그램 미리보기가 표시됩니다.</MermaidPreviewPlaceholder>
        )}
      </MermaidPreviewCard>
    </RichBlockWrapper>
  )
}

const CalloutBlockView = ({ node, updateAttributes, selected }: NodeViewProps) => {
  const [draftKind, setDraftKind] = useState<CalloutKind>((node.attrs?.kind as CalloutKind) || "tip")
  const [draftTitle, setDraftTitle] = useState(String(node.attrs?.title || ""))
  const [draftBody, setDraftBody] = useState(String(node.attrs?.body || ""))
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const { schedule: scheduleCommit, flush: flushCommit } = useDebouncedAttributeCommit(updateAttributes)

  useAutosizeTextarea(bodyRef, draftBody)

  useEffect(() => {
    setDraftKind((node.attrs?.kind as CalloutKind) || "tip")
    setDraftTitle(String(node.attrs?.title || ""))
    setDraftBody(String(node.attrs?.body || ""))
  }, [node.attrs?.kind, node.attrs?.title, node.attrs?.body])

  const commit = (next: Partial<{ kind: CalloutKind; title: string; body: string }>) => {
    const nextAttrs = {
      kind: next.kind ?? draftKind,
      title: next.title ?? draftTitle,
      body: next.body ?? draftBody,
    }
    scheduleCommit(nextAttrs)
  }

  return (
    <CalloutEditorWrapper data-selected={selected} data-kind={draftKind}>
      <CalloutEditorMetaRow>
        <CalloutEditorLabel>
          <strong>콜아웃</strong>
          <span>GitHub callout</span>
        </CalloutEditorLabel>
        <BlockSelect
          value={draftKind}
          aria-label="콜아웃 종류"
          onChange={(event) => {
            const nextKind = event.target.value as CalloutKind
            setDraftKind(nextKind)
            commit({ kind: nextKind })
          }}
        >
          {CALLOUT_KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </BlockSelect>
      </CalloutEditorMetaRow>
      <BlockInput
        value={draftTitle}
        placeholder="제목"
        onBlur={flushCommit}
        onChange={(event) => {
          const nextTitle = event.target.value
          setDraftTitle(nextTitle)
          commit({ title: nextTitle })
        }}
      />
      <CompactBlockTextarea
        ref={bodyRef}
        value={draftBody}
        placeholder="핵심 내용"
        spellCheck={false}
        rows={2}
        onBlur={flushCommit}
        onChange={(event) => {
          const nextBody = event.target.value
          setDraftBody(nextBody)
          commit({ body: nextBody })
        }}
      />
      <CalloutPreviewCard data-kind={draftKind}>
        <CalloutPreviewBadge>{CALLOUT_KIND_OPTIONS.find((option) => option.value === draftKind)?.label}</CalloutPreviewBadge>
        {draftTitle ? <h4>{draftTitle}</h4> : null}
        <p>{draftBody || "핵심 내용을 입력하세요."}</p>
      </CalloutPreviewCard>
    </CalloutEditorWrapper>
  )
}

const ToggleBlockView = ({ node, updateAttributes, selected }: NodeViewProps) => {
  const [draftTitle, setDraftTitle] = useState(String(node.attrs?.title || "더 보기"))
  const [draftBody, setDraftBody] = useState(String(node.attrs?.body || ""))
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const { schedule: scheduleCommit, flush: flushCommit } = useDebouncedAttributeCommit(updateAttributes)

  useAutosizeTextarea(bodyRef, draftBody)

  useEffect(() => {
    setDraftTitle(String(node.attrs?.title || "더 보기"))
    setDraftBody(String(node.attrs?.body || ""))
  }, [node.attrs?.title, node.attrs?.body])

  const commit = (next: Partial<{ title: string; body: string }>) => {
    scheduleCommit({
      title: next.title ?? draftTitle,
      body: next.body ?? draftBody,
    })
  }

  return (
    <RichBlockWrapper data-selected={selected}>
      <RichBlockHeader>
        <div>
          <strong>토글</strong>
          <span>`:::toggle 제목` canonical markdown로 저장됩니다.</span>
        </div>
      </RichBlockHeader>
      <BlockInput
        value={draftTitle}
        placeholder="토글 제목"
        onBlur={flushCommit}
        onChange={(event) => {
          const nextTitle = event.target.value
          setDraftTitle(nextTitle)
          commit({ title: nextTitle })
        }}
      />
      <BlockTextarea
        ref={bodyRef}
        value={draftBody}
        placeholder="토글 내부 본문"
        spellCheck={false}
        onBlur={flushCommit}
        onChange={(event) => {
          const nextBody = event.target.value
          setDraftBody(nextBody)
          commit({ body: nextBody })
        }}
      />
      <TogglePreviewCard open={isPreviewOpen}>
        <summary
          onClick={(event) => {
            event.preventDefault()
            setIsPreviewOpen((prev) => !prev)
          }}
        >
          {draftTitle || "더 보기"}
        </summary>
        {isPreviewOpen ? <p>{draftBody || "토글 내부 본문을 입력하세요."}</p> : null}
      </TogglePreviewCard>
    </RichBlockWrapper>
  )
}

const RawMarkdownBlockView = ({ node, updateAttributes, selected }: NodeViewProps) => {
  const [draft, setDraft] = useState(String(node.attrs?.markdown || ""))
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const reason = String(node.attrs?.reason || "manual-raw")
  const { schedule: scheduleCommit, flush: flushCommit } = useDebouncedAttributeCommit(updateAttributes, 220)

  useAutosizeTextarea(textareaRef, draft)

  useEffect(() => {
    setDraft(String(node.attrs?.markdown || ""))
  }, [node.attrs?.markdown])

  return (
    <RawBlockWrapper data-selected={selected}>
      <RawBlockHeader>
        <strong>{RAW_BLOCK_REASON_LABELS[reason] || "원문 블록"}</strong>
        <span>지원되지 않는 문법은 원문 그대로 보존합니다.</span>
      </RawBlockHeader>
      <BlockTextarea
        ref={textareaRef}
        value={draft}
        onBlur={flushCommit}
        onChange={(event) => {
          const nextValue = event.target.value
          setDraft(nextValue)
          scheduleCommit({ markdown: nextValue })
        }}
        spellCheck={false}
      />
    </RawBlockWrapper>
  )
}

const ResizableImageView = ({ node, updateAttributes, selected }: NodeViewProps) => {
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

export const MermaidBlock = Node.create({
  name: "mermaidBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  isolating: true,

  addAttributes() {
    return {
      source: {
        default: MERMAID_TEMPLATE,
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-mermaid-block]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-mermaid-block": "true" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidBlockView)
  },
})

export const CalloutBlock = Node.create({
  name: "calloutBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  isolating: true,

  addAttributes() {
    return {
      kind: {
        default: "tip",
      },
      title: {
        default: "",
      },
      body: {
        default: "",
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-callout-block]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-callout-block": "true" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutBlockView)
  },
})

export const ToggleBlock = Node.create({
  name: "toggleBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  isolating: true,

  addAttributes() {
    return {
      title: {
        default: "더 보기",
      },
      body: {
        default: "",
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-toggle-block]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-toggle-block": "true" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleBlockView)
  },
})

export const RawMarkdownBlock = Node.create({
  name: "rawMarkdownBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      markdown: {
        default: "",
      },
      reason: {
        default: "manual-raw",
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-raw-markdown-block]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-raw-markdown-block": "true" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(RawMarkdownBlockView)
  },
})

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

const sharedTextareaStyles = ({ minHeight = "6rem" }: { minHeight?: string } = {}) => `
  min-height: ${minHeight};
  width: 100%;
  resize: none;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.95rem;
  background: rgba(10, 12, 16, 0.92);
  color: var(--color-gray12);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 0.88rem;
  line-height: 1.6;
  padding: 1rem;
`

const BlockInput = styled.input`
  min-height: 2.75rem;
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.95rem;
  background: rgba(10, 12, 16, 0.92);
  color: var(--color-gray12);
  font-size: 0.94rem;
  font-weight: 600;
  padding: 0 1rem;
`

const BlockTextarea = styled.textarea<{ rows?: number }>`
  ${({ rows }) =>
    sharedTextareaStyles({ minHeight: rows ? `${Math.max(Number(rows) * 1.8, 6)}rem` : "6rem" })}
`

const CompactBlockTextarea = styled(BlockTextarea)`
  min-height: 4.5rem;
  padding: 0.9rem 1rem;
  font-size: 0.9rem;
  line-height: 1.55;
`

const BlockSelect = styled.select`
  min-height: 2.2rem;
  min-width: 8rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(10, 12, 16, 0.92);
  color: var(--color-gray12);
  font-size: 0.82rem;
  font-weight: 700;
  padding: 0 0.95rem;
`

const RichBlockWrapper = styled(NodeViewWrapper)`
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  margin: 1rem 0;
  border: 1px solid rgba(96, 165, 250, 0.18);
  border-radius: 1rem;
  background: rgba(18, 21, 26, 0.94);
  padding: 1rem;

  &[data-selected="true"] {
    border-color: rgba(59, 130, 246, 0.44);
    box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.14);
  }
`

const RichBlockHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;

  strong {
    display: block;
    font-size: 0.95rem;
    color: var(--color-gray12);
  }

  span {
    display: block;
    margin-top: 0.2rem;
    font-size: 0.82rem;
    color: var(--color-gray10);
  }
`

const MermaidPreviewCard = styled.div`
  min-height: 8rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1rem;
  background: rgba(13, 15, 18, 0.96);
  padding: 0.85rem;

  .aq-mermaid {
    margin: 0;
  }
`

const MermaidPreviewPlaceholder = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 6rem;
  color: var(--color-gray10);
  font-size: 0.84rem;
  text-align: center;
`

const CalloutPreviewCard = styled.div`
  border-radius: 0.95rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 0.8rem 0.9rem;

  h4 {
    margin: 0.55rem 0 0.18rem;
    font-size: 0.92rem;
    color: var(--color-gray12);
  }

  p {
    margin: 0;
    color: var(--color-gray10);
    white-space: pre-wrap;
    font-size: 0.86rem;
    line-height: 1.5;
  }

  &[data-kind="tip"] {
    background: rgba(34, 197, 94, 0.08);
    border-color: rgba(34, 197, 94, 0.2);

    strong {
      background: rgba(34, 197, 94, 0.12);
      color: #86efac;
    }
  }

  &[data-kind="info"] {
    background: rgba(59, 130, 246, 0.08);
    border-color: rgba(59, 130, 246, 0.2);

    strong {
      background: rgba(59, 130, 246, 0.14);
      color: #93c5fd;
    }
  }

  &[data-kind="warning"] {
    background: rgba(245, 158, 11, 0.08);
    border-color: rgba(245, 158, 11, 0.2);

    strong {
      background: rgba(245, 158, 11, 0.14);
      color: #fcd34d;
    }
  }

  &[data-kind="outline"] {
    background: rgba(148, 163, 184, 0.08);
    border-color: rgba(148, 163, 184, 0.2);

    strong {
      background: rgba(148, 163, 184, 0.14);
      color: #cbd5e1;
    }
  }

  &[data-kind="example"] {
    background: rgba(16, 185, 129, 0.08);
    border-color: rgba(16, 185, 129, 0.2);

    strong {
      background: rgba(16, 185, 129, 0.14);
      color: #6ee7b7;
    }
  }

  &[data-kind="summary"] {
    background: rgba(168, 85, 247, 0.08);
    border-color: rgba(168, 85, 247, 0.2);

    strong {
      background: rgba(168, 85, 247, 0.14);
      color: #d8b4fe;
    }
  }
`

const CalloutPreviewBadge = styled.strong`
  display: inline-flex;
  min-height: 1.65rem;
  align-items: center;
  border-radius: 999px;
  padding: 0 0.7rem;
  font-size: 0.74rem;
  letter-spacing: 0.04em;
`

const CalloutEditorWrapper = styled(NodeViewWrapper)`
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin: 0.85rem 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1rem;
  background: rgba(18, 21, 26, 0.92);
  padding: 0.85rem 0.9rem;

  &[data-selected="true"] {
    border-color: rgba(59, 130, 246, 0.42);
    box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.12);
  }

  &[data-kind="tip"] {
    border-color: rgba(34, 197, 94, 0.22);
  }

  &[data-kind="info"] {
    border-color: rgba(59, 130, 246, 0.22);
  }

  &[data-kind="warning"] {
    border-color: rgba(245, 158, 11, 0.24);
  }

  &[data-kind="outline"] {
    border-color: rgba(148, 163, 184, 0.22);
  }

  &[data-kind="example"] {
    border-color: rgba(16, 185, 129, 0.22);
  }

  &[data-kind="summary"] {
    border-color: rgba(168, 85, 247, 0.22);
  }
`

const CalloutEditorMetaRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
`

const CalloutEditorLabel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.08rem;

  strong {
    font-size: 0.88rem;
    color: var(--color-gray12);
    line-height: 1.1;
  }

  span {
    font-size: 0.74rem;
    color: var(--color-gray10);
    line-height: 1.1;
  }
`

const TogglePreviewCard = styled.details`
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1rem;
  background: rgba(13, 15, 18, 0.96);
  padding: 0.15rem 0.15rem 0.65rem;

  summary {
    cursor: pointer;
    list-style: none;
    padding: 0.85rem 0.95rem;
    font-weight: 700;
    color: var(--color-gray12);

    &::-webkit-details-marker {
      display: none;
    }
  }

  p {
    margin: 0;
    padding: 0 0.95rem 0.1rem;
    color: var(--color-gray11);
    white-space: pre-wrap;
  }
`

const RawBlockWrapper = styled(NodeViewWrapper)`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin: 1rem 0;
  border: 1px solid rgba(96, 165, 250, 0.22);
  border-radius: 1rem;
  background: rgba(18, 21, 26, 0.94);
  box-shadow: inset 0 0 0 1px rgba(96, 165, 250, 0.06);
  padding: 1rem;

  &[data-selected="true"] {
    border-color: rgba(59, 130, 246, 0.54);
    box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.16);
  }
`

const RawBlockHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;

  strong {
    font-size: 0.95rem;
    color: var(--color-gray12);
  }

  span {
    font-size: 0.82rem;
    color: var(--color-gray10);
  }
`

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
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(18, 21, 26, 0.95);
  color: var(--color-gray10);
  font-size: 0.82rem;
  font-weight: 700;
  padding: 0 0.85rem;

  &[data-active="true"] {
    border-color: rgba(59, 130, 246, 0.54);
    background: rgba(37, 99, 235, 0.18);
    color: #93c5fd;
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
