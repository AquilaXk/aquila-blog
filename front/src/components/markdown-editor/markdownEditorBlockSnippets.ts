import { planReplaceSelection, type PlannedTextMutation } from "./markdownEditorTextMutation"

export type BlockSnippetSpec = {
  snippet: string
  cursorOffset: number
}

const joinSnippetLines = (lines: string[]) => lines.join("\n")

const cursorAfter = (snippet: string, marker: string) => {
  const index = snippet.indexOf(marker)
  if (index === -1) {
    throw new Error(`Block snippet cursor marker not found: ${marker}`)
  }
  return index + marker.length
}

export const tableBlockSnippet: BlockSnippetSpec = (() => {
  const snippet = joinSnippetLines(["", "|  |  |", "| --- | --- |", "|  |  |", ""])
  const headerRowStart = snippet.indexOf("|  |  |")
  return {
    snippet,
    cursorOffset: headerRowStart + "| ".length,
  }
})()

export const codeBlockSnippet: BlockSnippetSpec = (() => {
  const snippet = joinSnippetLines(["", "```", "", "```", ""])
  return {
    snippet,
    cursorOffset: cursorAfter(snippet, "```\n"),
  }
})()

export const mermaidBlockSnippet: BlockSnippetSpec = (() => {
  const snippet = joinSnippetLines(["", "```mermaid", "flowchart TD", "    A --> B", "```", ""])
  return {
    snippet,
    cursorOffset: cursorAfter(snippet, "    A --> B") + "    ".length,
  }
})()

export const calloutBlockSnippet: BlockSnippetSpec = (() => {
  const snippet = joinSnippetLines(["", "> [!TIP]", "> ", ""])
  return {
    snippet,
    cursorOffset: cursorAfter(snippet, "> [!TIP]\n> ") ,
  }
})()

export const toggleBlockSnippet: BlockSnippetSpec = (() => {
  const snippet = joinSnippetLines(["", ":::toggle ", "", ":::", ""])
  return {
    snippet,
    cursorOffset: cursorAfter(snippet, ":::toggle "),
  }
})()

export const planInsertBlockSnippet = (
  selectionStart: number,
  selectionEnd: number,
  spec: BlockSnippetSpec
): PlannedTextMutation => planReplaceSelection(selectionStart, selectionEnd, spec.snippet, spec.cursorOffset)

export const blockMarkdownSnippets = [
  { label: "Code", title: "코드 블록", ...codeBlockSnippet },
  { label: "Table", title: "표", ...tableBlockSnippet },
  { label: "Mermaid", title: "Mermaid", ...mermaidBlockSnippet, disableWhenMermaid: true },
  { label: "Callout", title: "콜아웃", ...calloutBlockSnippet },
  { label: "Toggle", title: "토글", ...toggleBlockSnippet },
] as const

export const BLOCK_SNIPPET_SAMPLE_MARKERS = [
  "항목",
  "설명",
  "값",
  "내용",
  "내용을 입력하세요.",
  "Admin write",
  "DB commit",
  "fun example",
  "invalidatePost.kt",
  "설계 원칙",
  "kotlin title",
] as const

export const snippetContainsSampleMarker = (snippet: string) =>
  BLOCK_SNIPPET_SAMPLE_MARKERS.some((marker) => snippet.includes(marker))
