import styled from "@emotion/styled"
import { Node, mergeAttributes } from "@tiptap/core"
import { type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import useMermaidEffect from "src/libs/markdown/hooks/useMermaidEffect"
import { extractNormalizedMermaidSource } from "src/libs/markdown/mermaid"

const TEXTAREA_DEBOUNCE_MS = 180
const MERMAID_TEMPLATE = ["flowchart TD", "  A[사용자 요청] --> B{검증}", "  B -->|OK| C[처리]", "  B -->|Fail| D[오류 반환]"].join(
  "\n"
)

type MermaidEditorViewMode = "code" | "split" | "preview"

const MERMAID_VIEW_MODE_OPTIONS: Array<{ value: MermaidEditorViewMode; label: string }> = [
  { value: "code", label: "코드 보기" },
  { value: "split", label: "코드+Mermaid 보기" },
  { value: "preview", label: "Mermaid 보기" },
]

const MERMAID_KEYWORD_REGEX =
  /\b(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|subgraph|end|direction|classDef|class|style|linkStyle|click)\b/g
const MERMAID_ARROW_TOKENS = [
  "<-->",
  "-.->",
  "==>",
  "-->",
  "---",
  "--x",
  "x--",
  "o--",
  "--o",
  "<--",
  "<->",
  "=>",
  "<=",
  "==",
  "||",
  ":::",
  "::",
] as const
const MERMAID_ARROW_TOKENS_BY_LENGTH = [...MERMAID_ARROW_TOKENS].sort(
  (left, right) => right.length - left.length
)
const MERMAID_STRING_REGEX = /"[^"\n]*"|'[^'\n]*'/g
const MERMAID_COMMENT_REGEX = /^\s*%%.*$/

const escapeEditorHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")

const highlightMermaidLine = (rawLine: string) => {
  if (!rawLine.length) return ""
  if (MERMAID_COMMENT_REGEX.test(rawLine)) {
    return `<span class="token-comment">${escapeEditorHtml(rawLine)}</span>`
  }

  const matches: Array<{ start: number; end: number; className: string }> = []
  const pushRegexMatches = (regex: RegExp, className: string) => {
    regex.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = regex.exec(rawLine)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        className,
      })
    }
  }
  const pushTokenMatches = (tokens: readonly string[], className: string) => {
    tokens.forEach((token) => {
      let cursor = 0
      while (cursor < rawLine.length) {
        const start = rawLine.indexOf(token, cursor)
        if (start < 0) break
        matches.push({
          start,
          end: start + token.length,
          className,
        })
        cursor = start + token.length
      }
    })
  }

  pushRegexMatches(MERMAID_STRING_REGEX, "token-string")
  pushTokenMatches(MERMAID_ARROW_TOKENS_BY_LENGTH, "token-operator")
  pushRegexMatches(MERMAID_KEYWORD_REGEX, "token-keyword")

  matches.sort((left, right) => {
    if (left.start !== right.start) return left.start - right.start
    return right.end - left.end
  })

  let cursor = 0
  let html = ""
  for (const token of matches) {
    if (token.start < cursor) continue
    html += escapeEditorHtml(rawLine.slice(cursor, token.start))
    html += `<span class="${token.className}">${escapeEditorHtml(rawLine.slice(token.start, token.end))}</span>`
    cursor = token.end
  }
  html += escapeEditorHtml(rawLine.slice(cursor))
  return html
}

const renderMermaidHighlightedSource = (source: string) =>
  source
    .split("\n")
    .map((line) => `<span class="line">${highlightMermaidLine(line) || "<br />"}</span>`)
    .join("")

const useAutosizeTextarea = (
  ref: { current: HTMLTextAreaElement | null },
  value: string,
  layoutVersion?: string | number | boolean
) => {
  const rafIdRef = useRef<number | null>(null)
  const metricsRef = useRef<{
    rows: number
    minHeightFromRows: number
  }>({
    rows: Number.NaN,
    minHeightFromRows: 0,
  })
  const previousLayoutVersionRef = useRef<string | number | boolean | undefined>(undefined)

  const cancelQueuedSync = useCallback(() => {
    if (typeof window === "undefined") return
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
  }, [])

  const syncHeight = useCallback((remeasureBase = false) => {
    const element = ref.current
    if (!element) return
    const rows = Number(element.getAttribute("rows") || 0)
    if (remeasureBase || metricsRef.current.rows !== rows) {
      const computedStyle = window.getComputedStyle(element)
      const lineHeight = Number.parseFloat(computedStyle.lineHeight || "0")
      const paddingBlock =
        Number.parseFloat(computedStyle.paddingTop || "0") + Number.parseFloat(computedStyle.paddingBottom || "0")
      metricsRef.current = {
        rows,
        minHeightFromRows: rows > 0 && Number.isFinite(lineHeight) ? rows * lineHeight + paddingBlock : 0,
      }
    }
    element.style.height = "auto"
    element.style.height = `${Math.ceil(Math.max(element.scrollHeight + 6, metricsRef.current.minHeightFromRows + 6, 88))}px`
  }, [ref])

  const queueSyncHeight = useCallback((remeasureBase = false) => {
    cancelQueuedSync()
    if (typeof window === "undefined") return
    rafIdRef.current = window.requestAnimationFrame(() => {
      rafIdRef.current = null
      syncHeight(remeasureBase)
    })
  }, [cancelQueuedSync, syncHeight])

  useLayoutEffect(() => {
    const remeasureBase = previousLayoutVersionRef.current !== layoutVersion
    previousLayoutVersionRef.current = layoutVersion
    syncHeight(remeasureBase)
    return cancelQueuedSync
  }, [cancelQueuedSync, layoutVersion, syncHeight, value])

  useEffect(() => {
    const element = ref.current
    if (!element || typeof window === "undefined") return

    const handleResize = () => queueSyncHeight(true)
    const handleFocus = () => queueSyncHeight(true)
    window.addEventListener("resize", handleResize)
    element.addEventListener("focus", handleFocus)
    element.addEventListener("click", handleFocus)

    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        queueSyncHeight(true)
      })
      if (element.parentElement) observer.observe(element.parentElement)
      observer.observe(element)
    }

    const fontSet = document.fonts
    let disposed = false
    if (fontSet?.ready) {
      void fontSet.ready.then(() => {
        if (!disposed) queueSyncHeight()
      })
    }

    return () => {
      disposed = true
      window.removeEventListener("resize", handleResize)
      element.removeEventListener("focus", handleFocus)
      element.removeEventListener("click", handleFocus)
      observer?.disconnect()
      cancelQueuedSync()
    }
  }, [cancelQueuedSync, queueSyncHeight, ref, value, layoutVersion])
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
            <MermaidCodeEditorShell>
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
            <MermaidPreviewCard>
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
  min-height: 12rem;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.06)")};
  border-radius: 0.95rem;
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(10, 12, 16, 0.98)")};
  padding: 0.95rem 1rem;

  .aq-mermaid {
    margin: 0;
    min-height: 8rem;
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
  min-height: 13rem;
  border-radius: 0.95rem;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.06)")};
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(10, 12, 16, 0.98)")};
  overflow: hidden;
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
