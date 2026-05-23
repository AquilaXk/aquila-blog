
import type { JSONContent } from "@tiptap/core"
import { parseMarkdownToEditorDoc } from "./serializationHtmlImport"
import type { BlockEditorDoc, UnsupportedBlock } from "./serializationTypes"

const INVISIBLE_CODE_PLACEHOLDER_REGEX = /[\u00A0\u200B-\u200D\u2060\uFEFF]/g

const readPlainTextFromEditorNode = (node: JSONContent): string => {
  if (node.type === "text") return typeof node.text === "string" ? node.text : ""
  return (node.content || []).map((child) => readPlainTextFromEditorNode(child)).join("")
}

const hasVisibleCodeText = (value: string) =>
  value.replace(INVISIBLE_CODE_PLACEHOLDER_REGEX, "").trim().length > 0

const collectCodeBlockSnapshots = (doc: JSONContent) => {
  const blocks: Array<{ language: string | null; text: string }> = []

  const visit = (node: JSONContent) => {
    if (node.type === "codeBlock") {
      blocks.push({
        language: typeof node.attrs?.language === "string" ? node.attrs.language : null,
        text: readPlainTextFromEditorNode(node),
      })
      return
    }

    ;(node.content || []).forEach(visit)
  }

  visit(doc)
  return blocks
}

export const restoreEditorDocCodeBlocksFromMarkdown = (
  sourceMarkdown: string,
  doc: BlockEditorDoc
): { doc: BlockEditorDoc; changed: boolean } => {
  const sourceBlocks = collectCodeBlockSnapshots(parseMarkdownToEditorDoc(sourceMarkdown))
  if (sourceBlocks.every((block) => !hasVisibleCodeText(block.text))) {
    return { doc, changed: false }
  }

  let codeBlockIndex = 0
  let changed = false

  const restoreNode = (node: JSONContent): JSONContent => {
    if (node.type === "codeBlock") {
      const sourceBlock = sourceBlocks[codeBlockIndex]
      codeBlockIndex += 1

      const currentText = readPlainTextFromEditorNode(node)
      const sourceText = sourceBlock?.text || ""
      if (hasVisibleCodeText(currentText) || !hasVisibleCodeText(sourceText)) return node

      changed = true
      const currentLanguage = typeof node.attrs?.language === "string" ? node.attrs.language : null
      return {
        ...node,
        attrs: {
          ...(node.attrs || {}),
          language: currentLanguage || sourceBlock?.language || null,
        },
        content: [{ type: "text", text: sourceText }],
      }
    }

    if (!node.content?.length) return node

    let childChanged = false
    const nextContent = node.content.map((child) => {
      const nextChild = restoreNode(child)
      if (nextChild !== child) childChanged = true
      return nextChild
    })

    return childChanged ? { ...node, content: nextContent } : node
  }

  const restoredDoc = restoreNode(doc)
  return { doc: changed ? restoredDoc : doc, changed }
}

export const detectUnsupportedMarkdownBlocks = (markdown: string): UnsupportedBlock[] => {
  const doc = parseMarkdownToEditorDoc(markdown)
  const unsupported: UnsupportedBlock[] = []

  const visit = (node?: JSONContent) => {
    if (!node) return
    if (node.type === "rawMarkdownBlock") {
      unsupported.push({
        markdown: String(node.attrs?.markdown || ""),
        reason: String(node.attrs?.reason || "unsupported"),
      })
    }
    for (const child of node.content || []) visit(child)
  }

  visit(doc)
  return unsupported
}
