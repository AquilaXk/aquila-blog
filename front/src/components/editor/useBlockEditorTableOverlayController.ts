import type { Editor as TiptapEditor } from "@tiptap/core"
import { NodeSelection } from "@tiptap/pm/state"
import { CellSelection } from "@tiptap/pm/tables"
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react"
import { useCallback, useEffect, useMemo } from "react"
import { resolveDesktopTableRailLayout } from "./tableAffordanceModel"
import { resolveCompactTableAffordanceKind, resolveTableHandleVisibility, resolveTableMenuFlags } from "./tableFloatingUiModel"
import { getActiveTableStructureState, isTableSelectionActive } from "./tableStructureModel"
import { useBlockEditorTableOverlayAxisDrag } from "./useBlockEditorTableOverlayAxisDrag"
import { useBlockEditorTableOverlayCornerGrow } from "./useBlockEditorTableOverlayCornerGrow"
import { useBlockEditorTableOverlayControllerEffects } from "./useBlockEditorTableOverlayControllerEffects"
import {
  TABLE_CORNER_BUTTON_SIZE_PX,
  TABLE_EDGE_HANDLE_INSET_PX,
  useBlockEditorTableOverlayControllerState,
} from "./useBlockEditorTableOverlayControllerState"
import { useBlockEditorTableOverlayControllerCommands } from "./useBlockEditorTableOverlayControllerCommands"
import { useBlockEditorTableOverlayDomAdapter } from "./useBlockEditorTableOverlayDomAdapter"
import { useBlockEditorTableOverlayInteractionHandlers } from "./useBlockEditorTableOverlayInteractionHandlers"
import { useBlockEditorTableOverlayMenu } from "./useBlockEditorTableOverlayMenu"
import { useBlockEditorTableOverlayResize } from "./useBlockEditorTableOverlayResize"
import { useBlockEditorTableOverlayUiTimers } from "./useBlockEditorTableOverlayUiTimers"
type UseBlockEditorTableOverlayControllerArgs = {
  clearStickyTopLevelBlockSelection: () => void
  editor: TiptapEditor | null
  editorRef: MutableRefObject<TiptapEditor | null>
  isCoarsePointer: boolean
  selectionTick: number
  setSelectionTick: Dispatch<SetStateAction<number>>
  syncSelectedBlockNodeSurface: (blockIndex: number | null) => void
  viewportRef: RefObject<HTMLDivElement>
}
export const useBlockEditorTableOverlayController = ({
  clearStickyTopLevelBlockSelection,
  editor,
  editorRef,
  isCoarsePointer,
  selectionTick,
  setSelectionTick,
  syncSelectedBlockNodeSurface,
  viewportRef,
}: UseBlockEditorTableOverlayControllerArgs) => {
  const {
    activeTableElementRef,
    hoveredTableCellMenuLayout,
    hoveredTableElementRef,
    isNarrowTableViewport,
    isTableQuickRailHovered,
    setHoveredTableCellMenuLayout,
    setIsTableQuickRailHovered,
    setTableAffordanceGeometry,
    setTableAffordanceVisibility,
    setTableMenuState,
    setViewportRowResizeHot,
    tableAffordanceGeometry,
    tableAffordanceGeometryRef,
    tableAffordanceVisibility,
    tableAffordanceVisibilityRef,
    tableHoverAnchorLockUntilRef,
    tableMenuState,
  } = useBlockEditorTableOverlayControllerState({ viewportRef })
  const isTableMode = isTableSelectionActive(editor)
  const isTableStructuralSelection = useMemo(() => {
    if (!editor) return false
    void selectionTick
    const { selection } = editor.state
    return selection instanceof CellSelection
  }, [editor, selectionTick])
  const {
    focusRenderedTableCell,
    getCurrentSelectedTableRect,
    getTableCellFromClientPoint,
    resolveTableNodePosition,
    resolveTableQuickRailAnchorElement,
  } = useBlockEditorTableOverlayDomAdapter({
    activeTableElementRef,
    editorRef,
    hoveredTableElementRef,
    tableAffordanceGeometryRef,
    tableHoverAnchorLockUntilRef,
    viewportRef,
  })
  const {
    cancelTableOverflowCoachmarkHide,
    cancelTableQuickRailHide,
    hideTableOverflowCoachmark,
    hideTableQuickRailImmediately,
    scheduleTableOverflowCoachmarkHide,
    scheduleTableQuickRailHide,
    showTableOverflowCoachmark,
    tableOverflowCoachmarkState,
  } = useBlockEditorTableOverlayUiTimers({
    cornerButtonSize: TABLE_CORNER_BUTTON_SIZE_PX,
    isCoarsePointer,
    isNarrowTableViewport,
    setTableAffordanceVisibility,
    tableAffordanceGeometryRef,
    viewportRef,
  })
  const {
    currentTableAxisSelection,
    draggedTableAxisState,
    isCurrentTableColumnSelection,
    isCurrentTableRowSelection,
    selectTableAxisAtIndex,
    selectTableColumnByIndex,
    selectTableRowByIndex,
    startPendingTableAxisDrag,
    tableAxisDragGhostPosition,
    tableAxisDragSuppressClickRef,
    tableAxisReorderIndicatorState,
  } = useBlockEditorTableOverlayAxisDrag({
    cancelTableQuickRailHide,
    clearStickyTopLevelBlockSelection,
    editor,
    editorRef,
    getCurrentSelectedTableRect,
    isTableStructuralSelection,
    selectionTick,
    setSelectionTick,
    setTableAffordanceGeometry,
    setTableMenuState,
    tableAffordanceGeometryRef,
    viewportRef,
  })
  const {
    clearWindowTextSelection,
    stabilizeTableSelectionSurface,
    syncHoveredTableCellMenuLayout,
    syncTableQuickRailFromElement,
  } = useBlockEditorTableOverlayControllerCommands({
    activeTableElementRef,
    cancelTableQuickRailHide,
    editorRef,
    hideTableQuickRailImmediately,
    hoveredTableElementRef,
    resolveTableQuickRailAnchorElement,
    setHoveredTableCellMenuLayout,
    setSelectionTick,
    setTableAffordanceGeometry,
    setTableAffordanceVisibility,
    tableHoverAnchorLockUntilRef,
    viewportRef,
  })
  const {
    hideTableColumnDragGuide,
    isTableColumnRailResizeActive,
    isTableColumnResizeActive,
    isTableRowResizeActive,
    isTableRowResizeHandleTarget,
    resizeFirstTableColumnBy,
    resizeFirstTableRowBy,
    startTableColumnRailResize,
    startTableRowResize,
    tableColumnDragGuideState,
    tableColumnRailResizeRef,
    tableRowResizeRef,
    tryStartTableColumnResizeFromDomHandle,
  } = useBlockEditorTableOverlayResize({
    activeTableElementRef,
    clearWindowTextSelection,
    editorRef,
    getCurrentSelectedTableRect,
    hideTableOverflowCoachmark,
    isCurrentTableColumnSelection,
    resolveTableNodePosition,
    selectTableColumnByIndex,
    setSelectionTick,
    setTableAffordanceGeometry,
    setViewportRowResizeHot,
    showTableOverflowCoachmark,
    tableAffordanceGeometryRef,
    viewportRef,
  })
  const {
    appendTableAxisAtEnd,
    growTableFromCorner,
    isTableCornerGrowActive,
    resolveTableCornerGrowStepMetricsFromHandle,
    startTableCornerGrow,
    tableCornerGrowMousePointerId,
    tableCornerGrowRef,
    tableCornerGrowStepMetrics,
    tableCornerGrowSuppressClickRef,
    tableCornerPreviewState,
  } = useBlockEditorTableOverlayCornerGrow({
    editorRef,
    focusRenderedTableCell,
    getCurrentSelectedTableRect,
    selectTableColumnByIndex,
    selectTableRowByIndex,
    setSelectionTick,
    tableAffordanceGeometry,
    tableAffordanceGeometryRef,
    viewportRef,
  })
  const {
    tableMenuKind,
    isAnyTableMenuOpen,
    isTableStructureMenuOpen,
    isRowMenuOpen,
    isColumnMenuOpen,
    isCellMenuOpen,
  } = resolveTableMenuFlags(tableMenuState)
  const hasActiveTableCellContext = useMemo(() => {
    if (!editor || isTableStructuralSelection) return false
    void selectionTick
    return Boolean(editor.isActive("tableCell") || editor.isActive("tableHeader"))
  }, [editor, isTableStructuralSelection, selectionTick])
  const shouldPersistTableHandles =
    isTableStructuralSelection || isAnyTableMenuOpen || Boolean(draggedTableAxisState) || isTableCornerGrowActive
  const shouldUseCompactTableAffordance = isCoarsePointer || isNarrowTableViewport
  const shouldShowDesktopTableHandles =
    !shouldUseCompactTableAffordance &&
    (tableAffordanceVisibility.visible || isTableQuickRailHovered || shouldPersistTableHandles || isTableColumnResizeActive)
  const compactTableAffordanceKind = resolveCompactTableAffordanceKind({
    shouldUseCompactTableAffordance,
    currentTableAxisSelection,
    draggedTableAxis: draggedTableAxisState?.axis ?? null,
    isRowMenuOpen,
    isColumnMenuOpen,
    tableAffordanceVisible: tableAffordanceVisibility.visible,
    shouldPersistTableHandles,
    isTableStructureMenuOpen,
    hasActiveTableCellContext,
  })
  const {
    shouldShowColumnRail,
    shouldShowRowRail,
    shouldShowColumnAddBar,
    shouldShowRowAddBar,
  } = resolveTableHandleVisibility({
    compactTableAffordanceKind,
    shouldShowDesktopTableHandles,
    tableAffordanceVisibility,
    currentTableAxisSelection,
    draggedTableAxis: draggedTableAxisState?.axis ?? null,
    isColumnMenuOpen,
    isRowMenuOpen,
  })
  const activeTableStructureState = useMemo(() => {
    void selectionTick
    return getActiveTableStructureState(editor)
  }, [editor, selectionTick])
  const {
    activeTableCellAttrs,
    canMergeSelectedTableCells,
    canSplitSelectedTableCell,
    openSelectionAwareTableMenu,
    openTableMenu,
    runTableMenuEditorAction,
    selectCurrentTableAxis,
    updateActiveTableCellAttrs,
    updateActiveTableOverflowMode,
  } = useBlockEditorTableOverlayMenu({
    cancelTableQuickRailHide,
    clearStickyTopLevelBlockSelection,
    editor,
    getCurrentSelectedTableRect,
    isTableStructuralSelection,
    setSelectionTick,
    setTableMenuState,
    stabilizeTableSelectionSurface,
    tableMenuState,
  })
  useBlockEditorTableOverlayControllerEffects({
    activeTableStructureOverflowMode: activeTableStructureState.overflowMode,
    draggedTableAxisState,
    editorRef,
    hideTableOverflowCoachmark,
    hideTableQuickRailImmediately,
    isCoarsePointer,
    isTableColumnResizeActive,
    isTableQuickRailHovered,
    isTableStructuralSelection,
    resolveTableQuickRailAnchorElement,
    scheduleTableQuickRailHide,
    selectionTick,
    setHoveredTableCellMenuLayout,
    setIsTableQuickRailHovered,
    setSelectionTick,
    setTableMenuState,
    syncTableQuickRailFromElement,
    tableAffordanceGeometry,
    tableAffordanceVisibility,
    tableAxisReorderIndicatorState,
    tableColumnDragGuideState,
    tableColumnRailResizeRef,
    tableMenuState,
    tableRowResizeRef,
  })
  const shouldShowTableCellMenu =
    currentTableAxisSelection === null &&
    !shouldUseCompactTableAffordance &&
    (isCellMenuOpen ||
      (tableAffordanceVisibility.visible &&
        (tableAffordanceVisibility.showCellMenu || hasActiveTableCellContext) &&
        !tableAffordanceVisibility.showColumnRail &&
        !tableAffordanceVisibility.showRowRail &&
        !tableAffordanceVisibility.showColumnAddBar &&
        !tableAffordanceVisibility.showRowAddBar &&
        !tableAffordanceVisibility.showCornerControls))
  const shouldShowCornerControls =
    shouldShowDesktopTableHandles &&
    (tableAffordanceVisibility.showCornerControls ||
      isTableStructureMenuOpen ||
      isTableCornerGrowActive ||
      (isTableStructuralSelection && currentTableAxisSelection === null))
  const shouldShowGrowHandle = shouldShowCornerControls
  const shouldShowStructureMenuButton = compactTableAffordanceKind === "table" || shouldShowCornerControls
  const shouldRenderTableAffordanceOverlay =
    shouldShowDesktopTableHandles ||
    shouldShowRowRail ||
    shouldShowColumnRail ||
    shouldShowRowAddBar ||
    shouldShowColumnAddBar ||
    shouldShowStructureMenuButton ||
    shouldShowTableCellMenu
  const desktopTableRailLayout = useMemo(() => {
    if (typeof window === "undefined") return null
    return resolveDesktopTableRailLayout(tableAffordanceGeometry)
  }, [tableAffordanceGeometry])
  const shouldShowCellMergeSection = canMergeSelectedTableCells || canSplitSelectedTableCell
  const {
    clearHoveredTableCellMenuLayout,
    clearTrackedTableHover,
    handleTableColumnRailSegmentClick,
    handleTableRowGripClick,
    handleTableViewportPointerLeave,
    setTableQuickRailHovered,
    syncTrackedHoveredTableCellMenuLayout,
  } = useBlockEditorTableOverlayInteractionHandlers({
    activeTableElementRef,
    hoveredTableElementRef,
    openTableMenu,
    scheduleTableQuickRailHide,
    selectTableColumnByIndex,
    selectTableRowByIndex,
    setHoveredTableCellMenuLayout,
    setIsTableQuickRailHovered,
    setTableAffordanceGeometry,
    setViewportRowResizeHot,
    shouldPersistTableHandles,
    syncHoveredTableCellMenuLayout,
    tableHoverAnchorLockUntilRef,
    tableRowResizeRef,
  })
  useEffect(() => {
    if (shouldShowDesktopTableHandles) return
    hideTableColumnDragGuide()
  }, [hideTableColumnDragGuide, shouldShowDesktopTableHandles])
  const hasTableStructuralSelection = useCallback((activeEditor?: TiptapEditor | null) => {
    if (!activeEditor) return false
    const selection = activeEditor.state.selection
    return Boolean(
      selection instanceof CellSelection ||
        (selection instanceof NodeSelection && selection.node.type.name === "table")
    )
  }, [])
  const isTopLevelInsertBlockedByTableUi = useCallback(
    () => tableAffordanceVisibilityRef.current.visible || tableMenuState !== null,
    [tableAffordanceVisibilityRef, tableMenuState]
  )
  return {
    cancelTableQuickRailHide,
    clearHoveredTableCellMenuLayout,
    clearTrackedTableHover,
    clearWindowTextSelection,
    currentTableAxisSelection,
    focusRenderedTableCell,
    getTableCellFromClientPoint,
    handleTableViewportPointerLeave,
    hasTableStructuralSelection,
    hideTableQuickRailImmediately,
    isTableAffordanceVisible: tableAffordanceVisibility.visible,
    isTableAxisDragActive: Boolean(draggedTableAxisState),
    isTableColumnRailResizeActive,
    isTableMode,
    isTableRowResizeActive,
    isTableRowResizeHandleTarget,
    isTableStructuralSelection,
    isTopLevelInsertBlockedByTableUi,
    layerProps: {
      activeTableCellAttrs,
      activeTableStructureState,
      appendTableAxisAtEnd,
      canMergeSelectedTableCells,
      canSplitSelectedTableCell,
      cancelTableOverflowCoachmarkHide,
      cancelTableQuickRailHide,
      compactTableAffordanceKind,
      desktopTableRailLayout,
      draggedTableAxisState,
      editor,
      growTableFromCorner,
      handleTableColumnRailSegmentClick,
      handleTableRowGripClick,
      hideTableOverflowCoachmark,
      hoveredTableCellMenuLayout,
      isCurrentTableColumnSelection,
      isCurrentTableRowSelection,
      isTableCornerGrowActive,
      isTableQuickRailHovered,
      openSelectionAwareTableMenu,
      openTableMenu,
      resolveTableCornerGrowStepMetricsFromHandle,
      runTableMenuEditorAction,
      scheduleTableOverflowCoachmarkHide,
      scheduleTableQuickRailHide,
      shouldPersistTableHandles,
      shouldRenderTableAffordanceOverlay,
      shouldShowCellMergeSection,
      shouldShowColumnAddBar,
      shouldShowColumnRail,
      shouldShowDesktopTableHandles,
      shouldShowGrowHandle,
      shouldShowRowAddBar,
      shouldShowRowRail,
      shouldShowStructureMenuButton,
      shouldShowTableCellMenu,
      stabilizeTableSelectionSurface,
      startPendingTableAxisDrag,
      startTableColumnRailResize,
      startTableCornerGrow,
      tableAffordanceGeometry,
      tableAxisDragGhostPosition,
      tableAxisDragSuppressClickRef,
      tableAxisReorderIndicatorState,
      tableColumnDragGuideState,
      tableCornerGrowMousePointerId,
      tableCornerGrowRef,
      tableCornerGrowStepMetrics,
      tableCornerGrowSuppressClickRef,
      tableCornerPreviewState,
      tableEdgeHandleInsetPx: TABLE_EDGE_HANDLE_INSET_PX,
      tableMenuKind: tableMenuKind ?? tableMenuState?.kind ?? "table",
      tableMenuState,
      tableOverflowCoachmarkState,
      updateActiveTableCellAttrs,
      updateActiveTableOverflowMode,
    },
    resizeFirstTableColumnBy,
    resizeFirstTableRowBy,
    scheduleTableQuickRailHide,
    selectCurrentTableAxis,
    selectTableColumnByIndex,
    setTableQuickRailHovered,
    setViewportRowResizeHot,
    shouldPersistTableHandles,
    startTableRowResize,
    syncTableQuickRailFromElement,
    syncTrackedHoveredTableCellMenuLayout,
    tableMenuState,
    tryStartTableColumnResizeFromDomHandle,
    updateActiveTableCellAttrs,
  }
}
