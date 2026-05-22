import {
  Children,
  createContext,
  type CSSProperties,
  type ReactNode,
  useContext,
} from "react"
import { resolveInlineColorValue } from "src/libs/markdown/inlineColor"

const QUOTED_STRONG_MARKERS = ["**", "__"] as const
const QUOTED_EMPHASIS_MARKERS = ["*", "_"] as const
const INLINE_COLOR_CHILD_PLACEHOLDER_PREFIX = "__AQ_INLINE_COLOR_CHILD_"
const INLINE_COLOR_CHILD_PLACEHOLDER_SUFFIX = "__"
const INLINE_COLOR_CHILD_PLACEHOLDER_REGEX = /__AQ_INLINE_COLOR_CHILD_(\d+)__/g
const INLINE_COLOR_RENDER_REGEX = /\{\{\s*color\s*:\s*([^|{}]+?)\s*\|([\s\S]+?)\s*\}\}/gi
const QUOTED_STRONG_QUOTE_PAIRS = [
  ['"', '"'],
  ["“", "”"],
  ["‘", "’"],
  ["«", "»"],
  ["「", "」"],
  ["『", "』"],
  ["〈", "〉"],
  ["《", "》"],
] as const

const QUOTED_STRONG_QUOTE_MARKERS = QUOTED_STRONG_QUOTE_PAIRS.flatMap(([openQuote, closeQuote]) =>
  openQuote === closeQuote ? [openQuote] : [openQuote, closeQuote]
)

const isLetterOrNumber = (value: string) => /[\p{L}\p{N}]/u.test(value)

type QuotedStrongMatch = {
  end: number
  quotedText: string
}

const matchQuotedStrongAt = (value: string, start: number): QuotedStrongMatch | null => {
  for (const marker of QUOTED_STRONG_MARKERS) {
    if (!value.startsWith(marker, start)) continue

    for (const [openQuote, closeQuote] of QUOTED_STRONG_QUOTE_PAIRS) {
      const quoteStart = start + marker.length
      if (!value.startsWith(openQuote, quoteStart)) continue

      const contentStart = quoteStart + openQuote.length
      const closingToken = `${closeQuote}${marker}`
      const closeIndex = value.indexOf(closingToken, contentStart)
      if (closeIndex < 0) continue

      const suffixIndex = closeIndex + closingToken.length
      const suffixChar = value[suffixIndex] || ""
      if (!suffixChar || !isLetterOrNumber(suffixChar)) continue

      const inner = value.slice(contentStart, closeIndex)
      if (!inner.trim()) continue

      return {
        end: suffixIndex,
        quotedText: `${openQuote}${inner}${closeQuote}`,
      }
    }
  }

  return null
}

const matchQuotedEmphasisAt = (value: string, start: number): QuotedStrongMatch | null => {
  for (const marker of QUOTED_EMPHASIS_MARKERS) {
    if (!value.startsWith(marker, start)) continue

    for (const [openQuote, closeQuote] of QUOTED_STRONG_QUOTE_PAIRS) {
      const quoteStart = start + marker.length
      if (!value.startsWith(openQuote, quoteStart)) continue

      const contentStart = quoteStart + openQuote.length
      const closingToken = `${closeQuote}${marker}`
      const closeIndex = value.indexOf(closingToken, contentStart)
      if (closeIndex < 0) continue

      const suffixIndex = closeIndex + closingToken.length
      const suffixChar = value[suffixIndex] || ""
      if (!suffixChar || !isLetterOrNumber(suffixChar)) continue

      const inner = value.slice(contentStart, closeIndex)
      if (!inner.trim()) continue

      return {
        end: suffixIndex,
        quotedText: `${openQuote}${inner}${closeQuote}`,
      }
    }
  }

  return null
}

const restoreQuotedStrongText = (value: string): ReactNode[] => {
  if (
    (!value.includes("**") && !value.includes("__")) ||
    !QUOTED_STRONG_QUOTE_MARKERS.some((quote) => value.includes(quote))
  ) {
    return [value]
  }

  const nodes: ReactNode[] = []
  let textCursor = 0
  let index = 0
  let strongIndex = 0

  while (index < value.length) {
    const match = matchQuotedStrongAt(value, index)
    if (!match) {
      index += 1
      continue
    }

    if (textCursor < index) {
      nodes.push(value.slice(textCursor, index))
    }

    nodes.push(<strong key={`quoted-strong-${strongIndex}`}>{match.quotedText}</strong>)
    strongIndex += 1
    index = match.end
    textCursor = match.end
  }

  if (strongIndex === 0) return [value]
  if (textCursor < value.length) {
    nodes.push(value.slice(textCursor))
  }

  return nodes
}

const normalizeQuotedStrongChildren = (children: ReactNode) =>
  Children.toArray(children).flatMap((child) => {
    if (typeof child !== "string") return [child]
    return restoreQuotedStrongText(child)
  })

const restoreQuotedEmphasisText = (value: string): ReactNode[] => {
  if (
    (!value.includes("*") && !value.includes("_")) ||
    !QUOTED_STRONG_QUOTE_MARKERS.some((quote) => value.includes(quote))
  ) {
    return [value]
  }

  const nodes: ReactNode[] = []
  let textCursor = 0
  let index = 0
  let emphasisIndex = 0

  while (index < value.length) {
    const match = matchQuotedEmphasisAt(value, index)
    if (!match) {
      index += 1
      continue
    }

    if (textCursor < index) {
      nodes.push(value.slice(textCursor, index))
    }

    nodes.push(<em key={`quoted-emphasis-${emphasisIndex}`}>{match.quotedText}</em>)
    emphasisIndex += 1
    index = match.end
    textCursor = match.end
  }

  if (emphasisIndex === 0) return [value]
  if (textCursor < value.length) {
    nodes.push(value.slice(textCursor))
  }

  return nodes
}

const normalizeQuotedEmphasisChildren = (children: ReactNode) =>
  Children.toArray(children).flatMap((child) => {
    if (typeof child !== "string") return [child]
    return restoreQuotedEmphasisText(child)
  })

const restoreSerializedMarkdownChildren = (serialized: string, sourceChildren: ReactNode[]) => {
  if (!serialized) return []

  const nodes: ReactNode[] = []
  let cursor = 0

  for (const match of serialized.matchAll(INLINE_COLOR_CHILD_PLACEHOLDER_REGEX)) {
    const start = match.index ?? 0
    if (start > cursor) nodes.push(serialized.slice(cursor, start))

    const nodeIndex = Number.parseInt(match[1] || "", 10)
    const node = sourceChildren[nodeIndex]
    if (node !== undefined) nodes.push(node)
    cursor = start + match[0].length
  }

  if (cursor < serialized.length) {
    nodes.push(serialized.slice(cursor))
  }

  return nodes
}

const normalizeInlineColorChildren = (children: ReactNode) => {
  const sourceChildren = Children.toArray(children)
  if (sourceChildren.length === 0) return sourceChildren

  const serialized = sourceChildren
    .map((child, index) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : `${INLINE_COLOR_CHILD_PLACEHOLDER_PREFIX}${index}${INLINE_COLOR_CHILD_PLACEHOLDER_SUFFIX}`
    )
    .join("")

  if (!serialized.includes("{{")) return sourceChildren

  const nodes: ReactNode[] = []
  let cursor = 0
  let colorIndex = 0
  let matched = false

  for (const match of serialized.matchAll(INLINE_COLOR_RENDER_REGEX)) {
    const full = match[0]
    const colorToken = match[1] || ""
    const contentSerialized = match[2] || ""
    const start = match.index ?? 0
    const cssColor = resolveInlineColorValue(colorToken)

    if (start > cursor) {
      nodes.push(...restoreSerializedMarkdownChildren(serialized.slice(cursor, start), sourceChildren))
    }

    if (!cssColor) {
      nodes.push(...restoreSerializedMarkdownChildren(full, sourceChildren))
    } else {
      const contentNodes = restoreSerializedMarkdownChildren(contentSerialized, sourceChildren)
      nodes.push(
        <span
          key={`inline-color-${colorIndex}`}
          className="aq-inline-color"
          style={{ "--aq-inline-color": cssColor } as CSSProperties}
        >
          {contentNodes}
        </span>
      )
      colorIndex += 1
      matched = true
    }

    cursor = start + full.length
  }

  if (!matched) return sourceChildren

  if (cursor < serialized.length) {
    nodes.push(...restoreSerializedMarkdownChildren(serialized.slice(cursor), sourceChildren))
  }

  return nodes
}

const normalizeSoftBreakChildren = (children: ReactNode) => {
  const nodes: ReactNode[] = []
  let breakIndex = 0

  Children.toArray(children).forEach((child) => {
    if (typeof child !== "string") {
      nodes.push(child)
      return
    }

    const parts = child.split("\n")
    parts.forEach((part, index) => {
      if (part) nodes.push(part)
      if (index < parts.length - 1) {
        nodes.push(<br key={`blockquote-soft-break-${breakIndex}`} />)
        breakIndex += 1
      }
    })
  })

  return nodes
}

const MarkdownBlockquoteContext = createContext(false)

export const MarkdownParagraph = ({ children, inCallout = false }: { children: ReactNode; inCallout?: boolean }) => {
  const inBlockquote = useContext(MarkdownBlockquoteContext)
  let normalizedChildren = normalizeInlineColorChildren(children)
  normalizedChildren = normalizeQuotedStrongChildren(normalizedChildren)
  normalizedChildren = normalizeQuotedEmphasisChildren(normalizedChildren)
  if (inBlockquote) {
    normalizedChildren = normalizeSoftBreakChildren(normalizedChildren)
  }

  if (!inCallout) return <p>{normalizedChildren}</p>
  return <p className="aq-markdown-text">{normalizedChildren}</p>
}

export const MarkdownBlockquote = ({ children }: { children: ReactNode }) => (
  <MarkdownBlockquoteContext.Provider value={true}>
    <blockquote>{children}</blockquote>
  </MarkdownBlockquoteContext.Provider>
)

export const extractTextFromMarkdownNode = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(extractTextFromMarkdownNode).join("\n")
  if (!node || typeof node !== "object" || !("props" in node)) return ""
  return extractTextFromMarkdownNode((node as { props?: { children?: ReactNode } }).props?.children)
}
