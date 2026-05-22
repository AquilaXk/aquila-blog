import type { Editor as TiptapEditor } from "@tiptap/core"
import { Fragment } from "@tiptap/pm/model"
import { TextSelection } from "@tiptap/pm/state"
import { useCallback } from "react"
import type { RefObject } from "react"
import { getPreferredCodeLanguage } from "./extensions"
import {
  deleteTopLevelBlockAt,
  insertTopLevelBlockAt,
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
  createMermaidNode,
  createOrderedListNode,
  createParagraphNode,
  createTaskListNode,
  createToggleNode,
  createBulletListNode,
  createEmptyTableNode,
  type BlockEditorDoc,
} from "./serialization"
import {
  type MarkdownTableLayout,
  TABLE_MIN_COLUMN_WIDTH_PX,
} from "src/libs/markdown/tableMetadata"
import { resetEditorUndoHistory, type EditorHistorySnapshot } from "./editorHistoryModel"
import {
  getCurrentEditorReadableWidthPx,
} from "./tableWidthRuntime"
import {
  createBalancedTableColumnWidths,
  getPreferredNormalTableTotalWidth,
} from "./tableWidthModel"
import { isTableSelectionActive } from "./tableStructureModel"
import {
  getEditableTextPositionForTopLevelBlock,
  getFirstEditableTextPositionInNode,
  getTopLevelBlockIndexFromSelection,
  getTopLevelBlockPosition,
} from "./blockSelectionModel"
import { TABLE_CONTEXT_BLOCKED_INSERT_IDS } from "./writerEditorPreset"
export {
  blockHasVisibleContent,
  downgradeDisabledFeatureNodes,
  focusElementWithoutScroll,
  getActiveSlashRangeFromEditor,
  isPrimaryModifierPressed,
  normalizeTableColorInputValue,
  resolveDocPosSafe,
} from "./blockEditorEngineDocumentModel"

type UseBlockEditorEngineDocumentOpsArgs = {
  discardPendingMarkdownCommit: () => void
  editorRef: RefObject<TiptapEditor | null>
  emptyHistoryStateRef: RefObject<EditorHistorySnapshot | null>
  enableMermaidBlocks: boolean
  markCommittedDoc: (doc: BlockEditorDoc) => void
  syncSerializedDoc: (doc: BlockEditorDoc) => void
  viewportRef: RefObject<HTMLDivElement | null>
}

export const useBlockEditorEngineDocumentOps = ({
  discardPendingMarkdownCommit,
  editorRef,
  emptyHistoryStateRef,
  enableMermaidBlocks,
  markCommittedDoc,
  syncSerializedDoc,
  viewportRef,
}: UseBlockEditorEngineDocumentOpsArgs) => {
  const isSelectionInEmptyParagraph = useCallback(() => {
    const currentEditor = editorRef.current
    if (!currentEditor) return false
    const { selection } = currentEditor.state
    if (!selection.empty) return false
    const parent = selection.$from.parent
    return parent.type.name === "paragraph" && parent.content.size === 0
  }, [editorRef])

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
  }, [editorRef, getEmptyCalloutBodyParagraphRange])

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
    [editorRef, isSelectionInEmptyParagraph]
  )

  const getContentRoot = useCallback(() => {
    return viewportRef.current?.querySelector(".aq-block-editor__content") as HTMLElement | null
  }, [viewportRef])

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

  const focusTopLevelBlock = useCallback((blockIndex: number) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return
    const textPosition = getEditableTextPositionForTopLevelBlock(currentEditor, blockIndex)
    currentEditor.commands.focus(textPosition ?? getTopLevelBlockPosition(currentEditor, blockIndex))
  }, [editorRef])

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
  }, [editorRef, focusTopLevelBlock])

  const replaceEditorDocFromExternalValue = useCallback((nextDoc: BlockEditorDoc, fallbackEditor?: TiptapEditor | null) => {
    const currentEditor = editorRef.current ?? fallbackEditor
    if (!currentEditor) return

    currentEditor.chain().setMeta("addToHistory", false).setContent(nextDoc, { emitUpdate: false }).run()
    resetEditorUndoHistory(currentEditor, emptyHistoryStateRef.current)
    markCommittedDoc(nextDoc)
  }, [editorRef, emptyHistoryStateRef, markCommittedDoc])

  const replaceEditorDoc = useCallback(
    (nextDoc: BlockEditorDoc, focusIndex?: number | null) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return
      discardPendingMarkdownCommit()
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
    [discardPendingMarkdownCommit, editorRef, focusTopLevelBlock, syncSerializedDoc]
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
    [editorRef, replaceEditorDoc]
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
  }, [editorRef, syncSerializedDoc])

  const createInitialTableNode = useCallback(() => {
    const readableWidthBudget = Math.max(
      TABLE_MIN_COLUMN_WIDTH_PX * DEFAULT_EMPTY_TABLE_COLUMN_COUNT,
      getCurrentEditorReadableWidthPx(editorRef.current) - 2
    )
    const targetInnerWidth = getPreferredNormalTableTotalWidth(
      DEFAULT_EMPTY_TABLE_COLUMN_COUNT,
      readableWidthBudget
    )
    const initialLayout: MarkdownTableLayout = {
      overflowMode: "normal",
      columnWidths: createBalancedTableColumnWidths(
        DEFAULT_EMPTY_TABLE_COLUMN_COUNT,
        targetInnerWidth
      ),
    }

    return createEmptyTableNode(
      DEFAULT_EMPTY_TABLE_ROW_COUNT,
      DEFAULT_EMPTY_TABLE_COLUMN_COUNT,
      initialLayout
    )
  }, [editorRef])

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
  }, [buildSlashWholeParagraphReplacement, editorRef, replaceCurrentParagraphWithBlocks])

  const insertBlocksAtIndex = useCallback(
    (insertionIndex: number, blocks: NonNullable<BlockEditorDoc["content"]>, focusIndex = insertionIndex) => {
      mutateTopLevelBlocks((doc) => insertTopLevelBlockAt(doc, insertionIndex, blocks), focusIndex)
    },
    [mutateTopLevelBlocks]
  )

  const deleteBlockAtIndex = useCallback(
    (blockIndex: number, focusIndex?: number | null) => {
      mutateTopLevelBlocks((doc) => deleteTopLevelBlockAt(doc, blockIndex), focusIndex)
    },
    [mutateTopLevelBlocks]
  )

  return {
    buildSlashWholeParagraphReplacement,
    createInitialTableNode,
    deleteBlockAtIndex,
    focusNearestInsertedCalloutBody,
    focusTopLevelBlock,
    getContentRoot,
    getEmptyCalloutBodyParagraphRange,
    getTopLevelBlockElementByIndex,
    getTopLevelBlockElements,
    insertBlocksAtIndex,
    insertDocContent,
    isSelectionInEmptyParagraph,
    mutateTopLevelBlocks,
    replaceCurrentParagraphWithBlocks,
    replaceEditorDoc,
    replaceEditorDocFromExternalValue,
    replaceEmptyCalloutBodyWithPlainText,
    syncSelectedBlockNodeSurface,
    transformCurrentParagraphViaSlash,
  }
}
