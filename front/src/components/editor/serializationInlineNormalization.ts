
import type { JSONContent } from "@tiptap/core"
import { normalizeInlineColorToken } from "src/libs/markdown/inlineColor"
import type { EditorTextMark, EditorTextNode } from "./serializationTypes"

export const buildTextNode = (text: string, marks?: EditorTextMark[]): EditorTextNode => ({
  type: "text",
  text,
  ...(marks && marks.length > 0 ? { marks } : {}),
})

export const pushPlainText = (nodes: JSONContent[], text: string) => {
  if (!text) return
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
  const candidates = [
    value.indexOf("{{"),
    value.indexOf("["),
    value.indexOf("**"),
    value.indexOf("~~"),
    value.indexOf("`"),
    value.indexOf("$"),
    value.indexOf("*"),
  ].filter((index) => index >= 0)

  if (candidates.length === 0) return -1
  return Math.min(...candidates)
}

export const buildInlineContent = (text: string): JSONContent[] => {
  if (!text) return []

  const nodes: JSONContent[] = []
  let index = 0

  while (index < text.length) {
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
        match: text.slice(index).match(/^`([^`]+)`/),
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
      nodes.push(buildTextNode(first, [{ type: "bold" }]))
    } else if (nextPattern.name === "italic") {
      nodes.push(buildTextNode(first, [{ type: "italic" }]))
    } else if (nextPattern.name === "strike") {
      nodes.push(buildTextNode(first, [{ type: "strike" }]))
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

  let text = rawText

  for (const mark of otherMarks) {
    if (mark.type === "bold") text = `**${text}**`
    if (mark.type === "italic") text = `*${text}*`
    if (mark.type === "strike") text = `~~${text}~~`
    if (mark.type === "code") text = `\`${text}\``
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
  return serializeInlineContent(node.content)
}
