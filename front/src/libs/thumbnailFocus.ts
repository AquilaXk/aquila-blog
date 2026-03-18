const THUMBNAIL_FOCUS_X_TOKEN_REGEX = /::aqfx=([-+]?\d*\.?\d+)/g
const THUMBNAIL_FOCUS_TOKEN_REGEX = /::aqfy=([-+]?\d*\.?\d+)/g
const THUMBNAIL_ZOOM_TOKEN_REGEX = /::aqfz=([-+]?\d*\.?\d+)/g

export const DEFAULT_THUMBNAIL_FOCUS_X = 50
export const DEFAULT_THUMBNAIL_FOCUS_Y = 38
export const DEFAULT_THUMBNAIL_ZOOM = 1
export const MIN_THUMBNAIL_ZOOM = 1
export const MAX_THUMBNAIL_ZOOM = 2.5

const roundThumbnailFocusX = (value: number) => Math.round(value * 10) / 10
const roundThumbnailFocusY = (value: number) => Math.round(value * 10) / 10
const roundThumbnailZoom = (value: number) => Math.round(value * 100) / 100

export const clampThumbnailFocusX = (value: number) => {
  if (!Number.isFinite(value)) return DEFAULT_THUMBNAIL_FOCUS_X
  if (value < 0) return 0
  if (value > 100) return 100
  return roundThumbnailFocusX(value)
}

export const clampThumbnailFocusY = (value: number) => {
  if (!Number.isFinite(value)) return DEFAULT_THUMBNAIL_FOCUS_Y
  if (value < 0) return 0
  if (value > 100) return 100
  return roundThumbnailFocusY(value)
}

export const getThumbnailFocusXFromUrl = (raw: string): number | null => {
  const value = raw.trim()
  if (!value) return null

  let match: RegExpMatchArray | null = null
  for (const token of value.matchAll(THUMBNAIL_FOCUS_X_TOKEN_REGEX)) {
    match = token
  }

  if (!match || match.length < 2) return null
  const parsed = Number.parseFloat(match[1])
  if (!Number.isFinite(parsed)) return null
  return clampThumbnailFocusX(parsed)
}

export const getThumbnailFocusYFromUrl = (raw: string): number | null => {
  const value = raw.trim()
  if (!value) return null

  let match: RegExpMatchArray | null = null
  for (const token of value.matchAll(THUMBNAIL_FOCUS_TOKEN_REGEX)) {
    match = token
  }

  if (!match || match.length < 2) return null
  const parsed = Number.parseFloat(match[1])
  if (!Number.isFinite(parsed)) return null
  return clampThumbnailFocusY(parsed)
}

export const parseThumbnailFocusYFromUrl = (
  raw: string,
  fallback = DEFAULT_THUMBNAIL_FOCUS_Y
) => getThumbnailFocusYFromUrl(raw) ?? fallback

export const parseThumbnailFocusXFromUrl = (
  raw: string,
  fallback = DEFAULT_THUMBNAIL_FOCUS_X
) => getThumbnailFocusXFromUrl(raw) ?? fallback

export const clampThumbnailZoom = (value: number) => {
  if (!Number.isFinite(value)) return DEFAULT_THUMBNAIL_ZOOM
  if (value < MIN_THUMBNAIL_ZOOM) return MIN_THUMBNAIL_ZOOM
  if (value > MAX_THUMBNAIL_ZOOM) return MAX_THUMBNAIL_ZOOM
  return roundThumbnailZoom(value)
}

export const getThumbnailZoomFromUrl = (raw: string): number | null => {
  const value = raw.trim()
  if (!value) return null

  let match: RegExpMatchArray | null = null
  for (const token of value.matchAll(THUMBNAIL_ZOOM_TOKEN_REGEX)) {
    match = token
  }

  if (!match || match.length < 2) return null
  const parsed = Number.parseFloat(match[1])
  if (!Number.isFinite(parsed)) return null
  return clampThumbnailZoom(parsed)
}

export const parseThumbnailZoomFromUrl = (
  raw: string,
  fallback = DEFAULT_THUMBNAIL_ZOOM
) => getThumbnailZoomFromUrl(raw) ?? fallback

export const stripThumbnailFocusFromUrl = (raw: string): string => {
  const value = raw.trim()
  if (!value) return ""

  const stripped = value
    .replaceAll(THUMBNAIL_FOCUS_X_TOKEN_REGEX, "")
    .replaceAll(THUMBNAIL_FOCUS_TOKEN_REGEX, "")
    .replaceAll(THUMBNAIL_ZOOM_TOKEN_REGEX, "")
  if (stripped.endsWith("#")) return stripped.slice(0, -1)
  return stripped
}

export const applyThumbnailFocusYToUrl = (raw: string, focusY: number): string => {
  const normalizedUrl = stripThumbnailFocusFromUrl(raw)
  if (!normalizedUrl) return ""

  const normalizedFocus = clampThumbnailFocusY(focusY)
  if (normalizedUrl.includes("#")) return `${normalizedUrl}::aqfy=${normalizedFocus}`
  return `${normalizedUrl}#::aqfy=${normalizedFocus}`
}

export const applyThumbnailTransformToUrl = (
  raw: string,
  options: { focusX: number; focusY: number; zoom: number }
): string => {
  const normalizedUrl = stripThumbnailFocusFromUrl(raw)
  if (!normalizedUrl) return ""

  const normalizedFocusX = clampThumbnailFocusX(options.focusX)
  const normalizedFocus = clampThumbnailFocusY(options.focusY)
  const normalizedZoom = clampThumbnailZoom(options.zoom)
  const token = `::aqfx=${normalizedFocusX}::aqfy=${normalizedFocus}::aqfz=${normalizedZoom}`
  if (normalizedUrl.includes("#")) return `${normalizedUrl}${token}`
  return `${normalizedUrl}#${token}`
}
