import type { Editor as TiptapEditor } from "@tiptap/core"

export type BlockToolbarCommandId =
  | "paragraph"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "heading-4"
  | "bullet-list"
  | "ordered-list"
  | "checklist"
  | "quote"

type BlockToolbarCommand = {
  isActive: (activeEditor: TiptapEditor) => boolean
  run: (activeEditor: TiptapEditor) => void
}

const createHeadingCommand = (level: 1 | 2 | 3 | 4): BlockToolbarCommand => ({
  isActive: (activeEditor) => activeEditor.isActive("heading", { level }),
  run: (activeEditor) => {
    activeEditor.chain().focus().toggleHeading({ level }).run()
  },
})

export const BLOCK_TOOLBAR_COMMANDS: Record<
  BlockToolbarCommandId,
  BlockToolbarCommand
> = {
  paragraph: {
    isActive: (activeEditor) => activeEditor.isActive("paragraph"),
    run: (activeEditor) => {
      activeEditor.chain().focus().setParagraph().run()
    },
  },
  "heading-1": createHeadingCommand(1),
  "heading-2": createHeadingCommand(2),
  "heading-3": createHeadingCommand(3),
  "heading-4": createHeadingCommand(4),
  "bullet-list": {
    isActive: (activeEditor) => activeEditor.isActive("bulletList"),
    run: (activeEditor) => {
      activeEditor.chain().focus().toggleBulletList().run()
    },
  },
  "ordered-list": {
    isActive: (activeEditor) => activeEditor.isActive("orderedList"),
    run: (activeEditor) => {
      activeEditor.chain().focus().toggleOrderedList().run()
    },
  },
  checklist: {
    isActive: (activeEditor) => activeEditor.isActive("taskList"),
    run: (activeEditor) => {
      activeEditor.chain().focus().toggleTaskList().run()
    },
  },
  quote: {
    isActive: (activeEditor) => activeEditor.isActive("blockquote"),
    run: (activeEditor) => {
      activeEditor.chain().focus().toggleBlockquote().run()
    },
  },
}

export const BLOCK_INSERT_ACTIVE_NODE_NAMES = {
  "ordered-list": "orderedList",
  checklist: "taskList",
  table: "table",
  callout: "calloutBlock",
  toggle: "toggleBlock",
  bookmark: "bookmarkBlock",
  embed: "embedBlock",
  file: "fileBlock",
  formula: "formulaBlock",
  mermaid: "mermaidBlock",
} as const

type ToolbarBlockInsertActiveId = keyof typeof BLOCK_INSERT_ACTIVE_NODE_NAMES

const hasToolbarBlockInsertActiveNode = (
  itemId: string
): itemId is ToolbarBlockInsertActiveId =>
  Object.prototype.hasOwnProperty.call(BLOCK_INSERT_ACTIVE_NODE_NAMES, itemId)

export const isBlockToolbarCommandActive = (
  editor: TiptapEditor | null | undefined,
  commandId: BlockToolbarCommandId
) => {
  if (!editor) return false
  return BLOCK_TOOLBAR_COMMANDS[commandId].isActive(editor)
}

export const isToolbarBlockInsertActive = (
  editor: TiptapEditor | null | undefined,
  itemId: string
) => {
  if (!editor || !hasToolbarBlockInsertActiveNode(itemId)) return false
  return editor.isActive(BLOCK_INSERT_ACTIVE_NODE_NAMES[itemId])
}

export const runBlockToolbarCommand = (
  editor: TiptapEditor | null | undefined,
  commandId: BlockToolbarCommandId
) => {
  if (!editor) return false
  BLOCK_TOOLBAR_COMMANDS[commandId].run(editor)
  return true
}
