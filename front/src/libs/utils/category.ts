import { DEFAULT_CATEGORY } from "src/constants"

const CATEGORY_STORAGE_SEPARATOR = "::"

export const CATEGORY_ICON_OPTIONS = [
  { id: "folder", label: "폴더" },
  { id: "folder-open", label: "열린 폴더" },
  { id: "stack", label: "목록" },
  { id: "book-open", label: "오픈 북" },
  { id: "book", label: "북" },
  { id: "note", label: "문서" },
  { id: "monitor", label: "개발" },
  { id: "lab", label: "실험" },
  { id: "settings", label: "설정" },
  { id: "rocket", label: "출시" },
  { id: "chart", label: "분석" },
  { id: "archive", label: "보관" },
] as const

export type CategoryIconId = (typeof CATEGORY_ICON_OPTIONS)[number]["id"] | "all"

export type ParsedCategoryDisplay = {
  iconId: CategoryIconId
  label: string
  value: string
  isDefault: boolean
}

const KNOWN_ICON_IDS = new Set<string>(CATEGORY_ICON_OPTIONS.map((option) => option.id))

const LEGACY_EMOJI_ICON_MAP: Record<string, CategoryIconId> = {
  "📁": "folder",
  "📂": "folder-open",
  "🗂️": "stack",
  "📘": "book-open",
  "📗": "book",
  "📙": "note",
  "📝": "note",
  "🖥️": "monitor",
  "🧪": "lab",
  "⚙️": "settings",
  "🚀": "rocket",
  "📊": "chart",
}

const DEFAULT_ICON_ID: CategoryIconId = CATEGORY_ICON_OPTIONS[0].id

const normalizeLabel = (value: string) => value.trim().replace(/\s+/g, " ")

const toKnownIconId = (value?: string): CategoryIconId => {
  if (!value) return DEFAULT_ICON_ID
  if (value === "all") return "all"
  return KNOWN_ICON_IDS.has(value) ? (value as CategoryIconId) : DEFAULT_ICON_ID
}

export const isDefaultCategoryValue = (value?: string) => {
  const normalized = (value || "").trim()
  return (
    normalized.length === 0 ||
    normalized === DEFAULT_CATEGORY ||
    normalized === "📂 All" ||
    normalized.toLowerCase() === "all::all"
  )
}

export const composeCategoryDisplay = (
  label: string,
  iconId: CategoryIconId = DEFAULT_ICON_ID
): string => {
  const normalizedLabel = normalizeLabel(label)

  if (!normalizedLabel) return ""
  if (iconId === "all") return DEFAULT_CATEGORY

  return `${toKnownIconId(iconId)}${CATEGORY_STORAGE_SEPARATOR}${normalizedLabel}`
}

export const splitCategoryDisplay = (value: string): ParsedCategoryDisplay => {
  const trimmed = value.trim()

  if (isDefaultCategoryValue(trimmed)) {
    return {
      iconId: "all",
      label: "All",
      value: DEFAULT_CATEGORY,
      isDefault: true,
    }
  }

  const storedMatch = trimmed.match(/^([a-z0-9-]+)::(.+)$/i)
  if (storedMatch) {
    const [, rawIconId, rawLabel] = storedMatch
    const label = normalizeLabel(rawLabel)
    const iconId = toKnownIconId(rawIconId)

    return {
      iconId,
      label,
      value: composeCategoryDisplay(label, iconId),
      isDefault: false,
    }
  }

  const [firstToken, ...restTokens] = trimmed.split(/\s+/)
  if (restTokens.length > 0 && /\p{Extended_Pictographic}/u.test(firstToken)) {
    const label = normalizeLabel(restTokens.join(" "))
    const iconId = LEGACY_EMOJI_ICON_MAP[firstToken] || DEFAULT_ICON_ID

    return {
      iconId,
      label,
      value: composeCategoryDisplay(label, iconId),
      isDefault: false,
    }
  }

  const label = normalizeLabel(trimmed)

  return {
    iconId: DEFAULT_ICON_ID,
    label,
    value: composeCategoryDisplay(label, DEFAULT_ICON_ID),
    isDefault: false,
  }
}

export const normalizeCategoryValue = (value: string) => splitCategoryDisplay(value).value

export const compareCategoryValues = (a: string, b: string) =>
  splitCategoryDisplay(a).label.localeCompare(splitCategoryDisplay(b).label, "ko")

export const getCategorySearchText = (value: string) => {
  const parsed = splitCategoryDisplay(value)
  return `${parsed.label} ${parsed.value}`.trim()
}
