export const INLINE_COLOR_TOKEN_REGEX = /\{\{\s*color\s*:\s*([^|{}]+?)\s*\|\s*([^{}]+?)\s*\}\}/gi

export const INLINE_TEXT_COLOR_OPTIONS = [
  { label: "하늘", token: "sky", value: "#60a5fa" },
  { label: "바이올렛", token: "violet", value: "#a78bfa" },
  { label: "그린", token: "green", value: "#34d399" },
  { label: "오렌지", token: "orange", value: "#fb923c" },
  { label: "로즈", token: "rose", value: "#f472b6" },
  { label: "옐로", token: "yellow", value: "#facc15" },
  { label: "슬레이트", token: "slate", value: "#94a3b8" },
] as const

const HEX_COLOR_REGEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const RGB_COLOR_REGEX =
  /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i

const NAMED_INLINE_COLORS = Object.fromEntries(
  INLINE_TEXT_COLOR_OPTIONS.map((option) => [option.token, option.value])
) as Record<string, string>

const normalizeHexColor = (value: string) => {
  const trimmed = value.trim().toLowerCase()
  return HEX_COLOR_REGEX.test(trimmed) ? trimmed : null
}

const normalizeRgbColor = (value: string) => {
  const match = value.trim().match(RGB_COLOR_REGEX)
  if (!match) return null

  const rgb = match.slice(1, 4).map((segment) => Number.parseInt(segment, 10))
  if (rgb.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 255)) return null

  return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

export const resolveInlineColorValue = (raw: string) => {
  const normalizedHex = normalizeHexColor(raw)
  if (normalizedHex) return normalizedHex

  const normalizedRgb = normalizeRgbColor(raw)
  if (normalizedRgb) return normalizedRgb

  const token = raw.trim().toLowerCase()
  return NAMED_INLINE_COLORS[token] || null
}

export const normalizeInlineColorToken = (raw: string) => {
  const resolved = resolveInlineColorValue(raw)
  if (!resolved) return null
  return resolved.toLowerCase()
}
