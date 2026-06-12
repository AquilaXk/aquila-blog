
import type { JSONContent } from "@tiptap/core"
import { normalizeInlineColorToken } from "src/libs/markdown/inlineColor"
import type { EditorTextMark, EditorTextNode } from "./serializationTypes"

const MARKDOWN_ESCAPABLE_INLINE_CHARS = new Set([
  "\\",
  "`",
  "*",
  "_",
  "{",
  "}",
  "[",
  "]",
  "(",
  ")",
  "#",
  "+",
  "-",
  ".",
  "!",
  "$",
  "~",
  ">",
])
const INLINE_PATTERN_PREFIXES = ["{{", "[", "**", "~~", "`", "$", "*"]
const MARKDOWN_ESCAPE_PATTERN = /[\\`*_{}\[\]()!$]/g
const MARKDOWN_TILDE_RUN_PATTERN = /~{2,}/g
const MARKDOWN_ORDERED_BLOCK_START_PATTERN = /^( {0,3})(\d+)(\.)(?=\s|$)/
const MARKDOWN_DIVIDER_BLOCK_START_PATTERN = /^( {0,3})(-)(?:\s*-){2,}\s*$/

const isEscapedMarkdownCharacter = (character: string | undefined) =>
  Boolean(character && MARKDOWN_ESCAPABLE_INLINE_CHARS.has(character))

export const escapeMarkdownInlineText = (text: string) =>
  text
    .replace(MARKDOWN_ESCAPE_PATTERN, "\\$&")
    .replace(MARKDOWN_TILDE_RUN_PATTERN, (match) =>
      Array.from(match, (character) => `\\${character}`).join("")
    )

export const unescapeMarkdownInlineText = (text: string) =>
  text.replace(/\\([\\`*_{}\[\]()!$~>#+\-.])/g, "$1")

const escapeMarkdownBlockStartLine = (line: string) => {
  if (MARKDOWN_DIVIDER_BLOCK_START_PATTERN.test(line)) {
    return line.replace(/^( {0,3})(-)/, "$1\\$2")
  }
  if (/^( {0,3})(#{1,6})(?=\s|$)/.test(line)) {
    return line.replace(/^( {0,3})(#)/, "$1\\$2")
  }
  if (/^( {0,3})([-+])(?=\s|$)/.test(line)) {
    return line.replace(/^( {0,3})([-+])/, "$1\\$2")
  }
  if (MARKDOWN_ORDERED_BLOCK_START_PATTERN.test(line)) {
    return line.replace(
      MARKDOWN_ORDERED_BLOCK_START_PATTERN,
      "$1$2\\$3"
    )
  }
  if (/^(\s*)(>)/.test(line)) {
    return line.replace(/^(\s*)(>)/, "$1\\$2")
  }
  return line
}

const escapeMarkdownBlockStartText = (text: string) =>
  text.split("\n").map(escapeMarkdownBlockStartLine).join("\n")

const getMaxBacktickRun = (text: string) =>
  (text.match(/`+/g) || []).reduce(
    (max, run) => Math.max(max, run.length),
    0
  )

const normalizeInlineCodeSpanContent = (content: string) => {
  const normalized = content.replace(/\r\n?/g, "\n")
  if (
    normalized.startsWith(" ") &&
    normalized.endsWith(" ") &&
    /\S/.test(normalized.slice(1, -1))
  ) {
    return normalized.slice(1, -1)
  }
  return normalized
}

export const matchInlineCodeSpan = (value: string) => {
  const delimiterMatch = value.match(/^`+/)
  if (!delimiterMatch) return null
  const delimiter = delimiterMatch[0]
  let searchIndex = delimiter.length

  while (searchIndex < value.length) {
    const nextBacktickIndex = value.indexOf("`", searchIndex)
    if (nextBacktickIndex < 0) return null
    const nextRun = value.slice(nextBacktickIndex).match(/^`+/)?.[0] || ""
    if (nextRun.length === delimiter.length) {
      const rawCode = value.slice(delimiter.length, nextBacktickIndex)
      if (!rawCode) return null
      return {
        full: value.slice(0, nextBacktickIndex + delimiter.length),
        code: normalizeInlineCodeSpanContent(rawCode),
      }
    }
    searchIndex = nextBacktickIndex + Math.max(1, nextRun.length)
  }

  return null
}

export const serializeInlineCodeSpanText = (text: string) => {
  const delimiter = "`".repeat(Math.max(1, getMaxBacktickRun(text) + 1))
  const needsPadding =
    text.startsWith("`") ||
    text.endsWith("`") ||
    text.startsWith(" ") ||
    text.endsWith(" ")
  const content = needsPadding ? ` ${text} ` : text
  return `${delimiter}${content}${delimiter}`
}

export const buildTextNode = (text: string, marks?: EditorTextMark[]): EditorTextNode => ({
  type: "text",
  text,
  ...(marks && marks.length > 0 ? { marks } : {}),
})

export const pushPlainText = (nodes: JSONContent[], text: string) => {
  if (!text) return
  const previousNode = nodes[nodes.length - 1]
  if (previousNode?.type === "text" && !previousNode.marks) {
    previousNode.text = `${previousNode.text || ""}${text}`
    return
  }
  nodes.push(buildTextNode(text))
}

export const appendMarkToInlineTextNodes = (nodes: JSONContent[], mark: EditorTextMark) =>
  nodes.map((node) => {
    if (node.type !== "text") return node

    const marks = Array.isArray(node.marks) ? [...node.marks, mark] : [mark]
    return {
      ...node,
      marks,
    }
  })

export const buildInlineFormulaNode = (formula: string): JSONContent => ({
  type: "inlineFormula",
  attrs: {
    formula: formula.trim(),
  },
})

export const matchInlineFormula = (value: string) => {
  if (!value.startsWith("$") || value.startsWith("$$")) return null
  const match = value.match(/^\$((?:\\\$|[^$\n])+?)\$/)
  if (!match) return null

  const formula = String(match[1] || "").trim()
  return formula ? { full: match[0], formula } : null
}

export const findNextInlinePatternStart = (value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "\\" && isEscapedMarkdownCharacter(value[index + 1])) {
      return index
    }

    if (INLINE_PATTERN_PREFIXES.some((prefix) => value.startsWith(prefix, index))) {
      return index
    }
  }

  return -1
}

export const buildInlineContent = (text: string): JSONContent[] => {
  if (!text) return []

  const nodes: JSONContent[] = []
  let index = 0

  while (index < text.length) {
    if (text[index] === "\\" && isEscapedMarkdownCharacter(text[index + 1])) {
      pushPlainText(nodes, text[index + 1] || "")
      index += 2
      continue
    }

    const nextPatterns = [
      {
        name: "inlineColor",
        match: text.slice(index).match(/^\{\{\s*color\s*:\s*([^|{}]+?)\s*\|\s*([^{}]+?)\s*\}\}/),
      },
      {
        name: "link",
        match: text.slice(index).match(/^\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/),
      },
      {
        name: "bold",
        match: text.slice(index).match(/^\*\*([^*]+)\*\*/),
      },
      {
        name: "strike",
        match: text.slice(index).match(/^~~([^~]+)~~/),
      },
      {
        name: "code",
        match: (() => {
          const codeMatch = matchInlineCodeSpan(text.slice(index))
          if (!codeMatch) return null
          return Object.assign([codeMatch.full, codeMatch.code], {
            index: 0,
            input: text.slice(index),
          }) as RegExpMatchArray
        })(),
      },
      {
        name: "inlineFormula",
        match: (() => {
          const formulaMatch = matchInlineFormula(text.slice(index))
          if (!formulaMatch) return null
          return Object.assign([formulaMatch.full, formulaMatch.formula], {
            index: 0,
            input: text.slice(index),
          }) as RegExpMatchArray
        })(),
      },
      {
        name: "italic",
        match: text.slice(index).match(/^\*([^*]+)\*/),
      },
    ].filter((entry) => entry.match)

    if (nextPatterns.length === 0) {
      const remaining = text.slice(index)
      const nextPatternStart = findNextInlinePatternStart(remaining)
      if (nextPatternStart < 0) {
        pushPlainText(nodes, remaining)
        break
      }
      if (nextPatternStart === 0) {
        pushPlainText(nodes, remaining[0] || "")
        index += 1
        continue
      }
      pushPlainText(nodes, remaining.slice(0, nextPatternStart))
      index += nextPatternStart
      continue
    }

    const nextPattern = nextPatterns.reduce((prev, current) => {
      if (!prev.match) return current
      if (!current.match) return prev
      return current.match.index === 0 ? current : prev
    })

    if (!nextPattern.match) {
      pushPlainText(nodes, text.slice(index))
      break
    }

    if (nextPattern.match.index && nextPattern.match.index > 0) {
      pushPlainText(nodes, text.slice(index, index + nextPattern.match.index))
      index += nextPattern.match.index
      continue
    }

    const [full, first, second] = nextPattern.match

    if (nextPattern.name === "inlineColor") {
      const normalizedColor = normalizeInlineColorToken(first)
      if (!normalizedColor || !second?.trim()) {
        pushPlainText(nodes, full)
      } else {
        nodes.push(
          ...appendMarkToInlineTextNodes(buildInlineContent(second), {
            type: "inlineColor",
            attrs: {
              color: normalizedColor,
            },
          })
        )
      }
    } else if (nextPattern.name === "link") {
      nodes.push(
        ...appendMarkToInlineTextNodes(buildInlineContent(first), {
          type: "link",
          attrs: {
            href: second,
          },
        })
      )
    } else if (nextPattern.name === "bold") {
      nodes.push(buildTextNode(unescapeMarkdownInlineText(first), [{ type: "bold" }]))
    } else if (nextPattern.name === "italic") {
      nodes.push(buildTextNode(unescapeMarkdownInlineText(first), [{ type: "italic" }]))
    } else if (nextPattern.name === "strike") {
      nodes.push(buildTextNode(unescapeMarkdownInlineText(first), [{ type: "strike" }]))
    } else if (nextPattern.name === "code") {
      nodes.push(buildTextNode(first, [{ type: "code" }]))
    } else if (nextPattern.name === "inlineFormula") {
      nodes.push(buildInlineFormulaNode(first))
    }

    index += full.length
  }

  return nodes.length > 0 ? nodes : [{ type: "text", text }]
}

export const serializeTextNode = (node: JSONContent) => {
  if (node.type !== "text") return ""
  const rawText = node.text || ""
  const marks = node.marks || []
  const linkMark = marks.find((mark) => mark.type === "link" && mark.attrs?.href)
  const inlineColorMark = marks.find((mark) => mark.type === "inlineColor" && mark.attrs?.color)
  const otherMarks = marks.filter((mark) => mark !== linkMark && mark !== inlineColorMark)
  const codeMark = otherMarks.find((mark) => mark.type === "code")
  const wrapperMarks = otherMarks.filter((mark) => mark !== codeMark)

  let text = codeMark
    ? serializeInlineCodeSpanText(rawText)
    : escapeMarkdownInlineText(rawText)

  for (const mark of wrapperMarks) {
    if (mark.type === "bold") text = `**${text}**`
    if (mark.type === "italic") text = `*${text}*`
    if (mark.type === "strike") text = `~~${text}~~`
  }

  const normalizedColor = inlineColorMark?.attrs?.color
    ? normalizeInlineColorToken(String(inlineColorMark.attrs.color))
    : null

  if (normalizedColor) {
    text = `{{color:${normalizedColor}|${text}}}`
  }

  if (linkMark?.attrs?.href) {
    return `[${text}](${linkMark.attrs.href})`
  }

  return text
}

export const serializeInlineFormulaNode = (node: JSONContent) => {
  const formula = String(node.attrs?.formula || "").trim()
  return formula ? `$${formula}$` : ""
}

export const serializeInlineContent = (content?: JSONContent[]) =>
  (content || [])
    .map((node) => {
      if (node.type === "text") return serializeTextNode(node)
      if (node.type === "inlineFormula") return serializeInlineFormulaNode(node)
      return ""
    })
    .join("")

export const serializeParagraphLikeNode = (node: JSONContent) => {
  if (!node.content || node.content.length === 0) return ""
  return escapeMarkdownBlockStartText(serializeInlineContent(node.content))
}
