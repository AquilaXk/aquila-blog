
import type { JSONContent } from "@tiptap/core"
import { buildInlineContent } from "./serializationInlineNormalization"
import type {
  BookmarkBlockAttrs,
  ChecklistBlockItem,
  EmbedBlockAttrs,
  FileBlockAttrs,
  FormulaBlockAttrs,
  InlineFormulaAttrs,
  MermaidBlockAttrs,
  ToggleBlockAttrs,
} from "./serializationTypes"

export const createParagraphNode = (text = ""): JSONContent => ({
  type: "paragraph",
  content: buildInlineContent(text),
})

export const createRawBlockNode = (markdown: string, reason: string): JSONContent => ({
  type: "rawMarkdownBlock",
  attrs: {
    markdown,
    reason,
  },
})

export const createListNode = (
  type: "bulletList" | "orderedList",
  items: string[],
  start?: number
): JSONContent => ({
  type,
  ...(type === "orderedList" && start && start > 1 ? { attrs: { start } } : {}),
  content: items.map((item) => ({
    type: "listItem",
    content: [createParagraphNode(item.trim())],
  })),
})

export const createHeadingNode = (level: number, text: string): JSONContent => ({
  type: "heading",
  attrs: { level },
  content: buildInlineContent(text),
})

export const createBlockquoteNode = (text: string): JSONContent => ({
  type: "blockquote",
  content: [createParagraphNode(text)],
})

export const createCodeBlockNode = (language: string | null, code: string): JSONContent => ({
  type: "codeBlock",
  attrs: {
    language: language?.trim() || null,
  },
  content: code ? [{ type: "text", text: code }] : [],
})

export const createHorizontalRuleNode = (): JSONContent => ({
  type: "horizontalRule",
})

export const createBulletListNode = (items: string[]) => createListNode("bulletList", items)

export const createOrderedListNode = (items: string[], start = 1) => createListNode("orderedList", items, start)

export const createMermaidNode = (source: string): JSONContent => ({
  type: "mermaidBlock",
  attrs: {
    source,
  },
})

export const createToggleNode = (attrs: ToggleBlockAttrs): JSONContent => ({
  type: "toggleBlock",
  attrs,
})

export const createTaskListNode = (items: ChecklistBlockItem[]): JSONContent => ({
  type: "taskList",
  content: items.map((item) => ({
    type: "taskItem",
    attrs: {
      checked: item.checked === true,
    },
    content: [createParagraphNode(String(item.text || "").trim())],
  })),
})

// legacy helper 이름은 유지하되, 현재 문서 모델은 taskList/taskItem을 사용한다.
export const createChecklistNode = (items: ChecklistBlockItem[]): JSONContent => createTaskListNode(items)

export const createBookmarkNode = (attrs: BookmarkBlockAttrs): JSONContent => ({
  type: "bookmarkBlock",
  attrs,
})

export const createEmbedNode = (attrs: EmbedBlockAttrs): JSONContent => ({
  type: "embedBlock",
  attrs,
})

export const createFileBlockNode = (attrs: FileBlockAttrs): JSONContent => ({
  type: "fileBlock",
  attrs,
})

export const createFormulaNode = (attrs: FormulaBlockAttrs): JSONContent => ({
  type: "formulaBlock",
  attrs,
})

export const createInlineFormulaNode = (attrs: InlineFormulaAttrs): JSONContent => ({
  type: "inlineFormula",
  attrs,
})
