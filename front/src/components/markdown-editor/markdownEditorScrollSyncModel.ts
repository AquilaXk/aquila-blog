export type ScrollAnchor = {
  key: string
  position: number
}

export type ScrollRange = {
  start: number
  end: number
}

export type MarkdownHeading = {
  key: string
  level: number
  text: string
  offset: number
}

const FENCE_OPEN_PATTERN = /^\s{0,3}(`{3,}|~{3,})/
// CommonMark ATX closing sequence는 앞에 공백이 있어야 하므로 `## C#`의 `#`는 본문으로 남긴다.
const ATX_HEADING_PATTERN = /^\s{0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/

/**
 * `<`부터 대응하는 `>`(없으면 문자열 끝)까지 통째로 제거한다.
 * 정규식 한 번으로 태그를 지우면 닫히지 않은 `<script` 같은 조각이 남을 수 있어
 * 결과에 `<`가 하나도 남지 않도록 직접 순회한다.
 */
const stripInlineHtml = (value: string) => {
  let result = ""
  let index = 0

  while (index < value.length) {
    const character = value[index]
    if (character !== "<") {
      result += character
      index += 1
      continue
    }

    const closingIndex = value.indexOf(">", index + 1)
    index = closingIndex === -1 ? value.length : closingIndex + 1
  }

  return result
}

const normalizeHeadingText = (value: string) =>
  stripInlineHtml(
    value
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
  )
    .replace(/(\*\*|__|~~)(.*?)\1/g, "$2")
    .replace(/(^|[^*_])([*_])([^*_]+)\2(?=$|[^*_])/g, "$1$3")
    .replace(/\\([\\`*_[\]{}()#+.!>|~-])/g, "$1")
    .replace(/\s+/g, " ")
    .trim()

export const collectMarkdownHeadings = (markdown: string): MarkdownHeading[] => {
  const headings: MarkdownHeading[] = []
  const occurrences = new Map<string, number>()
  const lines = markdown.split(/\r?\n/)
  let offset = 0
  let activeFence: { marker: "`" | "~"; length: number } | null = null

  for (const line of lines) {
    const fenceMatch = FENCE_OPEN_PATTERN.exec(line)
    if (fenceMatch) {
      const fence = fenceMatch[1]
      const marker = fence[0] as "`" | "~"
      if (!activeFence) {
        activeFence = { marker, length: fence.length }
      } else if (activeFence.marker === marker && fence.length >= activeFence.length) {
        activeFence = null
      }
      offset += line.length + 1
      continue
    }

    if (!activeFence) {
      const headingMatch = ATX_HEADING_PATTERN.exec(line)
      if (headingMatch) {
        const level = headingMatch[1].length
        const text = normalizeHeadingText(headingMatch[2])
        if (text) {
          const occurrenceKey = `${level}:${text}`
          const occurrence = occurrences.get(occurrenceKey) ?? 0
          occurrences.set(occurrenceKey, occurrence + 1)
          headings.push({
            key: `${occurrenceKey}:${occurrence}`,
            level,
            text,
            offset,
          })
        }
      }
    }

    offset += line.length + 1
  }

  return headings
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))

const normalizeRange = (range: ScrollRange) => ({
  start: Math.min(range.start, range.end),
  end: Math.max(range.start, range.end),
})

export const mapScrollFocusBetweenAnchors = ({
  sourceFocus,
  sourceAnchors,
  targetAnchors,
  sourceRange,
  targetRange,
}: {
  sourceFocus: number
  sourceAnchors: ScrollAnchor[]
  targetAnchors: ScrollAnchor[]
  sourceRange: ScrollRange
  targetRange: ScrollRange
}) => {
  const normalizedSourceRange = normalizeRange(sourceRange)
  const normalizedTargetRange = normalizeRange(targetRange)
  const targetByKey = new Map(targetAnchors.map((anchor) => [anchor.key, anchor.position]))
  const matched = sourceAnchors
    .filter((anchor) => targetByKey.has(anchor.key))
    .map((anchor) => ({
      source: anchor.position,
      target: targetByKey.get(anchor.key) as number,
    }))
    .sort((left, right) => left.source - right.source)

  // range 경계와 정확히 겹치는 anchor(예: 첫 heading이 preview 본문 시작과 같은 위치)도 버리지 않고,
  // 단조 증가가 깨지는 anchor만 직전 항목에 흡수시킨다.
  const pairs: Array<{ source: number; target: number }> = []
  const appendPair = (pair: { source: number; target: number }) => {
    const previous = pairs[pairs.length - 1]
    if (!previous) {
      pairs.push(pair)
      return
    }
    if (pair.source <= previous.source || pair.target < previous.target) {
      pairs[pairs.length - 1] = {
        source: Math.max(previous.source, pair.source),
        target: Math.max(previous.target, pair.target),
      }
      return
    }
    pairs.push(pair)
  }

  appendPair({ source: normalizedSourceRange.start, target: normalizedTargetRange.start })
  matched
    .filter(
      (pair) =>
        pair.source >= normalizedSourceRange.start &&
        pair.source <= normalizedSourceRange.end &&
        pair.target >= normalizedTargetRange.start &&
        pair.target <= normalizedTargetRange.end
    )
    .forEach(appendPair)
  appendPair({ source: normalizedSourceRange.end, target: normalizedTargetRange.end })

  const focus = clamp(sourceFocus, normalizedSourceRange.start, normalizedSourceRange.end)
  let lower = pairs[0]
  let upper = pairs[pairs.length - 1]

  for (let index = 1; index < pairs.length; index += 1) {
    if (focus <= pairs[index].source) {
      upper = pairs[index]
      lower = pairs[index - 1]
      break
    }
  }

  const sourceDistance = upper.source - lower.source
  if (sourceDistance <= 0) return clamp(lower.target, normalizedTargetRange.start, normalizedTargetRange.end)

  const progress = (focus - lower.source) / sourceDistance
  return clamp(
    lower.target + (upper.target - lower.target) * progress,
    normalizedTargetRange.start,
    normalizedTargetRange.end
  )
}
