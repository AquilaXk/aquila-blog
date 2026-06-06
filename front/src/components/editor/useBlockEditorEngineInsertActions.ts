import type { Editor as TiptapEditor } from "@tiptap/core"
import AppIcon from "src/components/icons/AppIcon"
import { createElement, useCallback, useMemo } from "react"
import type {
  Dispatch,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from "react"
import { getPreferredCodeLanguage } from "./extensions"
import { moveNestedListItemToInsertionIndex } from "./blockDocumentOps"
import {
  createBookmarkNode,
  createCalloutNode,
  createCodeBlockNode,
  createEmbedNode,
  createFileBlockNode,
  createFormulaNode,
  createInlineFormulaNode,
  createMermaidNode,
  createParagraphNode,
  createTaskListNode,
  createToggleNode,
  type BlockEditorDoc,
} from "./serialization"
import type { BlockEditorEngineProps } from "./blockEditorEngineTypes"
import {
  type BlockInsertCatalogItem,
  createWriterBlockInsertCatalog,
  TABLE_CONTEXT_BLOCKED_INSERT_IDS,
} from "./writerEditorPreset"
import { isTableSelectionActive } from "./tableStructureModel"
import { getTopLevelBlockIndexFromSelection } from "./blockSelectionModel"
import type { BlockEditorQaActions } from "./blockEditorContract"
import {
  isBlockToolbarCommandActive,
  isToolbarBlockInsertActive,
  runBlockToolbarCommand,
} from "./blockToolbarModel"
import {
  getActiveInlineColor,
  getActiveInlineTextStyleOption,
  isInlineMarkCommandActive,
  isInlineCodeMarkActive,
  runInlineCode,
  runInlineColor,
  runInlineMarkCommand,
  runInlineTextStyle,
  type InlineTextStyleOption,
} from "./inlineToolbarModel"
import type { BlockEditorToolbarAction } from "./BlockEditorEngine.layers"
import { useBlockEditorEngineInsertMediaActions } from "./useBlockEditorEngineInsertMediaActions"
import { useBlockEditorEngineQaActions } from "./useBlockEditorEngineQaActions"

type SetBoolean = Dispatch<SetStateAction<boolean>>

type UseBlockEditorEngineInsertActionsArgs = {
  attachmentFileInputRef: RefObject<HTMLInputElement | null>
  closeSlashMenu: (restoreFocus?: boolean) => void
  createInitialTableNode: () => BlockEditorDoc
  disabled: boolean
  editor: TiptapEditor | null
  editorRef: RefObject<TiptapEditor | null>
  enableMermaidBlocks: boolean
  focusNearestInsertedCalloutBody: (fallbackIndex?: number | null) => void
  imageFileInputRef: RefObject<HTMLInputElement | null>
  insertBlocksAtIndex: (
    insertionIndex: number,
    blocks: NonNullable<BlockEditorDoc["content"]>,
    focusIndex?: number
  ) => void
  insertDocContent: (
    doc: BlockEditorDoc,
    replaceCurrentEmptyParagraph?: boolean
  ) => boolean
  isSelectionInEmptyParagraph: () => boolean
  isTableMode: boolean
  isTopLevelInsertBlockedByTableUi: () => boolean
  mutateTopLevelBlocks: (
    mutator: (doc: BlockEditorDoc) => BlockEditorDoc,
    focusIndex?: number | null
  ) => void
  onQaActionsReady: ((actions: BlockEditorQaActions | null) => void) | undefined
  onUploadFile: BlockEditorEngineProps["onUploadFile"]
  onUploadImage: BlockEditorEngineProps["onUploadImage"]
  pendingAttachmentInsertIndexRef: MutableRefObject<number | null>
  pendingImageInsertIndexRef: MutableRefObject<number | null>
  resizeFirstTableColumnBy: (deltaPx: number) => void
  resizeFirstTableRowBy: (deltaPx: number) => void
  selectCurrentTableAxis: (axis: "row" | "column") => boolean
  selectTableColumnByIndex: (columnIndex: number) => unknown
  selectionTick: number
  setIsBubbleInlineColorMenuOpen: SetBoolean
  setIsBubbleTextStyleMenuOpen: SetBoolean
  setIsInlineColorMenuOpen: SetBoolean
  setIsToolbarMoreOpen: SetBoolean
  updateActiveTableCellAttrs: (attrs: Record<string, unknown>) => void
}

export const useBlockEditorEngineInsertActions = ({
  attachmentFileInputRef,
  closeSlashMenu,
  createInitialTableNode,
  disabled,
  editor,
  editorRef,
  enableMermaidBlocks,
  focusNearestInsertedCalloutBody,
  imageFileInputRef,
  insertBlocksAtIndex,
  insertDocContent,
  isSelectionInEmptyParagraph,
  isTableMode,
  isTopLevelInsertBlockedByTableUi,
  mutateTopLevelBlocks,
  onQaActionsReady,
  onUploadFile,
  onUploadImage,
  pendingAttachmentInsertIndexRef,
  pendingImageInsertIndexRef,
  resizeFirstTableColumnBy,
  resizeFirstTableRowBy,
  selectCurrentTableAxis,
  selectTableColumnByIndex,
  selectionTick,
  setIsBubbleInlineColorMenuOpen,
  setIsBubbleTextStyleMenuOpen,
  setIsInlineColorMenuOpen,
  setIsToolbarMoreOpen,
  updateActiveTableCellAttrs,
}: UseBlockEditorEngineInsertActionsArgs) => {
  const focusEditor = useCallback(() => {
    editor?.chain().focus().run()
  }, [editor])

  const withTrailingParagraph = useCallback(
    (blocks: BlockEditorDoc[]): NonNullable<BlockEditorDoc["content"]> => [
      ...blocks,
      createParagraphNode(),
    ],
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
    if (isTopLevelInsertBlockedByTableUi()) return false

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
  }, [editor, editorRef, isTopLevelInsertBlockedByTableUi])

  const insertMermaidBlock = useCallback(() => {
    if (!canInsertTopLevelBlockAtSelection()) return
    if (!enableMermaidBlocks) return
    insertBlocksAtCursor([createMermaidNode("")], true)
  }, [
    canInsertTopLevelBlockAtSelection,
    enableMermaidBlocks,
    insertBlocksAtCursor,
  ])

  const insertCalloutBlock = useCallback(() => {
    const currentEditor = editorRef.current ?? editor
    if (!currentEditor || isTableSelectionActive(currentEditor)) return

    const selectionIndexBeforeInsert =
      getTopLevelBlockIndexFromSelection(currentEditor)
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
  }, [
    closeSlashMenu,
    editor,
    editorRef,
    focusNearestInsertedCalloutBody,
    insertDocContent,
    isSelectionInEmptyParagraph,
    withTrailingParagraph,
  ])

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
    insertBlocksAtCursorExact(
      [createTaskListNode([{ checked: false, text: "" }])],
      true
    )
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
      .insertContent(
        createInlineFormulaNode({ formula: selectedText || "x^2" })
      )
      .run()
  }, [editor])

  const insertTableBlock = useCallback(() => {
    if (!canInsertTopLevelBlockAtSelection()) return
    insertBlocksAtCursor([createInitialTableNode()], true)
  }, [
    canInsertTopLevelBlockAtSelection,
    createInitialTableNode,
    insertBlocksAtCursor,
  ])

  const canInsertTable = canInsertTopLevelBlockAtSelection()

  const insertCodeBlock = useCallback(() => {
    if (!canInsertTopLevelBlockAtSelection()) return
    insertBlocksAtCursor(
      [createCodeBlockNode(getPreferredCodeLanguage(), "")],
      true
    )
  }, [canInsertTopLevelBlockAtSelection, insertBlocksAtCursor])

  const {
    createCardNodeFromUrl,
    handleAttachmentInputChange,
    handleImageInputChange,
    insertCardBlockFromUrl,
    isHttpUrl,
  } = useBlockEditorEngineInsertMediaActions({
    editor,
    insertBlocksAtCursor,
    insertBlocksAtIndex,
    insertDocContent,
    isSelectionInEmptyParagraph,
    onUploadFile,
    onUploadImage,
    pendingAttachmentInsertIndexRef,
    pendingImageInsertIndexRef,
  })

  const openLinkPrompt = useCallback(() => {
    if (!editor || typeof window === "undefined") return
    const previousHref = String(editor.getAttributes("link").href || "")
    const href = window.prompt("링크 주소를 입력하세요.", previousHref)
    if (href === null) return
    if (!href.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
      return
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: href.trim() })
      .run()
  }, [editor])

  const handleToolbarButtonMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      event.preventDefault()
    },
    []
  )

  const runBoldAction = useCallback(() => {
    runInlineMarkCommand(editor, "bold")
  }, [editor])

  const runItalicAction = useCallback(() => {
    runInlineMarkCommand(editor, "italic")
  }, [editor])

  const runInlineCodeAction = useCallback(() => {
    runInlineCode(editor)
  }, [editor])

  const runStrikeAction = useCallback(() => {
    runInlineMarkCommand(editor, "strike")
  }, [editor])

  const activeInlineColor = getActiveInlineColor(editor)
  const isInlineCodeActive = isInlineCodeMarkActive(editor)
  const activeInlineTextStyleOption = useMemo(() => {
    void selectionTick
    return getActiveInlineTextStyleOption(editor)
  }, [editor, selectionTick])

  const applyInlineColor = useCallback(
    (color?: string | null) => {
      if (runInlineColor(editor, color)) {
        setIsInlineColorMenuOpen(false)
        setIsBubbleInlineColorMenuOpen(false)
      }
    },
    [editor, setIsBubbleInlineColorMenuOpen, setIsInlineColorMenuOpen]
  )

  const applyInlineTextStyle = useCallback(
    (styleId: InlineTextStyleOption["id"]) => {
      if (runInlineTextStyle(editor, styleId)) {
        setIsBubbleTextStyleMenuOpen(false)
      }
    },
    [editor, setIsBubbleTextStyleMenuOpen]
  )

  const moveTaskItemInFirstTaskList = useCallback(
    (sourceIndex: number, insertionIndex: number) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return
      const doc = currentEditor.getJSON() as BlockEditorDoc
      const blocks = Array.isArray(doc.content)
        ? (doc.content as BlockEditorDoc[])
        : []
      const firstListIndex = blocks.findIndex(
        (block) =>
          block?.type === "taskList" ||
          block?.type === "bulletList" ||
          block?.type === "orderedList"
      )
      if (firstListIndex < 0) return

      mutateTopLevelBlocks(
        (nextDoc) =>
          moveNestedListItemToInsertionIndex(
            nextDoc,
            firstListIndex,
            [],
            sourceIndex,
            insertionIndex
          ),
        firstListIndex
      )
    },
    [editorRef, mutateTopLevelBlocks]
  )

  useBlockEditorEngineQaActions({
    editor,
    editorRef,
    insertBlocksAtIndex,
    moveTaskItemInFirstTaskList,
    onQaActionsReady,
    resizeFirstTableColumnBy,
    resizeFirstTableRowBy,
    selectCurrentTableAxis,
    selectTableColumnByIndex,
    updateActiveTableCellAttrs,
    withTrailingParagraph,
  })

  const blockInsertCatalog = useMemo<BlockInsertCatalogItem[]>(
    () =>
      createWriterBlockInsertCatalog({
        attachmentFileInputRef,
        canInsertTable,
        createInitialTableNode,
        enableMermaidBlocks,
        focusEditor,
        imageFileInputRef,
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
        isTableMode,
        onUploadFile,
        pendingAttachmentInsertIndexRef,
        pendingImageInsertIndexRef,
        withTrailingParagraph,
      }),
    [
      attachmentFileInputRef,
      canInsertTable,
      createInitialTableNode,
      enableMermaidBlocks,
      focusEditor,
      imageFileInputRef,
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
      isTableMode,
      onUploadFile,
      pendingAttachmentInsertIndexRef,
      pendingImageInsertIndexRef,
      withTrailingParagraph,
    ]
  )

  const toolbarBlockActions = useMemo(
    () => blockInsertCatalog.filter((item) => item.toolbarMore),
    [blockInsertCatalog]
  )

  const quickInsertActions = useMemo(
    () => blockInsertCatalog.filter((item) => item.quickInsert),
    [blockInsertCatalog]
  )

  const hasRenderedTableEditingContext = useMemo(() => {
    if (typeof window === "undefined") return false
    void selectionTick

    const activeElement =
      document.activeElement instanceof Element ? document.activeElement : null
    if (
      activeElement?.closest(
        ".aq-block-editor__content td, .aq-block-editor__content th"
      )
    ) {
      return true
    }

    const domSelection = window.getSelection()
    const anchorNode = domSelection?.anchorNode ?? null
    const anchorElement =
      anchorNode instanceof Element
        ? anchorNode
        : anchorNode?.parentElement ?? null

    return Boolean(
      anchorElement?.closest(
        ".aq-block-editor__content td, .aq-block-editor__content th"
      )
    )
  }, [selectionTick])

  const isQuickInsertActionDisabled = useCallback(
    (action: BlockInsertCatalogItem) =>
      Boolean(
        disabled ||
          action.disabled ||
          ((isTableMode || hasRenderedTableEditingContext) &&
            TABLE_CONTEXT_BLOCKED_INSERT_IDS.has(action.id))
      ),
    [disabled, hasRenderedTableEditingContext, isTableMode]
  )

  const toolbarActions: BlockEditorToolbarAction[] = [
    {
      id: "heading-1",
      label: "H1",
      ariaLabel: "제목 1",
      run: () => runBlockToolbarCommand(editor, "heading-1"),
      active: isBlockToolbarCommandActive(editor, "heading-1"),
    },
    {
      id: "heading-2",
      label: "H2",
      ariaLabel: "제목 2",
      run: () => runBlockToolbarCommand(editor, "heading-2"),
      active: isBlockToolbarCommandActive(editor, "heading-2"),
    },
    {
      id: "heading-3",
      label: "H3",
      ariaLabel: "제목 3",
      run: () => runBlockToolbarCommand(editor, "heading-3"),
      active: isBlockToolbarCommandActive(editor, "heading-3"),
    },
    {
      id: "heading-4",
      label: "H4",
      ariaLabel: "제목 4",
      run: () => runBlockToolbarCommand(editor, "heading-4"),
      active: isBlockToolbarCommandActive(editor, "heading-4"),
    },
    {
      id: "bold",
      label: "B",
      ariaLabel: "굵게",
      run: runBoldAction,
      active: isInlineMarkCommandActive(editor, "bold"),
    },
    {
      id: "italic",
      label: createElement(AppIcon, { name: "italic", "aria-hidden": "true" }),
      ariaLabel: "기울임",
      run: runItalicAction,
      active: isInlineMarkCommandActive(editor, "italic"),
    },
    {
      id: "bullet-list",
      label: createElement(AppIcon, { name: "list", "aria-hidden": "true" }),
      ariaLabel: "목록",
      run: () => runBlockToolbarCommand(editor, "bullet-list"),
      active: isBlockToolbarCommandActive(editor, "bullet-list"),
    },
    {
      id: "quote",
      label: createElement("span", { "aria-hidden": "true" }, "❞"),
      ariaLabel: "인용문",
      run: () => runBlockToolbarCommand(editor, "quote"),
      active: isBlockToolbarCommandActive(editor, "quote"),
    },
    {
      id: "link",
      label: createElement(AppIcon, { name: "link", "aria-hidden": "true" }),
      ariaLabel: "링크",
      run: openLinkPrompt,
      active: editor?.isActive("link") ?? false,
    },
    {
      id: "inline-code",
      label: createElement("span", { "aria-hidden": "true" }, "</>"),
      ariaLabel: "인라인 코드",
      run: runInlineCodeAction,
      active: isInlineCodeActive,
    },
    {
      id: "inline-formula",
      label: createElement("span", { "aria-hidden": "true" }, "ƒx"),
      ariaLabel: "인라인 수식",
      run: insertInlineFormula,
      active: editor?.isActive("inlineFormula") ?? false,
    },
    {
      id: "image",
      label: createElement(AppIcon, { name: "camera", "aria-hidden": "true" }),
      ariaLabel: "이미지 추가",
      run: () => imageFileInputRef.current?.click(),
      active: false,
    },
    {
      id: "code-block",
      label: createElement("span", { "aria-hidden": "true" }, "</>"),
      ariaLabel: "코드 블록",
      run: insertCodeBlock,
      active: editor?.isActive("codeBlock") ?? false,
    },
  ]

  const toolbarMoreActions: BlockEditorToolbarAction[] = [
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
      active: isToolbarBlockInsertActive(editor, item.id),
      disabled: item.disabled,
    })),
  ]

  return {
    activeInlineColor,
    activeInlineTextStyleOption,
    applyInlineColor,
    applyInlineTextStyle,
    blockInsertCatalog,
    createCardNodeFromUrl,
    handleAttachmentInputChange,
    handleImageInputChange,
    handleToolbarButtonMouseDown,
    insertCardBlockFromUrl,
    insertInlineFormula,
    insertFormulaBlock,
    isHttpUrl,
    isInlineCodeActive,
    isQuickInsertActionDisabled,
    openLinkPrompt,
    quickInsertActions,
    runBoldAction,
    runInlineCodeAction,
    runItalicAction,
    runStrikeAction,
    toolbarActions,
    toolbarBlockActions,
    toolbarMoreActions,
  }
}
