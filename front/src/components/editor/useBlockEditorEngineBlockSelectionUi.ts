import type { Editor as TiptapEditor } from "@tiptap/core"
import { useCallback, useEffect, useLayoutEffect } from "react"
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
  BLOCK_OUTER_SELECT_LEFT_GUTTER_PX,
  BLOCK_OUTER_SELECT_VERTICAL_MARGIN_PX,
  getTopLevelBlockIndexFromSelection,
  isTabBlockSelectionEligible,
  isStableBlockHandleState,
  isStableBlockSelectionOverlayState,
  type BlockSelectionOverlayState,
  type BlockSelectionPointerEventLike,
  type TopLevelBlockHandleState,
} from "./blockSelectionModel"
import {
  resolveBlockHandleAnchorTop,
  resolveBlockChromeTop,
  resolveBlockHandleRailLayoutForSurface,
  resolveBlockSelectionOverlayLayout,
  resolveThinBlockHandleAnchorTop,
  preserveWindowScrollForEditorPointerFocus,
  shouldCenterBlockHandleForNode,
  shouldUseThinBlockHandleAnchor,
} from "./blockHandleLayoutModel"
import {
  LIST_ITEM_SELECTOR,
  type NestedListItemContext,
  isSameNestedListItemContext,
  selectNestedListItemNode,
  selectNestedListItemTextAnchor,
} from "./nestedListItemModel"
import { isTableSelectionActive } from "./tableStructureModel"
import type { DraggedBlockState, DropIndicatorState } from "./blockDragModel"
import type { BlockEditorBlockMenuState, BlockEditorSlashMenuState } from "./BlockEditorEngine.layers"

type SetState<T> = Dispatch<SetStateAction<T>>

type ActiveListItemInteraction = {
  context: NestedListItemContext | null
  listItemName: string | null
  shouldRestoreNodeSelection: boolean
}

type UseBlockEditorEngineBlockSelectionUiArgs = {
  blockHandleRailMetricsRef: MutableRefObject<{ width: number; height: number }>
  blockHandleState: TopLevelBlockHandleState
  blockSelectionLayoutRectCacheRef: MutableRefObject<Map<number, { element: HTMLElement; rect: DOMRect }>>
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
  findNestedListItemContextByClientPosition: (clientX: number, clientY: number) => NestedListItemContext | null
  findNestedListItemContextFromTarget: (target: EventTarget | null) => NestedListItemContext | null
  findTopLevelBlockIndexByClientPosition: (clientX: number, clientY: number) => number | null
  findTopLevelBlockIndexFromTarget: (target: EventTarget | null) => number | null
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
  isOuterBlockSelectionGesture: (event: BlockSelectionPointerEventLike, targetBlockIndex: number | null) => boolean
  isOuterListItemSelectionGesture: (event: BlockSelectionPointerEventLike, targetListItem: NestedListItemContext | null) => boolean
  isTableAffordanceVisible: boolean
  isTableAxisDragActive: boolean
  isTableColumnRailResizeActive: () => boolean
  isTableRowResizeActive: () => boolean
  isTableRowResizeHandleTarget: (cell: HTMLTableCellElement | null, clientX: number, clientY: number) => boolean
  isTableStructuralSelection: boolean
  isTopLevelBlockHandleEligible: (blockIndex: number) => boolean
  isWriterSurface: boolean
  keyboardBlockSelectionStickyRef: MutableRefObject<boolean>
  mutateTopLevelBlocks: (mutator: (doc: BlockEditorDoc) => BlockEditorDoc, focusIndex?: number | null) => void
  promoteTopLevelBlockSelection: (blockIndex: number) => boolean
  resolveActiveListItemInteraction: (editor: TiptapEditor) => ActiveListItemInteraction
  resolveEffectiveSelectedListItemContext: (editor?: TiptapEditor | null) => NestedListItemContext | null
  scheduleHoveredBlockClear: () => void
  scheduleTableQuickRailHide: () => void
  selectedBlockIndex: number | null
  selectedBlockNodeIndex: number | null
  selectedBlockNodeIndexRef: MutableRefObject<number | null>
  selectionTick: number
  setBlockHandleState: SetState<TopLevelBlockHandleState>
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
  syncTableQuickRailFromElement: (element: Element, clientX?: number, clientY?: number) => void
  syncTrackedHoveredTableCellMenuLayout: () => void
  tableMenuState: unknown
  textSelectionBlockIndex: number | null
  viewportRef: RefObject<HTMLDivElement | null>
}

const useBlockSelectionLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

export const useBlockEditorEngineBlockSelectionUi = ({
  blockHandleRailMetricsRef,
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
  selectionTick,
  setBlockHandleState,
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
  useBlockSelectionLayoutEffect(() => {
    if (!editor) return
    const viewportRect = viewportRef.current?.getBoundingClientRect() ?? null
    const handlePositionMode = isCoarsePointer ? "viewport" : "editor-local"
    const rectCache = blockSelectionLayoutRectCacheRef.current
    rectCache.clear()
    const selectedNestedListItemContext = resolveEffectiveSelectedListItemContext(editor)
    const resolveCachedBlockRect = (index: number) => {
      const cached = rectCache.get(index)
      if (cached) return cached
      const element = getTopLevelBlockElementByIndex(index)
      if (!element) return null
      const next = { element, rect: element.getBoundingClientRect() }
      rectCache.set(index, next)
      return next
    }
    if (selectedNestedListItemContext?.listItemElement?.isConnected) {
      const rect = selectedNestedListItemContext.listItemElement.getBoundingClientRect()
      const nextOverlayState: BlockSelectionOverlayState = resolveBlockSelectionOverlayLayout(rect, viewportRect)
      setBlockSelectionOverlayState((prev) =>
        isStableBlockSelectionOverlayState(prev, nextOverlayState) ? prev : nextOverlayState
      )
    } else {
      const overlayIndex =
        selectedBlockNodeIndex !== null
          ? selectedBlockNodeIndex
          : clickedBlockIndex
      if (overlayIndex === null) {
        setBlockSelectionOverlayState((prev) => (prev.visible ? { ...prev, visible: false } : prev))
      } else {
        const overlayTarget = resolveCachedBlockRect(overlayIndex)
        if (!overlayTarget) {
          setBlockSelectionOverlayState((prev) => (prev.visible ? { ...prev, visible: false } : prev))
        } else {
          const { rect } = overlayTarget
          const nextOverlayState: BlockSelectionOverlayState = resolveBlockSelectionOverlayLayout(rect, viewportRect)
          setBlockSelectionOverlayState((prev) =>
            isStableBlockSelectionOverlayState(prev, nextOverlayState) ? prev : nextOverlayState
          )
        }
      }
    }

    const stickySelectionActive =
      !isCoarsePointer && selectedBlockNodeIndex !== null && keyboardBlockSelectionStickyRef.current
    const effectiveSelectedListItemContext = resolveEffectiveSelectedListItemContext(editor)
    const activeListItemContext =
      hoveredListItemContext?.listItemElement?.isConnected
        ? hoveredListItemContext
        : effectiveSelectedListItemContext?.listItemElement?.isConnected
          ? effectiveSelectedListItemContext
          : null
    const blockIndex = activeListItemContext
      ? activeListItemContext.listBlockIndex
      : isCoarsePointer
        ? selectedBlockIndex
        : stickySelectionActive
          ? selectedBlockNodeIndex
          : textSelectionBlockIndex ?? hoveredBlockIndex
    const hideBlockHandle = () =>
      setBlockHandleState((prev) => (prev.visible ? { ...prev, visible: false } : prev))
    const hasOuterBlockSelectionIntent = blockIndex !== null
    if (
      (isTableStructuralSelection && !hasOuterBlockSelectionIntent) ||
      (isTableAffordanceVisible && !hasOuterBlockSelectionIntent) ||
      tableMenuState
    ) {
      hideBlockHandle()
      return
    }
    if (blockIndex === null) {
      hideBlockHandle()
      return
    }
    const { width: railWidth, height: railHeight } = blockHandleRailMetricsRef.current
    if (activeListItemContext?.listItemElement?.isConnected) {
      const rect = activeListItemContext.listItemElement.getBoundingClientRect()
      const railLayout = resolveBlockHandleRailLayoutForSurface(
        rect,
        railWidth,
        railHeight,
        resolveBlockHandleAnchorTop(activeListItemContext.listItemElement, railHeight),
        viewportRect,
        handlePositionMode
      )
      const nextState: TopLevelBlockHandleState = {
        visible: true,
        kind: "list-item",
        blockIndex: activeListItemContext.listBlockIndex,
        listPath: [...activeListItemContext.listPath],
        itemIndex: activeListItemContext.itemIndex,
        left: railLayout.left,
        top: railLayout.top,
        bottom: resolveBlockChromeTop(rect.bottom + 12, viewportRect, handlePositionMode),
        width: rect.width,
      }
      setBlockHandleState((prev) => (isStableBlockHandleState(prev, nextState) ? prev : nextState))
      rectCache.clear()
      return
    }

    const blockTarget = resolveCachedBlockRect(blockIndex)
    const blockElement = blockTarget?.element ?? null
    const canShowHandle = isTopLevelBlockHandleEligible(blockIndex)
    const shouldShow = Boolean(blockElement && canShowHandle && (isCoarsePointer || stickySelectionActive || textSelectionBlockIndex !== null || hoveredBlockIndex !== null))

    if (!shouldShow || !blockElement) {
      hideBlockHandle()
      return
    }

    const rect = blockTarget?.rect ?? blockElement.getBoundingClientRect()
    const blocks = ((editor.getJSON() as BlockEditorDoc).content ?? []) as BlockEditorDoc[]
    const blockNode = blocks[blockIndex]
    const anchoredTop = shouldUseThinBlockHandleAnchor(blockNode)
      ? resolveThinBlockHandleAnchorTop(blockElement, railHeight)
      : shouldCenterBlockHandleForNode(blockNode)
        ? resolveBlockHandleAnchorTop(blockElement, railHeight)
        : rect.top + 6
    const railLayout = resolveBlockHandleRailLayoutForSurface(
      rect,
      railWidth,
      railHeight,
      anchoredTop,
      viewportRect,
      handlePositionMode
    )
    const nextState: TopLevelBlockHandleState = {
      visible: true,
      kind: "top-level",
      blockIndex,
      listPath: [],
      itemIndex: null,
      left: railLayout.left,
      top: railLayout.top,
      bottom: resolveBlockChromeTop(rect.bottom + 12, viewportRect, handlePositionMode),
      width: rect.width,
    }

    setBlockHandleState((prev) => (isStableBlockHandleState(prev, nextState) ? prev : nextState))
    rectCache.clear()
  }, [
    blockHandleRailMetricsRef,
    blockSelectionLayoutRectCacheRef,
    clickedBlockIndex,
    editor,
    getTopLevelBlockElementByIndex,
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
  ])

  useEffect(() => {
    const elements = getTopLevelBlockElements()
    const root = getContentRoot()
    const listItems = root ? Array.from(root.querySelectorAll<HTMLElement>(LIST_ITEM_SELECTOR)) : []

    elements.forEach((element, index) => {
      if (hoveredListItemContext) {
        element.removeAttribute("data-block-hovered")
      } else if (index === hoveredBlockIndex && !draggedBlockState) {
        element.setAttribute("data-block-hovered", "true")
      } else {
        element.removeAttribute("data-block-hovered")
      }

      if (draggedBlockState && index === draggedBlockState.sourceIndex) {
        element.setAttribute("data-block-dragging", "true")
      } else {
        element.removeAttribute("data-block-dragging")
      }

      element.removeAttribute("data-block-drop-target")
    })

    listItems.forEach((element) => {
      if (
        hoveredListItemContext &&
        !draggedBlockState &&
        isSameNestedListItemContext(hoveredListItemContext, {
          ...hoveredListItemContext,
          listItemElement: element,
          listElement: hoveredListItemContext.listElement,
          listItems: hoveredListItemContext.listItems,
        }) &&
        element === hoveredListItemContext.listItemElement
      ) {
        element.setAttribute("data-block-hovered", "true")
      } else {
        element.removeAttribute("data-block-hovered")
      }

      element.removeAttribute("data-block-dragging")
      element.removeAttribute("data-block-drop-target")
    })

    return () => {
      elements.forEach((element) => {
        element.removeAttribute("data-block-hovered")
        element.removeAttribute("data-block-dragging")
        element.removeAttribute("data-block-drop-target")
      })
      listItems.forEach((element) => {
        element.removeAttribute("data-block-hovered")
        element.removeAttribute("data-block-dragging")
        element.removeAttribute("data-block-drop-target")
      })
    }
  }, [draggedBlockState, dropIndicatorState.insertionIndex, getContentRoot, getTopLevelBlockElements, hoveredBlockIndex, hoveredListItemContext])

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
        targetEvent instanceof Element ? targetEvent : targetEvent instanceof Node ? targetEvent.parentElement : null
      const cell = getTableCellFromClientPoint(clientX, clientY, targetEvent)
      const targetListItemContext =
        findNestedListItemContextFromTarget(targetEvent) ??
        findNestedListItemContextByClientPosition(clientX, clientY)
      const targetBlockIndex =
        findTopLevelBlockIndexFromTarget(targetEvent) ??
        findTopLevelBlockIndexByClientPosition(clientX, clientY)
      const targetBlockElement =
        targetBlockIndex !== null ? getTopLevelBlockElementByIndex(targetBlockIndex) : null
      const targetBlockRect = targetBlockElement?.getBoundingClientRect() ?? null
      const isFarLeftTableBlockGutter = Boolean(
        targetBlockElement?.querySelector(".aq-table-shell, .tableWrapper, table") &&
          targetBlockRect &&
          clientY >= targetBlockRect.top - BLOCK_OUTER_SELECT_VERTICAL_MARGIN_PX &&
          clientY <= targetBlockRect.bottom + BLOCK_OUTER_SELECT_VERTICAL_MARGIN_PX &&
          clientX <= targetBlockRect.left - 12
      )
      if (
        target?.closest("[data-table-menu-root='true']") ||
        (target?.closest("[data-table-axis-rail='true']") && !isFarLeftTableBlockGutter) ||
        target?.closest("[data-table-corner-handle='true']") ||
        target?.closest("[data-table-column-rail-track='true']") ||
        target?.closest("[data-table-menu-trigger='true']")
      ) {
        cancelTableQuickRailHide()
        setTableQuickRailHovered(true)
        syncTrackedHoveredTableCellMenuLayout()
        setHoveredListItemContext(null)
        if (isWriterSurface || currentTableAxisSelection !== null) {
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
      const hoveredTableElement = cell?.closest(".aq-table-shell, .tableWrapper, table") ?? target?.closest(".aq-table-shell, .tableWrapper, table") ?? null
      if (hoveredTableElement) {
        syncTableQuickRailFromElement(cell ?? target ?? hoveredTableElement, clientX, clientY)
        setTableQuickRailHovered(true)
        setViewportRowResizeHot(isTableRowResizeHandleTarget(cell, clientX, clientY))
        setHoveredListItemContext(null)
        setHoveredBlockIndex(isWriterSurface || currentTableAxisSelection !== null ? targetBlockIndex : null)
        if (selectedBlockNodeIndex !== null && !keyboardBlockSelectionStickyRef.current) {
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
        setHoveredBlockIndex(null)
        return
      }
      if (target?.closest("[data-block-handle-rail='true']") || target?.closest("[data-block-menu-root='true']")) {
        if (blockHandleState.visible) {
          if (blockHandleState.kind === "list-item" && hoveredListItemContext) {
            setHoveredListItemContext(hoveredListItemContext)
          }
          setHoveredBlockIndex(blockHandleState.blockIndex)
        }
        return
      }
      setViewportRowResizeHot(isTableRowResizeHandleTarget(cell, clientX, clientY))
      setHoveredListItemContext(targetListItemContext)
      setHoveredBlockIndex(
        findTopLevelBlockIndexByClientPosition(clientX, clientY) ??
          findTopLevelBlockIndexFromTarget(targetEvent)
      )
      if (selectedBlockNodeIndex !== null && !keyboardBlockSelectionStickyRef.current) {
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
        const contentLength = (currentEditor.getJSON() as BlockEditorDoc).content?.length ?? 0
        const nextFocusIndex = Math.max(0, Math.min(blockIndex, Math.max(contentLength - 2, 0)))
        mutateTopLevelBlocks((doc) => deleteTopLevelBlockAt(doc, blockIndex), nextFocusIndex)
        setBlockMenuState(null)
        keyboardBlockSelectionStickyRef.current = false
        setSelectedBlockNodeIndex(null)
        syncSelectedBlockNodeSurface(null)
        currentEditor.view.focus()
        return
      }

      if (event.defaultPrevented) return
      if (event.key !== "Tab" || event.metaKey || event.ctrlKey || event.altKey) return
      if (slashMenuState) return
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

      const targetBlockIndex =
        hoveredBlockIndex ??
        findTopLevelBlockIndexFromTarget(event.target) ??
        getTopLevelBlockIndexFromSelection(currentEditor)

      if (!isTabBlockSelectionEligible(currentEditor, targetBlockIndex)) return

      event.preventDefault()
      event.stopPropagation()
      promoteTopLevelBlockSelection(targetBlockIndex)
    },
    [
      clearNativeTextSelection,
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
      const targetListItemContext = findNestedListItemContextFromTarget(event.target)
      const targetBlockIndex =
        findTopLevelBlockIndexFromTarget(event.target) ??
        findTopLevelBlockIndexByClientPosition(event.clientX, event.clientY)
      const currentEditor = editorRef.current ?? editor
      if (currentEditor) preserveWindowScrollForEditorPointerFocus(event.target, isTableSelectionActive(currentEditor))
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
        promoteTopLevelBlockSelection(targetBlockIndex)
        return
      }
      setClickedBlockIndex(null)
      if (selectedBlockNodeIndex !== null) {
        keyboardBlockSelectionStickyRef.current = false
        setSelectedBlockNodeIndex(null)
        syncSelectedBlockNodeSurface(null)
      }
      if (isCoarsePointer || isTableRowResizeActive() || isTableColumnRailResizeActive()) return
      const cell = getTableCellFromClientPoint(event.clientX, event.clientY, event.target)
      const hasActiveTableStructuralSelection = Boolean(
        currentEditor &&
          hasTableStructuralSelection(currentEditor)
      )
      if (cell) {
        setTableQuickRailHovered(false)
        if (!shouldPersistTableHandles) {
          hideTableQuickRailImmediately()
        }
      }
      if (cell && hasActiveTableStructuralSelection && !isTableRowResizeHandleTarget(cell, event.clientX, event.clientY)) {
        focusRenderedTableCell(cell)
      }
      if (!isTableRowResizeHandleTarget(cell, event.clientX, event.clientY) || !cell) return
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
      keyboardBlockSelectionStickyRef,
      promoteTopLevelBlockSelection,
      selectedBlockNodeIndex,
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
