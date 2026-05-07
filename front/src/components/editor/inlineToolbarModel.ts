import type { Editor as TiptapEditor } from "@tiptap/core"
import { normalizeInlineColorToken } from "src/libs/markdown/inlineColor"

export type InlineTextStyleOption = {
  id: "paragraph" | "heading-1" | "heading-2" | "heading-3" | "heading-4"
  label: string
  shortLabel: string
  isActive: (activeEditor: TiptapEditor) => boolean
  run: (activeEditor: TiptapEditor) => void
}

export const INLINE_TEXT_STYLE_OPTIONS: InlineTextStyleOption[] = [
  {
    id: "paragraph",
    label: "본문",
    shortLabel: "T",
    isActive: (activeEditor) => activeEditor.isActive("paragraph"),
    run: (activeEditor) => {
      activeEditor.chain().focus().setParagraph().run()
    },
  },
  {
    id: "heading-1",
    label: "제목 1",
    shortLabel: "H1",
    isActive: (activeEditor) => activeEditor.isActive("heading", { level: 1 }),
    run: (activeEditor) => {
      activeEditor.chain().focus().setHeading({ level: 1 }).run()
    },
  },
  {
    id: "heading-2",
    label: "제목 2",
    shortLabel: "H2",
    isActive: (activeEditor) => activeEditor.isActive("heading", { level: 2 }),
    run: (activeEditor) => {
      activeEditor.chain().focus().setHeading({ level: 2 }).run()
    },
  },
  {
    id: "heading-3",
    label: "제목 3",
    shortLabel: "H3",
    isActive: (activeEditor) => activeEditor.isActive("heading", { level: 3 }),
    run: (activeEditor) => {
      activeEditor.chain().focus().setHeading({ level: 3 }).run()
    },
  },
  {
    id: "heading-4",
    label: "제목 4",
    shortLabel: "H4",
    isActive: (activeEditor) => activeEditor.isActive("heading", { level: 4 }),
    run: (activeEditor) => {
      activeEditor.chain().focus().setHeading({ level: 4 }).run()
    },
  },
]

export const getActiveInlineColor = (editor: TiptapEditor | null | undefined) =>
  normalizeInlineColorToken(
    String(editor?.getAttributes("inlineColor").color || "")
  )

export const isInlineCodeMarkActive = (
  editor: TiptapEditor | null | undefined
) => editor?.isActive("code") ?? false

export const getActiveInlineTextStyleOption = (
  editor: TiptapEditor | null | undefined
) => {
  if (!editor) return INLINE_TEXT_STYLE_OPTIONS[0]
  return (
    INLINE_TEXT_STYLE_OPTIONS.find((option) => option.isActive(editor)) ||
    INLINE_TEXT_STYLE_OPTIONS[0]
  )
}

export const runInlineTextStyle = (
  editor: TiptapEditor | null | undefined,
  styleId: InlineTextStyleOption["id"]
) => {
  if (!editor) return false
  const option = INLINE_TEXT_STYLE_OPTIONS.find((entry) => entry.id === styleId)
  if (!option) return false
  option.run(editor)
  return true
}
