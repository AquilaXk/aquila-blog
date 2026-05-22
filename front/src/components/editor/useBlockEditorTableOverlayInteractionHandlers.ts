import type { Dispatch, MutableRefObject, SetStateAction } from "react"
import { useCallback } from "react"
import type { TableAffordanceGeometry } from "./tableAffordanceModel"
import type { TableMenuKind } from "./tableFloatingUiModel"

type UseBlockEditorTableOverlayInteractionHandlersArgs = {
  activeTableElementRef: MutableRefObject<HTMLTableElement | null>
  hoveredTableElementRef: MutableRefObject<HTMLTableElement | null>
  openTableMenu: (kind: TableMenuKind, anchorRect: DOMRect) => void
  scheduleTableQuickRailHide: (delayMs?: number) => void
  selectTableColumnByIndex: (columnIndex: number) => boolean
  selectTableRowByIndex: (rowIndex: number) => boolean
  setHoveredTableCellMenuLayout: Dispatch<SetStateAction<{ cellMenuLeft: number; cellMenuTop: number } | null>>
  setIsTableQuickRailHovered: Dispatch<SetStateAction<boolean>>
  setTableAffordanceGeometry: Dispatch<SetStateAction<TableAffordanceGeometry>>
  setViewportRowResizeHot: (enabled: boolean) => void
  shouldPersistTableHandles: boolean
  syncHoveredTableCellMenuLayout: (tableElement: HTMLTableElement | null, preferredCell?: HTMLElement | null) => void
  tableHoverAnchorLockUntilRef: MutableRefObject<number>
  tableRowResizeRef: MutableRefObject<unknown | null>
}

export const useBlockEditorTableOverlayInteractionHandlers = ({
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
}: UseBlockEditorTableOverlayInteractionHandlersArgs) => {
  const handleTableColumnRailSegmentClick = useCallback(
    (columnIndex: number, anchorRect: DOMRect) => {
      const selected = selectTableColumnByIndex(columnIndex)
      if (!selected) return
      setTableAffordanceGeometry((prev) => ({ ...prev, columnIndex }))
      openTableMenu("column", anchorRect)
    },
    [openTableMenu, selectTableColumnByIndex, setTableAffordanceGeometry]
  )

  const handleTableRowGripClick = useCallback(
    (rowIndex: number, anchorRect: DOMRect) => {
      const selected = selectTableRowByIndex(rowIndex)
      if (!selected) return
      setTableAffordanceGeometry((prev) => ({ ...prev, rowIndex }))
      openTableMenu("row", anchorRect)
    },
    [openTableMenu, selectTableRowByIndex, setTableAffordanceGeometry]
  )

  const setTableQuickRailHovered = useCallback((hovered: boolean) => {
    setIsTableQuickRailHovered(hovered)
  }, [setIsTableQuickRailHovered])

  const clearHoveredTableCellMenuLayout = useCallback(() => {
    setHoveredTableCellMenuLayout(null)
  }, [setHoveredTableCellMenuLayout])

  const clearTrackedTableHover = useCallback(() => {
    hoveredTableElementRef.current = null
    tableHoverAnchorLockUntilRef.current = 0
    setHoveredTableCellMenuLayout(null)
  }, [hoveredTableElementRef, setHoveredTableCellMenuLayout, tableHoverAnchorLockUntilRef])

  const syncTrackedHoveredTableCellMenuLayout = useCallback(() => {
    syncHoveredTableCellMenuLayout(hoveredTableElementRef.current ?? activeTableElementRef.current)
  }, [activeTableElementRef, hoveredTableElementRef, syncHoveredTableCellMenuLayout])

  const handleTableViewportPointerLeave = useCallback(() => {
    setIsTableQuickRailHovered(false)
    if (!shouldPersistTableHandles) {
      scheduleTableQuickRailHide()
    }
    setHoveredTableCellMenuLayout(null)
    if (!tableRowResizeRef.current) {
      setViewportRowResizeHot(false)
    }
  }, [
    scheduleTableQuickRailHide,
    setHoveredTableCellMenuLayout,
    setIsTableQuickRailHovered,
    setViewportRowResizeHot,
    shouldPersistTableHandles,
    tableRowResizeRef,
  ])

  return {
    clearHoveredTableCellMenuLayout,
    clearTrackedTableHover,
    handleTableColumnRailSegmentClick,
    handleTableRowGripClick,
    handleTableViewportPointerLeave,
    setTableQuickRailHovered,
    syncTrackedHoveredTableCellMenuLayout,
  }
}
