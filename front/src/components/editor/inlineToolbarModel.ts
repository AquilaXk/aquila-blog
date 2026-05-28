import type { Editor as TiptapEditor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { normalizeInlineColorToken } from "src/libs/markdown/inlineColor"

export type InlineTextStyleOption = {
  id: "paragraph" | "heading-1" | "heading-2" | "heading-3" | "heading-4"
  label: string
  shortLabel: string
  isActive: (activeEditor: TiptapEditor) => boolean
  run: (activeEditor: TiptapEditor) => void
}

export type InlineMarkCommandId = "bold" | "italic" | "strike" | "code"

type InlineMarkCommand = {
  isActive: (activeEditor: TiptapEditor) => boolean
  run: (activeEditor: TiptapEditor) => void
}

export const INLINE_MARK_COMMANDS: Record<
  InlineMarkCommandId,
  InlineMarkCommand
> = {
  bold: {
    isActive: (activeEditor) => activeEditor.isActive("bold"),
    run: (activeEditor) => {
      activeEditor.chain().focus().toggleBold().run()
    },
  },
  italic: {
    isActive: (activeEditor) => activeEditor.isActive("italic"),
    run: (activeEditor) => {
      activeEditor.chain().focus().toggleItalic().run()
    },
  },
  strike: {
    isActive: (activeEditor) => activeEditor.isActive("strike"),
    run: (activeEditor) => {
      activeEditor.chain().focus().toggleStrike().run()
    },
  },
  code: {
    isActive: (activeEditor) => activeEditor.isActive("code"),
    run: (activeEditor) => {
      activeEditor.chain().focus().toggleCode().run()
    },
  },
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

export const isInlineMarkCommandActive = (
  editor: TiptapEditor | null | undefined,
  commandId: InlineMarkCommandId
) => {
  if (!editor) return false
  return INLINE_MARK_COMMANDS[commandId].isActive(editor)
}

export const isInlineCodeMarkActive = (
  editor: TiptapEditor | null | undefined
) => isInlineMarkCommandActive(editor, "code")

const syncEditorSelectionFromDomSelection = (editor: TiptapEditor) => {
  if (typeof window === "undefined") return
  const domSelection = window.getSelection()
  const range = domSelection && domSelection.rangeCount > 0 ? domSelection.getRangeAt(0) : null
  const commonAncestor =
    range?.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range?.commonAncestorContainer?.parentElement ?? null
  if (!range || !domSelection || domSelection.isCollapsed || !commonAncestor || !editor.view.dom.contains(commonAncestor) || commonAncestor.closest(".aq-code-editor-content")) return

  try {
    const from = editor.view.posAtDOM(range.startContainer, range.startOffset)
    const to = editor.view.posAtDOM(range.endContainer, range.endOffset)
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return
    const nextSelection = TextSelection.create(editor.state.doc, Math.min(from, to), Math.max(from, to))
    if (!nextSelection.eq(editor.state.selection)) {
      editor.view.dispatch(editor.state.tr.setSelection(nextSelection))
    }
  } catch {
    // NodeView internals that do not map to the editor document keep the current PM selection.
  }
}

export const runInlineMarkCommand = (
  editor: TiptapEditor | null | undefined,
  commandId: InlineMarkCommandId
) => {
  if (!editor) return false
  syncEditorSelectionFromDomSelection(editor)
  INLINE_MARK_COMMANDS[commandId].run(editor)
  return true
}

export const runInlineCode = (editor: TiptapEditor | null | undefined) => {
  return runInlineMarkCommand(editor, "code")
}

export const runInlineColor = (
  editor: TiptapEditor | null | undefined,
  color?: string | null
) => {
  if (!editor) return false
  syncEditorSelectionFromDomSelection(editor)

  const chain = editor.chain().focus().extendMarkRange("inlineColor")
  const normalizedColor = normalizeInlineColorToken(String(color || ""))
  if (!normalizedColor) {
    chain.unsetMark("inlineColor").run()
    return true
  }

  chain.setMark("inlineColor", { color: normalizedColor }).run()
  return true
}

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
  syncEditorSelectionFromDomSelection(editor)
  const option = INLINE_TEXT_STYLE_OPTIONS.find((entry) => entry.id === styleId)
  if (!option) return false
  option.run(editor)
  return true
}
