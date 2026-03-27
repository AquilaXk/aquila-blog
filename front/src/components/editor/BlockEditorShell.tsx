import type { Editor as TiptapEditor } from "@tiptap/core"
import styled from "@emotion/styled"
import AppIcon from "src/components/icons/AppIcon"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import { Table } from "@tiptap/extension-table"
import TableCell from "@tiptap/extension-table-cell"
import TableHeader from "@tiptap/extension-table-header"
import TableRow from "@tiptap/extension-table-row"
import StarterKit from "@tiptap/starter-kit"
import { EditorContent, useEditor } from "@tiptap/react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react"
import {
  CalloutBlock,
  EditorCodeBlock,
  getPreferredCodeLanguage,
  MermaidBlock,
  RawMarkdownBlock,
  ResizableImage,
  ToggleBlock,
} from "./extensions"
import {
  deleteTopLevelBlockAt,
  duplicateTopLevelBlockAt,
  insertTopLevelBlockAt,
  moveTopLevelBlockToInsertionIndex,
} from "./blockDocumentOps"
import {
  parseMarkdownToEditorDoc,
  serializeEditorDocToMarkdown,
  type BlockEditorDoc,
  type ImageBlockAttrs,
} from "./serialization"

type Props = {
  value: string
  onChange: (markdown: string) => void
  onUploadImage: (file: File) => Promise<ImageBlockAttrs>
  disabled?: boolean
  className?: string
  preview?: ReactNode
  enableMermaidBlocks?: boolean
}

type SlashAction = {
  id: string
  label: string
  helper?: string
  run: () => void | Promise<void>
  disabled?: boolean
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

type BlockMenuState =
  | {
      blockIndex: number
      left: number
      top: number
    }
  | null

type TableRowResizeState = {
  row: HTMLTableRowElement
  cells: HTMLTableCellElement[]
  startY: number
  startHeight: number
}

type InsertMenuAction = {
  id: string
  label: string
  helper?: string
  insertAt: (blockIndex: number) => void
  disabled?: boolean
}

const RAW_BLOCK_PLACEHOLDER = "```text\n원문 블록\n```"
const MERMAID_RAW_PLACEHOLDER = "```mermaid\nflowchart TD\n  A[시작] --> B[처리]\n```"
const BLOCK_HANDLE_MEDIA_QUERY = "(pointer: coarse), (max-width: 1024px)"
const TABLE_ROW_RESIZE_EDGE_PX = 6
const TABLE_COLUMN_RESIZE_GUARD_PX = 12
const TABLE_MIN_ROW_HEIGHT_PX = 44

const blockHasVisibleContent = (node?: BlockEditorDoc | null): boolean => {
  if (!node) return false

  if (node.type === "text") {
    return Boolean((node as { text?: string }).text?.trim().length)
  }

  if (
    node.type === "resizableImage" ||
    node.type === "calloutBlock" ||
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
const DEFAULT_TABLE_CONFIG = { rows: 3, cols: 2, withHeaderRow: true } as const

const normalizeMarkdown = (value: string) => value.replace(/\r\n?/g, "\n").trim()

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

const extractPlainTextFromHtml = (html: string) => {
  if (typeof window === "undefined") return ""
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")
  return doc.body.textContent?.replace(/\r\n?/g, "\n").trim() || ""
}

const escapeMarkdownTableCellText = (text: string) => text.replace(/\\/g, "\\\\").replace(/\|/g, "\\|")

const convertHtmlNodeToMarkdown = (node: ChildNode): string => {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || ""
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return ""

  const element = node as HTMLElement
  const tagName = element.tagName.toLowerCase()

  if (tagName === "br") return "\n"

  if (tagName === "pre") {
    const codeElement = element.querySelector("code")
    const source = (codeElement?.textContent || element.textContent || "").replace(/\r\n?/g, "\n").trimEnd()
    const className = codeElement?.className || ""
    const languageMatch = className.match(/language-([\w-]+)/i)
    const language = languageMatch?.[1] || ""
    return `\`\`\`${language}\n${source}\n\`\`\``
  }

  if (tagName === "table") {
    const rows = Array.from(element.querySelectorAll("tr"))
      .map((row) =>
        Array.from(row.querySelectorAll("th,td")).map((cell) =>
          escapeMarkdownTableCellText((cell.textContent || "").replace(/\s+/g, " ").trim())
        )
      )
      .filter((row) => row.length > 0)

    if (rows.length >= 2) {
      const [header, ...body] = rows
      const separator = header.map(() => "---")
      return [
        `| ${header.join(" | ")} |`,
        `| ${separator.join(" | ")} |`,
        ...body.map((row) => `| ${row.join(" | ")} |`),
      ].join("\n")
    }
  }

  if (tagName === "ul" || tagName === "ol") {
    const items = Array.from(element.children)
      .filter((child) => child.tagName.toLowerCase() === "li")
      .map((child, index) => {
        const text = Array.from(child.childNodes)
          .map((childNode) => convertHtmlNodeToMarkdown(childNode))
          .join("")
          .replace(/\n{2,}/g, "\n")
          .trim()
        return tagName === "ol" ? `${index + 1}. ${text}` : `- ${text}`
      })
    return items.join("\n")
  }

  if (/^h[1-6]$/.test(tagName)) {
    const level = Number.parseInt(tagName.replace("h", ""), 10)
    const text = Array.from(element.childNodes)
      .map((child) => convertHtmlNodeToMarkdown(child))
      .join("")
      .replace(/\s+/g, " ")
      .trim()
    return `${"#".repeat(level)} ${text}`.trim()
  }

  if (tagName === "blockquote") {
    const text = Array.from(element.childNodes)
      .map((child) => convertHtmlNodeToMarkdown(child))
      .join("")
      .replace(/\n{2,}/g, "\n")
      .trim()
    return text
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n")
  }

  if (tagName === "code") {
    const text = (element.textContent || "").replace(/\r\n?/g, "\n")
    return `\`${text}\``
  }

  const inlineText = Array.from(element.childNodes)
    .map((child) => convertHtmlNodeToMarkdown(child))
    .join("")
    .replace(/[ \t]+\n/g, "\n")

  if (tagName === "p" || tagName === "div" || tagName === "section" || tagName === "article") {
    return inlineText.trim()
  }

  return inlineText
}

const convertHtmlToMarkdown = (html: string) => {
  if (typeof window === "undefined") return ""
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")
  return Array.from(doc.body.childNodes)
    .map((node) => convertHtmlNodeToMarkdown(node))
    .filter((section) => section.trim().length > 0)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

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
  disabled = false,
  className,
  preview,
  enableMermaidBlocks = false,
}: Props) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const pendingImageInsertIndexRef = useRef<number | null>(null)
  const lastCommittedMarkdownRef = useRef(normalizeMarkdown(value))
  const editorRef = useRef<TiptapEditor | null>(null)
  const tableRowResizeRef = useRef<TableRowResizeState | null>(null)
  const [rawMarkdownDraft, setRawMarkdownDraft] = useState(value)
  const [isRawMarkdownOpen, setIsRawMarkdownOpen] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isSlashMenuOpen, setIsSlashMenuOpen] = useState(false)
  const [isToolbarMoreOpen, setIsToolbarMoreOpen] = useState(false)
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

  const syncSerializedDoc = useCallback(
    (nextDoc: BlockEditorDoc) => {
      const serialized = serializeEditorDocToMarkdown(nextDoc)
      lastCommittedMarkdownRef.current = normalizeMarkdown(serialized)
      setRawMarkdownDraft(serialized)
      onChange(serialized)
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
      Placeholder.configure({
        placeholder: "당신의 이야기를 적어보세요...",
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      EditorCodeBlock,
      RawMarkdownBlock,
      ResizableImage,
      CalloutBlock,
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

        if (
          event.key === "/" &&
          !hasPrimaryModifier &&
          !event.altKey &&
          !event.shiftKey &&
          currentEditor.isActive("paragraph") &&
          currentEditor.state.selection.empty &&
          currentEditor.state.selection.$from.parent.textContent.length === 0
        ) {
          event.preventDefault()
          setIsSlashMenuOpen(true)
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
        const normalizedPlainText = plainText.replace(/\r\n?/g, "\n").trim()
        const normalizedHtmlMarkdown = html ? convertHtmlToMarkdown(html) : ""

        if (isSelectionInEmptyParagraph() && normalizedPlainText) {
          const looksLikeStructuredBlock =
            normalizedPlainText.startsWith("```mermaid") ||
            normalizedPlainText.startsWith(":::toggle") ||
            normalizedPlainText.startsWith("> [!") ||
            normalizedPlainText.startsWith("| ") ||
            normalizedPlainText.startsWith("```")

          if (looksLikeStructuredBlock) {
            event.preventDefault()
            const parsedDoc = downgradeDisabledFeatureNodes(
              parseMarkdownToEditorDoc(normalizedPlainText),
              enableMermaidBlocks
            )
            return insertDocContent(parsedDoc, true)
          }
        }

        if (html && normalizedHtmlMarkdown) {
          event.preventDefault()
          const parsedDoc = downgradeDisabledFeatureNodes(
            parseMarkdownToEditorDoc(normalizedHtmlMarkdown),
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
      lastCommittedMarkdownRef.current = normalized
      setRawMarkdownDraft(markdown)
      onChange(markdown)
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
  }, [stopTableRowResize])

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
      setRawMarkdownDraft(value)
      return
    }

    const nextDoc = downgradeDisabledFeatureNodes(parseMarkdownToEditorDoc(value), enableMermaidBlocks)
    editor.commands.setContent(nextDoc, { emitUpdate: false })
    lastCommittedMarkdownRef.current = normalizeMarkdown(serializeEditorDocToMarkdown(nextDoc))
    setRawMarkdownDraft(value)
  }, [editor, enableMermaidBlocks, value])

  const focusEditor = useCallback(() => {
    editor?.chain().focus().run()
    setIsSlashMenuOpen(false)
  }, [editor])

  const insertParagraphAfterBlock = useCallback((block: BlockEditorDoc) => {
    if (!editor) return
    editor
      .chain()
      .focus()
      .insertContent([block, { type: "paragraph" }])
      .run()
    setIsSlashMenuOpen(false)
  }, [editor])

  const insertRawMarkdownBlock = useCallback(
    (markdown = RAW_BLOCK_PLACEHOLDER, reason = "manual-raw") => {
      insertParagraphAfterBlock({
        type: "rawMarkdownBlock",
        attrs: {
          markdown,
          reason,
        },
      })
      setIsRawMarkdownOpen(false)
    },
    [insertParagraphAfterBlock]
  )

  const insertMermaidBlock = useCallback(() => {
    if (enableMermaidBlocks) {
      insertParagraphAfterBlock({
        type: "mermaidBlock",
        attrs: {
          source: "flowchart TD\n  A[시작] --> B[처리]",
        },
      })
      return
    }

    insertRawMarkdownBlock(MERMAID_RAW_PLACEHOLDER, "unsupported-mermaid")
  }, [enableMermaidBlocks, insertParagraphAfterBlock, insertRawMarkdownBlock])

  const insertCalloutBlock = useCallback(() => {
    insertParagraphAfterBlock({
      type: "calloutBlock",
      attrs: {
        kind: "tip",
        title: "핵심 포인트",
        body: "콜아웃 본문을 입력하세요.",
      },
    })
  }, [insertParagraphAfterBlock])

  const insertToggleBlock = useCallback(() => {
    insertParagraphAfterBlock({
      type: "toggleBlock",
      attrs: {
        title: "더 보기",
        body: "토글 내부 본문을 입력하세요.",
      },
    })
  }, [insertParagraphAfterBlock])

  const insertTableBlock = useCallback(() => {
    if (!editor) return
    if (isTableSelectionActive(editor)) return
    editor.chain().focus().insertTable(DEFAULT_TABLE_CONFIG).run()
  }, [editor])

  const canInsertTable = !isTableSelectionActive(editor)

  const insertCodeBlock = useCallback(() => {
    if (!editor) return
    if (editor.isActive("codeBlock")) {
      editor.chain().focus().toggleCodeBlock().run()
      return
    }
    editor
      .chain()
      .focus()
      .setCodeBlock({ language: getPreferredCodeLanguage() })
      .run()
  }, [editor])

  const buildStructuredInsertContent = useCallback(
    (markdown: string) => {
      const parsedDoc = downgradeDisabledFeatureNodes(parseMarkdownToEditorDoc(markdown), enableMermaidBlocks)
      return (parsedDoc.content?.length ? parsedDoc.content : [{ type: "paragraph" }]) as NonNullable<
        BlockEditorDoc["content"]
      >
    },
    [enableMermaidBlocks]
  )

  const insertBlocksAtIndex = useCallback(
    (insertionIndex: number, blocks: NonNullable<BlockEditorDoc["content"]>, focusIndex = insertionIndex) => {
      mutateTopLevelBlocks((doc) => insertTopLevelBlockAt(doc, insertionIndex, blocks), focusIndex)
    },
    [mutateTopLevelBlocks]
  )

  const insertMenuActions = useMemo<InsertMenuAction[]>(
    () => [
      {
        id: "heading-2",
        label: "제목 2",
        helper: "큰 섹션 제목",
        insertAt: (blockIndex) => insertBlocksAtIndex(blockIndex + 1, buildStructuredInsertContent("## 제목")),
      },
      {
        id: "heading-3",
        label: "제목 3",
        helper: "작은 섹션 제목",
        insertAt: (blockIndex) => insertBlocksAtIndex(blockIndex + 1, buildStructuredInsertContent("### 제목")),
      },
      {
        id: "bullet-list",
        label: "불릿 리스트",
        helper: "순서 없는 항목",
        insertAt: (blockIndex) => insertBlocksAtIndex(blockIndex + 1, buildStructuredInsertContent("- 항목")),
      },
      {
        id: "ordered-list",
        label: "번호 리스트",
        helper: "순서 있는 항목",
        insertAt: (blockIndex) => insertBlocksAtIndex(blockIndex + 1, buildStructuredInsertContent("1. 항목")),
      },
      {
        id: "quote",
        label: "인용문",
        helper: "본문 인용",
        insertAt: (blockIndex) => insertBlocksAtIndex(blockIndex + 1, buildStructuredInsertContent("> 인용문")),
      },
      {
        id: "code-block",
        label: "코드 블록",
        helper: "언어 지정 가능",
        insertAt: (blockIndex) =>
          insertBlocksAtIndex(blockIndex + 1, buildStructuredInsertContent("```text\n코드를 입력하세요.\n```")),
      },
      {
        id: "table",
        label: "테이블",
        helper: "2열 헤더 포함",
        insertAt: (blockIndex) =>
          insertBlocksAtIndex(
            blockIndex + 1,
            buildStructuredInsertContent(["| 제목 | 값 |", "| --- | --- |", "| 항목 | 내용 |"].join("\n"))
          ),
        disabled: !canInsertTable,
      },
      {
        id: "callout",
        label: "콜아웃",
        helper: "핵심 내용을 강조합니다",
        insertAt: (blockIndex) =>
          insertBlocksAtIndex(
            blockIndex + 1,
            buildStructuredInsertContent(["> [!TIP] 핵심 포인트", "> 콜아웃 본문을 입력하세요."].join("\n"))
          ),
      },
      {
        id: "toggle",
        label: "토글",
        helper: "긴 보충 설명을 접어 둡니다",
        insertAt: (blockIndex) =>
          insertBlocksAtIndex(
            blockIndex + 1,
            buildStructuredInsertContent([":::toggle 더 보기", "토글 내부 본문을 입력하세요.", ":::"].join("\n"))
          ),
      },
      {
        id: "mermaid",
        label: "다이어그램",
        helper: enableMermaidBlocks ? "Mermaid" : "원문 블록으로 유지",
        insertAt: (blockIndex) =>
          insertBlocksAtIndex(
            blockIndex + 1,
            buildStructuredInsertContent(
              enableMermaidBlocks
                ? ["```mermaid", "flowchart TD", "  A[시작] --> B[처리]", "```"].join("\n")
                : MERMAID_RAW_PLACEHOLDER
            )
          ),
      },
      {
        id: "image",
        label: "이미지",
        helper: "업로드 후 본문에 삽입",
        insertAt: (blockIndex) => {
          pendingImageInsertIndexRef.current = blockIndex + 1
          fileInputRef.current?.click()
        },
      },
      {
        id: "divider",
        label: "구분선",
        helper: "섹션 구분",
        insertAt: (blockIndex) => insertBlocksAtIndex(blockIndex + 1, buildStructuredInsertContent("---")),
      },
      {
        id: "raw",
        label: "원문 블록",
        helper: "특수 markdown을 그대로 유지",
        insertAt: (blockIndex) =>
          insertBlocksAtIndex(blockIndex + 1, [
            {
              type: "rawMarkdownBlock",
              attrs: {
                markdown: RAW_BLOCK_PLACEHOLDER,
                reason: "manual-raw",
              },
            },
            { type: "paragraph" },
          ]),
      },
    ],
    [buildStructuredInsertContent, canInsertTable, enableMermaidBlocks, insertBlocksAtIndex]
  )

  const applyRawMarkdownDraft = useCallback(() => {
    if (!editor) return
    const nextDoc = downgradeDisabledFeatureNodes(parseMarkdownToEditorDoc(rawMarkdownDraft), enableMermaidBlocks)
    const serialized = serializeEditorDocToMarkdown(nextDoc)
    editor.commands.setContent(nextDoc, { emitUpdate: false })
    lastCommittedMarkdownRef.current = normalizeMarkdown(serialized)
    setRawMarkdownDraft(serialized)
    onChange(serialized)
  }, [editor, enableMermaidBlocks, onChange, rawMarkdownDraft])

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

  const slashActions = useMemo<SlashAction[]>(() => {
    if (!editor) return []

    return [
      {
        id: "heading-2",
        label: "소제목",
        helper: "큰 흐름을 나눕니다",
        run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        id: "heading-3",
        label: "작은 소제목",
        helper: "짧은 소단락을 나눕니다",
        run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      },
      {
        id: "bullet-list",
        label: "목록",
        helper: "순서 없는 항목",
        run: () => editor.chain().focus().toggleBulletList().run(),
      },
      {
        id: "ordered-list",
        label: "번호 목록",
        helper: "순서 있는 항목",
        run: () => editor.chain().focus().toggleOrderedList().run(),
      },
      {
        id: "quote",
        label: "인용문",
        helper: "본문 인용",
        run: () => editor.chain().focus().toggleBlockquote().run(),
      },
      {
        id: "code-block",
        label: "코드 블록",
        helper: "언어 지정 가능",
        run: insertCodeBlock,
      },
      {
        id: "table",
        label: "표",
        helper: "2열 헤더 포함",
        run: insertTableBlock,
        disabled: !canInsertTable,
      },
      {
        id: "callout",
        label: "콜아웃",
        helper: "핵심 내용을 강조합니다",
        run: insertCalloutBlock,
      },
      {
        id: "toggle",
        label: "토글",
        helper: "긴 보충 설명을 접어 둡니다",
        run: insertToggleBlock,
      },
      {
        id: "mermaid",
        label: "다이어그램",
        helper: enableMermaidBlocks ? "Mermaid" : "원문 블록으로 유지",
        run: insertMermaidBlock,
      },
      {
        id: "image",
        label: "이미지",
        helper: "업로드 후 즉시 삽입",
        run: () => fileInputRef.current?.click(),
      },
      {
        id: "divider",
        label: "구분선",
        helper: "섹션 구분",
        run: () => editor.chain().focus().setHorizontalRule().run(),
      },
      {
        id: "raw",
        label: "원문 블록",
        helper: "특수 markdown을 그대로 유지",
        run: () => insertRawMarkdownBlock(),
      },
    ]
  }, [canInsertTable, editor, enableMermaidBlocks, insertCalloutBlock, insertCodeBlock, insertMermaidBlock, insertRawMarkdownBlock, insertTableBlock, insertToggleBlock])

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
    { id: "image", label: <AppIcon name="camera" aria-hidden="true" />, ariaLabel: "이미지 추가", run: () => fileInputRef.current?.click(), active: false },
    { id: "code-block", label: <span aria-hidden="true">&lt;/&gt;</span>, ariaLabel: "코드 블록", run: insertCodeBlock, active: editor?.isActive("codeBlock") ?? false },
  ]

  const toolbarMoreActions: ToolbarAction[] = [
    { id: "ordered-list", label: "번호 목록", ariaLabel: "번호 목록", run: () => editor?.chain().focus().toggleOrderedList().run(), active: editor?.isActive("orderedList") ?? false },
    { id: "table", label: "표", ariaLabel: "표", run: insertTableBlock, active: editor?.isActive("table") ?? false, disabled: !canInsertTable },
    { id: "callout", label: "콜아웃", ariaLabel: "콜아웃", run: insertCalloutBlock, active: editor?.isActive("calloutBlock") ?? false },
    { id: "toggle", label: "토글", ariaLabel: "토글", run: insertToggleBlock, active: editor?.isActive("toggleBlock") ?? false },
    { id: "mermaid", label: "다이어그램", ariaLabel: "다이어그램", run: insertMermaidBlock, active: enableMermaidBlocks ? editor?.isActive("mermaidBlock") ?? false : false },
    { id: "divider", label: "구분선", ariaLabel: "구분선", run: () => editor?.chain().focus().setHorizontalRule().run(), active: false },
    { id: "raw", label: "원문 블록", ariaLabel: "원문 블록", run: () => insertRawMarkdownBlock(), active: editor?.isActive("rawMarkdownBlock") ?? false },
  ]

  const handleSlashMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault()
      setIsSlashMenuOpen(false)
      focusEditor()
    }
  }

  const toggleRawMarkdownDisclosure = () => {
    if (!editor) {
      setIsRawMarkdownOpen((prev) => !prev)
      return
    }

    setIsRawMarkdownOpen((prev) => {
      const next = !prev
      if (next) {
        setRawMarkdownDraft(serializeEditorDocToMarkdown(editor.getJSON() as BlockEditorDoc))
      }
      return next
    })
  }

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

      <HiddenFileInput
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(event) => {
          void handleImageInputChange(event)
        }}
      />

      {isSlashMenuOpen ? (
        <SlashMenu role="dialog" aria-label="블록 삽입 메뉴" onKeyDown={handleSlashMenuKeyDown}>
          <SlashMenuHeader>
            <strong>/ 삽입</strong>
            <button type="button" onClick={() => setIsSlashMenuOpen(false)}>
              닫기
            </button>
          </SlashMenuHeader>
          <SlashMenuGrid>
            {slashActions.map((action) => (
              <SlashActionButton
                key={action.id}
                type="button"
                disabled={disabled || action.disabled}
                onClick={() => {
                  if (action.disabled) return
                  void action.run()
                  setIsSlashMenuOpen(false)
                }}
              >
                <strong>{action.label}</strong>
                {action.helper ? <span>{action.helper}</span> : null}
              </SlashActionButton>
            ))}
          </SlashMenuGrid>
        </SlashMenu>
      ) : null}

      <EditorViewport
        ref={viewportRef}
        onPointerMove={handleViewportPointerMove}
        onPointerLeave={handleViewportPointerLeave}
        onPointerDown={handleViewportPointerDown}
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
                  disabled={!editor.can().chain().focus().mergeCells().run()}
                  onClick={() => editor.chain().focus().mergeCells().run()}
                >
                  셀 병합
                </ToolbarButton>
                <ToolbarButton
                  type="button"
                  disabled={!editor.can().chain().focus().splitCell().run()}
                  onClick={() => editor.chain().focus().splitCell().run()}
                >
                  셀 분할
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
                {insertMenuActions.map((action) => (
                  <FloatingBlockMenuButton
                    key={action.id}
                    type="button"
                    disabled={action.disabled}
                    onClick={() => {
                      if (action.disabled) return
                      action.insertAt(blockMenuState.blockIndex)
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
        <EditorContent editor={editor} />
      </EditorViewport>

        <AuxDisclosure open={isRawMarkdownOpen}>
          <summary
          onClick={(event) => {
            event.preventDefault()
            toggleRawMarkdownDisclosure()
          }}
        >
          <strong>Markdown 편집</strong>
          <span>{isRawMarkdownOpen ? "닫기" : "열기"}</span>
        </summary>
        {isRawMarkdownOpen ? (
          <div className="body">
            <RawMarkdownTextarea
              value={rawMarkdownDraft}
              onChange={(event) => setRawMarkdownDraft(event.target.value)}
              spellCheck={false}
            />
            <RawMarkdownActions>
              <RawMarkdownButton type="button" onClick={applyRawMarkdownDraft}>
                변경 반영
              </RawMarkdownButton>
              <RawMarkdownButton type="button" data-variant="ghost" onClick={() => setRawMarkdownDraft(value)}>
                되돌리기
              </RawMarkdownButton>
            </RawMarkdownActions>
          </div>
        ) : null}
      </AuxDisclosure>

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

const SlashMenu = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 0.85rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 1rem;
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(15, 18, 24, 0.94)" : "rgba(255, 255, 255, 0.98)"};
`

const SlashMenuHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;

  strong {
    font-size: 0.92rem;
    color: var(--color-gray12);
  }

  button {
    border: 0;
    background: transparent;
    color: var(--color-gray10);
    font-size: 0.84rem;
    font-weight: 700;
  }
`

const SlashMenuGrid = styled.div`
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
`

const SlashActionButton = styled.button`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.18rem;
  min-height: 3.1rem;
  border-radius: 0.9rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(18, 21, 26, 0.48)" : "rgba(255, 255, 255, 0.96)"};
  color: var(--color-gray12);
  padding: 0.75rem 0.85rem;
  text-align: left;

  strong {
    font-size: 0.84rem;
  }

  span {
    font-size: 0.74rem;
    color: var(--color-gray10);
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
    color: var(--color-gray12);
    font-size: 1rem;
    line-height: 1.75;
    outline: none;
    overflow-x: hidden;
  }

  .aq-block-editor__content > * {
    width: min(100%, var(--compose-pane-readable-width, var(--article-readable-width, 48rem)));
    min-width: 0;
    margin-left: auto;
    margin-right: auto;
  }

  .aq-block-editor__content > * + * {
    margin-top: 1.05rem;
  }

  .aq-block-editor__content p.is-editor-empty:first-of-type::before {
    content: attr(data-placeholder);
    color: var(--color-gray10);
    float: left;
    height: 0;
    pointer-events: none;
  }

  .aq-block-editor__content h1,
  .aq-block-editor__content h2,
  .aq-block-editor__content h3 {
    line-height: 1.25;
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

  .aq-block-editor__content table {
    width: max-content;
    min-width: 100%;
    max-width: none;
    margin: 0;
    border-collapse: separate;
    border-spacing: 0;
    table-layout: auto;
  }

  .aq-block-editor__content .tableWrapper {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    margin: 1rem auto;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.02);
    -webkit-overflow-scrolling: touch;
  }

  .aq-block-editor__content thead th {
    background: rgba(255, 255, 255, 0.05);
    font-weight: 700;
    border-bottom: 2px solid rgba(255, 255, 255, 0.16);
  }

  .aq-block-editor__content th,
  .aq-block-editor__content td {
    border-right: 1px solid rgba(255, 255, 255, 0.1);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding: 0.72rem 0.9rem;
    text-align: left;
    vertical-align: top;
    position: relative;
    min-width: 0;
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
    box-shadow: inset 0 -2px 0 rgba(148, 163, 184, 0.42);
  }

  .aq-block-editor__content .selectedCell::after {
    background: rgba(148, 163, 184, 0.12);
  }

  .aq-block-editor__content .column-resize-handle {
    position: absolute;
    top: 0;
    right: -2px;
    width: 4px;
    height: 100%;
    background: rgba(148, 163, 184, 0.42);
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

const RawMarkdownTextarea = styled.textarea`
  min-height: 14rem;
  width: 100%;
  resize: vertical;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 0.95rem;
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(11, 14, 20, 0.9)" : "rgba(255, 255, 255, 0.98)"};
  color: var(--color-gray12);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 0.88rem;
  line-height: 1.65;
  padding: 1rem;
`

const RawMarkdownActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  margin-top: 0.85rem;
`

const RawMarkdownButton = styled.button`
  min-height: 2.25rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(59, 130, 246, 0.24)" : "rgba(37, 99, 235, 0.22)"};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(37, 99, 235, 0.18)" : "rgba(37, 99, 235, 0.08)"};
  color: ${({ theme }) => (theme.scheme === "dark" ? "#93c5fd" : theme.colors.blue8)};
  font-size: 0.82rem;
  font-weight: 700;
  padding: 0 1rem;

  &[data-variant="ghost"] {
    border-color: ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(13, 15, 18, 0.94)" : "rgba(255, 255, 255, 0.98)"};
    color: var(--color-gray11);
  }
`
