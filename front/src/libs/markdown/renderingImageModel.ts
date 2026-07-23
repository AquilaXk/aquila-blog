const STANDALONE_MARKDOWN_IMAGE_REGEX =
  /^!\[([^\]]*)\]\((.+?)(?:\s+"([^"]*)")?\)(?:\s*\{([^}]*)\})?\s*$/


export const clampImageWidthPx = (value: number) => Math.min(960, Math.max(180, Math.round(value)))

export const normalizeImageAlign = (
  value: string | null | undefined
): "left" | "center" | "wide" | "full" | undefined => {
  if (!value) return undefined

  const normalized = value.trim().toLowerCase()
  if (normalized === "left" || normalized === "center" || normalized === "wide" || normalized === "full") {
    return normalized
  }

  return undefined
}

export type ParsedStandaloneMarkdownImage = {
  alt: string
  src: string
  title: string
  widthPx?: number
  align?: "left" | "center" | "wide" | "full"
}

export const parseStandaloneMarkdownImageLine = (
  line: string
): ParsedStandaloneMarkdownImage | null => {
  const match = line.trim().match(STANDALONE_MARKDOWN_IMAGE_REGEX)
  if (!match) return null

  const alt = match[1] || ""
  const src = (match[2] || "").trim()
  const title = (match[3] || "").trim()
  const metadata = (match[4] || "").trim()
  const widthFromSuffixMatch = metadata.match(/(?:^|\s)width=(\d{2,4})(?:$|\s)/i)
  const alignFromSuffixMatch = metadata.match(/(?:^|\s)align=(left|center|wide|full)(?:$|\s)/i)
  const widthFromSuffix = Number.parseInt(widthFromSuffixMatch?.[1] || "", 10)
  const widthFromTitleMatch = title.match(/(?:^|\s)width=(\d{2,4})(?:$|\s)/i)
  const widthFromTitle = Number.parseInt(widthFromTitleMatch?.[1] || "", 10)
  const resolvedWidth = Number.isFinite(widthFromSuffix)
    ? widthFromSuffix
    : Number.isFinite(widthFromTitle)
      ? widthFromTitle
      : NaN

  if (!src) return null

  return {
    alt,
    src,
    title,
    widthPx: Number.isFinite(resolvedWidth) ? clampImageWidthPx(resolvedWidth) : undefined,
    align: normalizeImageAlign(alignFromSuffixMatch?.[1]),
  }
}

export const serializeStandaloneMarkdownImageLine = ({
  alt,
  src,
  title,
  widthPx,
  align,
}: ParsedStandaloneMarkdownImage) => {
  const trimmedTitle = title.trim().replace(/\s*width=\d{2,4}\s*/gi, " ").replace(/\s+/g, " ").trim()
  const titlePart = trimmedTitle ? ` "${trimmedTitle}"` : ""
  const metadataParts = [
    widthPx ? `width=${clampImageWidthPx(widthPx)}` : "",
    normalizeImageAlign(align) ? `align=${normalizeImageAlign(align)}` : "",
  ].filter(Boolean)
  const metadataPart = metadataParts.length > 0 ? ` {${metadataParts.join(" ")}}` : ""
  return `![${alt}](${src}${titlePart})${metadataPart}`
}
