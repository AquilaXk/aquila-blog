export type ScrollAnchorPair = {
  sourceScrollTop: number
  targetScrollTop: number
}

type InterpolateScrollTopByAnchorsArgs = {
  sourceScrollTop: number
  anchorPairs: ScrollAnchorPair[]
}

const SOURCE_POINT_EPSILON_PX = 0.5

const clampToNonNegativeFinite = (value: number) =>
  Number.isFinite(value) ? Math.max(0, value) : 0

export const extractMarkdownHeadingLineIndexes = (markdown: string) => {
  const headingLineIndexes: number[] = []
  let fence: { marker: "`" | "~"; length: number } | null = null

  markdown.split(/\r?\n/).forEach((line, lineIndex) => {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[1][0] as "`" | "~"
      const markerLength = fenceMatch[1].length
      const suffix = fenceMatch[2]

      if (!fence) {
        fence = { marker, length: markerLength }
        return
      }

      if (fence.marker === marker && markerLength >= fence.length && suffix.trim() === "") {
        fence = null
      }
      return
    }

    if (fence) return
    if (/^ {0,3}#{1,6}(?:\s+|$)/.test(line)) headingLineIndexes.push(lineIndex)
  })

  return headingLineIndexes
}

const normalizeAnchorPairs = (anchorPairs: ScrollAnchorPair[]) => {
  const sortedPairs = anchorPairs
    .map((pair) => ({
      sourceScrollTop: clampToNonNegativeFinite(pair.sourceScrollTop),
      targetScrollTop: clampToNonNegativeFinite(pair.targetScrollTop),
    }))
    .sort((left, right) => left.sourceScrollTop - right.sourceScrollTop)

  return sortedPairs.reduce<ScrollAnchorPair[]>((normalized, pair) => {
    const previous = normalized.at(-1)
    if (!previous) {
      normalized.push(pair)
      return normalized
    }

    if (pair.sourceScrollTop - previous.sourceScrollTop <= SOURCE_POINT_EPSILON_PX) {
      previous.sourceScrollTop = Math.max(previous.sourceScrollTop, pair.sourceScrollTop)
      previous.targetScrollTop = Math.max(previous.targetScrollTop, pair.targetScrollTop)
      return normalized
    }

    normalized.push({
      sourceScrollTop: pair.sourceScrollTop,
      targetScrollTop: Math.max(previous.targetScrollTop, pair.targetScrollTop),
    })
    return normalized
  }, [])
}

export const interpolateScrollTopByAnchors = ({
  sourceScrollTop,
  anchorPairs,
}: InterpolateScrollTopByAnchorsArgs) => {
  const normalizedPairs = normalizeAnchorPairs(anchorPairs)
  if (normalizedPairs.length === 0) return 0

  const scrollTop = clampToNonNegativeFinite(sourceScrollTop)
  const firstPair = normalizedPairs[0]
  const lastPair = normalizedPairs.at(-1) ?? firstPair
  if (scrollTop <= firstPair.sourceScrollTop) return firstPair.targetScrollTop
  if (scrollTop >= lastPair.sourceScrollTop) return lastPair.targetScrollTop

  for (let index = 1; index < normalizedPairs.length; index += 1) {
    const nextPair = normalizedPairs[index]
    if (scrollTop > nextPair.sourceScrollTop) continue

    const previousPair = normalizedPairs[index - 1]
    const sourceDistance = nextPair.sourceScrollTop - previousPair.sourceScrollTop
    if (sourceDistance <= SOURCE_POINT_EPSILON_PX) return nextPair.targetScrollTop

    const progress = (scrollTop - previousPair.sourceScrollTop) / sourceDistance
    return previousPair.targetScrollTop + progress * (nextPair.targetScrollTop - previousPair.targetScrollTop)
  }

  return lastPair.targetScrollTop
}
