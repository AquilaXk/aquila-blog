const normalizeLineEndings = (raw: string) => raw.replace(/\r\n?/g, "\n")

// 에디터/IME 환경에 따라 code fence가 백틱이 아닌 유사 문자(' 포함)로 입력되는 경우를 교정한다.
const normalizeFenceChars = (raw: string) => raw.replace(/[｀´ˋ'‘’]/g, "`")
const stripInvisibleChars = (raw: string) => raw.replace(/[\u200B-\u200D\uFEFF]/g, "")
const normalizeHtmlLineBreaks = (raw: string) => raw.replace(/<br\s*\/?>/gi, "\n")

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

const extractFirstFencedMermaidSource = (normalized: string) => {
  const lines = normalized.split("\n")
  let startIndex = -1
  let fenceMarker: string | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const parsed = parseFenceLine(lines[index])
    if (!parsed) continue
    if (parsed.tail.toLowerCase() !== "mermaid") continue

    startIndex = index
    fenceMarker = parsed.marker
    break
  }

  if (startIndex < 0 || !fenceMarker) return ""

  const body: string[] = []
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const parsed = parseFenceLine(lines[index])
    if (parsed && parsed.marker === fenceMarker) {
      return body.join("\n").trim()
    }
    body.push(lines[index])
  }

  // 닫힘 fence 누락 시에도 가능한 범위까지 본문을 반환해 렌더 경로를 유지한다.
  return body.join("\n").trim()
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

    // fenced block 내부에서 같은 마커(```/~~~)로 시작한 라인은 닫힘 fence로 취급한다.
    // 실사용에서 "```4", "``` )" 같은 IME 오입력이 자주 발생해 미리보기/상세 렌더가 깨진다.
    // 닫힘 뒤 꼬리 텍스트는 다음 줄로 보존해 사용자 입력 손실을 막는다.
    normalized.push(activeFenceMarker.repeat(3))
    normalized.push(parsed.tail)
    activeFenceMarker = null
  }

  // 닫힘 fence 누락으로 이후 문단 전체가 code block 되는 현상을 미리보기/상세에서 차단한다.
  if (activeFenceMarker) {
    normalized.push(activeFenceMarker.repeat(3))
  }

  return normalizeEscapedMermaidFences(normalized.join("\n"))
}

export const extractNormalizedMermaidSource = (raw: string): string => {
  const normalized = normalizeHtmlLineBreaks(normalizeEscapedMarkdownFences(raw)).trim()
  if (!normalized) return ""

  const fencedSource = extractFirstFencedMermaidSource(normalized)
  if (fencedSource) return fencedSource

  return normalized
}
