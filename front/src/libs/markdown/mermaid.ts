const normalizeLineEndings = (raw: string) => raw.replace(/\r\n?/g, "\n")

const ESCAPED_MERMAID_FENCE_START_REGEX = /^\s*\\`{3,}\s*mermaid\s*$/i
const ESCAPED_FENCE_END_REGEX = /^\s*\\`{3,}\s*$/

export const normalizeEscapedMermaidFences = (raw: string): string => {
  if (!raw) return raw

  const lines = normalizeLineEndings(raw).split("\n")
  const normalized: string[] = []

  let index = 0
  while (index < lines.length) {
    const line = lines[index]

    if (!ESCAPED_MERMAID_FENCE_START_REGEX.test(line.trim())) {
      normalized.push(line)
      index += 1
      continue
    }

    normalized.push("```mermaid")
    index += 1

    while (index < lines.length) {
      const current = lines[index]
      if (ESCAPED_FENCE_END_REGEX.test(current.trim())) {
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
