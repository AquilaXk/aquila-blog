import type { Editor as TiptapEditor } from "@tiptap/core"
import { useEffect } from "react"
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react"
import {
  parseMarkdownToEditorDoc,
  restoreEditorDocCodeBlocksFromMarkdown,
  type BlockEditorDoc,
} from "./serialization"
import {
  getTopLevelBlockIndexFromSelection,
  isTabBlockSelectionEligible,
} from "./blockSelectionModel"
import {
  LIST_ITEM_SELECTOR,
  type NestedListItemContext,
  selectNestedListItemNode,
  selectNestedListItemTextAnchor,
} from "./nestedListItemModel"
import { isTableSelectionActive } from "./tableStructureModel"
import {
  isPrimarySelectAllKeyboardEvent,
  rememberActiveTableCellFromTarget,
  selectActiveTableCellText,
} from "./tableTextSelectionModel"
import {
  type FloatingBubbleState,
} from "./useFloatingBubbleState"
import type { BlockEditorSlashMenuState } from "./BlockEditorEngine.layers"
import { downgradeDisabledFeatureNodes } from "./useBlockEditorEngineDocumentOps"
import { useBlockEditorEngineSelectionBubbleEffects } from "./useBlockEditorEngineSelectionBubbleEffects"
import { useBlockEditorEngineSelectionStateEffects } from "./useBlockEditorEngineSelectionStateEffects"

type SetState<T> = Dispatch<SetStateAction<T>>

type ActiveListItemInteraction = {
  context: NestedListItemContext | null
  listItemName: string | null
  shouldRestoreNodeSelection: boolean
}

type UseBlockEditorEngineSelectionEffectsArgs = {
  bubbleToolbarHoveredRef: RefObject<boolean>
  cancelBubbleHide: () => void
  cancelHoveredBlockClear: () => void
  cancelPendingMarkdownCommit: () => void
  cancelTableQuickRailHide: () => void
  clearNativeTextSelection: () => void
  clearStickyTopLevelBlockSelection: () => void
  clearWindowTextSelection: () => void
  discardPendingMarkdownCommit: () => void
  disabled: boolean
  editor: TiptapEditor | null
  editorRef: RefObject<TiptapEditor | null>
  enableMermaidBlocks: boolean
  findNestedListItemContextFromTarget: (target: EventTarget | null) => NestedListItemContext | null
  findTopLevelBlockIndexByClientPosition: (clientX: number, clientY: number) => number | null
  findTopLevelBlockIndexFromTarget: (target: EventTarget | null) => number | null
  flushPendingMarkdownCommit: () => void
  getContentRoot: () => HTMLElement | null
  getNodeSelectedNestedListItemContext: (editor: TiptapEditor) => NestedListItemContext | null
  getSelectionAnchorNestedListItemContext: (editor: TiptapEditor) => NestedListItemContext | null
  hasExternalMarkdownChanged: (value: string) => boolean
  hasTableStructuralSelection: (editor: TiptapEditor) => boolean
  hideTableQuickRailImmediately: () => void
  hoveredBlockIndex: number | null
  isOuterBlockSelectionGesture: (event: MouseEvent, targetBlockIndex: number | null) => boolean
  isOuterListItemSelectionGesture: (event: MouseEvent, targetListItem: NestedListItemContext | null) => boolean
  isTableColumnRailResizeActive: () => boolean
  keyboardBlockSelectionStickyRef: MutableRefObject<boolean>
  mouseTextSelectionInProgressRef: MutableRefObject<boolean>
  promoteTopLevelBlockSelection: (blockIndex: number) => boolean
  replaceEditorDocFromExternalValue: (nextDoc: BlockEditorDoc, fallbackEditor?: TiptapEditor | null) => void
  resolveActiveListItemInteraction: (editor: TiptapEditor) => ActiveListItemInteraction
  resolveEffectiveSelectedListItemContext: (editor?: TiptapEditor | null) => NestedListItemContext | null
  scheduleBubbleHide: () => void
  scheduleTableQuickRailHide: () => void
  selectedBlockNodeIndex: number | null
  selectedBlockNodeIndexRef: MutableRefObject<number | null>
  selectedListItemContext: NestedListItemContext | null
  selectionTick: number
  selectionUiSignatureRef: MutableRefObject<string>
  setBubbleState: SetState<FloatingBubbleState>
  setClickedBlockIndex: SetState<number | null>
  setSelectedBlockIndex: SetState<number | null>
  setSelectedBlockNodeIndex: SetState<number | null>
  setSelectedListItemContext: SetState<NestedListItemContext | null>
  setSelectionTick: SetState<number>
  setTextSelectionBlockIndex: SetState<number | null>
  skipNextPointerDownSelectionClearRef: MutableRefObject<boolean>
  slashMenuState: BlockEditorSlashMenuState
  syncBubbleOnMouseUpRef: MutableRefObject<boolean>
  syncSelectedBlockNodeSurface: (blockIndex: number | null) => void
  syncTableQuickRailFromElement: (element: Element, clientX?: number, clientY?: number) => void
  tableMenuState: unknown
  tryStartTableColumnResizeFromDomHandle: (target: EventTarget | null, pointerId: number, clientX: number) => boolean
  value: string
}

export const useBlockEditorEngineSelectionEffects = ({
  bubbleToolbarHoveredRef,
  cancelBubbleHide,
  cancelHoveredBlockClear,
  cancelPendingMarkdownCommit,
  cancelTableQuickRailHide,
  clearNativeTextSelection,
  clearStickyTopLevelBlockSelection,
  clearWindowTextSelection,
  discardPendingMarkdownCommit,
  disabled,
  editor,
  editorRef,
  enableMermaidBlocks,
  findNestedListItemContextFromTarget,
  findTopLevelBlockIndexByClientPosition,
  findTopLevelBlockIndexFromTarget,
  flushPendingMarkdownCommit,
  getContentRoot,
  getNodeSelectedNestedListItemContext,
  getSelectionAnchorNestedListItemContext,
  hasExternalMarkdownChanged,
  hasTableStructuralSelection,
  hideTableQuickRailImmediately,
  hoveredBlockIndex,
  isOuterBlockSelectionGesture,
  isOuterListItemSelectionGesture,
  isTableColumnRailResizeActive,
  keyboardBlockSelectionStickyRef,
  mouseTextSelectionInProgressRef,
  promoteTopLevelBlockSelection,
  replaceEditorDocFromExternalValue,
  resolveActiveListItemInteraction,
  resolveEffectiveSelectedListItemContext,
  scheduleBubbleHide,
  scheduleTableQuickRailHide,
  selectedBlockNodeIndex,
  selectedBlockNodeIndexRef,
  selectedListItemContext,
  selectionTick,
  selectionUiSignatureRef,
  setBubbleState,
  setClickedBlockIndex,
  setSelectedBlockIndex,
  setSelectedBlockNodeIndex,
  setSelectedListItemContext,
  setSelectionTick,
  setTextSelectionBlockIndex,
  skipNextPointerDownSelectionClearRef,
  slashMenuState,
  syncBubbleOnMouseUpRef,
  syncSelectedBlockNodeSurface,
  syncTableQuickRailFromElement,
  tableMenuState,
  tryStartTableColumnResizeFromDomHandle,
  value,
}: UseBlockEditorEngineSelectionEffectsArgs) => {
  useEffect(() => {
    if (!editor) return

    const handleSelectionUpdate = () => {
      setSelectionTick((prev) => prev + 1)
    }

    editor.on("selectionUpdate", handleSelectionUpdate)
    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate)
    }
  }, [editor, setSelectionTick])

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [disabled, editor])

  useEffect(() => {
    const root = getContentRoot()
    if (!root || !editor) return

    const listItems = Array.from(root.querySelectorAll<HTMLElement>(LIST_ITEM_SELECTOR))
    listItems.forEach((element) => {
      element.removeAttribute("data-block-selected")
      if (element.getAttribute("data-task-item") !== "true") {
        element.removeAttribute("draggable")
      }
    })

    const selectedNestedListItemContext = resolveEffectiveSelectedListItemContext(editor)
    if (selectedNestedListItemContext?.listItemElement?.isConnected) {
      selectedNestedListItemContext.listItemElement.setAttribute("data-block-selected", "true")
      selectedNestedListItemContext.listItemElement.setAttribute("draggable", "true")
    }

    return () => {
      listItems.forEach((element) => {
        element.removeAttribute("data-block-selected")
        if (element.getAttribute("data-task-item") !== "true") {
          element.removeAttribute("draggable")
        }
      })
    }
  }, [editor, getContentRoot, resolveEffectiveSelectedListItemContext, selectedListItemContext, selectionTick])

  useEffect(() => {
    selectedBlockNodeIndexRef.current = selectedBlockNodeIndex
  }, [selectedBlockNodeIndex, selectedBlockNodeIndexRef])

  useEffect(() => {
    const root = getContentRoot()
    if (!root) return
    if (selectedBlockNodeIndex !== null && keyboardBlockSelectionStickyRef.current) {
      root.setAttribute("data-keyboard-block-selection", "true")
      return
    }
    root.removeAttribute("data-keyboard-block-selection")
  }, [getContentRoot, keyboardBlockSelectionStickyRef, selectedBlockNodeIndex, selectionTick])

  useBlockEditorEngineSelectionStateEffects({
    editor,
    getNodeSelectedNestedListItemContext,
    getSelectionAnchorNestedListItemContext,
    keyboardBlockSelectionStickyRef,
    resolveEffectiveSelectedListItemContext,
    selectionUiSignatureRef,
    setClickedBlockIndex,
    setSelectedBlockIndex,
    setSelectedBlockNodeIndex,
    setSelectedListItemContext,
    setSelectionTick,
    setTextSelectionBlockIndex,
  })

  useEffect(() => {
    if (!editor) return

    const handleEditorMouseDownCapture = (event: MouseEvent) => {
      rememberActiveTableCellFromTarget(event.target, editor.view.dom as HTMLElement)
      const targetListItemContext = findNestedListItemContextFromTarget(event.target)
      const targetBlockIndex =
        findTopLevelBlockIndexFromTarget(event.target) ??
        findTopLevelBlockIndexByClientPosition(event.clientX, event.clientY)
      const isOuterListItemGesture = isOuterListItemSelectionGesture(event, targetListItemContext)
      const isOuterSelectionGesture = isOuterBlockSelectionGesture(event, targetBlockIndex)
      if (isTableSelectionActive(editor) && !isOuterSelectionGesture && !isOuterListItemGesture) return
      if (!isOuterSelectionGesture && !isOuterListItemGesture) {
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
      if (isOuterListItemGesture && targetListItemContext) {
        event.preventDefault()
        event.stopPropagation()
        skipNextPointerDownSelectionClearRef.current = true
        setClickedBlockIndex(null)
        keyboardBlockSelectionStickyRef.current = false
        setSelectedBlockNodeIndex(null)
        syncSelectedBlockNodeSurface(null)
        setSelectedListItemContext(targetListItemContext)
        selectNestedListItemNode(editor, targetListItemContext)
        clearNativeTextSelection()
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
    clearNativeTextSelection,
    editor,
    findNestedListItemContextFromTarget,
    findTopLevelBlockIndexByClientPosition,
    findTopLevelBlockIndexFromTarget,
    isOuterBlockSelectionGesture,
    isOuterListItemSelectionGesture,
    keyboardBlockSelectionStickyRef,
    promoteTopLevelBlockSelection,
    selectedBlockNodeIndexRef,
    setClickedBlockIndex,
    setSelectedBlockNodeIndex,
    setSelectedListItemContext,
    skipNextPointerDownSelectionClearRef,
    syncSelectedBlockNodeSurface,
  ])

  useEffect(() => {
    if (!editor || typeof document === "undefined" || typeof window === "undefined") return

    const handleKeyDownCapture = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const activeEditorForSelection = editorRef.current ?? editor
      rememberActiveTableCellFromTarget(event.target, activeEditorForSelection.view.dom)
      if (isPrimarySelectAllKeyboardEvent(event)) {
        if (activeEditorForSelection && selectActiveTableCellText(activeEditorForSelection, event.target)) {
          event.preventDefault()
          event.stopPropagation()
          event.stopImmediatePropagation?.()
          clearStickyTopLevelBlockSelection()
          setSelectedBlockNodeIndex(null)
          syncSelectedBlockNodeSurface(null)
          setSelectionTick((prev) => prev + 1)
          return
        }
      }
      if (event.key !== "Tab" || event.metaKey || event.ctrlKey || event.altKey) return
      queueMicrotask(() => {
        rememberActiveTableCellFromTarget(document.activeElement, activeEditorForSelection.view.dom)
      })
      if (slashMenuState) return

      const currentEditor = editorRef.current
      if (!currentEditor) return
      const activeListItemInteraction = resolveActiveListItemInteraction(currentEditor)
      if (activeListItemInteraction.listItemName) {
        event.preventDefault()
        event.stopPropagation()
        clearStickyTopLevelBlockSelection()
        if (
          activeListItemInteraction.shouldRestoreNodeSelection &&
          activeListItemInteraction.context
        ) {
          selectNestedListItemTextAnchor(currentEditor, activeListItemInteraction.context)
          clearNativeTextSelection()
        }
        const handled = event.shiftKey
          ? currentEditor.commands.liftListItem(activeListItemInteraction.listItemName)
          : currentEditor.commands.sinkListItem(activeListItemInteraction.listItemName)
        if (handled) {
          setSelectionTick((prev) => prev + 1)
        }
        return
      }
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
  }, [
    clearNativeTextSelection,
    clearStickyTopLevelBlockSelection,
    editor,
    editorRef,
    findTopLevelBlockIndexFromTarget,
    hoveredBlockIndex,
    promoteTopLevelBlockSelection,
    setSelectedBlockNodeIndex,
    resolveActiveListItemInteraction,
    setSelectionTick,
    slashMenuState,
    syncSelectedBlockNodeSurface,
  ])

  useBlockEditorEngineSelectionBubbleEffects({
    bubbleToolbarHoveredRef,
    cancelBubbleHide,
    clearWindowTextSelection,
    editor,
    editorRef,
    hasTableStructuralSelection,
    hideTableQuickRailImmediately,
    isTableColumnRailResizeActive,
    mouseTextSelectionInProgressRef,
    scheduleBubbleHide,
    scheduleTableQuickRailHide,
    setBubbleState,
    syncBubbleOnMouseUpRef,
    syncTableQuickRailFromElement,
    tableMenuState,
    tryStartTableColumnResizeFromDomHandle,
  })

  useEffect(() => {
    return () => {
      cancelHoveredBlockClear()
      cancelBubbleHide()
      cancelTableQuickRailHide()
    }
  }, [cancelBubbleHide, cancelHoveredBlockClear, cancelTableQuickRailHide])

  useEffect(() => {
    if (!editor || !hasExternalMarkdownChanged(value)) return
    discardPendingMarkdownCommit()
    const nextDoc = restoreEditorDocCodeBlocksFromMarkdown(value, downgradeDisabledFeatureNodes(parseMarkdownToEditorDoc(value), enableMermaidBlocks)).doc
    replaceEditorDocFromExternalValue(nextDoc, editor)
  }, [
    discardPendingMarkdownCommit,
    editor,
    enableMermaidBlocks,
    hasExternalMarkdownChanged,
    replaceEditorDocFromExternalValue,
    value,
  ])

  useEffect(() => {
    const restored = editor && value.trim() ? restoreEditorDocCodeBlocksFromMarkdown(value, editor.getJSON() as BlockEditorDoc) : null
    if (!restored?.changed) return
    discardPendingMarkdownCommit()
    replaceEditorDocFromExternalValue(restored.doc, editor!)
  }, [discardPendingMarkdownCommit, editor, replaceEditorDocFromExternalValue, value])

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
}
