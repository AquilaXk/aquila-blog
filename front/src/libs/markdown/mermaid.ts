const normalizeLineEndings = (raw: string) => raw.replace(/\r\n?/g, "\n")

const normalizeFenceChars = (raw: string) => raw.replace(/[｀´ˋ]/g, "`")

const parseFenceLine = (rawLine: string) => {
  const normalized = normalizeFenceChars(rawLine).trim()
  const unescaped = normalized.startsWith("\\") ? normalized.slice(1).trimStart() : normalized
  const match = unescaped.match(/^([`~]{3,})(.*)$/)
  if (!match) return null

  const fence = match[1]
  const marker = fence[0]
  if (!fence.split("").every((char) => char === marker)) return null

  return {
    marker,
    tail: (match[2] || "").trim(),
  }
}

export const normalizeEscapedMermaidFences = (raw: string): string => {
  if (!raw) return raw

  const lines = normalizeLineEndings(raw).split("\n")
  const normalized: string[] = []

  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    const parsedStartFence = parseFenceLine(line)
    const isMermaidFenceStart =
      parsedStartFence &&
      parsedStartFence.tail.length > 0 &&
      parsedStartFence.tail.toLowerCase() === "mermaid"

    if (!isMermaidFenceStart) {
      normalized.push(line)
      index += 1
      continue
    }

    normalized.push("```mermaid")
    index += 1

    while (index < lines.length) {
      const current = lines[index]
      const parsedEndFence = parseFenceLine(current)
      if (parsedEndFence && parsedEndFence.tail.length === 0) {
        normalized.push("```")
        index += 1
        break
      }
      normalized.push(current)
      index += 1
    }
  }

  return normalized.join("\n")
}
