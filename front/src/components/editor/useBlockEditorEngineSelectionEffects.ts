import type { Editor as TiptapEditor } from "@tiptap/core"
import { tableEditingKey } from "@tiptap/pm/tables"
import { useEffect } from "react"
import type {
  Dispatch,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from "react"
import {
  parseMarkdownToEditorDoc,
  restoreEditorDocCodeBlocksFromMarkdown,
  type BlockEditorDoc,
} from "./serialization"
import {
  getTopLevelBlockIndexFromSelection,
  isTabBlockSelectionEligible,
} from "./blockSelectionModel"
import { cancelAllWindowScrollPreserves } from "./blockHandleLayoutModel"
import {
  LIST_ITEM_SELECTOR,
  type NestedListItemContext,
  selectNestedListItemNode,
  selectNestedListItemTextAnchor,
  selectNestedListItemTextAtPoint,
} from "./nestedListItemModel"
import { isTableSelectionActive } from "./tableStructureModel"
import {
  clearTableSelectedCellDomMarkers,
  isPrimarySelectAllKeyboardEvent,
  rememberActiveTableCellFromTarget,
  clearTableTextSelectionForBlockSelection,
  hasTableSelectedCellDomMarkers,
  selectActiveTableCellText,
} from "./tableTextSelectionModel"
import { type FloatingBubbleState } from "./useFloatingBubbleState"
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
  findNestedListItemContextFromTarget: (
    target: EventTarget | null
  ) => NestedListItemContext | null
  findNestedListItemContextByClientPosition: (
    clientX: number,
    clientY: number
  ) => NestedListItemContext | null
  findTopLevelBlockIndexByClientPosition: (
    clientX: number,
    clientY: number
  ) => number | null
  findTopLevelBlockIndexFromTarget: (
    target: EventTarget | null
  ) => number | null
  flushPendingMarkdownCommit: () => void
  getContentRoot: () => HTMLElement | null
  getNodeSelectedNestedListItemContext: (
    editor: TiptapEditor
  ) => NestedListItemContext | null
  getSelectionAnchorNestedListItemContext: (
    editor: TiptapEditor
  ) => NestedListItemContext | null
  hasExternalMarkdownChanged: (value: string) => boolean
  hasTableStructuralSelection: (editor: TiptapEditor) => boolean
  hideTableQuickRailImmediately: () => void
  hoveredBlockIndex: number | null
  isOuterBlockSelectionGesture: (
    event: MouseEvent,
    targetBlockIndex: number | null
  ) => boolean
  isOuterListItemSelectionGesture: (
    event: MouseEvent,
    targetListItem: NestedListItemContext | null
  ) => boolean
  isTableColumnRailResizeActive: () => boolean
  keyboardBlockSelectionStickyRef: MutableRefObject<boolean>
  mouseTextSelectionInProgressRef: MutableRefObject<boolean>
  promoteTopLevelBlockSelection: (blockIndex: number) => boolean
  replaceEditorDocFromExternalValue: (
    nextDoc: BlockEditorDoc,
    fallbackEditor?: TiptapEditor | null
  ) => void
  resolveActiveListItemInteraction: (
    editor: TiptapEditor
  ) => ActiveListItemInteraction
  resolveEffectiveSelectedListItemContext: (
    editor?: TiptapEditor | null
  ) => NestedListItemContext | null
  scheduleBubbleHide: () => void
  scheduleTableQuickRailHide: () => void
  selectedBlockNodeIndex: number | null
  selectedBlockNodeIndexRef: MutableRefObject<number | null>
  selectedListItemContext: NestedListItemContext | null
  selectedListItemContextRef: MutableRefObject<NestedListItemContext | null>
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
  syncTableQuickRailFromElement: (
    element: Element,
    clientX?: number,
    clientY?: number
  ) => void
  tableMenuState: unknown
  tryStartTableColumnResizeFromDomHandle: (
    target: EventTarget | null,
    pointerId: number,
    clientX: number
  ) => boolean
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
  findNestedListItemContextByClientPosition,
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
  selectedListItemContextRef,
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

    const listItems = Array.from(
      root.querySelectorAll<HTMLElement>(LIST_ITEM_SELECTOR)
    )
    listItems.forEach((element) => {
      element.removeAttribute("data-block-selected")
      if (element.getAttribute("data-task-item") !== "true") {
        element.removeAttribute("draggable")
      }
    })

    const selectedNestedListItemContext =
      resolveEffectiveSelectedListItemContext(editor)
    if (selectedNestedListItemContext?.listItemElement?.isConnected) {
      selectedNestedListItemContext.listItemElement.setAttribute(
        "data-block-selected",
        "true"
      )
      selectedNestedListItemContext.listItemElement.setAttribute(
        "draggable",
        "true"
      )
    }

    return () => {
      listItems.forEach((element) => {
        element.removeAttribute("data-block-selected")
        if (element.getAttribute("data-task-item") !== "true") {
          element.removeAttribute("draggable")
        }
      })
    }
  }, [
    editor,
    getContentRoot,
    resolveEffectiveSelectedListItemContext,
    selectedListItemContext,
    selectionTick,
  ])

  useEffect(() => {
    selectedBlockNodeIndexRef.current = selectedBlockNodeIndex
  }, [selectedBlockNodeIndex, selectedBlockNodeIndexRef])

  useEffect(() => {
    const root = getContentRoot()
    if (!root) return
    if (
      selectedBlockNodeIndex !== null &&
      keyboardBlockSelectionStickyRef.current
    ) {
      root.setAttribute("data-keyboard-block-selection", "true")
      return
    }
    root.removeAttribute("data-keyboard-block-selection")
  }, [
    getContentRoot,
    keyboardBlockSelectionStickyRef,
    selectedBlockNodeIndex,
    selectionTick,
  ])

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

    const resolvePreciseMouseTarget = (event: MouseEvent) => {
      if (event.target !== editor.view.dom) return event.target
      return (
        document.elementFromPoint(event.clientX, event.clientY) ?? event.target
      )
    }
    const editorSurface =
      editor.view.dom.closest("[data-testid='block-editor-prosemirror']") ??
      editor.view.dom
    const isTargetInsideEditorSurface = (target: EventTarget | null) =>
      target instanceof Node && editorSurface.contains(target)
    let suppressNextListTextMouseDownUntil = 0
    const guardListTextCaretAgainstLateTableSelection = (
      targetListItemContext: NestedListItemContext,
      clientX: number,
      clientY: number
    ) => {
      if (typeof window === "undefined") return
      const startedAt = performance.now()
      const maintain = () => {
        if (
          !editor.view.dom.isConnected ||
          performance.now() - startedAt > 12_000
        )
          return
        if (hasTableSelectedCellDomMarkers(editor.view.dom as HTMLElement)) {
          selectedListItemContextRef.current = null
          setSelectedListItemContext(null)
          setSelectedBlockNodeIndex(null)
          syncSelectedBlockNodeSurface(null)
          clearStickyTopLevelBlockSelection()
          cancelAllWindowScrollPreserves()
          selectNestedListItemTextAtPoint(
            editor,
            targetListItemContext,
            clientX,
            clientY
          )
          clearTableTextSelectionForBlockSelection({
            clearWindowSelection: false,
          })
          clearTableSelectedCellDomMarkers(
            editor.view.dom as HTMLElement,
            editor
          )
          suppressNextListTextMouseDownUntil =
            (typeof performance !== "undefined" ? performance.now() : Date.now()) +
            240
        }
        window.requestAnimationFrame(maintain)
      }
      window.requestAnimationFrame(maintain)
    }
    const handleEditorMouseDownCapture = (event: MouseEvent) => {
      const eventTarget = resolvePreciseMouseTarget(event)
      if (!isTargetInsideEditorSurface(eventTarget)) return
      rememberActiveTableCellFromTarget(
        eventTarget,
        editor.view.dom as HTMLElement
      )
      const targetListItemContext =
        findNestedListItemContextFromTarget(eventTarget) ??
        findNestedListItemContextByClientPosition(event.clientX, event.clientY)
      const targetBlockIndex =
        findTopLevelBlockIndexFromTarget(eventTarget) ??
        findTopLevelBlockIndexByClientPosition(event.clientX, event.clientY)
      const isOuterListItemGesture = isOuterListItemSelectionGesture(
        event,
        targetListItemContext
      )
      const isOuterSelectionGesture = isOuterBlockSelectionGesture(
        event,
        targetBlockIndex
      )
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now()
      if (
        event.type === "pointerdown" &&
        targetListItemContext &&
        !isOuterListItemGesture
      ) {
        clearTableTextSelectionForBlockSelection({ clearWindowSelection: false })
        clearTableSelectedCellDomMarkers(editor.view.dom as HTMLElement, editor)
        guardListTextCaretAgainstLateTableSelection(
          targetListItemContext,
          event.clientX,
          event.clientY
        )
      }
      if (
        event.type === "pointerdown" &&
        event.button === 0 &&
        targetListItemContext &&
        !isOuterListItemGesture &&
        (!editor.state.selection.empty ||
          tableEditingKey.getState(editor.state) !== null)
      ) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation?.()
        selectedListItemContextRef.current = null
        setSelectedListItemContext(null)
        setSelectedBlockNodeIndex(null)
        syncSelectedBlockNodeSurface(null)
        clearStickyTopLevelBlockSelection()
        cancelAllWindowScrollPreserves()
        clearTableTextSelectionForBlockSelection({ clearWindowSelection: false })
        clearTableSelectedCellDomMarkers(editor.view.dom as HTMLElement, editor)
        suppressNextListTextMouseDownUntil = now + 240
        const restoreListTextSelection = () => {
          if (!editor.view.dom.isConnected) return
          selectNestedListItemTextAtPoint(
            editor,
            targetListItemContext,
            event.clientX,
            event.clientY
          )
        }
        restoreListTextSelection()
        window.requestAnimationFrame(restoreListTextSelection)
        window.setTimeout(restoreListTextSelection, 0)
        window.setTimeout(restoreListTextSelection, 60)
        return
      }
      const hasNativeListTextRangeSelection = () => {
        if (!targetListItemContext) return false
        const domSelection = window.getSelection()
        if (!domSelection || domSelection.isCollapsed) return false
        if (!domSelection.toString().trim()) return false
        const anchorNode = domSelection.anchorNode
        const focusNode = domSelection.focusNode
        return Boolean(
          anchorNode &&
            focusNode &&
            targetListItemContext.listItemElement.contains(anchorNode) &&
            targetListItemContext.listItemElement.contains(focusNode)
        )
      }
      if (
        event.type !== "pointerdown" &&
        targetListItemContext &&
        now < suppressNextListTextMouseDownUntil
      ) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation?.()
        selectedListItemContextRef.current = null
        setSelectedListItemContext(null)
        setSelectedBlockNodeIndex(null)
        syncSelectedBlockNodeSurface(null)
        clearStickyTopLevelBlockSelection()
        cancelAllWindowScrollPreserves()
        clearTableTextSelectionForBlockSelection({ clearWindowSelection: false })
        clearTableSelectedCellDomMarkers(editor.view.dom as HTMLElement, editor)
        selectNestedListItemTextAtPoint(
          editor,
          targetListItemContext,
          event.clientX,
          event.clientY
        )
        return
      }
      if (
        event.type === "click" &&
        event.button === 0 &&
        targetListItemContext &&
        !isOuterListItemGesture &&
        hasNativeListTextRangeSelection()
      ) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation?.()
        selectedListItemContextRef.current = null
        setSelectedListItemContext(null)
        clearStickyTopLevelBlockSelection()
        cancelAllWindowScrollPreserves()
        clearTableTextSelectionForBlockSelection({ clearWindowSelection: false })
        clearTableSelectedCellDomMarkers(editor.view.dom as HTMLElement, editor)
        selectNestedListItemTextAtPoint(
          editor,
          targetListItemContext,
          event.clientX,
          event.clientY
        )
        return
      }
      const hasTableSelectionResidue =
        isTableSelectionActive(editor) ||
        tableEditingKey.getState(editor.state) !== null ||
        hasTableSelectedCellDomMarkers(editor.view.dom as HTMLElement)
      if (
        hasTableSelectionResidue &&
        !isOuterSelectionGesture &&
        !isOuterListItemGesture &&
        !targetListItemContext
      )
        return
      if (!isOuterSelectionGesture && !isOuterListItemGesture) {
        const shouldReleaseStickyBlockSelection =
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.shiftKey &&
          (keyboardBlockSelectionStickyRef.current ||
            selectedBlockNodeIndexRef.current !== null)
        const shouldRestoreListTextSelection =
          targetListItemContext &&
          (shouldReleaseStickyBlockSelection || hasTableSelectionResidue)
        if (shouldReleaseStickyBlockSelection || shouldRestoreListTextSelection) {
          clearStickyTopLevelBlockSelection()
          if (shouldRestoreListTextSelection) {
            event.preventDefault()
            event.stopPropagation()
            selectedListItemContextRef.current = null
            setSelectedListItemContext(null)
            setSelectedBlockNodeIndex(null)
            syncSelectedBlockNodeSurface(null)
            clearTableTextSelectionForBlockSelection({ clearWindowSelection: false })
            cancelAllWindowScrollPreserves()
            clearTableSelectedCellDomMarkers(editor.view.dom as HTMLElement, editor)
            suppressNextListTextMouseDownUntil = now + 240
            const restoreListTextSelection = () => {
              if (!editor.view.dom.isConnected) return
              selectNestedListItemTextAtPoint(
                editor,
                targetListItemContext,
                event.clientX,
                event.clientY
              )
            }
            restoreListTextSelection()
            window.requestAnimationFrame(restoreListTextSelection)
            window.setTimeout(restoreListTextSelection, 0)
            window.setTimeout(restoreListTextSelection, 60)
            return
          }
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

    const handleEditorFocusInCapture = (event: FocusEvent) => {
      rememberActiveTableCellFromTarget(
        event.target,
        editor.view.dom as HTMLElement
      )
    }

    const editorDom = editor.view.dom
    document.addEventListener("pointerdown", handleEditorMouseDownCapture, true)
    document.addEventListener("mousedown", handleEditorMouseDownCapture, true)
    document.addEventListener("mouseup", handleEditorMouseDownCapture, true)
    document.addEventListener("click", handleEditorMouseDownCapture, true)
    editorDom.addEventListener("focusin", handleEditorFocusInCapture, true)
    return () => {
      document.removeEventListener(
        "pointerdown",
        handleEditorMouseDownCapture,
        true
      )
      document.removeEventListener(
        "mousedown",
        handleEditorMouseDownCapture,
        true
      )
      document.removeEventListener("mouseup", handleEditorMouseDownCapture, true)
      document.removeEventListener("click", handleEditorMouseDownCapture, true)
      editorDom.removeEventListener("focusin", handleEditorFocusInCapture, true)
    }
  }, [
    clearStickyTopLevelBlockSelection,
    clearNativeTextSelection,
    editor,
    findNestedListItemContextFromTarget,
    findNestedListItemContextByClientPosition,
    findTopLevelBlockIndexByClientPosition,
    findTopLevelBlockIndexFromTarget,
    isOuterBlockSelectionGesture,
    isOuterListItemSelectionGesture,
    keyboardBlockSelectionStickyRef,
    promoteTopLevelBlockSelection,
    selectedBlockNodeIndexRef,
    selectedListItemContextRef,
    setClickedBlockIndex,
    setSelectedBlockNodeIndex,
    setSelectedListItemContext,
    skipNextPointerDownSelectionClearRef,
    syncSelectedBlockNodeSurface,
  ])

  useEffect(() => {
    if (
      !editor ||
      typeof document === "undefined" ||
      typeof window === "undefined"
    )
      return

    const handleKeyDownCapture = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (isPrimarySelectAllKeyboardEvent(event)) {
        const currentEditor = editorRef.current
        if (
          currentEditor &&
          selectActiveTableCellText(currentEditor, event.target)
        ) {
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
      if (event.key !== "Tab" || event.metaKey || event.ctrlKey || event.altKey)
        return
      if (slashMenuState) return

      const currentEditor = editorRef.current
      if (!currentEditor) return
      const activeListItemInteraction =
        resolveActiveListItemInteraction(currentEditor)
      if (activeListItemInteraction.listItemName) {
        event.preventDefault()
        event.stopPropagation()
        clearStickyTopLevelBlockSelection()
        if (
          activeListItemInteraction.shouldRestoreNodeSelection &&
          activeListItemInteraction.context
        ) {
          selectNestedListItemTextAnchor(
            currentEditor,
            activeListItemInteraction.context
          )
          clearNativeTextSelection()
        }
        const handled = event.shiftKey
          ? currentEditor.commands.liftListItem(
              activeListItemInteraction.listItemName
            )
          : currentEditor.commands.sinkListItem(
              activeListItemInteraction.listItemName
            )
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
        (activeElement instanceof Element &&
          editorDom.contains(activeElement)) ||
        (anchorElement instanceof Element && editorDom.contains(anchorElement))
      const targetBlockIndex =
        hoveredBlockIndex ??
        findTopLevelBlockIndexFromTarget(
          anchorElement ?? activeElement ?? event.target
        ) ??
        getTopLevelBlockIndexFromSelection(currentEditor)
      if (!selectionInsideEditor && hoveredBlockIndex === null) return
      if (!isTabBlockSelectionEligible(currentEditor, targetBlockIndex)) return
      const selection = currentEditor.state
        .selection as typeof currentEditor.state.selection & {
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
    const nextDoc = restoreEditorDocCodeBlocksFromMarkdown(
      value,
      downgradeDisabledFeatureNodes(
        parseMarkdownToEditorDoc(value),
        enableMermaidBlocks
      )
    ).doc
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
    const restored =
      editor && value.trim()
        ? restoreEditorDocCodeBlocksFromMarkdown(
            value,
            editor.getJSON() as BlockEditorDoc
          )
        : null
    if (!restored?.changed) return
    discardPendingMarkdownCommit()
    replaceEditorDocFromExternalValue(restored.doc, editor!)
  }, [
    discardPendingMarkdownCommit,
    editor,
    replaceEditorDocFromExternalValue,
    value,
  ])

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
