
import type { JSONContent } from "@tiptap/core"
import {
  clampImageWidthPx,
  normalizeImageAlign,
  serializeStandaloneMarkdownImageLine,
} from "src/libs/markdown/rendering"
import {
  CALL_OUT_KIND_LABELS,
  type BlockEditorDoc,
  type BookmarkBlockAttrs,
  type CalloutBlockAttrs,
  type ChecklistBlockAttrs,
  type EmbedBlockAttrs,
  type FileBlockAttrs,
  type FormulaBlockAttrs,
  type MermaidBlockAttrs,
  type ToggleBlockAttrs,
} from "./serializationTypes"
import {
  serializeParagraphLikeNode,
  serializeTextNode,
  serializeInlineFormulaNode,
} from "./serializationInlineNormalization"
import { serializeTable } from "./serializationTableMetadata"

const LIST_ITEM_INDENT = "  "

const getMarkdownFence = (content: string) => {
  const maxBacktickRun = (content.match(/`+/g) || []).reduce(
    (max, run) => Math.max(max, run.length),
    0
  )
  return "`".repeat(Math.max(3, maxBacktickRun + 1))
}

const getRawTextContent = (content?: JSONContent[]) =>
  (content || [])
    .map((child) => (child.type === "text" ? child.text || "" : serializeNode(child)))
    .join("")

const isListNode = (node: JSONContent) =>
  node.type === "bulletList" || node.type === "orderedList" || node.type === "taskList"

const indentMarkdown = (markdown: string, depth: number) => {
  const indent = LIST_ITEM_INDENT.repeat(depth)
  return markdown
    .split("\n")
    .map((line) => `${indent}${line}`)
    .join("\n")
}

const serializeList = (node: JSONContent, depth = 0): string => {
  const items = node.content || []
  const orderedStart =
    node.type === "orderedList" ? Number.parseInt(String(node.attrs?.start || 1), 10) || 1 : 1

  return items
    .map((item, index) => {
      const children = item.content || []
      const paragraphIndex = children.findIndex((child) => child.type === "paragraph")
      const paragraph = paragraphIndex >= 0 ? children[paragraphIndex] : null
      const text = serializeParagraphLikeNode(paragraph || { type: "paragraph", content: [] })
      const marker =
        node.type === "orderedList"
          ? `${orderedStart + index}.`
          : node.type === "taskList"
            ? `- [${item.attrs?.checked ? "x" : " "}]`
            : "-"
      const prefix = LIST_ITEM_INDENT.repeat(depth)
      const nestedBlocks = children
        .filter((_, childIndex) => childIndex !== paragraphIndex)
        .map((child) => {
          const serialized = isListNode(child)
            ? serializeList(child, depth + 1)
            : indentMarkdown(serializeNode(child), depth + 1)
          return serialized.trimEnd()
        })
        .filter(Boolean)

      return [`${prefix}${marker} ${text}`.trimEnd(), ...nestedBlocks].join("\n")
    })
    .join("\n")
}

const serializeChecklistBlock = (attrs: Partial<ChecklistBlockAttrs>) =>
  (attrs.items || [])
    .map((item) => `- [${item.checked ? "x" : " "}] ${String(item.text || "").trim()}`)
    .join("\n")

const serializeCalloutBlock = (node: JSONContent) => {
  const attrs = (node.attrs || {}) as Partial<CalloutBlockAttrs & { body?: string }>
  const kind = attrs.label?.trim() || (attrs.kind ? CALL_OUT_KIND_LABELS[attrs.kind] : "TIP")
  const title = String(attrs.title || "").trim()
  const header = title ? `> [!${kind}] ${title}` : `> [!${kind}]`
  const serializedBody = (() => {
    const bodyContent = Array.isArray(node.content) ? node.content : []
    if (bodyContent.length > 0) {
      return bodyContent.map((child) => serializeNode(child)).filter(Boolean).join("\n\n").trim()
    }
    return String(attrs.body || "").replace(/\r\n?/g, "\n").trim()
  })()
  const normalizedBodyLines = serializedBody ? serializedBody.split("\n") : []

  return [header, ...normalizedBodyLines.map((line) => (line ? `> ${line}` : ">"))].join("\n")
}

const serializeToggleBlock = (attrs: Partial<ToggleBlockAttrs>) => {
  const title = String(attrs.title || "").trim()
  const body = String(attrs.body || "").trim()
  return [`:::toggle ${title}`.trimEnd(), body, ":::"].filter(Boolean).join("\n")
}

const serializeMermaidBlock = (attrs: Partial<MermaidBlockAttrs>) => {
  const source = String(attrs.source || "").trim()
  const fence = getMarkdownFence(source)
  return [`${fence}mermaid`, source, fence].join("\n")
}

const serializeDirectiveBlock = (
  name: "bookmark" | "embed" | "file",
  attrs: Partial<BookmarkBlockAttrs & EmbedBlockAttrs & FileBlockAttrs>,
  url: string,
  primaryText: string,
  secondaryText?: string
) => {
  const metadata =
    name === "file"
      ? {
          ...(attrs.mimeType ? { mimeType: attrs.mimeType } : {}),
          ...(typeof attrs.sizeBytes === "number" && Number.isFinite(attrs.sizeBytes)
            ? { sizeBytes: Math.max(0, Math.round(attrs.sizeBytes)) }
            : {}),
        }
      : {
          ...(attrs.siteName ? { siteName: attrs.siteName } : {}),
          ...(attrs.provider ? { provider: attrs.provider } : {}),
          ...(attrs.thumbnailUrl ? { thumbnailUrl: attrs.thumbnailUrl } : {}),
          ...(name === "embed" && attrs.embedUrl ? { embedUrl: attrs.embedUrl } : {}),
        }

  const metadataComment =
    Object.keys(metadata).length > 0 ? `<!-- aq-${name} ${JSON.stringify(metadata)} -->` : ""
  const directiveBody = [`:::${name} ${url}`.trimEnd(), primaryText, secondaryText || "", ":::"]
    .filter((line, index) => index === 0 || line.trim().length > 0 || index === 3)
    .join("\n")

  return metadataComment ? `${metadataComment}\n${directiveBody}` : directiveBody
}

const serializeFormulaBlock = (attrs: Partial<FormulaBlockAttrs>) => {
  const formula = String(attrs.formula || "").trim()
  return ["$$", formula, "$$"].join("\n")
}

export const serializeNode = (node: JSONContent): string => {
  switch (node.type) {
    case "doc":
      return (node.content || []).map((child) => serializeNode(child)).filter(Boolean).join("\n\n")
    case "paragraph":
      return serializeParagraphLikeNode(node)
    case "text":
      return serializeTextNode(node)
    case "inlineFormula":
      return serializeInlineFormulaNode(node)
    case "heading":
      return `${"#".repeat(Number(node.attrs?.level || 1))} ${serializeParagraphLikeNode(node)}`
    case "bulletList":
    case "orderedList":
      return serializeList(node)
    case "taskList":
      return serializeList(node)
    case "checklistBlock":
      return serializeChecklistBlock(node.attrs as ChecklistBlockAttrs)
    case "blockquote": {
      const content = (node.content || []).map((child) => serializeNode(child)).join("\n")
      return content
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")
    }
    case "codeBlock": {
      const language = (node.attrs?.language as string | null | undefined)?.trim() || ""
      const content = getRawTextContent(node.content)
      const fence = getMarkdownFence(content)
      return `${fence}${language}\n${content}\n${fence}`
    }
    case "horizontalRule":
      return "---"
    case "table":
      return serializeTable(node)
    case "resizableImage":
    case "image":
      return serializeStandaloneMarkdownImageLine({
        alt: String(node.attrs?.alt || ""),
        src: String(node.attrs?.src || ""),
        title: String(node.attrs?.title || ""),
        widthPx: node.attrs?.widthPx ? clampImageWidthPx(Number(node.attrs.widthPx)) : undefined,
        align: normalizeImageAlign(String(node.attrs?.align || "")),
      })
    case "mermaidBlock":
      return serializeMermaidBlock(node.attrs as MermaidBlockAttrs)
    case "calloutBlock":
      return serializeCalloutBlock(node)
    case "toggleBlock":
      return serializeToggleBlock(node.attrs as ToggleBlockAttrs)
    case "bookmarkBlock":
      return serializeDirectiveBlock(
        "bookmark",
        node.attrs as BookmarkBlockAttrs,
        String(node.attrs?.url || ""),
        String(node.attrs?.title || ""),
        String(node.attrs?.description || "")
      )
    case "embedBlock":
      return serializeDirectiveBlock(
        "embed",
        node.attrs as EmbedBlockAttrs,
        String(node.attrs?.url || ""),
        String(node.attrs?.title || ""),
        String(node.attrs?.caption || "")
      )
    case "fileBlock":
      return serializeDirectiveBlock(
        "file",
        node.attrs as FileBlockAttrs,
        String(node.attrs?.url || ""),
        String(node.attrs?.name || ""),
        String(node.attrs?.description || "")
      )
    case "formulaBlock":
      return serializeFormulaBlock(node.attrs as FormulaBlockAttrs)
    case "rawMarkdownBlock":
      return String(node.attrs?.markdown || "")
    default:
      return ""
  }
}

export const serializeEditorDocToMarkdown = (doc: BlockEditorDoc) => {
  const serialized = serializeNode(doc)
  return serialized.replace(/\n{3,}/g, "\n\n").trim()
}
