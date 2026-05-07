import type { BlockInsertCatalogItem } from "./writerEditorPreset"

export type SlashMenuContext = {
  currentBlockType: string | null
  previousBlockType: string | null
  atDocumentStart: boolean
}

export type SlashMenuSection = {
  title: string
  items: BlockInsertCatalogItem[]
}

export const normalizeSlashSearchText = (value: string) =>
  value.trim().toLowerCase()

const compactSlashSearchText = (value: string) =>
  normalizeSlashSearchText(value).replace(/\s+/g, "")

const getSlashSearchTerms = (item: BlockInsertCatalogItem) =>
  Array.from(
    new Set(
      [
        item.label,
        item.helper ?? "",
        item.slashHint ?? "",
        item.section,
        ...(item.keywords ?? []),
      ]
        .map((value) => normalizeSlashSearchText(value))
        .filter(Boolean)
    )
  )

export const getSlashActionGlyph = (item: BlockInsertCatalogItem) => {
  switch (item.id) {
    case "paragraph":
      return "T"
    case "heading-1":
      return "H1"
    case "heading-2":
      return "H2"
    case "heading-3":
      return "H3"
    case "heading-4":
      return "H4"
    case "bullet-list":
      return "•"
    case "ordered-list":
      return "1."
    case "checklist":
      return "☑"
    case "quote":
      return "❞"
    case "code-block":
      return "</>"
    case "table":
      return "▦"
    case "callout":
      return "!"
    case "toggle":
      return "▸"
    case "bookmark":
      return "↗"
    case "embed":
      return "▶"
    case "file":
      return "PDF"
    case "formula":
      return "∑"
    case "divider":
      return "—"
    case "image":
      return "img"
    case "mermaid":
      return "M"
    default:
      return item.slashHint ?? item.label.slice(0, 1)
  }
}

const getSlashMenuContextBonus = (
  item: BlockInsertCatalogItem,
  context: SlashMenuContext
) => {
  let score = 0

  if (context.atDocumentStart) {
    if (item.id === "heading-1") score += 42
    if (item.id === "heading-2") score += 28
    if (item.id === "paragraph") score += 16
    if (item.id === "image") score += 6
  }

  if (context.currentBlockType === "paragraph") {
    if (item.id === "paragraph") score += 8
    if (item.id === "heading-2") score += 6
    if (item.id === "bullet-list") score += 6
    if (item.id === "code-block") score += 4
  }

  if (context.currentBlockType === "heading") {
    if (item.id === "paragraph") score += 18
    if (item.id === "bullet-list") score += 12
    if (item.id === "quote") score += 10
    if (item.id === "image") score += 8
  }

  if (context.previousBlockType === "heading") {
    if (item.id === "paragraph") score += 24
    if (item.id === "bullet-list") score += 18
    if (item.id === "image") score += 10
    if (item.id === "divider") score += 6
  }

  if (
    context.previousBlockType === "bulletList" ||
    context.previousBlockType === "orderedList"
  ) {
    if (item.id === "bullet-list" || item.id === "ordered-list") score += 16
    if (item.id === "paragraph") score += 14
    if (item.id === "heading-2") score += 8
    if (item.id === "divider") score += 6
  }

  if (
    context.previousBlockType === "codeBlock" ||
    context.previousBlockType === "mermaidBlock" ||
    context.previousBlockType === "table"
  ) {
    if (item.id === "paragraph") score += 20
    if (item.id === "divider") score += 18
    if (item.id === "callout") score += 8
    if (item.id === "image") score += 8
  }

  if (context.previousBlockType === "image") {
    if (item.id === "paragraph") score += 18
    if (item.id === "heading-2") score += 10
    if (item.id === "callout") score += 8
  }

  if (
    context.previousBlockType === "calloutBlock" ||
    context.previousBlockType === "toggleBlock"
  ) {
    if (item.id === "paragraph") score += 18
    if (item.id === "heading-2") score += 10
    if (item.id === "bullet-list") score += 8
  }

  return score
}

const getSlashMenuMatchScore = (
  item: BlockInsertCatalogItem,
  normalizedQuery: string,
  recentIndex: number,
  context: SlashMenuContext
) => {
  const recentBonus = recentIndex >= 0 ? 120 - recentIndex * 8 : 0
  const recommendedBonus = item.recommended ? 20 : 0
  const contextBonus = getSlashMenuContextBonus(item, context)

  if (!normalizedQuery) {
    return recentBonus + recommendedBonus + contextBonus
  }

  const compactQuery = compactSlashSearchText(normalizedQuery)
  const contextTieBreaker = Math.round(contextBonus * 0.42)
  const fields = getSlashSearchTerms(item)

  let score = Number.NEGATIVE_INFINITY
  let keywordIntentBonus = 0

  for (const field of fields) {
    const compactField = compactSlashSearchText(field)

    if (field === normalizedQuery || compactField === compactQuery) {
      score = Math.max(score, 1200)
      if (
        item.keywords?.some(
          (keyword) => compactSlashSearchText(keyword) === compactQuery
        )
      ) {
        keywordIntentBonus = Math.max(keywordIntentBonus, 120)
      }
      continue
    }

    if (
      field.startsWith(normalizedQuery) ||
      compactField.startsWith(compactQuery)
    ) {
      score = Math.max(score, 980)
      if (
        item.keywords?.some((keyword) =>
          compactSlashSearchText(keyword).startsWith(compactQuery)
        )
      ) {
        keywordIntentBonus = Math.max(keywordIntentBonus, 72)
      }
      continue
    }

    if (
      field
        .split(/\s+/)
        .some((token) => compactSlashSearchText(token).startsWith(compactQuery))
    ) {
      score = Math.max(score, 860)
      continue
    }

    if (
      field.includes(normalizedQuery) ||
      compactField.includes(compactQuery)
    ) {
      score = Math.max(score, 680)
    }
  }

  if (!Number.isFinite(score)) {
    return Number.NEGATIVE_INFINITY
  }

  return (
    score +
    recentBonus +
    recommendedBonus +
    contextTieBreaker +
    keywordIntentBonus
  )
}

export const getRankedSlashItems = (
  catalog: BlockInsertCatalogItem[],
  query: string,
  recentItemIds: readonly string[],
  context: SlashMenuContext
) => {
  const normalizedQuery = normalizeSlashSearchText(query)
  return catalog
    .map((item, index) => ({
      item,
      index,
      score: getSlashMenuMatchScore(
        item,
        normalizedQuery,
        recentItemIds.indexOf(item.id),
        context
      ),
    }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return left.index - right.index
    })
    .map((entry) => entry.item)
}

export const buildSlashMenuSections = (
  rankedItems: BlockInsertCatalogItem[],
  recentItemIds: readonly string[],
  normalizedQuery: string
): SlashMenuSection[] => {
  const seenItemIds = new Set<string>()
  const takeUnique = (items: Array<BlockInsertCatalogItem | undefined>) =>
    items.filter((item): item is BlockInsertCatalogItem => {
      if (!item || seenItemIds.has(item.id)) return false
      seenItemIds.add(item.id)
      return true
    })

  const recentItems = takeUnique(
    recentItemIds.map((id) => rankedItems.find((item) => item.id === id))
  )
  const recommendedItems = takeUnique(
    rankedItems.slice(0, normalizedQuery ? Math.min(rankedItems.length, 6) : 5)
  )
  const basicItems = takeUnique(
    rankedItems.filter((item) => item.section === "basic")
  )
  const structureItems = takeUnique(
    rankedItems.filter((item) => item.section === "structure")
  )
  const mediaItems = takeUnique(
    rankedItems.filter((item) => item.section === "media")
  )

  return [
    { title: "최근 사용", items: recentItems },
    { title: "추천", items: recommendedItems },
    { title: "기본 블록", items: basicItems },
    { title: "구조 블록", items: structureItems },
    { title: "미디어", items: mediaItems },
  ].filter((section) => section.items.length > 0)
}
