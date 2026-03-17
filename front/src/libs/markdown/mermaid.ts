const normalizeLineEndings = (raw: string) => raw.replace(/\r\n?/g, "\n")

// 에디터/IME 환경에 따라 code fence가 백틱이 아닌 유사 문자(' 포함)로 입력되는 경우를 교정한다.
const normalizeFenceChars = (raw: string) => raw.replace(/[｀´ˋ'‘’]/g, "`")
const stripInvisibleChars = (raw: string) => raw.replace(/[\u200B-\u200D\uFEFF]/g, "")

const parseFenceLine = (rawLine: string) => {
  const normalized = normalizeFenceChars(stripInvisibleChars(rawLine)).trim()
  const unescapedEscapedFence = normalized.replaceAll("\\`", "`").replaceAll("\\~", "~")
  const unescaped = unescapedEscapedFence.startsWith("\\")
    ? unescapedEscapedFence.slice(1).trimStart()
    : unescapedEscapedFence
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

const CLOSE_FENCE_SUFFIX_PATTERN = /^[0-9]+[.)]?$|^[-*+]$/

// IME/키보드 오타로 깨진 일반 fenced code block까지 렌더 단계에서 복구한다.
// 예: "```4" -> "```" + "4"
export const normalizeEscapedMarkdownFences = (raw: string): string => {
  if (!raw) return raw

  const lines = normalizeLineEndings(raw).split("\n")
  const normalized: string[] = []

  let activeFenceMarker: string | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const parsed = parseFenceLine(line)

    if (!activeFenceMarker) {
      if (!parsed) {
        normalized.push(line)
        continue
      }

      const openingTail = parsed.tail ? parsed.tail : ""
      normalized.push(`${parsed.marker.repeat(3)}${openingTail}`)
      activeFenceMarker = parsed.marker
      continue
    }

    if (!parsed || parsed.marker !== activeFenceMarker) {
      normalized.push(line)
      continue
    }

    if (parsed.tail.length === 0) {
      normalized.push(activeFenceMarker.repeat(3))
      activeFenceMarker = null
      continue
    }

    if (CLOSE_FENCE_SUFFIX_PATTERN.test(parsed.tail)) {
      normalized.push(activeFenceMarker.repeat(3))
      normalized.push(parsed.tail)
      activeFenceMarker = null
      continue
    }

    normalized.push(line)
  }

  // 닫힘 fence 누락으로 이후 문단 전체가 code block 되는 현상을 미리보기/상세에서 차단한다.
  if (activeFenceMarker) {
    normalized.push(activeFenceMarker.repeat(3))
  }

  return normalizeEscapedMermaidFences(normalized.join("\n"))
}
