export const CATEGORY_EMOJI_OPTIONS = [
  "📁",
  "📂",
  "🗂️",
  "📘",
  "📗",
  "📙",
  "📝",
  "🖥️",
  "🧪",
  "⚙️",
  "🚀",
  "📊",
] as const

type ParsedCategoryDisplay = {
  emoji: string
  label: string
  value: string
}

export const splitCategoryDisplay = (value: string): ParsedCategoryDisplay => {
  const trimmed = value.trim()
  if (!trimmed) {
    return { emoji: "", label: "", value: "" }
  }

  const [firstToken, ...restTokens] = trimmed.split(/\s+/)

  if (restTokens.length > 0 && /\p{Extended_Pictographic}/u.test(firstToken)) {
    const label = restTokens.join(" ").trim()
    return {
      emoji: firstToken,
      label,
      value: `${firstToken} ${label}`.trim(),
    }
  }

  return {
    emoji: "",
    label: trimmed,
    value: trimmed,
  }
}

export const composeCategoryDisplay = (label: string, emoji = ""): string => {
  const normalizedLabel = label.trim()
  const normalizedEmoji = emoji.trim()

  if (!normalizedLabel) return ""
  if (!normalizedEmoji) return normalizedLabel

  return `${normalizedEmoji} ${normalizedLabel}`.trim()
}
