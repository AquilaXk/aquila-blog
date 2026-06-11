import { useCallback, useEffect, useLayoutEffect, useRef } from "react"
export { useDebouncedAttributeCommit } from "./editorNodeViewShared"

export const TEXTAREA_DEBOUNCE_MS = 180
export const MERMAID_TEMPLATE = ["flowchart TD", "  A[사용자 요청] --> B{검증}", "  B -->|OK| C[처리]", "  B -->|Fail| D[오류 반환]"].join(
  "\n"
)

export type MermaidEditorViewMode = "code" | "split" | "preview"

export const MERMAID_VIEW_MODE_OPTIONS: Array<{ value: MermaidEditorViewMode; label: string }> = [
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

export const renderMermaidHighlightedSource = (source: string) =>
  source
    .split("\n")
    .map((line) => `<span class="line">${highlightMermaidLine(line) || "<br />"}</span>`)
    .join("")

export const useAutosizeTextarea = (
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
