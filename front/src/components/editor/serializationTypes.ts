
import type { JSONContent } from "@tiptap/core"
import type { CalloutKind } from "src/libs/markdown/rendering"

export type BlockEditorDoc = JSONContent

export const DEFAULT_EMPTY_TABLE_ROW_COUNT = 3
export const DEFAULT_EMPTY_TABLE_COLUMN_COUNT = 3

export type ImageBlockAttrs = {
  src: string
  alt?: string
  title?: string
  widthPx?: number | null
  align?: "left" | "center" | "wide" | "full"
}

export type MermaidBlockAttrs = {
  source: string
}

export type CalloutBlockAttrs = {
  kind: CalloutKind
  title: string
  label?: string | null
}

export type CalloutBlockInput = CalloutBlockAttrs & {
  body?: string
  content?: JSONContent[]
}

export type ToggleBlockAttrs = {
  title: string
  body: string
}

export type ChecklistBlockItem = {
  checked: boolean
  text: string
}

export type ChecklistBlockAttrs = {
  items: ChecklistBlockItem[]
}

export type BookmarkBlockAttrs = {
  url: string
  title: string
  description?: string
  siteName?: string
  provider?: string
  thumbnailUrl?: string
}

export type EmbedBlockAttrs = {
  url: string
  title: string
  caption?: string
  siteName?: string
  provider?: string
  thumbnailUrl?: string
  embedUrl?: string
}

export type FileBlockAttrs = {
  url: string
  name: string
  description?: string
  mimeType?: string
  sizeBytes?: number | null
}

export type FormulaBlockAttrs = {
  formula: string
}

export type InlineFormulaAttrs = {
  formula: string
}

export type RawMarkdownBlockPayload = {
  markdown: string
  reason: string
}

export type UnsupportedBlock = RawMarkdownBlockPayload

export type EditorTextMark = {
  type: string
  attrs?: Record<string, string>
}

export type EditorTextNode = {
  type: "text"
  text: string
  marks?: EditorTextMark[]
}

export const EMPTY_DOC: BlockEditorDoc = {
  type: "doc",
  content: [{ type: "paragraph" }],
}

export const CALL_OUT_KIND_MAP: Record<string, CalloutKind> = {
  TIP: "tip",
  INFO: "info",
  NOTE: "info",
  WARNING: "warning",
  CAUTION: "warning",
  OUTLINE: "outline",
  EXAMPLE: "example",
  SUMMARY: "summary",
  IMPORTANT: "summary",
}

export const CALL_OUT_KIND_LABELS: Record<CalloutKind, string> = {
  tip: "TIP",
  info: "INFO",
  warning: "WARNING",
  outline: "OUTLINE",
  example: "EXAMPLE",
  summary: "SUMMARY",
}
