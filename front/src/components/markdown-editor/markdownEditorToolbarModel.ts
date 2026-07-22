import type { WheelEvent as ReactWheelEvent } from "react"

export const modShortcutLabel =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)
    ? "⌘"
    : "Ctrl+"

export const toolbarMarkdownSnippets = [
  { label: "H1", title: "제목 1", before: "# ", after: "" },
  { label: "H2", title: "제목 2", before: "## ", after: "" },
  { label: "H3", title: "제목 3", before: "### ", after: "" },
  { label: "B", title: `굵게 (${modShortcutLabel}B)`, before: "**", after: "**", toggle: true },
  { label: "I", title: `기울임 (${modShortcutLabel}I)`, before: "_", after: "_", toggle: true },
  { label: "S", title: `취소선 (${modShortcutLabel}Shift+X)`, before: "~~", after: "~~", toggle: true },
  { label: "`", title: `인라인 코드 (${modShortcutLabel}E)`, before: "`", after: "`", toggle: true },
  { label: ">", title: "인용문", before: "> ", after: "" },
  { label: "List", title: "목록", before: "- ", after: "" },
  { label: "Task", title: "작업 목록", before: "- [ ] ", after: "" },
] as const

export const tableSnippet = [
  "",
  "| 항목 | 설명 |",
  "| --- | --- |",
  "| 값 | 내용 |",
  "",
].join("\n")

export const codeBlockSnippet = ["", '```kotlin title="invalidatePost.kt"', "fun example() = Unit", "```", ""].join("\n")
export const mermaidSnippet = ["", "```mermaid", "flowchart LR", "    A[Admin write] --> B[DB commit]", "```", ""].join("\n")
export const calloutSnippet = ["", "> [!TIP]", "> **설계 원칙**", "> 내용을 입력하세요.", ""].join("\n")
export const toggleSnippet = ["", ":::toggle 자세히 보기", "내용을 입력하세요.", ":::", ""].join("\n")

export const blockMarkdownSnippets = [
  { label: "Code", title: "코드 블록", snippet: codeBlockSnippet },
  { label: "Table", title: "표", snippet: tableSnippet },
  { label: "Mermaid", title: "Mermaid", snippet: mermaidSnippet, disableWhenMermaid: true },
  { label: "Callout", title: "콜아웃", snippet: calloutSnippet },
  { label: "Toggle", title: "토글", snippet: toggleSnippet },
] as const

export const WHEEL_DELTA_PIXEL = 0
export const WHEEL_DELTA_LINE = 1
export const WHEEL_DELTA_PAGE = 2
export const DEFAULT_WHEEL_LINE_HEIGHT_PX = 16

export const getWheelDeltaYPixels = (event: ReactWheelEvent<HTMLElement>, element: HTMLElement) => {
  if (event.deltaMode === WHEEL_DELTA_PIXEL) return event.deltaY
  if (event.deltaMode === WHEEL_DELTA_PAGE) return event.deltaY * element.clientHeight
  if (event.deltaMode !== WHEEL_DELTA_LINE) return event.deltaY

  const lineHeight = Number.parseFloat(window.getComputedStyle(element).lineHeight)
  const resolvedLineHeight = Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : DEFAULT_WHEEL_LINE_HEIGHT_PX
  return event.deltaY * resolvedLineHeight
}

