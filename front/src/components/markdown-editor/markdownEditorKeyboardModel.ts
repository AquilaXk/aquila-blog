import {
  planHardBreak,
  planIndentLines,
  planInsertMarkdownLink,
  planOutdentLines,
  planReplaceSelection,
  planToggleWrapSelection,
  type PlannedTextMutation,
} from "./markdownEditorTextMutation"

export type MarkdownFormatShortcut =
  | "bold"
  | "italic"
  | "link"
  | "strikethrough"
  | "inlineCode"

export type ListMarkerMatch =
  | { kind: "unordered" | "task" | "quote"; indent: string; marker: string; content: string }
  | { kind: "ordered"; indent: string; marker: string; content: string; number: number }

const FORMAT_WRAP: Record<Exclude<MarkdownFormatShortcut, "link">, { before: string; after: string }> = {
  bold: { before: "**", after: "**" },
  italic: { before: "_", after: "_" },
  strikethrough: { before: "~~", after: "~~" },
  inlineCode: { before: "`", after: "`" },
}

export const isComposingEditorKeyboardEvent = (event: {
  nativeEvent: { isComposing?: boolean; keyCode?: number }
}): boolean => {
  const nativeEvent = event.nativeEvent
  return nativeEvent.isComposing === true || nativeEvent.keyCode === 229
}

export const matchListMarkerLine = (line: string): ListMarkerMatch | null => {
  const task = /^(?<indent>\s*)(?<marker>- \[[ xX]\] )(?<content>.*)$/.exec(line)
  if (task?.groups) {
    return {
      kind: "task",
      indent: task.groups.indent ?? "",
      marker: "- [ ] ",
      content: task.groups.content ?? "",
    }
  }

  const unordered = /^(?<indent>\s*)(?<marker>- |\* )(?<content>.*)$/.exec(line)
  if (unordered?.groups) {
    return {
      kind: "unordered",
      indent: unordered.groups.indent ?? "",
      marker: unordered.groups.marker ?? "- ",
      content: unordered.groups.content ?? "",
    }
  }

  const ordered = /^(?<indent>\s*)(?<marker>(?<number>\d+)\. )(?<content>.*)$/.exec(line)
  if (ordered?.groups) {
    return {
      kind: "ordered",
      indent: ordered.groups.indent ?? "",
      marker: ordered.groups.marker ?? "1. ",
      content: ordered.groups.content ?? "",
      number: Number.parseInt(ordered.groups.number ?? "1", 10) || 1,
    }
  }

  const quote = /^(?<indent>\s*)(?<marker>> )(?<content>.*)$/.exec(line)
  if (quote?.groups) {
    return {
      kind: "quote",
      indent: quote.groups.indent ?? "",
      marker: "> ",
      content: quote.groups.content ?? "",
    }
  }

  return null
}

export const planListEnterContinuation = (
  value: string,
  selectionStart: number,
  selectionEnd: number
): PlannedTextMutation | null => {
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1
  const nextBreak = value.indexOf("\n", selectionStart)
  const lineEnd = nextBreak === -1 ? value.length : nextBreak
  const line = value.slice(lineStart, lineEnd)
  const matched = matchListMarkerLine(line)
  if (!matched) return null

  if (matched.content === "") {
    return {
      rangeStart: lineStart,
      rangeEnd: lineEnd,
      replacement: "",
      selectionStart: lineStart,
      selectionEnd: lineStart,
    }
  }

  const nextMarker =
    matched.kind === "ordered"
      ? `${matched.indent}${matched.number + 1}. `
      : `${matched.indent}${matched.marker}`

  return planReplaceSelection(selectionStart, selectionEnd, `\n${nextMarker}`)
}

export const planFormatShortcutMutation = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
  shortcut: MarkdownFormatShortcut
): PlannedTextMutation => {
  if (shortcut === "link") {
    return planInsertMarkdownLink(value, selectionStart, selectionEnd)
  }
  const wrap = FORMAT_WRAP[shortcut]
  return planToggleWrapSelection(value, selectionStart, selectionEnd, wrap.before, wrap.after)
}

export const resolveFormatShortcut = (event: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}): MarkdownFormatShortcut | null => {
  const mod = event.metaKey || event.ctrlKey
  if (!mod || event.altKey) return null

  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key

  if (!event.shiftKey && key === "b") return "bold"
  if (!event.shiftKey && key === "i") return "italic"
  if (!event.shiftKey && key === "k") return "link"
  if (!event.shiftKey && key === "e") return "inlineCode"
  if (event.shiftKey && (key === "x" || key === "X")) return "strikethrough"
  return null
}

export const isSaveShortcut = (event: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}): boolean => {
  if (event.altKey || event.shiftKey) return false
  if (!event.metaKey && !event.ctrlKey) return false
  return event.key.toLowerCase() === "s"
}

export const planTabIndentMutation = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
  shiftKey: boolean
): PlannedTextMutation | null => {
  if (shiftKey) {
    return planOutdentLines(value, selectionStart, selectionEnd)
  }
  return planIndentLines(value, selectionStart, selectionEnd)
}

export { planHardBreak }
