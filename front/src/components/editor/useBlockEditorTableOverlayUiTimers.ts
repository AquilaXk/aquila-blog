import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  INITIAL_TABLE_AFFORDANCE_VISIBILITY,
  type TableAffordanceGeometry,
  type TableAffordanceVisibility,
} from "./tableAffordanceModel"
import { resolveActiveRenderedTableForFloatingUi } from "./tableRenderedDomModel"
import {
  TABLE_OVERFLOW_COACHMARK_DISMISS_MS,
  createHiddenTableOverflowCoachmarkState,
  hideTableOverflowCoachmarkState,
  resolveTableOverflowCoachmarkState,
  type TableOverflowCoachmarkState,
} from "./tableFloatingUiModel"

type UseBlockEditorTableOverlayUiTimersArgs = {
  cornerButtonSize: number
  isCoarsePointer: boolean
  isNarrowTableViewport: boolean
  setTableAffordanceVisibility: Dispatch<SetStateAction<TableAffordanceVisibility>>
  tableAffordanceGeometryRef: MutableRefObject<TableAffordanceGeometry>
  tableAxisHoverLockUntilRef: MutableRefObject<number>
  viewportRef: RefObject<HTMLDivElement>
}

const TABLE_QUICK_RAIL_HIDE_DELAY_MS = 120

export const useBlockEditorTableOverlayUiTimers = ({
  cornerButtonSize,
  isCoarsePointer,
  isNarrowTableViewport,
  setTableAffordanceVisibility,
  tableAffordanceGeometryRef,
  tableAxisHoverLockUntilRef,
  viewportRef,
}: UseBlockEditorTableOverlayUiTimersArgs) => {
  const tableQuickRailHideTimerRef = useRef<number | null>(null)
  const tableOverflowCoachmarkHideTimerRef = useRef<number | null>(null)
  const [tableOverflowCoachmarkState, setTableOverflowCoachmarkState] =
    useState<TableOverflowCoachmarkState>(createHiddenTableOverflowCoachmarkState)

  const cancelTableOverflowCoachmarkHide = useCallback(() => {
    if (typeof window === "undefined") return
    if (tableOverflowCoachmarkHideTimerRef.current !== null) {
      window.clearTimeout(tableOverflowCoachmarkHideTimerRef.current)
      tableOverflowCoachmarkHideTimerRef.current = null
    }
  }, [])

  const hideTableOverflowCoachmark = useCallback(() => {
    cancelTableOverflowCoachmarkHide()
    setTableOverflowCoachmarkState(hideTableOverflowCoachmarkState)
  }, [cancelTableOverflowCoachmarkHide])

  const scheduleTableOverflowCoachmarkHide = useCallback(
    (delayMs = TABLE_OVERFLOW_COACHMARK_DISMISS_MS) => {
      if (typeof window === "undefined") return
      cancelTableOverflowCoachmarkHide()
      tableOverflowCoachmarkHideTimerRef.current = window.setTimeout(() => {
        tableOverflowCoachmarkHideTimerRef.current = null
        setTableOverflowCoachmarkState(hideTableOverflowCoachmarkState)
      }, delayMs)
    },
    [cancelTableOverflowCoachmarkHide]
  )

  useEffect(() => () => cancelTableOverflowCoachmarkHide(), [cancelTableOverflowCoachmarkHide])

  const showTableOverflowCoachmark = useCallback(() => {
    if (isCoarsePointer || isNarrowTableViewport || typeof window === "undefined") return
    const renderedTable = resolveActiveRenderedTableForFloatingUi(
      viewportRef.current,
      tableAffordanceGeometryRef.current
    )
    const tableRect = renderedTable?.getBoundingClientRect() ?? null
    setTableOverflowCoachmarkState(
      resolveTableOverflowCoachmarkState({
        tableRect,
        fallbackAnchor: tableAffordanceGeometryRef.current.cornerAnchor,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        cornerButtonSize,
      })
    )
    scheduleTableOverflowCoachmarkHide()
  }, [cornerButtonSize, isCoarsePointer, isNarrowTableViewport, scheduleTableOverflowCoachmarkHide, tableAffordanceGeometryRef, viewportRef])

  const clearTableQuickRailVisibility = useCallback(() => {
    setTableAffordanceVisibility((prev) =>
      prev.visible ||
      prev.showColumnRail ||
      prev.showRowRail ||
      prev.showColumnAddBar ||
      prev.showRowAddBar ||
      prev.showCornerControls ||
      prev.showCellMenu
        ? INITIAL_TABLE_AFFORDANCE_VISIBILITY
        : prev
    )
  }, [setTableAffordanceVisibility])

  const cancelTableQuickRailHide = useCallback(() => {
    if (tableQuickRailHideTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(tableQuickRailHideTimerRef.current)
      tableQuickRailHideTimerRef.current = null
    }
  }, [])

  const scheduleTableQuickRailHide = useCallback((delayMs = TABLE_QUICK_RAIL_HIDE_DELAY_MS) => {
    cancelTableQuickRailHide()
    if (typeof window === "undefined") return
    const runHide = () => {
      const now =
        typeof window.performance !== "undefined"
          ? window.performance.now()
          : Date.now()
      const remainingAxisHoverLockMs = tableAxisHoverLockUntilRef.current - now
      if (remainingAxisHoverLockMs > 0) {
        tableQuickRailHideTimerRef.current = window.setTimeout(runHide, remainingAxisHoverLockMs + 16)
        return
      }
      tableQuickRailHideTimerRef.current = null
      clearTableQuickRailVisibility()
    }
    tableQuickRailHideTimerRef.current = window.setTimeout(runHide, delayMs)
  }, [cancelTableQuickRailHide, clearTableQuickRailVisibility, tableAxisHoverLockUntilRef])

  const hideTableQuickRailImmediately = useCallback(() => {
    const now =
      typeof window !== "undefined" && typeof window.performance !== "undefined"
        ? window.performance.now()
        : Date.now()
    const remainingAxisHoverLockMs = tableAxisHoverLockUntilRef.current - now
    if (remainingAxisHoverLockMs > 0) {
      scheduleTableQuickRailHide(remainingAxisHoverLockMs + 16)
      return
    }
    cancelTableQuickRailHide()
    clearTableQuickRailVisibility()
  }, [
    cancelTableQuickRailHide,
    clearTableQuickRailVisibility,
    scheduleTableQuickRailHide,
    tableAxisHoverLockUntilRef,
  ])

  return {
    cancelTableOverflowCoachmarkHide,
    cancelTableQuickRailHide,
    hideTableOverflowCoachmark,
    hideTableQuickRailImmediately,
    scheduleTableOverflowCoachmarkHide,
    scheduleTableQuickRailHide,
    showTableOverflowCoachmark,
    tableOverflowCoachmarkState,
  }
}
