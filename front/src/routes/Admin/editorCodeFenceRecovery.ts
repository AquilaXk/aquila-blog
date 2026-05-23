const INVISIBLE_CODE_PLACEHOLDER_REGEX = /[\u00A0\u200B-\u200D\u2060\uFEFF]/g

type ParsedFencedCodeBlock = {
  startLine: number
  endLine: number
  lines: string[]
  body: string
}

const isCodeFenceBodyVisiblyEmpty = (value: string) =>
  value.replace(INVISIBLE_CODE_PLACEHOLDER_REGEX, "").trim().length === 0

const parseFencedCodeBlocks = (content: string): ParsedFencedCodeBlock[] => {
  const lines = content.replace(/\r\n?/g, "\n").split("\n")
  const blocks: ParsedFencedCodeBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] || ""
    const opening = line.trim().match(/^([`~]{3,})(.*)$/)
    if (!opening) {
      index += 1
      continue
    }

    const fence = opening[1]
    const marker = fence[0]
    const closePattern = new RegExp(`^\\s*${marker}{${fence.length},}\\s*$`)
    let pointer = index + 1

    while (pointer < lines.length && !closePattern.test(lines[pointer] || "")) {
      pointer += 1
    }

    if (pointer >= lines.length) {
      index += 1
      continue
    }

    const blockLines = lines.slice(index, pointer + 1)
    blocks.push({
      startLine: index,
      endLine: pointer,
      lines: blockLines,
      body: lines.slice(index + 1, pointer).join("\n"),
    })
    index = pointer + 1
  }

  return blocks
}

export const restoreEmptyFencedCodeBlocks = (content: string, recoveredContent: string) => {
  const recoveredBlocks = parseFencedCodeBlocks(recoveredContent.replace(/\r\n?/g, "\n"))
  if (!recoveredBlocks.some((block) => !isCodeFenceBodyVisiblyEmpty(block.body))) return content

  const normalized = content.replace(/\r\n?/g, "\n")
  const lines = normalized.split("\n")
  const targetBlocks = parseFencedCodeBlocks(normalized)
  let lineOffset = 0

  for (const [blockIndex, block] of targetBlocks.entries()) {
    if (!isCodeFenceBodyVisiblyEmpty(block.body)) continue

    const recoveredBlock = recoveredBlocks[blockIndex]
    if (!recoveredBlock || isCodeFenceBodyVisiblyEmpty(recoveredBlock.body)) continue

    const replacementLines = recoveredBlock.lines
    const startLine = block.startLine + lineOffset
    const deleteCount = block.endLine - block.startLine + 1
    lines.splice(startLine, deleteCount, ...replacementLines)
    lineOffset += replacementLines.length - deleteCount
  }

  return lines.join("\n")
}
