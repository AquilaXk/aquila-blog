import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  INITIAL_TABLE_AFFORDANCE_GEOMETRY,
  INITIAL_TABLE_AFFORDANCE_VISIBILITY,
  type TableAffordanceGeometry,
  type TableAffordanceVisibility,
} from "./tableAffordanceModel"
import type { TableMenuState } from "./tableFloatingUiModel"

export const DESKTOP_TABLE_RAIL_MEDIA_QUERY = "(max-width: 768px)"
export const TABLE_CORNER_BUTTON_SIZE_PX = 22
export const TABLE_COLUMN_GRIP_WIDTH_PX = 40
export const TABLE_COLUMN_GRIP_HEIGHT_PX = 22
export const TABLE_ROW_GRIP_WIDTH_PX = 22
export const TABLE_ROW_GRIP_HEIGHT_PX = 40
export const TABLE_AXIS_GRIP_EDGE_INSET_PX = 0
export const TABLE_ADD_BAR_THICKNESS_PX = 28
export const TABLE_AXIS_RAIL_EDGE_HOTZONE_PX = 18
export const TABLE_TRAILING_ADD_EDGE_HOTZONE_PX = 18
export const TABLE_EDGE_HANDLE_INSET_PX = 6
export const TABLE_CORNER_CLUSTER_GAP_PX = 6
export const TABLE_CORNER_CLUSTER_WIDTH_PX =
  TABLE_CORNER_BUTTON_SIZE_PX * 2 + TABLE_CORNER_CLUSTER_GAP_PX

type UseBlockEditorTableOverlayControllerStateArgs = {
  viewportRef: RefObject<HTMLDivElement>
}

export const useBlockEditorTableOverlayControllerState = ({
  viewportRef,
}: UseBlockEditorTableOverlayControllerStateArgs) => {
  const activeTableElementRef = useRef<HTMLTableElement | null>(null)
  const hoveredTableElementRef = useRef<HTMLTableElement | null>(null)
  const tableAxisHoverLockUntilRef = useRef(0)
  const tableHoverAnchorLockUntilRef = useRef(0)
  const [isNarrowTableViewport, setIsNarrowTableViewport] = useState(false)
  const [tableAffordanceGeometry, setTableAffordanceGeometry] = useState<TableAffordanceGeometry>(
    INITIAL_TABLE_AFFORDANCE_GEOMETRY
  )
  const [tableAffordanceVisibility, setTableAffordanceVisibility] = useState<TableAffordanceVisibility>(
    INITIAL_TABLE_AFFORDANCE_VISIBILITY
  )
  const [isTableQuickRailHovered, setIsTableQuickRailHovered] = useState(false)
  const [hoveredTableCellMenuLayout, setHoveredTableCellMenuLayout] = useState<{
    cellMenuLeft: number
    cellMenuTop: number
  } | null>(null)
  const [tableMenuState, setTableMenuState] = useState<TableMenuState>(null)
  const tableAffordanceGeometryRef = useRef(tableAffordanceGeometry)
  const tableAffordanceVisibilityRef = useRef(tableAffordanceVisibility)

  useEffect(() => {
    tableAffordanceGeometryRef.current = tableAffordanceGeometry
  }, [tableAffordanceGeometry])

  useEffect(() => {
    tableAffordanceVisibilityRef.current = tableAffordanceVisibility
  }, [tableAffordanceVisibility])

  useEffect(() => {
    if (typeof window === "undefined") return
    const mediaQuery = window.matchMedia(DESKTOP_TABLE_RAIL_MEDIA_QUERY)
    const sync = () => setIsNarrowTableViewport(mediaQuery.matches)
    sync()
    mediaQuery.addEventListener?.("change", sync)
    return () => mediaQuery.removeEventListener?.("change", sync)
  }, [])

  const setViewportRowResizeHot = useCallback((enabled: boolean) => {
    const viewport = viewportRef.current
    if (!viewport) return
    if (enabled) {
      viewport.setAttribute("data-row-resize-hot", "true")
      return
    }
    viewport.removeAttribute("data-row-resize-hot")
  }, [viewportRef])

  return {
    activeTableElementRef,
    hoveredTableElementRef,
    hoveredTableCellMenuLayout,
    isNarrowTableViewport,
    isTableQuickRailHovered,
    setHoveredTableCellMenuLayout,
    setIsTableQuickRailHovered,
    setTableAffordanceGeometry: setTableAffordanceGeometry as Dispatch<SetStateAction<TableAffordanceGeometry>>,
    setTableAffordanceVisibility: setTableAffordanceVisibility as Dispatch<SetStateAction<TableAffordanceVisibility>>,
    setTableMenuState,
    setViewportRowResizeHot,
    tableAffordanceGeometry,
    tableAffordanceGeometryRef,
    tableAffordanceVisibility,
    tableAffordanceVisibilityRef,
    tableAxisHoverLockUntilRef,
    tableHoverAnchorLockUntilRef,
    tableMenuState,
  }
}
