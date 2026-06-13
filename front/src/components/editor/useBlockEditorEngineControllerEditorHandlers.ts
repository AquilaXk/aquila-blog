import type { Editor as TiptapEditor } from "@tiptap/core"
import type { MutableRefObject } from "react"
import { deleteTopLevelBlockAt } from "./blockDocumentOps"
import {
  createFileBlockNode,
  parseMarkdownToEditorDoc,
  type BlockEditorDoc,
} from "./serialization"
import {
  convertHtmlToMarkdown,
  extractPlainTextFromHtml,
  looksLikeStructuredMarkdownDocument,
  normalizeStructuredMarkdownClipboard,
} from "src/libs/markdown/htmlToMarkdown"
import type { BlockEditorEngineProps } from "./blockEditorEngineTypes"
import { syncNativeEditorTextSelectionToProseMirror } from "./editorNativeTextSelectionPreserveModel"
import { getActiveListItemName } from "./nestedListItemModel"
import { normalizeTableContextPasteText } from "./tablePasteModel"
import { isTableSelectionActive } from "./tableStructureModel"
import { getCurrentEditorReadableWidthPx } from "./tableWidthRuntime"
import { promotePastedWideTables } from "./tableWidthModel"
import {
  getTopLevelBlockIndexFromSelection,
  isTabBlockSelectionEligible,
} from "./blockSelectionModel"
import { runBlockToolbarCommand } from "./blockToolbarModel"
import { runInlineMarkCommand } from "./inlineToolbarModel"
import {
  downgradeDisabledFeatureNodes,
  isPrimaryModifierPressed,
} from "./useBlockEditorEngineDocumentOps"
import type { BlockEditorBlockMenuState } from "./BlockEditorEngine.layers"

type HandleBlockEditorEngineKeyDownArgs = {
  currentEditor: TiptapEditor
  event: KeyboardEvent
  findTopLevelBlockIndexFromTarget: (target: EventTarget | null) => number | null
  hoveredBlockIndex: number | null
  insertFormulaBlock: () => void
  insertInlineFormula: () => void
  keyboardBlockSelectionStickyRef: MutableRefObject<boolean>
  mutateTopLevelBlocks: (mutator: (doc: BlockEditorDoc) => BlockEditorDoc, focusIndex?: number | null) => void
  openLinkPrompt: () => void
  promoteTopLevelBlockSelection: (blockIndex: number) => boolean
  selectedBlockNodeIndexRef: MutableRefObject<number | null>
  setBlockMenuState: (value: BlockEditorBlockMenuState) => void
  setSelectedBlockNodeIndex: (value: number | null) => void
  syncSelectedBlockNodeSurface: (blockIndex: number | null) => void
}

export const handleBlockEditorEngineKeyDown = ({
  currentEditor,
  event,
  findTopLevelBlockIndexFromTarget,
  hoveredBlockIndex,
  insertFormulaBlock,
  insertInlineFormula,
  keyboardBlockSelectionStickyRef,
  mutateTopLevelBlocks,
  openLinkPrompt,
  promoteTopLevelBlockSelection,
  selectedBlockNodeIndexRef,
  setBlockMenuState,
  setSelectedBlockNodeIndex,
  syncSelectedBlockNodeSurface,
}: HandleBlockEditorEngineKeyDownArgs) => {
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
    event.key === "Tab" &&
    !isTopLevelBlockNodeSelection
  ) {
    syncNativeEditorTextSelectionToProseMirror(currentEditor, {
      allowCollapsed: true,
      excludeSelector: "th, td, .aq-code-shell",
    })
    const activeListItemName = getActiveListItemName(currentEditor)
    if (activeListItemName) {
      event.preventDefault()
      const handled = event.shiftKey
        ? currentEditor.commands.liftListItem(activeListItemName)
        : currentEditor.commands.sinkListItem(activeListItemName)
      if (handled) {
        keyboardBlockSelectionStickyRef.current = false
        setSelectedBlockNodeIndex(null)
        syncSelectedBlockNodeSurface(null)
      }
      return handled
    }
  }

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
    runInlineMarkCommand(currentEditor, "bold")
    return true
  }

  if (hasPrimaryModifier && !event.altKey && !event.shiftKey && normalizedKey === "i") {
    event.preventDefault()
    runInlineMarkCommand(currentEditor, "italic")
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
    runBlockToolbarCommand(currentEditor, "heading-2")
    return true
  }

  if (hasPrimaryModifier && event.altKey && !event.shiftKey && normalizedKey === "3") {
    event.preventDefault()
    runBlockToolbarCommand(currentEditor, "heading-3")
    return true
  }

  if (hasPrimaryModifier && !event.altKey && event.shiftKey && normalizedKey === "7") {
    event.preventDefault()
    runBlockToolbarCommand(currentEditor, "ordered-list")
    return true
  }

  if (hasPrimaryModifier && !event.altKey && event.shiftKey && normalizedKey === "8") {
    event.preventDefault()
    runBlockToolbarCommand(currentEditor, "bullet-list")
    return true
  }

  if (hasPrimaryModifier && !event.altKey && event.shiftKey && normalizedKey === "9") {
    event.preventDefault()
    runBlockToolbarCommand(currentEditor, "quote")
    return true
  }

  if (hasPrimaryModifier && !event.altKey && !event.shiftKey && normalizedKey === "z") {
    event.preventDefault()
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
}

type HandleBlockEditorEnginePasteArgs = {
  currentEditor: TiptapEditor
  enableMermaidBlocks: boolean
  event: ClipboardEvent
  insertCardBlockFromUrl: (url: string) => Promise<boolean>
  insertDocContent: (doc: BlockEditorDoc, replaceCurrentEmptyParagraph?: boolean) => boolean
  isHttpUrl: (value: string) => boolean
  isSelectionInEmptyParagraph: () => boolean
  onUploadFile: BlockEditorEngineProps["onUploadFile"]
  onUploadImage: BlockEditorEngineProps["onUploadImage"]
  replaceEmptyCalloutBodyWithPlainText: (text: string) => boolean
}

export const handleBlockEditorEnginePaste = ({
  currentEditor,
  enableMermaidBlocks,
  event,
  insertCardBlockFromUrl,
  insertDocContent,
  isHttpUrl,
  isSelectionInEmptyParagraph,
  onUploadFile,
  onUploadImage,
  replaceEmptyCalloutBodyWithPlainText,
}: HandleBlockEditorEnginePasteArgs) => {
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
}
