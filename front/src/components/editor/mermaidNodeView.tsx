import styled from "@emotion/styled"
import { Node, mergeAttributes } from "@tiptap/core"
import { type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import useMermaidEffect from "src/libs/markdown/hooks/useMermaidEffect"
import { extractNormalizedMermaidSource } from "src/libs/markdown/mermaid"
import {
  MERMAID_TEMPLATE,
  MERMAID_VIEW_MODE_OPTIONS,
  type MermaidEditorViewMode,
  renderMermaidHighlightedSource,
  useAutosizeTextarea,
  useDebouncedAttributeCommit,
} from "./mermaidNodeViewModel"

export const MermaidBlockView = ({ node, updateAttributes, selected }: NodeViewProps) => {
  const [draftSource, setDraftSource] = useState(String(node.attrs?.source || MERMAID_TEMPLATE))
  const [viewMode, setViewMode] = useState<MermaidEditorViewMode>("split")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const codeHighlightRef = useRef<HTMLPreElement>(null)
  const previewRootRef = useRef<HTMLDivElement>(null)
  const scrollSyncFrameRef = useRef<number | null>(null)
  const { schedule: scheduleCommit, flush: flushCommit } = useDebouncedAttributeCommit(updateAttributes)

  useAutosizeTextarea(textareaRef, draftSource, selected)

  const syncCodePaneScroll = useCallback(() => {
    const textarea = textareaRef.current
    const highlight = codeHighlightRef.current
    if (!textarea || !highlight) return
    highlight.scrollTop = textarea.scrollTop
    highlight.scrollLeft = textarea.scrollLeft
  }, [])

  const queueCodePaneScrollSync = useCallback(() => {
    if (typeof window === "undefined") {
      syncCodePaneScroll()
      return
    }
    if (scrollSyncFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollSyncFrameRef.current)
    }
    scrollSyncFrameRef.current = window.requestAnimationFrame(() => {
      scrollSyncFrameRef.current = null
      syncCodePaneScroll()
    })
  }, [syncCodePaneScroll])

  useEffect(() => {
    queueCodePaneScrollSync()
  }, [draftSource, queueCodePaneScrollSync, viewMode])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea || typeof document === "undefined") return

    const syncSelectionScroll = () => {
      queueCodePaneScrollSync()
    }

    textarea.addEventListener("click", syncSelectionScroll)
    textarea.addEventListener("focus", syncSelectionScroll)
    textarea.addEventListener("keyup", syncSelectionScroll)
    textarea.addEventListener("mouseup", syncSelectionScroll)
    textarea.addEventListener("scroll", syncSelectionScroll)
    textarea.addEventListener("select", syncSelectionScroll)
    document.addEventListener("selectionchange", syncSelectionScroll)

    return () => {
      textarea.removeEventListener("click", syncSelectionScroll)
      textarea.removeEventListener("focus", syncSelectionScroll)
      textarea.removeEventListener("keyup", syncSelectionScroll)
      textarea.removeEventListener("mouseup", syncSelectionScroll)
      textarea.removeEventListener("scroll", syncSelectionScroll)
      textarea.removeEventListener("select", syncSelectionScroll)
      document.removeEventListener("selectionchange", syncSelectionScroll)
    }
  }, [queueCodePaneScrollSync])

  useEffect(() => {
    return () => {
      if (typeof window === "undefined") return
      if (scrollSyncFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollSyncFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    setDraftSource(String(node.attrs?.source || MERMAID_TEMPLATE))
  }, [node.attrs?.source])

  const showCodePane = viewMode !== "preview"
  const showPreviewPane = viewMode !== "code"

  const normalizedSource = useMemo(() => extractNormalizedMermaidSource(draftSource).trim(), [draftSource])
  const highlightedSource = useMemo(() => renderMermaidHighlightedSource(draftSource), [draftSource])

  useMermaidEffect(
    previewRootRef,
    `editor-mermaid:${normalizedSource}`,
    showPreviewPane && normalizedSource.length > 0,
    { observeMutations: false, allowDesktopWideLane: false, lazyViewport: false }
  )

  return (
    <MermaidEditorWrapper data-selected={selected}>
      <MermaidEditorHeader>
        <MermaidWindowDots aria-hidden="true">
          <span data-tone="red" />
          <span data-tone="yellow" />
          <span data-tone="green" />
        </MermaidWindowDots>
        <MermaidEditorTitleGroup>
          <strong>Mermaid</strong>
        </MermaidEditorTitleGroup>
        <MermaidViewModeRail role="tablist" aria-label="Mermaid 보기 모드">
          {MERMAID_VIEW_MODE_OPTIONS.map((option) => (
            <MermaidViewModeButton
              key={option.value}
              type="button"
              role="tab"
              aria-selected={viewMode === option.value}
              data-active={viewMode === option.value}
              onClick={() => setViewMode(option.value)}
            >
              {option.label}
            </MermaidViewModeButton>
          ))}
        </MermaidViewModeRail>
      </MermaidEditorHeader>
      <MermaidEditorBody>
        {showCodePane ? (
          <MermaidCodePane>
            <MermaidPaneLabel>Mermaid 코드</MermaidPaneLabel>
            <MermaidCodeEditorShell data-view-mode={viewMode}>
              <MermaidCodeHighlight
                className="aq-mermaid-code-highlight"
                ref={codeHighlightRef}
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: highlightedSource }}
              />
              <MermaidCodeTextarea
                className="aq-mermaid-code-input"
                ref={textareaRef}
                value={draftSource}
                wrap="off"
                spellCheck={false}
                data-view-mode={viewMode}
                onBlur={() => {
                  flushCommit()
                }}
                onScroll={(event) => {
                  const target = event.currentTarget
                  if (codeHighlightRef.current) {
                    codeHighlightRef.current.scrollTop = target.scrollTop
                    codeHighlightRef.current.scrollLeft = target.scrollLeft
                  }
                }}
                onClick={queueCodePaneScrollSync}
                onChange={(event) => {
                  const nextValue = event.target.value
                  setDraftSource(nextValue)
                  scheduleCommit({ source: nextValue })
                  queueCodePaneScrollSync()
                }}
                onFocus={queueCodePaneScrollSync}
                onKeyUp={queueCodePaneScrollSync}
                onMouseUp={queueCodePaneScrollSync}
                onSelect={queueCodePaneScrollSync}
              />
            </MermaidCodeEditorShell>
          </MermaidCodePane>
        ) : null}
        {showPreviewPane ? (
          <MermaidPreviewPane ref={previewRootRef}>
            <MermaidPaneLabel>Mermaid 결과</MermaidPaneLabel>
            <MermaidPreviewCard data-view-mode={viewMode}>
              {normalizedSource ? (
                <pre
                  className="aq-mermaid"
                  data-aq-mermaid="true"
                  data-mermaid-rendered="pending"
                  data-mermaid-source={normalizedSource}
                />
              ) : (
                <MermaidPreviewPlaceholder>
                  Mermaid 코드를 입력하면 여기서 다이어그램 결과를 바로 확인할 수 있습니다.
                </MermaidPreviewPlaceholder>
              )}
            </MermaidPreviewCard>
          </MermaidPreviewPane>
        ) : null}
      </MermaidEditorBody>
    </MermaidEditorWrapper>
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

const MermaidBlockTextarea = styled.textarea<{ rows?: number }>`
  min-height: ${({ rows }) => (rows ? `${Math.max(Number(rows) * 1.8, 6)}rem` : "6rem")};
  width: 100%;
  resize: none;
  overflow: hidden;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.08)")};
  border-radius: 0.95rem;
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(10, 12, 16, 0.92)")};
  color: ${({ theme }) => theme.colors.gray12};
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 0.88rem;
  line-height: 1.6;
  padding: 1rem;
`

const MermaidPreviewCard = styled.div`
  height: clamp(14rem, 38vh, 22rem);
  min-height: 12rem;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.06)")};
  border-radius: 0.95rem;
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(10, 12, 16, 0.98)")};
  overflow: auto;
  overscroll-behavior: contain;
  padding: 0.95rem 1rem;
  scrollbar-width: thin;

  &[data-view-mode="preview"] {
    height: clamp(20rem, 62vh, 36rem);
  }

  .aq-mermaid {
    margin: 0;
    min-height: 100%;
  }

  .aq-mermaid-stage > svg foreignObject,
  .aq-mermaid-stage > svg .nodeLabel,
  .aq-mermaid-stage > svg .edgeLabel {
    overflow: visible;
  }

  .aq-mermaid-stage > svg .nodeLabel p,
  .aq-mermaid-stage > svg .edgeLabel p,
  .aq-mermaid-stage > svg .nodeLabel div,
  .aq-mermaid-stage > svg .edgeLabel div,
  .aq-mermaid-stage > svg .nodeLabel span,
  .aq-mermaid-stage > svg .edgeLabel span {
    margin: 0;
    line-height: 1.18;
    display: inline-block;
    box-sizing: border-box;
    padding-top: 0.08em;
    padding-bottom: 0.18em;
  }
`

const MermaidEditorWrapper = styled(NodeViewWrapper)`
  --aq-mermaid-block-radius: 14px;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  align-self: stretch;
  overflow: hidden;
  margin: 1rem 0;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.08)")};
  border-radius: var(--aq-mermaid-block-radius);
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "#2b2d3a")};
  position: relative;
  z-index: 0;
  background-clip: padding-box;

  &[data-selected="true"] {
    border-color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.blue7 : "rgba(148, 163, 184, 0.28)")};
    box-shadow: ${({ theme }) =>
      theme.scheme === "light" ? "0 0 0 1px rgba(59, 130, 246, 0.18)" : "0 0 0 1px rgba(226, 232, 240, 0.12)"};
  }
`

const MermaidEditorHeader = styled.div`
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.84rem 0.96rem 0.76rem;
  border-bottom: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.06)")};
  background: ${({ theme }) =>
    theme.scheme === "light" ? `linear-gradient(180deg, ${theme.colors.gray2}, ${theme.colors.gray3})` : "linear-gradient(180deg, #3a3f59, #363b54)"};
  border-top-left-radius: var(--aq-mermaid-block-radius);
  border-top-right-radius: var(--aq-mermaid-block-radius);
  overflow: hidden;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
`

const MermaidWindowDots = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;

  span {
    width: 0.92rem;
    height: 0.92rem;
    border-radius: 999px;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
  }

  span[data-tone="red"] {
    background: #ff5f56;
  }

  span[data-tone="yellow"] {
    background: #ffbd2e;
  }

  span[data-tone="green"] {
    background: #27c93f;
  }
`

const MermaidEditorTitleGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.14rem;
  min-width: 0;

  strong {
    display: block;
    color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray12 : "#f3f4f6")};
    font-size: 0.92rem;
    font-weight: 700;
  }

  span {
    color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray10 : "rgba(226, 232, 240, 0.64)")};
    font-size: 0.74rem;
    line-height: 1.4;
  }
`

const MermaidViewModeRail = styled.div`
  display: inline-flex;
  justify-self: end;
  align-items: center;
  gap: 0.22rem;
  padding: 0.24rem;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.1)")};
  border-radius: 0.82rem;
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(255, 255, 255, 0.035)")};

  @media (max-width: 720px) {
    justify-self: stretch;
    width: fit-content;
  }
`

const MermaidViewModeButton = styled.button`
  min-height: 2rem;
  border: 0;
  border-radius: 0.62rem;
  background: transparent;
  color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray10 : "rgba(226, 232, 240, 0.7)")};
  font-size: 0.74rem;
  font-weight: 700;
  padding: 0 0.66rem;

  &[data-active="true"] {
    background: ${({ theme }) => (theme.scheme === "light" ? "rgba(37, 99, 235, 0.1)" : "rgba(59, 130, 246, 0.16)")};
    color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.blue9 : "#eff6ff")};
    box-shadow: ${({ theme }) =>
      theme.scheme === "light" ? "inset 0 0 0 1px rgba(37, 99, 235, 0.28)" : "inset 0 0 0 1px rgba(96, 165, 250, 0.42)"};
  }
`

const MermaidEditorBody = styled.div`
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(19, 21, 26, 0.98)")};
`

const MermaidPaneLabel = styled.span`
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  min-height: 1.7rem;
  padding: 0 0.62rem;
  border-radius: 999px;
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray2 : "rgba(255, 255, 255, 0.05)")};
  color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray10 : "rgba(226, 232, 240, 0.82)")};
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.02em;
`

const MermaidCodePane = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.95rem 1rem 1rem;
  background: transparent;
`

const MermaidCodeEditorShell = styled.div`
  position: relative;
  height: 13rem;
  min-height: 13rem;
  border-radius: 0.95rem;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.06)")};
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(10, 12, 16, 0.98)")};
  overflow: hidden;

  &[data-view-mode="code"] {
    height: 22rem;
    min-height: 22rem;
  }
`

const MermaidCodeHighlight = styled.pre`
  position: absolute;
  inset: 0;
  margin: 0;
  overflow: auto;
  padding: 1rem;
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
  white-space: pre;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 0.97rem;
  line-height: 1.7;
  color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray11 : "#dbe2ea")};

  .line {
    display: block;
    min-height: calc(0.97rem * 1.7);
  }

  .token-keyword {
    color: ${({ theme }) => (theme.scheme === "light" ? "#0969da" : "#68b8ff")};
  }

  .token-string {
    color: ${({ theme }) => (theme.scheme === "light" ? "#1a7f37" : "#c7ea61")};
  }

  .token-operator {
    color: ${({ theme }) => (theme.scheme === "light" ? "#9a6700" : "#ffc857")};
  }

  .token-comment {
    color: ${({ theme }) => (theme.scheme === "light" ? "#6e7781" : "rgba(148, 163, 184, 0.88)")};
  }
`

const MermaidCodeTextarea = styled(MermaidBlockTextarea)`
  position: relative;
  z-index: 1;
  height: 100% !important;
  min-height: 13rem;
  overflow: auto;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: transparent !important;
  caret-color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray12 : "#f8fafc")};
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 0.97rem;
  line-height: 1.7;
  white-space: pre;
  word-break: normal;
  overflow-wrap: normal;
  box-shadow: none;
  text-shadow: none;
  -webkit-text-fill-color: transparent !important;

  &[data-view-mode="code"] {
    height: 22rem !important;
    min-height: 22rem;
  }

  &::selection {
    background: rgba(59, 130, 246, 0.28);
    color: transparent !important;
    -webkit-text-fill-color: transparent !important;
  }

  &::-moz-selection {
    background: rgba(59, 130, 246, 0.28);
    color: transparent !important;
  }
`

const MermaidPreviewPane = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.95rem 1rem 1rem;
  border-top: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.06)")};
  background: transparent;
`

const MermaidPreviewPlaceholder = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 6rem;
  color: var(--color-gray10);
  font-size: 0.78rem;
  text-align: center;
`

export const MermaidEditorStyles = {
  MermaidCodeEditorShell,
  MermaidCodeHighlight,
  MermaidCodePane,
  MermaidCodeTextarea,
  MermaidEditorBody,
  MermaidEditorHeader,
  MermaidEditorTitleGroup,
  MermaidEditorWrapper,
  MermaidPaneLabel,
  MermaidPreviewCard,
  MermaidPreviewPane,
  MermaidPreviewPlaceholder,
  MermaidViewModeButton,
  MermaidViewModeRail,
  MermaidWindowDots,
}
