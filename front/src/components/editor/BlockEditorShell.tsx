import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core"
import { keyframes } from "@emotion/react"
import styled from "@emotion/styled"
import AppIcon from "src/components/icons/AppIcon"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import { Fragment, Node as ProseMirrorNode } from "@tiptap/pm/model"
import { NodeSelection, TextSelection, Transaction } from "@tiptap/pm/state"
import { CellSelection, selectedRect, TableMap } from "@tiptap/pm/tables"
import StarterKit from "@tiptap/starter-kit"
import { EditorContent, useEditor } from "@tiptap/react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type {
  ChangeEvent,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react"
import {
  BookmarkBlock,
  CalloutBlock,
  EditorListKeymap,
  EditorListItem,
  EditorTaskItem,
  EditorTaskList,
  EditorCodeBlock,
  EditorTable,
  EmbedBlock,
  FileBlock,
  FormulaBlock,
  InlineFormula,
  getPreferredCodeLanguage,
  InlineColorMark,
  MermaidBlock,
  RawMarkdownBlock,
  ResizableImage,
  ToggleBlock,
} from "./extensions"
import {
  deleteTopLevelBlockAt,
  duplicateTopLevelBlockAt,
  insertTopLevelBlockAt,
  moveNestedListItemToInsertionIndex,
  moveTopLevelBlockToInsertionIndex,
} from "./blockDocumentOps"
import {
  createBlockquoteNode,
  createBookmarkNode,
  createCalloutNode,
  createCodeBlockNode,
  DEFAULT_EMPTY_TABLE_COLUMN_COUNT,
  DEFAULT_EMPTY_TABLE_ROW_COUNT,
  createEmbedNode,
  createFileBlockNode,
  createFormulaNode,
  createHeadingNode,
  createHorizontalRuleNode,
  createInlineFormulaNode,
  createMermaidNode,
  createOrderedListNode,
  createParagraphNode,
  createTaskListNode,
  createToggleNode,
  createBulletListNode,
  parseMarkdownToEditorDoc,
  serializeEditorDocToMarkdown,
  createEmptyTableNode,
  type BlockEditorDoc,
  type FileBlockAttrs,
  type ImageBlockAttrs,
} from "./serialization"
import {
  type MarkdownTableLayout,
  TABLE_MIN_COLUMN_WIDTH_PX,
  TABLE_MIN_ROW_HEIGHT_PX,
  TABLE_WIDE_COLUMN_MIN_WIDTH_PX,
  TABLE_WIDE_PROMOTION_COLUMN_BUDGET_PX,
} from "src/libs/markdown/tableMetadata"
import { markdownContentTypography } from "src/libs/markdown/contentTypography"
import {
  convertHtmlToMarkdown,
  extractPlainTextFromHtml,
  looksLikeStructuredMarkdownDocument,
  normalizeStructuredMarkdownClipboard,
} from "src/libs/markdown/htmlToMarkdown"
import {
  INLINE_TEXT_COLOR_OPTIONS,
  normalizeInlineColorToken,
} from "src/libs/markdown/inlineColor"
import { inferCardKindFromUrl, inferLinkProvider, resolveEmbedPreviewUrl } from "src/libs/unfurl/extractMeta"

type Props = {
  value: string
  onChange: (markdown: string, meta?: BlockEditorChangeMeta) => void
  onUploadImage: (file: File) => Promise<ImageBlockAttrs>
  onUploadFile?: (file: File) => Promise<FileBlockAttrs>
  disabled?: boolean
  className?: string
  preview?: ReactNode
  enableMermaidBlocks?: boolean
  onQaActionsReady?: (actions: BlockEditorQaActions | null) => void
}

type RuntimeGuardWindow = Window & {
  __AQ_RUNTIME_GUARD_ENABLED__?: boolean
  __AQ_RUNTIME_GUARD__?: {
    editorCommitSamples?: number[]
  }
}

const TABLE_OVERFLOW_MODE_WIDE = "wide"

const getTableOverflowMode = (tableNode: { attrs?: Record<string, unknown> } | null | undefined) =>
  tableNode?.attrs?.overflowMode === TABLE_OVERFLOW_MODE_WIDE ? TABLE_OVERFLOW_MODE_WIDE : "normal"

const readSimpleTableColumnCount = (tableNode: JSONContent): number => {
  const rows = Array.isArray(tableNode.content) ? tableNode.content : []
  return rows.reduce((max, row) => {
    const cells = Array.isArray(row.content)
      ? row.content.filter((cell) => cell?.type === "tableCell" || cell?.type === "tableHeader")
      : []
    return Math.max(max, cells.length)
  }, 0)
}

const shouldPromoteWideTableOverflowMode = (columnCount: number, readableWidthBudget: number) =>
  columnCount > 0 && columnCount * TABLE_WIDE_PROMOTION_COLUMN_BUDGET_PX >= readableWidthBudget

const promoteTableBlockToWideOverflowMode = (
  tableNode: JSONContent,
  readableWidthBudget: number
): JSONContent => {
  if (tableNode.type !== "table") return tableNode
  if (getTableOverflowMode(tableNode) === TABLE_OVERFLOW_MODE_WIDE) return tableNode

  const rows = Array.isArray(tableNode.content) ? tableNode.content : []
  const columnCount = readSimpleTableColumnCount(tableNode)
  if (!shouldPromoteWideTableOverflowMode(columnCount, readableWidthBudget)) return tableNode

  const nextColumnWidths = Array.from({ length: columnCount }, (_, columnIndex) => {
    let nextWidth = TABLE_WIDE_COLUMN_MIN_WIDTH_PX
    rows.forEach((row) => {
      const cell = Array.isArray(row.content) ? row.content[columnIndex] : null
      const widthValue = Array.isArray(cell?.attrs?.colwidth) ? cell?.attrs?.colwidth[0] : null
      if (typeof widthValue === "number" && Number.isFinite(widthValue) && widthValue > 0) {
        nextWidth = Math.max(nextWidth, Math.round(widthValue))
      }
    })
    return nextWidth
  })

  let changed = false
  const nextRows = rows.map((row) => {
    if (!Array.isArray(row.content)) return row

    let rowChanged = false
    const nextCells = row.content.map((cell, columnIndex) => {
      if (cell?.type !== "tableCell" && cell?.type !== "tableHeader") return cell

      const nextWidth = nextColumnWidths[columnIndex]
      const currentWidth = Array.isArray(cell.attrs?.colwidth) ? cell.attrs?.colwidth[0] : null
      if (currentWidth === nextWidth) return cell

      rowChanged = true
      changed = true
      return {
        ...cell,
        attrs: {
          ...(cell.attrs || {}),
          colwidth: [nextWidth],
        },
      }
    })

    return rowChanged ? { ...row, content: nextCells } : row
  })

  return {
    ...tableNode,
    attrs: {
      ...(tableNode.attrs || {}),
      overflowMode: TABLE_OVERFLOW_MODE_WIDE,
    },
    ...(changed ? { content: nextRows } : {}),
  }
}

const promotePastedWideTables = (
  doc: BlockEditorDoc,
  readableWidthBudget: number
): BlockEditorDoc => {
  if (!Array.isArray(doc.content) || doc.content.length === 0) return doc

  let changed = false
  const nextContent = doc.content.map((block) => {
    if (!block || block.type !== "table") return block
    const nextBlock = promoteTableBlockToWideOverflowMode(block, readableWidthBudget)
    if (nextBlock !== block) {
      changed = true
    }
    return nextBlock
  })

  return changed ? { ...doc, content: nextContent } : doc
}

export type BlockEditorChangeMeta = {
  editorFocused: boolean
}

export type BlockEditorQaActions = {
  selectTableAxis: (axis: "row" | "column") => void
  selectTableColumnViaDomFallback: (columnIndex: number) => void
  setActiveTableCellAlign: (align: "left" | "center" | "right" | null) => void
  setActiveTableCellBackground: (color: string | null) => void
  addTableRowAfter: () => void
  addTableColumnAfter: () => void
  deleteSelectedTableRow: () => void
  deleteSelectedTableColumn: () => void
  resizeFirstTableRow: (deltaPx: number) => void
  resizeFirstTableColumn: (deltaPx: number) => void
  focusDocumentEnd: () => void
  appendCalloutBlock: () => void
  appendFormulaBlock: () => void
  moveTaskItemInFirstTaskList: (sourceIndex: number, insertionIndex: number) => void
}

type BlockInsertSection = "basic" | "structure" | "media"

type BlockInsertCatalogItem = {
  id: string
  label: string
  helper?: string
  section: BlockInsertSection
  keywords?: string[]
  slashHint?: string
  recommended?: boolean
  quickInsert?: boolean
  toolbarMore?: boolean
  disabled?: boolean
  insertAtCursor: () => void | Promise<void>
  insertAtBlock: (blockIndex: number) => void | Promise<void>
}

type SlashKeyboardEventLike = {
  key: string
  shiftKey?: boolean
  isComposing?: boolean
  timeStamp?: number
  preventDefault: () => void
  stopPropagation?: () => void
  nativeEvent?: {
    stopImmediatePropagation?: () => void
  }
}

type ToolbarAction = {
  id: string
  label: ReactNode
  ariaLabel: string
  run: () => void
  active: boolean
  disabled?: boolean
}

type InlineTextStyleOption = {
  id: "paragraph" | "heading-1" | "heading-2" | "heading-3" | "heading-4"
  label: string
  shortLabel: string
  isActive: (activeEditor: TiptapEditor) => boolean
  run: (activeEditor: TiptapEditor) => void
}

type FloatingBubbleState = {
  visible: boolean
  mode: "text" | "image"
  anchor: "center" | "left"
  left: number
  top: number
}

type TableQuickRailState = {
  visible: boolean
  left: number
  top: number
  tableLeft: number
  tableTop: number
  width: number
  height: number
  rowTop: number
  rowHeight: number
  columnLeft: number
  columnWidth: number
  columnIndex: number
  columnSegments: Array<{
    left: number
    width: number
  }>
}

type TableMenuKind = "row" | "column" | "table"

type TableMenuState =
  | {
      kind: TableMenuKind
      left: number
      top: number
    }
  | null

type TopLevelBlockHandleState = {
  visible: boolean
  blockIndex: number
  left: number
  top: number
  bottom: number
  width: number
}

type BlockSelectionOverlayState = {
  visible: boolean
  left: number
  top: number
  width: number
  height: number
}

type PendingBlockDragState = {
  sourceIndex: number
  pointerId: number
  startX: number
  startY: number
  previewWidth: number
  previewHeight: number
  previewHtml: string
  previewLabel: string
}

type DraggedBlockState =
  | {
      sourceIndex: number
      pointerId: number
      previewWidth: number
      previewHeight: number
      previewHtml: string
      previewLabel: string
    }
  | null

type DraggedNestedListItemState =
  | {
      listBlockIndex: number
      listPath: number[]
      sourceItemIndex: number
    }
  | null

type NestedListItemDropIndicatorState =
  | {
      visible: boolean
      listBlockIndex: number
      listPath: number[]
      insertionIndex: number
      top: number
      left: number
      width: number
    }
  | {
      visible: false
      listBlockIndex: number
      listPath: number[]
      insertionIndex: number
      top: number
      left: number
      width: number
    }

type DropIndicatorState = {
  visible: boolean
  insertionIndex: number
  top: number
  left: number
  width: number
  highlightTop: number
  highlightLeft: number
  highlightWidth: number
  highlightHeight: number
}

type BlockSelectionPointerEventLike = {
  button: number
  detail: number
  clientX: number
  clientY: number
  target: EventTarget | null
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}

const normalizeSlashSearchText = (value: string) => value.trim().toLowerCase()

const compactSlashSearchText = (value: string) => normalizeSlashSearchText(value).replace(/\s+/g, "")
const ENABLE_DESKTOP_TABLE_COLUMN_RAIL = process.env.NEXT_PUBLIC_EDITOR_DESKTOP_TABLE_COLUMN_RAIL === "enabled"

const LIST_ITEM_SELECTOR =
  "li[data-type='taskItem'], li[data-task-item='true'], li[data-list-item='true'], li[data-type='listItem']"
const LIST_CONTAINER_SELECTOR =
  "ul[data-type='taskList'], ul[data-task-list='true'], ul[data-type='bulletList'], ol[data-type='orderedList'], ul, ol"
const MARKDOWN_COMMIT_DEBOUNCE_MS = 140
const MARKDOWN_COMMIT_IDLE_TIMEOUT_MS = 220
const MARKDOWN_COMMIT_MAX_WAIT_MS = 700
const EDITOR_RUNTIME_GUARD_SAMPLE_LIMIT = 240
const MARKDOWN_TABLE_SEPARATOR_CELL_PATTERN = /^:?-{3,}:?$/
const MARKDOWN_LIST_PREFIX_PATTERN = /^\s*(?:[-+*]|\d+\.)\s+/
const MARKDOWN_BLOCKQUOTE_PREFIX_PATTERN = /^\s*>\s?/

const isMarkdownTableRow = (line: string) => {
  const trimmedLine = line.trim()
  if (!trimmedLine.includes("|")) return false

  const normalizedLine = trimmedLine.startsWith("|") ? trimmedLine.slice(1) : trimmedLine
  const rowWithoutEdgePipes = normalizedLine.endsWith("|") ? normalizedLine.slice(0, -1) : normalizedLine
  return rowWithoutEdgePipes.split("|").length >= 2
}

const normalizeTableContextPasteLine = (line: string) => {
  const trimmedLine = line.trim()
  if (!trimmedLine) return ""

  if (isMarkdownTableRow(trimmedLine)) {
    const cells = trimmedLine
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean)
      .filter((cell) => !MARKDOWN_TABLE_SEPARATOR_CELL_PATTERN.test(cell))

    return cells.join(" ").trim()
  }

  return trimmedLine
    .replace(MARKDOWN_LIST_PREFIX_PATTERN, "")
    .replace(MARKDOWN_BLOCKQUOTE_PREFIX_PATTERN, "")
    .trim()
}

const normalizeTableContextPasteText = (...candidates: string[]) => {
  for (const candidate of candidates) {
    if (!candidate.trim()) continue

    const normalized = candidate
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map(normalizeTableContextPasteLine)
      .filter(Boolean)
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()

    if (normalized) return normalized
  }

  return ""
}

const recordEditorCommitDurationForRuntimeGuard = (durationMs: number) => {
  if (typeof window === "undefined" || !Number.isFinite(durationMs) || durationMs <= 0) return

  const runtimeWindow = window as RuntimeGuardWindow
  if (!runtimeWindow.__AQ_RUNTIME_GUARD_ENABLED__) return

  const store = (runtimeWindow.__AQ_RUNTIME_GUARD__ ??= {})
  const nextSamples = [...(store.editorCommitSamples ?? []), durationMs]
  if (nextSamples.length > EDITOR_RUNTIME_GUARD_SAMPLE_LIMIT) {
    nextSamples.splice(0, nextSamples.length - EDITOR_RUNTIME_GUARD_SAMPLE_LIMIT)
  }
  store.editorCommitSamples = nextSamples
}

const INLINE_TEXT_STYLE_OPTIONS: InlineTextStyleOption[] = [
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

const getSlashSearchTerms = (item: BlockInsertCatalogItem) =>
  Array.from(
    new Set(
      [item.label, item.helper ?? "", item.slashHint ?? "", item.section, ...(item.keywords ?? [])]
        .map((value) => normalizeSlashSearchText(value))
        .filter(Boolean)
    )
  )

const getSlashActionGlyph = (item: BlockInsertCatalogItem) => {
  switch (item.id) {
    case "paragraph":
      return "T"
    case "heading-1":
      return "H1"
    case "heading-2":
      return "H2"
    case "heading-3":
      return "H3"
    case "heading-4":
      return "H4"
    case "bullet-list":
      return "•"
    case "ordered-list":
      return "1."
    case "checklist":
      return "☑"
    case "quote":
      return "❞"
    case "code-block":
      return "</>"
    case "table":
      return "▦"
    case "callout":
      return "!"
    case "toggle":
      return "▸"
    case "bookmark":
      return "↗"
    case "embed":
      return "▶"
    case "file":
      return "PDF"
    case "formula":
      return "∑"
    case "divider":
      return "—"
    case "image":
      return "img"
    case "mermaid":
      return "M"
    default:
      return item.slashHint ?? item.label.slice(0, 1)
  }
}

type SlashMenuContext = {
  currentBlockType: string | null
  previousBlockType: string | null
  atDocumentStart: boolean
}

const getSlashMenuContextBonus = (item: BlockInsertCatalogItem, context: SlashMenuContext) => {
  let score = 0

  if (context.atDocumentStart) {
    if (item.id === "heading-1") score += 42
    if (item.id === "heading-2") score += 28
    if (item.id === "paragraph") score += 16
    if (item.id === "image") score += 6
  }

  if (context.currentBlockType === "paragraph") {
    if (item.id === "paragraph") score += 8
    if (item.id === "heading-2") score += 6
    if (item.id === "bullet-list") score += 6
    if (item.id === "code-block") score += 4
  }

  if (context.currentBlockType === "heading") {
    if (item.id === "paragraph") score += 18
    if (item.id === "bullet-list") score += 12
    if (item.id === "quote") score += 10
    if (item.id === "image") score += 8
  }

  if (context.previousBlockType === "heading") {
    if (item.id === "paragraph") score += 24
    if (item.id === "bullet-list") score += 18
    if (item.id === "image") score += 10
    if (item.id === "divider") score += 6
  }

  if (context.previousBlockType === "bulletList" || context.previousBlockType === "orderedList") {
    if (item.id === "bullet-list" || item.id === "ordered-list") score += 16
    if (item.id === "paragraph") score += 14
    if (item.id === "heading-2") score += 8
    if (item.id === "divider") score += 6
  }

  if (
    context.previousBlockType === "codeBlock" ||
    context.previousBlockType === "mermaidBlock" ||
    context.previousBlockType === "table"
  ) {
    if (item.id === "paragraph") score += 20
    if (item.id === "divider") score += 18
    if (item.id === "callout") score += 8
    if (item.id === "image") score += 8
  }

  if (context.previousBlockType === "image") {
    if (item.id === "paragraph") score += 18
    if (item.id === "heading-2") score += 10
    if (item.id === "callout") score += 8
  }

  if (context.previousBlockType === "calloutBlock" || context.previousBlockType === "toggleBlock") {
    if (item.id === "paragraph") score += 18
    if (item.id === "heading-2") score += 10
    if (item.id === "bullet-list") score += 8
  }

  return score
}

const getSlashMenuMatchScore = (
  item: BlockInsertCatalogItem,
  normalizedQuery: string,
  recentIndex: number,
  context: SlashMenuContext
) => {
  const recentBonus = recentIndex >= 0 ? 120 - recentIndex * 8 : 0
  const recommendedBonus = item.recommended ? 20 : 0
  const contextBonus = getSlashMenuContextBonus(item, context)

  if (!normalizedQuery) {
    return recentBonus + recommendedBonus + contextBonus
  }

  const compactQuery = compactSlashSearchText(normalizedQuery)
  const contextTieBreaker = Math.round(contextBonus * 0.42)
  const fields = getSlashSearchTerms(item)

  let score = Number.NEGATIVE_INFINITY
  let keywordIntentBonus = 0

  for (const field of fields) {
    const compactField = compactSlashSearchText(field)

    if (field === normalizedQuery || compactField === compactQuery) {
      score = Math.max(score, 1200)
      if (item.keywords?.some((keyword) => compactSlashSearchText(keyword) === compactQuery)) {
        keywordIntentBonus = Math.max(keywordIntentBonus, 120)
      }
      continue
    }

    if (field.startsWith(normalizedQuery) || compactField.startsWith(compactQuery)) {
      score = Math.max(score, 980)
      if (item.keywords?.some((keyword) => compactSlashSearchText(keyword).startsWith(compactQuery))) {
        keywordIntentBonus = Math.max(keywordIntentBonus, 72)
      }
      continue
    }

    if (field.split(/\s+/).some((token) => compactSlashSearchText(token).startsWith(compactQuery))) {
      score = Math.max(score, 860)
      continue
    }

    if (field.includes(normalizedQuery) || compactField.includes(compactQuery)) {
      score = Math.max(score, 680)
    }
  }

  if (!Number.isFinite(score)) {
    return Number.NEGATIVE_INFINITY
  }

  return score + recentBonus + recommendedBonus + contextTieBreaker + keywordIntentBonus
}

type BlockMenuState =
  | {
      blockIndex: number
      left: number
      top: number
    }
  | null

type SlashMenuState =
  | {
      left: number
      top: number
      from: number
      to: number
      placement: "top" | "bottom"
    }
  | null

type TableRowResizeState = {
  row: HTMLTableRowElement
  cells: HTMLTableCellElement[]
  startY: number
  startHeight: number
}

type TableColumnRailResizeState = {
  pointerId: number
  columnIndex: number
  lastClientX: number
  previewClientX: number
  guideOffsetX: number
}

type TableColumnDragGuideState = {
  visible: boolean
  left: number
  top: number
  height: number
}

const BLOCK_HANDLE_MEDIA_QUERY = "(pointer: coarse)"
const DESKTOP_TABLE_RAIL_MEDIA_QUERY = "(max-width: 768px)"
const DEFAULT_EDITOR_READABLE_WIDTH_PX = 48 * 16
const BLOCK_HANDLE_POSITION_EPSILON_PX = 0.4
const BLOCK_OUTER_SELECT_LEFT_GUTTER_PX = 76
const BLOCK_OUTER_SELECT_LEFT_EDGE_INNER_PX = 6
const BLOCK_OUTER_SELECT_VERTICAL_MARGIN_PX = 10
const TABLE_ROW_RESIZE_EDGE_PX = 6
const TABLE_COLUMN_RESIZE_GUARD_PX = 12
const TABLE_RAIL_EDGE_PADDING_PX = 12
const TABLE_RAIL_BUTTON_SIZE_PX = 32
const TABLE_CORNER_GROUP_WIDTH_PX = 92
const TABLE_COLUMN_AXIS_GROUP_WIDTH_PX = 136
const TABLE_ROW_AXIS_GROUP_WIDTH_PX = 76
const TABLE_COLUMN_RAIL_TRACK_HEIGHT_PX = 12
const TABLE_COLUMN_RAIL_TRACK_OFFSET_PX = 18
const TABLE_COLUMN_RAIL_BUTTON_GAP_PX = 10
const TABLE_SIDE_RAIL_OFFSET_PX = 46
const TABLE_QUICK_RAIL_HIDE_DELAY_MS = 120
const TABLE_MENU_EDGE_PADDING_PX = 16
const TABLE_MENU_ESTIMATED_WIDTH_PX = 308
const TABLE_MENU_ESTIMATED_HEIGHT_PX = 560
const TABLE_WIDTH_BUDGET_META_KEY = "aq-table-width-budget-normalized"
const SLASH_MENU_RECENT_IDS_STORAGE_KEY = "editor:block-slash-recent:v1"
const SLASH_MENU_MAX_RECENT_ITEMS = 6
const SLASH_MENU_EDGE_PADDING_PX = 16
const SLASH_MENU_VERTICAL_GAP_PX = 12
const SLASH_MENU_ESTIMATED_WIDTH_PX = 608
const SLASH_MENU_ESTIMATED_HEIGHT_PX = 560
const TABLE_CELL_COLOR_PRESETS = [
  { label: "하늘", value: "#dbeafe" },
  { label: "하늘 진함", value: "#bfdbfe" },
  { label: "민트", value: "#dcfce7" },
  { label: "청록", value: "#ccfbf1" },
  { label: "노랑", value: "#fef3c7" },
  { label: "주황", value: "#fed7aa" },
  { label: "장미", value: "#ffe4e6" },
  { label: "보라", value: "#ede9fe" },
  { label: "라일락", value: "#ddd6fe" },
  { label: "회색", value: "#e2e8f0" },
] as const

const clampViewportPosition = (
  value: number,
  edgePadding: number,
  viewportSize: number,
  itemSize: number
) => {
  const max = Math.max(edgePadding, viewportSize - itemSize - edgePadding)
  return Math.min(Math.max(value, edgePadding), max)
}

const resolveDesktopTableRailLayout = (
  state: TableQuickRailState,
  trackWidth: number,
  viewportWidth: number,
  viewportHeight: number
) => {
  const trackLeft = clampViewportPosition(
    Math.round(state.tableLeft),
    TABLE_RAIL_EDGE_PADDING_PX,
    viewportWidth,
    Math.max(0, Math.round(trackWidth))
  )
  const trackTop = clampViewportPosition(
    Math.round(state.tableTop - TABLE_COLUMN_RAIL_TRACK_OFFSET_PX),
    TABLE_RAIL_EDGE_PADDING_PX,
    viewportHeight,
    TABLE_COLUMN_RAIL_TRACK_HEIGHT_PX
  )
  const railButtonTop = clampViewportPosition(
    trackTop - TABLE_RAIL_BUTTON_SIZE_PX - TABLE_COLUMN_RAIL_BUTTON_GAP_PX,
    TABLE_RAIL_EDGE_PADDING_PX,
    viewportHeight,
    TABLE_RAIL_BUTTON_SIZE_PX
  )
  const cornerTop = clampViewportPosition(
    railButtonTop,
    TABLE_RAIL_EDGE_PADDING_PX,
    viewportHeight,
    TABLE_RAIL_BUTTON_SIZE_PX
  )
  const cornerLeft = clampViewportPosition(
    trackLeft,
    TABLE_RAIL_EDGE_PADDING_PX,
    viewportWidth,
    TABLE_CORNER_GROUP_WIDTH_PX
  )
  const columnRailLeft = clampViewportPosition(
    Math.max(
      Math.round(trackLeft + TABLE_CORNER_GROUP_WIDTH_PX + 12),
      Math.round(state.columnLeft + Math.max(0, state.columnWidth / 2 - TABLE_COLUMN_AXIS_GROUP_WIDTH_PX / 2))
    ),
    TABLE_RAIL_EDGE_PADDING_PX,
    viewportWidth,
    TABLE_COLUMN_AXIS_GROUP_WIDTH_PX
  )
  const rowRailTop = clampViewportPosition(
    Math.round(state.rowTop + Math.max(0, state.rowHeight / 2 - TABLE_RAIL_BUTTON_SIZE_PX / 2)),
    Math.max(trackTop + 42, TABLE_RAIL_EDGE_PADDING_PX),
    viewportHeight,
    TABLE_RAIL_BUTTON_SIZE_PX
  )
  const rowRailLeft = clampViewportPosition(
    Math.round(trackLeft - TABLE_SIDE_RAIL_OFFSET_PX),
    TABLE_RAIL_EDGE_PADDING_PX,
    viewportWidth,
    TABLE_ROW_AXIS_GROUP_WIDTH_PX
  )

  return {
    trackLeft,
    trackTop,
    cornerLeft,
    cornerTop,
    columnRailLeft,
    columnRailTop: railButtonTop,
    rowRailLeft,
    rowRailTop,
  }
}

const blockHasVisibleContent = (node?: BlockEditorDoc | null): boolean => {
  if (!node) return false

  if (node.type === "text") {
    return Boolean((node as { text?: string }).text?.trim().length)
  }

  if (
    node.type === "resizableImage" ||
    node.type === "calloutBlock" ||
    node.type === "taskList" ||
    node.type === "bookmarkBlock" ||
    node.type === "embedBlock" ||
    node.type === "fileBlock" ||
    node.type === "formulaBlock" ||
    node.type === "toggleBlock" ||
    node.type === "mermaidBlock" ||
    node.type === "rawMarkdownBlock" ||
    node.type === "table" ||
    node.type === "horizontalRule"
  ) {
    return true
  }

  return Array.isArray(node.content) && node.content.some((child) => blockHasVisibleContent(child as BlockEditorDoc))
}

const normalizeMarkdown = (value: string) => value.replace(/\r\n?/g, "\n").trim()

const normalizeTableColorInputValue = (value: unknown) => {
  const normalized = String(value || "").trim()
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : "#dbeafe"
}

const isPrimaryModifierPressed = (event: ReactKeyboardEvent | globalThis.KeyboardEvent) =>
  event.metaKey || event.ctrlKey

const getTopLevelBlockIndexFromSelection = (editor: TiptapEditor) => {
  const { selection } = editor.state
  return Math.max(0, selection.$from.index(0))
}

const getActiveSlashRangeFromEditor = (editor: TiptapEditor): { from: number; to: number } | null => {
  const selection = editor.state.selection
  if (!selection.empty) return null

  const parent = selection.$from.parent
  if (parent.type.name !== "paragraph") return null

  const textBeforeCursor = parent.textContent.slice(0, selection.$from.parentOffset)
  const match = /(^|[\s\u00A0])\/([^\n]*)$/.exec(textBeforeCursor)
  if (!match) return null

  const slashOffset = (match.index ?? 0) + match[1].length
  return {
    from: selection.$from.start() + slashOffset,
    to: selection.from,
  }
}

const getTopLevelBlockPosition = (editor: TiptapEditor, blockIndex: number) => {
  const { doc } = editor.state
  if (doc.childCount === 0) return 1
  const clampedIndex = Math.max(0, Math.min(blockIndex, doc.childCount - 1))
  let position = 1
  for (let index = 0; index < clampedIndex; index += 1) {
    position += doc.child(index).nodeSize
  }
  return position
}

const getFirstEditableTextPositionInNode = (node: any, startPos: number): number | null => {
  if (!node) return null
  if (node.isTextblock) {
    return startPos + 1
  }

  if (!node.childCount) {
    return null
  }

  let childPos = startPos + 1
  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index)
    const nested = getFirstEditableTextPositionInNode(child, childPos)
    if (nested !== null) {
      return nested
    }
    childPos += child.nodeSize
  }

  return null
}

const getEditableTextPositionForTopLevelBlock = (editor: TiptapEditor, blockIndex: number) => {
  const { doc } = editor.state
  if (doc.childCount === 0) return null
  const clampedIndex = Math.max(0, Math.min(blockIndex, doc.childCount - 1))
  const topLevelBlock = doc.child(clampedIndex)
  if (
    ![
      "paragraph",
      "heading",
      "blockquote",
      "bulletList",
      "orderedList",
      "taskList",
      "calloutBlock",
      "toggleBlock",
    ].includes(topLevelBlock.type.name)
  ) {
    return null
  }

  const blockPosition = getTopLevelBlockPosition(editor, clampedIndex)
  return getFirstEditableTextPositionInNode(topLevelBlock, blockPosition)
}

const focusEditorViewWithoutScroll = (editor: TiptapEditor) => {
  if (typeof window === "undefined") {
    editor.view.focus()
    return
  }

  const previousScrollX = window.scrollX
  const previousScrollY = window.scrollY
  editor.view.focus()
  if (window.scrollX !== previousScrollX || window.scrollY !== previousScrollY) {
    window.scrollTo(previousScrollX, previousScrollY)
  }
}

const focusElementWithoutScroll = (element: HTMLElement | null) => {
  if (!element) return
  if (typeof window === "undefined") {
    element.focus()
    return
  }

  const previousScrollX = window.scrollX
  const previousScrollY = window.scrollY
  try {
    element.focus({ preventScroll: true })
  } catch {
    element.focus()
  }
  if (window.scrollX !== previousScrollX || window.scrollY !== previousScrollY) {
    window.scrollTo(previousScrollX, previousScrollY)
  }
}

const selectTopLevelBlockNode = (editor: TiptapEditor, blockIndex: number) => {
  const { doc, tr } = editor.state
  if (doc.childCount === 0) return
  const clampedIndex = Math.max(0, Math.min(blockIndex, doc.childCount - 1))
  const position = getTopLevelBlockPosition(editor, clampedIndex)
  const selection = NodeSelection.create(doc, position)
  editor.view.dispatch(tr.setSelection(selection))
  focusEditorViewWithoutScroll(editor)
}

const resolveBlockHandleAnchorTop = (blockElement: HTMLElement, railHeight: number) => {
  const rect = blockElement.getBoundingClientRect()
  if (typeof window === "undefined") return rect.top + 6

  const lineAnchorElement =
    (blockElement.matches("p, h1, h2, h3, h4, blockquote")
      ? blockElement
      : blockElement.querySelector(":scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > blockquote")) ||
    blockElement

  const computedStyle = window.getComputedStyle(lineAnchorElement as Element)
  const fontSize = Number.parseFloat(computedStyle.fontSize || "16")
  const parsedLineHeight = Number.parseFloat(computedStyle.lineHeight || "")
  const lineHeight =
    Number.isFinite(parsedLineHeight) && parsedLineHeight > 0 ? parsedLineHeight : fontSize * 1.42

  return rect.top + Math.max(0, (lineHeight - railHeight) / 2)
}

const isWithinBlockHandleEpsilon = (prev: number, next: number) =>
  Math.abs(prev - next) <= BLOCK_HANDLE_POSITION_EPSILON_PX

const isStableBlockHandleState = (
  prev: TopLevelBlockHandleState,
  next: TopLevelBlockHandleState
) =>
  prev.visible === next.visible &&
  prev.blockIndex === next.blockIndex &&
  isWithinBlockHandleEpsilon(prev.left, next.left) &&
  isWithinBlockHandleEpsilon(prev.top, next.top) &&
  isWithinBlockHandleEpsilon(prev.bottom, next.bottom) &&
  isWithinBlockHandleEpsilon(prev.width, next.width)

const isStableBlockSelectionOverlayState = (
  prev: BlockSelectionOverlayState,
  next: BlockSelectionOverlayState
) =>
  prev.visible === next.visible &&
  isWithinBlockHandleEpsilon(prev.left, next.left) &&
  isWithinBlockHandleEpsilon(prev.top, next.top) &&
  isWithinBlockHandleEpsilon(prev.width, next.width) &&
  isWithinBlockHandleEpsilon(prev.height, next.height)

const shouldCenterBlockHandleForNode = (node?: BlockEditorDoc | null) =>
  Boolean(
    node &&
      (node.type === "paragraph" ||
        node.type === "heading" ||
        node.type === "blockquote" ||
        node.type === "bulletList" ||
        node.type === "orderedList" ||
        node.type === "taskList")
  )

const isTabBlockSelectionEligible = (editor: TiptapEditor, blockIndex: number | null) => {
  if (blockIndex === null || isTableSelectionActive(editor)) return false
  const blocks = ((editor.getJSON() as BlockEditorDoc).content ?? []) as BlockEditorDoc[]
  return shouldCenterBlockHandleForNode(blocks[blockIndex] ?? null)
}

const resolveDocPosSafe = (editor: TiptapEditor, pos: number) => {
  if (!Number.isFinite(pos)) return null
  const normalizedPos = Math.round(pos)
  const maxPos = editor.state.doc.content.size
  if (normalizedPos < 0 || normalizedPos > maxPos) return null
  try {
    return editor.state.doc.resolve(normalizedPos)
  } catch {
    return null
  }
}

const getCurrentEditorReadableWidthPx = (editor?: TiptapEditor | null) => {
  const contentElement =
    (editor?.view.dom.closest(".aq-block-editor__content") as HTMLElement | null) ??
    (typeof document !== "undefined"
      ? document.querySelector<HTMLElement>(".aq-block-editor__content")
      : null)

  const contentRect = contentElement?.getBoundingClientRect() ?? null
  const measuredWidth = contentRect ? Math.round(contentRect.width) : DEFAULT_EDITOR_READABLE_WIDTH_PX
  const viewportBudget =
    contentRect && typeof window !== "undefined"
      ? Math.round(
          window.innerWidth -
            Math.max(TABLE_RAIL_EDGE_PADDING_PX, Math.round(contentRect.left)) -
            TABLE_RAIL_EDGE_PADDING_PX
        )
      : DEFAULT_EDITOR_READABLE_WIDTH_PX

  return Math.max(
    TABLE_MIN_COLUMN_WIDTH_PX,
    Math.min(
      measuredWidth || DEFAULT_EDITOR_READABLE_WIDTH_PX,
      viewportBudget || DEFAULT_EDITOR_READABLE_WIDTH_PX
    )
  )
}

const shouldClampTableWidthBudget = () => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
  return !window.matchMedia(DESKTOP_TABLE_RAIL_MEDIA_QUERY).matches
}

type TableColumnCellRef = {
  pos: number
  node: {
    attrs?: Record<string, unknown>
  }
}

const collectSimpleTableColumnCells = (tableNode: { forEach: Function }, tablePos: number) => {
  const columns: TableColumnCellRef[][] = []
  let hasMergedCell = false

  tableNode.forEach((rowNode: any, rowOffset: number) => {
    if (rowNode.type?.name !== "tableRow") return
    const rowPos = tablePos + 1 + rowOffset
    let columnIndex = 0

    rowNode.forEach((cellNode: any, cellOffset: number) => {
      const colspan = Math.max(1, Number(cellNode.attrs?.colspan ?? 1) || 1)
      const rowspan = Math.max(1, Number(cellNode.attrs?.rowspan ?? 1) || 1)
      if (colspan !== 1 || rowspan !== 1) {
        hasMergedCell = true
        return
      }

      const cellPos = rowPos + 1 + cellOffset
      columns[columnIndex] ||= []
      columns[columnIndex].push({ pos: cellPos, node: cellNode })
      columnIndex += 1
    })
  })

  return hasMergedCell ? null : columns
}

const findActiveRenderedTable = (
  viewport: HTMLElement | null,
  quickRailState: TableQuickRailState
) => {
  if (!viewport) return null

  const renderedTables = Array.from(
    viewport.querySelectorAll<HTMLTableElement>(".aq-block-editor__content .tableWrapper table, .aq-block-editor__content table")
  )
  if (!renderedTables.length) return null

  const withinTolerance = (left: number, right: number) =>
    Math.abs(left - quickRailState.tableLeft) <= 6 && Math.abs(right - (quickRailState.tableLeft + quickRailState.width)) <= 6

  return (
    renderedTables.find((table) => {
      const rect = table.getBoundingClientRect()
      return withinTolerance(rect.left, rect.right)
    }) ?? renderedTables[0] ?? null
  )
}

const readColumnWidthFromCell = (cell: TableColumnCellRef) => {
  const widthValue = Array.isArray(cell.node.attrs?.colwidth) ? cell.node.attrs?.colwidth[0] : null
  return typeof widthValue === "number" && Number.isFinite(widthValue) && widthValue > 0
    ? Math.max(TABLE_MIN_COLUMN_WIDTH_PX, Math.round(widthValue))
    : TABLE_MIN_COLUMN_WIDTH_PX
}

const hasExplicitColumnWidth = (column: TableColumnCellRef[]) =>
  column.every((cell) => {
    const widthValue = Array.isArray(cell.node.attrs?.colwidth) ? cell.node.attrs?.colwidth[0] : null
    return typeof widthValue === "number" && Number.isFinite(widthValue) && widthValue > 0
  })

const readRenderedColumnWidths = (tableElement: HTMLElement | null) => {
  if (!tableElement) return []

  return Array.from(
    tableElement.querySelectorAll<HTMLElement>("thead tr:first-of-type > th, thead tr:first-of-type > td, tbody tr:first-of-type > th, tbody tr:first-of-type > td, tr:first-of-type > th, tr:first-of-type > td")
  ).map((cell) => Math.max(TABLE_MIN_COLUMN_WIDTH_PX, Math.round(cell.getBoundingClientRect().width)))
}

const shrinkTableColumnWidthsToFit = (widths: number[], budget: number) => {
  const nextWidths = widths.map((width) => Math.max(TABLE_MIN_COLUMN_WIDTH_PX, Math.round(width)))
  let overflow = nextWidths.reduce((sum, width) => sum + width, 0) - budget

  while (overflow > 0) {
    const shrinkableColumns = nextWidths
      .map((width, index) => ({ index, capacity: width - TABLE_MIN_COLUMN_WIDTH_PX, width }))
      .filter((column) => column.capacity > 0)
      .sort((left, right) => right.width - left.width)

    if (shrinkableColumns.length === 0) break

    let changed = false
    const targetShare = Math.max(1, Math.ceil(overflow / shrinkableColumns.length))
    for (const column of shrinkableColumns) {
      if (overflow <= 0) break
      const shrinkBy = Math.min(column.capacity, targetShare, overflow)
      if (shrinkBy <= 0) continue
      nextWidths[column.index] -= shrinkBy
      overflow -= shrinkBy
      changed = true
    }

    if (!changed) break
  }

  return nextWidths
}

const expandTableColumnWidthsToBudget = (widths: number[], budget: number) => {
  const nextWidths = widths.map((width) => Math.max(TABLE_MIN_COLUMN_WIDTH_PX, Math.round(width)))
  const currentTotal = nextWidths.reduce((sum, width) => sum + width, 0)
  const safeBudget = Math.max(TABLE_MIN_COLUMN_WIDTH_PX * nextWidths.length, Math.round(budget))

  if (!nextWidths.length || currentTotal >= safeBudget) {
    return nextWidths
  }

  const deficit = safeBudget - currentTotal
  const weightTotal = nextWidths.reduce((sum, width) => sum + width, 0)
  let consumed = 0

  nextWidths.forEach((width, index) => {
    if (index === nextWidths.length - 1) return
    const ratio = weightTotal > 0 ? width / weightTotal : 1 / nextWidths.length
    const addBy = Math.max(0, Math.floor(deficit * ratio))
    nextWidths[index] += addBy
    consumed += addBy
  })

  let remainder = deficit - consumed
  let cursor = 0
  while (remainder > 0 && nextWidths.length > 0) {
    nextWidths[cursor % nextWidths.length] += 1
    remainder -= 1
    cursor += 1
  }

  return nextWidths
}

const isLegacyCollapsedTableWidthState = (widths: number[]) => {
  if (widths.length <= 1) return false
  return widths.every((width) => width <= TABLE_MIN_COLUMN_WIDTH_PX + 2)
}

const redistributeTableColumnWidthsForResize = (
  widths: number[],
  activeColumnIndex: number,
  deltaPx: number,
  budget: number
) => {
  const nextWidths = widths.map((width) => Math.max(TABLE_MIN_COLUMN_WIDTH_PX, Math.round(width)))
  const activeIndex = Math.max(0, Math.min(activeColumnIndex, nextWidths.length - 1))
  const roundedDelta = Math.round(deltaPx)
  if (!nextWidths.length || roundedDelta === 0) {
    return nextWidths
  }

  if (roundedDelta < 0) {
    nextWidths[activeIndex] = Math.max(TABLE_MIN_COLUMN_WIDTH_PX, nextWidths[activeIndex] + roundedDelta)
    return nextWidths
  }

  const minBudget = TABLE_MIN_COLUMN_WIDTH_PX * nextWidths.length
  const safeBudget = Math.max(minBudget, Math.round(budget))
  const currentTotal = nextWidths.reduce((sum, width) => sum + width, 0)
  let growBy = Math.min(roundedDelta, Math.max(0, safeBudget - currentTotal))
  let remainingGrow = roundedDelta - growBy

  if (remainingGrow > 0) {
    const shrinkableColumns = nextWidths
      .map((width, index) => ({
        index,
        width,
        capacity: index === activeIndex ? 0 : width - TABLE_MIN_COLUMN_WIDTH_PX,
      }))
      .filter((column) => column.capacity > 0)
      .sort((left, right) => right.width - left.width || right.index - left.index)

    for (const column of shrinkableColumns) {
      if (remainingGrow <= 0) break
      const shrinkBy = Math.min(column.capacity, remainingGrow)
      if (shrinkBy <= 0) continue
      nextWidths[column.index] -= shrinkBy
      growBy += shrinkBy
      remainingGrow -= shrinkBy
    }
  }

  if (growBy > 0) {
    nextWidths[activeIndex] += growBy
  }

  return nextWidths
}

const applyTableColumnWidthsToTransaction = (
  transaction: Transaction,
  columns: TableColumnCellRef[][],
  currentWidths: number[],
  nextWidths: number[]
) => {
  let nextTransaction = transaction
  let changed = false

  columns.forEach((column, columnIndex) => {
    const nextWidth = nextWidths[columnIndex]
    const explicitWidthMissing = !hasExplicitColumnWidth(column)
    if (currentWidths[columnIndex] === nextWidth && !explicitWidthMissing) return
    column.forEach((cell) => {
      nextTransaction = nextTransaction.setNodeMarkup(cell.pos, undefined, {
        ...cell.node.attrs,
        colwidth: [nextWidth],
      })
      changed = true
    })
  })

  return { transaction: nextTransaction, changed }
}

const normalizeTableWidthsToReadableBudget = (editor: TiptapEditor) => {
  if (!shouldClampTableWidthBudget()) return false

  const maxTableWidth = getCurrentEditorReadableWidthPx(editor) - 2
  let transaction = editor.state.tr
  let changed = false

  editor.state.doc.descendants((node: any, pos: number) => {
    if (node.type?.name !== "table") return true
    if (getTableOverflowMode(node) === TABLE_OVERFLOW_MODE_WIDE) return true

    const columns = collectSimpleTableColumnCells(node, pos)
    if (!columns || columns.length === 0) return true

    const currentWidths = columns.map((column) => readColumnWidthFromCell(column[0]))
    const requiresExplicitWidths = columns.some((column) => !hasExplicitColumnWidth(column))
    const shouldRecoverLegacyCollapsedWidths = isLegacyCollapsedTableWidthState(currentWidths)
    const minBudget = TABLE_MIN_COLUMN_WIDTH_PX * currentWidths.length
    const safeBudget = Math.max(minBudget, maxTableWidth)
    const totalWidth = currentWidths.reduce((sum, width) => sum + width, 0)
    if (
      totalWidth <= safeBudget &&
      !requiresExplicitWidths &&
      !shouldRecoverLegacyCollapsedWidths
    ) {
      return true
    }

    const nextWidths =
      totalWidth > safeBudget
        ? shrinkTableColumnWidthsToFit(currentWidths, safeBudget)
        : requiresExplicitWidths || shouldRecoverLegacyCollapsedWidths
          ? expandTableColumnWidthsToBudget(currentWidths, safeBudget)
          : currentWidths
    if (
      nextWidths.every((width, index) => width === currentWidths[index]) &&
      !requiresExplicitWidths &&
      !shouldRecoverLegacyCollapsedWidths
    ) {
      return true
    }

    const applied = applyTableColumnWidthsToTransaction(transaction, columns, currentWidths, nextWidths)
    transaction = applied.transaction
    changed ||= applied.changed

    return true
  })

  if (!changed || !transaction.docChanged) return false
  transaction = transaction.setMeta(TABLE_WIDTH_BUDGET_META_KEY, true)
  editor.view.dispatch(transaction)
  return true
}

const syncRenderedTableOverflowModes = (editor: TiptapEditor) => {
  const renderedTables = Array.from(
    editor.view.dom.querySelectorAll<HTMLElement>(".tableWrapper > table")
  )
  let renderedTableIndex = 0

  editor.state.doc.descendants((node: any) => {
    if (node.type?.name !== "table") return true

    const renderedTable = renderedTables[renderedTableIndex] ?? null
    renderedTableIndex += 1
    if (!renderedTable) return true

    const overflowMode = getTableOverflowMode(node)
    if (overflowMode === TABLE_OVERFLOW_MODE_WIDE) {
      renderedTable.setAttribute("data-overflow-mode", TABLE_OVERFLOW_MODE_WIDE)
      renderedTable.parentElement?.setAttribute("data-overflow-mode", TABLE_OVERFLOW_MODE_WIDE)
    } else {
      renderedTable.removeAttribute("data-overflow-mode")
      renderedTable.parentElement?.removeAttribute("data-overflow-mode")
    }

    return true
  })

  for (let index = renderedTableIndex; index < renderedTables.length; index += 1) {
    renderedTables[index]?.removeAttribute("data-overflow-mode")
    renderedTables[index]?.parentElement?.removeAttribute("data-overflow-mode")
  }
}

const getRenderedTableViewportBudgetPx = (tableElement: HTMLElement | null, fallbackBudget: number) => {
  if (!tableElement || typeof window === "undefined") return fallbackBudget

  const tableRect = tableElement.getBoundingClientRect()
  return Math.max(
    TABLE_MIN_COLUMN_WIDTH_PX,
    Math.round(
      window.innerWidth -
        Math.max(TABLE_RAIL_EDGE_PADDING_PX, Math.round(tableRect.left)) -
        TABLE_RAIL_EDGE_PADDING_PX
    )
  )
}

const normalizeRenderedTableWidthsToReadableBudget = (editor: TiptapEditor) => {
  if (!shouldClampTableWidthBudget()) return false

  const readableWidthBudget = getCurrentEditorReadableWidthPx(editor) - 2
  const renderedTables = Array.from(
    editor.view.dom.querySelectorAll<HTMLElement>(".tableWrapper > table")
  )
  let renderedTableIndex = 0
  let transaction = editor.state.tr
  let changed = false

  editor.state.doc.descendants((node: any, pos: number) => {
    if (node.type?.name !== "table") return true
    if (getTableOverflowMode(node) === TABLE_OVERFLOW_MODE_WIDE) return true

    const columns = collectSimpleTableColumnCells(node, pos)
    const renderedTable = renderedTables[renderedTableIndex] ?? null
    renderedTableIndex += 1
    if (!columns || columns.length === 0) return true

    const currentWidths = columns.map((column) => readColumnWidthFromCell(column[0]))
    const requiresExplicitWidths = columns.some((column) => !hasExplicitColumnWidth(column))
    const renderedColumnWidths = readRenderedColumnWidths(renderedTable)
    const measuredWidths =
      renderedColumnWidths.length === columns.length ? renderedColumnWidths : currentWidths
    const shouldRecoverLegacyCollapsedWidths = isLegacyCollapsedTableWidthState(measuredWidths)
    const measuredTotalWidth = measuredWidths.reduce((sum, width) => sum + width, 0)
    const minBudget = TABLE_MIN_COLUMN_WIDTH_PX * currentWidths.length
    const viewportBudget = getRenderedTableViewportBudgetPx(renderedTable, readableWidthBudget)
    const safeBudget = Math.max(minBudget, Math.min(readableWidthBudget, viewportBudget))
    const renderedTableWidth = renderedTable
      ? Math.round(renderedTable.getBoundingClientRect().width)
      : measuredTotalWidth
    const borderOverhead = Math.max(0, renderedTableWidth - measuredTotalWidth)
    const contentBudget = Math.max(minBudget, safeBudget - borderOverhead)
    if (
      renderedTableWidth <= safeBudget &&
      !requiresExplicitWidths &&
      !shouldRecoverLegacyCollapsedWidths
    ) {
      return true
    }

    const nextWidths =
      measuredTotalWidth > contentBudget
        ? shrinkTableColumnWidthsToFit(measuredWidths, contentBudget)
        : shouldRecoverLegacyCollapsedWidths || requiresExplicitWidths
          ? expandTableColumnWidthsToBudget(measuredWidths, contentBudget)
          : measuredWidths
    if (
      nextWidths.every((width, index) => width === currentWidths[index]) &&
      !requiresExplicitWidths &&
      !shouldRecoverLegacyCollapsedWidths
    ) {
      return true
    }

    const applied = applyTableColumnWidthsToTransaction(transaction, columns, currentWidths, nextWidths)
    transaction = applied.transaction
    changed ||= applied.changed

    return true
  })

  if (!changed || !transaction.docChanged) return false
  transaction = transaction.setMeta(TABLE_WIDTH_BUDGET_META_KEY, true)
  editor.view.dispatch(transaction)
  return true
}

const TABLE_CONTEXT_NODE_NAMES = new Set(["table", "tableRow", "tableCell", "tableHeader"])

const hasTableContextInResolvedPos = (resolvedPos: { depth: number; node: (depth: number) => { type: { name: string } } }) => {
  for (let depth = resolvedPos.depth; depth >= 0; depth -= 1) {
    if (TABLE_CONTEXT_NODE_NAMES.has(resolvedPos.node(depth).type.name)) {
      return true
    }
  }
  return false
}

const isTableSelectionActive = (editor?: TiptapEditor | null) => {
  if (!editor) return false
  const { selection } = editor.state
  if (selection instanceof CellSelection) return true
  if (selection instanceof NodeSelection && selection.node.type.name === "table") return true
  if (
    editor.isActive("table") ||
    editor.isActive("tableRow") ||
    editor.isActive("tableCell") ||
    editor.isActive("tableHeader")
  ) {
    return true
  }

  return hasTableContextInResolvedPos(selection.$from) || hasTableContextInResolvedPos(selection.$to)
}

const getActiveTableStructureState = (editor?: TiptapEditor | null) => {
  if (!editor) {
    return {
      hasHeaderRow: false,
      hasHeaderColumn: false,
    }
  }

  const { selection } = editor.state
  const tableNode =
    selection instanceof NodeSelection && selection.node.type.name === "table"
      ? selection.node
      : (() => {
          for (let depth = selection.$from.depth; depth >= 0; depth -= 1) {
            const node = selection.$from.node(depth)
            if (node.type.name === "table") return node
          }
          for (let depth = selection.$to.depth; depth >= 0; depth -= 1) {
            const node = selection.$to.node(depth)
            if (node.type.name === "table") return node
          }
          return null
        })()

  if (!tableNode || tableNode.type.name !== "table" || tableNode.childCount === 0) {
    return {
      hasHeaderRow: false,
      hasHeaderColumn: false,
    }
  }

  const rows = Array.from({ length: tableNode.childCount }, (_, rowIndex) => tableNode.child(rowIndex))
  const firstRow = rows[0]
  const hasHeaderRow =
    firstRow?.childCount > 0 &&
    Array.from({ length: firstRow.childCount }, (_, columnIndex) => firstRow.child(columnIndex)).every(
      (cell) => cell.type.name === "tableHeader"
    )
  const hasHeaderColumn =
    rows.length > 0 &&
    rows.every((row) => row.childCount > 0 && row.child(0)?.type.name === "tableHeader")

  return {
    hasHeaderRow,
    hasHeaderColumn,
  }
}

const TABLE_CONTEXT_BLOCKED_INSERT_IDS = new Set([
  "heading-1",
  "heading-2",
  "heading-3",
  "heading-4",
  "bullet-list",
  "ordered-list",
  "checklist",
  "quote",
  "code-block",
  "table",
  "callout",
  "toggle",
  "bookmark",
  "embed",
  "file",
  "formula",
  "divider",
  "image",
  "mermaid",
])

const downgradeDisabledFeatureNodes = (node: BlockEditorDoc, enableMermaidBlocks: boolean): BlockEditorDoc => {
  if (!enableMermaidBlocks && node.type === "mermaidBlock") {
    const source = String(node.attrs?.source || "").trim()
    return {
      type: "rawMarkdownBlock",
      attrs: {
        markdown: ["```mermaid", source, "```"].join("\n"),
        reason: "unsupported-mermaid",
      },
    }
  }

  if (!node.content?.length) return node

  return {
    ...node,
    content: node.content.map((child) => downgradeDisabledFeatureNodes(child as BlockEditorDoc, enableMermaidBlocks)),
  }
}

const BlockEditorShell = ({
  value,
  onChange,
  onUploadImage,
  onUploadFile,
  disabled = false,
  className,
  preview,
  enableMermaidBlocks = false,
  onQaActionsReady,
}: Props) => {
  const imageFileInputRef = useRef<HTMLInputElement>(null)
  const attachmentFileInputRef = useRef<HTMLInputElement>(null)
  const inlineColorMenuRef = useRef<HTMLDetailsElement>(null)
  const bubbleTextStyleMenuRef = useRef<HTMLDetailsElement>(null)
  const bubbleInlineColorMenuRef = useRef<HTMLDetailsElement>(null)
  const slashMenuRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const blockHandleRailRef = useRef<HTMLDivElement>(null)
  const pendingBlockDragRef = useRef<PendingBlockDragState | null>(null)
  const pendingBlockDragCleanupRef = useRef<(() => void) | null>(null)
  const skipNextPointerDownSelectionClearRef = useRef(false)
  const pendingImageInsertIndexRef = useRef<number | null>(null)
  const pendingAttachmentInsertIndexRef = useRef<number | null>(null)
  const lastCommittedMarkdownRef = useRef(normalizeMarkdown(value))
  const pendingCommitEditorRef = useRef<TiptapEditor | null>(null)
  const pendingCommitFocusedRef = useRef(false)
  const markdownCommitIdleHandleRef = useRef<number | null>(null)
  const markdownCommitIdleModeRef = useRef<"idle" | "timeout" | null>(null)
  const markdownCommitTimerRef = useRef<number | null>(null)
  const markdownCommitMaxWaitTimerRef = useRef<number | null>(null)
  const tableViewportBudgetNormalizeFrameRef = useRef<number | null>(null)
  const editorRef = useRef<TiptapEditor | null>(null)
  const tableRowResizeRef = useRef<TableRowResizeState | null>(null)
  const tableColumnRailResizeRef = useRef<TableColumnRailResizeState | null>(null)
  const tableQuickRailHideTimerRef = useRef<number | null>(null)
  const hoveredBlockClearTimerRef = useRef<number | null>(null)
  const bubbleHideTimerRef = useRef<number | null>(null)
  const bubbleToolbarHoveredRef = useRef(false)
  const mouseTextSelectionInProgressRef = useRef(false)
  const syncBubbleOnMouseUpRef = useRef(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isSlashMenuOpen, setIsSlashMenuOpen] = useState(false)
  const [slashQuery, setSlashQuery] = useState("")
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0)
  const [slashMenuState, setSlashMenuState] = useState<SlashMenuState>(null)
  const [recentSlashItemIds, setRecentSlashItemIds] = useState<string[]>([])
  const [isSlashImeComposing, setIsSlashImeComposing] = useState(false)
  const [slashInteractionMode, setSlashInteractionMode] = useState<"keyboard" | "pointer">("keyboard")
  const [isToolbarMoreOpen, setIsToolbarMoreOpen] = useState(false)
  const [isInlineColorMenuOpen, setIsInlineColorMenuOpen] = useState(false)
  const [isBubbleTextStyleMenuOpen, setIsBubbleTextStyleMenuOpen] = useState(false)
  const [isBubbleInlineColorMenuOpen, setIsBubbleInlineColorMenuOpen] = useState(false)
  const [blockMenuState, setBlockMenuState] = useState<BlockMenuState>(null)
  const [isCoarsePointer, setIsCoarsePointer] = useState(false)
  const [isDesktopTableRailViewport, setIsDesktopTableRailViewport] = useState(false)
  const [hoveredBlockIndex, setHoveredBlockIndex] = useState<number | null>(null)
  const [selectedBlockIndex, setSelectedBlockIndex] = useState<number | null>(null)
  const [clickedBlockIndex, setClickedBlockIndex] = useState<number | null>(null)
  const [selectedBlockNodeIndex, setSelectedBlockNodeIndex] = useState<number | null>(null)
  const selectedBlockNodeIndexRef = useRef<number | null>(null)
  const keyboardBlockSelectionStickyRef = useRef(false)
  const [blockHandleState, setBlockHandleState] = useState<TopLevelBlockHandleState>({
    visible: false,
    blockIndex: 0,
    left: 0,
    top: 0,
    bottom: 0,
    width: 0,
  })
  const [blockSelectionOverlayState, setBlockSelectionOverlayState] = useState<BlockSelectionOverlayState>({
    visible: false,
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  })
  const [bubbleState, setBubbleState] = useState<FloatingBubbleState>({
    visible: false,
    mode: "text",
    anchor: "center",
    left: 0,
    top: 0,
  })
  const [tableQuickRailState, setTableQuickRailState] = useState<TableQuickRailState>({
    visible: false,
    left: 0,
    top: 0,
    tableLeft: 0,
    tableTop: 0,
    width: 0,
    height: 0,
    rowTop: 0,
    rowHeight: 0,
    columnLeft: 0,
    columnWidth: 0,
    columnIndex: 0,
    columnSegments: [],
  })
  const [tableColumnDragGuideState, setTableColumnDragGuideState] = useState<TableColumnDragGuideState>({
    visible: false,
    left: 0,
    top: 0,
    height: 0,
  })
  const [tableMenuState, setTableMenuState] = useState<TableMenuState>(null)
  const tableQuickRailStateRef = useRef(tableQuickRailState)
  const [draggedBlockState, setDraggedBlockState] = useState<DraggedBlockState>(null)
  const [dragGhostPosition, setDragGhostPosition] = useState<{ x: number; y: number } | null>(null)
  const [dropIndicatorState, setDropIndicatorState] = useState<DropIndicatorState>({
    visible: false,
    insertionIndex: 0,
    top: 0,
    left: 0,
    width: 0,
    highlightTop: 0,
    highlightLeft: 0,
    highlightWidth: 0,
    highlightHeight: 0,
  })
  const [draggedNestedListItemState, setDraggedNestedListItemState] = useState<DraggedNestedListItemState>(null)
  const [nestedListItemDropIndicatorState, setNestedListItemDropIndicatorState] = useState<NestedListItemDropIndicatorState>({
    visible: false,
    listBlockIndex: 0,
    listPath: [],
    insertionIndex: 0,
    top: 0,
    left: 0,
    width: 0,
  })
  const [selectionTick, setSelectionTick] = useState(0)
  const selectionUiSignatureRef = useRef("")

  const cancelHoveredBlockClear = useCallback(() => {
    if (hoveredBlockClearTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(hoveredBlockClearTimerRef.current)
      hoveredBlockClearTimerRef.current = null
    }
  }, [])

  const scheduleHoveredBlockClear = useCallback(() => {
    cancelHoveredBlockClear()
    if (typeof window === "undefined") return
    hoveredBlockClearTimerRef.current = window.setTimeout(() => {
      setHoveredBlockIndex(null)
      hoveredBlockClearTimerRef.current = null
    }, 260)
  }, [cancelHoveredBlockClear])

  const hideTableQuickRailImmediately = useCallback(() => {
    if (tableQuickRailHideTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(tableQuickRailHideTimerRef.current)
      tableQuickRailHideTimerRef.current = null
    }
    setTableQuickRailState((prev) => (prev.visible ? { ...prev, visible: false } : prev))
  }, [])

  const cancelTableQuickRailHide = useCallback(() => {
    if (tableQuickRailHideTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(tableQuickRailHideTimerRef.current)
      tableQuickRailHideTimerRef.current = null
    }
  }, [])

  const clearWindowTextSelection = useCallback(() => {
    if (typeof window === "undefined") return
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return
    selection.removeAllRanges()
  }, [])

  const setColumnResizeUserSelectSuppressed = useCallback((suppressed: boolean) => {
    if (typeof document === "undefined") return
    if (suppressed) {
      document.body.style.setProperty("user-select", "none")
      document.body.style.setProperty("-webkit-user-select", "none")
      return
    }
    document.body.style.removeProperty("user-select")
    document.body.style.removeProperty("-webkit-user-select")
  }, [])

  const hideTableColumnDragGuide = useCallback(() => {
    setTableColumnDragGuideState((prev) => (prev.visible ? { ...prev, visible: false } : prev))
  }, [])

  const syncTableColumnDragGuideForColumn = useCallback(
    (columnIndex: number) => {
      const viewport = viewportRef.current
      if (!viewport) {
        hideTableColumnDragGuide()
        return
      }

      const selectedCellTable = viewport.querySelector(".aq-block-editor__content .selectedCell")?.closest("table")
      const fallbackTable = viewport.querySelector(".aq-block-editor__content .tableWrapper table, .aq-block-editor__content table")
      const tableElement = (selectedCellTable ?? fallbackTable) as HTMLTableElement | null
      const headerRow = tableElement?.querySelector("thead tr, tbody tr, tr")
      if (!tableElement || !headerRow) {
        hideTableColumnDragGuide()
        return
      }

      const cells = Array.from(headerRow.children).filter(
        (node): node is HTMLElement => node instanceof HTMLElement
      )
      if (columnIndex < 0 || columnIndex >= cells.length) {
        hideTableColumnDragGuide()
        return
      }

      const tableRect = tableElement.getBoundingClientRect()
      const cellRect = cells[columnIndex].getBoundingClientRect()
      setTableColumnDragGuideState({
        visible: true,
        left: Math.round(Math.min(tableRect.right, cellRect.right)),
        top: Math.round(tableRect.top),
        height: Math.round(tableRect.height),
      })
    },
    [hideTableColumnDragGuide]
  )

  const syncTableColumnDragGuideForClientX = useCallback(
    (clientX: number) => {
      const viewport = viewportRef.current
      if (!viewport) {
        hideTableColumnDragGuide()
        return
      }

      const selectedCellTable = viewport.querySelector(".aq-block-editor__content .selectedCell")?.closest("table")
      const fallbackTable = viewport.querySelector(".aq-block-editor__content .tableWrapper table, .aq-block-editor__content table")
      const tableElement = (selectedCellTable ?? fallbackTable) as HTMLTableElement | null
      if (!tableElement) {
        hideTableColumnDragGuide()
        return
      }

      const tableRect = tableElement.getBoundingClientRect()
      const clampedX = Math.max(tableRect.left, Math.min(tableRect.right, clientX))
      setTableColumnDragGuideState({
        visible: true,
        left: Math.round(clampedX),
        top: Math.round(tableRect.top),
        height: Math.round(tableRect.height),
      })
    },
    [hideTableColumnDragGuide]
  )

  const scheduleTableQuickRailHide = useCallback((delayMs = TABLE_QUICK_RAIL_HIDE_DELAY_MS) => {
    cancelTableQuickRailHide()
    if (typeof window === "undefined") return
    tableQuickRailHideTimerRef.current = window.setTimeout(() => {
      setTableQuickRailState((prev) => (prev.visible ? { ...prev, visible: false } : prev))
      tableQuickRailHideTimerRef.current = null
    }, delayMs)
  }, [cancelTableQuickRailHide])

  const cancelBubbleHide = useCallback(() => {
    if (bubbleHideTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(bubbleHideTimerRef.current)
      bubbleHideTimerRef.current = null
    }
  }, [])

  const scheduleBubbleHide = useCallback(() => {
    cancelBubbleHide()
    if (typeof window === "undefined") return
    bubbleHideTimerRef.current = window.setTimeout(() => {
      if (!bubbleToolbarHoveredRef.current) {
        setBubbleState((prev) => ({ ...prev, visible: false }))
      }
      bubbleHideTimerRef.current = null
    }, 220)
  }, [cancelBubbleHide])

  const cancelScheduledTableViewportBudgetNormalize = useCallback(() => {
    if (tableViewportBudgetNormalizeFrameRef.current !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(tableViewportBudgetNormalizeFrameRef.current)
      tableViewportBudgetNormalizeFrameRef.current = null
    }
  }, [])

  const scheduleTableViewportBudgetNormalize = useCallback(
    (nextEditor: TiptapEditor) => {
      if (typeof window === "undefined") return
      cancelScheduledTableViewportBudgetNormalize()
      tableViewportBudgetNormalizeFrameRef.current = window.requestAnimationFrame(() => {
        tableViewportBudgetNormalizeFrameRef.current = null
        const targetEditor = editorRef.current ?? nextEditor
        syncRenderedTableOverflowModes(targetEditor)
        normalizeRenderedTableWidthsToReadableBudget(targetEditor)
      })
    },
    [cancelScheduledTableViewportBudgetNormalize]
  )

  const cancelPendingMarkdownCommit = useCallback(() => {
    if (typeof window !== "undefined" && markdownCommitIdleHandleRef.current !== null) {
      const idleWindow = window as Window & {
        cancelIdleCallback?: (id: number) => void
      }
      if (
        markdownCommitIdleModeRef.current === "idle" &&
        typeof idleWindow.cancelIdleCallback === "function"
      ) {
        idleWindow.cancelIdleCallback(markdownCommitIdleHandleRef.current)
      } else {
        window.clearTimeout(markdownCommitIdleHandleRef.current)
      }
      markdownCommitIdleHandleRef.current = null
      markdownCommitIdleModeRef.current = null
    }
    if (markdownCommitTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(markdownCommitTimerRef.current)
      markdownCommitTimerRef.current = null
    }
  }, [])

  const clearPendingMarkdownCommitMaxWait = useCallback(() => {
    if (markdownCommitMaxWaitTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(markdownCommitMaxWaitTimerRef.current)
      markdownCommitMaxWaitTimerRef.current = null
    }
  }, [])

  const flushPendingMarkdownCommit = useCallback(() => {
    cancelPendingMarkdownCommit()
    clearPendingMarkdownCommitMaxWait()
    const pendingEditor = pendingCommitEditorRef.current
    if (!pendingEditor) return

    const markdown = serializeEditorDocToMarkdown(pendingEditor.getJSON() as BlockEditorDoc)
    const normalized = normalizeMarkdown(markdown)
    pendingCommitEditorRef.current = null

    if (normalized === lastCommittedMarkdownRef.current) {
      return
    }

    lastCommittedMarkdownRef.current = normalized
    onChange(markdown, { editorFocused: pendingCommitFocusedRef.current })
  }, [cancelPendingMarkdownCommit, clearPendingMarkdownCommitMaxWait, onChange])

  const scheduleMarkdownCommit = useCallback(
    (nextEditor: TiptapEditor) => {
      pendingCommitEditorRef.current = nextEditor
      pendingCommitFocusedRef.current = nextEditor.isFocused

      if (typeof window === "undefined") {
        flushPendingMarkdownCommit()
        return
      }

      cancelPendingMarkdownCommit()
      markdownCommitTimerRef.current = window.setTimeout(() => {
        markdownCommitTimerRef.current = null

        const idleWindow = window as Window & {
          requestIdleCallback?: (
            callback: IdleRequestCallback,
            options?: IdleRequestOptions
          ) => number
        }

        if (typeof idleWindow.requestIdleCallback === "function") {
          markdownCommitIdleModeRef.current = "idle"
          markdownCommitIdleHandleRef.current = idleWindow.requestIdleCallback(
            () => {
              markdownCommitIdleHandleRef.current = null
              markdownCommitIdleModeRef.current = null
              flushPendingMarkdownCommit()
            },
            { timeout: MARKDOWN_COMMIT_IDLE_TIMEOUT_MS }
          )
          return
        }

        markdownCommitIdleModeRef.current = "timeout"
        markdownCommitIdleHandleRef.current = window.setTimeout(() => {
          markdownCommitIdleHandleRef.current = null
          markdownCommitIdleModeRef.current = null
          flushPendingMarkdownCommit()
        }, 16)
      }, MARKDOWN_COMMIT_DEBOUNCE_MS)

      if (markdownCommitMaxWaitTimerRef.current !== null) return
      markdownCommitMaxWaitTimerRef.current = window.setTimeout(() => {
        markdownCommitMaxWaitTimerRef.current = null
        flushPendingMarkdownCommit()
      }, MARKDOWN_COMMIT_MAX_WAIT_MS)
    },
    [cancelPendingMarkdownCommit, flushPendingMarkdownCommit]
  )
  const initialDocRef = useRef(
    downgradeDisabledFeatureNodes(parseMarkdownToEditorDoc(value), enableMermaidBlocks)
  )

  const isSelectionInEmptyParagraph = useCallback(() => {
    const currentEditor = editorRef.current
    if (!currentEditor) return false
    const { selection } = currentEditor.state
    if (!selection.empty) return false
    const parent = selection.$from.parent
    return parent.type.name === "paragraph" && parent.content.size === 0
  }, [])

  const getEmptyCalloutBodyParagraphRange = useCallback((targetEditor: TiptapEditor) => {
    const { selection } = targetEditor.state
    if (!selection.empty) return null

    const { $from } = selection
    const parent = $from.parent
    let calloutDepth = -1
    for (let depth = $from.depth; depth >= 0; depth -= 1) {
      if ($from.node(depth).type.name === "calloutBlock") {
        calloutDepth = depth
        break
      }
    }
    if (calloutDepth < 0) return null

    if (parent.type.name === "paragraph" && parent.content.size === 0) {
      return {
        from: $from.before($from.depth),
        to: $from.after($from.depth),
      }
    }

    const calloutNode = $from.node(calloutDepth)
    const calloutPos = calloutDepth > 0 ? $from.before(calloutDepth) : 0
    let fallbackRange: { from: number; to: number } | null = null
    calloutNode.descendants((node, pos) => {
      if (fallbackRange) return false
      if (node.type.name !== "paragraph" || node.content.size > 0) return true

      const from = calloutPos + pos + 1
      fallbackRange = { from, to: from + node.nodeSize }
      return false
    })

    return fallbackRange
  }, [])

  const replaceEmptyCalloutBodyWithPlainText = useCallback((text: string) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return false

    const replaceRange = getEmptyCalloutBodyParagraphRange(currentEditor)
    if (!replaceRange) return false

    const normalizedText = text.replace(/\r\n?/g, "\n")
    if (!normalizedText.trim()) return false

    const nextParagraphNodes = normalizedText
      .split("\n")
      .map((line) => currentEditor.state.schema.nodeFromJSON(createParagraphNode(line)))

    if (nextParagraphNodes.length === 0) return false

    let tr = currentEditor.state.tr.replaceWith(
      replaceRange.from,
      replaceRange.to,
      Fragment.fromArray(nextParagraphNodes)
    )

    const lastNodeIndex = nextParagraphNodes.length - 1
    const lastNodeStart = replaceRange.from + nextParagraphNodes
      .slice(0, lastNodeIndex)
      .reduce((sum, node) => sum + node.nodeSize, 0)
    const caretPos = Math.max(
      1,
      Math.min(lastNodeStart + nextParagraphNodes[lastNodeIndex].nodeSize - 1, tr.doc.content.size)
    )
    tr = tr.setSelection(TextSelection.create(tr.doc, caretPos))

    currentEditor.view.dispatch(tr.scrollIntoView())
    currentEditor.view.focus()
    return true
  }, [getEmptyCalloutBodyParagraphRange])

  const insertDocContent = useCallback(
    (doc: BlockEditorDoc, replaceCurrentEmptyParagraph = false) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return false
      if (isTableSelectionActive(currentEditor)) return false
      const nextContent = doc.content?.length ? doc.content : [{ type: "paragraph" }]

      if (replaceCurrentEmptyParagraph && isSelectionInEmptyParagraph()) {
        const { $from } = currentEditor.state.selection
        currentEditor
          .chain()
          .focus()
          .deleteRange({
            from: $from.before($from.depth),
            to: $from.after($from.depth),
          })
          .insertContent(nextContent)
          .run()
        return true
      }

      currentEditor.chain().focus().insertContent(nextContent).run()
      return true
    },
    [isSelectionInEmptyParagraph]
  )

  const getContentRoot = useCallback(() => {
    return viewportRef.current?.querySelector(".aq-block-editor__content") as HTMLElement | null
  }, [])

  const setViewportRowResizeHot = useCallback((enabled: boolean) => {
    const viewport = viewportRef.current
    if (!viewport) return
    if (enabled) {
      viewport.setAttribute("data-row-resize-hot", "true")
      return
    }
    viewport.removeAttribute("data-row-resize-hot")
  }, [])

  const getTopLevelBlockElements = useCallback(() => {
    const root = getContentRoot()
    return root ? Array.from(root.children) as HTMLElement[] : []
  }, [getContentRoot])

  const getTopLevelBlockElementByIndex = useCallback(
    (blockIndex: number) => getTopLevelBlockElements()[blockIndex] ?? null,
    [getTopLevelBlockElements]
  )

  const syncSelectedBlockNodeSurface = useCallback(
    (blockIndex: number | null) => {
      const elements = getTopLevelBlockElements()
      elements.forEach((element, index) => {
        if (blockIndex !== null && index === blockIndex) {
          element.setAttribute("data-block-selected", "true")
        } else {
          element.removeAttribute("data-block-selected")
        }
      })
    },
    [getTopLevelBlockElements]
  )

  useEffect(() => {
    const selectedSurfaceIndex =
      selectedBlockNodeIndex !== null
        ? selectedBlockNodeIndex
        : clickedBlockIndex !== null
          ? clickedBlockIndex
          : null
    syncSelectedBlockNodeSurface(selectedSurfaceIndex)
  }, [
    clickedBlockIndex,
    selectedBlockNodeIndex,
    selectionTick,
    syncSelectedBlockNodeSurface,
  ])

  const resolveDropIndicatorByClientY = useCallback(
    (clientY: number) => {
      const elements = getTopLevelBlockElements()
      if (!elements.length) {
        return {
          insertionIndex: 0,
          top: 0,
          left: 0,
          width: 0,
          highlightTop: 0,
          highlightLeft: 0,
          highlightWidth: 0,
          highlightHeight: 0,
        }
      }

      const rootRect = elements[0]?.parentElement?.getBoundingClientRect()
      let insertionIndex = elements.length
      let top = elements[elements.length - 1].getBoundingClientRect().bottom
      let highlightTop = 0
      let highlightLeft = 0
      let highlightWidth = 0
      let highlightHeight = 0

      for (let index = 0; index < elements.length; index += 1) {
        const rect = elements[index].getBoundingClientRect()
        const midpoint = rect.top + rect.height / 2
        if (clientY < midpoint) {
          insertionIndex = index
          top = rect.top
          highlightTop = Math.round(rect.top - 4)
          highlightLeft = Math.round(rect.left - 8)
          highlightWidth = Math.round(rect.width + 16)
          highlightHeight = Math.round(rect.height + 8)
          break
        }
      }

      if (insertionIndex === elements.length) {
        const tailRect = elements[elements.length - 1].getBoundingClientRect()
        highlightTop = Math.round(tailRect.bottom + 6)
        highlightLeft = Math.round(tailRect.left)
        highlightWidth = Math.round(tailRect.width)
        highlightHeight = 18
      }

      return {
        insertionIndex,
        top: Math.round(top),
        left: Math.round(rootRect?.left || elements[0].getBoundingClientRect().left),
        width: Math.round(rootRect?.width || elements[0].getBoundingClientRect().width),
        highlightTop,
        highlightLeft,
        highlightWidth,
        highlightHeight,
      }
    },
    [getTopLevelBlockElements]
  )

  const clearPendingBlockDrag = useCallback(() => {
    pendingBlockDragRef.current = null
    if (pendingBlockDragCleanupRef.current) {
      pendingBlockDragCleanupRef.current()
      pendingBlockDragCleanupRef.current = null
    }
  }, [])

  const beginBlockDragFromPending = useCallback(
    (pending: PendingBlockDragState, clientX: number, clientY: number) => {
      const indicator = resolveDropIndicatorByClientY(clientY)
      setDraggedBlockState({
        sourceIndex: pending.sourceIndex,
        pointerId: pending.pointerId,
        previewWidth: pending.previewWidth,
        previewHeight: pending.previewHeight,
        previewHtml: pending.previewHtml,
        previewLabel: pending.previewLabel,
      })
      setDragGhostPosition({
        x: clientX,
        y: clientY,
      })
      setDropIndicatorState({
        visible: true,
        ...indicator,
      })
    },
    [resolveDropIndicatorByClientY]
  )

  const clearNativeTextSelection = useCallback(() => {
    if (typeof window === "undefined") return
    const clearRanges = () => {
      const domSelection = window.getSelection()
      if (domSelection?.rangeCount) {
        domSelection.removeAllRanges()
      }
    }

    clearRanges()
    window.requestAnimationFrame(() => {
      clearRanges()
      focusElementWithoutScroll(viewportRef.current)
      window.requestAnimationFrame(() => {
        clearRanges()
      })
    })
  }, [])

  const promoteTopLevelBlockSelection = useCallback(
    (blockIndex: number) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return false
      keyboardBlockSelectionStickyRef.current = true
      selectTopLevelBlockNode(currentEditor, blockIndex)
      setClickedBlockIndex(null)
      setSelectedBlockIndex(blockIndex)
      setSelectedBlockNodeIndex(blockIndex)
      syncSelectedBlockNodeSurface(blockIndex)
      setSelectionTick((prev) => prev + 1)
      clearNativeTextSelection()
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          setSelectedBlockNodeIndex(blockIndex)
          syncSelectedBlockNodeSurface(blockIndex)
          setSelectionTick((prev) => prev + 1)
        })
      }
      return true
    },
    [clearNativeTextSelection, syncSelectedBlockNodeSurface]
  )

  const isTopLevelBlockHandleEligible = useCallback((blockIndex: number) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return false
    const blocks = ((currentEditor.getJSON() as BlockEditorDoc).content ?? []) as BlockEditorDoc[]
    const block = blocks[blockIndex]
    if (!block) return false
    if (blocks.length > 1) return true
    return blockHasVisibleContent(block)
  }, [])

  const findTopLevelBlockIndexFromTarget = useCallback(
    (target: EventTarget | null) => {
      const root = getContentRoot()
      if (!root) return null

      const normalizedTarget =
        target instanceof Element
          ? target
          : target instanceof Node
            ? target.parentElement
            : null
      if (!(normalizedTarget instanceof Element)) return null

      let element: Element | null = normalizedTarget
      while (element && element.parentElement !== root) {
        element = element.parentElement
      }

      if (!element || element.parentElement !== root) return null
      return getTopLevelBlockElements().indexOf(element as HTMLElement)
    },
    [getContentRoot, getTopLevelBlockElements]
  )

  const findTopLevelBlockIndexByClientPosition = useCallback(
    (clientX: number, clientY: number) => {
      const elements = getTopLevelBlockElements()
      if (!elements.length) return null

      let bestIndex: number | null = null
      let bestDistance = Number.POSITIVE_INFINITY

      for (let index = 0; index < elements.length; index += 1) {
        const rect = elements[index].getBoundingClientRect()
        const expandedTop = rect.top - 10
        const expandedBottom = rect.bottom + 10
        const expandedLeft = rect.left - 28
        const expandedRight = rect.right + 16
        const inside =
          clientY >= expandedTop &&
          clientY <= expandedBottom &&
          clientX >= expandedLeft &&
          clientX <= expandedRight

        if (inside) {
          return index
        }

        const centerY = rect.top + rect.height / 2
        const distance = Math.abs(clientY - centerY)
        if (distance < bestDistance) {
          bestDistance = distance
          bestIndex = index
        }
      }

      return bestIndex
    },
    [getTopLevelBlockElements]
  )

  const isOuterBlockSelectionGesture = useCallback(
    (event: BlockSelectionPointerEventLike, targetBlockIndex: number | null) => {
      if (targetBlockIndex === null) return false
      if (event.button !== 0) return false
      if (event.detail < 2) return false
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false

      const targetElement =
        event.target instanceof Element
          ? event.target
          : event.target instanceof Node
            ? event.target.parentElement
            : null
      if (
        targetElement?.closest("[data-block-handle-rail='true'] button") ||
        targetElement?.closest("[data-block-menu-root='true']") ||
        targetElement?.closest("[data-table-menu-root='true']") ||
        targetElement?.closest("[data-table-axis-rail='true']") ||
        targetElement?.closest("[data-table-corner-handle='true']")
      ) {
        return false
      }

      const blockElement = getTopLevelBlockElementByIndex(targetBlockIndex)
      if (!blockElement) return false
      const rect = blockElement.getBoundingClientRect()
      const withinVerticalRange =
        event.clientY >= rect.top - BLOCK_OUTER_SELECT_VERTICAL_MARGIN_PX &&
        event.clientY <= rect.bottom + BLOCK_OUTER_SELECT_VERTICAL_MARGIN_PX
      if (!withinVerticalRange) return false

      return (
        event.clientX >= rect.left - BLOCK_OUTER_SELECT_LEFT_GUTTER_PX &&
        event.clientX <= rect.left + BLOCK_OUTER_SELECT_LEFT_EDGE_INNER_PX
      )
    },
    [getTopLevelBlockElementByIndex]
  )

  const findNestedListItemDragContextFromTarget = useCallback(
    (target: EventTarget | null) => {
      const root = getContentRoot()
      if (!root || !(target instanceof Element)) return null

      const taskItemElement = target.closest(LIST_ITEM_SELECTOR)
      if (!(taskItemElement instanceof HTMLElement)) return null
      const taskListElement = taskItemElement.closest(LIST_CONTAINER_SELECTOR)
      if (!(taskListElement instanceof HTMLElement)) return null

      let blockElement: Element | null = taskListElement
      while (blockElement && blockElement.parentElement !== root) {
        blockElement = blockElement.parentElement
      }

      if (!(blockElement instanceof HTMLElement) || blockElement.parentElement !== root) return null
      const taskListBlockIndex = getTopLevelBlockElements().indexOf(blockElement)
      if (taskListBlockIndex < 0) return null

      const taskItems = Array.from(
        taskListElement.querySelectorAll(`:scope > ${LIST_ITEM_SELECTOR}`)
      ) as HTMLElement[]
      const sourceItemIndex = taskItems.indexOf(taskItemElement)
      if (sourceItemIndex < 0) return null

      const taskListPath: number[] = []
      let currentListElement: HTMLElement | null = taskListElement
      while (currentListElement && currentListElement !== blockElement) {
        const parentTaskItem: HTMLElement | null =
          currentListElement.parentElement?.closest(LIST_ITEM_SELECTOR) ?? null
        if (!(parentTaskItem instanceof HTMLElement)) break
        const parentTaskList: HTMLElement | null =
          parentTaskItem.parentElement?.closest(LIST_CONTAINER_SELECTOR) ?? null
        if (!(parentTaskList instanceof HTMLElement)) break

        const siblingItems = Array.from(
          parentTaskList.querySelectorAll(`:scope > ${LIST_ITEM_SELECTOR}`)
        ) as HTMLElement[]
        const parentItemIndex = siblingItems.indexOf(parentTaskItem)
        if (parentItemIndex < 0) break

        taskListPath.unshift(parentItemIndex)
        currentListElement = parentTaskList
      }

      return {
        listBlockIndex: taskListBlockIndex,
        listPath: taskListPath,
        sourceItemIndex,
        taskItemElement,
        listElement: taskListElement,
        taskItems,
      }
    },
    [getContentRoot, getTopLevelBlockElements]
  )

  const resolveNestedListItemDropIndicatorByClientY = useCallback(
    (taskListElement: HTMLElement, clientY: number) => {
      const taskItems = Array.from(
        taskListElement.querySelectorAll(`:scope > ${LIST_ITEM_SELECTOR}`)
      ) as HTMLElement[]
      if (!taskItems.length) {
        const rect = taskListElement.getBoundingClientRect()
        return {
          insertionIndex: 0,
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          width: Math.round(rect.width),
        }
      }

      let insertionIndex = taskItems.length
      let top = taskItems[taskItems.length - 1].getBoundingClientRect().bottom

      for (let index = 0; index < taskItems.length; index += 1) {
        const rect = taskItems[index].getBoundingClientRect()
        const midpoint = rect.top + rect.height / 2
        if (clientY < midpoint) {
          insertionIndex = index
          top = rect.top
          break
        }
      }

      const rootRect = taskListElement.getBoundingClientRect()
      return {
        insertionIndex,
        top: Math.round(top),
        left: Math.round(rootRect.left + 12),
        width: Math.max(48, Math.round(rootRect.width - 24)),
      }
    },
    []
  )

  const getTableCellFromTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Element)) return null
    const cell = target.closest("td, th")
    if (!(cell instanceof HTMLTableCellElement)) return null
    return cell
  }, [])

  const isRowResizeHandleTarget = useCallback(
    (cell: HTMLTableCellElement | null, clientX: number, clientY: number) => {
      if (!cell) return false
      const rect = cell.getBoundingClientRect()
      const distanceToBottom = rect.bottom - clientY
      const distanceToRight = rect.right - clientX
      return (
        distanceToBottom >= -1 &&
        distanceToBottom <= TABLE_ROW_RESIZE_EDGE_PX &&
        distanceToRight > TABLE_COLUMN_RESIZE_GUARD_PX
      )
    },
    []
  )

  const stopTableRowResize = useCallback(() => {
    const state = tableRowResizeRef.current
    if (state?.row) {
      state.row.removeAttribute("data-row-resize-active")
      if (!state.row.getAttribute("data-row-height")) {
        state.row.style.removeProperty("height")
      }
      state.cells.forEach((cell) => {
        cell.style.removeProperty("height")
        cell.style.removeProperty("min-height")
      })
    }
    tableRowResizeRef.current = null
    setViewportRowResizeHot(false)
    if (typeof document !== "undefined") {
      document.body.style.removeProperty("cursor")
    }
  }, [setViewportRowResizeHot])

  const startTableRowResize = useCallback(
    (cell: HTMLTableCellElement, clientY: number) => {
      const row = cell.parentElement
      if (!(row instanceof HTMLTableRowElement)) return
      const cells = Array.from(row.cells)
      if (cells.length === 0) return

      row.setAttribute("data-row-resize-active", "true")
      tableRowResizeRef.current = {
        row,
        cells,
        startY: clientY,
        startHeight: row.getBoundingClientRect().height,
      }
      setViewportRowResizeHot(true)
      if (typeof document !== "undefined") {
        document.body.style.cursor = "row-resize"
      }
    },
    [setViewportRowResizeHot]
  )

  const commitTableRowHeight = useCallback((rowElement: HTMLTableRowElement, nextHeight: number) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return

    let domPosition = 0
    try {
      domPosition = currentEditor.view.posAtDOM(rowElement, 0)
    } catch {
      return
    }
    const resolvedPosition = resolveDocPosSafe(currentEditor, domPosition)
    if (!resolvedPosition) return

    for (let depth = resolvedPosition.depth; depth > 0; depth -= 1) {
      if (resolvedPosition.node(depth).type.name !== "tableRow") continue

      const rowPosition = resolvedPosition.before(depth)
      const rowNode = currentEditor.state.doc.nodeAt(rowPosition)
      if (!rowNode) return

      const normalizedHeight = Math.max(TABLE_MIN_ROW_HEIGHT_PX, nextHeight)
      const transaction = currentEditor.state.tr.setNodeMarkup(rowPosition, undefined, {
        ...rowNode.attrs,
        rowHeightPx: normalizedHeight,
      })
      currentEditor.view.dispatch(transaction)
      return
    }
  }, [])

  const resizeFirstTableRowBy = useCallback((deltaPx: number) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return
    const firstTableRow = viewportRef.current?.querySelector(".aq-block-editor__content table tr") as HTMLTableRowElement | null
    if (!firstTableRow) return
    const nextHeight = Math.max(
      TABLE_MIN_ROW_HEIGHT_PX,
      Math.round(firstTableRow.getBoundingClientRect().height + deltaPx)
    )
    commitTableRowHeight(firstTableRow, nextHeight)
  }, [commitTableRowHeight])

  const getActiveTableRectFromDom = useCallback((activeEditor?: TiptapEditor | null) => {
    if (!activeEditor) return null

    const tableElement = findActiveRenderedTable(viewportRef.current, tableQuickRailStateRef.current)
    const firstCell = tableElement?.querySelector<HTMLElement>(
      "thead tr:first-of-type > th, thead tr:first-of-type > td, tbody tr:first-of-type > th, tbody tr:first-of-type > td, tr:first-of-type > th, tr:first-of-type > td"
    )
    if (!tableElement || !firstCell) return null

    let domPosition = 0
    try {
      domPosition = activeEditor.view.posAtDOM(firstCell, 0)
    } catch {
      return null
    }

    const resolvedPosition = resolveDocPosSafe(activeEditor, domPosition)
    if (!resolvedPosition) return null

    for (let depth = resolvedPosition.depth; depth > 0; depth -= 1) {
      if (resolvedPosition.node(depth).type.name !== "table") continue
      const table = resolvedPosition.node(depth)
      const tableStart = resolvedPosition.start(depth)
      return {
        map: TableMap.get(table),
        table,
        tableStart,
      }
    }

    return null
  }, [])

  const getCurrentSelectedTableRect = useCallback((activeEditor?: TiptapEditor | null) => {
    if (!activeEditor) return null
    if (isTableSelectionActive(activeEditor)) {
      try {
        return selectedRect(activeEditor.state)
      } catch {
        return getActiveTableRectFromDom(activeEditor)
      }
    }

    return getActiveTableRectFromDom(activeEditor)
  }, [getActiveTableRectFromDom])

  const resolveTableNodePosition = useCallback((activeEditor: TiptapEditor, tableNode: ProseMirrorNode) => {
    let tablePos: number | null = null
    activeEditor.state.doc.descendants((node: ProseMirrorNode, pos: number) => {
      if (node === tableNode) {
        tablePos = pos
        return false
      }
      return true
    })
    return tablePos
  }, [])

  const isCurrentTableColumnSelection = useCallback(
    (columnIndex: number) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return false
      const { selection } = currentEditor.state
      if (!(selection instanceof CellSelection)) return false
      let rect: ReturnType<typeof selectedRect> | null = null
      try {
        rect = selectedRect(currentEditor.state)
      } catch {
        rect = null
      }
      if (!rect) return false
      return (
        columnIndex >= 0 &&
        rect.left === columnIndex &&
        rect.right === columnIndex + 1 &&
        rect.top === 0 &&
        rect.bottom === rect.map.height
      )
    },
    []
  )

  const selectTableColumnByIndex = useCallback(
    (columnIndex: number) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return false
      const rect = getCurrentSelectedTableRect(currentEditor)
      if (!rect || columnIndex < 0 || columnIndex >= rect.map.width) return false

      const anchorCellPos = rect.tableStart + rect.map.positionAt(0, columnIndex, rect.table)
      const headCellPos =
        rect.tableStart + rect.map.positionAt(rect.map.height - 1, columnIndex, rect.table)
      const anchorResolved = resolveDocPosSafe(currentEditor, anchorCellPos)
      const headResolved = resolveDocPosSafe(currentEditor, headCellPos)
      if (!anchorResolved || !headResolved) return false

      currentEditor.view.dispatch(
        currentEditor.state.tr.setSelection(CellSelection.colSelection(anchorResolved, headResolved))
      )
      currentEditor.view.focus()
      return true
    },
    [getCurrentSelectedTableRect]
  )

  const resizeTableColumnByIndex = useCallback(
    (columnIndex: number, deltaPx: number) => {
      const currentEditor = editorRef.current
      if (!currentEditor || deltaPx === 0) return { changed: false, appliedDelta: 0 }
      const rect = getCurrentSelectedTableRect(currentEditor)
      if (!rect || columnIndex < 0 || columnIndex >= rect.map.width) {
        return { changed: false, appliedDelta: 0 }
      }

      const tablePos = resolveTableNodePosition(currentEditor, rect.table)
      if (tablePos === null) {
        return { changed: false, appliedDelta: 0 }
      }
      const columns = collectSimpleTableColumnCells(rect.table, tablePos)
      if (!columns || columns.length === 0 || columnIndex >= columns.length) {
        return { changed: false, appliedDelta: 0 }
      }

      const currentWidths = columns.map((column) => readColumnWidthFromCell(column[0]))
      const renderedTable = findActiveRenderedTable(viewportRef.current, tableQuickRailStateRef.current)
      const renderedColumnWidths = readRenderedColumnWidths(renderedTable)
      const measuredWidths =
        renderedColumnWidths.length === columns.length ? renderedColumnWidths : currentWidths
      const nextWidths = shouldClampTableWidthBudget() && getTableOverflowMode(rect.table) !== TABLE_OVERFLOW_MODE_WIDE
        ? redistributeTableColumnWidthsForResize(
            measuredWidths,
            columnIndex,
            deltaPx,
            getCurrentEditorReadableWidthPx(currentEditor) - 2
          )
        : measuredWidths.map((width, index) =>
            index === columnIndex
              ? Math.max(TABLE_MIN_COLUMN_WIDTH_PX, Math.round(width + deltaPx))
              : width
          )

      const applied = applyTableColumnWidthsToTransaction(
        currentEditor.state.tr,
        columns,
        currentWidths,
        nextWidths
      )
      if (!applied.changed) {
        return { changed: false, appliedDelta: 0 }
      }
      currentEditor.view.dispatch(applied.transaction)
      setSelectionTick((prev) => prev + 1)
      return {
        changed: true,
        appliedDelta: nextWidths[columnIndex] - measuredWidths[columnIndex],
      }
    },
    [getCurrentSelectedTableRect, resolveTableNodePosition]
  )

  const resizeFirstTableColumnBy = useCallback((deltaPx: number) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return
    const firstCell = viewportRef.current?.querySelector(".aq-block-editor__content table tr:first-of-type > th, .aq-block-editor__content table tr:first-of-type > td") as HTMLElement | null
    if (!firstCell) return

    let domPosition = 0
    try {
      domPosition = currentEditor.view.posAtDOM(firstCell, 0)
    } catch {
      return
    }
    const resolvedPosition = resolveDocPosSafe(currentEditor, domPosition)
    if (!resolvedPosition) return

    for (let depth = resolvedPosition.depth; depth > 0; depth -= 1) {
      const node = resolvedPosition.node(depth)
      if (node.type.name !== "tableCell" && node.type.name !== "tableHeader") continue
      const cellPosition = resolvedPosition.before(depth)
      const cellNode = currentEditor.state.doc.nodeAt(cellPosition)
      if (!cellNode) return
      let tableDepth = depth - 1
      while (tableDepth > 0 && resolvedPosition.node(tableDepth).type.name !== "table") {
        tableDepth -= 1
      }

      const tableNode = tableDepth > 0 ? resolvedPosition.node(tableDepth) : null
      const tablePosition = tableDepth > 0 ? resolvedPosition.before(tableDepth) : null
      const columns = tableNode && tablePosition !== null
        ? collectSimpleTableColumnCells(tableNode, tablePosition)
        : null

      if (!columns || columns.length === 0) {
        const currentWidth = Array.isArray(cellNode.attrs?.colwidth) && cellNode.attrs.colwidth[0]
          ? Number(cellNode.attrs.colwidth[0])
          : Math.round(firstCell.getBoundingClientRect().width)
        const nextWidth = Math.max(TABLE_MIN_COLUMN_WIDTH_PX, Math.round(currentWidth + deltaPx))
        const transaction = currentEditor.state.tr.setNodeMarkup(cellPosition, undefined, {
          ...cellNode.attrs,
          colwidth: [nextWidth],
        })
        currentEditor.view.dispatch(transaction)
        return
      }

      const activeColumnIndex = columns.findIndex((column) =>
        column.some((cell) => cell.pos === cellPosition)
      )
      if (activeColumnIndex === -1) return
      if (!isCurrentTableColumnSelection(activeColumnIndex) && !selectTableColumnByIndex(activeColumnIndex)) {
        return
      }
      resizeTableColumnByIndex(activeColumnIndex, deltaPx)
      return
    }
  }, [isCurrentTableColumnSelection, resizeTableColumnByIndex, selectTableColumnByIndex])

  const startTableColumnRailResize = useCallback(
    (pointerId: number, columnIndex: number, clientX: number, boundaryClientX = clientX) => {
      if (!selectTableColumnByIndex(columnIndex)) return
      setTableQuickRailState((prev) => ({ ...prev, columnIndex }))
      clearWindowTextSelection()
      setColumnResizeUserSelectSuppressed(true)
      tableColumnRailResizeRef.current = {
        pointerId,
        columnIndex,
        lastClientX: clientX,
        previewClientX: clientX,
        guideOffsetX: boundaryClientX - clientX,
      }
      if (typeof document !== "undefined") {
        document.body.style.cursor = "col-resize"
      }
      syncTableColumnDragGuideForClientX(boundaryClientX)
    },
    [
      clearWindowTextSelection,
      selectTableColumnByIndex,
      setColumnResizeUserSelectSuppressed,
      syncTableColumnDragGuideForClientX,
    ]
  )

  const startTableColumnResizeFromDomHandle = useCallback(
    (target: EventTarget | null, pointerId: number, clientX: number) => {
      const handleElement =
        target instanceof Element ? target.closest(".column-resize-handle") : null
      if (!(handleElement instanceof HTMLElement)) return false
      const cell = handleElement.closest("th, td")
      if (!(cell instanceof HTMLElement) || !(cell.parentElement instanceof HTMLTableRowElement)) return false
      const columnIndex = Array.from(cell.parentElement.children).findIndex((candidate) => candidate === cell)
      if (columnIndex < 0) return false
      startTableColumnRailResize(pointerId, columnIndex, clientX, cell.getBoundingClientRect().right)
      return true
    },
    [startTableColumnRailResize]
  )

  const stopTableColumnRailResize = useCallback(() => {
    tableColumnRailResizeRef.current = null
    hideTableColumnDragGuide()
    clearWindowTextSelection()
    setColumnResizeUserSelectSuppressed(false)
    if (typeof document !== "undefined") {
      document.body.style.removeProperty("cursor")
    }
  }, [clearWindowTextSelection, hideTableColumnDragGuide, setColumnResizeUserSelectSuppressed])

  const syncTableQuickRailFromElement = useCallback((element: Element | null) => {
    const tableSurfaceElement = element?.closest(".aq-table-shell, .tableWrapper, table") ?? null
    const tableElement =
      tableSurfaceElement instanceof HTMLTableElement
        ? tableSurfaceElement
        : (tableSurfaceElement?.querySelector("table") as HTMLTableElement | null)
    const tableRect = tableElement?.getBoundingClientRect()
    if (!tableElement || !tableRect) {
      hideTableQuickRailImmediately()
      return
    }
    cancelTableQuickRailHide()
    const activeCell =
      (viewportRef.current?.querySelector(".aq-block-editor__content .selectedCell") as HTMLElement | null) ||
      (element?.closest("th, td") as HTMLElement | null) ||
      (tableElement.querySelector("th, td") as HTMLElement | null)
    const activeCellRect = activeCell?.getBoundingClientRect()
    const activeRowRect = activeCell?.closest("tr")?.getBoundingClientRect()
    const activeColumnIndex = activeCell?.parentElement
      ? Array.from(activeCell.parentElement.children).findIndex((child) => child === activeCell)
      : 0
    const firstRowCells = Array.from(
      (tableElement.querySelector("thead tr, tbody tr, tr")?.children ?? []) as HTMLCollectionOf<HTMLElement>
    )
      .filter((child): child is HTMLElement => child instanceof HTMLElement)
      .map((cell) => {
        const cellRect = cell.getBoundingClientRect()
        return {
          left: Math.round(Math.max(0, cellRect.left - tableRect.left)),
          width: Math.round(cellRect.width),
        }
      })
    setTableQuickRailState({
      visible: true,
      left: Math.round(Math.max(12, tableRect.left - 46)),
      top: Math.round(tableRect.top + 10),
      tableLeft: Math.round(tableRect.left),
      tableTop: Math.round(tableRect.top),
      width: Math.round(tableRect.width),
      height: Math.round(tableRect.height),
      rowTop: Math.round(activeRowRect?.top ?? tableRect.top + 52),
      rowHeight: Math.round(activeRowRect?.height ?? 44),
      columnLeft: Math.round(activeCellRect?.left ?? tableRect.left + 72),
      columnWidth: Math.round(activeCellRect?.width ?? 120),
      columnIndex: activeColumnIndex >= 0 ? activeColumnIndex : 0,
      columnSegments: firstRowCells,
    })
  }, [cancelTableQuickRailHide, hideTableQuickRailImmediately])

  const stabilizeTableSelectionSurface = useCallback((nextEditor?: TiptapEditor | null) => {
    if (typeof window === "undefined") return

    const run = () => {
      const activeEditor = nextEditor ?? editorRef.current
      if (!activeEditor) return
      normalizeRenderedTableWidthsToReadableBudget(activeEditor)
      const selectedCell = viewportRef.current?.querySelector(
        ".aq-block-editor__content .selectedCell"
      ) as HTMLElement | null
      const fallbackCell = viewportRef.current?.querySelector(
        ".aq-block-editor__content table th, .aq-block-editor__content table td"
      ) as HTMLElement | null
      if (!isTableSelectionActive(activeEditor) && !fallbackCell) return
      syncTableQuickRailFromElement(selectedCell ?? fallbackCell)
      setSelectionTick((prev) => prev + 1)
    }

    const schedule = (remainingFrames: number) => {
      run()
      if (remainingFrames <= 1) return
      window.requestAnimationFrame(() => schedule(remainingFrames - 1))
    }

    window.requestAnimationFrame(() => schedule(4))
  }, [syncTableQuickRailFromElement])

  useEffect(() => {
    tableQuickRailStateRef.current = tableQuickRailState
  }, [tableQuickRailState])

  const syncSerializedDoc = useCallback(
    (nextDoc: BlockEditorDoc) => {
      const serialized = serializeEditorDocToMarkdown(nextDoc)
      lastCommittedMarkdownRef.current = normalizeMarkdown(serialized)
      onChange(serialized, { editorFocused: true })
    },
    [onChange]
  )

  const focusTopLevelBlock = useCallback((blockIndex: number) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return
    const textPosition = getEditableTextPositionForTopLevelBlock(currentEditor, blockIndex)
    currentEditor.commands.focus(textPosition ?? getTopLevelBlockPosition(currentEditor, blockIndex))
  }, [])

  const focusNearestInsertedCalloutBody = useCallback((fallbackIndex?: number | null) => {
    if (typeof window === "undefined") return

    const syncFocus = () => {
      const currentEditor = editorRef.current
      if (!currentEditor) return

      const { doc } = currentEditor.state
      if (doc.childCount === 0) return

      const selectionIndex = getTopLevelBlockIndexFromSelection(currentEditor)
      const candidateIndices = Array.from(
        new Set(
          [selectionIndex - 1, selectionIndex, fallbackIndex, typeof fallbackIndex === "number" ? fallbackIndex + 1 : null]
            .filter((value): value is number => typeof value === "number" && value >= 0 && value < doc.childCount)
        )
      )
      const calloutIndex = candidateIndices.find((index) => doc.child(index)?.type.name === "calloutBlock")
      if (typeof calloutIndex !== "number") return

      focusTopLevelBlock(calloutIndex)
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(syncFocus)
    })
  }, [focusTopLevelBlock])

  const replaceEditorDocFromExternalValue = useCallback((nextDoc: BlockEditorDoc) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return

    currentEditor.chain().setMeta("addToHistory", false).setContent(nextDoc, { emitUpdate: false }).run()
    lastCommittedMarkdownRef.current = normalizeMarkdown(serializeEditorDocToMarkdown(nextDoc))
  }, [])

  const replaceEditorDoc = useCallback(
    (nextDoc: BlockEditorDoc, focusIndex?: number | null) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return
      currentEditor.commands.setContent(nextDoc, { emitUpdate: false })
      syncSerializedDoc(nextDoc)

      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          if (typeof focusIndex === "number") {
            focusTopLevelBlock(focusIndex)
          } else {
            currentEditor.commands.focus()
          }
        })
      }
    },
    [focusTopLevelBlock, syncSerializedDoc]
  )

  const mutateTopLevelBlocks = useCallback(
    (
      mutator: (doc: BlockEditorDoc) => BlockEditorDoc,
      focusIndex?: number | null
    ) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return
      const nextDoc = mutator(currentEditor.getJSON() as BlockEditorDoc)
      replaceEditorDoc(nextDoc, focusIndex)
    },
    [replaceEditorDoc]
  )

  const replaceCurrentParagraphWithBlocks = useCallback((blocks: BlockEditorDoc[], focusBlockIndex = 0) => {
    const currentEditor = editorRef.current
    if (!currentEditor || blocks.length === 0) return false

    const { selection, schema } = currentEditor.state
    const paragraph = selection.$from.parent
    if (paragraph.type.name !== "paragraph") return false

    const from = selection.$from.before(selection.$from.depth)
    const to = selection.$from.after(selection.$from.depth)
    const nextNodes = blocks.map((block) => schema.nodeFromJSON(block))
    const normalizedFocusBlockIndex = Math.max(0, Math.min(focusBlockIndex, nextNodes.length - 1))
    const focusNode = nextNodes[normalizedFocusBlockIndex]
    const focusNodeStartPos = from + nextNodes
      .slice(0, normalizedFocusBlockIndex)
      .reduce((sum, node) => sum + node.nodeSize, 0)

    let transaction = currentEditor.state.tr.replaceWith(from, to, Fragment.fromArray(nextNodes))

    if (focusNode) {
      const selectionPos =
        getFirstEditableTextPositionInNode(focusNode, focusNodeStartPos) ??
        Math.max(1, focusNodeStartPos + 1)
      transaction = transaction.setSelection(TextSelection.create(transaction.doc, selectionPos))
    }

    currentEditor.view.dispatch(transaction.scrollIntoView())
    currentEditor.view.focus()
    syncSerializedDoc(currentEditor.getJSON() as BlockEditorDoc)
    return true
  }, [syncSerializedDoc])

  const createInitialTableNode = useCallback(() => {
    const safeContentWidth = Math.max(
      TABLE_MIN_COLUMN_WIDTH_PX * DEFAULT_EMPTY_TABLE_COLUMN_COUNT,
      getCurrentEditorReadableWidthPx(editorRef.current)
    )
    const targetInnerWidth = Math.max(
      TABLE_MIN_COLUMN_WIDTH_PX * DEFAULT_EMPTY_TABLE_COLUMN_COUNT,
      safeContentWidth - 2
    )
    const baseColumnWidth = Math.max(
      TABLE_MIN_COLUMN_WIDTH_PX,
      Math.floor(targetInnerWidth / DEFAULT_EMPTY_TABLE_COLUMN_COUNT)
    )
    const lastColumnWidth =
      targetInnerWidth - baseColumnWidth * (DEFAULT_EMPTY_TABLE_COLUMN_COUNT - 1)
    const initialLayout: MarkdownTableLayout = {
      overflowMode: "normal",
      columnWidths: Array.from({ length: DEFAULT_EMPTY_TABLE_COLUMN_COUNT }, (_, columnIndex) =>
        columnIndex === DEFAULT_EMPTY_TABLE_COLUMN_COUNT - 1
          ? Math.max(TABLE_MIN_COLUMN_WIDTH_PX, lastColumnWidth)
          : baseColumnWidth
      ),
    }

    return createEmptyTableNode(
      DEFAULT_EMPTY_TABLE_ROW_COUNT,
      DEFAULT_EMPTY_TABLE_COLUMN_COUNT,
      initialLayout
    )
  }, [])

  const buildSlashWholeParagraphReplacement = useCallback((itemId: string) => {
    switch (itemId) {
      case "paragraph":
        return { blocks: [createParagraphNode("")], focusBlockIndex: 0 }
      case "heading-1":
        return { blocks: [createHeadingNode(1, "")], focusBlockIndex: 0 }
      case "heading-2":
        return { blocks: [createHeadingNode(2, "")], focusBlockIndex: 0 }
      case "heading-3":
        return { blocks: [createHeadingNode(3, "")], focusBlockIndex: 0 }
      case "heading-4":
        return { blocks: [createHeadingNode(4, "")], focusBlockIndex: 0 }
      case "bullet-list":
        return { blocks: [createBulletListNode([""])], focusBlockIndex: 0 }
      case "ordered-list":
        return { blocks: [createOrderedListNode([""])], focusBlockIndex: 0 }
      case "checklist":
        return { blocks: [createTaskListNode([{ checked: false, text: "" }])], focusBlockIndex: 0 }
      case "quote":
        return { blocks: [createBlockquoteNode("")], focusBlockIndex: 0 }
      case "code-block":
        return {
          blocks: [createCodeBlockNode(getPreferredCodeLanguage(), "")],
          focusBlockIndex: 0,
        }
      case "table":
        return {
          blocks: [createInitialTableNode()],
          focusBlockIndex: 0,
        }
      case "callout":
        return {
          blocks: [
            createCalloutNode({
              kind: "tip",
              title: "",
              body: "",
            }),
          ],
          focusBlockIndex: 0,
        }
      case "toggle":
        return {
          blocks: [
            createToggleNode({
              title: "",
              body: "",
            }),
          ],
          focusBlockIndex: 0,
        }
      case "bookmark":
        return {
          blocks: [
            createBookmarkNode({
              url: "",
              title: "",
              description: "",
            }),
          ],
          focusBlockIndex: 0,
        }
      case "embed":
        return {
          blocks: [
            createEmbedNode({
              url: "",
              title: "",
              caption: "",
            }),
          ],
          focusBlockIndex: 0,
        }
      case "formula":
        return {
          blocks: [createFormulaNode({ formula: "" })],
          focusBlockIndex: 0,
        }
      case "divider":
        return {
          blocks: [createHorizontalRuleNode(), createParagraphNode("")],
          focusBlockIndex: 1,
        }
      case "mermaid":
        if (!enableMermaidBlocks) return null
        return {
          blocks: [createMermaidNode("")],
          focusBlockIndex: 0,
        }
      default:
        return null
    }
  }, [createInitialTableNode, enableMermaidBlocks])

  const transformCurrentParagraphViaSlash = useCallback((itemId: string) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return false

    if (TABLE_CONTEXT_BLOCKED_INSERT_IDS.has(itemId) && isTableSelectionActive(currentEditor)) {
      return false
    }

    const { selection } = currentEditor.state
    if (selection.$from.parent.type.name !== "paragraph") return false

    const replacementSpec = buildSlashWholeParagraphReplacement(itemId)
    if (!replacementSpec || replacementSpec.blocks.length === 0) {
      return false
    }

    const { blocks, focusBlockIndex = 0 } = replacementSpec
    const replacementBlockType = blocks[0]?.type ?? ""

    if (["bulletList", "orderedList", "taskList"].includes(replacementBlockType)) {
      const currentBlockIndex = getTopLevelBlockIndexFromSelection(currentEditor)
      const nextSibling =
        currentBlockIndex >= 0 && currentBlockIndex < currentEditor.state.doc.childCount - 1
          ? currentEditor.state.doc.child(currentBlockIndex + 1)
          : null

      if (nextSibling?.type.name === replacementBlockType) {
        return replaceCurrentParagraphWithBlocks([...blocks, createParagraphNode()], focusBlockIndex)
      }
    }

    return replaceCurrentParagraphWithBlocks(blocks, focusBlockIndex)
  }, [buildSlashWholeParagraphReplacement, replaceCurrentParagraphWithBlocks])

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: false,
        codeBlock: false,
        listItem: false,
        listKeymap: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: false,
        linkOnPaste: true,
      }),
      InlineColorMark,
      Placeholder.configure({
        placeholder: "이야기를 적고, / 또는 아래 빠른 블록으로 표·콜아웃·토글을 추가하세요...",
      }),
      EditorTable.configure({
        resizable: true,
        renderWrapper: true,
        cellMinWidth: TABLE_MIN_COLUMN_WIDTH_PX,
      }),
      EditorCodeBlock,
      RawMarkdownBlock,
      ResizableImage,
      CalloutBlock,
      EditorListItem,
      EditorTaskList,
      EditorTaskItem,
      EditorListKeymap,
      InlineFormula,
      BookmarkBlock,
      EmbedBlock,
      FileBlock,
      FormulaBlock,
      ToggleBlock,
      ...(enableMermaidBlocks ? [MermaidBlock] : []),
    ],
    content: initialDocRef.current,
    // Keep editor initialization deterministic so table nodeView/plugin path
    // does not diverge by first-render loading state.
    editable: true,
    onCreate: ({ editor: createdEditor }) => {
      editorRef.current = createdEditor
      createdEditor.setEditable(!disabled)
      scheduleTableViewportBudgetNormalize(createdEditor)
    },
    onTransaction: ({ editor: nextEditor, transaction }) => {
      if (!transaction.docChanged) return
      if (transaction.getMeta(TABLE_WIDTH_BUDGET_META_KEY)) return
      normalizeTableWidthsToReadableBudget(nextEditor)
      scheduleTableViewportBudgetNormalize(nextEditor)
    },
    onDestroy: () => {
      const destroyedEditor = editorRef.current
      if (destroyedEditor) {
        pendingCommitEditorRef.current = destroyedEditor
        pendingCommitFocusedRef.current = destroyedEditor.isFocused
      }
      cancelScheduledTableViewportBudgetNormalize()
      cancelPendingMarkdownCommit()
      flushPendingMarkdownCommit()
      editorRef.current = null
      pendingCommitEditorRef.current = null
    },
    editorProps: {
      attributes: {
        class: "aq-block-editor__content",
        "data-testid": "block-editor-prosemirror",
      },
      handleKeyDown: (_, event) => {
        const currentEditor = editorRef.current
        if (!currentEditor) return false
        if (event.defaultPrevented) return false
        const normalizedKey = event.key.toLowerCase()
        const hasPrimaryModifier = isPrimaryModifierPressed(event)
        const selection = currentEditor.state.selection as typeof currentEditor.state.selection & {
          node?: { isBlock?: boolean }
        }
        const isTopLevelBlockNodeSelection = Boolean(
          selection.$from.depth === 0 && selection.node?.isBlock
        )

        if (
          !hasPrimaryModifier &&
          !event.altKey &&
          !event.shiftKey &&
          event.key === "Tab" &&
          !isTopLevelBlockNodeSelection
        ) {
          const targetBlockIndex =
            hoveredBlockIndex ??
            findTopLevelBlockIndexFromTarget(event.target) ??
            getTopLevelBlockIndexFromSelection(currentEditor)
          if (!isTabBlockSelectionEligible(currentEditor, targetBlockIndex)) return false
          event.preventDefault()
          return promoteTopLevelBlockSelection(targetBlockIndex)
        }

        if (
          !hasPrimaryModifier &&
          !event.altKey &&
          !event.shiftKey &&
          (event.key === "Backspace" || event.key === "Delete") &&
          (isTopLevelBlockNodeSelection || selectedBlockNodeIndexRef.current !== null)
        ) {
          event.preventDefault()
          const blockIndex = selectedBlockNodeIndexRef.current ?? getTopLevelBlockIndexFromSelection(currentEditor)
          const contentLength = (currentEditor.getJSON() as BlockEditorDoc).content?.length ?? 0
          const nextFocusIndex = Math.max(0, Math.min(blockIndex, Math.max(contentLength - 2, 0)))
          mutateTopLevelBlocks((doc) => deleteTopLevelBlockAt(doc, blockIndex), nextFocusIndex)
          setBlockMenuState(null)
          keyboardBlockSelectionStickyRef.current = false
          setSelectedBlockNodeIndex(null)
          syncSelectedBlockNodeSurface(null)
          return true
        }

        if (hasPrimaryModifier && !event.altKey && !event.shiftKey && normalizedKey === "b") {
          event.preventDefault()
          currentEditor.chain().focus().toggleBold().run()
          return true
        }

        if (hasPrimaryModifier && !event.altKey && !event.shiftKey && normalizedKey === "i") {
          event.preventDefault()
          currentEditor.chain().focus().toggleItalic().run()
          return true
        }

        if (hasPrimaryModifier && !event.altKey && !event.shiftKey && normalizedKey === "k") {
          event.preventDefault()
          openLinkPrompt()
          return true
        }

        if (hasPrimaryModifier && event.altKey && !event.shiftKey && normalizedKey === "m") {
          event.preventDefault()
          insertInlineFormula()
          return true
        }

        if (hasPrimaryModifier && !event.altKey && event.shiftKey && normalizedKey === "m") {
          event.preventDefault()
          insertFormulaBlock()
          return true
        }

        if (hasPrimaryModifier && event.altKey && !event.shiftKey && normalizedKey === "2") {
          event.preventDefault()
          currentEditor.chain().focus().toggleHeading({ level: 2 }).run()
          return true
        }

        if (hasPrimaryModifier && event.altKey && !event.shiftKey && normalizedKey === "3") {
          event.preventDefault()
          currentEditor.chain().focus().toggleHeading({ level: 3 }).run()
          return true
        }

        if (hasPrimaryModifier && !event.altKey && event.shiftKey && normalizedKey === "7") {
          event.preventDefault()
          currentEditor.chain().focus().toggleOrderedList().run()
          return true
        }

        if (hasPrimaryModifier && !event.altKey && event.shiftKey && normalizedKey === "8") {
          event.preventDefault()
          currentEditor.chain().focus().toggleBulletList().run()
          return true
        }

        if (hasPrimaryModifier && !event.altKey && event.shiftKey && normalizedKey === "9") {
          event.preventDefault()
          currentEditor.chain().focus().toggleBlockquote().run()
          return true
        }

        if (hasPrimaryModifier && !event.altKey && !event.shiftKey && normalizedKey === "z") {
          event.preventDefault()
          // Guard against OS key repeat causing multiple undo steps in one press.
          if (event.repeat) return true
          if (currentEditor.can().chain().focus().undo().run()) {
            currentEditor.chain().focus().undo().run()
          }
          return true
        }

        if (hasPrimaryModifier && !event.altKey && event.shiftKey && normalizedKey === "z") {
          event.preventDefault()
          if (event.repeat) return true
          if (currentEditor.can().chain().focus().redo().run()) {
            currentEditor.chain().focus().redo().run()
          }
          return true
        }

        if (selectedBlockNodeIndexRef.current !== null) {
          keyboardBlockSelectionStickyRef.current = false
          setSelectedBlockNodeIndex(null)
          syncSelectedBlockNodeSurface(null)
        }

        return false
      },
      handlePaste: (_, event) => {
        const currentEditor = editorRef.current
        if (!currentEditor) return false
        const isTableContextPaste = isTableSelectionActive(currentEditor)

        const clipboardFiles = Array.from(event.clipboardData?.files || [])
        const imageFile = clipboardFiles.find((file) => file.type.startsWith("image/"))
        if (imageFile && !isTableContextPaste) {
          event.preventDefault()
          void (async () => {
            const imageAttrs = await onUploadImage(imageFile)
            currentEditor
              .chain()
              .focus()
              .insertContent([
                {
                  type: "resizableImage",
                  attrs: {
                    src: imageAttrs.src,
                    alt: imageAttrs.alt || "",
                    title: imageAttrs.title || "",
                    widthPx: imageAttrs.widthPx ?? null,
                    align: imageAttrs.align || "center",
                  },
                },
                { type: "paragraph" },
              ])
              .run()
          })()
          return true
        }

        const attachmentFile = clipboardFiles.find((file) => !file.type.startsWith("image/"))
        if (attachmentFile && onUploadFile && !isTableContextPaste) {
          event.preventDefault()
          void (async () => {
            const fileAttrs = await onUploadFile(attachmentFile)
            insertDocContent(
              {
                type: "doc",
                content: [createFileBlockNode(fileAttrs), { type: "paragraph" }],
              },
              isSelectionInEmptyParagraph()
            )
          })()
          return true
        }

        const plainText = event.clipboardData?.getData("text/plain") || ""
        const html = event.clipboardData?.getData("text/html") || ""
        const trimmedPlainText = plainText.trim()
        const normalizedPlainText = normalizeStructuredMarkdownClipboard(plainText)
        const normalizedHtmlMarkdown = html ? convertHtmlToMarkdown(html) : ""
        const extractedPlainTextFromHtml = html ? extractPlainTextFromHtml(html) : ""
        const calloutPasteText = plainText || extractedPlainTextFromHtml

        if (calloutPasteText && replaceEmptyCalloutBodyWithPlainText(calloutPasteText)) {
          event.preventDefault()
          return true
        }

        if (isTableContextPaste) {
          const normalizedTablePasteText = normalizeTableContextPasteText(
            normalizedHtmlMarkdown,
            normalizedPlainText,
            extractedPlainTextFromHtml,
            plainText
          )
          if (normalizedTablePasteText) {
            event.preventDefault()
            currentEditor.chain().focus().insertContent(normalizedTablePasteText).run()
            return true
          }
        }

        if (
          isSelectionInEmptyParagraph() &&
          trimmedPlainText &&
          !trimmedPlainText.includes("\n") &&
          isHttpUrl(trimmedPlainText)
        ) {
          event.preventDefault()
          void insertCardBlockFromUrl(trimmedPlainText)
          return true
        }

        if (html && normalizedHtmlMarkdown) {
          event.preventDefault()
          const parsedDoc = downgradeDisabledFeatureNodes(
            parseMarkdownToEditorDoc(normalizedHtmlMarkdown),
            enableMermaidBlocks
          )
          const readableWidthBudget = getCurrentEditorReadableWidthPx(currentEditor) - 2
          return insertDocContent(
            promotePastedWideTables(parsedDoc, readableWidthBudget),
            isSelectionInEmptyParagraph()
          )
        }

        if (normalizedPlainText && looksLikeStructuredMarkdownDocument(normalizedPlainText)) {
          event.preventDefault()
          const parsedDoc = downgradeDisabledFeatureNodes(
            parseMarkdownToEditorDoc(normalizedPlainText),
            enableMermaidBlocks
          )
          const readableWidthBudget = getCurrentEditorReadableWidthPx(currentEditor) - 2
          return insertDocContent(
            promotePastedWideTables(parsedDoc, readableWidthBudget),
            isSelectionInEmptyParagraph()
          )
        }

        if (html && !plainText.trim()) {
          const extracted = extractedPlainTextFromHtml
          if (extracted) {
            event.preventDefault()
            currentEditor.chain().focus().insertContent(extracted).run()
            return true
          }
        }

        return false
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      const commitStartedAt = typeof window !== "undefined" ? performance.now() : 0
      scheduleMarkdownCommit(nextEditor)
      if (typeof window !== "undefined") {
        recordEditorCommitDurationForRuntimeGuard(performance.now() - commitStartedAt)
      }
    },
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [disabled, editor])

  useEffect(() => {
    selectedBlockNodeIndexRef.current = selectedBlockNodeIndex
  }, [selectedBlockNodeIndex])

  useEffect(() => {
    const root = getContentRoot()
    if (!root) return
    if (selectedBlockNodeIndex !== null && keyboardBlockSelectionStickyRef.current) {
      root.setAttribute("data-keyboard-block-selection", "true")
      return
    }
    root.removeAttribute("data-keyboard-block-selection")
  }, [getContentRoot, selectedBlockNodeIndex, selectionTick])

  useEffect(() => {
    if (!editor) return
    let disposed = false

    const notifySelection = () => {
      const selection = editor.state.selection as typeof editor.state.selection & {
        node?: { isBlock?: boolean }
      }
      const nextBlockIndex = getTopLevelBlockIndexFromSelection(editor)
      const isTopLevelBlockNodeSelection = Boolean(
        selection.$from.depth === 0 && selection.node?.isBlock
      )
      const inTableContext = isTableSelectionActive(editor) ? 1 : 0
      const nextSignature = `${nextBlockIndex ?? "none"}:${isTopLevelBlockNodeSelection ? 1 : 0}:${keyboardBlockSelectionStickyRef.current ? 1 : 0}:${inTableContext}`
      if (nextSignature === selectionUiSignatureRef.current) {
        return
      }
      selectionUiSignatureRef.current = nextSignature
      setSelectionTick((prev) => prev + 1)
      setSelectedBlockIndex(nextBlockIndex)
      if (isTopLevelBlockNodeSelection) {
        if (keyboardBlockSelectionStickyRef.current) {
          setClickedBlockIndex(null)
          setSelectedBlockNodeIndex(nextBlockIndex)
          return
        }

        // Ignore incidental node selection from content clicks/drags.
        const editablePos = getEditableTextPositionForTopLevelBlock(editor, nextBlockIndex)
        if (editablePos !== null) {
          const nextTextSelection = TextSelection.create(editor.state.doc, editablePos)
          editor.view.dispatch(editor.state.tr.setSelection(nextTextSelection))
        }
        setSelectedBlockNodeIndex(null)
        return
      }
      if (!keyboardBlockSelectionStickyRef.current) {
        setSelectedBlockNodeIndex(null)
      }
    }

    const notifyBlur = () => {
      selectionUiSignatureRef.current = ""
      setSelectionTick((prev) => prev + 1)
      const finalizeBlur = () => {
        if (disposed || editor.isFocused) return
        setClickedBlockIndex(null)
        setSelectedBlockIndex(null)
        if (!keyboardBlockSelectionStickyRef.current) {
          setSelectedBlockNodeIndex(null)
        }
      }
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(finalizeBlur)
        return
      }
      finalizeBlur()
    }

    notifySelection()
    editor.on("selectionUpdate", notifySelection)
    editor.on("focus", notifySelection)
    editor.on("blur", notifyBlur)
    return () => {
      disposed = true
      editor.off("selectionUpdate", notifySelection)
      editor.off("focus", notifySelection)
      editor.off("blur", notifyBlur)
      selectionUiSignatureRef.current = ""
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return

    const handleEditorMouseDownCapture = (event: MouseEvent) => {
      const targetBlockIndex =
        findTopLevelBlockIndexFromTarget(event.target) ??
        findTopLevelBlockIndexByClientPosition(event.clientX, event.clientY)
      if (isTableSelectionActive(editor)) return
      if (!isOuterBlockSelectionGesture(event, targetBlockIndex)) {
        const shouldReleaseStickyBlockSelection =
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.shiftKey &&
          keyboardBlockSelectionStickyRef.current &&
          selectedBlockNodeIndexRef.current !== null
        if (shouldReleaseStickyBlockSelection) {
          keyboardBlockSelectionStickyRef.current = false
          setSelectedBlockNodeIndex(null)
          syncSelectedBlockNodeSurface(null)
        }
        return
      }
      if (targetBlockIndex === null) return
      event.preventDefault()
      event.stopPropagation()
      skipNextPointerDownSelectionClearRef.current = true
      promoteTopLevelBlockSelection(targetBlockIndex)
    }

    const editorDom = editor.view.dom
    editorDom.addEventListener("mousedown", handleEditorMouseDownCapture, true)
    return () => {
      editorDom.removeEventListener("mousedown", handleEditorMouseDownCapture, true)
    }
  }, [
    editor,
    findTopLevelBlockIndexByClientPosition,
    findTopLevelBlockIndexFromTarget,
    isOuterBlockSelectionGesture,
    promoteTopLevelBlockSelection,
    syncSelectedBlockNodeSurface,
  ])

  useEffect(() => {
    if (!editor || typeof document === "undefined" || typeof window === "undefined") return

    const handleKeyDownCapture = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.key !== "Tab" || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      if (slashMenuState) return

      const currentEditor = editorRef.current
      if (!currentEditor) return
      const editorDom = currentEditor.view.dom
      const activeElement = document.activeElement
      const domSelection = window.getSelection()
      const anchorElement =
        domSelection?.anchorNode instanceof Element
          ? domSelection.anchorNode
          : domSelection?.anchorNode?.parentElement ?? null
      const selectionInsideEditor =
        (activeElement instanceof Element && editorDom.contains(activeElement)) ||
        (anchorElement instanceof Element && editorDom.contains(anchorElement))
      const targetBlockIndex =
        hoveredBlockIndex ??
        findTopLevelBlockIndexFromTarget(anchorElement ?? activeElement ?? event.target) ??
        getTopLevelBlockIndexFromSelection(currentEditor)
      if (!selectionInsideEditor && hoveredBlockIndex === null) return
      if (!isTabBlockSelectionEligible(currentEditor, targetBlockIndex)) return
      const selection = currentEditor.state.selection as typeof currentEditor.state.selection & {
        node?: { isBlock?: boolean }
      }
      const isTopLevelBlockNodeSelection = Boolean(
        selection.$from.depth === 0 && selection.node?.isBlock
      )
      if (isTopLevelBlockNodeSelection) return

      event.preventDefault()
      event.stopPropagation()
      promoteTopLevelBlockSelection(targetBlockIndex)
    }

    document.addEventListener("keydown", handleKeyDownCapture, true)
    return () => {
      document.removeEventListener("keydown", handleKeyDownCapture, true)
    }
  }, [editor, findTopLevelBlockIndexFromTarget, hoveredBlockIndex, promoteTopLevelBlockSelection, slashMenuState])

  useEffect(() => {
    if (typeof window === "undefined") return

    const handlePointerMove = (event: PointerEvent) => {
      const state = tableRowResizeRef.current
      if (!state) return
      const nextHeight = Math.max(
        TABLE_MIN_ROW_HEIGHT_PX,
        Math.round(state.startHeight + (event.clientY - state.startY))
      )
      state.row.style.height = `${nextHeight}px`
      state.cells.forEach((cell) => {
        cell.style.height = `${nextHeight}px`
        cell.style.minHeight = `${nextHeight}px`
      })
    }

    const handlePointerUp = () => {
      const state = tableRowResizeRef.current
      if (state) {
        const committedHeight = Math.max(
          TABLE_MIN_ROW_HEIGHT_PX,
          Math.round(state.row.getBoundingClientRect().height)
        )
        commitTableRowHeight(state.row, committedHeight)
      }
      stopTableRowResize()
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerUp)

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerUp)
      stopTableRowResize()
    }
  }, [commitTableRowHeight, stopTableRowResize])

  useEffect(() => {
    if (typeof window === "undefined") return

    const handlePointerMove = (event: PointerEvent) => {
      const state = tableColumnRailResizeRef.current
      if (!state || state.pointerId !== event.pointerId) return
      const nextClientX = event.clientX
      state.previewClientX = nextClientX
      syncTableColumnDragGuideForClientX(nextClientX + state.guideOffsetX)
      const deltaX = nextClientX - state.lastClientX
      if (deltaX === 0) return
      const resizeResult = resizeTableColumnByIndex(state.columnIndex, deltaX)
      if (resizeResult.changed) {
        state.lastClientX += resizeResult.appliedDelta
      }
      if (!resizeResult.changed || Math.abs(state.lastClientX - nextClientX) > 0.5) {
        syncTableColumnDragGuideForClientX(state.lastClientX + state.guideOffsetX)
      }
    }

    const handlePointerUp = (event: PointerEvent) => {
      const state = tableColumnRailResizeRef.current
      if (!state || state.pointerId !== event.pointerId) return
      const pendingDelta = state.previewClientX - state.lastClientX
      if (Math.abs(pendingDelta) > 0.5) {
        const resizeResult = resizeTableColumnByIndex(state.columnIndex, pendingDelta)
        if (resizeResult.changed) {
          state.lastClientX += resizeResult.appliedDelta
        }
      }
      stopTableColumnRailResize()
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerUp)

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerUp)
      stopTableColumnRailResize()
    }
  }, [
    resizeTableColumnByIndex,
    stopTableColumnRailResize,
    syncTableColumnDragGuideForClientX,
    syncTableColumnDragGuideForColumn,
  ])

  useEffect(() => {
    const currentEditor = editorRef.current ?? editor
    if (!currentEditor) return
    let rafId: number | null = null

    const syncBubble = () => {
      const activeEditor = editorRef.current ?? currentEditor
      if (!activeEditor) {
        scheduleBubbleHide()
        if (!tableMenuState) {
          hideTableQuickRailImmediately()
        }
        return
      }

      let selection = activeEditor.state.selection
      if (selection.empty && typeof window !== "undefined" && !tableColumnRailResizeRef.current) {
        const domSelection = window.getSelection()
        const range =
          domSelection && domSelection.rangeCount > 0 ? domSelection.getRangeAt(0) : null
        const commonAncestor =
          range?.commonAncestorContainer instanceof Element
            ? range.commonAncestorContainer
            : range?.commonAncestorContainer?.parentElement ?? null

        if (range && domSelection && !domSelection.isCollapsed && commonAncestor && activeEditor.view.dom.contains(commonAncestor)) {
          const syncPmSelectionFromRange = (from: number, to: number) => {
            if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return false
            const nextSelection = TextSelection.create(
              activeEditor.state.doc,
              Math.min(from, to),
              Math.max(from, to)
            )
            if (!nextSelection.eq(activeEditor.state.selection)) {
              activeEditor.view.dispatch(activeEditor.state.tr.setSelection(nextSelection))
              selection = activeEditor.state.selection
            }
            return true
          }

          let synced = false
          try {
            const from = activeEditor.view.posAtDOM(range.startContainer, range.startOffset)
            const to = activeEditor.view.posAtDOM(range.endContainer, range.endOffset)
            synced = syncPmSelectionFromRange(from, to)
          } catch {
            synced = false
          }

          if (!synced) {
            const rangeRects = Array.from(range.getClientRects())
            const startRect = rangeRects[0] ?? range.getBoundingClientRect()
            const endRect = rangeRects[rangeRects.length - 1] ?? startRect
            const startCoords = activeEditor.view.posAtCoords({
              left: startRect.left + 1,
              top: startRect.top + startRect.height / 2,
            })
            const endCoords = activeEditor.view.posAtCoords({
              left: Math.max(endRect.left + 1, endRect.right - 1),
              top: endRect.top + endRect.height / 2,
            })
            if (startCoords?.pos && endCoords?.pos) {
              syncPmSelectionFromRange(startCoords.pos, endCoords.pos)
            }
          }
        }
      }

      const isImageNodeSelected = activeEditor.isActive("resizableImage")
      const isTableActive = isTableSelectionActive(activeEditor)
      const isTableStructuralSelection =
        selection instanceof CellSelection ||
        (selection instanceof NodeSelection && selection.node.type.name === "table")
      const canShowTextToolbar =
        !selection.empty &&
        !isImageNodeSelected &&
        !activeEditor.isActive("codeBlock") &&
        !activeEditor.isActive("rawMarkdownBlock") &&
        !isTableStructuralSelection

      if (canShowTextToolbar && mouseTextSelectionInProgressRef.current) {
        syncBubbleOnMouseUpRef.current = true
        if (bubbleToolbarHoveredRef.current) return
        setBubbleState((prev) => (prev.visible && prev.mode === "text" ? { ...prev, visible: false } : prev))
        if (!tableMenuState) {
          hideTableQuickRailImmediately()
        }
        return
      }

      if (!isImageNodeSelected && !canShowTextToolbar && !isTableActive) {
        if (bubbleToolbarHoveredRef.current) return
        scheduleBubbleHide()
        if (!tableMenuState) {
          scheduleTableQuickRailHide()
        }
        return
      }

      if (isTableActive && !canShowTextToolbar) {
        cancelBubbleHide()
        setBubbleState((prev) => (prev.visible ? { ...prev, visible: false } : prev))
        const anchorDom = activeEditor.view.domAtPos(selection.from).node
        const anchorElement =
          anchorDom instanceof Element ? anchorDom : anchorDom.parentElement
        if (anchorElement?.closest(".aq-table-shell, .tableWrapper, table")) {
          syncTableQuickRailFromElement(anchorElement)
          return
        }
      }

      cancelBubbleHide()
      hideTableQuickRailImmediately()

      const startCoords = activeEditor.view.coordsAtPos(selection.from)
      const endCoords = activeEditor.view.coordsAtPos(isImageNodeSelected ? selection.from : selection.to)
      const nextBubbleState: FloatingBubbleState = {
        visible: true,
        mode: isImageNodeSelected ? "image" : "text",
        anchor: "center",
        left: Math.round((startCoords.left + endCoords.right) / 2),
        top: Math.round(Math.min(startCoords.top, endCoords.top)),
      }
      setBubbleState((prev) =>
        prev.visible === nextBubbleState.visible &&
        prev.mode === nextBubbleState.mode &&
        prev.anchor === nextBubbleState.anchor &&
        prev.left === nextBubbleState.left &&
        prev.top === nextBubbleState.top
          ? prev
          : nextBubbleState
      )
    }

    const scheduleSyncBubble = () => {
      if (typeof window === "undefined") {
        syncBubble()
        return
      }
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        syncBubble()
      })
    }

    const handleDocumentSelectionChange = () => {
      const activeEditor = editorRef.current ?? currentEditor
      if (!activeEditor) return
      if (tableColumnRailResizeRef.current) {
        clearWindowTextSelection()
        return
      }
      const selection = window.getSelection()
      const anchorNode = selection?.anchorNode ?? null
      const anchorElement =
        anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement ?? null
      if (anchorElement && !activeEditor.view.dom.contains(anchorElement)) return
      scheduleSyncBubble()
    }

    const handleEditorPointerDownCapture = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return
      const activeEditor = editorRef.current ?? currentEditor
      if (!activeEditor) return
      if (!(event.target instanceof Node) || !activeEditor.view.dom.contains(event.target)) return
      if (startTableColumnResizeFromDomHandle(event.target, event.pointerId, event.clientX)) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation?.()
        mouseTextSelectionInProgressRef.current = false
        syncBubbleOnMouseUpRef.current = false
        return
      }
      mouseTextSelectionInProgressRef.current = true
      syncBubbleOnMouseUpRef.current = false
      if (bubbleToolbarHoveredRef.current) return
      setBubbleState((prev) => (prev.visible && prev.mode === "text" ? { ...prev, visible: false } : prev))
    }

    const handleEditorMouseDownCapture = (event: MouseEvent) => {
      const activeEditor = editorRef.current ?? currentEditor
      if (!activeEditor) return
      if (!(event.target instanceof Node) || !activeEditor.view.dom.contains(event.target)) return
      if (!(event.target instanceof Element) || !event.target.closest(".column-resize-handle")) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation?.()
    }

    const handleWindowPointerUp = (event: PointerEvent) => {
      if (!mouseTextSelectionInProgressRef.current) return
      if (event.pointerType && event.pointerType !== "mouse") return
      mouseTextSelectionInProgressRef.current = false
      if (!syncBubbleOnMouseUpRef.current) return
      syncBubbleOnMouseUpRef.current = false
      scheduleSyncBubble()
    }

    scheduleSyncBubble()
    currentEditor.on("selectionUpdate", scheduleSyncBubble)
    currentEditor.on("focus", scheduleSyncBubble)
    document.addEventListener("selectionchange", handleDocumentSelectionChange)
    document.addEventListener("pointerdown", handleEditorPointerDownCapture, true)
    document.addEventListener("mousedown", handleEditorMouseDownCapture, true)
    window.addEventListener("pointerup", handleWindowPointerUp, true)
    window.addEventListener("pointercancel", handleWindowPointerUp, true)
    return () => {
      currentEditor.off("selectionUpdate", scheduleSyncBubble)
      currentEditor.off("focus", scheduleSyncBubble)
      document.removeEventListener("selectionchange", handleDocumentSelectionChange)
      document.removeEventListener("pointerdown", handleEditorPointerDownCapture, true)
      document.removeEventListener("mousedown", handleEditorMouseDownCapture, true)
      window.removeEventListener("pointerup", handleWindowPointerUp, true)
      window.removeEventListener("pointercancel", handleWindowPointerUp, true)
      if (rafId !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(rafId)
      }
      mouseTextSelectionInProgressRef.current = false
      syncBubbleOnMouseUpRef.current = false
      cancelBubbleHide()
    }
  }, [
    cancelBubbleHide,
    clearWindowTextSelection,
    editor,
    hideTableQuickRailImmediately,
    scheduleBubbleHide,
    scheduleTableQuickRailHide,
    startTableColumnResizeFromDomHandle,
    syncTableQuickRailFromElement,
    tableMenuState,
  ])

  useEffect(() => {
    return () => {
      cancelHoveredBlockClear()
      cancelBubbleHide()
      cancelTableQuickRailHide()
    }
  }, [cancelBubbleHide, cancelHoveredBlockClear, cancelTableQuickRailHide])

  useEffect(() => {
    if (!editor) return
    const normalizedIncoming = normalizeMarkdown(value)
    if (normalizedIncoming === lastCommittedMarkdownRef.current) {
      return
    }

    cancelPendingMarkdownCommit()
    clearPendingMarkdownCommitMaxWait()
    pendingCommitEditorRef.current = null

    const nextDoc = downgradeDisabledFeatureNodes(parseMarkdownToEditorDoc(value), enableMermaidBlocks)
    replaceEditorDocFromExternalValue(nextDoc)
  }, [cancelPendingMarkdownCommit, clearPendingMarkdownCommitMaxWait, editor, enableMermaidBlocks, replaceEditorDocFromExternalValue, value])

  useEffect(
    () => () => {
      cancelPendingMarkdownCommit()
      flushPendingMarkdownCommit()
    },
    [cancelPendingMarkdownCommit, flushPendingMarkdownCommit]
  )

  useEffect(() => {
    if (!editor) return

    const flushOnBlur = () => {
      cancelPendingMarkdownCommit()
      flushPendingMarkdownCommit()
    }

    editor.on("blur", flushOnBlur)
    return () => {
      editor.off("blur", flushOnBlur)
    }
  }, [cancelPendingMarkdownCommit, editor, flushPendingMarkdownCommit])

  const focusEditor = useCallback(() => {
    editor?.chain().focus().run()
  }, [editor])

  const closeSlashMenu = useCallback(
    (restoreFocus = false) => {
      setIsSlashMenuOpen(false)
      setSlashQuery("")
      setSelectedSlashIndex(0)
      setSlashMenuState(null)

      if (restoreFocus) {
        requestAnimationFrame(() => {
          editor?.chain().focus().run()
        })
      }
    },
    [editor]
  )

  const withTrailingParagraph = useCallback(
    (blocks: BlockEditorDoc[]): NonNullable<BlockEditorDoc["content"]> => [...blocks, createParagraphNode()],
    []
  )

  const insertBlocksAtCursor = useCallback(
    (blocks: BlockEditorDoc[], replaceCurrentEmptyParagraph = false) => {
      if (!editor) return
      insertDocContent(
        {
          type: "doc",
          content: withTrailingParagraph(blocks),
        },
        replaceCurrentEmptyParagraph
      )
      closeSlashMenu()
    },
    [closeSlashMenu, editor, insertDocContent, withTrailingParagraph]
  )

  const insertBlocksAtCursorExact = useCallback(
    (blocks: BlockEditorDoc[], replaceCurrentEmptyParagraph = false) => {
      if (!editor) return
      insertDocContent(
        {
          type: "doc",
          content: blocks,
        },
        replaceCurrentEmptyParagraph
      )
      closeSlashMenu()
    },
    [closeSlashMenu, editor, insertDocContent]
  )

  const canInsertTopLevelBlockAtSelection = useCallback(() => {
    const activeEditor = editorRef.current ?? editor
    if (!activeEditor) return false
    if (isTableSelectionActive(activeEditor)) return false
    if (tableQuickRailStateRef.current.visible || tableMenuState) return false

    if (typeof window !== "undefined") {
      const selection = window.getSelection()
      const anchorElement =
        selection?.anchorNode instanceof Element
          ? selection.anchorNode
          : selection?.anchorNode?.parentElement
      if (anchorElement?.closest("table, .tableWrapper, .aq-table-shell")) {
        return false
      }
    }

    return true
  }, [editor, tableMenuState])

  const insertMermaidBlock = useCallback(() => {
    if (!canInsertTopLevelBlockAtSelection()) return
    if (!enableMermaidBlocks) return
    insertBlocksAtCursor([createMermaidNode("")], true)
  }, [canInsertTopLevelBlockAtSelection, enableMermaidBlocks, insertBlocksAtCursor])

  const insertCalloutBlock = useCallback(() => {
    const currentEditor = editorRef.current ?? editor
    if (!currentEditor || isTableSelectionActive(currentEditor)) return

    const selectionIndexBeforeInsert = getTopLevelBlockIndexFromSelection(currentEditor)
    insertDocContent(
      {
        type: "doc",
        content: withTrailingParagraph([
          createCalloutNode({
            kind: "tip",
            title: "",
            body: "",
          }),
        ]),
      },
      isSelectionInEmptyParagraph()
    )
    closeSlashMenu()
    focusNearestInsertedCalloutBody(selectionIndexBeforeInsert)
  }, [closeSlashMenu, editor, focusNearestInsertedCalloutBody, insertDocContent, isSelectionInEmptyParagraph, withTrailingParagraph])

  const insertToggleBlock = useCallback(() => {
    if (!canInsertTopLevelBlockAtSelection()) return
    insertBlocksAtCursor(
      [
        createToggleNode({
          title: "",
          body: "",
        }),
      ],
      true
    )
  }, [canInsertTopLevelBlockAtSelection, insertBlocksAtCursor])

  const insertChecklistBlock = useCallback(() => {
    if (!canInsertTopLevelBlockAtSelection()) return
    insertBlocksAtCursorExact([createTaskListNode([{ checked: false, text: "" }])], true)
  }, [canInsertTopLevelBlockAtSelection, insertBlocksAtCursorExact])

  const insertBookmarkBlock = useCallback(() => {
    if (!canInsertTopLevelBlockAtSelection()) return
    insertBlocksAtCursor(
      [
        createBookmarkNode({
          url: "",
          title: "",
          description: "",
        }),
      ],
      true
    )
  }, [canInsertTopLevelBlockAtSelection, insertBlocksAtCursor])

  const insertEmbedBlock = useCallback(() => {
    if (!canInsertTopLevelBlockAtSelection()) return
    insertBlocksAtCursor(
      [
        createEmbedNode({
          url: "",
          title: "",
          caption: "",
        }),
      ],
      true
    )
  }, [canInsertTopLevelBlockAtSelection, insertBlocksAtCursor])

  const insertFileBlock = useCallback(() => {
    if (!canInsertTopLevelBlockAtSelection()) return
    insertBlocksAtCursor(
      [
        createFileBlockNode({
          url: "",
          name: "",
          description: "",
        }),
      ],
      true
    )
  }, [canInsertTopLevelBlockAtSelection, insertBlocksAtCursor])

  const insertFormulaBlock = useCallback(() => {
    if (!canInsertTopLevelBlockAtSelection()) return
    insertBlocksAtCursor([createFormulaNode({ formula: "" })], true)
  }, [canInsertTopLevelBlockAtSelection, insertBlocksAtCursor])

  const insertInlineFormula = useCallback(() => {
    if (!editor) return
    const { from, to } = editor.state.selection
    const selectedText = editor.state.doc.textBetween(from, to, " ").trim()
    editor
      .chain()
      .focus()
      .insertContent(createInlineFormulaNode({ formula: selectedText || "x^2" }))
      .run()
  }, [editor])

  const insertTableBlock = useCallback(() => {
    if (!canInsertTopLevelBlockAtSelection()) return
    insertBlocksAtCursor([createInitialTableNode()], true)
  }, [canInsertTopLevelBlockAtSelection, createInitialTableNode, insertBlocksAtCursor])

  const canInsertTable = canInsertTopLevelBlockAtSelection()

  const insertCodeBlock = useCallback(() => {
    if (!canInsertTopLevelBlockAtSelection()) return
    insertBlocksAtCursor([createCodeBlockNode(getPreferredCodeLanguage(), "")], true)
  }, [canInsertTopLevelBlockAtSelection, insertBlocksAtCursor])

  const insertBlocksAtIndex = useCallback(
    (insertionIndex: number, blocks: NonNullable<BlockEditorDoc["content"]>, focusIndex = insertionIndex) => {
      mutateTopLevelBlocks((doc) => insertTopLevelBlockAt(doc, insertionIndex, blocks), focusIndex)
    },
    [mutateTopLevelBlocks]
  )

  const isHttpUrl = useCallback((value: string) => {
    try {
      const parsed = new URL(value.trim())
      return parsed.protocol === "http:" || parsed.protocol === "https:"
    } catch {
      return false
    }
  }, [])

  const fetchUnfurlMetadata = useCallback(async (url: string) => {
    try {
      const response = await fetch(`/api/editor/unfurl?url=${encodeURIComponent(url)}`)
      const payload = await response.json()
      if (!response.ok || !payload?.ok || !payload?.data) return null
      return payload.data as {
        title?: string
        description?: string
        siteName?: string
        provider?: string
        thumbnailUrl?: string
        embedUrl?: string
      }
    } catch {
      return null
    }
  }, [])

  const createCardNodeFromUrl = useCallback(
    async (url: string) => {
      const trimmedUrl = url.trim()
      const cardKind = inferCardKindFromUrl(trimmedUrl)
      const metadata = await fetchUnfurlMetadata(trimmedUrl)
      const fallbackProvider = inferLinkProvider(trimmedUrl)
      const fallbackTitle = (() => {
        try {
          const parsed = new URL(trimmedUrl)
          const lastSegment = parsed.pathname.split("/").filter(Boolean).pop() || ""
          return decodeURIComponent(lastSegment || parsed.hostname.replace(/^www\./i, "")) || trimmedUrl
        } catch {
          return trimmedUrl
        }
      })()

      if (cardKind === "file") {
        return createFileBlockNode({
          url: trimmedUrl,
          name: String(metadata?.title || fallbackTitle || "첨부 파일").trim(),
          description: String(metadata?.description || "").trim(),
        })
      }

      if (cardKind === "embed") {
        return createEmbedNode({
          url: trimmedUrl,
          title: String(metadata?.title || fallbackProvider || "임베드").trim(),
          caption: String(metadata?.description || "").trim(),
          siteName: String(metadata?.siteName || "").trim(),
          provider: String(metadata?.provider || fallbackProvider || "").trim(),
          thumbnailUrl: String(metadata?.thumbnailUrl || "").trim(),
          embedUrl: String(metadata?.embedUrl || resolveEmbedPreviewUrl(trimmedUrl) || "").trim(),
        })
      }

      return createBookmarkNode({
        url: trimmedUrl,
        title: String(metadata?.title || fallbackTitle || trimmedUrl).trim(),
        description: String(metadata?.description || "").trim(),
        siteName: String(metadata?.siteName || "").trim(),
        provider: String(metadata?.provider || fallbackProvider || "").trim(),
        thumbnailUrl: String(metadata?.thumbnailUrl || "").trim(),
      })
    },
    [fetchUnfurlMetadata]
  )

  const insertCardBlockFromUrl = useCallback(
    async (url: string) => {
      const nextNode = await createCardNodeFromUrl(url)
      return insertDocContent(
        {
          type: "doc",
          content: [nextNode, { type: "paragraph" }],
        },
        isSelectionInEmptyParagraph()
      )
    },
    [createCardNodeFromUrl, insertDocContent, isSelectionInEmptyParagraph]
  )

  const openLinkPrompt = useCallback(() => {
    if (!editor || typeof window === "undefined") return
    const previousHref = String(editor.getAttributes("link").href || "")
    const href = window.prompt("링크 주소를 입력하세요.", previousHref)
    if (href === null) return
    if (!href.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run()
  }, [editor])

  const handleToolbarButtonMouseDown = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
  }, [])

  const runBoldAction = useCallback(() => {
    editor?.chain().focus().toggleBold().run()
  }, [editor])

  const runItalicAction = useCallback(() => {
    editor?.chain().focus().toggleItalic().run()
  }, [editor])

  const runInlineCodeAction = useCallback(() => {
    editor?.chain().focus().toggleCode().run()
  }, [editor])

  const runStrikeAction = useCallback(() => {
    editor?.chain().focus().toggleStrike().run()
  }, [editor])

  const activeInlineColor = normalizeInlineColorToken(String(editor?.getAttributes("inlineColor").color || ""))
  const isInlineCodeActive = editor?.isActive("code") ?? false
  const isTableMode = isTableSelectionActive(editor)
  const activeTableStructureState = useMemo(() => {
    void selectionTick
    return getActiveTableStructureState(editor)
  }, [editor, selectionTick])
  const activeInlineTextStyleOption = useMemo(() => {
    if (!editor) return INLINE_TEXT_STYLE_OPTIONS[0]
    void selectionTick
    return INLINE_TEXT_STYLE_OPTIONS.find((option) => option.isActive(editor)) || INLINE_TEXT_STYLE_OPTIONS[0]
  }, [editor, selectionTick])

  useEffect(() => {
    const currentEditor = editorRef.current
    if (!currentEditor || !isTableMode) return
    const anchorDom = currentEditor.view.domAtPos(currentEditor.state.selection.from).node
    const anchorElement = anchorDom instanceof Element ? anchorDom : anchorDom.parentElement
    if (!anchorElement) return
    syncTableQuickRailFromElement(anchorElement)
  }, [isTableMode, selectionTick, syncTableQuickRailFromElement])

  const applyInlineColor = useCallback(
    (color?: string | null) => {
      if (!editor) return

      const chain = editor.chain().focus()
      if (!color) {
        chain.unsetMark("inlineColor").run()
      } else {
        chain.setMark("inlineColor", { color }).run()
      }
      setIsInlineColorMenuOpen(false)
      setIsBubbleInlineColorMenuOpen(false)
    },
    [editor]
  )

  const applyInlineTextStyle = useCallback(
    (styleId: InlineTextStyleOption["id"]) => {
      if (!editor) return
      const option = INLINE_TEXT_STYLE_OPTIONS.find((entry) => entry.id === styleId)
      if (!option) return
      option.run(editor)
      setIsBubbleTextStyleMenuOpen(false)
    },
    [editor]
  )

  const updateActiveTableCellAttrs = useCallback(
    (attrs: Record<string, unknown>) => {
      if (!editor) return
      const entries = Object.entries(attrs)
      const chain = editor.chain().focus()

      if (typeof editor.commands.setCellAttribute === "function" && entries.length > 0) {
        entries.forEach(([name, value]) => {
          chain.setCellAttribute(name, value)
        })
        chain.run()
        return
      }

      const cellNodeType = editor.isActive("tableHeader") ? "tableHeader" : "tableCell"
      chain.updateAttributes(cellNodeType, attrs).run()
    },
    [editor]
  )

  const selectCurrentTableAxis = useCallback(
    (axis: "row" | "column") => {
      if (!editor || !isTableSelectionActive(editor)) return

      let anchorCellPos = -1
      let headCellPos = -1
      try {
        const rect = selectedRect(editor.state)
        if (rect.bottom <= rect.top || rect.right <= rect.left) return
        anchorCellPos = rect.tableStart + rect.map.positionAt(rect.top, rect.left, rect.table)
        headCellPos = rect.tableStart + rect.map.positionAt(rect.bottom - 1, rect.right - 1, rect.table)
      } catch {
        return
      }

      const anchorResolved = resolveDocPosSafe(editor, anchorCellPos)
      const headResolved = resolveDocPosSafe(editor, headCellPos)
      if (!anchorResolved || !headResolved) return

      const selection =
        axis === "row"
          ? CellSelection.rowSelection(anchorResolved, headResolved)
          : CellSelection.colSelection(anchorResolved, headResolved)

      editor.view.dispatch(editor.state.tr.setSelection(selection))
      editor.view.focus()
    },
    [editor]
  )

  const selectActiveTableBlock = useCallback(() => {
    if (!editor) return
    const blockIndex = getTopLevelBlockIndexFromSelection(editor)
    const position = getTopLevelBlockPosition(editor, blockIndex)
    const targetNode = editor.state.doc.nodeAt(position)
    if (!targetNode || targetNode.type.name !== "table") return
    const selection = NodeSelection.create(editor.state.doc, position)
    editor.view.dispatch(editor.state.tr.setSelection(selection))
    editor.view.focus()
  }, [editor])

  const moveTaskItemInFirstTaskList = useCallback(
    (sourceIndex: number, insertionIndex: number) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return
      const doc = currentEditor.getJSON() as BlockEditorDoc
      const blocks = Array.isArray(doc.content) ? (doc.content as BlockEditorDoc[]) : []
      const firstListIndex = blocks.findIndex(
        (block) => block?.type === "taskList" || block?.type === "bulletList" || block?.type === "orderedList"
      )
      if (firstListIndex < 0) return

      mutateTopLevelBlocks(
        (nextDoc) =>
          moveNestedListItemToInsertionIndex(nextDoc, firstListIndex, [], sourceIndex, insertionIndex),
        firstListIndex
      )
    },
    [mutateTopLevelBlocks]
  )

  useEffect(() => {
    if (!onQaActionsReady) return

    onQaActionsReady({
      selectTableAxis: (axis) => {
        selectCurrentTableAxis(axis)
      },
      selectTableColumnViaDomFallback: (columnIndex) => {
        const currentEditor = editorRef.current ?? editor
        if (!currentEditor) return
        currentEditor.chain().focus("end").run()
        selectTableColumnByIndex(columnIndex)
      },
      setActiveTableCellAlign: (align) => {
        updateActiveTableCellAttrs({ textAlign: align })
      },
      setActiveTableCellBackground: (color) => {
        updateActiveTableCellAttrs({ backgroundColor: color })
      },
      addTableRowAfter: () => {
        editor?.chain().focus().addRowAfter().run()
      },
      addTableColumnAfter: () => {
        editor?.chain().focus().addColumnAfter().run()
      },
      deleteSelectedTableRow: () => {
        editor?.chain().focus().deleteRow().run()
      },
      deleteSelectedTableColumn: () => {
        editor?.chain().focus().deleteColumn().run()
      },
      resizeFirstTableRow: (deltaPx) => {
        resizeFirstTableRowBy(deltaPx)
      },
      resizeFirstTableColumn: (deltaPx) => {
        resizeFirstTableColumnBy(deltaPx)
      },
      focusDocumentEnd: () => {
        editor?.chain().focus("end").run()
      },
      appendCalloutBlock: () => {
        const currentEditor = editorRef.current
        if (!currentEditor) return
        insertBlocksAtIndex(
          currentEditor.state.doc.childCount,
          withTrailingParagraph([
            createCalloutNode({
              kind: "tip",
              title: "",
              body: "",
            }),
          ])
        )
      },
      appendFormulaBlock: () => {
        const currentEditor = editorRef.current
        if (!currentEditor) return
        insertBlocksAtIndex(
          currentEditor.state.doc.childCount,
          withTrailingParagraph([
            createFormulaNode({
              formula: "",
            }),
          ])
        )
      },
      moveTaskItemInFirstTaskList: (sourceIndex, insertionIndex) => {
        moveTaskItemInFirstTaskList(sourceIndex, insertionIndex)
      },
    })

    return () => {
      onQaActionsReady(null)
    }
  }, [
    editor,
    insertBlocksAtIndex,
    moveTaskItemInFirstTaskList,
    onQaActionsReady,
    resizeFirstTableColumnBy,
    resizeFirstTableRowBy,
    selectTableColumnByIndex,
    selectCurrentTableAxis,
    updateActiveTableCellAttrs,
    withTrailingParagraph,
  ])

  const activeTableCellNodeType =
    editor?.isActive("tableHeader") ?? false ? "tableHeader" : "tableCell"
  const activeTableCellAttrs = editor?.getAttributes(activeTableCellNodeType) || {}

  useEffect(() => {
    if (isTableMode) return
    setTableMenuState(null)
  }, [isTableMode])

  const handleImageInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !editor) return

    const imageAttrs = await onUploadImage(file)
    const pendingInsertIndex = pendingImageInsertIndexRef.current
    pendingImageInsertIndexRef.current = null

    if (typeof pendingInsertIndex === "number") {
      insertBlocksAtIndex(pendingInsertIndex, [
        {
          type: "resizableImage",
          attrs: {
            src: imageAttrs.src,
            alt: imageAttrs.alt || "",
            title: imageAttrs.title || "",
            widthPx: imageAttrs.widthPx ?? null,
            align: imageAttrs.align || "center",
          },
        },
        { type: "paragraph" },
      ])
      return
    }

    editor
      .chain()
      .focus()
      .insertContent([
        {
          type: "resizableImage",
          attrs: {
            src: imageAttrs.src,
            alt: imageAttrs.alt || "",
            title: imageAttrs.title || "",
            widthPx: imageAttrs.widthPx ?? null,
            align: imageAttrs.align || "center",
          },
        },
        { type: "paragraph" },
      ])
      .run()
  }

  const handleAttachmentInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !editor || !onUploadFile) return

    const fileAttrs = await onUploadFile(file)
    const pendingInsertIndex = pendingAttachmentInsertIndexRef.current
    pendingAttachmentInsertIndexRef.current = null

    if (typeof pendingInsertIndex === "number") {
      insertBlocksAtIndex(pendingInsertIndex, [createFileBlockNode(fileAttrs), { type: "paragraph" }])
      return
    }

    insertBlocksAtCursor([createFileBlockNode(fileAttrs)], true)
  }

  const blockInsertCatalog = useMemo<BlockInsertCatalogItem[]>(() => {
    const createTableTemplate = () => createInitialTableNode()

    const createCalloutTemplate = () =>
      createCalloutNode({
        kind: "tip",
        title: "",
        body: "",
      })

    const createToggleTemplate = () =>
      createToggleNode({
        title: "",
        body: "",
      })

    const createChecklistTemplate = () =>
      createTaskListNode([{ checked: false, text: "" }])

    const createBookmarkTemplate = () =>
      createBookmarkNode({
        url: "",
        title: "",
        description: "",
      })

    const createEmbedTemplate = () =>
      createEmbedNode({
        url: "",
        title: "",
        caption: "",
      })

    const createFileTemplate = () =>
      createFileBlockNode({
        url: "",
        name: "",
        description: "",
      })

    const createFormulaTemplate = () =>
      createFormulaNode({
        formula: "",
      })

    const catalog: BlockInsertCatalogItem[] = [
      {
        id: "paragraph",
        label: "텍스트",
        helper: "기본 본문 단락",
        section: "basic",
        keywords: ["text", "paragraph", "본문", "문단"],
        slashHint: "T",
        insertAtCursor: focusEditor,
        insertAtBlock: (blockIndex) => {
          insertBlocksAtIndex(blockIndex + 1, [createParagraphNode("")], blockIndex + 1)
        },
      },
      {
        id: "heading-1",
        label: "제목 1",
        helper: "문서 대표 제목",
        section: "basic",
        keywords: ["h1", "heading", "title", "제목"],
        slashHint: "#",
        insertAtCursor: () => insertBlocksAtCursorExact([createHeadingNode(1, "")], true),
        insertAtBlock: (blockIndex) =>
          insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createHeadingNode(1, "")])),
      },
      {
        id: "heading-2",
        label: "제목 2",
        helper: "큰 섹션 제목",
        section: "basic",
        keywords: ["h2", "heading", "section", "소제목"],
        slashHint: "##",
        insertAtCursor: () => insertBlocksAtCursorExact([createHeadingNode(2, "")], true),
        insertAtBlock: (blockIndex) =>
          insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createHeadingNode(2, "")])),
      },
      {
        id: "heading-3",
        label: "제목 3",
        helper: "작은 섹션 제목",
        section: "basic",
        keywords: ["h3", "heading", "subsection", "소제목"],
        slashHint: "###",
        insertAtCursor: () => insertBlocksAtCursorExact([createHeadingNode(3, "")], true),
        insertAtBlock: (blockIndex) =>
          insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createHeadingNode(3, "")])),
      },
      {
        id: "heading-4",
        label: "제목 4",
        helper: "짧은 소단락 제목",
        section: "basic",
        keywords: ["h4", "heading", "caption", "제목"],
        slashHint: "####",
        insertAtCursor: () => insertBlocksAtCursorExact([createHeadingNode(4, "")], true),
        insertAtBlock: (blockIndex) =>
          insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createHeadingNode(4, "")])),
      },
      {
        id: "bullet-list",
        label: "글머리 기호 목록",
        helper: "순서 없는 항목",
        section: "basic",
        keywords: ["list", "bullet", "목록", "불릿"],
        slashHint: "-",
        recommended: true,
        insertAtCursor: () => insertBlocksAtCursorExact([createBulletListNode([""])], true),
        insertAtBlock: (blockIndex) =>
          insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createBulletListNode([""])])),
      },
      {
        id: "ordered-list",
        label: "번호 목록",
        helper: "순서 있는 항목",
        section: "basic",
        keywords: ["ordered", "numbered", "list", "번호"],
        slashHint: "1.",
        toolbarMore: true,
        insertAtCursor: () => insertBlocksAtCursorExact([createOrderedListNode([""])], true),
        insertAtBlock: (blockIndex) =>
          insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createOrderedListNode([""])])),
      },
      {
        id: "checklist",
        label: "체크리스트",
        helper: "체크 가능한 작업 목록",
        section: "basic",
        keywords: ["checklist", "todo", "task", "체크", "할일"],
        slashHint: "☑",
        recommended: true,
        quickInsert: true,
        toolbarMore: true,
        insertAtCursor: insertChecklistBlock,
        insertAtBlock: (blockIndex) =>
          insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createChecklistTemplate()])),
      },
      {
        id: "quote",
        label: "인용문",
        helper: "본문 인용",
        section: "basic",
        keywords: ["quote", "blockquote", "인용"],
        slashHint: ">",
        insertAtCursor: () => insertBlocksAtCursorExact([createBlockquoteNode("")], true),
        insertAtBlock: (blockIndex) =>
          insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createBlockquoteNode("")])),
      },
      {
        id: "code-block",
        label: "코드",
        helper: "언어 지정 가능",
        section: "structure",
        keywords: ["code", "snippet", "코드블록"],
        slashHint: "</>",
        recommended: true,
        quickInsert: true,
        toolbarMore: true,
        insertAtCursor: insertCodeBlock,
        insertAtBlock: (blockIndex) =>
          insertBlocksAtIndex(
            blockIndex + 1,
            withTrailingParagraph([createCodeBlockNode(getPreferredCodeLanguage(), "")])
          ),
      },
      {
        id: "table",
        label: "테이블",
        helper: "3×3 빈 표",
        section: "structure",
        keywords: ["table", "표", "테이블"],
        slashHint: "표",
        recommended: true,
        quickInsert: true,
        toolbarMore: true,
        disabled: !canInsertTable,
        insertAtCursor: insertTableBlock,
        insertAtBlock: (blockIndex) =>
          insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createTableTemplate()])),
      },
      {
        id: "callout",
        label: "콜아웃",
        helper: "핵심 내용을 강조합니다",
        section: "structure",
        keywords: ["callout", "tip", "note", "콜아웃"],
        slashHint: "!",
        quickInsert: true,
        toolbarMore: true,
        insertAtCursor: insertCalloutBlock,
        insertAtBlock: (blockIndex) =>
          insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createCalloutTemplate()])),
      },
      {
        id: "toggle",
        label: "토글",
        helper: "긴 보충 설명을 접어 둡니다",
        section: "structure",
        keywords: ["toggle", "details", "토글", "접기"],
        slashHint: "▸",
        quickInsert: true,
        toolbarMore: true,
        insertAtCursor: insertToggleBlock,
        insertAtBlock: (blockIndex) =>
          insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createToggleTemplate()])),
      },
      {
        id: "bookmark",
        label: "북마크",
        helper: "외부 링크 카드",
        section: "structure",
        keywords: ["bookmark", "link", "북마크", "링크"],
        slashHint: "↗",
        quickInsert: true,
        toolbarMore: true,
        insertAtCursor: insertBookmarkBlock,
        insertAtBlock: (blockIndex) =>
          insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createBookmarkTemplate()])),
      },
      {
        id: "embed",
        label: "임베드",
        helper: "영상/외부 콘텐츠",
        section: "media",
        keywords: ["embed", "video", "youtube", "임베드"],
        slashHint: "▶",
        quickInsert: true,
        toolbarMore: true,
        insertAtCursor: insertEmbedBlock,
        insertAtBlock: (blockIndex) =>
          insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createEmbedTemplate()])),
      },
      {
        id: "file",
        label: "파일",
        helper: onUploadFile ? "업로드 후 첨부 블록으로 삽입" : "다운로드 링크 블록",
        section: "media",
        keywords: ["file", "download", "첨부", "파일"],
        slashHint: "PDF",
        toolbarMore: true,
        insertAtCursor: () => (onUploadFile ? attachmentFileInputRef.current?.click() : insertFileBlock()),
        insertAtBlock: (blockIndex) => {
          if (onUploadFile) {
            pendingAttachmentInsertIndexRef.current = blockIndex + 1
            attachmentFileInputRef.current?.click()
            return
          }
          insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createFileTemplate()]))
        },
      },
      {
        id: "formula",
        label: "수식",
        helper: "LaTeX 스타일 블록 수식",
        section: "structure",
        keywords: ["formula", "math", "latex", "수식"],
        slashHint: "∑",
        quickInsert: true,
        toolbarMore: true,
        insertAtCursor: insertFormulaBlock,
        insertAtBlock: (blockIndex) =>
          insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createFormulaTemplate()])),
      },
      {
        id: "divider",
        label: "구분선",
        helper: "섹션 구분",
        section: "structure",
        keywords: ["divider", "rule", "hr", "구분선"],
        slashHint: "---",
        recommended: true,
        toolbarMore: true,
        insertAtCursor: () => insertBlocksAtCursor([createHorizontalRuleNode()], true),
        insertAtBlock: (blockIndex) =>
          insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createHorizontalRuleNode()])),
      },
      {
        id: "image",
        label: "이미지",
        helper: "업로드 후 본문에 삽입",
        section: "media",
        keywords: ["image", "photo", "img", "이미지"],
        slashHint: "img",
        recommended: true,
        quickInsert: true,
        toolbarMore: true,
        insertAtCursor: () => {
          imageFileInputRef.current?.click()
        },
        insertAtBlock: (blockIndex) => {
          pendingImageInsertIndexRef.current = blockIndex + 1
          imageFileInputRef.current?.click()
        },
      },
      ...(enableMermaidBlocks
        ? [
            {
              id: "mermaid",
              label: "다이어그램",
              helper: "Mermaid",
              section: "media" as const,
              keywords: ["diagram", "mermaid", "flowchart", "다이어그램"],
              slashHint: "MMD",
              recommended: true,
              quickInsert: true,
              toolbarMore: true,
              insertAtCursor: insertMermaidBlock,
              insertAtBlock: (blockIndex: number) =>
                insertBlocksAtIndex(
                  blockIndex + 1,
                  withTrailingParagraph([createMermaidNode("")])
                ),
            },
          ]
        : []),
    ]

    if (!isTableMode) return catalog

    return catalog.map((item) => {
      if (!TABLE_CONTEXT_BLOCKED_INSERT_IDS.has(item.id)) return item
      if (item.disabled) return item
      return { ...item, disabled: true }
    })
  }, [
    canInsertTable,
    createInitialTableNode,
    enableMermaidBlocks,
    focusEditor,
    isTableMode,
    insertBlocksAtCursor,
    insertBlocksAtCursorExact,
    insertBlocksAtIndex,
    insertBookmarkBlock,
    insertCalloutBlock,
    insertChecklistBlock,
    insertCodeBlock,
    insertEmbedBlock,
    insertFileBlock,
    insertFormulaBlock,
    insertMermaidBlock,
    insertTableBlock,
    insertToggleBlock,
    onUploadFile,
    withTrailingParagraph,
  ])

  const toolbarBlockActions = useMemo(
    () => blockInsertCatalog.filter((item) => item.toolbarMore),
    [blockInsertCatalog]
  )

  const quickInsertActions = useMemo(
    () => blockInsertCatalog.filter((item) => item.quickInsert),
    [blockInsertCatalog]
  )

  const normalizedSlashQuery = normalizeSlashSearchText(slashQuery)

  const getSlashMenuContextFromEditor = useCallback((activeEditor: TiptapEditor | null | undefined): SlashMenuContext => {
    if (!activeEditor) {
      return {
        currentBlockType: null,
        previousBlockType: null,
        atDocumentStart: true,
      }
    }

    const blocks = (((activeEditor.getJSON() as BlockEditorDoc).content ?? []) as BlockEditorDoc[])
    const currentBlockIndex = Math.max(0, Math.min(getTopLevelBlockIndexFromSelection(activeEditor), blocks.length - 1))

    return {
      currentBlockType: blocks[currentBlockIndex]?.type ?? null,
      previousBlockType: currentBlockIndex > 0 ? blocks[currentBlockIndex - 1]?.type ?? null : null,
      atDocumentStart: currentBlockIndex === 0,
    }
  }, [])

  const getRankedSlashItems = useCallback((query: string, context: SlashMenuContext) => {
    const normalizedQuery = normalizeSlashSearchText(query)
    return blockInsertCatalog
      .map((item, index) => ({
        item,
        index,
        score: getSlashMenuMatchScore(
          item,
          normalizedQuery,
          recentSlashItemIds.indexOf(item.id),
          context
        ),
      }))
      .filter((entry) => Number.isFinite(entry.score))
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score
        return left.index - right.index
      })
      .map((entry) => entry.item)
  }, [blockInsertCatalog, recentSlashItemIds])

  const slashMenuContext = useMemo<SlashMenuContext>(() => {
    void selectionTick
    return getSlashMenuContextFromEditor(editor)
  }, [editor, getSlashMenuContextFromEditor, selectionTick])

  const rankedSlashItems = useMemo(() => {
    return getRankedSlashItems(normalizedSlashQuery, slashMenuContext)
  }, [getRankedSlashItems, normalizedSlashQuery, slashMenuContext])

  const slashSections = useMemo(() => {
    const seenItemIds = new Set<string>()
    const takeUnique = (items: Array<BlockInsertCatalogItem | undefined>) =>
      items.filter((item): item is BlockInsertCatalogItem => {
        if (!item || seenItemIds.has(item.id)) return false
        seenItemIds.add(item.id)
        return true
      })

    const recentItems = takeUnique(recentSlashItemIds.map((id) => rankedSlashItems.find((item) => item.id === id)))
    const recommendedItems = takeUnique(
      rankedSlashItems.slice(0, normalizedSlashQuery ? Math.min(rankedSlashItems.length, 6) : 5)
    )
    const basicItems = takeUnique(rankedSlashItems.filter((item) => item.section === "basic"))
    const structureItems = takeUnique(rankedSlashItems.filter((item) => item.section === "structure"))
    const mediaItems = takeUnique(rankedSlashItems.filter((item) => item.section === "media"))

    return [
      { title: "최근 사용", items: recentItems },
      { title: "추천", items: recommendedItems },
      { title: "기본 블록", items: basicItems },
      { title: "구조 블록", items: structureItems },
      { title: "미디어", items: mediaItems },
    ].filter((section) => section.items.length > 0)
  }, [normalizedSlashQuery, rankedSlashItems, recentSlashItemIds])

  const flatSlashEntries = useMemo(
    () =>
      slashSections.flatMap((section) =>
        section.items.map((item) => ({
          key: `${section.title}-${item.id}`,
          sectionTitle: section.title,
          item,
        }))
      ),
    [slashSections]
  )

  useEffect(() => {
    if (typeof window === "undefined") return

    try {
      const raw = window.localStorage.getItem(SLASH_MENU_RECENT_IDS_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return
      const sanitized = parsed.filter((value): value is string => typeof value === "string").slice(0, SLASH_MENU_MAX_RECENT_ITEMS)
      setRecentSlashItemIds(sanitized)
    } catch {
      window.localStorage.removeItem(SLASH_MENU_RECENT_IDS_STORAGE_KEY)
    }
  }, [])

  const executeSlashCatalogAction = useCallback(
    async (item: BlockInsertCatalogItem) => {
      if (!editor || item.disabled) return
      if (isTableSelectionActive(editor) && TABLE_CONTEXT_BLOCKED_INSERT_IDS.has(item.id)) return

      const activeSlashRange = getActiveSlashRangeFromEditor(editor) ?? slashMenuState
      let handledByWholeParagraphReplacement = false
      if (activeSlashRange) {
        const { selection } = editor.state
        const paragraph = selection.$from.parent
        const paragraphContentStart = selection.$from.start()
        const paragraphContentEnd = selection.$from.end()
        const slashStartOffset = Math.max(0, activeSlashRange.from - paragraphContentStart)
        const slashEndOffset = Math.max(0, activeSlashRange.to - paragraphContentStart)
        const textBeforeSlash = paragraph.textContent.slice(0, slashStartOffset)
        const textAfterSlash = paragraph.textContent.slice(slashEndOffset)
        const shouldReplaceWholeParagraph =
          paragraph.type.name === "paragraph" &&
          textBeforeSlash.trim().length === 0 &&
          textAfterSlash.trim().length === 0

        if (shouldReplaceWholeParagraph) {
          handledByWholeParagraphReplacement = transformCurrentParagraphViaSlash(item.id)
        }

        if (!handledByWholeParagraphReplacement) {
          if (shouldReplaceWholeParagraph) {
            editor
              .chain()
              .focus()
              .deleteRange({
                from: paragraphContentStart,
                to: paragraphContentEnd,
              })
              .run()
          } else {
            editor.chain().focus().deleteRange({ from: activeSlashRange.from, to: activeSlashRange.to }).run()
          }
        } else {
          closeSlashMenu()
        }
      }

      setRecentSlashItemIds((prev) => {
        const next = [item.id, ...prev.filter((id) => id !== item.id)].slice(0, SLASH_MENU_MAX_RECENT_ITEMS)
        if (typeof window !== "undefined") {
          window.localStorage.setItem(SLASH_MENU_RECENT_IDS_STORAGE_KEY, JSON.stringify(next))
        }
        return next
      })

      if (!handledByWholeParagraphReplacement) {
        closeSlashMenu()
        await item.insertAtCursor()
      }
    },
    [closeSlashMenu, editor, slashMenuState, transformCurrentParagraphViaSlash]
  )

  const resolveSlashMenuState = useCallback(() => {
    if (!editor || typeof window === "undefined") return null

    const selection = editor.state.selection

    if (!selection.empty || !editor.isFocused) {
      return null
    }
    if (isTableSelectionActive(editor)) {
      return null
    }

    const parent = selection.$from.parent
    if (parent.type.name !== "paragraph") {
      return null
    }

    const activeSlashRange = getActiveSlashRangeFromEditor(editor)
    if (!activeSlashRange) {
      return null
    }
    const paragraphContentStart = selection.$from.start()
    const slashStartOffset = Math.max(0, activeSlashRange.from - paragraphContentStart)
    const slashEndOffset = Math.max(0, activeSlashRange.to - paragraphContentStart)
    const query = parent.textContent.slice(slashStartOffset + 1, slashEndOffset)
    const coords = editor.view.coordsAtPos(selection.from)
    const viewportPadding = SLASH_MENU_EDGE_PADDING_PX
    const estimatedMenuWidth = Math.min(SLASH_MENU_ESTIMATED_WIDTH_PX, window.innerWidth - viewportPadding * 2)
    const estimatedMenuHeight = Math.min(
      SLASH_MENU_ESTIMATED_HEIGHT_PX,
      Math.max(320, window.innerHeight - viewportPadding * 2)
    )
    const spaceBelow = window.innerHeight - coords.bottom - viewportPadding
    const spaceAbove = coords.top - viewportPadding
    const placeAbove = spaceBelow < 280 && spaceAbove > spaceBelow + 48
    const nextLeft = Math.min(
      Math.max(coords.left, viewportPadding),
      Math.max(viewportPadding, window.innerWidth - estimatedMenuWidth - viewportPadding)
    )
    const rawTop = placeAbove
      ? coords.top - estimatedMenuHeight - SLASH_MENU_VERTICAL_GAP_PX
      : coords.bottom + SLASH_MENU_VERTICAL_GAP_PX
    const nextTop = Math.min(rawTop, Math.max(viewportPadding, window.innerHeight - estimatedMenuHeight - viewportPadding))

    return {
      query,
      menuState: {
        left: Math.round(nextLeft),
        top: Math.round(Math.max(viewportPadding, nextTop)),
        from: activeSlashRange.from,
        to: activeSlashRange.to,
        placement: placeAbove ? "top" : "bottom",
      } satisfies Exclude<SlashMenuState, null>,
    }
  }, [editor])

  const applyResolvedSlashMenuState = useCallback(
    (nextSlashState: ReturnType<typeof resolveSlashMenuState>) => {
      if (!nextSlashState) {
        setIsSlashMenuOpen(false)
        setSlashMenuState(null)
        setSlashQuery("")
        setSelectedSlashIndex(0)
        setSlashInteractionMode("keyboard")
        return
      }

      setSlashQuery(nextSlashState.query)
      setIsSlashMenuOpen(true)
      setSlashMenuState(nextSlashState.menuState)
    },
    []
  )

  const syncSlashMenuWhileComposing = useCallback(() => {
    const nextSlashState = resolveSlashMenuState()
    if (!nextSlashState) {
      return
    }

    setSlashQuery(nextSlashState.query)
    setIsSlashMenuOpen(true)
    setSlashMenuState(nextSlashState.menuState)
  }, [resolveSlashMenuState])

  useEffect(() => {
    if (!editor) return
    let rafId: number | null = null

    const syncSlashMenu = () => {
      if (isSlashImeComposing || editor.view.composing) {
        syncSlashMenuWhileComposing()
        return
      }

      applyResolvedSlashMenuState(resolveSlashMenuState())
    }

    const scheduleSyncSlashMenu = () => {
      if (typeof window === "undefined") {
        syncSlashMenu()
        return
      }
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        syncSlashMenu()
      })
    }

    scheduleSyncSlashMenu()
    editor.on("selectionUpdate", scheduleSyncSlashMenu)
    editor.on("transaction", scheduleSyncSlashMenu)
    editor.on("focus", scheduleSyncSlashMenu)

    return () => {
      editor.off("selectionUpdate", scheduleSyncSlashMenu)
      editor.off("transaction", scheduleSyncSlashMenu)
      editor.off("focus", scheduleSyncSlashMenu)
      if (rafId !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(rafId)
      }
    }
  }, [applyResolvedSlashMenuState, editor, isSlashImeComposing, resolveSlashMenuState, syncSlashMenuWhileComposing])

  useEffect(() => {
    if (typeof window === "undefined" || !isSlashMenuOpen) return

    const syncSlashMenuPlacement = () => {
      const nextSlashState = resolveSlashMenuState()
      if (!nextSlashState) return
      setSlashQuery(nextSlashState.query)
      setSlashMenuState(nextSlashState.menuState)
    }

    window.addEventListener("resize", syncSlashMenuPlacement)
    window.addEventListener("scroll", syncSlashMenuPlacement, true)

    return () => {
      window.removeEventListener("resize", syncSlashMenuPlacement)
      window.removeEventListener("scroll", syncSlashMenuPlacement, true)
    }
  }, [editor, isSlashImeComposing, isSlashMenuOpen, resolveSlashMenuState])

  const toolbarActions: ToolbarAction[] = [
    { id: "heading-1", label: "H1", ariaLabel: "제목 1", run: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), active: editor?.isActive("heading", { level: 1 }) ?? false },
    { id: "heading-2", label: "H2", ariaLabel: "제목 2", run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), active: editor?.isActive("heading", { level: 2 }) ?? false },
    { id: "heading-3", label: "H3", ariaLabel: "제목 3", run: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), active: editor?.isActive("heading", { level: 3 }) ?? false },
    { id: "heading-4", label: "H4", ariaLabel: "제목 4", run: () => editor?.chain().focus().toggleHeading({ level: 4 }).run(), active: editor?.isActive("heading", { level: 4 }) ?? false },
    { id: "bold", label: "B", ariaLabel: "굵게", run: runBoldAction, active: editor?.isActive("bold") ?? false },
    { id: "italic", label: <AppIcon name="italic" aria-hidden="true" />, ariaLabel: "기울임", run: runItalicAction, active: editor?.isActive("italic") ?? false },
    { id: "bullet-list", label: <AppIcon name="list" aria-hidden="true" />, ariaLabel: "목록", run: () => editor?.chain().focus().toggleBulletList().run(), active: editor?.isActive("bulletList") ?? false },
    { id: "quote", label: <span aria-hidden="true">❞</span>, ariaLabel: "인용문", run: () => editor?.chain().focus().toggleBlockquote().run(), active: editor?.isActive("blockquote") ?? false },
    { id: "link", label: <AppIcon name="link" aria-hidden="true" />, ariaLabel: "링크", run: openLinkPrompt, active: editor?.isActive("link") ?? false },
    { id: "inline-code", label: <span aria-hidden="true">&lt;/&gt;</span>, ariaLabel: "인라인 코드", run: runInlineCodeAction, active: editor?.isActive("code") ?? false },
    { id: "inline-formula", label: <span aria-hidden="true">ƒx</span>, ariaLabel: "인라인 수식", run: insertInlineFormula, active: editor?.isActive("inlineFormula") ?? false },
    { id: "image", label: <AppIcon name="camera" aria-hidden="true" />, ariaLabel: "이미지 추가", run: () => imageFileInputRef.current?.click(), active: false },
    { id: "code-block", label: <span aria-hidden="true">&lt;/&gt;</span>, ariaLabel: "코드 블록", run: insertCodeBlock, active: editor?.isActive("codeBlock") ?? false },
  ]

  const toolbarMoreActions: ToolbarAction[] = [
    {
      id: "inline-formula",
      label: "인라인 수식",
      ariaLabel: "인라인 수식",
      run: () => {
        insertInlineFormula()
        setIsToolbarMoreOpen(false)
      },
      active: editor?.isActive("inlineFormula") ?? false,
    },
    ...toolbarBlockActions.map((item) => ({
      id: item.id,
      label: item.label,
      ariaLabel: item.label,
      run: () => {
        void item.insertAtCursor()
        setIsToolbarMoreOpen(false)
      },
      active:
        item.id === "ordered-list"
          ? editor?.isActive("orderedList") ?? false
          : item.id === "checklist"
            ? editor?.isActive("taskList") ?? false
            : item.id === "table"
              ? editor?.isActive("table") ?? false
              : item.id === "callout"
                ? editor?.isActive("calloutBlock") ?? false
                : item.id === "toggle"
                  ? editor?.isActive("toggleBlock") ?? false
                  : item.id === "bookmark"
                    ? editor?.isActive("bookmarkBlock") ?? false
                    : item.id === "embed"
                      ? editor?.isActive("embedBlock") ?? false
                      : item.id === "file"
                        ? editor?.isActive("fileBlock") ?? false
                        : item.id === "formula"
                          ? editor?.isActive("formulaBlock") ?? false
                          : item.id === "mermaid"
                            ? editor?.isActive("mermaidBlock") ?? false
                            : false,
      disabled: item.disabled,
    })),
  ]

  const stopSlashKeyboardEvent = (event: SlashKeyboardEventLike) => {
    event.preventDefault()
    event.stopPropagation?.()

    if ("nativeEvent" in event && event.nativeEvent) {
      event.nativeEvent.stopImmediatePropagation?.()
      return
    }

    ;(event as KeyboardEvent).stopImmediatePropagation?.()
  }

  const resolveSlashExecutionTarget = useCallback(() => {
    const activeEditor = editorRef.current ?? editor
    if (!activeEditor) return null
    if (isTableSelectionActive(activeEditor)) return null

    const resolvedSlashState = resolveSlashMenuState()
    const activeSlashRange = resolvedSlashState?.menuState ?? getActiveSlashRangeFromEditor(activeEditor)
    if (!activeSlashRange) return null

    const query = resolvedSlashState?.query ?? ""
    const context = getSlashMenuContextFromEditor(activeEditor)
    const rankedItems = getRankedSlashItems(query, context)
    if (!rankedItems.length) return null

    const preferredItemId = flatSlashEntries[selectedSlashIndex]?.item.id
    const selectedItem =
      (preferredItemId ? rankedItems.find((item) => item.id === preferredItemId) : null) ??
      rankedItems[0] ??
      null
    if (!selectedItem || selectedItem.disabled) return null

    return {
      item: selectedItem,
      range: activeSlashRange,
      query,
    }
  }, [
    editor,
    flatSlashEntries,
    getRankedSlashItems,
    getSlashMenuContextFromEditor,
    resolveSlashMenuState,
    selectedSlashIndex,
  ])

  const handleSlashMenuKeyboard = useCallback((event: SlashKeyboardEventLike) => {
    if (event.isComposing) return

    const liveSlashTarget = resolveSlashExecutionTarget()

    if (event.key === "Enter") {
      if (!liveSlashTarget) return
      stopSlashKeyboardEvent(event)
      queueMicrotask(() => {
        void executeSlashCatalogAction(liveSlashTarget.item)
      })
      return
    }

    if (event.key === "Backspace" && !liveSlashTarget?.query.trim().length && liveSlashTarget && editor) {
      stopSlashKeyboardEvent(event)
      setSlashInteractionMode("keyboard")
      editor.chain().focus().deleteRange({ from: liveSlashTarget.range.from, to: liveSlashTarget.range.to }).run()
      closeSlashMenu()
      return
    }

    if (!isSlashMenuOpen) return

    if (!flatSlashEntries.length && event.key === "Escape") {
      stopSlashKeyboardEvent(event)
      setSlashInteractionMode("keyboard")
      closeSlashMenu(true)
      return
    }

    if (event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey)) {
      stopSlashKeyboardEvent(event)
      setSlashInteractionMode("keyboard")
      setSelectedSlashIndex((prev) => {
        if (!flatSlashEntries.length) return 0
        return (prev + 1) % flatSlashEntries.length
      })
      return
    }

    if (event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey)) {
      stopSlashKeyboardEvent(event)
      setSlashInteractionMode("keyboard")
      setSelectedSlashIndex((prev) => {
        if (!flatSlashEntries.length) return 0
        return (prev - 1 + flatSlashEntries.length) % flatSlashEntries.length
      })
      return
    }

    if (event.key === "Home") {
      stopSlashKeyboardEvent(event)
      setSlashInteractionMode("keyboard")
      setSelectedSlashIndex(0)
      return
    }

    if (event.key === "End") {
      stopSlashKeyboardEvent(event)
      setSlashInteractionMode("keyboard")
      setSelectedSlashIndex(Math.max(flatSlashEntries.length - 1, 0))
      return
    }

    if (event.key === "Escape") {
      stopSlashKeyboardEvent(event)
      setSlashInteractionMode("keyboard")
      closeSlashMenu(true)
    }
  }, [closeSlashMenu, editor, executeSlashCatalogAction, flatSlashEntries, isSlashMenuOpen, resolveSlashExecutionTarget])

  const handleSlashActionPointerMove = useCallback((flatIndex: number) => {
    setSlashInteractionMode((prev) => (prev === "pointer" ? prev : "pointer"))
    setSelectedSlashIndex((prev) => (prev === flatIndex ? prev : flatIndex))
  }, [])

  const handleSlashMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    handleSlashMenuKeyboard(event)
  }

  useEffect(() => {
    if (!isSlashMenuOpen) return
    setSelectedSlashIndex(0)
  }, [isSlashMenuOpen, slashQuery])

  useEffect(() => {
    if (!flatSlashEntries.length) {
      setSelectedSlashIndex(0)
      return
    }

    setSelectedSlashIndex((prev) => Math.min(prev, flatSlashEntries.length - 1))
  }, [flatSlashEntries])

  useEffect(() => {
    if (!isSlashMenuOpen || !slashMenuRef.current) return
    const activeElement = slashMenuRef.current.querySelector<HTMLButtonElement>("[data-active='true']")
    activeElement?.scrollIntoView({ block: "nearest" })
  }, [isSlashMenuOpen, selectedSlashIndex])

  useEffect(() => {
    if (typeof window === "undefined") return

    const closeMenu = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (!["ArrowDown", "ArrowUp", "Tab", "Home", "End", "Enter", "Escape", "Backspace"].includes(event.key)) return
        const activeEditor = editorRef.current ?? editor
        const hasActiveSlashRange = Boolean(activeEditor && getActiveSlashRangeFromEditor(activeEditor))
        if (!isSlashMenuOpen && !hasActiveSlashRange) return
        handleSlashMenuKeyboard(event)
        return
      }

      if (!isSlashMenuOpen) return

      const target = event.target
      if (slashMenuRef.current && target instanceof Node && slashMenuRef.current.contains(target)) {
        return
      }

      closeSlashMenu()
    }

    window.addEventListener("pointerdown", closeMenu)
    window.addEventListener("keydown", closeMenu, true)

    return () => {
      window.removeEventListener("pointerdown", closeMenu)
      window.removeEventListener("keydown", closeMenu, true)
    }
  }, [closeSlashMenu, editor, handleSlashMenuKeyboard, isSlashMenuOpen])

  useEffect(() => {
    if (typeof window === "undefined" || !isInlineColorMenuOpen) return

    const closeMenu = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return
        setIsInlineColorMenuOpen(false)
        return
      }

      const target = event.target
      if (
        inlineColorMenuRef.current &&
        target instanceof Node &&
        inlineColorMenuRef.current.contains(target)
      ) {
        return
      }

      setIsInlineColorMenuOpen(false)
    }

    window.addEventListener("pointerdown", closeMenu)
    window.addEventListener("keydown", closeMenu)

    return () => {
      window.removeEventListener("pointerdown", closeMenu)
      window.removeEventListener("keydown", closeMenu)
    }
  }, [isInlineColorMenuOpen])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!isBubbleTextStyleMenuOpen && !isBubbleInlineColorMenuOpen) return

    const closeMenu = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return
        setIsBubbleTextStyleMenuOpen(false)
        setIsBubbleInlineColorMenuOpen(false)
        return
      }

      const target = event.target
      if (
        (bubbleTextStyleMenuRef.current && target instanceof Node && bubbleTextStyleMenuRef.current.contains(target)) ||
        (bubbleInlineColorMenuRef.current && target instanceof Node && bubbleInlineColorMenuRef.current.contains(target))
      ) {
        return
      }

      setIsBubbleTextStyleMenuOpen(false)
      setIsBubbleInlineColorMenuOpen(false)
    }

    window.addEventListener("pointerdown", closeMenu)
    window.addEventListener("keydown", closeMenu)

    return () => {
      window.removeEventListener("pointerdown", closeMenu)
      window.removeEventListener("keydown", closeMenu)
    }
  }, [isBubbleInlineColorMenuOpen, isBubbleTextStyleMenuOpen])

  useEffect(() => {
    if (bubbleState.visible && bubbleState.mode === "text") return
    setIsBubbleTextStyleMenuOpen(false)
    setIsBubbleInlineColorMenuOpen(false)
  }, [bubbleState.mode, bubbleState.visible])

  const closeBlockMenus = useCallback(() => setBlockMenuState(null), [])

  const closeTableMenu = useCallback(() => setTableMenuState(null), [])

  const runTableMenuEditorAction = useCallback(
    (action: (activeEditor: TiptapEditor) => void) => {
      if (!editor) {
        closeTableMenu()
        return
      }

      action(editor)
      closeTableMenu()
      stabilizeTableSelectionSurface(editor)
    },
    [closeTableMenu, editor, stabilizeTableSelectionSurface]
  )

  const openTableMenu = useCallback((kind: TableMenuKind, anchorRect: DOMRect) => {
    cancelTableQuickRailHide()
    const nextLeft =
      typeof window !== "undefined"
        ? Math.min(
            Math.max(TABLE_MENU_EDGE_PADDING_PX, Math.round(anchorRect.left)),
            Math.max(
              TABLE_MENU_EDGE_PADDING_PX,
              window.innerWidth - TABLE_MENU_ESTIMATED_WIDTH_PX - TABLE_MENU_EDGE_PADDING_PX
            )
          )
        : Math.round(anchorRect.left)
    const nextTop =
      typeof window !== "undefined"
        ? Math.min(
            Math.max(TABLE_MENU_EDGE_PADDING_PX, Math.round(anchorRect.bottom + 8)),
            Math.max(
              TABLE_MENU_EDGE_PADDING_PX,
              window.innerHeight - TABLE_MENU_ESTIMATED_HEIGHT_PX - TABLE_MENU_EDGE_PADDING_PX
            )
          )
        : Math.round(anchorRect.bottom + 8)

    setTableMenuState((prev) =>
      prev && prev.kind === kind
        ? null
        : {
            kind,
            left: nextLeft,
            top: nextTop,
        }
    )
  }, [cancelTableQuickRailHide])

  const openSelectionAwareTableMenu = useCallback(
    (kind: TableMenuKind, anchorRect: DOMRect) => {
      if (kind === "row") {
        selectCurrentTableAxis("row")
      } else if (kind === "column") {
        selectCurrentTableAxis("column")
      } else {
        selectActiveTableBlock()
      }
      openTableMenu(kind, anchorRect)
    },
    [openTableMenu, selectActiveTableBlock, selectCurrentTableAxis]
  )

  const handleTableColumnRailSegmentClick = useCallback(
    (columnIndex: number, anchorRect: DOMRect) => {
      const alreadySelected = isCurrentTableColumnSelection(columnIndex)
      const selected = selectTableColumnByIndex(columnIndex)
      if (!selected) return
      setTableQuickRailState((prev) => ({ ...prev, columnIndex }))
      if (alreadySelected) {
        openSelectionAwareTableMenu("column", anchorRect)
        return
      }
      closeTableMenu()
    },
    [closeTableMenu, isCurrentTableColumnSelection, openSelectionAwareTableMenu, selectTableColumnByIndex]
  )

  const openBlockMenu = useCallback((blockIndex: number, anchorRect: DOMRect) => {
    if (isTableMode) return
    setBlockMenuState((prev) =>
      prev && prev.blockIndex === blockIndex
        ? null
        : {
            blockIndex,
            left: Math.round(anchorRect.left),
            top: Math.round(anchorRect.bottom + 8),
          }
    )
  }, [isTableMode])

  const moveBlockByStep = useCallback(
    (blockIndex: number, delta: -1 | 1) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return
      const contentLength = (currentEditor.getJSON() as BlockEditorDoc).content?.length ?? 0
      const nextIndex = Math.max(0, Math.min(blockIndex + delta, Math.max(contentLength - 1, 0)))
      if (nextIndex === blockIndex) return
      mutateTopLevelBlocks(
        (doc) => moveTopLevelBlockToInsertionIndex(doc, blockIndex, delta > 0 ? nextIndex + 1 : nextIndex),
        nextIndex
      )
      closeBlockMenus()
    },
    [closeBlockMenus, mutateTopLevelBlocks]
  )

  const duplicateBlock = useCallback(
    (blockIndex: number) => {
      mutateTopLevelBlocks((doc) => duplicateTopLevelBlockAt(doc, blockIndex), blockIndex + 1)
      closeBlockMenus()
    },
    [closeBlockMenus, mutateTopLevelBlocks]
  )

  const deleteBlock = useCallback(
    (blockIndex: number) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return
      const contentLength = (currentEditor.getJSON() as BlockEditorDoc).content?.length ?? 0
      const nextFocusIndex = Math.max(0, Math.min(blockIndex, Math.max(contentLength - 2, 0)))
      mutateTopLevelBlocks((doc) => deleteTopLevelBlockAt(doc, blockIndex), nextFocusIndex)
      closeBlockMenus()
    },
    [closeBlockMenus, mutateTopLevelBlocks]
  )

  useEffect(() => {
    if (typeof window === "undefined" || !draggedBlockState) return

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== draggedBlockState.pointerId) return
      const nextIndicator = resolveDropIndicatorByClientY(event.clientY)
      setDropIndicatorState({
        visible: true,
        ...nextIndicator,
      })
      setDragGhostPosition({ x: event.clientX, y: event.clientY })
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== draggedBlockState.pointerId) return

      const nextIndicator = resolveDropIndicatorByClientY(event.clientY)
      const sourceIndex = draggedBlockState.sourceIndex
      const normalizedInsertionIndex =
        nextIndicator.insertionIndex > sourceIndex
          ? nextIndicator.insertionIndex
          : nextIndicator.insertionIndex

      mutateTopLevelBlocks(
        (doc) => moveTopLevelBlockToInsertionIndex(doc, sourceIndex, normalizedInsertionIndex),
        Math.max(0, Math.min(nextIndicator.insertionIndex, ((editorRef.current?.getJSON() as BlockEditorDoc)?.content?.length || 1) - 1))
      )

      setDraggedBlockState(null)
      setDragGhostPosition(null)
      setDropIndicatorState((prev) => ({ ...prev, visible: false }))
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerUp)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerUp)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerUp)
    }
  }, [draggedBlockState, mutateTopLevelBlocks, resolveDropIndicatorByClientY])

  useEffect(() => {
    if (typeof document === "undefined" || !draggedBlockState) return
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = "grabbing"
    document.body.style.userSelect = "none"
    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
    }
  }, [draggedBlockState])

  useEffect(() => {
    if (typeof window === "undefined") return
    const mediaQuery = window.matchMedia(BLOCK_HANDLE_MEDIA_QUERY)
    const sync = () => setIsCoarsePointer(mediaQuery.matches)
    sync()
    mediaQuery.addEventListener?.("change", sync)
    return () => mediaQuery.removeEventListener?.("change", sync)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const mediaQuery = window.matchMedia(DESKTOP_TABLE_RAIL_MEDIA_QUERY)
    const sync = () => setIsDesktopTableRailViewport(!mediaQuery.matches)
    sync()
    mediaQuery.addEventListener?.("change", sync)
    return () => mediaQuery.removeEventListener?.("change", sync)
  }, [])

  useEffect(() => {
    return () => {
      clearPendingBlockDrag()
    }
  }, [clearPendingBlockDrag])

  useEffect(() => {
    if (typeof window === "undefined") return
    let rafId: number | null = null
    const sync = () => {
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        setSelectionTick((prev) => prev + 1)
      })
    }
    window.addEventListener("scroll", sync, true)
    window.addEventListener("resize", sync)
    return () => {
      window.removeEventListener("scroll", sync, true)
      window.removeEventListener("resize", sync)
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
    }
  }, [])

  useEffect(() => {
    if (!editor) return
    const overlayIndex =
      selectedBlockNodeIndex !== null
        ? selectedBlockNodeIndex
        : clickedBlockIndex !== null
          ? clickedBlockIndex
          : null
    if (overlayIndex === null) {
      setBlockSelectionOverlayState((prev) => (prev.visible ? { ...prev, visible: false } : prev))
    } else {
      const overlayElement = getTopLevelBlockElementByIndex(overlayIndex)
      if (!overlayElement) {
        setBlockSelectionOverlayState((prev) => (prev.visible ? { ...prev, visible: false } : prev))
      } else {
        const rect = overlayElement.getBoundingClientRect()
        const nextOverlayState: BlockSelectionOverlayState = {
          visible: true,
          left: rect.left - 6,
          top: rect.top - 4,
          width: rect.width + 12,
          height: rect.height + 8,
        }
        setBlockSelectionOverlayState((prev) =>
          isStableBlockSelectionOverlayState(prev, nextOverlayState) ? prev : nextOverlayState
        )
      }
    }

    const hideBlockHandle = () =>
      setBlockHandleState((prev) => (prev.visible ? { ...prev, visible: false } : prev))
    if (isTableMode || tableQuickRailState.visible || tableMenuState) {
      hideBlockHandle()
      return
    }
    const stickySelectionActive =
      !isCoarsePointer && selectedBlockNodeIndex !== null && keyboardBlockSelectionStickyRef.current
    const blockIndex = isCoarsePointer
      ? selectedBlockIndex
      : stickySelectionActive
        ? selectedBlockNodeIndex
        : hoveredBlockIndex
    if (blockIndex === null) {
      hideBlockHandle()
      return
    }
    const blockElement = getTopLevelBlockElementByIndex(blockIndex)
    const canShowHandle = isTopLevelBlockHandleEligible(blockIndex)
    const shouldShow = Boolean(
      blockElement && canShowHandle && (isCoarsePointer || stickySelectionActive || hoveredBlockIndex !== null)
    )

    if (!shouldShow || !blockElement) {
      hideBlockHandle()
      return
    }

    const rect = blockElement.getBoundingClientRect()
    const railElement = blockHandleRailRef.current
    const railWidth = railElement?.offsetWidth || 54
    const blocks = ((editor.getJSON() as BlockEditorDoc).content ?? []) as BlockEditorDoc[]
    const blockNode = blocks[blockIndex]
    const railHeight = railElement?.offsetHeight || 40
    const anchoredTop = shouldCenterBlockHandleForNode(blockNode)
      ? resolveBlockHandleAnchorTop(blockElement, railHeight)
      : rect.top + 6
    const nextState: TopLevelBlockHandleState = {
      visible: true,
      blockIndex,
      left: Math.max(12, rect.left - railWidth - 10),
      top: anchoredTop,
      bottom: rect.bottom + 12,
      width: rect.width,
    }

    setBlockHandleState((prev) => (isStableBlockHandleState(prev, nextState) ? prev : nextState))
  }, [
    editor,
    clickedBlockIndex,
    getTopLevelBlockElementByIndex,
    hoveredBlockIndex,
    isTableMode,
    isCoarsePointer,
    isTopLevelBlockHandleEligible,
    selectedBlockIndex,
    selectedBlockNodeIndex,
    selectionTick,
    tableMenuState,
    tableQuickRailState.visible,
  ])

  useEffect(() => {
    if (!tableQuickRailState.visible) return
    const activeEditor = editorRef.current ?? editor
    if (!activeEditor) return

    if (!isTableSelectionActive(activeEditor)) {
      if (!tableMenuState) {
        scheduleTableQuickRailHide(0)
      }
      return
    }

    const selectedCell = viewportRef.current?.querySelector(
      ".aq-block-editor__content .selectedCell"
    ) as HTMLElement | null
    const fallbackCell = viewportRef.current?.querySelector(
      ".aq-block-editor__content table th, .aq-block-editor__content table td"
    ) as HTMLElement | null
    syncTableQuickRailFromElement(selectedCell ?? fallbackCell)
  }, [
    editor,
    selectionTick,
    scheduleTableQuickRailHide,
    syncTableQuickRailFromElement,
    tableMenuState,
    tableQuickRailState.visible,
  ])

  useEffect(() => {
    if (typeof window === "undefined" || isCoarsePointer || !tableQuickRailState.visible) return
    if (tableColumnRailResizeRef.current || tableRowResizeRef.current) return

    const anchorElement = viewportRef.current?.querySelector(
      ".aq-block-editor__content .selectedCell, .aq-block-editor__content table th, .aq-block-editor__content table td"
    ) as HTMLElement | null
    const tableElement = anchorElement?.closest("table") as HTMLTableElement | null
    if (!anchorElement || !tableElement) return

    const tableRect = tableElement.getBoundingClientRect()
    const nextWidth = Math.round(tableRect.width)
    const nextSegments = Array.from(
      (tableElement.querySelector("thead tr, tbody tr, tr")?.children ?? []) as HTMLCollectionOf<HTMLElement>
    )
      .filter((child): child is HTMLElement => child instanceof HTMLElement)
      .map((cell) => {
        const cellRect = cell.getBoundingClientRect()
        return {
          left: Math.round(Math.max(0, cellRect.left - tableRect.left)),
          width: Math.round(cellRect.width),
        }
      })

    const segmentsChanged =
      nextSegments.length !== tableQuickRailState.columnSegments.length ||
      nextSegments.some((segment, index) => {
        const prev = tableQuickRailState.columnSegments[index]
        return !prev || Math.abs(prev.left - segment.left) > 2 || Math.abs(prev.width - segment.width) > 2
      })

    if (Math.abs(nextWidth - tableQuickRailState.width) <= 2 && !segmentsChanged) return

    syncTableQuickRailFromElement(anchorElement)
  }, [
    isCoarsePointer,
    selectionTick,
    syncTableQuickRailFromElement,
    tableQuickRailState.columnSegments,
    tableQuickRailState.visible,
    tableQuickRailState.width,
  ])

  useEffect(() => {
    if (typeof window === "undefined" || typeof MutationObserver === "undefined") return
    if (isCoarsePointer || !tableQuickRailState.visible) return

    const resolveAnchorElement = () =>
      (viewportRef.current?.querySelector(
        ".aq-block-editor__content .selectedCell, .aq-block-editor__content table th, .aq-block-editor__content table td"
      ) as HTMLElement | null)

    const initialAnchorElement = resolveAnchorElement()
    const tableElement = initialAnchorElement?.closest("table") as HTMLTableElement | null
    if (!initialAnchorElement || !tableElement) return

    let rafId: number | null = null
    const requestSync = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        syncTableQuickRailFromElement(resolveAnchorElement())
      })
    }

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            requestSync()
          })
        : null

    resizeObserver?.observe(tableElement)
    const firstRow = tableElement.querySelector("thead tr, tbody tr, tr")
    if (firstRow instanceof HTMLElement) {
      resizeObserver?.observe(firstRow)
    }

    const mutationObserver = new MutationObserver(() => {
      requestSync()
    })

    mutationObserver.observe(tableElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["colspan", "rowspan", "style", "class"],
    })

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
      resizeObserver?.disconnect()
      mutationObserver.disconnect()
    }
  }, [isCoarsePointer, selectionTick, syncTableQuickRailFromElement, tableQuickRailState.visible])

  useEffect(() => {
    const elements = getTopLevelBlockElements()

    elements.forEach((element, index) => {
      if (index === hoveredBlockIndex && !draggedBlockState) {
        element.setAttribute("data-block-hovered", "true")
      } else {
        element.removeAttribute("data-block-hovered")
      }

      if (draggedBlockState && index === draggedBlockState.sourceIndex) {
        element.setAttribute("data-block-dragging", "true")
      } else {
        element.removeAttribute("data-block-dragging")
      }

      element.removeAttribute("data-block-drop-target")
    })

    return () => {
      elements.forEach((element) => {
        element.removeAttribute("data-block-hovered")
        element.removeAttribute("data-block-dragging")
        element.removeAttribute("data-block-drop-target")
      })
    }
  }, [draggedBlockState, dropIndicatorState.insertionIndex, getTopLevelBlockElements, hoveredBlockIndex])

  const handleViewportPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      cancelHoveredBlockClear()
      const rowResizeState = tableRowResizeRef.current
      const columnResizeState = tableColumnRailResizeRef.current
      if (rowResizeState) {
        setViewportRowResizeHot(true)
        return
      }
      if (columnResizeState) {
        cancelTableQuickRailHide()
        return
      }
      if (isCoarsePointer) return
      const target = event.target instanceof Element ? event.target : null
      if (
        target?.closest("[data-table-menu-root='true']") ||
        target?.closest("[data-table-axis-rail='true']") ||
        target?.closest("[data-table-corner-handle='true']") ||
        target?.closest("[data-table-column-rail-track='true']")
      ) {
        cancelTableQuickRailHide()
        if (isTableMode) {
          setHoveredBlockIndex(null)
        }
        return
      }
      const hoveredTableElement = target?.closest(".aq-table-shell, .tableWrapper, table") ?? null
      if (hoveredTableElement) {
        syncTableQuickRailFromElement(hoveredTableElement)
      } else if (!tableMenuState) {
        scheduleTableQuickRailHide()
      }
      if (isTableMode) {
        setHoveredBlockIndex(null)
        return
      }
      if (target?.closest("[data-block-handle-rail='true']") || target?.closest("[data-block-menu-root='true']")) {
        if (blockHandleState.visible) {
          setHoveredBlockIndex(blockHandleState.blockIndex)
        }
        return
      }
      const cell = getTableCellFromTarget(event.target)
      setViewportRowResizeHot(isRowResizeHandleTarget(cell, event.clientX, event.clientY))
      setHoveredBlockIndex(
        findTopLevelBlockIndexByClientPosition(event.clientX, event.clientY) ??
          findTopLevelBlockIndexFromTarget(event.target)
      )
      if (selectedBlockNodeIndex !== null && !keyboardBlockSelectionStickyRef.current) {
        keyboardBlockSelectionStickyRef.current = false
        setSelectedBlockNodeIndex(null)
        syncSelectedBlockNodeSurface(null)
      }
    },
    [
      blockHandleState.blockIndex,
      blockHandleState.visible,
      cancelHoveredBlockClear,
      cancelTableQuickRailHide,
      findTopLevelBlockIndexByClientPosition,
      findTopLevelBlockIndexFromTarget,
      getTableCellFromTarget,
      isCoarsePointer,
      isTableMode,
      isRowResizeHandleTarget,
      selectedBlockNodeIndex,
      setViewportRowResizeHot,
      syncSelectedBlockNodeSurface,
      scheduleTableQuickRailHide,
      syncTableQuickRailFromElement,
      tableMenuState,
    ]
  )

  const handleViewportPointerLeave = useCallback(() => {
    scheduleHoveredBlockClear()
    if (!isTableMode && !tableMenuState) {
      scheduleTableQuickRailHide()
    }
    if (!tableRowResizeRef.current) {
      setViewportRowResizeHot(false)
    }
  }, [
    isTableMode,
    scheduleHoveredBlockClear,
    scheduleTableQuickRailHide,
    setViewportRowResizeHot,
    tableMenuState,
  ])

  const handleViewportKeyDownCapture = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return

      if (
        !event.defaultPrevented &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        (event.key === "Backspace" || event.key === "Delete") &&
        selectedBlockNodeIndexRef.current !== null
      ) {
        event.preventDefault()
        event.stopPropagation()
        const blockIndex = selectedBlockNodeIndexRef.current
        const contentLength = (currentEditor.getJSON() as BlockEditorDoc).content?.length ?? 0
        const nextFocusIndex = Math.max(0, Math.min(blockIndex, Math.max(contentLength - 2, 0)))
        mutateTopLevelBlocks((doc) => deleteTopLevelBlockAt(doc, blockIndex), nextFocusIndex)
        setBlockMenuState(null)
        keyboardBlockSelectionStickyRef.current = false
        setSelectedBlockNodeIndex(null)
        syncSelectedBlockNodeSurface(null)
        currentEditor.view.focus()
        return
      }

      if (event.defaultPrevented) return
      if (event.key !== "Tab" || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      if (slashMenuState) return

      const targetBlockIndex =
        hoveredBlockIndex ??
        findTopLevelBlockIndexFromTarget(event.target) ??
        getTopLevelBlockIndexFromSelection(currentEditor)

      if (!isTabBlockSelectionEligible(currentEditor, targetBlockIndex)) return

      event.preventDefault()
      event.stopPropagation()
      promoteTopLevelBlockSelection(targetBlockIndex)
    },
    [findTopLevelBlockIndexFromTarget, hoveredBlockIndex, mutateTopLevelBlocks, promoteTopLevelBlockSelection, slashMenuState, syncSelectedBlockNodeSurface]
  )

  const handleViewportPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (skipNextPointerDownSelectionClearRef.current) {
        skipNextPointerDownSelectionClearRef.current = false
        return
      }
      const targetBlockIndex =
        findTopLevelBlockIndexFromTarget(event.target) ??
        findTopLevelBlockIndexByClientPosition(event.clientX, event.clientY)
      if (!isTableMode && isOuterBlockSelectionGesture(event, targetBlockIndex)) {
        if (targetBlockIndex === null) return
        event.preventDefault()
        event.stopPropagation()
        promoteTopLevelBlockSelection(targetBlockIndex)
        return
      }
      setClickedBlockIndex(null)
      if (selectedBlockNodeIndex !== null) {
        keyboardBlockSelectionStickyRef.current = false
        setSelectedBlockNodeIndex(null)
        syncSelectedBlockNodeSurface(null)
      }
      if (isCoarsePointer || tableRowResizeRef.current || tableColumnRailResizeRef.current) return
      const cell = getTableCellFromTarget(event.target)
      if (!isRowResizeHandleTarget(cell, event.clientX, event.clientY) || !cell) return
      event.preventDefault()
      event.stopPropagation()
      startTableRowResize(cell, event.clientY)
    },
    [
      findTopLevelBlockIndexFromTarget,
      findTopLevelBlockIndexByClientPosition,
      getTableCellFromTarget,
      isOuterBlockSelectionGesture,
      isCoarsePointer,
      isRowResizeHandleTarget,
      isTableMode,
      promoteTopLevelBlockSelection,
      selectedBlockNodeIndex,
      startTableRowResize,
      syncSelectedBlockNodeSurface,
    ]
  )

  const handleViewportDragStart = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      const taskItemContext = findNestedListItemDragContextFromTarget(event.target)
      if (!taskItemContext) return

      setDraggedNestedListItemState({
        listBlockIndex: taskItemContext.listBlockIndex,
        listPath: taskItemContext.listPath,
        sourceItemIndex: taskItemContext.sourceItemIndex,
      })
      setNestedListItemDropIndicatorState({
        visible: true,
        listBlockIndex: taskItemContext.listBlockIndex,
        listPath: taskItemContext.listPath,
        ...resolveNestedListItemDropIndicatorByClientY(taskItemContext.listElement, event.clientY),
      })
      event.dataTransfer.effectAllowed = "move"
      event.dataTransfer.setData("text/plain", `list-item:${taskItemContext.listBlockIndex}:${taskItemContext.sourceItemIndex}`)
    },
    [findNestedListItemDragContextFromTarget, resolveNestedListItemDropIndicatorByClientY]
  )

  const handleViewportDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!draggedNestedListItemState) return
      const taskItemContext = findNestedListItemDragContextFromTarget(event.target)
      if (
        !taskItemContext ||
        taskItemContext.listBlockIndex !== draggedNestedListItemState.listBlockIndex ||
        taskItemContext.listPath.join(",") !== draggedNestedListItemState.listPath.join(",")
      ) {
        return
      }

      event.preventDefault()
      setNestedListItemDropIndicatorState({
        visible: true,
        listBlockIndex: taskItemContext.listBlockIndex,
        listPath: taskItemContext.listPath,
        ...resolveNestedListItemDropIndicatorByClientY(taskItemContext.listElement, event.clientY),
      })
    },
    [draggedNestedListItemState, findNestedListItemDragContextFromTarget, resolveNestedListItemDropIndicatorByClientY]
  )

  const clearNestedListItemDragState = useCallback(() => {
    setDraggedNestedListItemState(null)
    setNestedListItemDropIndicatorState((prev) => ({ ...prev, visible: false }))
  }, [])

  const handleViewportDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!draggedNestedListItemState) return
      const taskItemContext = findNestedListItemDragContextFromTarget(event.target)
      if (
        !taskItemContext ||
        taskItemContext.listBlockIndex !== draggedNestedListItemState.listBlockIndex ||
        taskItemContext.listPath.join(",") !== draggedNestedListItemState.listPath.join(",")
      ) {
        clearNestedListItemDragState()
        return
      }

      event.preventDefault()
      const indicator = resolveNestedListItemDropIndicatorByClientY(taskItemContext.listElement, event.clientY)
      mutateTopLevelBlocks(
        (doc) =>
          moveNestedListItemToInsertionIndex(
            doc,
            draggedNestedListItemState.listBlockIndex,
            draggedNestedListItemState.listPath,
            draggedNestedListItemState.sourceItemIndex,
            indicator.insertionIndex
          ),
        draggedNestedListItemState.listBlockIndex
      )
      clearNestedListItemDragState()
    },
    [
      clearNestedListItemDragState,
      draggedNestedListItemState,
      findNestedListItemDragContextFromTarget,
      mutateTopLevelBlocks,
      resolveNestedListItemDropIndicatorByClientY,
    ]
  )

  const handleViewportDragEnd = useCallback(() => {
    clearNestedListItemDragState()
  }, [clearNestedListItemDragState])

  useEffect(() => {
    if (typeof window === "undefined" || !blockMenuState) return
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof PointerEvent) {
        const target = event.target
        if (target instanceof Element && target.closest("[data-block-menu-root='true']")) {
          return
        }
      }
      if (event instanceof KeyboardEvent && event.key !== "Escape") return
      setBlockMenuState(null)
    }
    window.addEventListener("pointerdown", close)
    window.addEventListener("keydown", close)
    return () => {
      window.removeEventListener("pointerdown", close)
      window.removeEventListener("keydown", close)
    }
  }, [blockMenuState])

  useEffect(() => {
    if (typeof window === "undefined" || !tableMenuState) return
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof PointerEvent) {
        const target = event.target
        if (
          target instanceof Element &&
          (target.closest("[data-table-menu-root='true']") ||
            target.closest("[data-table-axis-rail='true']") ||
            target.closest("[data-table-corner-handle='true']") ||
            target.closest("[data-table-column-rail-track='true']"))
        ) {
          return
        }
      }
      if (event instanceof KeyboardEvent && event.key !== "Escape") return
      setTableMenuState(null)
    }
    window.addEventListener("pointerdown", close)
    window.addEventListener("keydown", close)
    return () => {
      window.removeEventListener("pointerdown", close)
      window.removeEventListener("keydown", close)
    }
  }, [tableMenuState])

  const shouldShowTableHandles =
    !isCoarsePointer && (tableQuickRailState.visible || isTableMode || Boolean(tableMenuState))
  const desktopTableRailTrackWidth = useMemo(
    () =>
      tableQuickRailState.columnSegments.length
        ? tableQuickRailState.columnSegments.reduce((sum, segment) => sum + Math.max(0, segment.width), 0)
        : tableQuickRailState.width,
    [tableQuickRailState.columnSegments, tableQuickRailState.width]
  )
  const shouldShowTableColumnRail =
    ENABLE_DESKTOP_TABLE_COLUMN_RAIL &&
    shouldShowTableHandles &&
    isDesktopTableRailViewport &&
    tableQuickRailState.columnSegments.length > 0 &&
    desktopTableRailTrackWidth > 0
  const desktopTableRailLayout = useMemo(() => {
    if (typeof window === "undefined") return null
    return resolveDesktopTableRailLayout(
      tableQuickRailState,
      desktopTableRailTrackWidth,
      window.innerWidth,
      window.innerHeight
    )
  }, [desktopTableRailTrackWidth, tableQuickRailState])

  useEffect(() => {
    if (shouldShowTableHandles) return
    hideTableColumnDragGuide()
  }, [hideTableColumnDragGuide, shouldShowTableHandles])

  return (
    <Shell className={className}>
      <Toolbar>
        <ToolbarActions>
          <ToolbarGroup>
            {toolbarActions.slice(0, 4).map((action) => (
              <ToolbarRibbonButton
                key={action.id}
                type="button"
                data-active={action.active}
                data-tone="heading"
                onMouseDown={handleToolbarButtonMouseDown}
                onClick={() => action.run()}
                disabled={disabled || action.disabled}
                aria-label={action.ariaLabel}
                title={action.ariaLabel}
              >
                {action.label}
              </ToolbarRibbonButton>
            ))}
          </ToolbarGroup>
          <ToolbarSeparator aria-hidden="true" />
          <ToolbarGroup>
            {toolbarActions.slice(4, 7).map((action) => (
              <ToolbarRibbonButton
                key={action.id}
                type="button"
                data-active={action.active}
                onMouseDown={handleToolbarButtonMouseDown}
                onClick={() => action.run()}
                disabled={disabled || action.disabled}
                aria-label={action.ariaLabel}
                title={action.ariaLabel}
              >
                {action.label}
              </ToolbarRibbonButton>
            ))}
            <ToolbarColorDisclosure ref={inlineColorMenuRef} open={isInlineColorMenuOpen}>
              <summary
                aria-label="글자색"
                title="글자색"
                data-active={Boolean(activeInlineColor)}
                onClick={(event: ReactMouseEvent<HTMLElement>) => {
                  event.preventDefault()
                  setIsInlineColorMenuOpen((prev) => !prev)
                  setIsToolbarMoreOpen(false)
                }}
              >
                <ColorTriggerIcon data-active={Boolean(activeInlineColor)}>
                  <span>A</span>
                  <i style={activeInlineColor ? { background: activeInlineColor } : undefined} aria-hidden="true" />
                </ColorTriggerIcon>
              </summary>
              {isInlineColorMenuOpen ? (
                <div className="body">
                  <ColorOptionButton
                    type="button"
                    data-active={!activeInlineColor}
                    onClick={() => applyInlineColor(null)}
                  >
                    <ColorOptionLabel>
                      <ColorOptionSwatch data-empty="true" aria-hidden="true" />
                      <span>기본색</span>
                    </ColorOptionLabel>
                  </ColorOptionButton>
                  {INLINE_TEXT_COLOR_OPTIONS.map((option) => (
                    <ColorOptionButton
                      key={option.value}
                      type="button"
                      data-active={activeInlineColor === option.value}
                      disabled={disabled || isInlineCodeActive}
                      onClick={() => applyInlineColor(option.value)}
                    >
                      <ColorOptionLabel>
                        <ColorOptionSwatch style={{ background: option.value }} aria-hidden="true" />
                        <span>{option.label}</span>
                      </ColorOptionLabel>
                    </ColorOptionButton>
                  ))}
                </div>
              ) : null}
            </ToolbarColorDisclosure>
          </ToolbarGroup>
          <ToolbarSeparator aria-hidden="true" />
          <ToolbarGroup>
            {toolbarActions.slice(7).map((action) => (
              <ToolbarRibbonButton
                key={action.id}
                type="button"
                data-active={action.active}
                onMouseDown={handleToolbarButtonMouseDown}
                onClick={() => action.run()}
                disabled={disabled || action.disabled}
                aria-label={action.ariaLabel}
                title={action.ariaLabel}
              >
                {action.label}
              </ToolbarRibbonButton>
            ))}
          </ToolbarGroup>
          <ToolbarSeparator aria-hidden="true" />
          <ToolbarMoreDisclosure open={isToolbarMoreOpen}>
            <summary
              aria-label="추가 도구"
              title="추가 도구"
              onClick={(event: ReactMouseEvent<HTMLElement>) => {
                event.preventDefault()
                setIsToolbarMoreOpen((prev) => !prev)
                setIsInlineColorMenuOpen(false)
              }}
            >
              <span aria-hidden="true">⋯</span>
            </summary>
            {isToolbarMoreOpen ? (
              <div className="body">
                {toolbarMoreActions.map((action) => (
                  <ToolbarButton
                    key={action.id}
                    type="button"
                    data-active={action.active}
                    onMouseDown={handleToolbarButtonMouseDown}
                    onClick={() => action.run()}
                    disabled={disabled || action.disabled}
                    aria-label={action.ariaLabel}
                    title={action.ariaLabel}
                  >
                    {action.label}
                  </ToolbarButton>
                ))}
              </div>
            ) : null}
          </ToolbarMoreDisclosure>
        </ToolbarActions>
      </Toolbar>

      <QuickInsertBar aria-label="빠른 블록 삽입">
        <QuickInsertActions>
          {quickInsertActions.map((action) => (
            <QuickInsertButton
              key={action.id}
              type="button"
              onClick={() => {
                void action.insertAtCursor()
              }}
              disabled={disabled || action.disabled}
            >
              {action.label}
            </QuickInsertButton>
          ))}
        </QuickInsertActions>
      </QuickInsertBar>

      <HiddenFileInput
        ref={imageFileInputRef}
        type="file"
        accept="image/*"
        data-testid="editor-image-file-input"
        onChange={(event) => {
          void handleImageInputChange(event)
        }}
      />

      <HiddenFileInput
        ref={attachmentFileInputRef}
        type="file"
        data-testid="editor-attachment-file-input"
        onChange={(event) => {
          void handleAttachmentInputChange(event)
        }}
      />

      {isSlashMenuOpen ? (
        <SlashMenu
          data-testid="slash-menu"
          data-placement={slashMenuState?.placement ?? "bottom"}
          data-input-mode={slashInteractionMode}
          ref={slashMenuRef}
          role="dialog"
          aria-label="블록 삽입 메뉴"
          onKeyDown={handleSlashMenuKeyDown}
          onPointerMove={() => {
            if (slashInteractionMode !== "pointer") {
              setSlashInteractionMode("pointer")
            }
          }}
          style={
            slashMenuState
              ? {
                  left: `${slashMenuState.left}px`,
                  top: `${slashMenuState.top}px`,
                }
              : undefined
          }
        >
          <SlashQuerySummary>
            <span>/ {slashQuery.trim().length ? slashQuery : "검색어를 입력하세요"}</span>
          </SlashQuerySummary>
          <SlashMenuBody>
            {slashSections.length ? (
              slashSections.map((section) => (
                <SlashMenuSection key={section.title}>
                  <SlashMenuSectionLabel>{section.title}</SlashMenuSectionLabel>
                  <SlashActionList>
                    {section.items.map((action) => {
                      const entryKey = `${section.title}-${action.id}`
                      const flatIndex = flatSlashEntries.findIndex((entry) => entry.key === entryKey)
                      return (
                        <SlashActionButton
                          key={entryKey}
                          type="button"
                          data-slash-action-id={action.id}
                          data-active={flatIndex === selectedSlashIndex}
                          data-input-mode={slashInteractionMode}
                          disabled={disabled || action.disabled}
                          onMouseDown={(event) => event.preventDefault()}
                          onPointerMove={() => handleSlashActionPointerMove(flatIndex)}
                          onClick={() => {
                            if (action.disabled) return
                            void executeSlashCatalogAction(action)
                          }}
                        >
                          <SlashActionIcon aria-hidden="true" data-role="slash-action-icon">
                            {getSlashActionGlyph(action)}
                          </SlashActionIcon>
                          <SlashActionMain>
                            <SlashActionTitleRow>
                              <strong>{action.label}</strong>
                            </SlashActionTitleRow>
                            {action.helper ? <span>{action.helper}</span> : null}
                          </SlashActionMain>
                          {action.slashHint ? <SlashActionHint>{action.slashHint}</SlashActionHint> : null}
                        </SlashActionButton>
                      )
                    })}
                  </SlashActionList>
                </SlashMenuSection>
              ))
            ) : (
              <SlashEmptyState>검색 결과가 없습니다.</SlashEmptyState>
            )}
          </SlashMenuBody>
        </SlashMenu>
      ) : null}

      <EditorViewport
        data-testid="block-editor-viewport"
        ref={viewportRef}
        tabIndex={-1}
        onCompositionStart={() => {
          setIsSlashImeComposing(true)
        }}
        onCompositionUpdate={() => {
          requestAnimationFrame(() => {
            syncSlashMenuWhileComposing()
          })
        }}
        onCompositionEnd={() => {
          setIsSlashImeComposing(false)
          requestAnimationFrame(() => {
            applyResolvedSlashMenuState(resolveSlashMenuState())
          })
        }}
        onKeyDownCapture={handleViewportKeyDownCapture}
        onPointerMove={handleViewportPointerMove}
        onPointerLeave={handleViewportPointerLeave}
        onPointerDown={handleViewportPointerDown}
        onDragStart={handleViewportDragStart}
        onDragOver={handleViewportDragOver}
        onDrop={handleViewportDrop}
        onDragEnd={handleViewportDragEnd}
      >
        {editor && bubbleState.visible && (bubbleState.mode === "text" || bubbleState.mode === "image") ? (
          <FloatingBubbleToolbar
            data-anchor={bubbleState.anchor}
            onPointerEnter={() => {
              bubbleToolbarHoveredRef.current = true
              cancelBubbleHide()
            }}
            onPointerLeave={() => {
              bubbleToolbarHoveredRef.current = false
              scheduleBubbleHide()
            }}
            style={{
              left: `${bubbleState.left}px`,
              top: `${bubbleState.top}px`,
            }}
          >
            {bubbleState.mode === "text" ? (
              <TextBubbleToolbar data-testid="editor-text-bubble-toolbar">
                <TextBubbleDisclosure ref={bubbleTextStyleMenuRef} open={isBubbleTextStyleMenuOpen}>
                  <summary
                    aria-label="글자 크기"
                    title="글자 크기"
                    data-active={activeInlineTextStyleOption.id !== "paragraph"}
                    onMouseDown={handleToolbarButtonMouseDown}
                    onClick={(event: ReactMouseEvent<HTMLElement>) => {
                      event.preventDefault()
                      setIsBubbleTextStyleMenuOpen((prev) => !prev)
                      setIsBubbleInlineColorMenuOpen(false)
                    }}
                  >
                    <TextBubbleTextStyleTrigger>{activeInlineTextStyleOption.shortLabel}</TextBubbleTextStyleTrigger>
                  </summary>
                  {isBubbleTextStyleMenuOpen ? (
                    <div className="body">
                      {INLINE_TEXT_STYLE_OPTIONS.map((option) => (
                        <TextBubbleMenuButton
                          key={option.id}
                          type="button"
                          data-active={activeInlineTextStyleOption.id === option.id}
                          onClick={() => applyInlineTextStyle(option.id)}
                        >
                          <span>{option.shortLabel}</span>
                          <strong>{option.label}</strong>
                        </TextBubbleMenuButton>
                      ))}
                    </div>
                  ) : null}
                </TextBubbleDisclosure>

                <TextBubbleDisclosure ref={bubbleInlineColorMenuRef} open={isBubbleInlineColorMenuOpen}>
                  <summary
                    aria-label="글자색"
                    title="글자색"
                    data-active={Boolean(activeInlineColor)}
                    onMouseDown={handleToolbarButtonMouseDown}
                    onClick={(event: ReactMouseEvent<HTMLElement>) => {
                      event.preventDefault()
                      setIsBubbleInlineColorMenuOpen((prev) => !prev)
                      setIsBubbleTextStyleMenuOpen(false)
                    }}
                  >
                    <TextBubbleColorTrigger>
                      <span>A</span>
                      <i style={activeInlineColor ? { background: activeInlineColor } : undefined} aria-hidden="true" />
                    </TextBubbleColorTrigger>
                  </summary>
                  {isBubbleInlineColorMenuOpen ? (
                    <div className="body">
                      <TextBubbleMenuButton type="button" data-active={!activeInlineColor} onClick={() => applyInlineColor(null)}>
                        <TextBubbleColorSwatch data-empty="true" aria-hidden="true" />
                        <strong>기본색</strong>
                      </TextBubbleMenuButton>
                      {INLINE_TEXT_COLOR_OPTIONS.map((option) => (
                        <TextBubbleMenuButton
                          key={option.value}
                          type="button"
                          data-active={activeInlineColor === option.value}
                          disabled={disabled || isInlineCodeActive}
                          onClick={() => applyInlineColor(option.value)}
                        >
                          <TextBubbleColorSwatch style={{ background: option.value }} aria-hidden="true" />
                          <strong>{option.label}</strong>
                        </TextBubbleMenuButton>
                      ))}
                    </div>
                  ) : null}
                </TextBubbleDisclosure>

                <TextBubbleDivider aria-hidden="true" />

                <TextBubbleIconButton
                  type="button"
                  data-active={editor.isActive("bold")}
                  aria-label="굵게"
                  title="굵게"
                  onMouseDown={handleToolbarButtonMouseDown}
                  onClick={runBoldAction}
                >
                  <span>B</span>
                </TextBubbleIconButton>
                <TextBubbleIconButton
                  type="button"
                  data-active={editor.isActive("italic")}
                  aria-label="기울임"
                  title="기울임"
                  onMouseDown={handleToolbarButtonMouseDown}
                  onClick={runItalicAction}
                >
                  <AppIcon name="italic" aria-hidden="true" />
                </TextBubbleIconButton>
                <TextBubbleIconButton
                  type="button"
                  data-active={editor.isActive("strike")}
                  aria-label="취소선"
                  title="취소선"
                  onMouseDown={handleToolbarButtonMouseDown}
                  onClick={runStrikeAction}
                >
                  <span style={{ textDecoration: "line-through" }}>S</span>
                </TextBubbleIconButton>
                <TextBubbleIconButton
                  type="button"
                  data-active={editor.isActive("link")}
                  aria-label="링크"
                  title="링크"
                  onMouseDown={handleToolbarButtonMouseDown}
                  onClick={openLinkPrompt}
                >
                  <AppIcon name="link" aria-hidden="true" />
                </TextBubbleIconButton>
                <TextBubbleDivider aria-hidden="true" />
                <TextBubbleIconButton
                  type="button"
                  data-active={editor.isActive("code")}
                  aria-label="인라인 코드"
                  title="인라인 코드"
                  onMouseDown={handleToolbarButtonMouseDown}
                  onClick={runInlineCodeAction}
                >
                  <span>&lt;/&gt;</span>
                </TextBubbleIconButton>
                <TextBubbleIconButton
                  type="button"
                  data-active={editor.isActive("inlineFormula")}
                  aria-label="인라인 수식"
                  title="인라인 수식"
                  onMouseDown={handleToolbarButtonMouseDown}
                  onClick={insertInlineFormula}
                >
                  <span>√x</span>
                </TextBubbleIconButton>
              </TextBubbleToolbar>
            ) : bubbleState.mode === "image" ? (
              <BubbleToolbar>
                <ToolbarButton type="button" data-active={editor.getAttributes("resizableImage").align === "left"} onMouseDown={handleToolbarButtonMouseDown} onClick={() => editor.chain().focus().updateAttributes("resizableImage", { align: "left" }).run()}>
                  좌측
                </ToolbarButton>
                <ToolbarButton type="button" data-active={editor.getAttributes("resizableImage").align === "center"} onMouseDown={handleToolbarButtonMouseDown} onClick={() => editor.chain().focus().updateAttributes("resizableImage", { align: "center" }).run()}>
                  가운데
                </ToolbarButton>
                <ToolbarButton type="button" data-active={editor.getAttributes("resizableImage").align === "wide"} onMouseDown={handleToolbarButtonMouseDown} onClick={() => editor.chain().focus().updateAttributes("resizableImage", { align: "wide" }).run()}>
                  와이드
                </ToolbarButton>
                <ToolbarButton type="button" data-active={editor.getAttributes("resizableImage").align === "full"} onMouseDown={handleToolbarButtonMouseDown} onClick={() => editor.chain().focus().updateAttributes("resizableImage", { align: "full" }).run()}>
                  전체 폭
                </ToolbarButton>
              </BubbleToolbar>
            ) : null}
          </FloatingBubbleToolbar>
        ) : null}
        {tableColumnDragGuideState.visible ? (
          <TableColumnDragGuide
            data-testid="table-column-drag-guide"
            style={{
              left: `${tableColumnDragGuideState.left}px`,
              top: `${tableColumnDragGuideState.top}px`,
              height: `${tableColumnDragGuideState.height}px`,
            }}
          />
        ) : null}
        {shouldShowTableHandles
          ? !tableColumnDragGuideState.visible
            ? tableQuickRailState.columnSegments.slice(0, -1).map((segment, index) => (
              <TableColumnResizeBoundaryHandle
                key={`table-column-boundary-${index}`}
                type="button"
                data-testid={`table-column-resize-boundary-${index}`}
                aria-label={`열 ${index + 1} 경계 조절`}
                onPointerEnter={cancelTableQuickRailHide}
                onPointerLeave={() => {
                  if (!isTableMode && !tableMenuState) {
                    scheduleTableQuickRailHide()
                  }
                }}
                onPointerDown={(event: React.PointerEvent<HTMLButtonElement>) => {
                  event.preventDefault()
                  event.stopPropagation()
                  startTableColumnRailResize(
                    event.pointerId,
                    index,
                    event.clientX,
                    tableQuickRailState.tableLeft + segment.left + segment.width
                  )
                }}
                style={{
                  left: `${Math.round(tableQuickRailState.tableLeft + segment.left + segment.width)}px`,
                  top: `${Math.round(tableQuickRailState.tableTop)}px`,
                  height: `${Math.round(tableQuickRailState.height)}px`,
                }}
              />
              ))
            : null
          : null}
        {shouldShowTableHandles ? (
          <>
            {shouldShowTableColumnRail ? (
              <TableColumnRailTrack
                data-testid="table-column-rail-track"
                data-table-column-rail-track="true"
                onPointerEnter={cancelTableQuickRailHide}
                onPointerLeave={() => {
                  if (!isTableMode && !tableMenuState) {
                    scheduleTableQuickRailHide()
                  }
                }}
                style={{
                  left: `${desktopTableRailLayout?.trackLeft ?? tableQuickRailState.tableLeft}px`,
                  top: `${desktopTableRailLayout?.trackTop ?? Math.max(12, tableQuickRailState.tableTop - 18)}px`,
                  width: `${desktopTableRailTrackWidth}px`,
                }}
              >
                {tableQuickRailState.columnSegments.map((segment, index) => {
                  const isActive =
                    index === tableQuickRailState.columnIndex || isCurrentTableColumnSelection(index)

                  return (
                    <TableColumnRailSegment
                      key={`column-rail-${index}`}
                      type="button"
                      aria-label={`열 ${index + 1} 선택`}
                      data-testid={`table-column-rail-segment-${index}`}
                      data-active={isActive}
                      style={{
                        left: `${segment.left}px`,
                        width: `${segment.width}px`,
                      }}
                      onMouseDown={handleToolbarButtonMouseDown}
                      onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                        event.preventDefault()
                        event.stopPropagation()
                        handleTableColumnRailSegmentClick(index, event.currentTarget.getBoundingClientRect())
                      }}
                    >
                      {index < tableQuickRailState.columnSegments.length - 1 &&
                      !tableColumnDragGuideState.visible ? (
                        <TableColumnRailResizeHandle
                          role="presentation"
                          aria-hidden="true"
                          data-testid={`table-column-rail-resize-${index}`}
                          onClick={(event: ReactMouseEvent<HTMLSpanElement>) => {
                            event.preventDefault()
                            event.stopPropagation()
                          }}
                          onPointerDown={(event: React.PointerEvent<HTMLSpanElement>) => {
                            event.preventDefault()
                            event.stopPropagation()
                            startTableColumnRailResize(
                              event.pointerId,
                              index,
                              event.clientX,
                              tableQuickRailState.tableLeft + segment.left + segment.width
                            )
                          }}
                        />
                      ) : null}
                    </TableColumnRailSegment>
                  )
                })}
              </TableColumnRailTrack>
            ) : null}
            <TableCornerHandle
              data-table-corner-handle="true"
              data-testid="table-corner-handle"
              onPointerEnter={cancelTableQuickRailHide}
              onPointerLeave={() => {
                if (!isTableMode && !tableMenuState) {
                  scheduleTableQuickRailHide()
                }
              }}
              style={{
                left: `${desktopTableRailLayout?.cornerLeft ?? tableQuickRailState.left + 54}px`,
                top: `${desktopTableRailLayout?.cornerTop ?? Math.max(12, tableQuickRailState.top - 42)}px`,
              }}
            >
              <TableHandleButton
                type="button"
                data-variant="labeled"
                title="표 메뉴"
                aria-label="표 메뉴"
                onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                  event.preventDefault()
                  event.stopPropagation()
                  openSelectionAwareTableMenu("table", event.currentTarget.getBoundingClientRect())
                }}
              >
                <TableHandleIcon kind="table" />
                <TableQuickRailLabel>표 메뉴</TableQuickRailLabel>
              </TableHandleButton>
            </TableCornerHandle>
            {!shouldShowTableColumnRail ? (
              <TableAxisRail
                data-testid="table-column-rail"
                data-table-axis-rail="true"
                data-axis="column"
                onPointerEnter={cancelTableQuickRailHide}
                onPointerLeave={() => {
                  if (!isTableMode && !tableMenuState) {
                    scheduleTableQuickRailHide()
                  }
                }}
                style={{
                  left: `${
                    desktopTableRailLayout?.columnRailLeft ??
                    Math.max(tableQuickRailState.left + 108, tableQuickRailState.columnLeft - 22)
                  }px`,
                  top: `${desktopTableRailLayout?.columnRailTop ?? Math.max(12, tableQuickRailState.top - 42)}px`,
                }}
              >
                <TableQuickRailButton
                  type="button"
                  data-variant="labeled"
                  title="열 추가/삭제"
                  aria-label="열 추가/삭제"
                  onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                    event.preventDefault()
                    event.stopPropagation()
                    openSelectionAwareTableMenu("column", event.currentTarget.getBoundingClientRect())
                  }}
                >
                  <TableHandleIcon kind="column" />
                  <TableQuickRailLabel>열 메뉴</TableQuickRailLabel>
                </TableQuickRailButton>
                <TableQuickAddButton
                  type="button"
                  title="열 추가"
                  aria-label="열 추가"
                  onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                    event.preventDefault()
                    event.stopPropagation()
                    runTableMenuEditorAction((activeEditor) => {
                      activeEditor.chain().focus().addColumnAfter().run()
                    })
                  }}
                >
                  + 열
                </TableQuickAddButton>
              </TableAxisRail>
            ) : null}
            <TableAxisRail
              data-testid="table-row-rail"
              data-table-axis-rail="true"
              data-axis="row"
              onPointerEnter={cancelTableQuickRailHide}
              onPointerLeave={() => {
                if (!isTableMode && !tableMenuState) {
                  scheduleTableQuickRailHide()
                }
              }}
              style={{
                left: `${desktopTableRailLayout?.rowRailLeft ?? tableQuickRailState.left}px`,
                top: `${
                  desktopTableRailLayout?.rowRailTop ??
                  Math.max(
                    tableQuickRailState.top + 42,
                    tableQuickRailState.rowTop + Math.round(Math.max(0, tableQuickRailState.rowHeight / 2 - 16))
                  )
                }px`,
              }}
            >
              <TableQuickRailButton
                type="button"
                data-variant="labeled"
                title="행 메뉴"
                aria-label="행 메뉴"
                onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                  event.preventDefault()
                  event.stopPropagation()
                  openSelectionAwareTableMenu("row", event.currentTarget.getBoundingClientRect())
                }}
              >
                <TableHandleIcon kind="row" />
                <TableQuickRailLabel>행 메뉴</TableQuickRailLabel>
              </TableQuickRailButton>
              <TableQuickAddButton
                type="button"
                title="행 추가"
                aria-label="행 추가"
                onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                  event.preventDefault()
                  event.stopPropagation()
                  runTableMenuEditorAction((activeEditor) => {
                    activeEditor.chain().focus().addRowAfter().run()
                  })
                }}
              >
                + 행
              </TableQuickAddButton>
            </TableAxisRail>
          </>
        ) : null}
        {tableMenuState ? (
          <FloatingTableMenu
            data-table-menu-root="true"
            data-testid={`table-${tableMenuState.kind}-menu`}
            style={{
              left: `${tableMenuState.left}px`,
              top: `${tableMenuState.top}px`,
            }}
          >
            <FloatingBlockMenuHeader>
              {tableMenuState.kind === "row"
                ? "행 메뉴"
                : tableMenuState.kind === "column"
                  ? "열 메뉴"
                  : "표 메뉴"}
            </FloatingBlockMenuHeader>
            <FloatingBlockActionList>
              {tableMenuState.kind === "row" ? (
                <>
                  <FloatingBlockActionButton type="button" onClick={() => { selectCurrentTableAxis("row"); closeTableMenu() }}>
                    행 선택
                  </FloatingBlockActionButton>
                  <FloatingBlockActionButton
                    type="button"
                    onClick={() =>
                      runTableMenuEditorAction((activeEditor) => {
                        activeEditor.chain().focus().addRowBefore().run()
                      })
                    }
                  >
                    위에 삽입
                  </FloatingBlockActionButton>
                  <FloatingBlockActionButton
                    type="button"
                    onClick={() =>
                      runTableMenuEditorAction((activeEditor) => {
                        activeEditor.chain().focus().addRowAfter().run()
                      })
                    }
                  >
                    아래에 삽입
                  </FloatingBlockActionButton>
                </>
              ) : tableMenuState.kind === "column" ? (
                <>
                  <FloatingBlockActionButton type="button" onClick={() => { selectCurrentTableAxis("column"); closeTableMenu() }}>
                    열 선택
                  </FloatingBlockActionButton>
                  <FloatingBlockActionButton
                    type="button"
                    onClick={() =>
                      runTableMenuEditorAction((activeEditor) => {
                        activeEditor.chain().focus().addColumnBefore().run()
                      })
                    }
                  >
                    왼쪽에 삽입
                  </FloatingBlockActionButton>
                  <FloatingBlockActionButton
                    type="button"
                    onClick={() =>
                      runTableMenuEditorAction((activeEditor) => {
                        activeEditor.chain().focus().addColumnAfter().run()
                      })
                    }
                  >
                    오른쪽에 삽입
                  </FloatingBlockActionButton>
                </>
              ) : (
                <>
                  <FloatingBlockActionButton type="button" onClick={() => { selectActiveTableBlock(); closeTableMenu() }}>
                    표 선택
                  </FloatingBlockActionButton>
                  <FloatingBlockActionButton
                    type="button"
                    data-active={activeTableStructureState.hasHeaderRow}
                    onClick={() =>
                      runTableMenuEditorAction((activeEditor) => {
                        activeEditor.chain().focus().toggleHeaderRow().run()
                      })
                    }
                  >
                    제목 행
                  </FloatingBlockActionButton>
                  <FloatingBlockActionButton
                    type="button"
                    data-active={activeTableStructureState.hasHeaderColumn}
                    onClick={() =>
                      runTableMenuEditorAction((activeEditor) => {
                        activeEditor.chain().focus().toggleHeaderColumn().run()
                      })
                    }
                  >
                    제목 열
                  </FloatingBlockActionButton>
                  <FloatingBlockActionButton
                    type="button"
                    onClick={() =>
                      runTableMenuEditorAction((activeEditor) => {
                        activeEditor.chain().focus().mergeCells().run()
                      })
                    }
                  >
                    셀 병합
                  </FloatingBlockActionButton>
                  <FloatingBlockActionButton
                    type="button"
                    onClick={() =>
                      runTableMenuEditorAction((activeEditor) => {
                        activeEditor.chain().focus().splitCell().run()
                      })
                    }
                  >
                    셀 분리
                  </FloatingBlockActionButton>
                </>
              )}
            </FloatingBlockActionList>
            <FloatingBlockMenuDivider />
            <TableMenuSectionTitle>정렬</TableMenuSectionTitle>
            <TableMenuButtonRow>
              <ToolbarButton
                type="button"
                data-active={activeTableCellAttrs.textAlign === "left"}
                onMouseDown={handleToolbarButtonMouseDown}
                onClick={() => updateActiveTableCellAttrs({ textAlign: "left" })}
              >
                좌측
              </ToolbarButton>
              <ToolbarButton
                type="button"
                data-active={activeTableCellAttrs.textAlign === "center"}
                onMouseDown={handleToolbarButtonMouseDown}
                onClick={() => updateActiveTableCellAttrs({ textAlign: "center" })}
              >
                가운데
              </ToolbarButton>
              <ToolbarButton
                type="button"
                data-active={activeTableCellAttrs.textAlign === "right"}
                onMouseDown={handleToolbarButtonMouseDown}
                onClick={() => updateActiveTableCellAttrs({ textAlign: "right" })}
              >
                우측
              </ToolbarButton>
            </TableMenuButtonRow>
            <TableMenuSectionTitle>배경</TableMenuSectionTitle>
            <TableMenuButtonRow>
              <ToolbarButton
                type="button"
                data-active={activeTableCellAttrs.backgroundColor === "#f8fafc"}
                onMouseDown={handleToolbarButtonMouseDown}
                onClick={() => updateActiveTableCellAttrs({ backgroundColor: "#f8fafc" })}
              >
                기본
              </ToolbarButton>
              <ToolbarButton
                type="button"
                onMouseDown={handleToolbarButtonMouseDown}
                onClick={() => updateActiveTableCellAttrs({ backgroundColor: null })}
              >
                배경 해제
              </ToolbarButton>
            </TableMenuButtonRow>
            <TablePresetSwatches aria-label="표 셀 배경 preset">
              {TABLE_CELL_COLOR_PRESETS.map((preset) => (
                <TablePresetSwatch
                  key={preset.value}
                  type="button"
                  title={preset.label}
                  aria-label={`${preset.label} 배경`}
                  data-active={activeTableCellAttrs.backgroundColor === preset.value}
                  style={{ "--table-swatch-color": preset.value } as React.CSSProperties}
                  onClick={() => updateActiveTableCellAttrs({ backgroundColor: preset.value })}
                />
              ))}
              <TableColorInput
                type="color"
                aria-label="표 셀 배경색 선택"
                value={normalizeTableColorInputValue(activeTableCellAttrs.backgroundColor)}
                onChange={(event) =>
                  updateActiveTableCellAttrs({ backgroundColor: event.currentTarget.value })
                }
              />
            </TablePresetSwatches>
            <FloatingBlockMenuDivider />
            <FloatingBlockActionList>
              {tableMenuState.kind === "row" ? (
                <FloatingBlockActionButton
                  type="button"
                  data-variant="danger"
                  onClick={() =>
                    runTableMenuEditorAction((activeEditor) => {
                      activeEditor.chain().focus().deleteRow().run()
                    })
                  }
                >
                  행 삭제
                </FloatingBlockActionButton>
              ) : tableMenuState.kind === "column" ? (
                <FloatingBlockActionButton
                  type="button"
                  data-variant="danger"
                  onClick={() =>
                    runTableMenuEditorAction((activeEditor) => {
                      activeEditor.chain().focus().deleteColumn().run()
                    })
                  }
                >
                  열 삭제
                </FloatingBlockActionButton>
              ) : (
                <FloatingBlockActionButton
                  type="button"
                  data-variant="danger"
                  onClick={() =>
                    runTableMenuEditorAction((activeEditor) => {
                      activeEditor.chain().focus().deleteTable().run()
                    })
                  }
                >
                  표 삭제
                </FloatingBlockActionButton>
              )}
            </FloatingBlockActionList>
          </FloatingTableMenu>
        ) : null}
        {!isCoarsePointer ? (
          <BlockHandleRail
            ref={blockHandleRailRef}
            data-block-handle-rail="true"
            data-visible={blockHandleState.visible}
            onPointerEnter={() => {
              cancelHoveredBlockClear()
              setHoveredBlockIndex(blockHandleState.blockIndex)
            }}
            onPointerLeave={() => {
              scheduleHoveredBlockClear()
            }}
            style={{
              left: `${blockHandleState.left}px`,
              top: `${blockHandleState.top}px`,
            }}
          >
            <BlockHandleButton
              type="button"
              aria-label="블록 추가"
              title="블록 추가"
              onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                event.stopPropagation()
                openBlockMenu(blockHandleState.blockIndex, event.currentTarget.getBoundingClientRect())
              }}
            >
              <BlockHandlePlus aria-hidden="true">
                <span />
                <span />
              </BlockHandlePlus>
            </BlockHandleButton>
            <BlockHandleButton
              type="button"
              aria-label="블록 이동"
              title="블록 이동"
              data-variant="drag"
              data-testid={blockHandleState.visible ? "block-drag-handle" : undefined}
              onMouseDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                event.preventDefault()
                event.stopPropagation()
                clearPendingBlockDrag()
                promoteTopLevelBlockSelection(blockHandleState.blockIndex)
              }}
              onPointerDown={(event) => {
                if (event.button !== 0) return
                event.preventDefault()
                event.stopPropagation()
                const sourceIndex = blockHandleState.blockIndex
                const sourceElement = getTopLevelBlockElementByIndex(sourceIndex)
                const sourceRect = sourceElement?.getBoundingClientRect()
                const previewWidth = sourceRect
                  ? Math.round(Math.min(Math.max(sourceRect.width, 320), Math.max(320, window.innerWidth - 48)))
                  : 480
                const previewHeight = sourceRect ? Math.round(Math.min(Math.max(sourceRect.height, 44), 320)) : 120
                const previewLabel = sourceElement?.textContent?.trim().slice(0, 100) || "블록 이동"
                const previewHtml = sourceElement?.innerHTML || `<p>${previewLabel}</p>`
                const pendingState: PendingBlockDragState = {
                  sourceIndex,
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startY: event.clientY,
                  previewWidth,
                  previewHeight,
                  previewHtml,
                  previewLabel,
                }
                clearPendingBlockDrag()
                pendingBlockDragRef.current = pendingState

                const DRAG_THRESHOLD_PX = 5

                const handlePendingPointerMove = (moveEvent: PointerEvent) => {
                  const pending = pendingBlockDragRef.current
                  if (!pending || moveEvent.pointerId !== pending.pointerId) return

                  const distance = Math.hypot(
                    moveEvent.clientX - pending.startX,
                    moveEvent.clientY - pending.startY
                  )
                  if (distance < DRAG_THRESHOLD_PX) return

                  promoteTopLevelBlockSelection(pending.sourceIndex)
                  clearPendingBlockDrag()
                  beginBlockDragFromPending(pending, moveEvent.clientX, moveEvent.clientY)
                }

                const handlePendingPointerDone = (doneEvent: PointerEvent) => {
                  const pending = pendingBlockDragRef.current
                  if (!pending || doneEvent.pointerId !== pending.pointerId) return
                  clearPendingBlockDrag()
                }

                window.addEventListener("pointermove", handlePendingPointerMove)
                window.addEventListener("pointerup", handlePendingPointerDone)
                window.addEventListener("pointercancel", handlePendingPointerDone)

                pendingBlockDragCleanupRef.current = () => {
                  window.removeEventListener("pointermove", handlePendingPointerMove)
                  window.removeEventListener("pointerup", handlePendingPointerDone)
                  window.removeEventListener("pointercancel", handlePendingPointerDone)
                }
              }}
            >
              <BlockHandleGrip aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </BlockHandleGrip>
            </BlockHandleButton>
          </BlockHandleRail>
        ) : null}
        {draggedBlockState && dragGhostPosition ? (
          <DraggedBlockGhost
            aria-hidden="true"
            data-testid="block-drag-ghost"
            style={{
              left: `${Math.round(dragGhostPosition.x + 18)}px`,
              top: `${Math.round(dragGhostPosition.y + 16)}px`,
              width: `${draggedBlockState.previewWidth}px`,
            }}
          >
            <DraggedBlockGhostBadge>
              <span aria-hidden="true">↕</span>
              <strong>글 옮기기</strong>
            </DraggedBlockGhostBadge>
            <DraggedBlockGhostCard
              style={{ maxHeight: `${draggedBlockState.previewHeight}px` }}
              dangerouslySetInnerHTML={{ __html: draggedBlockState.previewHtml }}
            />
          </DraggedBlockGhost>
        ) : null}
        {blockSelectionOverlayState.visible && !draggedBlockState && !draggedNestedListItemState ? (
          <BlockSelectionOverlay
            aria-hidden="true"
            data-testid="keyboard-block-selection-overlay"
            style={{
              left: `${blockSelectionOverlayState.left}px`,
              top: `${blockSelectionOverlayState.top}px`,
              width: `${blockSelectionOverlayState.width}px`,
              height: `${blockSelectionOverlayState.height}px`,
            }}
          />
        ) : null}
        {dropIndicatorState.visible ? (
          <BlockDropIndicator
            data-testid="block-drop-indicator"
            style={{
              left: `${dropIndicatorState.left}px`,
              top: `${dropIndicatorState.top}px`,
              width: `${dropIndicatorState.width}px`,
            }}
          />
        ) : null}
        {nestedListItemDropIndicatorState.visible ? (
          <BlockDropIndicator
            data-kind="task-item"
            style={{
              left: `${nestedListItemDropIndicatorState.left}px`,
              top: `${nestedListItemDropIndicatorState.top}px`,
              width: `${nestedListItemDropIndicatorState.width}px`,
            }}
          />
        ) : null}
        {isCoarsePointer && blockHandleState.visible ? (
          <MobileBlockActionBar
            style={{
              left: `${Math.max(16, blockHandleState.left + 54 + blockHandleState.width / 2)}px`,
              top: `${blockHandleState.bottom}px`,
              width: `${Math.min(blockHandleState.width, 520)}px`,
            }}
          >
            <ToolbarButton
              type="button"
              onMouseDown={handleToolbarButtonMouseDown}
              onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                event.stopPropagation()
                openBlockMenu(blockHandleState.blockIndex, event.currentTarget.getBoundingClientRect())
              }}
            >
              +
            </ToolbarButton>
            <ToolbarButton type="button" onMouseDown={handleToolbarButtonMouseDown} onClick={() => moveBlockByStep(blockHandleState.blockIndex, -1)}>
              위로
            </ToolbarButton>
            <ToolbarButton type="button" onMouseDown={handleToolbarButtonMouseDown} onClick={() => moveBlockByStep(blockHandleState.blockIndex, 1)}>
              아래로
            </ToolbarButton>
            <ToolbarButton type="button" onMouseDown={handleToolbarButtonMouseDown} onClick={() => duplicateBlock(blockHandleState.blockIndex)}>
              복제
            </ToolbarButton>
            <ToolbarButton type="button" data-variant="subtle-danger" onMouseDown={handleToolbarButtonMouseDown} onClick={() => deleteBlock(blockHandleState.blockIndex)}>
              삭제
            </ToolbarButton>
          </MobileBlockActionBar>
        ) : null}
        {blockMenuState ? (
          <FloatingBlockMenu
            data-block-menu-root="true"
            onPointerEnter={() => {
              cancelHoveredBlockClear()
              setHoveredBlockIndex(blockMenuState.blockIndex)
            }}
            onPointerLeave={() => {
              scheduleHoveredBlockClear()
            }}
            style={{
              left: `${blockMenuState.left}px`,
              top: `${blockMenuState.top}px`,
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <>
              <FloatingBlockMenuHeader>삽입</FloatingBlockMenuHeader>
              <FloatingBlockMenuGrid>
                {blockInsertCatalog.map((action) => (
                  <FloatingBlockMenuButton
                    key={action.id}
                    type="button"
                    disabled={action.disabled}
                    onClick={() => {
                      if (action.disabled) return
                      void action.insertAtBlock(blockMenuState.blockIndex)
                      closeBlockMenus()
                    }}
                  >
                    <strong>{action.label}</strong>
                    {action.helper ? <span>{action.helper}</span> : null}
                  </FloatingBlockMenuButton>
                ))}
              </FloatingBlockMenuGrid>
              <FloatingBlockMenuDivider />
              <FloatingBlockMenuHeader>이동 및 관리</FloatingBlockMenuHeader>
              <FloatingBlockActionList>
                <FloatingBlockActionButton type="button" onClick={() => moveBlockByStep(blockMenuState.blockIndex, -1)}>
                  위로 이동
                </FloatingBlockActionButton>
                <FloatingBlockActionButton type="button" onClick={() => moveBlockByStep(blockMenuState.blockIndex, 1)}>
                  아래로 이동
                </FloatingBlockActionButton>
                <FloatingBlockActionButton type="button" onClick={() => duplicateBlock(blockMenuState.blockIndex)}>
                  복제
                </FloatingBlockActionButton>
                <FloatingBlockActionButton type="button" data-variant="danger" onClick={() => deleteBlock(blockMenuState.blockIndex)}>
                  삭제
                </FloatingBlockActionButton>
              </FloatingBlockActionList>
            </>
          </FloatingBlockMenu>
        ) : null}
        <EditorContent
          editor={editor}
          data-testid="block-editor-content"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          data-gramm="false"
        />
      </EditorViewport>

      {preview ? (
        <AuxDisclosure open={isPreviewOpen}>
          <summary
            onClick={(event: ReactMouseEvent<HTMLElement>) => {
              event.preventDefault()
              setIsPreviewOpen((prev) => !prev)
            }}
          >
            <strong>공개 결과 미리보기</strong>
            <span>{isPreviewOpen ? "닫기" : "열기"}</span>
          </summary>
          {isPreviewOpen ? <div className="body">{preview}</div> : null}
        </AuxDisclosure>
      ) : null}
    </Shell>
  )
}

export default BlockEditorShell

const Shell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
`

const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.9rem;
  padding: 0 0 0.7rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  background: transparent;
`

const ToolbarActions = styled.div`
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
`

const ToolbarGroup = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.14rem;
`

const ToolbarSeparator = styled.span`
  width: 1px;
  height: 1.7rem;
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(148, 163, 184, 0.18)" : "rgba(15, 23, 42, 0.12)"};
`

const ToolbarMoreDisclosure = styled.details`
  position: relative;
  display: inline-flex;
  flex-direction: column;

  summary {
    list-style: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 0.8rem;
    border: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 1.3rem;
    font-weight: 700;
    cursor: pointer;
    transition: background-color 160ms ease, color 160ms ease;
  }

  summary:hover {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(148, 163, 184, 0.08)" : "rgba(15, 23, 42, 0.05)"};
    color: var(--color-gray12);
  }

  summary::-webkit-details-marker {
    display: none;
  }

  .body {
    position: absolute;
    top: calc(100% + 0.55rem);
    right: 0;
    z-index: 30;
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
    min-width: 16rem;
    padding: 0.8rem;
    border-radius: 1rem;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(12, 16, 22, 0.96)" : "rgba(255, 255, 255, 0.98)"};
    box-shadow: ${({ theme }) =>
      theme.scheme === "dark"
        ? "0 18px 40px rgba(3, 7, 18, 0.32)"
        : "0 18px 40px rgba(15, 23, 42, 0.12)"};
  }
`

const ToolbarColorDisclosure = styled.details`
  position: relative;
  display: inline-flex;
  flex-direction: column;

  summary {
    list-style: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2.7rem;
    height: 2.4rem;
    padding: 0 0.45rem;
    border-radius: 0.8rem;
    border: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    cursor: pointer;
    transition: background-color 160ms ease, color 160ms ease;
  }

  summary[data-active="true"] {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(148, 163, 184, 0.14)" : "rgba(15, 23, 42, 0.08)"};
    color: ${({ theme }) => theme.colors.gray12};
    box-shadow: inset 0 -1.5px 0
      ${({ theme }) =>
        theme.scheme === "dark" ? "rgba(226, 232, 240, 0.32)" : "rgba(15, 23, 42, 0.22)"};
  }

  summary:hover {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(148, 163, 184, 0.08)" : "rgba(15, 23, 42, 0.05)"};
    color: var(--color-gray12);
  }

  summary::-webkit-details-marker {
    display: none;
  }

  .body {
    position: absolute;
    top: calc(100% + 0.55rem);
    right: 0;
    z-index: 32;
    display: grid;
    gap: 0.42rem;
    min-width: 10.5rem;
    padding: 0.72rem;
    border-radius: 1rem;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(12, 16, 22, 0.96)" : "rgba(255, 255, 255, 0.98)"};
    box-shadow: ${({ theme }) =>
      theme.scheme === "dark"
        ? "0 18px 40px rgba(3, 7, 18, 0.32)"
        : "0 18px 40px rgba(15, 23, 42, 0.12)"};
  }
`

const ColorTriggerIcon = styled.span`
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  min-width: 1.15rem;

  span {
    font-size: 0.96rem;
    font-weight: 760;
    line-height: 1;
    letter-spacing: -0.02em;
  }

  i {
    display: block;
    width: 1rem;
    height: 0.18rem;
    border-radius: 999px;
    background: ${({ theme }) => theme.colors.gray8};
  }

  &[data-active="true"] i {
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08);
  }
`

const ColorOptionButton = styled.button`
  min-height: 2rem;
  border-radius: 0.8rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(18, 21, 26, 0.42)" : "rgba(255, 255, 255, 0.96)"};
  color: var(--color-gray12);
  padding: 0 0.72rem;
  text-align: left;

  &[data-active="true"] {
    border-color: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(59, 130, 246, 0.32)" : "rgba(37, 99, 235, 0.24)"};
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(37, 99, 235, 0.12)" : "rgba(37, 99, 235, 0.08)"};
  }

  &:disabled {
    opacity: 0.44;
    cursor: not-allowed;
  }
`

const ColorOptionLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.78rem;
  font-weight: 700;
`

const ColorOptionSwatch = styled.span`
  display: inline-flex;
  width: 0.92rem;
  height: 0.92rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray3};

  &[data-empty="true"] {
    position: relative;
    background: transparent;
  }

  &[data-empty="true"]::after {
    content: "";
    position: absolute;
    inset: 0.38rem -0.05rem auto -0.05rem;
    height: 1.5px;
    background: ${({ theme }) => theme.colors.gray10};
    transform: rotate(-34deg);
    transform-origin: center;
  }
`

const ToolbarRibbonButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.5rem;
  height: 2.4rem;
  padding: 0 0.58rem;
  border: 0;
  border-radius: 0.8rem;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 1.02rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
  transition: background-color 160ms ease, color 160ms ease;

  svg {
    width: 1.2rem;
    height: 1.2rem;
  }

  &[data-tone="heading"] {
    min-width: 3.1rem;
    color: ${({ theme }) => theme.colors.gray10};
    font-family: Georgia, "Times New Roman", serif;
    font-size: 1rem;
    font-weight: 700;
  }

  &[data-active="true"] {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(148, 163, 184, 0.14)" : "rgba(15, 23, 42, 0.08)"};
    color: ${({ theme }) => theme.colors.gray12};
    box-shadow: inset 0 -1.5px 0
      ${({ theme }) =>
        theme.scheme === "dark" ? "rgba(226, 232, 240, 0.32)" : "rgba(15, 23, 42, 0.22)"};
  }

  &:hover {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(148, 163, 184, 0.08)" : "rgba(15, 23, 42, 0.05)"};
    color: var(--color-gray12);
  }

  &:disabled {
    opacity: 0.44;
    cursor: not-allowed;
  }
`

const ToolbarButton = styled.button`
  min-height: 2rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(18, 21, 26, 0.42)" : "rgba(255, 255, 255, 0.96)"};
  color: var(--color-gray11);
  font-size: 0.78rem;
  font-weight: 700;
  padding: 0 0.82rem;

  &[data-active="true"] {
    border-color: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(59, 130, 246, 0.32)" : "rgba(37, 99, 235, 0.24)"};
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(37, 99, 235, 0.12)" : "rgba(37, 99, 235, 0.08)"};
    color: ${({ theme }) => (theme.scheme === "dark" ? "#bfdbfe" : theme.colors.blue8)};
  }

  &[data-variant="subtle-danger"] {
    border-color: rgba(248, 113, 113, 0.14);
    color: #fda4af;
  }

  &[data-variant="danger"] {
    border-color: rgba(248, 113, 113, 0.22);
    background: rgba(127, 29, 29, 0.12);
    color: #fecdd3;
  }

  &:disabled {
    opacity: 0.48;
    cursor: not-allowed;
  }
`

const HiddenFileInput = styled.input`
  display: none;
`

const TablePresetSwatches = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
`

const TablePresetSwatch = styled.button`
  --table-swatch-color: #dbeafe;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: var(--table-swatch-color);
  padding: 0;

  &[data-active="true"] {
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.28);
    border-color: rgba(59, 130, 246, 0.42);
  }
`

const TableColorInput = styled.input`
  width: 2.2rem;
  height: 2rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 999px;
  background: transparent;
  padding: 0.22rem;
`

const slashMenuFadeInFromBottom = keyframes`
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.985);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
`

const slashMenuFadeInFromTop = keyframes`
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.985);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
`

const SlashMenu = styled.div`
  position: fixed;
  z-index: 70;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  width: min(38rem, calc(100vw - 1.5rem));
  padding: 0.45rem 0.45rem 0.35rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 1rem;
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(28, 28, 28, 0.98)" : "rgba(255, 255, 255, 0.98)"};
  box-shadow: ${({ theme }) =>
    theme.scheme === "dark" ? "0 18px 36px rgba(0, 0, 0, 0.22)" : "0 18px 36px rgba(15, 23, 42, 0.14)"};
  backdrop-filter: blur(12px);
  transform-origin: top left;
  animation: ${slashMenuFadeInFromBottom} 140ms cubic-bezier(0.2, 0.8, 0.2, 1);
  transition: left 120ms cubic-bezier(0.2, 0.8, 0.2, 1), top 120ms cubic-bezier(0.2, 0.8, 0.2, 1),
    box-shadow 140ms ease, border-color 140ms ease;
  will-change: left, top, transform, opacity;

  &[data-placement="top"] {
    transform-origin: bottom left;
    animation-name: ${slashMenuFadeInFromTop};
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const SlashQuerySummary = styled.div`
  display: inline-flex;
  align-items: center;
  min-height: 2.35rem;
  border-radius: 0.75rem;
  border: 0;
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(255, 255, 255, 0.04)" : "rgba(15, 23, 42, 0.04)"};
  padding: 0 0.75rem;

  span {
    color: var(--color-gray10);
    font-size: 0.92rem;
    font-weight: 600;
  }
`

const SlashMenuBody = styled.div`
  display: grid;
  gap: 0.4rem;
  max-height: min(62vh, 30rem);
  overflow-y: auto;
  padding: 0.1rem 0.1rem 0.15rem 0;

  scrollbar-width: thin;

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(148, 163, 184, 0.28)" : "rgba(100, 116, 139, 0.24)"};
  }
`

const SlashMenuSection = styled.section`
  display: grid;
  gap: 0.15rem;

  & + & {
    margin-top: 0.15rem;
    padding-top: 0.55rem;
    border-top: 1px solid ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(255, 255, 255, 0.04)" : "rgba(15, 23, 42, 0.05)"};
  }
`

const SlashMenuSectionLabel = styled.strong`
  display: inline-flex;
  align-items: center;
  min-height: 1.2rem;
  padding: 0 0.5rem;
  color: var(--color-gray10);
  font-size: 0.74rem;
  font-weight: 800;
`

const SlashActionList = styled.div`
  display: grid;
  gap: 0.3rem;
`

const SlashActionIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.8rem;
  height: 1.8rem;
  border-radius: 0;
  border: 0;
  background: transparent;
  color: var(--color-gray12);
  font-size: 0.92rem;
  font-weight: 700;
  letter-spacing: -0.02em;
`

const SlashActionMain = styled.span`
  display: grid;
  gap: 0.02rem;
  text-align: left;

  strong {
    font-size: 0.88rem;
    color: var(--color-gray12);
    font-weight: 700;
  }

  span {
    color: var(--color-gray10);
    font-size: 0.75rem;
    line-height: 1.35;
  }
`

const SlashActionTitleRow = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  flex-wrap: wrap;
`

const SlashActionHint = styled.span`
  color: var(--color-gray10);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: -0.01em;
`

const SlashActionButton = styled.button`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.55rem;
  min-height: 2.7rem;
  border-radius: 0.75rem;
  border: 0;
  background: transparent;
  padding: 0.45rem 0.55rem;
  text-align: left;
  transition: background-color 120ms ease, color 120ms ease;

  &:hover:not(:disabled),
  &:focus-visible:not(:disabled) {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(255, 255, 255, 0.05)" : "rgba(15, 23, 42, 0.04)"};
  }

  &[data-active="true"] {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(255, 255, 255, 0.07)" : "rgba(15, 23, 42, 0.06)"};
  }

  &[data-active="true"][data-input-mode="keyboard"] {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.07)"};
  }

  &[data-active="true"][data-input-mode="pointer"] {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(255, 255, 255, 0.07)" : "rgba(15, 23, 42, 0.06)"};
  }

  &[data-active="true"] [data-role="slash-action-icon"] {
    color: ${({ theme }) => theme.colors.gray12};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

const SlashEmptyState = styled.div`
  display: grid;
  place-items: center;
  min-height: 6rem;
  border-radius: 0.75rem;
  border: 0;
  color: var(--color-gray10);
  font-size: 0.8rem;
  font-weight: 600;
`

const EditorViewport = styled.div`
  border: 0;
  border-radius: 0;
  background: transparent;
  overflow: hidden;

  &[data-row-resize-hot="true"] {
    cursor: row-resize;
  }

  .aq-block-editor__content {
    min-width: 0;
    min-height: 32rem;
    padding: 1.1rem 0 1.8rem;
    outline: none;
    overflow-x: hidden;
  }

  ${({ theme }) => markdownContentTypography(".aq-block-editor__content", theme)}

  .aq-block-editor__content > * {
    width: 100%;
    max-width: var(--compose-pane-readable-width, var(--article-readable-width, 48rem));
    min-width: 0;
    margin-left: auto;
    margin-right: auto;
    border-radius: 0.9rem;
    transition:
      background-color 140ms ease,
      box-shadow 140ms ease,
      transform 140ms ease,
      opacity 140ms ease;
  }

  .aq-block-editor__content h1,
  .aq-block-editor__content h2,
  .aq-block-editor__content h3,
  .aq-block-editor__content h4 {
    text-align: left !important;
  }

  .aq-block-editor__content blockquote {
    width: 100%;
    max-width: var(--compose-pane-readable-width, var(--article-readable-width, 48rem));
    box-sizing: border-box;
    margin: 0.95rem auto;
    padding: 0.12rem 0 0.12rem 1rem;
    border-left: 4px solid ${({ theme }) => theme.colors.gray7};
    border-radius: 0;
    background: transparent !important;
    color: ${({ theme }) => theme.colors.gray11};
    box-shadow: none;
  }

  .aq-block-editor__content blockquote > :first-of-type {
    margin-top: 0;
  }

  .aq-block-editor__content blockquote > :last-child {
    margin-bottom: 0;
  }

  .aq-block-editor__content > blockquote[data-block-hovered="true"],
  .aq-block-editor__content > blockquote[data-block-selected="true"],
  .aq-block-editor__content > blockquote[data-block-dragging="true"] {
    background: transparent !important;
    box-shadow: none;
  }

  .aq-block-editor__content .aq-code-editor-content,
  .aq-block-editor__content .aq-code-editor-content > div {
    text-align: left;
    white-space: pre;
    overflow-wrap: normal;
    word-break: normal;
  }

  .aq-block-editor__content .aq-code-shell {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    touch-action: pan-x;
  }

  .aq-block-editor__content > *[data-block-hovered="true"] {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(59, 130, 246, 0.08)" : "rgba(59, 130, 246, 0.08)"};
    box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.18);
  }

  .aq-block-editor__content > *[data-block-selected="true"] {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(59, 130, 246, 0.12)" : "rgba(59, 130, 246, 0.1)"};
    box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.24);
  }

  .aq-block-editor__content > *[data-block-dragging="true"] {
    opacity: 0.34;
    transform: scale(0.994);
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(59, 130, 246, 0.14)" : "rgba(59, 130, 246, 0.12)"};
    box-shadow:
      inset 0 0 0 1px rgba(59, 130, 246, 0.28),
      0 0 0 1px rgba(59, 130, 246, 0.2);
    filter: saturate(0.9);
  }

  .aq-block-editor__content p.is-editor-empty:first-of-type::before {
    content: attr(data-placeholder);
    color: var(--color-gray10);
    float: left;
    height: 0;
    pointer-events: none;
  }

  .aq-block-editor__content ::selection {
    background: rgba(59, 130, 246, 0.24);
    color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray12 : "#ffffff")};
  }

  .aq-block-editor__content[data-keyboard-block-selection="true"] ::selection {
    background: transparent;
    color: inherit;
  }

  .aq-block-editor__content pre {
    overflow: auto;
    border-radius: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.03);
    color: var(--color-gray12);
    padding: 1rem 1.1rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
      "Courier New", monospace;
    font-size: 0.88rem;
    line-height: 1.65;
  }

  .aq-block-editor__content code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
      "Courier New", monospace;
    font-size: 0.92em;
    line-height: inherit;
    border-radius: 0.42rem;
    background: rgba(255, 255, 255, 0.075);
    color: #ff6b6b;
    padding: 0.14em 0.4em 0.16em;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
    letter-spacing: -0.01em;
  }

  .aq-block-editor__content pre code {
    font-size: inherit;
    line-height: inherit;
    border-radius: 0;
    background: transparent;
    color: inherit;
    padding: 0;
    box-shadow: none;
    letter-spacing: 0;
  }

  .aq-block-editor__content ul[data-type="taskList"],
  .aq-block-editor__content ul[data-task-list="true"] {
    width: 100%;
    max-width: var(--compose-pane-readable-width, var(--article-readable-width, 48rem));
    list-style: none;
    padding-left: 0;
  }

  .aq-block-editor__content li[data-type="taskItem"],
  .aq-block-editor__content li[data-task-item="true"] {
    display: flex;
    align-items: flex-start;
    gap: 0.72rem;
    margin: 0.45rem 0;
    cursor: grab;
    border-radius: 0.8rem;
    transition:
      background-color 140ms ease,
      box-shadow 140ms ease;
  }

  .aq-block-editor__content li[data-type="taskItem"]:active,
  .aq-block-editor__content li[data-task-item="true"]:active {
    cursor: grabbing;
  }

  .aq-block-editor__content li[data-type="taskItem"]:hover,
  .aq-block-editor__content li[data-task-item="true"]:hover {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(59, 130, 246, 0.06)" : "rgba(59, 130, 246, 0.06)"};
    box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.14);
  }

  .aq-block-editor__content li[data-type="taskItem"] > label,
  .aq-block-editor__content li[data-task-item="true"] > label {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-top: 0.12rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .aq-block-editor__content li[data-type="taskItem"] > label input[type="checkbox"],
  .aq-block-editor__content li[data-task-item="true"] > label input[type="checkbox"] {
    margin: 0.22rem 0 0;
    width: 0.95rem;
    height: 0.95rem;
    accent-color: ${({ theme }) => (theme.scheme === "dark" ? "#4493f8" : "#0969da")};
  }

  .aq-block-editor__content li[data-type="taskItem"] > div,
  .aq-block-editor__content li[data-task-item="true"] > div {
    flex: 1;
    min-width: 0;
  }

  .aq-block-editor__content li[data-type="taskItem"] > div > :first-child,
  .aq-block-editor__content li[data-task-item="true"] > div > :first-child {
    margin-top: 0;
  }

  .aq-block-editor__content li[data-type="taskItem"] > div > :last-child,
  .aq-block-editor__content li[data-task-item="true"] > div > :last-child {
    margin-bottom: 0;
  }

  .aq-block-editor__content table {
    width: 100%;
    min-width: 100%;
    max-width: 100%;
    margin: 0;
    border-collapse: separate;
    border-spacing: 0;
    table-layout: fixed;
    background: transparent;
  }

  .aq-block-editor__content .tableWrapper > table {
    width: 100% !important;
    min-width: 100% !important;
    max-width: 100% !important;
    table-layout: fixed !important;
  }

  .aq-block-editor__content .tableWrapper {
    display: block;
    position: relative;
    isolation: isolate;
    inline-size: 100%;
    width: 100%;
    max-width: 100%;
    max-inline-size: 100%;
    min-width: 0;
    box-sizing: border-box;
    overflow-x: auto;
    overflow-y: hidden;
    margin: 1rem 0;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    border-radius: 16px;
    background: ${({ theme }) =>
      theme.scheme === "dark"
        ? "linear-gradient(180deg, rgba(18, 22, 29, 0.96), rgba(15, 18, 24, 0.96))"
        : "linear-gradient(180deg, #ffffff, #fbfcfe)"};
    box-shadow: ${({ theme }) =>
      theme.scheme === "dark"
        ? "0 18px 38px rgba(2, 6, 23, 0.28)"
        : "0 18px 38px rgba(15, 23, 42, 0.08)"};
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    overscroll-behavior-y: contain;
    touch-action: pan-x;
    transition:
      border-color 140ms ease,
      box-shadow 140ms ease,
      background 140ms ease;
  }

  .aq-block-editor__content .tableWrapper:hover {
    border-color: rgba(59, 130, 246, 0.24);
    box-shadow:
      ${({ theme }) =>
        theme.scheme === "dark"
          ? "0 18px 38px rgba(2, 6, 23, 0.28)"
          : "0 18px 38px rgba(15, 23, 42, 0.08)"},
      0 0 0 1px rgba(59, 130, 246, 0.12);
  }

  .aq-block-editor__content .tableWrapper[data-overflow-mode="wide"] {
    display: block;
    inline-size: 100%;
    width: 100%;
    max-width: 100%;
    max-inline-size: 100%;
  }

  .aq-block-editor__content .tableWrapper > table[data-overflow-mode="wide"] {
    width: max-content !important;
    min-width: 100% !important;
    max-width: none !important;
    table-layout: fixed !important;
  }

  .aq-block-editor__content thead th {
    background: ${({ theme }) => theme.colors.gray3};
    font-weight: 700;
    border-bottom: 2px solid
      ${({ theme }) => (theme.scheme === "dark" ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.16)")};
  }

  .aq-block-editor__content th,
  .aq-block-editor__content td {
    border-right: 1px solid ${({ theme }) => theme.colors.gray6};
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
    padding: 0.78rem 0.92rem;
    text-align: left;
    vertical-align: top;
    position: relative;
    min-width: max(${TABLE_MIN_COLUMN_WIDTH_PX}px, 10ch);
    min-height: ${TABLE_MIN_ROW_HEIGHT_PX}px;
    white-space: normal;
    overflow-wrap: break-word;
    word-break: normal;
    background: transparent;
  }

  .aq-block-editor__content tr > :is(th, td):last-child {
    border-right: 0;
  }

  .aq-block-editor__content .tableWrapper > table[data-overflow-mode="wide"] :is(th, td) {
    min-width: max(${TABLE_WIDE_COLUMN_MIN_WIDTH_PX}px, 12ch);
    white-space: normal;
    overflow-wrap: break-word;
    word-break: normal;
  }

  .aq-block-editor__content tbody tr:last-child > :is(td, th) {
    border-bottom: 0;
  }

  .aq-block-editor__content tr[data-row-resize-active="true"] > :is(td, th) {
    box-shadow: inset 0 -2px 0 rgba(96, 165, 250, 0.5);
  }

  .aq-block-editor__content .selectedCell::after {
    background: rgba(148, 163, 184, 0.12);
  }

  .aq-block-editor__content .column-resize-handle {
    display: none !important;
    pointer-events: none !important;
  }

  .aq-block-editor__content.resize-cursor {
    cursor: col-resize;
  }

  @media (max-width: 768px) {
    .aq-block-editor__content table {
      width: 100%;
      min-width: 100%;
      max-width: 100%;
      table-layout: fixed;
    }

    .aq-block-editor__content th,
    .aq-block-editor__content td {
      font-size: 0.95rem;
      line-height: 1.58;
      padding: 0.66rem 0.72rem;
      white-space: normal;
      overflow-wrap: break-word;
      word-break: normal;
    }

    .aq-block-editor__content .tableWrapper {
      margin: 0.9rem 0;
      max-inline-size: 100%;
    }
  }
`

const BubbleToolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 0.35rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 0.9rem;
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(15, 18, 24, 0.96)" : "rgba(255, 255, 255, 0.98)"};
  box-shadow: ${({ theme }) =>
    theme.scheme === "dark" ? "0 10px 18px rgba(0, 0, 0, 0.16)" : "0 10px 18px rgba(15, 23, 42, 0.1)"};

  &[data-layout="table"] {
    max-width: min(92vw, 40rem);
  }
`

const TextBubbleToolbar = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  padding: 0.38rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 0.95rem;
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(28, 28, 28, 0.98)" : "rgba(255, 255, 255, 0.98)"};
  box-shadow: ${({ theme }) =>
    theme.scheme === "dark" ? "0 16px 30px rgba(0, 0, 0, 0.26)" : "0 16px 30px rgba(15, 23, 42, 0.16)"};
  backdrop-filter: blur(10px);
`

const TextBubbleIconButton = styled.button`
  min-width: 2.05rem;
  height: 2.05rem;
  padding: 0 0.46rem;
  border-radius: 0.62rem;
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.95rem;
  font-weight: 730;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color 140ms ease, color 140ms ease;

  svg {
    width: 1.02rem;
    height: 1.02rem;
  }

  &[data-active="true"] {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(148, 163, 184, 0.16)" : "rgba(15, 23, 42, 0.09)"};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &:hover {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(148, 163, 184, 0.1)" : "rgba(15, 23, 42, 0.06)"};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

const TextBubbleDivider = styled.span`
  width: 1px;
  height: 1.35rem;
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(148, 163, 184, 0.22)" : "rgba(15, 23, 42, 0.16)"};
`

const TextBubbleDisclosure = styled.details`
  position: relative;
  display: inline-flex;
  flex-direction: column;

  summary {
    list-style: none;
    min-width: 2.05rem;
    height: 2.05rem;
    padding: 0 0.46rem;
    border-radius: 0.62rem;
    border: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background-color 140ms ease, color 140ms ease;
  }

  summary[data-active="true"] {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(148, 163, 184, 0.16)" : "rgba(15, 23, 42, 0.09)"};
    color: ${({ theme }) => theme.colors.gray12};
  }

  summary:hover {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(148, 163, 184, 0.1)" : "rgba(15, 23, 42, 0.06)"};
    color: ${({ theme }) => theme.colors.gray12};
  }

  summary::-webkit-details-marker {
    display: none;
  }

  .body {
    position: absolute;
    top: calc(100% + 0.42rem);
    left: 0;
    z-index: 72;
    display: grid;
    gap: 0.35rem;
    min-width: 9rem;
    padding: 0.5rem;
    border-radius: 0.8rem;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(28, 28, 28, 0.98)" : "rgba(255, 255, 255, 0.99)"};
    box-shadow: ${({ theme }) =>
      theme.scheme === "dark" ? "0 16px 30px rgba(0, 0, 0, 0.26)" : "0 16px 30px rgba(15, 23, 42, 0.16)"};
  }
`

const TextBubbleTextStyleTrigger = styled.span`
  font-size: 0.9rem;
  font-weight: 760;
  letter-spacing: -0.01em;
`

const TextBubbleColorTrigger = styled.span`
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;

  span {
    font-size: 0.92rem;
    font-weight: 760;
    line-height: 1;
    letter-spacing: -0.01em;
  }

  i {
    width: 0.92rem;
    height: 0.15rem;
    border-radius: 999px;
    background: ${({ theme }) => theme.colors.gray8};
  }
`

const TextBubbleColorSwatch = styled.span`
  display: inline-flex;
  width: 0.82rem;
  height: 0.82rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray3};

  &[data-empty="true"] {
    position: relative;
    background: transparent;
  }

  &[data-empty="true"]::after {
    content: "";
    position: absolute;
    inset: 0.35rem -0.08rem auto -0.08rem;
    height: 1.4px;
    background: ${({ theme }) => theme.colors.gray10};
    transform: rotate(-34deg);
    transform-origin: center;
  }
`

const TextBubbleMenuButton = styled.button`
  min-height: 1.92rem;
  border-radius: 0.62rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(18, 21, 26, 0.52)" : "rgba(255, 255, 255, 0.98)"};
  color: var(--color-gray12);
  padding: 0 0.58rem;
  display: inline-flex;
  align-items: center;
  gap: 0.46rem;
  text-align: left;
  font-size: 0.76rem;

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-weight: 700;
  }

  strong {
    font-weight: 700;
  }

  &[data-active="true"] {
    border-color: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(59, 130, 246, 0.34)" : "rgba(37, 99, 235, 0.25)"};
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(37, 99, 235, 0.12)" : "rgba(37, 99, 235, 0.09)"};
  }

  &:hover {
    border-color: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(148, 163, 184, 0.3)" : "rgba(15, 23, 42, 0.22)"};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

const FloatingBubbleToolbar = styled.div`
  position: fixed;
  z-index: 60;
  transform: translate(-50%, calc(-100% - 0.65rem));
  pointer-events: none;

  &[data-anchor="left"] {
    transform: translate(0, calc(-100% - 0.65rem));
  }

  > * {
    pointer-events: auto;
  }
`

type TableHandleIconKind = "table" | "row" | "column"

const TableHandleIcon = ({ kind }: { kind: TableHandleIconKind }) => {
  if (kind === "table") {
    return (
      <TableHandleIconSvg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <rect x="2" y="2" width="5" height="5" rx="0.8" />
        <rect x="9" y="2" width="5" height="5" rx="0.8" />
        <rect x="2" y="9" width="5" height="5" rx="0.8" />
        <rect x="9" y="9" width="5" height="5" rx="0.8" />
      </TableHandleIconSvg>
    )
  }

  if (kind === "column") {
    return (
      <TableHandleIconSvg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <line x1="3" y1="2.5" x2="3" y2="13.5" />
        <line x1="8" y1="2.5" x2="8" y2="13.5" />
        <line x1="13" y1="2.5" x2="13" y2="13.5" />
      </TableHandleIconSvg>
    )
  }

  return (
    <TableHandleIconSvg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <line x1="2.5" y1="3" x2="13.5" y2="3" />
      <line x1="2.5" y1="8" x2="13.5" y2="8" />
      <line x1="2.5" y1="13" x2="13.5" y2="13" />
    </TableHandleIconSvg>
  )
}

const TableHandleIconSvg = styled.svg`
  width: 0.95rem;
  height: 0.95rem;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
`

const TableAxisRail = styled.div`
  position: fixed;
  z-index: 58;
  display: flex;
  align-items: center;
  gap: 0.28rem;
  pointer-events: auto;

  &[data-axis="column"] {
    flex-direction: row;
    justify-content: flex-start;
  }

  &[data-axis="row"] {
    flex-direction: column;
    justify-content: flex-start;
  }
`

const TableCornerHandle = styled.div`
  position: fixed;
  z-index: 58;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
`

const TableColumnRailTrack = styled.div`
  position: fixed;
  z-index: 57;
  height: 0.72rem;
  overflow: visible;
  user-select: none;
  -webkit-user-select: none;
  border-radius: 999px;
  border: 1px solid
    ${({ theme }) => (theme.scheme === "dark" ? "rgba(71, 85, 105, 0.48)" : "rgba(148, 163, 184, 0.42)")};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(15, 23, 42, 0.84)" : "rgba(248, 250, 252, 0.96)"};
  box-shadow: ${({ theme }) =>
    theme.scheme === "dark" ? "0 10px 24px rgba(2, 6, 23, 0.2)" : "0 10px 24px rgba(15, 23, 42, 0.08)"};
  pointer-events: auto;
`

const TableColumnRailSegment = styled.button`
  all: unset;
  box-sizing: border-box;
  position: absolute;
  top: 1px;
  bottom: 1px;
  user-select: none;
  -webkit-user-select: none;
  border-radius: 999px;
  background: ${({ theme }) => (theme.scheme === "dark" ? "rgba(148, 163, 184, 0.18)" : "rgba(148, 163, 184, 0.16)")};
  transition: background-color 120ms ease, transform 120ms ease;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => (theme.scheme === "dark" ? "rgba(148, 163, 184, 0.24)" : "rgba(148, 163, 184, 0.22)")};
  }

  &[data-active="true"] {
    background: rgba(59, 130, 246, 0.34);
  }

  &::after {
    content: "";
    position: absolute;
    top: 0;
    right: -1px;
    bottom: 0;
    width: 1px;
    background: ${({ theme }) => (theme.scheme === "dark" ? "rgba(148, 163, 184, 0.2)" : "rgba(100, 116, 139, 0.18)")};
  }

  &:last-child::after {
    display: none;
  }
`

const TableColumnRailResizeHandle = styled.span`
  position: absolute;
  top: -0.35rem;
  right: -0.44rem;
  bottom: -0.35rem;
  width: 0.88rem;
  user-select: none;
  -webkit-user-select: none;
  cursor: col-resize;
  opacity: 0.82;
  transition: opacity 120ms ease;

  &::before {
    content: "";
    position: absolute;
    top: 0.22rem;
    bottom: 0.22rem;
    left: 50%;
    width: 2px;
    transform: translateX(-50%);
    border-radius: 999px;
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(191, 219, 254, 0.9)" : "rgba(37, 99, 235, 0.72)"};
    box-shadow: ${({ theme }) =>
      theme.scheme === "dark" ? "0 0 0 1px rgba(15, 23, 42, 0.28)" : "0 0 0 1px rgba(255, 255, 255, 0.72)"};
  }

  ${TableColumnRailSegment}:hover &,
  ${TableColumnRailSegment}[data-active="true"] & {
    opacity: 1;
  }
`

const TableColumnDragGuide = styled.div`
  position: fixed;
  z-index: 57;
  width: 2px;
  margin-left: -1px;
  pointer-events: none;
  border-radius: 999px;
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(96, 165, 250, 0.9)" : "rgba(37, 99, 235, 0.82)"};
  box-shadow: ${({ theme }) =>
    theme.scheme === "dark"
      ? "0 0 0 1px rgba(15, 23, 42, 0.36), 0 0 0 6px rgba(59, 130, 246, 0.16)"
      : "0 0 0 1px rgba(255, 255, 255, 0.72), 0 0 0 6px rgba(59, 130, 246, 0.12)"};
`

const TableColumnResizeBoundaryHandle = styled.button`
  position: fixed;
  z-index: 56;
  width: 18px;
  margin-left: -9px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: col-resize;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;

  &::before {
    content: "";
    position: absolute;
    top: 10px;
    bottom: 10px;
    left: 50%;
    width: 2px;
    transform: translateX(-50%);
    border-radius: 999px;
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(191, 219, 254, 0.22)" : "rgba(37, 99, 235, 0.2)"};
    opacity: 0;
    transition:
      opacity 120ms ease,
      background-color 120ms ease,
      box-shadow 120ms ease;
  }

  &:hover::before,
  &:focus-visible::before {
    opacity: 1;
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(96, 165, 250, 0.62)" : "rgba(37, 99, 235, 0.56)"};
    box-shadow: ${({ theme }) =>
      theme.scheme === "dark"
        ? "0 0 0 1px rgba(15, 23, 42, 0.24)"
        : "0 0 0 1px rgba(255, 255, 255, 0.72)"};
  }
`

const TableQuickRailButton = styled.button`
  all: unset;
  position: relative;
  box-sizing: border-box;
  width: 2rem;
  height: 2rem;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.65rem;
  border: 1px solid ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(148, 163, 184, 0.2)" : "rgba(71, 85, 105, 0.14)"};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(15, 23, 42, 0.8)" : "rgba(255, 255, 255, 0.92)"};
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  cursor: pointer;
  transition:
    background-color 120ms ease,
    border-color 120ms ease,
    color 120ms ease;

  &::after {
    content: "";
    position: absolute;
    inset: -0.42rem;
  }

  &:hover {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(30, 41, 59, 0.94)" : "rgba(239, 246, 255, 0.98)"};
    border-color: rgba(59, 130, 246, 0.28);
    color: var(--color-gray12);
  }

  &[data-variant="labeled"] {
    width: auto;
    min-width: 4.6rem;
    padding-inline: 0.58rem 0.7rem;
    gap: 0.38rem;
  }
`

const TableQuickRailLabel = styled.span`
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: -0.02em;
`

const TableHandleButton = styled(TableQuickRailButton)`
  width: 2.12rem;
  height: 2.12rem;
  border-radius: 0.62rem;

  &[data-variant="labeled"] {
    width: auto;
    min-width: 4.8rem;
    height: 2.12rem;
    padding-inline: 0.62rem 0.78rem;
    gap: 0.42rem;
  }
`

const TableQuickAddButton = styled(TableQuickRailButton)`
  width: auto;
  min-width: 3.25rem;
  padding-inline: 0.56rem 0.7rem;
  gap: 0.32rem;
  font-size: 0.7rem;
  font-weight: 800;

  &[aria-label="행 추가"] {
    min-width: 3.6rem;
  }
`

const FloatingTableMenu = styled.div`
  position: fixed;
  z-index: 65;
  width: min(19rem, calc(100vw - 2rem));
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.7rem;
  border-radius: 0.9rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(15, 18, 24, 0.96)" : "rgba(255, 255, 255, 0.98)"};
  box-shadow: ${({ theme }) =>
    theme.scheme === "dark" ? "0 14px 22px rgba(0, 0, 0, 0.15)" : "0 14px 22px rgba(15, 23, 42, 0.1)"};
`

const TableMenuSectionTitle = styled.span`
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--color-gray10);
`

const TableMenuButtonRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.42rem;
`

const BlockHandleRail = styled.div`
  position: fixed;
  z-index: 55;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 0.18rem;
  padding: 0.12rem;
  border-radius: 0.72rem;
  border: 1px solid ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(148, 163, 184, 0.2)" : "rgba(71, 85, 105, 0.14)"};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(15, 23, 42, 0.52)" : "rgba(255, 255, 255, 0.84)"};
  backdrop-filter: blur(6px);
  opacity: 0;
  transform: translate3d(-3px, 0, 0);
  pointer-events: none;
  transition:
    opacity 140ms ease,
    transform 140ms ease;

  &[data-visible="true"] {
    opacity: 1;
    transform: translate3d(0, 0, 0);
    pointer-events: auto;
  }
`

const BlockHandleButton = styled.button`
  all: unset;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.44rem;
  height: 1.44rem;
  border-radius: 0.42rem;
  border: 1px solid transparent;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.76rem;
  font-weight: 700;
  box-shadow: none;
  opacity: 0.8;
  cursor: pointer;
  transition:
    background-color 120ms ease,
    color 120ms ease,
    opacity 120ms ease,
    border-color 120ms ease;

  &[data-variant="drag"] {
    cursor: grab;
  }

  &:hover {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.06)"};
    border-color: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(148, 163, 184, 0.26)" : "rgba(71, 85, 105, 0.2)"};
    color: var(--color-gray12);
    opacity: 1;
  }

  &:focus-visible {
    outline: 2px solid rgba(59, 130, 246, 0.5);
    outline-offset: 1px;
  }
`

const BlockHandleGrip = styled.span`
  display: grid;
  grid-template-columns: repeat(2, 0.18rem);
  grid-auto-rows: 0.18rem;
  gap: 0.12rem;

  span {
    width: 0.18rem;
    height: 0.18rem;
    border-radius: 999px;
    background: currentColor;
    opacity: 0.78;
  }
`

const BlockHandlePlus = styled.span`
  position: relative;
  width: 0.82rem;
  height: 0.82rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  span {
    position: absolute;
    display: block;
    border-radius: 999px;
    background: currentColor;
  }

  span:first-of-type {
    width: 0.82rem;
    height: 1.6px;
  }

  span:last-of-type {
    width: 1.6px;
    height: 0.82rem;
  }
`

const DraggedBlockGhost = styled.div`
  position: fixed;
  z-index: 58;
  pointer-events: none;
  transform: translate3d(0, 0, 0);
  filter: drop-shadow(0 20px 30px rgba(15, 23, 42, 0.3));
`

const DraggedBlockGhostBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 1.55rem;
  margin: 0 0 0.32rem 0.18rem;
  padding: 0 0.56rem;
  border-radius: 999px;
  border: 1px solid rgba(59, 130, 246, 0.34);
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(17, 24, 39, 0.92)" : "rgba(248, 250, 252, 0.96)"};
  color: ${({ theme }) => theme.colors.blue4};

  span {
    font-size: 0.72rem;
    font-weight: 700;
  }

  strong {
    font-size: 0.72rem;
    font-weight: 700;
    color: ${({ theme }) => theme.colors.blue3};
  }
`

const DraggedBlockGhostCard = styled.div`
  overflow: hidden;
  border-radius: 1rem;
  border: 1px solid rgba(59, 130, 246, 0.28);
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(15, 23, 42, 0.9)" : "rgba(255, 255, 255, 0.96)"};
  box-shadow:
    0 0 0 1px rgba(59, 130, 246, 0.18),
    0 10px 22px rgba(15, 23, 42, 0.22);
  padding: 0.72rem 0.88rem;
  opacity: 0.92;

  > * {
    margin: 0 !important;
  }

  p,
  li,
  td,
  th {
    color: ${({ theme }) => theme.colors.gray12};
  }

  pre,
  .aq-code-shell,
  .aq-table-shell,
  .tableWrapper {
    max-width: 100%;
    overflow: hidden;
  }
`

const BlockDropIndicator = styled.div`
  position: fixed;
  z-index: 56;
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(37, 99, 235, 0.95), rgba(59, 130, 246, 0.98));
  box-shadow:
    0 0 0 1px rgba(37, 99, 235, 0.2),
    0 4px 10px rgba(37, 99, 235, 0.22);
  pointer-events: none;

  &::before,
  &::after {
    content: "";
    position: absolute;
    top: 50%;
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: rgba(59, 130, 246, 0.98);
    box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.28);
    transform: translateY(-50%);
  }

  &::before {
    left: -3px;
  }

  &::after {
    right: -3px;
  }
`

const BlockSelectionOverlay = styled.div`
  position: fixed;
  z-index: 2;
  pointer-events: none;
  border-radius: 0.95rem;
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(59, 130, 246, 0.12)" : "rgba(59, 130, 246, 0.1)"};
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.24);
`

const MobileBlockActionBar = styled.div`
  position: fixed;
  z-index: 55;
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  padding: 0.5rem;
  border-radius: 0.9rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(15, 18, 24, 0.96)" : "rgba(255, 255, 255, 0.98)"};
  box-shadow: ${({ theme }) =>
    theme.scheme === "dark" ? "0 10px 18px rgba(0, 0, 0, 0.14)" : "0 10px 18px rgba(15, 23, 42, 0.1)"};
  transform: translateX(-50%);
`

const FloatingBlockMenu = styled.div`
  position: fixed;
  z-index: 65;
  width: min(30rem, calc(100vw - 2rem));
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.75rem;
  border-radius: 0.9rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(15, 18, 24, 0.96)" : "rgba(255, 255, 255, 0.98)"};
  box-shadow: ${({ theme }) =>
    theme.scheme === "dark" ? "0 14px 22px rgba(0, 0, 0, 0.15)" : "0 14px 22px rgba(15, 23, 42, 0.1)"};
`

const FloatingBlockMenuHeader = styled.strong`
  font-size: 0.88rem;
  color: var(--color-gray12);
`

const FloatingBlockMenuDivider = styled.div`
  height: 1px;
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(255, 255, 255, 0.06)" : "rgba(15, 23, 42, 0.08)"};
`

const FloatingBlockMenuGrid = styled.div`
  display: grid;
  gap: 0.45rem;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
`

const FloatingBlockMenuButton = styled.button`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
  min-height: 3rem;
  border-radius: 0.85rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(18, 21, 26, 0.72)" : "rgba(255, 255, 255, 0.96)"};
  color: var(--color-gray12);
  padding: 0.68rem 0.8rem;
  text-align: left;

  strong {
    font-size: 0.82rem;
  }

  span {
    color: var(--color-gray10);
    font-size: 0.72rem;
  }
`

const FloatingBlockActionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
`

const FloatingBlockActionButton = styled.button`
  min-height: 2.25rem;
  border-radius: 0.8rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(18, 21, 26, 0.72)" : "rgba(255, 255, 255, 0.96)"};
  color: var(--color-gray12);
  font-size: 0.8rem;
  font-weight: 700;
  text-align: left;
  padding: 0 0.8rem;

  &[data-active="true"] {
    border-color: rgba(59, 130, 246, 0.48);
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(37, 99, 235, 0.18)" : "rgba(219, 234, 254, 0.96)"};
    color: ${({ theme }) => (theme.scheme === "dark" ? "#dbeafe" : "#1d4ed8")};
  }

  &[data-variant="danger"] {
    border-color: rgba(248, 113, 113, 0.16);
    color: #fecaca;
    background: rgba(127, 29, 29, 0.1);
  }
`

const AuxDisclosure = styled.details`
  border: 0;
  border-top: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;

  > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    cursor: pointer;
    list-style: none;
    padding: 0.8rem 0;

    &::-webkit-details-marker {
      display: none;
    }
  }

  strong {
    font-size: 0.82rem;
    color: var(--color-gray11);
  }

  span {
    font-size: 0.76rem;
    color: var(--color-gray10);
  }

  .body {
    padding: 0 0 0.75rem;
  }
`

const QuickInsertBar = styled.div`
  display: grid;
  gap: 0.7rem;
  padding: 0.1rem 0 0.2rem;
`

const QuickInsertActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
`

const QuickInsertButton = styled.button`
  min-height: 2.4rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(148, 163, 184, 0.22)" : "rgba(71, 85, 105, 0.14)"};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(17, 24, 39, 0.78)" : "rgba(255, 255, 255, 0.94)"};
  color: var(--color-gray12);
  font-size: 0.82rem;
  font-weight: 700;
  padding: 0 0.95rem;
  transition:
    transform 120ms ease,
    border-color 120ms ease,
    background 120ms ease;

  &:hover:not(:disabled),
  &:focus-visible:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.blue7};
    transform: translateY(-1px);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`
