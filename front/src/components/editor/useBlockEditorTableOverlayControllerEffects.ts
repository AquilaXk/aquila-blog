import type { Editor as TiptapEditor } from "@tiptap/core"
import type { Dispatch, MutableRefObject, SetStateAction } from "react"
import { useEffect } from "react"
import { flushSync } from "react-dom"
import { intersectsViewportBounds, type TableAffordanceGeometry, type TableAffordanceVisibility } from "./tableAffordanceModel"
import type { DraggedTableAxisState, TableAxisReorderIndicatorState } from "./tableAxisDragModel"
import type { TableMenuState } from "./tableFloatingUiModel"
import type { TableColumnDragGuideState, TableColumnRailResizeState, TableRowResizeState } from "./tableResizeInteractionModel"
import { TABLE_OVERFLOW_MODE_WIDE } from "./tableWidthModel"

type UseBlockEditorTableOverlayControllerEffectsArgs = {
  activeTableStructureOverflowMode: string | null
  draggedTableAxisState: DraggedTableAxisState
  editorRef: MutableRefObject<TiptapEditor | null>
  hideTableOverflowCoachmark: () => void
  hideTableQuickRailImmediately: () => void
  isCoarsePointer: boolean
  isTableColumnResizeActive: boolean
  isTableQuickRailHovered: boolean
  isTableStructuralSelection: boolean
  resolveTableQuickRailAnchorElement: () => HTMLElement | null
  scheduleTableQuickRailHide: (delayMs?: number) => void
  selectionTick: number
  setHoveredTableCellMenuLayout: Dispatch<SetStateAction<{ cellMenuLeft: number; cellMenuTop: number } | null>>
  setIsTableQuickRailHovered: Dispatch<SetStateAction<boolean>>
  setSelectionTick: Dispatch<SetStateAction<number>>
  setTableMenuState: Dispatch<SetStateAction<TableMenuState>>
  syncTableQuickRailFromElement: (element: Element | null, hoverClientX?: number, hoverClientY?: number) => void
  tableAffordanceGeometry: TableAffordanceGeometry
  tableAffordanceVisibility: TableAffordanceVisibility
  tableAxisReorderIndicatorState: TableAxisReorderIndicatorState
  tableColumnDragGuideState: TableColumnDragGuideState
  tableColumnRailResizeRef: MutableRefObject<TableColumnRailResizeState | null>
  tableMenuState: TableMenuState
  tableRowResizeRef: MutableRefObject<TableRowResizeState | null>
}

export const useBlockEditorTableOverlayControllerEffects = ({
  activeTableStructureOverflowMode,
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
}: UseBlockEditorTableOverlayControllerEffectsArgs) => {
  useEffect(() => {
    if (activeTableStructureOverflowMode === TABLE_OVERFLOW_MODE_WIDE || tableMenuState) {
      hideTableOverflowCoachmark()
    }
  }, [activeTableStructureOverflowMode, hideTableOverflowCoachmark, tableMenuState])

  useEffect(() => {
    const currentEditor = editorRef.current
    if (!currentEditor || !isTableStructuralSelection) return
    const anchorDom = currentEditor.view.domAtPos(currentEditor.state.selection.from).node
    const anchorElement = anchorDom instanceof Element ? anchorDom : anchorDom.parentElement
    if (!anchorElement) return
    syncTableQuickRailFromElement(anchorElement)
  }, [editorRef, isTableStructuralSelection, selectionTick, syncTableQuickRailFromElement])

  const shouldTrackSelectionLayoutSync =
    tableAffordanceVisibility.visible ||
    isTableQuickRailHovered ||
    tableMenuState !== null ||
    isTableColumnResizeActive ||
    tableColumnDragGuideState.visible ||
    Boolean(draggedTableAxisState) ||
    tableAxisReorderIndicatorState.visible
  const shouldThrottleSelectionLayoutSync =
    !tableAffordanceVisibility.visible &&
    !isTableQuickRailHovered &&
    tableMenuState === null &&
    !isTableColumnResizeActive &&
    !tableColumnDragGuideState.visible &&
    !draggedTableAxisState &&
    !tableAxisReorderIndicatorState.visible
  const shouldSyncSelectionLayoutImmediately =
    isTableColumnResizeActive ||
    tableColumnDragGuideState.visible ||
    Boolean(draggedTableAxisState) ||
    tableAxisReorderIndicatorState.visible

  useEffect(() => {
    if (typeof window === "undefined" || !shouldTrackSelectionLayoutSync) return
    let rafId: number | null = null
    let timeoutId: number | null = null
    let lastCommittedAt = 0
    const scrollOptions: AddEventListenerOptions = { capture: true, passive: true }
    const resizeOptions: AddEventListenerOptions = { passive: true }
    const minSyncIntervalMs = shouldThrottleSelectionLayoutSync ? 72 : 0
    const sync = () => {
      if (shouldSyncSelectionLayoutImmediately) {
        lastCommittedAt = window.performance.now()
        flushSync(() => setSelectionTick((prev) => prev + 1))
        return
      }
      if (rafId !== null || timeoutId !== null) return
      const now = window.performance.now()
      const remainingDelayMs = minSyncIntervalMs > 0 ? minSyncIntervalMs - (now - lastCommittedAt) : 0
      const schedule = (delayMs: number) => {
        if (delayMs > 0) {
          timeoutId = window.setTimeout(() => {
            timeoutId = null
            schedule(0)
          }, delayMs)
          return
        }
        if (rafId !== null) return
        rafId = window.requestAnimationFrame(() => {
          rafId = null
          lastCommittedAt = window.performance.now()
          setSelectionTick((prev) => prev + 1)
        })
      }
      schedule(Math.max(0, remainingDelayMs))
    }
    window.addEventListener("scroll", sync, scrollOptions)
    window.addEventListener("resize", sync, resizeOptions)
    return () => {
      window.removeEventListener("scroll", sync, scrollOptions)
      window.removeEventListener("resize", sync, resizeOptions)
      if (rafId !== null) window.cancelAnimationFrame(rafId)
      if (timeoutId !== null) window.clearTimeout(timeoutId)
    }
  }, [setSelectionTick, shouldSyncSelectionLayoutImmediately, shouldThrottleSelectionLayoutSync, shouldTrackSelectionLayoutSync])

  useEffect(() => {
    if (!tableAffordanceVisibility.visible && !isTableQuickRailHovered && !tableMenuState) return
    const anchorCell = resolveTableQuickRailAnchorElement()
    const tableElement = anchorCell?.closest("table") as HTMLTableElement | null
    const tableVisible = intersectsViewportBounds(tableElement?.getBoundingClientRect() ?? null)
    const anchorVisible = intersectsViewportBounds(anchorCell?.getBoundingClientRect() ?? null)
    if (!anchorCell || !tableElement || !tableVisible || (!anchorVisible && !isTableQuickRailHovered)) {
      setHoveredTableCellMenuLayout(null)
      setIsTableQuickRailHovered(false)
      if (tableMenuState) {
        setTableMenuState(null)
        hideTableQuickRailImmediately()
      } else if (!isTableColumnResizeActive && !isTableQuickRailHovered) {
        scheduleTableQuickRailHide(0)
      } else {
        hideTableQuickRailImmediately()
      }
      return
    }
    syncTableQuickRailFromElement(anchorCell)
  }, [
    hideTableQuickRailImmediately,
    isTableColumnResizeActive,
    isTableQuickRailHovered,
    resolveTableQuickRailAnchorElement,
    selectionTick,
    scheduleTableQuickRailHide,
    setHoveredTableCellMenuLayout,
    setIsTableQuickRailHovered,
    setTableMenuState,
    syncTableQuickRailFromElement,
    tableAffordanceVisibility.visible,
    tableMenuState,
  ])

  useEffect(() => {
    if (typeof window === "undefined" || isCoarsePointer || (!tableAffordanceVisibility.visible && !isTableQuickRailHovered)) return
    if (tableColumnRailResizeRef.current || tableRowResizeRef.current) return
    const anchorElement = resolveTableQuickRailAnchorElement()
    const tableElement = anchorElement?.closest("table") as HTMLTableElement | null
    if (!anchorElement || !tableElement) return
    const tableRect = tableElement.getBoundingClientRect()
    const nextWidth = Math.round(tableRect.width)
    const nextSegments = Array.from(
      (tableElement.querySelector("thead tr, tbody tr, tr")?.children ?? []) as HTMLCollectionOf<HTMLElement>
    )
      .filter((child): child is HTMLElement => child instanceof HTMLElement)
      .map((cell) => {
        const cellRect = cell.getBoundingClientRect()
        return {
          left: Math.round(Math.max(0, cellRect.left - tableRect.left)),
          width: Math.round(cellRect.width),
        }
      })
    const segmentsChanged =
      nextSegments.length !== tableAffordanceGeometry.columnSegments.length ||
      nextSegments.some((segment, index) => {
        const prev = tableAffordanceGeometry.columnSegments[index]
        return !prev || Math.abs(prev.left - segment.left) > 2 || Math.abs(prev.width - segment.width) > 2
      })
    if (Math.abs(nextWidth - tableAffordanceGeometry.width) <= 2 && !segmentsChanged) return
    syncTableQuickRailFromElement(anchorElement)
  }, [
    isCoarsePointer,
    isTableQuickRailHovered,
    resolveTableQuickRailAnchorElement,
    selectionTick,
    syncTableQuickRailFromElement,
    tableAffordanceGeometry.columnSegments,
    tableAffordanceGeometry.width,
    tableAffordanceVisibility.visible,
    tableColumnRailResizeRef,
    tableRowResizeRef,
  ])

  useEffect(() => {
    if (typeof window === "undefined" || typeof MutationObserver === "undefined") return
    if (isCoarsePointer || (!tableAffordanceVisibility.visible && !isTableQuickRailHovered)) return
    const resolveAnchorElement = () => resolveTableQuickRailAnchorElement()
    const initialAnchorElement = resolveAnchorElement()
    const tableElement = initialAnchorElement?.closest("table") as HTMLTableElement | null
    if (!initialAnchorElement || !tableElement) return
    let rafId: number | null = null
    const requestSync = () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId)
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        syncTableQuickRailFromElement(resolveAnchorElement())
      })
    }
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(requestSync) : null
    resizeObserver?.observe(tableElement)
    const firstRow = tableElement.querySelector("thead tr, tbody tr, tr")
    if (firstRow instanceof HTMLElement) resizeObserver?.observe(firstRow)
    const mutationObserver = new MutationObserver(requestSync)
    mutationObserver.observe(tableElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["colspan", "rowspan", "style", "class"],
    })
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId)
      resizeObserver?.disconnect()
      mutationObserver.disconnect()
    }
  }, [isCoarsePointer, isTableQuickRailHovered, resolveTableQuickRailAnchorElement, selectionTick, syncTableQuickRailFromElement, tableAffordanceVisibility.visible])

  useEffect(() => {
    if (typeof window === "undefined" || !tableMenuState) return
    const scrollOptions: AddEventListenerOptions = { capture: true, passive: true }
    const resizeOptions: AddEventListenerOptions = { passive: true }
    const closeOnViewportChange = () => {
      setHoveredTableCellMenuLayout(null)
      setIsTableQuickRailHovered(false)
      setTableMenuState(null)
      hideTableQuickRailImmediately()
    }
    window.addEventListener("scroll", closeOnViewportChange, scrollOptions)
    window.addEventListener("resize", closeOnViewportChange, resizeOptions)
    return () => {
      window.removeEventListener("scroll", closeOnViewportChange, scrollOptions)
      window.removeEventListener("resize", closeOnViewportChange, resizeOptions)
    }
  }, [hideTableQuickRailImmediately, setHoveredTableCellMenuLayout, setIsTableQuickRailHovered, setTableMenuState, tableMenuState])

  useEffect(() => {
    if (typeof window === "undefined" || !tableMenuState) return
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof PointerEvent) {
        const target = event.target
        if (
          target instanceof Element &&
          (target.closest("[data-table-menu-root='true']") ||
            target.closest("[data-table-axis-rail='true']") ||
            target.closest("[data-table-corner-handle='true']") ||
            target.closest("[data-table-column-rail-track='true']") ||
            target.closest("[data-table-menu-trigger='true']"))
        ) {
          return
        }
      }
      if (event instanceof KeyboardEvent && event.key !== "Escape") return
      setTableMenuState(null)
    }
    window.addEventListener("pointerdown", close)
    window.addEventListener("keydown", close)
    return () => {
      window.removeEventListener("pointerdown", close)
      window.removeEventListener("keydown", close)
    }
  }, [setTableMenuState, tableMenuState])
}
