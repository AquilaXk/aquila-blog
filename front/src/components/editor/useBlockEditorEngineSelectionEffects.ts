import type { Editor as TiptapEditor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
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
  collapseStaleTableEditorSelection,
  clearTableSelectedCellDomMarkers,
  isPrimarySelectAllKeyboardEvent,
  rememberActiveTableCellFromTarget,
  TABLE_DRAG_SELECTION_TEXT_ATTR,
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
    const isNodeInsideEditorTable = (node: Node | null | undefined) => {
      const element =
        node instanceof Element
          ? node
          : node instanceof Node
            ? node.parentElement
            : null
      return Boolean(
        element &&
          editorSurface.contains(element) &&
          element.closest("th, td, table")
      )
    }
    const hasNativeTableSelectionResidue = () => {
      if (typeof window === "undefined" || typeof document === "undefined")
        return false
      const selection = window.getSelection()
      return Boolean(
        document.documentElement.getAttribute(TABLE_DRAG_SELECTION_TEXT_ATTR) ||
          editorSurface.querySelector(`[${TABLE_DRAG_SELECTION_TEXT_ATTR}]`) ||
          isNodeInsideEditorTable(selection?.anchorNode) ||
          isNodeInsideEditorTable(selection?.focusNode)
      )
    }
    let suppressNextListTextMouseDownUntil = 0
    let lateTableSelectionGuardToken = 0
    const cancelLateTableSelectionGuard = () => {
      lateTableSelectionGuardToken += 1
    }
    const hasNativeListTextRangeSelection = (
      listItemContext: NestedListItemContext | null | undefined
    ) => {
      if (!listItemContext) return false
      const domSelection = window.getSelection()
      if (!domSelection || domSelection.isCollapsed) return false
      if (!domSelection.toString().trim()) return false
      const anchorNode = domSelection.anchorNode
      const focusNode = domSelection.focusNode
      return Boolean(
        anchorNode &&
          focusNode &&
          listItemContext.listItemElement.contains(anchorNode) &&
          listItemContext.listItemElement.contains(focusNode)
      )
    }
    const hasNativeListCaretSelection = (
      listItemContext: NestedListItemContext | null | undefined
    ) => {
      if (!listItemContext) return false
      const domSelection = window.getSelection()
      if (!domSelection || !domSelection.isCollapsed) return false
      const anchorNode = domSelection.anchorNode
      return Boolean(
        anchorNode && listItemContext.listItemElement.contains(anchorNode)
      )
    }
    const resolveLiveListItemContext = (
      listItemContext: NestedListItemContext,
      clientX: number,
      clientY: number,
      target?: EventTarget | Node | null
    ) => {
      if (listItemContext.listItemElement.isConnected) {
        return listItemContext
      }
      const pointTarget =
        target ?? document.elementFromPoint(clientX, clientY) ?? null
      return (
        findNestedListItemContextFromTarget(pointTarget) ??
        findNestedListItemContextByClientPosition(clientX, clientY) ??
        listItemContext
      )
    }
    const resolveListDomCaretAtPoint = (
      listItemContext: NestedListItemContext,
      clientX: number,
      clientY: number
    ) => {
      if (typeof document === "undefined") return null
      const createCaret = (textNode: Text, offset: number) => {
        if (!listItemContext.listItemElement.contains(textNode)) return null
        return {
          offset: Math.max(0, Math.min(offset, textNode.data.length)),
          textNode,
        }
      }
      const caretDocument = document as Document & {
        caretPositionFromPoint?: (
          x: number,
          y: number
        ) => { offsetNode: Node; offset: number } | null
        caretRangeFromPoint?: (x: number, y: number) => Range | null
      }
      const pointCaret = caretDocument.caretPositionFromPoint?.(
        clientX,
        clientY
      )
      if (pointCaret?.offsetNode instanceof Text) {
        const caret = createCaret(pointCaret.offsetNode, pointCaret.offset)
        if (caret) return caret
      }
      const pointRange = caretDocument.caretRangeFromPoint?.(clientX, clientY)
      if (pointRange?.startContainer instanceof Text) {
        const caret = createCaret(
          pointRange.startContainer,
          pointRange.startOffset
        )
        if (caret) return caret
      }
      const walker = document.createTreeWalker(
        listItemContext.listItemElement,
        NodeFilter.SHOW_TEXT
      )
      let best:
        | { distance: number; offset: number; textNode: Text }
        | null = null
      while (walker.nextNode()) {
        const textNode = walker.currentNode
        if (!(textNode instanceof Text) || !textNode.data.trim()) continue
        for (let index = 0; index < textNode.data.length; index += 1) {
          const range = document.createRange()
          range.setStart(textNode, index)
          range.setEnd(textNode, index + 1)
          for (const rect of Array.from(range.getClientRects())) {
            if (rect.width <= 0 || rect.height <= 0) continue
            const offset = clientX <= rect.left + rect.width / 2 ? index : index + 1
            const dx =
              clientX < rect.left
                ? rect.left - clientX
                : clientX > rect.right
                  ? clientX - rect.right
                  : 0
            const dy =
              clientY < rect.top
                ? rect.top - clientY
                : clientY > rect.bottom
                  ? clientY - rect.bottom
                  : 0
            const distance = dx * dx + dy * dy
            if (!best || distance < best.distance) {
              best = { distance, offset, textNode }
            }
          }
        }
      }
      return best ? createCaret(best.textNode, best.offset) : null
    }
    const applyListDomCaretAtPoint = (
      listItemContext: NestedListItemContext,
      clientX: number,
      clientY: number
    ) => {
      const caret = resolveListDomCaretAtPoint(listItemContext, clientX, clientY)
      if (!caret) {
        return false
      }
      try {
        const pos = editor.view.posAtDOM(caret.textNode, caret.offset)
        const selection = TextSelection.create(editor.state.doc, pos)
        editor.view.dispatch(editor.state.tr.setSelection(selection))
      } catch {
        // DOM caret is still restored below when ProseMirror cannot map the node.
      }
      if (editor.view.dom instanceof HTMLElement) {
        editor.view.dom.focus({ preventScroll: true })
      }
      const selection = window.getSelection()
      if (!selection) return false
      const range = document.createRange()
      range.setStart(caret.textNode, caret.offset)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      return true
    }
    const restoreListTextSelectionAtPoint = (
      listItemContext: NestedListItemContext,
      clientX: number,
      clientY: number,
      target?: EventTarget | Node | null
    ) => {
      if (!editor.view.dom.isConnected) return
      const liveListItemContext = resolveLiveListItemContext(
        listItemContext,
        clientX,
        clientY,
        target
      )
      selectedListItemContextRef.current = null
      setSelectedListItemContext(null)
      setSelectedBlockNodeIndex(null)
      syncSelectedBlockNodeSurface(null)
      clearStickyTopLevelBlockSelection()
      cancelAllWindowScrollPreserves()
      collapseStaleTableEditorSelection(editor, {
        clientX,
        clientY,
        target: target ?? liveListItemContext.listItemElement,
      })
      clearTableTextSelectionForBlockSelection({ clearWindowSelection: false })
      clearTableSelectedCellDomMarkers(editor.view.dom as HTMLElement, editor)
      const restoredAtPoint = selectNestedListItemTextAtPoint(
        editor,
        liveListItemContext,
        clientX,
        clientY
      )
      const restoredDomCaret = applyListDomCaretAtPoint(
        liveListItemContext,
        clientX,
        clientY
      )
      if (
        !restoredDomCaret &&
        (!restoredAtPoint || !hasNativeListCaretSelection(liveListItemContext))
      ) {
        selectNestedListItemTextAnchor(editor, liveListItemContext)
      }
      clearTableSelectedCellDomMarkers(editor.view.dom as HTMLElement, editor)
    }
    const maintainListDomCaretAtPoint = (
      listItemContext: NestedListItemContext,
      clientX: number,
      clientY: number
    ) => {
      const token = lateTableSelectionGuardToken
      const restore = () => {
        if (token !== lateTableSelectionGuardToken) return
        if (!editor.view.dom.isConnected) return
        applyListDomCaretAtPoint(listItemContext, clientX, clientY)
      }
      restore()
      window.requestAnimationFrame(restore)
      window.setTimeout(restore, 0)
      window.setTimeout(restore, 60)
      window.setTimeout(restore, 140)
      window.setTimeout(restore, 320)
      window.setTimeout(restore, 500)
    }
    const scheduleListClickCaretRestoreAfterPointer = (
      listItemContext: NestedListItemContext,
      clientX: number,
      clientY: number,
      target?: EventTarget | Node | null
    ) => {
      if (typeof window === "undefined") return
      const startX = clientX
      const startY = clientY
      let movedEnoughForDrag = false
      let disposed = false
      const cleanup = () => {
        if (disposed) return
        disposed = true
        window.removeEventListener("pointermove", handlePointerMove, true)
        window.removeEventListener("pointerup", handlePointerUp, true)
        window.removeEventListener("pointercancel", cleanup, true)
      }
      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (
          Math.abs(moveEvent.clientX - startX) > 4 ||
          Math.abs(moveEvent.clientY - startY) > 4
        ) {
          movedEnoughForDrag = true
        }
      }
      const handlePointerUp = () => {
        cleanup()
        window.requestAnimationFrame(() => {
          const liveListItemContext = resolveLiveListItemContext(
            listItemContext,
            clientX,
            clientY,
            target
          )
          if (
            movedEnoughForDrag ||
            hasNativeListTextRangeSelection(liveListItemContext) ||
            hasNativeListCaretSelection(liveListItemContext)
          ) {
            return
          }
          restoreListTextSelectionAtPoint(
            liveListItemContext,
            clientX,
            clientY,
            target
          )
          maintainListDomCaretAtPoint(liveListItemContext, clientX, clientY)
          guardListTextCaretAgainstLateTableSelection(
            liveListItemContext,
            clientX,
            clientY
          )
        })
      }
      window.addEventListener("pointermove", handlePointerMove, true)
      window.addEventListener("pointerup", handlePointerUp, true)
      window.addEventListener("pointercancel", cleanup, true)
      window.setTimeout(cleanup, 900)
    }
    const guardListTextCaretAgainstLateTableSelection = (
      targetListItemContext: NestedListItemContext,
      clientX: number,
      clientY: number,
      maxDurationMs = 12_000,
      options: { restoreCaret?: boolean } = {}
    ) => {
      if (typeof window === "undefined") return
      const shouldRestoreCaret = options.restoreCaret ?? true
      const token = lateTableSelectionGuardToken
      const startedAt = performance.now()
      const maintain = () => {
        if (
          token !== lateTableSelectionGuardToken ||
          !editor.view.dom.isConnected ||
          performance.now() - startedAt > maxDurationMs
        )
          return
        if (hasTableSelectedCellDomMarkers(editor.view.dom as HTMLElement)) {
          selectedListItemContextRef.current = null
          setSelectedListItemContext(null)
          setSelectedBlockNodeIndex(null)
          syncSelectedBlockNodeSurface(null)
          clearStickyTopLevelBlockSelection()
          cancelAllWindowScrollPreserves()
          collapseStaleTableEditorSelection(editor, {
            clientX,
            clientY,
            target: targetListItemContext.listItemElement,
          })
          clearTableTextSelectionForBlockSelection({
            clearWindowSelection: false,
          })
          if (shouldRestoreCaret) {
            const restored = selectNestedListItemTextAtPoint(
              editor,
              targetListItemContext,
              clientX,
              clientY
            )
            if (!restored) {
              selectNestedListItemTextAnchor(editor, targetListItemContext)
            }
          }
          clearTableSelectedCellDomMarkers(
            editor.view.dom as HTMLElement,
            editor
          )
          if (shouldRestoreCaret) {
            suppressNextListTextMouseDownUntil =
              (typeof performance !== "undefined"
                ? performance.now()
                : Date.now()) + 240
          }
        }
        window.requestAnimationFrame(maintain)
      }
      window.requestAnimationFrame(maintain)
    }
    const handleEditorMouseDownCapture = (event: MouseEvent) => {
      const eventTarget = resolvePreciseMouseTarget(event)
      if (event.type === "pointerdown") {
        cancelLateTableSelectionGuard()
      }
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
      const hasTableSelectionResidue =
        isTableSelectionActive(editor) ||
        tableEditingKey.getState(editor.state) !== null ||
        hasTableSelectedCellDomMarkers(editor.view.dom as HTMLElement) ||
        hasNativeTableSelectionResidue()
      const hasBlockSelectionResidue =
        keyboardBlockSelectionStickyRef.current ||
        selectedBlockNodeIndexRef.current !== null ||
        selectedListItemContextRef.current !== null
      const shouldRestoreListTextSelection = Boolean(
        targetListItemContext &&
          !isOuterListItemGesture &&
          (hasTableSelectionResidue || hasBlockSelectionResidue)
      )
      if (
        event.type === "pointerdown" &&
        event.button === 0 &&
        targetListItemContext &&
        !isOuterListItemGesture &&
        !shouldRestoreListTextSelection
      ) {
        lateTableSelectionGuardToken += 1
        guardListTextCaretAgainstLateTableSelection(
          targetListItemContext,
          event.clientX,
          event.clientY,
          900,
          { restoreCaret: false }
        )
        scheduleListClickCaretRestoreAfterPointer(
          targetListItemContext,
          event.clientX,
          event.clientY,
          eventTarget
        )
      }
      if (
        event.type === "pointerdown" &&
        event.button === 0 &&
        targetListItemContext &&
        shouldRestoreListTextSelection
      ) {
        selectedListItemContextRef.current = null
        setSelectedListItemContext(null)
        setSelectedBlockNodeIndex(null)
        syncSelectedBlockNodeSurface(null)
        clearStickyTopLevelBlockSelection()
        cancelAllWindowScrollPreserves()
        collapseStaleTableEditorSelection(editor, {
          clientX: event.clientX,
          clientY: event.clientY,
          target: eventTarget,
        })
        clearTableTextSelectionForBlockSelection({ clearWindowSelection: false })
        clearTableSelectedCellDomMarkers(editor.view.dom as HTMLElement, editor)
        lateTableSelectionGuardToken += 1
        restoreListTextSelectionAtPoint(
          targetListItemContext,
          event.clientX,
          event.clientY,
          eventTarget
        )
        scheduleListClickCaretRestoreAfterPointer(
          targetListItemContext,
          event.clientX,
          event.clientY,
          eventTarget
        )
        guardListTextCaretAgainstLateTableSelection(
          targetListItemContext,
          event.clientX,
          event.clientY,
          900,
          { restoreCaret: false }
        )
        return
      }
      if (
        event.type === "click" &&
        event.button === 0 &&
        targetListItemContext &&
        !isOuterListItemGesture &&
        !hasNativeListTextRangeSelection(targetListItemContext) &&
        !hasNativeListCaretSelection(targetListItemContext)
      ) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation?.()
        restoreListTextSelectionAtPoint(
          targetListItemContext,
          event.clientX,
          event.clientY,
          eventTarget
        )
        maintainListDomCaretAtPoint(
          targetListItemContext,
          event.clientX,
          event.clientY
        )
        guardListTextCaretAgainstLateTableSelection(
          targetListItemContext,
          event.clientX,
          event.clientY
        )
        return
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
        collapseStaleTableEditorSelection(editor, {
          clientX: event.clientX,
          clientY: event.clientY,
          target: eventTarget,
        })
        clearTableTextSelectionForBlockSelection({ clearWindowSelection: false })
        clearTableSelectedCellDomMarkers(editor.view.dom as HTMLElement, editor)
        const restored = selectNestedListItemTextAtPoint(
          editor,
          targetListItemContext,
          event.clientX,
          event.clientY
        )
        if (!restored) {
          selectNestedListItemTextAnchor(editor, targetListItemContext)
        }
        clearTableSelectedCellDomMarkers(editor.view.dom as HTMLElement, editor)
        return
      }
      if (
        event.type === "click" &&
        event.button === 0 &&
        targetListItemContext &&
        !isOuterListItemGesture &&
        hasNativeListTextRangeSelection(targetListItemContext)
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
        const restored = selectNestedListItemTextAtPoint(
          editor,
          targetListItemContext,
          event.clientX,
          event.clientY
        )
        if (!restored) {
          selectNestedListItemTextAnchor(editor, targetListItemContext)
        }
        clearTableSelectedCellDomMarkers(editor.view.dom as HTMLElement, editor)
        return
      }
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
          hasBlockSelectionResidue
        if (shouldReleaseStickyBlockSelection || shouldRestoreListTextSelection) {
          clearStickyTopLevelBlockSelection()
          if (shouldRestoreListTextSelection && targetListItemContext) {
            event.preventDefault()
            event.stopPropagation()
            selectedListItemContextRef.current = null
            setSelectedListItemContext(null)
            setSelectedBlockNodeIndex(null)
            syncSelectedBlockNodeSurface(null)
            collapseStaleTableEditorSelection(editor, {
              clientX: event.clientX,
              clientY: event.clientY,
              target: eventTarget,
            })
            clearTableTextSelectionForBlockSelection({ clearWindowSelection: false })
            cancelAllWindowScrollPreserves()
            clearTableSelectedCellDomMarkers(editor.view.dom as HTMLElement, editor)
            suppressNextListTextMouseDownUntil = now + 240
            const restoreListTextSelection = () => {
              if (!editor.view.dom.isConnected) return
              const restored = selectNestedListItemTextAtPoint(
                editor,
                targetListItemContext,
                event.clientX,
                event.clientY
              )
              if (!restored) {
                selectNestedListItemTextAnchor(editor, targetListItemContext)
              }
              clearTableSelectedCellDomMarkers(editor.view.dom as HTMLElement, editor)
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
