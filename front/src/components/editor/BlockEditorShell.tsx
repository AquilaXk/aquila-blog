import type { Editor as TiptapEditor } from "@tiptap/core"
import { keyframes } from "@emotion/react"
import styled from "@emotion/styled"
import AppIcon from "src/components/icons/AppIcon"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import { Table } from "@tiptap/extension-table"
import StarterKit from "@tiptap/starter-kit"
import { EditorContent, useEditor } from "@tiptap/react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { ChangeEvent, DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react"
import {
  BookmarkBlock,
  CalloutBlock,
  EditorListKeymap,
  EditorTaskItem,
  EditorTaskList,
  EditorCodeBlock,
  EditorTableCell,
  EditorTableHeader,
  EditorTableRow,
  EmbedBlock,
  FileBlock,
  FormulaBlock,
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
  moveTaskItemToInsertionIndex,
  moveTopLevelBlockToInsertionIndex,
} from "./blockDocumentOps"
import {
  createBlockquoteNode,
  createBookmarkNode,
  createCalloutNode,
  createCodeBlockNode,
  createEmbedNode,
  createFileBlockNode,
  createFormulaNode,
  createHeadingNode,
  createHorizontalRuleNode,
  createMermaidNode,
  createOrderedListNode,
  createParagraphNode,
  createTaskListNode,
  createTableNode,
  createToggleNode,
  createBulletListNode,
  parseMarkdownToEditorDoc,
  serializeEditorDocToMarkdown,
  type BlockEditorDoc,
  type FileBlockAttrs,
  type ImageBlockAttrs,
} from "./serialization"
import {
  TABLE_MIN_COLUMN_WIDTH_PX,
  TABLE_MIN_ROW_HEIGHT_PX,
} from "src/libs/markdown/tableMetadata"
import { markdownContentTypography } from "src/libs/markdown/contentTypography"
import {
  convertHtmlToMarkdown,
  extractPlainTextFromHtml,
  looksLikeStructuredMarkdownDocument,
  normalizeStructuredMarkdownClipboard,
} from "src/libs/markdown/htmlToMarkdown"
import { INLINE_TEXT_COLOR_OPTIONS, normalizeInlineColorToken } from "src/libs/markdown/inlineColor"

type Props = {
  value: string
  onChange: (markdown: string, meta?: BlockEditorChangeMeta) => void
  onUploadImage: (file: File) => Promise<ImageBlockAttrs>
  onUploadFile?: (file: File) => Promise<FileBlockAttrs>
  disabled?: boolean
  className?: string
  preview?: ReactNode
  enableMermaidBlocks?: boolean
}

export type BlockEditorChangeMeta = {
  editorFocused: boolean
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
  preventDefault: () => void
}

type ToolbarAction = {
  id: string
  label: ReactNode
  ariaLabel: string
  run: () => void
  active: boolean
  disabled?: boolean
}

type FloatingBubbleState = {
  visible: boolean
  mode: "text" | "image" | "table"
  left: number
  top: number
}

type TopLevelBlockHandleState = {
  visible: boolean
  blockIndex: number
  left: number
  top: number
  bottom: number
  width: number
}

type DraggedBlockState =
  | {
      sourceIndex: number
      pointerId: number
    }
  | null

type DraggedTaskItemState =
  | {
      taskListBlockIndex: number
      sourceItemIndex: number
    }
  | null

type TaskItemDropIndicatorState =
  | {
      visible: boolean
      taskListBlockIndex: number
      insertionIndex: number
      top: number
      left: number
      width: number
    }
  | {
      visible: false
      taskListBlockIndex: number
      insertionIndex: number
      top: number
      left: number
      width: number
    }

type DropIndicatorState =
  | {
      visible: boolean
      insertionIndex: number
      top: number
      left: number
      width: number
    }
  | {
      visible: false
      insertionIndex: number
      top: number
      left: number
      width: number
    }

const normalizeSlashSearchText = (value: string) => value.trim().toLowerCase()

const compactSlashSearchText = (value: string) => normalizeSlashSearchText(value).replace(/\s+/g, "")

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

const BLOCK_HANDLE_MEDIA_QUERY = "(pointer: coarse), (max-width: 1024px)"
const TABLE_ROW_RESIZE_EDGE_PX = 6
const TABLE_COLUMN_RESIZE_GUARD_PX = 12
const SLASH_MENU_RECENT_IDS_STORAGE_KEY = "editor:block-slash-recent:v1"
const SLASH_MENU_MAX_RECENT_ITEMS = 6
const SLASH_MENU_EDGE_PADDING_PX = 16
const SLASH_MENU_VERTICAL_GAP_PX = 12
const SLASH_MENU_ESTIMATED_WIDTH_PX = 608
const SLASH_MENU_ESTIMATED_HEIGHT_PX = 560
const TABLE_CELL_COLOR_PRESETS = [
  { label: "하늘", value: "#dbeafe" },
  { label: "민트", value: "#dcfce7" },
  { label: "노랑", value: "#fef3c7" },
  { label: "장미", value: "#ffe4e6" },
  { label: "보라", value: "#ede9fe" },
  { label: "회색", value: "#e2e8f0" },
] as const

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

const isTableSelectionActive = (editor?: TiptapEditor | null) =>
  Boolean(
    editor &&
      (editor.isActive("table") ||
        editor.isActive("tableRow") ||
        editor.isActive("tableCell") ||
        editor.isActive("tableHeader"))
  )

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
}: Props) => {
  const imageFileInputRef = useRef<HTMLInputElement>(null)
  const attachmentFileInputRef = useRef<HTMLInputElement>(null)
  const inlineColorMenuRef = useRef<HTMLDetailsElement>(null)
  const slashMenuRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const pendingImageInsertIndexRef = useRef<number | null>(null)
  const pendingAttachmentInsertIndexRef = useRef<number | null>(null)
  const lastCommittedMarkdownRef = useRef(normalizeMarkdown(value))
  const editorRef = useRef<TiptapEditor | null>(null)
  const tableRowResizeRef = useRef<TableRowResizeState | null>(null)
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
  const [blockMenuState, setBlockMenuState] = useState<BlockMenuState>(null)
  const [isCoarsePointer, setIsCoarsePointer] = useState(false)
  const [hoveredBlockIndex, setHoveredBlockIndex] = useState<number | null>(null)
  const [selectedBlockIndex, setSelectedBlockIndex] = useState(0)
  const [blockHandleState, setBlockHandleState] = useState<TopLevelBlockHandleState>({
    visible: false,
    blockIndex: 0,
    left: 0,
    top: 0,
    bottom: 0,
    width: 0,
  })
  const [bubbleState, setBubbleState] = useState<FloatingBubbleState>({
    visible: false,
    mode: "text",
    left: 0,
    top: 0,
  })
  const [draggedBlockState, setDraggedBlockState] = useState<DraggedBlockState>(null)
  const [dropIndicatorState, setDropIndicatorState] = useState<DropIndicatorState>({
    visible: false,
    insertionIndex: 0,
    top: 0,
    left: 0,
    width: 0,
  })
  const [draggedTaskItemState, setDraggedTaskItemState] = useState<DraggedTaskItemState>(null)
  const [taskItemDropIndicatorState, setTaskItemDropIndicatorState] = useState<TaskItemDropIndicatorState>({
    visible: false,
    taskListBlockIndex: 0,
    insertionIndex: 0,
    top: 0,
    left: 0,
    width: 0,
  })
  const [selectionTick, setSelectionTick] = useState(0)
  const initialDocRef = useRef(
    downgradeDisabledFeatureNodes(parseMarkdownToEditorDoc(value), enableMermaidBlocks)
  )

  const isSelectionInEmptyParagraph = useCallback(() => {
    const currentEditor = editorRef.current
    if (!currentEditor) return false
    const { selection } = currentEditor.state
    if (!selection.empty) return false
    const parent = selection.$from.parent
    return parent.type.name === "paragraph" && parent.textContent.length === 0
  }, [])

  const insertDocContent = useCallback(
    (doc: BlockEditorDoc, replaceCurrentEmptyParagraph = false) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return false
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

  const resolveDropIndicatorByClientY = useCallback(
    (clientY: number) => {
      const elements = getTopLevelBlockElements()
      if (!elements.length) {
        return {
          insertionIndex: 0,
          top: 0,
          left: 0,
          width: 0,
        }
      }

      const rootRect = elements[0]?.parentElement?.getBoundingClientRect()
      let insertionIndex = elements.length
      let top = elements[elements.length - 1].getBoundingClientRect().bottom

      for (let index = 0; index < elements.length; index += 1) {
        const rect = elements[index].getBoundingClientRect()
        const midpoint = rect.top + rect.height / 2
        if (clientY < midpoint) {
          insertionIndex = index
          top = rect.top
          break
        }
      }

      return {
        insertionIndex,
        top: Math.round(top),
        left: Math.round(rootRect?.left || elements[0].getBoundingClientRect().left),
        width: Math.round(rootRect?.width || elements[0].getBoundingClientRect().width),
      }
    },
    [getTopLevelBlockElements]
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
      if (!root || !(target instanceof Element)) return null

      let element: Element | null = target
      while (element && element.parentElement !== root) {
        element = element.parentElement
      }

      if (!element || element.parentElement !== root) return null
      return getTopLevelBlockElements().indexOf(element as HTMLElement)
    },
    [getContentRoot, getTopLevelBlockElements]
  )

  const findTaskItemDragContextFromTarget = useCallback(
    (target: EventTarget | null) => {
      const root = getContentRoot()
      if (!root || !(target instanceof Element)) return null

      const taskItemElement = target.closest("li[data-type='taskItem'], li[data-task-item='true']")
      if (!(taskItemElement instanceof HTMLElement)) return null
      const taskListElement = taskItemElement.closest("ul[data-type='taskList'], ul[data-task-list='true']")
      if (!(taskListElement instanceof HTMLElement)) return null

      let blockElement: Element | null = taskListElement
      while (blockElement && blockElement.parentElement !== root) {
        blockElement = blockElement.parentElement
      }

      if (!(blockElement instanceof HTMLElement) || blockElement.parentElement !== root) return null
      const taskListBlockIndex = getTopLevelBlockElements().indexOf(blockElement)
      if (taskListBlockIndex < 0) return null

      const taskItems = Array.from(
        taskListElement.querySelectorAll(":scope > li[data-type='taskItem'], :scope > li[data-task-item='true']")
      ) as HTMLElement[]
      const sourceItemIndex = taskItems.indexOf(taskItemElement)
      if (sourceItemIndex < 0) return null

      return {
        taskListBlockIndex,
        sourceItemIndex,
        taskItemElement,
        taskListElement,
        taskItems,
      }
    },
    [getContentRoot, getTopLevelBlockElements]
  )

  const resolveTaskItemDropIndicatorByClientY = useCallback(
    (taskListElement: HTMLElement, clientY: number) => {
      const taskItems = Array.from(
        taskListElement.querySelectorAll(":scope > li[data-type='taskItem'], :scope > li[data-task-item='true']")
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
    const resolvedPosition = currentEditor.state.doc.resolve(domPosition)

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
    const position = getTopLevelBlockPosition(currentEditor, blockIndex)
    currentEditor.commands.focus(position)
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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: false,
        codeBlock: false,
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
      Table.configure({
        resizable: true,
        cellMinWidth: TABLE_MIN_COLUMN_WIDTH_PX,
      }),
      EditorTableRow,
      EditorTableHeader,
      EditorTableCell,
      EditorCodeBlock,
      RawMarkdownBlock,
      ResizableImage,
      CalloutBlock,
      EditorTaskList,
      EditorTaskItem,
      EditorListKeymap,
      BookmarkBlock,
      EmbedBlock,
      FileBlock,
      FormulaBlock,
      ToggleBlock,
      ...(enableMermaidBlocks ? [MermaidBlock] : []),
    ],
    content: initialDocRef.current,
    editable: !disabled,
    onCreate: ({ editor: createdEditor }) => {
      editorRef.current = createdEditor
    },
    onDestroy: () => {
      editorRef.current = null
    },
    editorProps: {
      attributes: {
        class: "aq-block-editor__content",
        "data-testid": "block-editor-prosemirror",
      },
      handleKeyDown: (_, event) => {
        const currentEditor = editorRef.current
        if (!currentEditor) return false
        const normalizedKey = event.key.toLowerCase()
        const hasPrimaryModifier = isPrimaryModifierPressed(event)

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
          currentEditor.chain().focus().undo().run()
          return true
        }

        if (hasPrimaryModifier && !event.altKey && event.shiftKey && normalizedKey === "z") {
          event.preventDefault()
          currentEditor.chain().focus().redo().run()
          return true
        }

        return false
      },
      handlePaste: (_, event) => {
        const currentEditor = editorRef.current
        if (!currentEditor) return false

        const imageFile = Array.from(event.clipboardData?.files || []).find((file) =>
          file.type.startsWith("image/")
        )
        if (imageFile) {
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

        const plainText = event.clipboardData?.getData("text/plain") || ""
        const html = event.clipboardData?.getData("text/html") || ""
        const normalizedPlainText = normalizeStructuredMarkdownClipboard(plainText)
        const normalizedHtmlMarkdown = html ? convertHtmlToMarkdown(html) : ""

        if (html && normalizedHtmlMarkdown) {
          event.preventDefault()
          const parsedDoc = downgradeDisabledFeatureNodes(
            parseMarkdownToEditorDoc(normalizedHtmlMarkdown),
            enableMermaidBlocks
          )
          return insertDocContent(parsedDoc, isSelectionInEmptyParagraph())
        }

        if (normalizedPlainText && looksLikeStructuredMarkdownDocument(normalizedPlainText)) {
          event.preventDefault()
          const parsedDoc = downgradeDisabledFeatureNodes(
            parseMarkdownToEditorDoc(normalizedPlainText),
            enableMermaidBlocks
          )
          return insertDocContent(parsedDoc, isSelectionInEmptyParagraph())
        }

        if (html && !plainText.trim()) {
          const extracted = extractPlainTextFromHtml(html)
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
      const markdown = serializeEditorDocToMarkdown(nextEditor.getJSON() as BlockEditorDoc)
      const normalized = normalizeMarkdown(markdown)

      if (normalized === lastCommittedMarkdownRef.current) {
        return
      }

      lastCommittedMarkdownRef.current = normalized
      onChange(markdown, { editorFocused: nextEditor.isFocused })
    },
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [disabled, editor])

  useEffect(() => {
    if (!editor) return
    const notifySelection = () => {
      setSelectionTick((prev) => prev + 1)
      setSelectedBlockIndex(getTopLevelBlockIndexFromSelection(editor))
    }
    notifySelection()
    editor.on("selectionUpdate", notifySelection)
    editor.on("transaction", notifySelection)
    return () => {
      editor.off("selectionUpdate", notifySelection)
      editor.off("transaction", notifySelection)
    }
  }, [editor])

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
    const currentEditor = editorRef.current
    if (!currentEditor) return

    const syncBubble = () => {
      const activeEditor = editorRef.current
      if (!activeEditor) {
        setBubbleState((prev) => ({ ...prev, visible: false }))
        return
      }

      const selection = activeEditor.state.selection
      const isImageNodeSelected = activeEditor.isActive("resizableImage")
      const isTableActive = activeEditor.isActive("table")
      const canShowTextToolbar =
        !selection.empty &&
        !isImageNodeSelected &&
        !activeEditor.isActive("codeBlock") &&
        !activeEditor.isActive("rawMarkdownBlock")

      if (!isImageNodeSelected && !canShowTextToolbar && !isTableActive) {
        setBubbleState((prev) => ({ ...prev, visible: false }))
        return
      }

      const startCoords = activeEditor.view.coordsAtPos(selection.from)
      const endCoords = activeEditor.view.coordsAtPos(isImageNodeSelected ? selection.from : selection.to)

      setBubbleState({
        visible: true,
        mode: isImageNodeSelected ? "image" : canShowTextToolbar ? "text" : "table",
        left: Math.round((startCoords.left + endCoords.right) / 2),
        top: Math.round(Math.min(startCoords.top, endCoords.top)),
      })
    }

    syncBubble()
    currentEditor.on("selectionUpdate", syncBubble)
    currentEditor.on("transaction", syncBubble)
    return () => {
      currentEditor.off("selectionUpdate", syncBubble)
      currentEditor.off("transaction", syncBubble)
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return
    const normalizedIncoming = normalizeMarkdown(value)
    if (normalizedIncoming === lastCommittedMarkdownRef.current) {
      return
    }

    const nextDoc = downgradeDisabledFeatureNodes(parseMarkdownToEditorDoc(value), enableMermaidBlocks)
    editor.commands.setContent(nextDoc, { emitUpdate: false })
    lastCommittedMarkdownRef.current = normalizeMarkdown(serializeEditorDocToMarkdown(nextDoc))
  }, [editor, enableMermaidBlocks, value])

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

  const insertMermaidBlock = useCallback(() => {
    if (!enableMermaidBlocks) return
    insertBlocksAtCursor([createMermaidNode("flowchart TD\n  A[시작] --> B[처리]")], true)
  }, [enableMermaidBlocks, insertBlocksAtCursor])

  const insertCalloutBlock = useCallback(() => {
    insertBlocksAtCursor(
      [
        createCalloutNode({
          kind: "tip",
          title: "핵심 포인트",
          body: "콜아웃 본문을 입력하세요.",
        }),
      ],
      true
    )
  }, [insertBlocksAtCursor])

  const insertToggleBlock = useCallback(() => {
    insertBlocksAtCursor(
      [
        createToggleNode({
          title: "더 보기",
          body: "토글 내부 본문을 입력하세요.",
        }),
      ],
      true
    )
  }, [insertBlocksAtCursor])

  const insertChecklistBlock = useCallback(() => {
    insertBlocksAtCursor([createTaskListNode([{ checked: false, text: "할 일" }])], true)
  }, [insertBlocksAtCursor])

  const insertBookmarkBlock = useCallback(() => {
    insertBlocksAtCursor(
      [
        createBookmarkNode({
          url: "https://example.com",
          title: "링크 제목",
          description: "북마크 설명",
        }),
      ],
      true
    )
  }, [insertBlocksAtCursor])

  const insertEmbedBlock = useCallback(() => {
    insertBlocksAtCursor(
      [
        createEmbedNode({
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          title: "임베드 제목",
          caption: "임베드 캡션",
        }),
      ],
      true
    )
  }, [insertBlocksAtCursor])

  const insertFileBlock = useCallback(() => {
    insertBlocksAtCursor(
      [
        createFileBlockNode({
          url: "https://example.com/files/spec.pdf",
          name: "spec.pdf",
          description: "첨부 설명",
        }),
      ],
      true
    )
  }, [insertBlocksAtCursor])

  const insertFormulaBlock = useCallback(() => {
    insertBlocksAtCursor([createFormulaNode({ formula: "\\int_0^1 x^2 \\, dx" })], true)
  }, [insertBlocksAtCursor])

  const insertTableBlock = useCallback(() => {
    if (editor && isTableSelectionActive(editor)) return
    insertBlocksAtCursor(
      [
        createTableNode([
          ["제목", "값"],
          ["항목", "내용"],
        ]),
      ],
      true
    )
  }, [editor, insertBlocksAtCursor])

  const canInsertTable = !isTableSelectionActive(editor)

  const insertCodeBlock = useCallback(() => {
    insertBlocksAtCursor([createCodeBlockNode(getPreferredCodeLanguage(), "코드를 입력하세요.")], true)
  }, [insertBlocksAtCursor])

  const insertBlocksAtIndex = useCallback(
    (insertionIndex: number, blocks: NonNullable<BlockEditorDoc["content"]>, focusIndex = insertionIndex) => {
      mutateTopLevelBlocks((doc) => insertTopLevelBlockAt(doc, insertionIndex, blocks), focusIndex)
    },
    [mutateTopLevelBlocks]
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

  const activeInlineColor = normalizeInlineColorToken(String(editor?.getAttributes("inlineColor").color || ""))
  const isInlineCodeActive = editor?.isActive("code") ?? false

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
    },
    [editor]
  )

  const updateActiveTableCellAttrs = useCallback(
    (attrs: Record<string, unknown>) => {
      if (!editor) return
      const cellNodeType = editor.isActive("tableHeader") ? "tableHeader" : "tableCell"
      editor.chain().focus().updateAttributes(cellNodeType, attrs).run()
    },
    [editor]
  )

  const activeTableCellNodeType =
    editor?.isActive("tableHeader") ?? false ? "tableHeader" : "tableCell"
  const activeTableCellAttrs = editor?.getAttributes(activeTableCellNodeType) || {}

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
    const createTableTemplate = () =>
      createTableNode([
        ["제목", "값"],
        ["항목", "내용"],
      ])

    const createCalloutTemplate = () =>
      createCalloutNode({
        kind: "tip",
        title: "핵심 포인트",
        body: "콜아웃 본문을 입력하세요.",
      })

    const createToggleTemplate = () =>
      createToggleNode({
        title: "더 보기",
        body: "토글 내부 본문을 입력하세요.",
      })

    const createChecklistTemplate = () =>
      createTaskListNode([{ checked: false, text: "할 일" }])

    const createBookmarkTemplate = () =>
      createBookmarkNode({
        url: "https://example.com",
        title: "링크 제목",
        description: "북마크 설명",
      })

    const createEmbedTemplate = () =>
      createEmbedNode({
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        title: "임베드 제목",
        caption: "임베드 캡션",
      })

    const createFileTemplate = () =>
      createFileBlockNode({
        url: "https://example.com/files/spec.pdf",
        name: "spec.pdf",
        description: "첨부 설명",
      })

    const createFormulaTemplate = () =>
      createFormulaNode({
        formula: "\\int_0^1 x^2 \\, dx",
      })

    return [
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
        insertAtCursor: () => insertBlocksAtCursor([createHeadingNode(1, "제목")], true),
        insertAtBlock: (blockIndex) =>
          insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createHeadingNode(1, "제목")])),
      },
      {
        id: "heading-2",
        label: "제목 2",
        helper: "큰 섹션 제목",
        section: "basic",
        keywords: ["h2", "heading", "section", "소제목"],
        slashHint: "##",
        insertAtCursor: () => insertBlocksAtCursor([createHeadingNode(2, "제목")], true),
        insertAtBlock: (blockIndex) =>
          insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createHeadingNode(2, "제목")])),
      },
      {
        id: "heading-3",
        label: "제목 3",
        helper: "작은 섹션 제목",
        section: "basic",
        keywords: ["h3", "heading", "subsection", "소제목"],
        slashHint: "###",
        insertAtCursor: () => insertBlocksAtCursor([createHeadingNode(3, "제목")], true),
        insertAtBlock: (blockIndex) =>
          insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createHeadingNode(3, "제목")])),
      },
      {
        id: "heading-4",
        label: "제목 4",
        helper: "짧은 소단락 제목",
        section: "basic",
        keywords: ["h4", "heading", "caption", "제목"],
        slashHint: "####",
        insertAtCursor: () => insertBlocksAtCursor([createHeadingNode(4, "제목")], true),
        insertAtBlock: (blockIndex) =>
          insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createHeadingNode(4, "제목")])),
      },
      {
        id: "bullet-list",
        label: "글머리 기호 목록",
        helper: "순서 없는 항목",
        section: "basic",
        keywords: ["list", "bullet", "목록", "불릿"],
        slashHint: "-",
        recommended: true,
        insertAtCursor: () => insertBlocksAtCursor([createBulletListNode(["항목"])], true),
        insertAtBlock: (blockIndex) =>
          insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createBulletListNode(["항목"])])),
      },
      {
        id: "ordered-list",
        label: "번호 목록",
        helper: "순서 있는 항목",
        section: "basic",
        keywords: ["ordered", "numbered", "list", "번호"],
        slashHint: "1.",
        toolbarMore: true,
        insertAtCursor: () => insertBlocksAtCursor([createOrderedListNode(["항목"])], true),
        insertAtBlock: (blockIndex) =>
          insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createOrderedListNode(["항목"])])),
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
        insertAtCursor: () => insertBlocksAtCursor([createBlockquoteNode("인용문")], true),
        insertAtBlock: (blockIndex) =>
          insertBlocksAtIndex(blockIndex + 1, withTrailingParagraph([createBlockquoteNode("인용문")])),
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
            withTrailingParagraph([createCodeBlockNode(getPreferredCodeLanguage(), "코드를 입력하세요.")])
          ),
      },
      {
        id: "table",
        label: "테이블",
        helper: "2열 헤더 포함",
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
          attachmentFileInputRef.current?.click()
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
                  withTrailingParagraph([createMermaidNode("flowchart TD\n  A[시작] --> B[처리]")])
                ),
            },
          ]
        : []),
    ]
  }, [
    canInsertTable,
    enableMermaidBlocks,
    focusEditor,
    insertBlocksAtCursor,
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

  const slashMenuContext = useMemo<SlashMenuContext>(() => {
    void selectionTick

    if (!editor) {
      return {
        currentBlockType: null,
        previousBlockType: null,
        atDocumentStart: true,
      }
    }

    const blocks = (((editor.getJSON() as BlockEditorDoc).content ?? []) as BlockEditorDoc[])
    const currentBlockIndex = Math.max(0, Math.min(getTopLevelBlockIndexFromSelection(editor), blocks.length - 1))

    return {
      currentBlockType: blocks[currentBlockIndex]?.type ?? null,
      previousBlockType: currentBlockIndex > 0 ? blocks[currentBlockIndex - 1]?.type ?? null : null,
      atDocumentStart: currentBlockIndex === 0,
    }
  }, [editor, selectionTick])

  const rankedSlashItems = useMemo(() => {
    return blockInsertCatalog
      .map((item, index) => ({
        item,
        index,
        score: getSlashMenuMatchScore(
          item,
          normalizedSlashQuery,
          recentSlashItemIds.indexOf(item.id),
          slashMenuContext
        ),
      }))
      .filter((entry) => Number.isFinite(entry.score))
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score
        return left.index - right.index
      })
      .map((entry) => entry.item)
  }, [blockInsertCatalog, normalizedSlashQuery, recentSlashItemIds, slashMenuContext])

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

      const activeSlashRange = slashMenuState
      if (activeSlashRange) {
        editor.chain().focus().deleteRange({ from: activeSlashRange.from, to: activeSlashRange.to }).run()
      }

      setRecentSlashItemIds((prev) => {
        const next = [item.id, ...prev.filter((id) => id !== item.id)].slice(0, SLASH_MENU_MAX_RECENT_ITEMS)
        if (typeof window !== "undefined") {
          window.localStorage.setItem(SLASH_MENU_RECENT_IDS_STORAGE_KEY, JSON.stringify(next))
        }
        return next
      })

      await item.insertAtCursor()
      closeSlashMenu()
    },
    [closeSlashMenu, editor, slashMenuState]
  )

  const resolveSlashMenuState = useCallback(() => {
    if (!editor || typeof window === "undefined") return null

    const selection = editor.state.selection

    if (!selection.empty || !editor.isFocused) {
      return null
    }

    const parent = selection.$from.parent
    if (parent.type.name !== "paragraph") {
      return null
    }

    const textBeforeCursor = parent.textContent.slice(0, selection.$from.parentOffset)
    const match = /(^|[\s\u00A0])\/([^\n]*)$/.exec(textBeforeCursor)

    if (!match) {
      return null
    }

    const slashOffset = (match.index ?? 0) + match[1].length
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
      query: match[2] ?? "",
      menuState: {
        left: Math.round(nextLeft),
        top: Math.round(Math.max(viewportPadding, nextTop)),
        from: selection.$from.start() + slashOffset,
        to: selection.from,
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

  useEffect(() => {
    if (!editor) return

    const syncSlashMenu = () => {
      if (isSlashImeComposing || editor.view.composing) {
        return
      }

      applyResolvedSlashMenuState(resolveSlashMenuState())
    }

    syncSlashMenu()
    editor.on("selectionUpdate", syncSlashMenu)
    editor.on("transaction", syncSlashMenu)
    editor.on("focus", syncSlashMenu)

    return () => {
      editor.off("selectionUpdate", syncSlashMenu)
      editor.off("transaction", syncSlashMenu)
      editor.off("focus", syncSlashMenu)
    }
  }, [applyResolvedSlashMenuState, editor, isSlashImeComposing, resolveSlashMenuState])

  useEffect(() => {
    if (typeof window === "undefined" || !isSlashMenuOpen) return

    const syncSlashMenuPlacement = () => {
      if (isSlashImeComposing || editor?.view.composing) return
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
    { id: "bold", label: "B", ariaLabel: "굵게", run: () => editor?.chain().focus().toggleBold().run(), active: editor?.isActive("bold") ?? false },
    { id: "italic", label: <AppIcon name="italic" aria-hidden="true" />, ariaLabel: "기울임", run: () => editor?.chain().focus().toggleItalic().run(), active: editor?.isActive("italic") ?? false },
    { id: "bullet-list", label: <AppIcon name="list" aria-hidden="true" />, ariaLabel: "목록", run: () => editor?.chain().focus().toggleBulletList().run(), active: editor?.isActive("bulletList") ?? false },
    { id: "quote", label: <span aria-hidden="true">❞</span>, ariaLabel: "인용문", run: () => editor?.chain().focus().toggleBlockquote().run(), active: editor?.isActive("blockquote") ?? false },
    { id: "link", label: <AppIcon name="link" aria-hidden="true" />, ariaLabel: "링크", run: openLinkPrompt, active: editor?.isActive("link") ?? false },
    { id: "image", label: <AppIcon name="camera" aria-hidden="true" />, ariaLabel: "이미지 추가", run: () => imageFileInputRef.current?.click(), active: false },
    { id: "code-block", label: <span aria-hidden="true">&lt;/&gt;</span>, ariaLabel: "코드 블록", run: insertCodeBlock, active: editor?.isActive("codeBlock") ?? false },
  ]

  const toolbarMoreActions: ToolbarAction[] = toolbarBlockActions.map((item) => ({
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
  }))

  const handleSlashMenuKeyboard = useCallback((event: SlashKeyboardEventLike) => {
    if (event.isComposing) return

    if (!flatSlashEntries.length && event.key === "Escape") {
      event.preventDefault()
      setSlashInteractionMode("keyboard")
      closeSlashMenu(true)
      return
    }

    if (event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey)) {
      event.preventDefault()
      setSlashInteractionMode("keyboard")
      setSelectedSlashIndex((prev) => {
        if (!flatSlashEntries.length) return 0
        return (prev + 1) % flatSlashEntries.length
      })
      return
    }

    if (event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey)) {
      event.preventDefault()
      setSlashInteractionMode("keyboard")
      setSelectedSlashIndex((prev) => {
        if (!flatSlashEntries.length) return 0
        return (prev - 1 + flatSlashEntries.length) % flatSlashEntries.length
      })
      return
    }

    if (event.key === "Home") {
      event.preventDefault()
      setSlashInteractionMode("keyboard")
      setSelectedSlashIndex(0)
      return
    }

    if (event.key === "End") {
      event.preventDefault()
      setSlashInteractionMode("keyboard")
      setSelectedSlashIndex(Math.max(flatSlashEntries.length - 1, 0))
      return
    }

    if (event.key === "Enter") {
      const selectedEntry = flatSlashEntries[selectedSlashIndex]
      if (!selectedEntry || selectedEntry.item.disabled) return
      event.preventDefault()
      void executeSlashCatalogAction(selectedEntry.item)
      return
    }

    if (event.key === "Backspace" && !slashQuery && slashMenuState && editor) {
      event.preventDefault()
      setSlashInteractionMode("keyboard")
      editor.chain().focus().deleteRange({ from: slashMenuState.from, to: slashMenuState.to }).run()
      closeSlashMenu()
      return
    }

    if (event.key === "Escape") {
      event.preventDefault()
      setSlashInteractionMode("keyboard")
      closeSlashMenu(true)
    }
  }, [closeSlashMenu, editor, executeSlashCatalogAction, flatSlashEntries, selectedSlashIndex, slashMenuState, slashQuery])

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
    if (typeof window === "undefined" || !isSlashMenuOpen) return

    const closeMenu = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (!["ArrowDown", "ArrowUp", "Tab", "Home", "End", "Enter", "Escape", "Backspace"].includes(event.key)) return
        handleSlashMenuKeyboard(event)
        return
      }

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
  }, [closeSlashMenu, flatSlashEntries, handleSlashMenuKeyboard, isSlashMenuOpen])

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

  const closeBlockMenus = useCallback(() => setBlockMenuState(null), [])

  const openBlockMenu = useCallback((blockIndex: number, anchorRect: DOMRect) => {
    setBlockMenuState((prev) =>
      prev && prev.blockIndex === blockIndex
        ? null
        : {
            blockIndex,
            left: Math.round(anchorRect.left),
            top: Math.round(anchorRect.bottom + 8),
          }
    )
  }, [])

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
      const nextIndicator = resolveDropIndicatorByClientY(event.clientY)
      setDropIndicatorState({
        visible: true,
        ...nextIndicator,
      })
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
    if (typeof window === "undefined") return
    const mediaQuery = window.matchMedia(BLOCK_HANDLE_MEDIA_QUERY)
    const sync = () => setIsCoarsePointer(mediaQuery.matches)
    sync()
    mediaQuery.addEventListener?.("change", sync)
    return () => mediaQuery.removeEventListener?.("change", sync)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const sync = () => setSelectionTick((prev) => prev + 1)
    window.addEventListener("scroll", sync, true)
    window.addEventListener("resize", sync)
    return () => {
      window.removeEventListener("scroll", sync, true)
      window.removeEventListener("resize", sync)
    }
  }, [])

  useEffect(() => {
    if (!editor) return
    const blockIndex = isCoarsePointer ? selectedBlockIndex : hoveredBlockIndex ?? selectedBlockIndex
    const blockElement = getTopLevelBlockElementByIndex(blockIndex)
    const canShowHandle = isTopLevelBlockHandleEligible(blockIndex)
    const shouldShow = Boolean(
      blockElement && canShowHandle && (isCoarsePointer || hoveredBlockIndex !== null || editor.isFocused)
    )

    if (!shouldShow || !blockElement) {
      setBlockHandleState((prev) => ({ ...prev, visible: false }))
      return
    }

    const rect = blockElement.getBoundingClientRect()
    setBlockHandleState({
      visible: true,
      blockIndex,
      left: Math.max(16, Math.round(rect.left - 54)),
      top: Math.round(rect.top + 8),
      bottom: Math.round(rect.bottom + 12),
      width: Math.round(rect.width),
    })
  }, [
    editor,
    getTopLevelBlockElementByIndex,
    hoveredBlockIndex,
    isCoarsePointer,
    isTopLevelBlockHandleEligible,
    selectedBlockIndex,
    selectionTick,
  ])

  const handleViewportPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const rowResizeState = tableRowResizeRef.current
      if (rowResizeState) {
        setViewportRowResizeHot(true)
        return
      }
      if (isCoarsePointer) return
      const cell = getTableCellFromTarget(event.target)
      setViewportRowResizeHot(isRowResizeHandleTarget(cell, event.clientX, event.clientY))
      setHoveredBlockIndex(findTopLevelBlockIndexFromTarget(event.target))
    },
    [findTopLevelBlockIndexFromTarget, getTableCellFromTarget, isCoarsePointer, isRowResizeHandleTarget, setViewportRowResizeHot]
  )

  const handleViewportPointerLeave = useCallback(() => {
    setHoveredBlockIndex(null)
    if (!tableRowResizeRef.current) {
      setViewportRowResizeHot(false)
    }
  }, [setViewportRowResizeHot])

  const handleViewportPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isCoarsePointer || tableRowResizeRef.current) return
      const cell = getTableCellFromTarget(event.target)
      if (!isRowResizeHandleTarget(cell, event.clientX, event.clientY) || !cell) return
      event.preventDefault()
      event.stopPropagation()
      startTableRowResize(cell, event.clientY)
    },
    [getTableCellFromTarget, isCoarsePointer, isRowResizeHandleTarget, startTableRowResize]
  )

  const handleViewportDragStart = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      const taskItemContext = findTaskItemDragContextFromTarget(event.target)
      if (!taskItemContext) return

      setDraggedTaskItemState({
        taskListBlockIndex: taskItemContext.taskListBlockIndex,
        sourceItemIndex: taskItemContext.sourceItemIndex,
      })
      setTaskItemDropIndicatorState({
        visible: true,
        taskListBlockIndex: taskItemContext.taskListBlockIndex,
        ...resolveTaskItemDropIndicatorByClientY(taskItemContext.taskListElement, event.clientY),
      })
      event.dataTransfer.effectAllowed = "move"
      event.dataTransfer.setData("text/plain", `task-item:${taskItemContext.taskListBlockIndex}:${taskItemContext.sourceItemIndex}`)
    },
    [findTaskItemDragContextFromTarget, resolveTaskItemDropIndicatorByClientY]
  )

  const handleViewportDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!draggedTaskItemState) return
      const taskItemContext = findTaskItemDragContextFromTarget(event.target)
      if (!taskItemContext || taskItemContext.taskListBlockIndex !== draggedTaskItemState.taskListBlockIndex) return

      event.preventDefault()
      setTaskItemDropIndicatorState({
        visible: true,
        taskListBlockIndex: taskItemContext.taskListBlockIndex,
        ...resolveTaskItemDropIndicatorByClientY(taskItemContext.taskListElement, event.clientY),
      })
    },
    [draggedTaskItemState, findTaskItemDragContextFromTarget, resolveTaskItemDropIndicatorByClientY]
  )

  const clearTaskItemDragState = useCallback(() => {
    setDraggedTaskItemState(null)
    setTaskItemDropIndicatorState((prev) => ({ ...prev, visible: false }))
  }, [])

  const handleViewportDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!draggedTaskItemState) return
      const taskItemContext = findTaskItemDragContextFromTarget(event.target)
      if (!taskItemContext || taskItemContext.taskListBlockIndex !== draggedTaskItemState.taskListBlockIndex) {
        clearTaskItemDragState()
        return
      }

      event.preventDefault()
      const indicator = resolveTaskItemDropIndicatorByClientY(taskItemContext.taskListElement, event.clientY)
      mutateTopLevelBlocks(
        (doc) =>
          moveTaskItemToInsertionIndex(
            doc,
            draggedTaskItemState.taskListBlockIndex,
            draggedTaskItemState.sourceItemIndex,
            indicator.insertionIndex
          ),
        draggedTaskItemState.taskListBlockIndex
      )
      clearTaskItemDragState()
    },
    [
      clearTaskItemDragState,
      draggedTaskItemState,
      findTaskItemDragContextFromTarget,
      mutateTopLevelBlocks,
      resolveTaskItemDropIndicatorByClientY,
    ]
  )

  const handleViewportDragEnd = useCallback(() => {
    clearTaskItemDragState()
  }, [clearTaskItemDragState])

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
                onClick={(event) => {
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
              onClick={(event) => {
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
        <QuickInsertHint>슬래시(`/`)나 `+` 없이도 자주 쓰는 블록을 바로 넣을 수 있습니다.</QuickInsertHint>
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
        onChange={(event) => {
          void handleImageInputChange(event)
        }}
      />

      <HiddenFileInput
        ref={attachmentFileInputRef}
        type="file"
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
          <SlashMenuHeader>
            <SlashMenuTitleGroup>
              <strong>블록 삽입</strong>
              <span>
                문단 안에서 <code>/검색어</code>를 입력하면 자동으로 필터링됩니다.
              </span>
            </SlashMenuTitleGroup>
            <SlashMenuCloseButton
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => closeSlashMenu(true)}
            >
              닫기
            </SlashMenuCloseButton>
          </SlashMenuHeader>
          <SlashQuerySummary>
            <strong>/</strong>
            <span>{slashQuery.trim().length ? slashQuery : "검색어를 입력하세요"}</span>
          </SlashQuerySummary>
          <SlashMenuStatusRow>
            <SlashMenuResultCount>{flatSlashEntries.length}개 결과</SlashMenuResultCount>
            <SlashMenuHintList>
              <SlashMenuHintPill>tab 이동</SlashMenuHintPill>
              <SlashMenuHintPill>↵ 삽입</SlashMenuHintPill>
              <SlashMenuHintPill>⌫ 제거</SlashMenuHintPill>
              <SlashMenuHintPill>esc 닫기</SlashMenuHintPill>
            </SlashMenuHintList>
          </SlashMenuStatusRow>
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
                          <SlashActionIcon aria-hidden="true">{getSlashActionGlyph(action)}</SlashActionIcon>
                          <SlashActionMain>
                            <SlashActionTitleRow>
                              <strong>{action.label}</strong>
                              <SlashActionSectionTag>{section.title}</SlashActionSectionTag>
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
          <SlashMenuFooter>
            <strong>메뉴 닫기</strong>
            <span>esc</span>
          </SlashMenuFooter>
        </SlashMenu>
      ) : null}

      <EditorViewport
        data-testid="block-editor-viewport"
        ref={viewportRef}
        onCompositionStart={() => {
          setIsSlashImeComposing(true)
        }}
        onCompositionEnd={() => {
          setIsSlashImeComposing(false)
          requestAnimationFrame(() => {
            applyResolvedSlashMenuState(resolveSlashMenuState())
          })
        }}
        onPointerMove={handleViewportPointerMove}
        onPointerLeave={handleViewportPointerLeave}
        onPointerDown={handleViewportPointerDown}
        onDragStart={handleViewportDragStart}
        onDragOver={handleViewportDragOver}
        onDrop={handleViewportDrop}
        onDragEnd={handleViewportDragEnd}
      >
        {editor && bubbleState.visible ? (
          <FloatingBubbleToolbar
            style={{
              left: `${bubbleState.left}px`,
              top: `${bubbleState.top}px`,
            }}
          >
            {bubbleState.mode === "text" ? (
              <BubbleToolbar>
                <ToolbarButton type="button" data-active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
                  굵게
                </ToolbarButton>
                <ToolbarButton type="button" data-active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
                  기울임
                </ToolbarButton>
                <ToolbarButton type="button" data-active={editor.isActive("link")} onClick={openLinkPrompt}>
                  링크
                </ToolbarButton>
                <ToolbarButton type="button" data-active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
                  인라인 코드
                </ToolbarButton>
              </BubbleToolbar>
            ) : bubbleState.mode === "image" ? (
              <BubbleToolbar>
                <ToolbarButton type="button" data-active={editor.getAttributes("resizableImage").align === "left"} onClick={() => editor.chain().focus().updateAttributes("resizableImage", { align: "left" }).run()}>
                  좌측
                </ToolbarButton>
                <ToolbarButton type="button" data-active={editor.getAttributes("resizableImage").align === "center"} onClick={() => editor.chain().focus().updateAttributes("resizableImage", { align: "center" }).run()}>
                  가운데
                </ToolbarButton>
                <ToolbarButton type="button" data-active={editor.getAttributes("resizableImage").align === "wide"} onClick={() => editor.chain().focus().updateAttributes("resizableImage", { align: "wide" }).run()}>
                  와이드
                </ToolbarButton>
                <ToolbarButton type="button" data-active={editor.getAttributes("resizableImage").align === "full"} onClick={() => editor.chain().focus().updateAttributes("resizableImage", { align: "full" }).run()}>
                  전체 폭
                </ToolbarButton>
              </BubbleToolbar>
            ) : (
              <BubbleToolbar data-layout="table">
                <ToolbarButton type="button" onClick={() => editor.chain().focus().addRowBefore().run()}>
                  행 위
                </ToolbarButton>
                <ToolbarButton type="button" onClick={() => editor.chain().focus().addRowAfter().run()}>
                  행 아래
                </ToolbarButton>
                <ToolbarButton type="button" onClick={() => editor.chain().focus().addColumnBefore().run()}>
                  열 왼쪽
                </ToolbarButton>
                <ToolbarButton type="button" onClick={() => editor.chain().focus().addColumnAfter().run()}>
                  열 오른쪽
                </ToolbarButton>
                <ToolbarButton type="button" data-active={editor.isActive("tableHeader")} onClick={() => editor.chain().focus().toggleHeaderRow().run()}>
                  헤더
                </ToolbarButton>
                <ToolbarButton
                  type="button"
                  onClick={() => editor.chain().focus().mergeCells().run()}
                >
                  셀 병합
                </ToolbarButton>
                <ToolbarButton
                  type="button"
                  onClick={() => editor.chain().focus().splitCell().run()}
                >
                  셀 분리
                </ToolbarButton>
                <ToolbarButton
                  type="button"
                  data-active={activeTableCellAttrs.textAlign === "left"}
                  onClick={() => updateActiveTableCellAttrs({ textAlign: "left" })}
                >
                  좌측
                </ToolbarButton>
                <ToolbarButton
                  type="button"
                  data-active={activeTableCellAttrs.textAlign === "center"}
                  onClick={() => updateActiveTableCellAttrs({ textAlign: "center" })}
                >
                  가운데
                </ToolbarButton>
                <ToolbarButton
                  type="button"
                  data-active={activeTableCellAttrs.textAlign === "right"}
                  onClick={() => updateActiveTableCellAttrs({ textAlign: "right" })}
                >
                  우측
                </ToolbarButton>
                <ToolbarButton
                  type="button"
                  data-active={activeTableCellAttrs.backgroundColor === "#f8fafc"}
                  onClick={() => updateActiveTableCellAttrs({ backgroundColor: "#f8fafc" })}
                >
                  기본
                </ToolbarButton>
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
                </TablePresetSwatches>
                <TableColorInput
                  type="color"
                  aria-label="표 셀 배경색 선택"
                  value={normalizeTableColorInputValue(activeTableCellAttrs.backgroundColor)}
                  onChange={(event) =>
                    updateActiveTableCellAttrs({ backgroundColor: event.currentTarget.value })
                  }
                />
                <ToolbarButton
                  type="button"
                  onClick={() => updateActiveTableCellAttrs({ backgroundColor: null })}
                >
                  배경 해제
                </ToolbarButton>
                <ToolbarButton type="button" data-variant="subtle-danger" onClick={() => editor.chain().focus().deleteRow().run()}>
                  행 삭제
                </ToolbarButton>
                <ToolbarButton type="button" data-variant="subtle-danger" onClick={() => editor.chain().focus().deleteColumn().run()}>
                  열 삭제
                </ToolbarButton>
                <ToolbarButton type="button" data-variant="danger" onClick={() => editor.chain().focus().deleteTable().run()}>
                  표 삭제
                </ToolbarButton>
              </BubbleToolbar>
            )}
          </FloatingBubbleToolbar>
        ) : null}
        {!isCoarsePointer && blockHandleState.visible ? (
          <BlockHandleRail
            style={{
              left: `${blockHandleState.left}px`,
              top: `${blockHandleState.top}px`,
            }}
          >
            <BlockHandleButton
              type="button"
              aria-label="블록 이동"
              data-variant="drag"
              data-testid="block-drag-handle"
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                const indicator = resolveDropIndicatorByClientY(event.clientY)
                setDraggedBlockState({
                  sourceIndex: blockHandleState.blockIndex,
                  pointerId: event.pointerId,
                })
                setDropIndicatorState({
                  visible: true,
                  ...indicator,
                })
              }}
            >
              ⋮⋮
            </BlockHandleButton>
            <BlockHandleButton
              type="button"
              aria-label="삽입"
              onClick={(event) => {
                event.stopPropagation()
                openBlockMenu(blockHandleState.blockIndex, event.currentTarget.getBoundingClientRect())
              }}
            >
              +
            </BlockHandleButton>
          </BlockHandleRail>
        ) : null}
        {dropIndicatorState.visible ? (
          <BlockDropIndicator
            style={{
              left: `${dropIndicatorState.left}px`,
              top: `${dropIndicatorState.top}px`,
              width: `${dropIndicatorState.width}px`,
            }}
          />
        ) : null}
        {taskItemDropIndicatorState.visible ? (
          <BlockDropIndicator
            data-kind="task-item"
            style={{
              left: `${taskItemDropIndicatorState.left}px`,
              top: `${taskItemDropIndicatorState.top}px`,
              width: `${taskItemDropIndicatorState.width}px`,
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
              onClick={(event) => {
                event.stopPropagation()
                openBlockMenu(blockHandleState.blockIndex, event.currentTarget.getBoundingClientRect())
              }}
            >
              +
            </ToolbarButton>
            <ToolbarButton type="button" onClick={() => moveBlockByStep(blockHandleState.blockIndex, -1)}>
              위로
            </ToolbarButton>
            <ToolbarButton type="button" onClick={() => moveBlockByStep(blockHandleState.blockIndex, 1)}>
              아래로
            </ToolbarButton>
            <ToolbarButton type="button" onClick={() => duplicateBlock(blockHandleState.blockIndex)}>
              복제
            </ToolbarButton>
            <ToolbarButton type="button" data-variant="subtle-danger" onClick={() => deleteBlock(blockHandleState.blockIndex)}>
              삭제
            </ToolbarButton>
          </MobileBlockActionBar>
        ) : null}
        {blockMenuState ? (
          <FloatingBlockMenu
            data-block-menu-root="true"
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
        <EditorContent editor={editor} data-testid="block-editor-content" />
      </EditorViewport>

      {preview ? (
        <AuxDisclosure open={isPreviewOpen}>
          <summary
            onClick={(event) => {
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
  gap: 0.72rem;
  width: min(38rem, calc(100vw - 2rem));
  padding: 0.9rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 1.25rem;
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(18, 21, 26, 0.98)" : "rgba(255, 255, 255, 0.98)"};
  box-shadow: ${({ theme }) =>
    theme.scheme === "dark" ? "0 24px 48px rgba(0, 0, 0, 0.22)" : "0 24px 48px rgba(15, 23, 42, 0.14)"};
  backdrop-filter: blur(18px);
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

const SlashMenuHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding-bottom: 0.1rem;
`

const SlashMenuTitleGroup = styled.div`
  display: grid;
  gap: 0.16rem;

  strong {
    font-size: 0.98rem;
    color: var(--color-gray12);
  }

  span {
    color: var(--color-gray10);
    font-size: 0.76rem;
    line-height: 1.45;
  }

  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
      "Courier New", monospace;
    font-size: 0.74rem;
  }
`

const SlashMenuCloseButton = styled.button`
  min-height: 1.9rem;
  padding: 0 0.62rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(18, 21, 26, 0.52)" : "rgba(255, 255, 255, 0.9)"};
  color: var(--color-gray10);
  font-size: 0.76rem;
  font-weight: 800;
  transition: border-color 140ms ease, background-color 140ms ease, color 140ms ease;

  &:hover,
  &:focus-visible {
    border-color: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(96, 165, 250, 0.24)" : "rgba(59, 130, 246, 0.16)"};
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(24, 29, 38, 0.82)" : "rgba(248, 250, 252, 0.96)"};
    color: var(--color-gray12);
  }
`

const SlashQuerySummary = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  min-height: 2.9rem;
  border-radius: 0.9rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(12, 16, 22, 0.9)" : "rgba(245, 247, 250, 0.92)"};
  padding: 0 0.95rem;

  strong {
    color: ${({ theme }) => theme.colors.blue9};
    font-size: 0.98rem;
    font-weight: 900;
  }

  span {
    color: var(--color-gray12);
    font-size: 0.88rem;
    font-weight: 600;
  }
`

const SlashMenuStatusRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
`

const SlashMenuResultCount = styled.span`
  color: var(--color-gray10);
  font-size: 0.76rem;
  font-weight: 700;
`

const SlashMenuHintList = styled.div`
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.35rem;
`

const SlashMenuHintPill = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 1.55rem;
  padding: 0 0.5rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(18, 21, 26, 0.52)" : "rgba(255, 255, 255, 0.88)"};
  color: var(--color-gray10);
  font-size: 0.72rem;
  font-weight: 700;
`

const SlashMenuBody = styled.div`
  display: grid;
  gap: 0.9rem;
  max-height: min(62vh, 32rem);
  overflow-y: auto;
  padding-right: 0.15rem;

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
  gap: 0.42rem;

  & + & {
    padding-top: 0.28rem;
    border-top: 1px solid ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(255, 255, 255, 0.04)" : "rgba(15, 23, 42, 0.05)"};
  }
`

const SlashMenuSectionLabel = styled.strong`
  display: inline-flex;
  align-items: center;
  min-height: 1.4rem;
  color: var(--color-gray10);
  font-size: 0.8rem;
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
  min-width: 2.35rem;
  height: 2.35rem;
  border-radius: 0.82rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(12, 16, 22, 0.84)" : "rgba(245, 247, 250, 0.96)"};
  color: var(--color-gray12);
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: -0.02em;
`

const SlashActionMain = styled.span`
  display: grid;
  gap: 0.1rem;
  text-align: left;

  strong {
    font-size: 0.95rem;
    color: var(--color-gray12);
  }

  span {
    color: var(--color-gray10);
    font-size: 0.76rem;
    line-height: 1.45;
  }
`

const SlashActionTitleRow = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
`

const SlashActionSectionTag = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 1.3rem;
  padding: 0 0.42rem;
  border-radius: 999px;
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(96, 165, 250, 0.14)" : "rgba(59, 130, 246, 0.08)"};
  color: ${({ theme }) => theme.colors.blue9};
  font-size: 0.68rem;
  font-weight: 800;
`

const SlashActionHint = styled.span`
  color: var(--color-gray10);
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: -0.01em;
`

const SlashActionButton = styled.button`
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.8rem;
  min-height: 3.35rem;
  border-radius: 0.9rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(18, 21, 26, 0.48)" : "rgba(255, 255, 255, 0.96)"};
  padding: 0.8rem 0.9rem 0.8rem 1.05rem;
  text-align: left;
  transition: border-color 140ms ease, background-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;

  &:hover:not(:disabled),
  &:focus-visible:not(:disabled) {
    border-color: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(96, 165, 250, 0.24)" : "rgba(59, 130, 246, 0.16)"};
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(24, 29, 38, 0.74)" : "rgba(248, 250, 252, 0.98)"};
    box-shadow: ${({ theme }) =>
      theme.scheme === "dark" ? "0 12px 24px rgba(0, 0, 0, 0.14)" : "0 10px 22px rgba(15, 23, 42, 0.06)"};
  }

  &[data-active="true"] {
    border-color: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(96, 165, 250, 0.42)" : "rgba(59, 130, 246, 0.28)"};
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(30, 41, 59, 0.7)" : "rgba(239, 246, 255, 0.92)"};
    box-shadow: ${({ theme }) =>
      theme.scheme === "dark" ? "0 14px 28px rgba(15, 23, 42, 0.22)" : "0 12px 24px rgba(59, 130, 246, 0.12)"};
    transform: translateY(-1px);
  }

  &[data-active="true"][data-input-mode="keyboard"] {
    border-color: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(96, 165, 250, 0.48)" : "rgba(59, 130, 246, 0.32)"};
    box-shadow: ${({ theme }) =>
      theme.scheme === "dark"
        ? "0 16px 30px rgba(15, 23, 42, 0.24), inset 0 0 0 1px rgba(96, 165, 250, 0.18)"
        : "0 14px 26px rgba(59, 130, 246, 0.14), inset 0 0 0 1px rgba(59, 130, 246, 0.12)"};
  }

  &[data-active="true"][data-input-mode="pointer"] {
    transform: translateY(-0.5px);
    box-shadow: ${({ theme }) =>
      theme.scheme === "dark" ? "0 12px 24px rgba(15, 23, 42, 0.18)" : "0 10px 22px rgba(59, 130, 246, 0.1)"};
  }

  &[data-active="true"]::before {
    content: "";
    position: absolute;
    left: 0.42rem;
    top: 0.52rem;
    bottom: 0.52rem;
    width: 3px;
    border-radius: 999px;
    background: ${({ theme }) => theme.colors.blue8};
  }

  &[data-active="true"] ${SlashActionIcon} {
    border-color: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(96, 165, 250, 0.38)" : "rgba(59, 130, 246, 0.22)"};
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(30, 41, 59, 0.92)" : "rgba(219, 234, 254, 0.95)"};
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
  min-height: 8rem;
  border-radius: 1rem;
  border: 1px dashed ${({ theme }) => theme.colors.gray6};
  color: var(--color-gray10);
  font-size: 0.86rem;
  font-weight: 700;
`

const SlashMenuFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding-top: 0.2rem;
  border-top: 1px solid ${({ theme }) => theme.colors.gray6};

  strong {
    font-size: 0.84rem;
    color: var(--color-gray12);
  }

  span {
    color: var(--color-gray10);
    font-size: 0.8rem;
    font-weight: 700;
  }
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
    width: min(100%, var(--compose-pane-readable-width, var(--article-readable-width, 48rem)));
    min-width: 0;
    margin-left: auto;
    margin-right: auto;
  }

  .aq-block-editor__content p.is-editor-empty:first-of-type::before {
    content: attr(data-placeholder);
    color: var(--color-gray10);
    float: left;
    height: 0;
    pointer-events: none;
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
  }

  .aq-block-editor__content ul[data-type="taskList"],
  .aq-block-editor__content ul[data-task-list="true"] {
    width: min(100%, var(--compose-pane-readable-width, var(--article-readable-width, 48rem)));
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
  }

  .aq-block-editor__content li[data-type="taskItem"]:active,
  .aq-block-editor__content li[data-task-item="true"]:active {
    cursor: grabbing;
  }

  .aq-block-editor__content li[data-type="taskItem"] > label,
  .aq-block-editor__content li[data-task-item="true"] > label {
    margin-top: 0.28rem;
  }

  .aq-block-editor__content li[data-type="taskItem"] > div,
  .aq-block-editor__content li[data-task-item="true"] > div {
    flex: 1;
    min-width: 0;
  }

  .aq-block-editor__content table {
    width: max-content;
    min-width: 100%;
    max-width: none;
    margin: 0;
    border-collapse: separate;
    border-spacing: 0;
    table-layout: auto;
    background: transparent;
  }

  .aq-block-editor__content .tableWrapper {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    margin: 1rem auto;
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
    min-width: ${TABLE_MIN_COLUMN_WIDTH_PX}px;
    min-height: ${TABLE_MIN_ROW_HEIGHT_PX}px;
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
    background: transparent;
  }

  .aq-block-editor__content tr > :is(th, td):last-child {
    border-right: 0;
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
    position: absolute;
    top: 0;
    right: -3px;
    width: 6px;
    height: 100%;
    background: rgba(96, 165, 250, 0.62);
    border-radius: 999px;
    pointer-events: none;
  }

  .aq-block-editor__content.resize-cursor {
    cursor: col-resize;
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

const FloatingBubbleToolbar = styled.div`
  position: fixed;
  z-index: 60;
  transform: translate(-50%, calc(-100% - 0.65rem));
  pointer-events: none;

  > * {
    pointer-events: auto;
  }
`

const BlockHandleRail = styled.div`
  position: fixed;
  z-index: 55;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
`

const BlockHandleButton = styled.button`
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 0.7rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(18, 21, 26, 0.62)" : "rgba(255, 255, 255, 0.98)"};
  color: var(--color-gray11);
  font-size: 0.76rem;
  font-weight: 800;
  box-shadow: ${({ theme }) =>
    theme.scheme === "dark" ? "0 8px 14px rgba(0, 0, 0, 0.12)" : "0 8px 14px rgba(15, 23, 42, 0.08)"};

  &[data-variant="drag"] {
    cursor: grab;
    letter-spacing: -0.1em;
  }
`

const BlockDropIndicator = styled.div`
  position: fixed;
  z-index: 54;
  height: 3px;
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.blue8};
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.12);
  pointer-events: none;
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

const QuickInsertHint = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.84rem;
  line-height: 1.55;
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
