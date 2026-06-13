import type { Editor as TiptapEditor } from "@tiptap/core"
import { useCallback } from "react"
import type {
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from "react"
import { deleteTopLevelBlockAt } from "./blockDocumentOps"
import type { BlockEditorDoc } from "./serialization"
import {
  BLOCK_OUTER_SELECT_LEFT_EDGE_GAP_PX,
  BLOCK_OUTER_SELECT_LEFT_GUTTER_PX,
  BLOCK_OUTER_SELECT_VERTICAL_MARGIN_PX,
  getTopLevelBlockIndexFromSelection,
  isTabBlockSelectionEligible,
  type BlockSelectionOverlayState,
  type BlockSelectionPointerEventLike,
  type TopLevelBlockHandleState,
} from "./blockSelectionModel"
import {
  preserveWindowScrollForEditorPointerFocus,
} from "./blockHandleLayoutModel"
import { syncNativeEditorTextSelectionToProseMirror } from "./editorNativeTextSelectionPreserveModel"
import {
  type NestedListItemContext,
  isNestedListItemControlTarget,
  selectNestedListItemNode,
  selectNestedListItemTextAnchor,
} from "./nestedListItemModel"
import { isTableSelectionActive } from "./tableStructureModel"
import {
  TABLE_DRAG_SELECTION_TEXT_SELECTOR,
  clearTableTextSelectionForBlockSelection,
  hasTableSelectedCellDomMarkers,
} from "./tableTextSelectionModel"
import type { DraggedBlockState, DropIndicatorState } from "./blockDragModel"
import type {
  BlockEditorBlockMenuState,
  BlockEditorSlashMenuState,
} from "./BlockEditorEngine.layers"
import { useBlockEditorEngineBlockSelectionLayout } from "./useBlockEditorEngineBlockSelectionLayout"

type SetState<T> = Dispatch<SetStateAction<T>>

type ActiveListItemInteraction = {
  context: NestedListItemContext | null
  listItemName: string | null
  shouldRestoreNodeSelection: boolean
}

const BLOCK_HANDLE_LEADING_EDGE_HOVER_PX = 48

type UseBlockEditorEngineBlockSelectionUiArgs = {
  blockHandleRailMetricsRef: MutableRefObject<{ width: number; height: number }>
  blockHandleGutterHoverBlockIndex: number | null
  blockHandleState: TopLevelBlockHandleState
  blockSelectionLayoutRectCacheRef: MutableRefObject<
    Map<number, { element: HTMLElement; rect: DOMRect }>
  >
  cancelHoveredBlockClear: () => void
  cancelTableQuickRailHide: () => void
  clearNativeTextSelection: () => void
  clearStickyTopLevelBlockSelection: () => void
  clearTrackedTableHover: () => void
  currentTableAxisSelection: unknown
  draggedBlockState: DraggedBlockState
  dropIndicatorState: DropIndicatorState
  editor: TiptapEditor | null
  editorRef: RefObject<TiptapEditor | null>
  findNestedListItemContextByClientPosition: (
    clientX: number,
    clientY: number
  ) => NestedListItemContext | null
  findNestedListItemContextFromTarget: (
    target: EventTarget | null
  ) => NestedListItemContext | null
  findTopLevelBlockIndexByClientPosition: (
    clientX: number,
    clientY: number
  ) => number | null
  findTopLevelBlockIndexFromTarget: (
    target: EventTarget | null
  ) => number | null
  focusRenderedTableCell: (cell: HTMLTableCellElement) => void
  getContentRoot: () => HTMLElement | null
  getTableCellFromClientPoint: (
    clientX: number,
    clientY: number,
    target: EventTarget | null
  ) => HTMLTableCellElement | null
  getTopLevelBlockElementByIndex: (blockIndex: number) => HTMLElement | null
  getTopLevelBlockElements: () => HTMLElement[]
  handleTableViewportPointerLeave: () => void
  hasTableStructuralSelection: (editor: TiptapEditor) => boolean
  hideTableQuickRailImmediately: () => void
  clickedBlockIndex: number | null
  hoveredBlockIndex: number | null
  hoveredListItemContext: NestedListItemContext | null
  isCoarsePointer: boolean
  isOuterBlockSelectionGesture: (
    event: BlockSelectionPointerEventLike,
    targetBlockIndex: number | null
  ) => boolean
  isOuterListItemSelectionGesture: (
    event: BlockSelectionPointerEventLike,
    targetListItem: NestedListItemContext | null
  ) => boolean
  isTableAffordanceVisible: boolean
  isTableAxisDragActive: boolean
  isTableColumnRailResizeActive: () => boolean
  isTableRowResizeActive: () => boolean
  isTableRowResizeHandleTarget: (
    cell: HTMLTableCellElement | null,
    clientX: number,
    clientY: number
  ) => boolean
  isTableStructuralSelection: boolean
  isTopLevelBlockHandleEligible: (blockIndex: number) => boolean
  isWriterSurface: boolean
  keyboardBlockSelectionStickyRef: MutableRefObject<boolean>
  mutateTopLevelBlocks: (
    mutator: (doc: BlockEditorDoc) => BlockEditorDoc,
    focusIndex?: number | null
  ) => void
  promoteTopLevelBlockSelection: (blockIndex: number) => boolean
  resolveActiveListItemInteraction: (
    editor: TiptapEditor
  ) => ActiveListItemInteraction
  resolveEffectiveSelectedListItemContext: (
    editor?: TiptapEditor | null
  ) => NestedListItemContext | null
  scheduleHoveredBlockClear: () => void
  scheduleTableQuickRailHide: () => void
  selectedBlockIndex: number | null
  selectedBlockNodeIndex: number | null
  selectedBlockNodeIndexRef: MutableRefObject<number | null>
  selectedListItemContextRef: MutableRefObject<NestedListItemContext | null>
  selectionTick: number
  setBlockHandleState: SetState<TopLevelBlockHandleState>
  setBlockHandleGutterHoverBlockIndex: SetState<number | null>
  setBlockMenuState: SetState<BlockEditorBlockMenuState>
  setBlockSelectionOverlayState: SetState<BlockSelectionOverlayState>
  setClickedBlockIndex: SetState<number | null>
  setHoveredBlockIndex: SetState<number | null>
  setHoveredListItemContext: SetState<NestedListItemContext | null>
  setSelectedBlockNodeIndex: SetState<number | null>
  setSelectedListItemContext: SetState<NestedListItemContext | null>
  setSelectionTick: SetState<number>
  setTableQuickRailHovered: (hovered: boolean) => void
  setViewportRowResizeHot: (hot: boolean) => void
  shouldPersistTableHandles: boolean
  skipNextPointerDownSelectionClearRef: MutableRefObject<boolean>
  slashMenuState: BlockEditorSlashMenuState
  startTableRowResize: (cell: HTMLTableCellElement, clientY: number) => void
  syncSelectedBlockNodeSurface: (blockIndex: number | null) => void
  syncTableQuickRailFromElement: (
    element: Element,
    clientX?: number,
    clientY?: number
  ) => void
  syncTrackedHoveredTableCellMenuLayout: () => void
  tableMenuState: unknown
  textSelectionBlockIndex: number | null
  viewportRef: RefObject<HTMLDivElement | null>
}

export const useBlockEditorEngineBlockSelectionUi = ({
  blockHandleRailMetricsRef,
  blockHandleGutterHoverBlockIndex,
  blockHandleState,
  blockSelectionLayoutRectCacheRef,
  cancelHoveredBlockClear,
  cancelTableQuickRailHide,
  clearNativeTextSelection,
  clearStickyTopLevelBlockSelection,
  clearTrackedTableHover,
  currentTableAxisSelection,
  draggedBlockState,
  dropIndicatorState,
  editor,
  editorRef,
  findNestedListItemContextByClientPosition,
  findNestedListItemContextFromTarget,
  findTopLevelBlockIndexByClientPosition,
  findTopLevelBlockIndexFromTarget,
  focusRenderedTableCell,
  getContentRoot,
  getTableCellFromClientPoint,
  getTopLevelBlockElementByIndex,
  getTopLevelBlockElements,
  handleTableViewportPointerLeave,
  hasTableStructuralSelection,
  hideTableQuickRailImmediately,
  clickedBlockIndex,
  hoveredBlockIndex,
  hoveredListItemContext,
  isCoarsePointer,
  isOuterBlockSelectionGesture,
  isOuterListItemSelectionGesture,
  isTableAffordanceVisible,
  isTableAxisDragActive,
  isTableColumnRailResizeActive,
  isTableRowResizeActive,
  isTableRowResizeHandleTarget,
  isTableStructuralSelection,
  isTopLevelBlockHandleEligible,
  isWriterSurface,
  keyboardBlockSelectionStickyRef,
  mutateTopLevelBlocks,
  promoteTopLevelBlockSelection,
  resolveActiveListItemInteraction,
  resolveEffectiveSelectedListItemContext,
  scheduleHoveredBlockClear,
  scheduleTableQuickRailHide,
  selectedBlockIndex,
  selectedBlockNodeIndex,
  selectedBlockNodeIndexRef,
  selectedListItemContextRef,
  selectionTick,
  setBlockHandleState,
  setBlockHandleGutterHoverBlockIndex,
  setBlockMenuState,
  setBlockSelectionOverlayState,
  setClickedBlockIndex,
  setHoveredBlockIndex,
  setHoveredListItemContext,
  setSelectedBlockNodeIndex,
  setSelectedListItemContext,
  setSelectionTick,
  setTableQuickRailHovered,
  setViewportRowResizeHot,
  shouldPersistTableHandles,
  skipNextPointerDownSelectionClearRef,
  slashMenuState,
  startTableRowResize,
  syncSelectedBlockNodeSurface,
  syncTableQuickRailFromElement,
  syncTrackedHoveredTableCellMenuLayout,
  tableMenuState,
  textSelectionBlockIndex,
  viewportRef,
}: UseBlockEditorEngineBlockSelectionUiArgs) => {
  useBlockEditorEngineBlockSelectionLayout({
    blockHandleRailMetricsRef,
    blockHandleGutterHoverBlockIndex,
    blockSelectionLayoutRectCacheRef,
    clickedBlockIndex,
    draggedBlockState,
    dropIndicatorState,
    editor,
    getContentRoot,
    getTopLevelBlockElementByIndex,
    getTopLevelBlockElements,
    hoveredBlockIndex,
    hoveredListItemContext,
    isCoarsePointer,
    isTableAffordanceVisible,
    isTableStructuralSelection,
    isTopLevelBlockHandleEligible,
    keyboardBlockSelectionStickyRef,
    resolveEffectiveSelectedListItemContext,
    selectedBlockIndex,
    selectedBlockNodeIndex,
    selectionTick,
    setBlockHandleState,
    setBlockSelectionOverlayState,
    tableMenuState,
    textSelectionBlockIndex,
    viewportRef,
  })

  const clearTextSelectionForTopLevelBlockSelection = useCallback(() => {
    const selection =
      typeof window !== "undefined" ? window.getSelection() : null
    const anchorElement =
      selection?.anchorNode instanceof Element
        ? selection.anchorNode
        : selection?.anchorNode?.parentElement ?? null
    if (
      typeof document !== "undefined" &&
      (anchorElement?.closest("td, th") ||
        document.querySelector(TABLE_DRAG_SELECTION_TEXT_SELECTOR))
    ) {
      clearTableTextSelectionForBlockSelection()
      return
    }
    clearNativeTextSelection()
  }, [clearNativeTextSelection])

  const syncViewportHoverState = useCallback(
    (targetEvent: EventTarget | null, clientX: number, clientY: number) => {
      cancelHoveredBlockClear()
      const rowResizeState = isTableRowResizeActive()
      const columnResizeState = isTableColumnRailResizeActive()
      if (rowResizeState) {
        setViewportRowResizeHot(true)
        return
      }
      if (columnResizeState) {
        cancelTableQuickRailHide()
        return
      }
      if (isTableAxisDragActive) {
        cancelTableQuickRailHide()
        return
      }
      if (isCoarsePointer) return
      const target =
        targetEvent instanceof Element
          ? targetEvent
          : targetEvent instanceof Node
          ? targetEvent.parentElement
          : null
      const cell = getTableCellFromClientPoint(clientX, clientY, targetEvent)
      const targetListItemContext =
        findNestedListItemContextFromTarget(targetEvent) ??
        findNestedListItemContextByClientPosition(clientX, clientY)
      const targetBlockIndex =
        findTopLevelBlockIndexFromTarget(targetEvent) ??
        findTopLevelBlockIndexByClientPosition(clientX, clientY)
      const targetBlockElement =
        targetBlockIndex !== null
          ? getTopLevelBlockElementByIndex(targetBlockIndex)
          : null
      const targetBlockRect =
        targetBlockElement?.getBoundingClientRect() ?? null
      const isBlockHandleGutterHover = Boolean(
        targetBlockIndex !== null &&
          targetBlockRect &&
          clientY >=
            targetBlockRect.top - BLOCK_OUTER_SELECT_VERTICAL_MARGIN_PX &&
          clientY <=
            targetBlockRect.bottom + BLOCK_OUTER_SELECT_VERTICAL_MARGIN_PX &&
          clientX >=
            targetBlockRect.left - BLOCK_OUTER_SELECT_LEFT_GUTTER_PX &&
          clientX <=
            targetBlockRect.left + BLOCK_HANDLE_LEADING_EDGE_HOVER_PX &&
          !(
            clientX > targetBlockRect.left - BLOCK_OUTER_SELECT_LEFT_EDGE_GAP_PX &&
            clientX < targetBlockRect.left
          )
      )
      setBlockHandleGutterHoverBlockIndex(
        isBlockHandleGutterHover ? targetBlockIndex : null
      )
      const isFarLeftTableBlockGutter = Boolean(
        targetBlockElement?.querySelector(
          ".aq-table-shell, .tableWrapper, table"
        ) &&
          targetBlockRect &&
          clientY >=
            targetBlockRect.top - BLOCK_OUTER_SELECT_VERTICAL_MARGIN_PX &&
          clientY <=
            targetBlockRect.bottom + BLOCK_OUTER_SELECT_VERTICAL_MARGIN_PX &&
          clientX <= targetBlockRect.left - 12
      )
      if (
        target?.closest("[data-table-menu-root='true']") ||
        (target?.closest("[data-table-axis-rail='true']") &&
          !isFarLeftTableBlockGutter) ||
        target?.closest("[data-table-corner-handle='true']") ||
        target?.closest("[data-table-column-rail-track='true']") ||
        target?.closest("[data-table-menu-trigger='true']")
      ) {
        cancelTableQuickRailHide()
        setTableQuickRailHovered(true)
        syncTrackedHoveredTableCellMenuLayout()
        setHoveredListItemContext(null)
        if (
          isWriterSurface ||
          currentTableAxisSelection !== null ||
          isTableStructuralSelection
        ) {
          setHoveredBlockIndex(targetBlockIndex)
        }
        return
      }
      if (isFarLeftTableBlockGutter) {
        clearTrackedTableHover()
        setTableQuickRailHovered(false)
        setViewportRowResizeHot(false)
        setHoveredListItemContext(null)
        setHoveredBlockIndex(targetBlockIndex)
        return
      }
      const hoveredTableElement =
        cell?.closest(".aq-table-shell, .tableWrapper, table") ??
        target?.closest(".aq-table-shell, .tableWrapper, table") ??
        null
      if (hoveredTableElement) {
        syncTableQuickRailFromElement(
          cell ?? target ?? hoveredTableElement,
          clientX,
          clientY
        )
        setTableQuickRailHovered(true)
        setViewportRowResizeHot(
          isTableRowResizeHandleTarget(cell, clientX, clientY)
        )
        setHoveredListItemContext(null)
        setHoveredBlockIndex(targetBlockIndex)
        if (
          selectedBlockNodeIndex !== null &&
          !keyboardBlockSelectionStickyRef.current
        ) {
          keyboardBlockSelectionStickyRef.current = false
          setSelectedBlockNodeIndex(null)
          syncSelectedBlockNodeSurface(null)
        }
        return
      } else if (!tableMenuState) {
        clearTrackedTableHover()
        setTableQuickRailHovered(false)
        scheduleTableQuickRailHide()
      }
      if (isTableStructuralSelection) {
        setHoveredListItemContext(null)
        setHoveredBlockIndex(hoveredTableElement ? null : targetBlockIndex)
        return
      }
      if (
        target?.closest("[data-block-handle-rail='true']") ||
        target?.closest("[data-block-menu-root='true']")
      ) {
        if (blockHandleState.visible) {
          setBlockHandleGutterHoverBlockIndex(blockHandleState.blockIndex)
          if (blockHandleState.kind === "list-item" && hoveredListItemContext) {
            setHoveredListItemContext(hoveredListItemContext)
          }
          setHoveredBlockIndex(blockHandleState.blockIndex)
        }
        return
      }
      setViewportRowResizeHot(
        isTableRowResizeHandleTarget(cell, clientX, clientY)
      )
      setHoveredListItemContext(targetListItemContext)
      setHoveredBlockIndex(
        findTopLevelBlockIndexByClientPosition(clientX, clientY) ??
          findTopLevelBlockIndexFromTarget(targetEvent)
      )
      if (
        selectedBlockNodeIndex !== null &&
        !keyboardBlockSelectionStickyRef.current
      ) {
        keyboardBlockSelectionStickyRef.current = false
        setSelectedBlockNodeIndex(null)
        syncSelectedBlockNodeSurface(null)
      }
    },
    [
      blockHandleState.blockIndex,
      blockHandleState.kind,
      blockHandleState.visible,
      cancelHoveredBlockClear,
      cancelTableQuickRailHide,
      clearTrackedTableHover,
      currentTableAxisSelection,
      findNestedListItemContextByClientPosition,
      findNestedListItemContextFromTarget,
      findTopLevelBlockIndexByClientPosition,
      findTopLevelBlockIndexFromTarget,
      getTableCellFromClientPoint,
      getTopLevelBlockElementByIndex,
      hoveredListItemContext,
      isCoarsePointer,
      isTableAxisDragActive,
      isTableColumnRailResizeActive,
      isTableRowResizeActive,
      isTableRowResizeHandleTarget,
      isTableStructuralSelection,
      isWriterSurface,
      keyboardBlockSelectionStickyRef,
      scheduleTableQuickRailHide,
      selectedBlockNodeIndex,
      setBlockHandleGutterHoverBlockIndex,
      setHoveredBlockIndex,
      setHoveredListItemContext,
      setSelectedBlockNodeIndex,
      setTableQuickRailHovered,
      setViewportRowResizeHot,
      syncSelectedBlockNodeSurface,
      syncTableQuickRailFromElement,
      syncTrackedHoveredTableCellMenuLayout,
      tableMenuState,
    ]
  )

  const handleViewportPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      syncViewportHoverState(event.target, event.clientX, event.clientY)
    },
    [syncViewportHoverState]
  )

  const handleViewportMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      syncViewportHoverState(event.target, event.clientX, event.clientY)
    },
    [syncViewportHoverState]
  )

  const handleViewportPointerLeave = useCallback(() => {
    scheduleHoveredBlockClear()
    handleTableViewportPointerLeave()
  }, [handleTableViewportPointerLeave, scheduleHoveredBlockClear])

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
        const contentLength =
          (currentEditor.getJSON() as BlockEditorDoc).content?.length ?? 0
        const nextFocusIndex = Math.max(
          0,
          Math.min(blockIndex, Math.max(contentLength - 2, 0))
        )
        mutateTopLevelBlocks(
          (doc) => deleteTopLevelBlockAt(doc, blockIndex),
          nextFocusIndex
        )
        setBlockMenuState(null)
        keyboardBlockSelectionStickyRef.current = false
        setSelectedBlockNodeIndex(null)
        syncSelectedBlockNodeSurface(null)
        currentEditor.view.focus()
        return
      }

      if (
        event.defaultPrevented ||
        (event.nativeEvent as Event & { __aqCodePointerHandled?: boolean })
          .__aqCodePointerHandled
      )
        return
      if (event.key !== "Tab" || event.metaKey || event.ctrlKey || event.altKey)
        return
      if (slashMenuState) return
      syncNativeEditorTextSelectionToProseMirror(currentEditor, {
        allowCollapsed: true,
        excludeSelector: "th, td, .aq-code-shell",
      })
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

      const targetBlockIndex =
        hoveredBlockIndex ??
        findTopLevelBlockIndexFromTarget(event.target) ??
        getTopLevelBlockIndexFromSelection(currentEditor)

      if (!isTabBlockSelectionEligible(currentEditor, targetBlockIndex)) return

      event.preventDefault()
      event.stopPropagation()
      clearTextSelectionForTopLevelBlockSelection()
      promoteTopLevelBlockSelection(targetBlockIndex)
    },
    [
      clearNativeTextSelection,
      clearTextSelectionForTopLevelBlockSelection,
      clearStickyTopLevelBlockSelection,
      editorRef,
      findTopLevelBlockIndexFromTarget,
      hoveredBlockIndex,
      keyboardBlockSelectionStickyRef,
      mutateTopLevelBlocks,
      promoteTopLevelBlockSelection,
      resolveActiveListItemInteraction,
      selectedBlockNodeIndexRef,
      setBlockMenuState,
      setSelectedBlockNodeIndex,
      setSelectionTick,
      slashMenuState,
      syncSelectedBlockNodeSurface,
    ]
  )

  const handleViewportPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (skipNextPointerDownSelectionClearRef.current) {
        skipNextPointerDownSelectionClearRef.current = false
        return
      }
      if (event.defaultPrevented) return
      const targetListItemContext = findNestedListItemContextFromTarget(
        event.target
      )
      const targetBlockIndex =
        findTopLevelBlockIndexFromTarget(event.target) ??
        findTopLevelBlockIndexByClientPosition(event.clientX, event.clientY)
      const currentEditor = editorRef.current ?? editor
      const hasActiveBlockSelection =
        selectedBlockNodeIndex !== null ||
        selectedBlockNodeIndexRef.current !== null ||
        keyboardBlockSelectionStickyRef.current
      const hasTableSelectionResidue = Boolean(
        currentEditor &&
          (isTableSelectionActive(currentEditor) ||
            hasTableSelectedCellDomMarkers(currentEditor.view.dom as HTMLElement))
      )
      const isListTextPointerAfterSelectionResidue = Boolean(
        currentEditor &&
          targetListItemContext &&
          !isNestedListItemControlTarget(event.target, targetListItemContext) &&
          (hasActiveBlockSelection || hasTableSelectionResidue) &&
          !isOuterListItemSelectionGesture(event, targetListItemContext)
      )
      if (currentEditor && !isListTextPointerAfterSelectionResidue) {
        preserveWindowScrollForEditorPointerFocus(
          event.target,
          isTableSelectionActive(currentEditor),
          hasActiveBlockSelection
        )
      }
      if (
        currentEditor &&
        isOuterListItemSelectionGesture(event, targetListItemContext) &&
        targetListItemContext
      ) {
        event.preventDefault()
        event.stopPropagation()
        setClickedBlockIndex(null)
        keyboardBlockSelectionStickyRef.current = false
        setSelectedBlockNodeIndex(null)
        syncSelectedBlockNodeSurface(null)
        setSelectedListItemContext(targetListItemContext)
        selectNestedListItemNode(currentEditor, targetListItemContext)
        clearNativeTextSelection()
        return
      }
      if (isOuterBlockSelectionGesture(event, targetBlockIndex)) {
        if (targetBlockIndex === null) return
        event.preventDefault()
        event.stopPropagation()
        clearTextSelectionForTopLevelBlockSelection()
        promoteTopLevelBlockSelection(targetBlockIndex)
        return
      }
      setClickedBlockIndex(null)
      if (hasActiveBlockSelection) {
        keyboardBlockSelectionStickyRef.current = false
        selectedBlockNodeIndexRef.current = null
        setSelectedBlockNodeIndex(null)
        syncSelectedBlockNodeSurface(null)
      }
      if (
        currentEditor &&
        targetListItemContext &&
        isListTextPointerAfterSelectionResidue
      ) {
        return
      }
      if (
        isCoarsePointer ||
        isTableRowResizeActive() ||
        isTableColumnRailResizeActive()
      )
        return
      const cell = getTableCellFromClientPoint(
        event.clientX,
        event.clientY,
        event.target
      )
      const hasActiveTableStructuralSelection = Boolean(
        currentEditor && hasTableStructuralSelection(currentEditor)
      )
      if (cell) {
        setTableQuickRailHovered(false)
        if (!shouldPersistTableHandles) {
          hideTableQuickRailImmediately()
        }
      }
      if (
        cell &&
        hasActiveTableStructuralSelection &&
        !isTableRowResizeHandleTarget(cell, event.clientX, event.clientY)
      ) {
        focusRenderedTableCell(cell)
      }
      if (
        !isTableRowResizeHandleTarget(cell, event.clientX, event.clientY) ||
        !cell
      )
        return
      event.preventDefault()
      event.stopPropagation()
      startTableRowResize(cell, event.clientY)
    },
    [
      clearNativeTextSelection,
      editor,
      editorRef,
      findNestedListItemContextFromTarget,
      findTopLevelBlockIndexByClientPosition,
      findTopLevelBlockIndexFromTarget,
      focusRenderedTableCell,
      getTableCellFromClientPoint,
      hasTableStructuralSelection,
      hideTableQuickRailImmediately,
      isCoarsePointer,
      isOuterBlockSelectionGesture,
      isOuterListItemSelectionGesture,
      isTableColumnRailResizeActive,
      isTableRowResizeActive,
      isTableRowResizeHandleTarget,
      clearTextSelectionForTopLevelBlockSelection,
      keyboardBlockSelectionStickyRef,
      promoteTopLevelBlockSelection,
      selectedBlockNodeIndex,
      selectedBlockNodeIndexRef,
      setClickedBlockIndex,
      setSelectedBlockNodeIndex,
      setSelectedListItemContext,
      setTableQuickRailHovered,
      shouldPersistTableHandles,
      skipNextPointerDownSelectionClearRef,
      startTableRowResize,
      syncSelectedBlockNodeSurface,
    ]
  )

  return {
    handleViewportKeyDownCapture,
    handleViewportMouseMove,
    handleViewportPointerDown,
    handleViewportPointerLeave,
    handleViewportPointerMove,
  }
}
