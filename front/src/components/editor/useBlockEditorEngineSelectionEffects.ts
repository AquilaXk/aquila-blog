import type { Editor as TiptapEditor } from "@tiptap/core"
import { NodeSelection, TextSelection } from "@tiptap/pm/state"
import { useEffect } from "react"
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react"
import {
  parseMarkdownToEditorDoc,
  restoreEditorDocCodeBlocksFromMarkdown,
  type BlockEditorDoc,
} from "./serialization"
import {
  getEditableTextPositionForTopLevelBlock,
  getTopLevelBlockIndexFromSelection,
  isTabBlockSelectionEligible,
} from "./blockSelectionModel"
import { preserveWindowScrollForEditorPointerFocus } from "./blockHandleLayoutModel"
import {
  LIST_ITEM_SELECTOR,
  type NestedListItemContext,
  isSameNestedListItemContext,
  selectNestedListItemNode,
  selectNestedListItemTextAnchor,
} from "./nestedListItemModel"
import { isTableSelectionActive } from "./tableStructureModel"
import {
  areFloatingBubbleStatesEqual,
  hideFloatingBubbleState,
  resolveFloatingBubbleStateFromCoords,
  type FloatingBubbleState,
} from "./useFloatingBubbleState"
import type { BlockEditorSlashMenuState } from "./BlockEditorEngine.layers"
import { downgradeDisabledFeatureNodes } from "./useBlockEditorEngineDocumentOps"

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

  useEffect(() => {
    if (!editor) return
    let disposed = false

    const notifySelection = () => {
      const selection = editor.state.selection as typeof editor.state.selection & {
        node?: { isBlock?: boolean }
      }
      const hasTextRangeSelection = selection instanceof TextSelection && !selection.empty
      const liveSelectedNestedListItemContext = getNodeSelectedNestedListItemContext(editor)
      const selectionAnchorNestedListItemContext = getSelectionAnchorNestedListItemContext(editor)
      const effectiveSelectedNestedListItemContext = resolveEffectiveSelectedListItemContext(editor)
      const shouldPreserveSelectedListItemContextForAnchorSelection = Boolean(
        hasTextRangeSelection &&
          selectionAnchorNestedListItemContext &&
          effectiveSelectedNestedListItemContext &&
          isSameNestedListItemContext(
            selectionAnchorNestedListItemContext,
            effectiveSelectedNestedListItemContext
          )
      )
      const selectedNestedListItemContext =
        liveSelectedNestedListItemContext?.listItemElement?.isConnected
          ? liveSelectedNestedListItemContext
          : shouldPreserveSelectedListItemContextForAnchorSelection
            ? selectionAnchorNestedListItemContext
            : effectiveSelectedNestedListItemContext
      if (liveSelectedNestedListItemContext?.listItemElement?.isConnected) {
        setSelectedListItemContext(liveSelectedNestedListItemContext)
      } else if (shouldPreserveSelectedListItemContextForAnchorSelection && selectionAnchorNestedListItemContext) {
        setSelectedListItemContext(selectionAnchorNestedListItemContext)
      }
      if (hasTextRangeSelection && keyboardBlockSelectionStickyRef.current) {
        keyboardBlockSelectionStickyRef.current = false
      }
      const nextBlockIndex = getTopLevelBlockIndexFromSelection(editor)
      const isTopLevelBlockNodeSelection = Boolean(
        selection instanceof NodeSelection && selection.$from.depth === 0 && selection.node?.isBlock
      )
      const isNestedListItemNodeSelection = Boolean(selectedNestedListItemContext)
      const inTableContext = isTableSelectionActive(editor) ? 1 : 0
      const selectedNestedListItemSignature = selectedNestedListItemContext
        ? `${selectedNestedListItemContext.listBlockIndex}:${selectedNestedListItemContext.listPath.join(".")}:${selectedNestedListItemContext.itemIndex}`
        : "none"
      const nextSignature = `${nextBlockIndex ?? "none"}:${hasTextRangeSelection ? 1 : 0}:${isTopLevelBlockNodeSelection ? 1 : 0}:${isNestedListItemNodeSelection ? 1 : 0}:${keyboardBlockSelectionStickyRef.current ? 1 : 0}:${inTableContext}:${selectedNestedListItemSignature}`
      if (nextSignature === selectionUiSignatureRef.current) {
        return
      }
      selectionUiSignatureRef.current = nextSignature
      setSelectionTick((prev) => prev + 1)
      setSelectedBlockIndex(nextBlockIndex)
      if (hasTextRangeSelection && !selectedNestedListItemContext) {
        setClickedBlockIndex(null)
        setSelectedBlockNodeIndex(null)
        setTextSelectionBlockIndex(nextBlockIndex)
        setSelectedListItemContext(null)
        return
      }
      setTextSelectionBlockIndex(null)
      if (isNestedListItemNodeSelection) {
        setClickedBlockIndex(null)
        setSelectedBlockNodeIndex(null)
        if (selectedNestedListItemContext?.listItemElement?.isConnected) {
          setSelectedListItemContext(selectedNestedListItemContext)
        }
        return
      }
      if (isTopLevelBlockNodeSelection) {
        setSelectedListItemContext(null)
        if (keyboardBlockSelectionStickyRef.current) {
          setClickedBlockIndex(null)
          setSelectedBlockNodeIndex(nextBlockIndex)
          return
        }

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
        setTextSelectionBlockIndex(null)
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
  }, [
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
  ])

  useEffect(() => {
    if (!editor) return

    const handleEditorMouseDownCapture = (event: MouseEvent) => {
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
      if (event.key !== "Tab" || event.metaKey || event.ctrlKey || event.altKey) return
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
    resolveActiveListItemInteraction,
    setSelectionTick,
    slashMenuState,
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
      if (selection.empty && typeof window !== "undefined" && !isTableColumnRailResizeActive()) {
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
      const isTableStructuralSelection = hasTableStructuralSelection(activeEditor)
      const canShowTextToolbar =
        !selection.empty &&
        !isImageNodeSelected &&
        !activeEditor.isActive("codeBlock") &&
        !activeEditor.isActive("rawMarkdownBlock") &&
        !isTableStructuralSelection

      if (canShowTextToolbar && mouseTextSelectionInProgressRef.current) {
        syncBubbleOnMouseUpRef.current = true
        if (bubbleToolbarHoveredRef.current) return
        setBubbleState((prev) =>
          prev.visible && prev.mode === "text" ? hideFloatingBubbleState(prev) : prev
        )
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
        setBubbleState(hideFloatingBubbleState)
        const anchorDom = activeEditor.view.domAtPos(selection.from).node
        const anchorElement =
          anchorDom instanceof Element ? anchorDom : anchorDom.parentElement
        if (isTableStructuralSelection && anchorElement?.closest(".aq-table-shell, .tableWrapper, table")) {
          syncTableQuickRailFromElement(anchorElement)
          return
        }
        if (!tableMenuState) {
          hideTableQuickRailImmediately()
        }
        return
      }

      cancelBubbleHide()
      hideTableQuickRailImmediately()

      const startCoords = activeEditor.view.coordsAtPos(selection.from)
      const endCoords = activeEditor.view.coordsAtPos(isImageNodeSelected ? selection.from : selection.to)
      const nextBubbleState = resolveFloatingBubbleStateFromCoords(
        isImageNodeSelected ? "image" : "text",
        startCoords,
        endCoords
      )
      setBubbleState((prev) =>
        areFloatingBubbleStatesEqual(prev, nextBubbleState) ? prev : nextBubbleState
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
      if (isTableColumnRailResizeActive()) {
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
      preserveWindowScrollForEditorPointerFocus(event.target, isTableSelectionActive(activeEditor))
      if (tryStartTableColumnResizeFromDomHandle(event.target, event.pointerId, event.clientX)) {
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
      setBubbleState((prev) =>
        prev.visible && prev.mode === "text" ? hideFloatingBubbleState(prev) : prev
      )
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
    window.addEventListener("scroll", scheduleSyncBubble, { capture: true, passive: true })
    window.addEventListener("resize", scheduleSyncBubble, { passive: true })
    window.addEventListener("pointerup", handleWindowPointerUp, true)
    window.addEventListener("pointercancel", handleWindowPointerUp, true)
    return () => {
      currentEditor.off("selectionUpdate", scheduleSyncBubble)
      currentEditor.off("focus", scheduleSyncBubble)
      document.removeEventListener("selectionchange", handleDocumentSelectionChange)
      document.removeEventListener("pointerdown", handleEditorPointerDownCapture, true)
      document.removeEventListener("mousedown", handleEditorMouseDownCapture, true)
      window.removeEventListener("scroll", scheduleSyncBubble, true)
      window.removeEventListener("resize", scheduleSyncBubble)
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
  ])

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
