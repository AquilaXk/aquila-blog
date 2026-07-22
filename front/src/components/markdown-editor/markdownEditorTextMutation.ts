export type PlannedTextMutation = {
  rangeStart: number
  rangeEnd: number
  replacement: string
  selectionStart: number
  selectionEnd: number
}

/**
 * Programmatic textarea edits that preserve the browser native undo stack.
 * Prefer this over replacing React controlled `value` then restoring selection.
 */
export const applyPlannedTextMutation = (
  textarea: HTMLTextAreaElement,
  plan: PlannedTextMutation
): string => {
  textarea.setRangeText(plan.replacement, plan.rangeStart, plan.rangeEnd, "select")
  textarea.setSelectionRange(plan.selectionStart, plan.selectionEnd)
  return textarea.value
}

export const planReplaceSelection = (
  selectionStart: number,
  selectionEnd: number,
  replacement: string,
  cursorOffset = replacement.length
): PlannedTextMutation => {
  const selectionStartAfter = selectionStart + cursorOffset
  return {
    rangeStart: selectionStart,
    rangeEnd: selectionEnd,
    replacement,
    selectionStart: selectionStartAfter,
    selectionEnd: selectionStartAfter,
  }
}

export const planWrapSelection = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
  before: string,
  after = ""
): PlannedTextMutation => {
  const selected = value.slice(selectionStart, selectionEnd)
  return {
    rangeStart: selectionStart,
    rangeEnd: selectionEnd,
    replacement: `${before}${selected}${after}`,
    selectionStart: selectionStart + before.length,
    selectionEnd: selectionStart + before.length + selected.length,
  }
}

export const planToggleWrapSelection = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
  before: string,
  after: string
): PlannedTextMutation => {
  const selected = value.slice(selectionStart, selectionEnd)

  if (
    selectionStart >= before.length &&
    value.slice(selectionStart - before.length, selectionStart) === before &&
    value.slice(selectionEnd, selectionEnd + after.length) === after
  ) {
    return {
      rangeStart: selectionStart - before.length,
      rangeEnd: selectionEnd + after.length,
      replacement: selected,
      selectionStart: selectionStart - before.length,
      selectionEnd: selectionEnd - before.length,
    }
  }

  if (
    selected.startsWith(before) &&
    selected.endsWith(after) &&
    selected.length >= before.length + after.length
  ) {
    const inner = selected.slice(before.length, selected.length - after.length)
    return {
      rangeStart: selectionStart,
      rangeEnd: selectionEnd,
      replacement: inner,
      selectionStart,
      selectionEnd: selectionStart + inner.length,
    }
  }

  return planWrapSelection(value, selectionStart, selectionEnd, before, after)
}

export const planInsertMarkdownLink = (
  value: string,
  selectionStart: number,
  selectionEnd: number
): PlannedTextMutation => {
  const selected = value.slice(selectionStart, selectionEnd)
  const url = "https://"
  const replacement = `[${selected}](${url})`
  const urlStart = selectionStart + selected.length + 3
  return {
    rangeStart: selectionStart,
    rangeEnd: selectionEnd,
    replacement,
    selectionStart: urlStart,
    selectionEnd: urlStart + url.length,
  }
}

export const planHardBreak = (selectionStart: number, selectionEnd: number): PlannedTextMutation =>
  planReplaceSelection(selectionStart, selectionEnd, "  \n")

const lineBoundsAt = (value: string, offset: number) => {
  const lineStart = value.lastIndexOf("\n", offset - 1) + 1
  const nextBreak = value.indexOf("\n", offset)
  const lineEnd = nextBreak === -1 ? value.length : nextBreak
  return { lineStart, lineEnd }
}

const selectionLineBounds = (value: string, selectionStart: number, selectionEnd: number) => {
  const start = lineBoundsAt(value, selectionStart).lineStart
  const end = lineBoundsAt(value, Math.max(selectionEnd, selectionStart)).lineEnd
  return { blockStart: start, blockEnd: end }
}

export const planIndentLines = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
  indent = "  "
): PlannedTextMutation => {
  const { blockStart, blockEnd } = selectionLineBounds(value, selectionStart, selectionEnd)
  const block = value.slice(blockStart, blockEnd)
  const lines = block.split("\n")
  const nextBlock = lines.map((line) => `${indent}${line}`).join("\n")
  const inserted = indent.length * lines.length
  const anchorMoved = selectionStart === blockStart ? 0 : indent.length
  return {
    rangeStart: blockStart,
    rangeEnd: blockEnd,
    replacement: nextBlock,
    selectionStart: selectionStart + anchorMoved,
    selectionEnd: selectionEnd + inserted,
  }
}

export const planOutdentLines = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
  indentSize = 2
): PlannedTextMutation | null => {
  const { blockStart, blockEnd } = selectionLineBounds(value, selectionStart, selectionEnd)
  const block = value.slice(blockStart, blockEnd)
  const lines = block.split("\n")
  let removedBeforeSelection = 0
  let removedTotal = 0
  let cursor = blockStart

  const nextLines = lines.map((line) => {
    const lineStart = cursor
    cursor += line.length + 1
    const match = line.match(/^( {1,2}|\t)/)
    if (!match) return line
    const removeCount = match[0] === "\t" ? 1 : Math.min(match[0].length, indentSize)
    if (lineStart < selectionStart) {
      removedBeforeSelection += Math.min(removeCount, selectionStart - lineStart)
    }
    removedTotal += removeCount
    return line.slice(removeCount)
  })

  if (removedTotal === 0) return null

  return {
    rangeStart: blockStart,
    rangeEnd: blockEnd,
    replacement: nextLines.join("\n"),
    selectionStart: Math.max(blockStart, selectionStart - removedBeforeSelection),
    selectionEnd: Math.max(blockStart, selectionEnd - removedTotal),
  }
}
