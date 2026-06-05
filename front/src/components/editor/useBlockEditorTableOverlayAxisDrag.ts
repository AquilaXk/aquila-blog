import type { Editor as TiptapEditor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { CellSelection, selectedRect, TableMap, tableEditingKey } from "@tiptap/pm/tables"
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { TableAffordanceGeometry } from "./tableAffordanceModel"
import {
  type DraggedTableAxisState,
  type PendingTableAxisDragState,
  type TableAxis,
  type TableAxisDragGhostPosition,
  type TableAxisReorderIndicatorState,
  createDraggedTableAxisState,
  createHiddenTableAxisReorderIndicatorState,
  createPendingTableAxisDragState,
  createTableAxisDragGhostPosition,
  hideTableAxisReorderIndicatorState,
  resolveSyncedTableAxisGeometryFromDom,
  resolveTableAxisIndexFromPointer,
  resolveTableAxisReorderIndicator,
} from "./tableAxisDragModel"
import type { TableMenuState } from "./tableFloatingUiModel"
import { findActiveRenderedTable } from "./tableRenderedDomModel"
import { dispatchEditorSelectionSafely } from "./tableSelectionDispatchModel"
import { buildReorderedSimpleTableNode } from "./tableStructureModel"
import { TABLE_DRAG_SELECTION_TEXT_ATTR, TABLE_DRAG_SELECTION_TEXT_SELECTOR, clearTableStructuralSelectionOwner, clearTableTextSelectionForStructuralSelection, markTableStructuralSelectionOwner } from "./tableTextSelectionModel"
import { focusElementWithoutScroll, resolveDocPosSafe, type TableOverlaySelectionRect } from "./useBlockEditorTableOverlayDomAdapter"

const getTableAxisMenuNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now())

type SelectTableAxisOptions = { clearNativeText?: boolean }

type UseBlockEditorTableOverlayAxisDragArgs = {
  cancelTableQuickRailHide: () => void
  clearStickyTopLevelBlockSelection: () => void
  editor: TiptapEditor | null
  editorRef: MutableRefObject<TiptapEditor | null>
  getCurrentSelectedTableRect: (activeEditor?: TiptapEditor | null) => TableOverlaySelectionRect | null
  isTableStructuralSelection: boolean
  selectionTick: number
  setSelectionTick: Dispatch<SetStateAction<number>>
  setTableAffordanceGeometry: Dispatch<SetStateAction<TableAffordanceGeometry>>
  setTableMenuState: Dispatch<SetStateAction<TableMenuState>>
  tableAffordanceGeometryRef: MutableRefObject<TableAffordanceGeometry>
  viewportRef: RefObject<HTMLDivElement>
}

export const useBlockEditorTableOverlayAxisDrag = ({
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
}: UseBlockEditorTableOverlayAxisDragArgs) => {
  const pendingTableAxisDragRef = useRef<PendingTableAxisDragState | null>(null)
  const pendingTableAxisDragCleanupRef = useRef<(() => void) | null>(null)
  const tableAxisMenuStabilizationTokenRef = useRef(0)
  const tableAxisMenuKeepAliveUntilRef = useRef(0)
  const tableAxisMenuSuppressUntilRef = useRef(0)
  const tableAxisMenuKeepAliveSelectionRef = useRef<{ axis: TableAxis; index: number; tablePos: number } | null>(null)
  const tableAxisDragSuppressClickRef = useRef(false)
  const [draggedTableAxisState, setDraggedTableAxisState] = useState<DraggedTableAxisState>(null)
  const [tableAxisDragGhostPosition, setTableAxisDragGhostPosition] = useState<TableAxisDragGhostPosition>(null)
  const [tableAxisReorderIndicatorState, setTableAxisReorderIndicatorState] =
    useState<TableAxisReorderIndicatorState>(createHiddenTableAxisReorderIndicatorState)
  const clearEditorMouseDownSelectionSyncDeferral = (activeEditor: TiptapEditor) => {
    const viewWithInput = activeEditor.view as typeof activeEditor.view & {
      input?: { mouseDown?: unknown }
    }
    if (viewWithInput.input) {
      viewWithInput.input.mouseDown = null
    }
  }
  const isActiveTableAxisSelection = useCallback((activeEditor: TiptapEditor) => {
    if (!(activeEditor.state.selection instanceof CellSelection)) return false
    try {
      const rect = selectedRect(activeEditor.state)
      return (
        (rect.left === 0 && rect.right === rect.map.width && rect.bottom === rect.top + 1) ||
        (rect.top === 0 && rect.bottom === rect.map.height && rect.right === rect.left + 1)
      )
    } catch {
      return false
    }
  }, [])
  const clearNativeTableTextSelectionOnly = useCallback((activeEditor?: TiptapEditor | null) => {
    const preservedCellSelection =
      activeEditor?.state.selection instanceof CellSelection ? activeEditor.state.selection : null
    const viewWithDomObserver = activeEditor?.view as
      | (TiptapEditor["view"] & {
          domObserver?: { setCurSelection?: () => void; start?: () => void; stop?: () => void }
        })
      | undefined
    const domObserver = viewWithDomObserver?.domObserver
    const clearDomSelection = () => {
      let selectionSink = document.getElementById("aq-table-axis-selection-sink")
      if (!selectionSink) {
        selectionSink = document.createElement("span")
        selectionSink.id = "aq-table-axis-selection-sink"
        selectionSink.setAttribute("aria-hidden", "true")
        selectionSink.style.cssText = "position:fixed;width:0;height:0;overflow:hidden;left:0;top:0;"
        document.body.append(selectionSink)
      }
      domObserver?.stop?.()
      try {
        const selection = window.getSelection()
        const range = document.createRange()
        range.selectNodeContents(selectionSink)
        range.collapse(true)
        selection?.removeAllRanges()
        selection?.addRange(range)
        domObserver?.setCurSelection?.()
      } finally { domObserver?.start?.() }
      document.querySelectorAll(TABLE_DRAG_SELECTION_TEXT_SELECTOR).forEach((element) => element.removeAttribute(TABLE_DRAG_SELECTION_TEXT_ATTR))
      document.documentElement.removeAttribute(TABLE_DRAG_SELECTION_TEXT_ATTR)
    }
    clearDomSelection()
    if (!activeEditor || !preservedCellSelection || typeof window === "undefined") return
    const restoreCellSelection = () => {
      if (!activeEditor.view.dom.isConnected) return
      if (!dispatchEditorSelectionSafely(activeEditor, () => preservedCellSelection)) return
      clearDomSelection()
      setSelectionTick((prev) => prev + 1)
    }
    window.requestAnimationFrame(restoreCellSelection); window.setTimeout(restoreCellSelection, 0); window.setTimeout(restoreCellSelection, 40)
  }, [setSelectionTick])
  const clearStructuralSelectionNativeText = useCallback(() => {
    const clearIfTableAxisSelectionIsNotActive = () => {
      const activeEditor = editorRef.current
      if (activeEditor && isActiveTableAxisSelection(activeEditor)) {
        clearNativeTableTextSelectionOnly(activeEditor)
        return
      }
      clearTableTextSelectionForStructuralSelection()
    }
    clearIfTableAxisSelectionIsNotActive()
    if (typeof window === "undefined") return
    window.requestAnimationFrame(() => {
      clearIfTableAxisSelectionIsNotActive()
      window.requestAnimationFrame(clearIfTableAxisSelectionIsNotActive)
    })
    window.setTimeout(clearIfTableAxisSelectionIsNotActive, 0)
    window.setTimeout(clearIfTableAxisSelectionIsNotActive, 80)
    window.setTimeout(clearIfTableAxisSelectionIsNotActive, 180)
  }, [clearNativeTableTextSelectionOnly, editorRef, isActiveTableAxisSelection])
  const suppressTableAxisMenuKeepAlive = useCallback((durationMs = 1_000) => { tableAxisMenuStabilizationTokenRef.current += 1; tableAxisMenuSuppressUntilRef.current = durationMs === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : getTableAxisMenuNow() + durationMs; tableAxisMenuKeepAliveUntilRef.current = 0; tableAxisMenuKeepAliveSelectionRef.current = null; clearTableStructuralSelectionOwner(); setTableMenuState(null) }, [setTableMenuState])
  useEffect(() => {
    if (typeof window === "undefined") return
    const cancelAxisMenuStabilization = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      suppressTableAxisMenuKeepAlive(Number.POSITIVE_INFINITY)
      const activeEditor = editorRef.current ?? editor; if (activeEditor && isActiveTableAxisSelection(activeEditor) && dispatchEditorSelectionSafely(activeEditor, (state) => TextSelection.near(state.selection.$to, -1))) setSelectionTick((prev) => prev + 1)
    }
    window.addEventListener("keydown", cancelAxisMenuStabilization)
    return () => window.removeEventListener("keydown", cancelAxisMenuStabilization)
  }, [editor, editorRef, isActiveTableAxisSelection, setSelectionTick, suppressTableAxisMenuKeepAlive])
  useEffect(() => {
    if (typeof window === "undefined") return
    const cancelAxisMenuKeepAlive = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null
      if (target?.closest("[data-table-axis-rail='true'], [data-table-affordance='row-handle'], [data-table-affordance='column-handle'], [data-table-menu-root='true']")) return
      suppressTableAxisMenuKeepAlive()
    }
    window.addEventListener("pointerdown", cancelAxisMenuKeepAlive, true)
    return () => window.removeEventListener("pointerdown", cancelAxisMenuKeepAlive, true)
  }, [suppressTableAxisMenuKeepAlive])
  const selectTableAxisAtIndex = useCallback(
    (activeEditor: TiptapEditor, tablePos: number, axis: "row" | "column", axisIndex: number, options: SelectTableAxisOptions = {}) => {
      const tableNode = activeEditor.state.doc.nodeAt(tablePos)
      if (!tableNode || tableNode.type.name !== "table") return false

      const map = TableMap.get(tableNode)
      const isColumn = axis === "column"
      const axisSize = isColumn ? map.width : map.height
      if (axisIndex < 0 || axisIndex >= axisSize) return false
      const anchorCellPos = tablePos + 1 + (isColumn ? map.positionAt(0, axisIndex, tableNode) : map.positionAt(axisIndex, 0, tableNode))
      const headCellPos = tablePos + 1 + (isColumn ? map.positionAt(map.height - 1, axisIndex, tableNode) : map.positionAt(axisIndex, map.width - 1, tableNode))
      const anchorResolved = resolveDocPosSafe(activeEditor, anchorCellPos)
      const headResolved = resolveDocPosSafe(activeEditor, headCellPos)
      if (!anchorResolved || !headResolved) return false

      clearStickyTopLevelBlockSelection()
      clearTableTextSelectionForStructuralSelection()
      focusElementWithoutScroll(activeEditor.view.dom)
      clearEditorMouseDownSelectionSyncDeferral(activeEditor)
      activeEditor.view.dispatch(
        activeEditor.state.tr
          .setSelection(isColumn ? CellSelection.colSelection(anchorResolved, headResolved) : CellSelection.rowSelection(anchorResolved, headResolved))
          .setMeta(tableEditingKey, anchorResolved.pos)
      )
      setTableAffordanceGeometry((prev) => isColumn ? { ...prev, columnIndex: axisIndex } : { ...prev, rowIndex: axisIndex })
      setSelectionTick((prev) => prev + 1)
      if (options.clearNativeText !== false) clearStructuralSelectionNativeText()
      return true
    },
    [clearStickyTopLevelBlockSelection, clearStructuralSelectionNativeText, setSelectionTick, setTableAffordanceGeometry]
  )

  const clearPendingTableAxisDrag = useCallback(() => {
    pendingTableAxisDragRef.current = null
    if (pendingTableAxisDragCleanupRef.current) {
      pendingTableAxisDragCleanupRef.current()
      pendingTableAxisDragCleanupRef.current = null
    }
  }, [])

  const isCurrentTableColumnSelection = useCallback(
    (columnIndex: number) => {
      const currentEditor = editorRef.current
      if (!currentEditor || columnIndex < 0) return false
      const { selection } = currentEditor.state
      if (!(selection instanceof CellSelection)) return false
      let rect: ReturnType<typeof selectedRect> | null = null
      try {
        rect = selectedRect(currentEditor.state)
      } catch {
        rect = null
      }
      if (!rect) return false
      return rect.left === columnIndex && rect.right === columnIndex + 1 && rect.top === 0 && rect.bottom === rect.map.height
    },
    [editorRef]
  )

  const isCurrentTableRowSelection = useCallback((rowIndex: number) => {
    const currentEditor = editorRef.current
    if (!currentEditor || rowIndex < 0) return false
    const { selection } = currentEditor.state
    if (!(selection instanceof CellSelection)) return false
    let rect: ReturnType<typeof selectedRect> | null = null
    try {
      rect = selectedRect(currentEditor.state)
    } catch {
      rect = null
    }
    if (!rect) return false
    return rect.top === rowIndex && rect.bottom === rowIndex + 1 && rect.left === 0 && rect.right === rect.map.width
  }, [editorRef])

  const selectTableColumnByIndex = useCallback(
    (columnIndex: number, options: SelectTableAxisOptions = {}) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return false
      const rect = getCurrentSelectedTableRect(currentEditor)
      if (!rect || columnIndex < 0 || columnIndex >= rect.map.width) return false

      const tablePos = rect.tableStart - 1
      return selectTableAxisAtIndex(currentEditor, tablePos, "column", columnIndex, options) ? { axis: "column" as const, index: columnIndex, tablePos } : false
    },
    [editorRef, getCurrentSelectedTableRect, selectTableAxisAtIndex]
  )

  const selectTableRowByIndex = useCallback(
    (rowIndex: number, options: SelectTableAxisOptions = {}) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return false
      const rect = getCurrentSelectedTableRect(currentEditor)
      if (!rect || rowIndex < 0 || rowIndex >= rect.map.height) return false

      const tablePos = rect.tableStart - 1
      return selectTableAxisAtIndex(currentEditor, tablePos, "row", rowIndex, options) ? { axis: "row" as const, index: rowIndex, tablePos } : false
    },
    [editorRef, getCurrentSelectedTableRect, selectTableAxisAtIndex]
  )

  const reorderTableAxisAtPosition = useCallback(
    (tablePos: number, axis: "row" | "column", sourceIndex: number, insertionIndex: number) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return false

      const tableNode = currentEditor.state.doc.nodeAt(tablePos)
      if (!tableNode || tableNode.type.name !== "table") return false

      const reorderedTable = buildReorderedSimpleTableNode(tableNode, axis, sourceIndex, insertionIndex)
      if (!reorderedTable) return false

      currentEditor.view.dispatch(
        currentEditor.state.tr.replaceWith(tablePos, tablePos + tableNode.nodeSize, reorderedTable.node)
      )

      const selected = selectTableAxisAtIndex(currentEditor, tablePos, axis, reorderedTable.nextIndex)
      if (selected) {
        tableAxisMenuKeepAliveSelectionRef.current = { axis, index: reorderedTable.nextIndex, tablePos }
      }
      setTableAffordanceGeometry((prev) =>
        axis === "row"
          ? { ...prev, rowIndex: reorderedTable.nextIndex }
          : { ...prev, columnIndex: reorderedTable.nextIndex }
      )
      setSelectionTick((prev) => prev + 1)
      return selected
    },
    [editorRef, selectTableAxisAtIndex, setSelectionTick, setTableAffordanceGeometry]
  )

  const beginTableAxisDragFromPending = useCallback(
    (pending: PendingTableAxisDragState, clientX: number, clientY: number) => {
      const nextDragState = createDraggedTableAxisState(pending)
      markTableStructuralSelectionOwner(1_200)
      tableAxisDragSuppressClickRef.current = true
      const currentEditor = editorRef.current
      if (currentEditor) {
        selectTableAxisAtIndex(currentEditor, pending.tablePos, pending.axis, pending.sourceIndex)
      }
      setTableMenuState(null)
      cancelTableQuickRailHide()
      setDraggedTableAxisState(nextDragState)
      const renderedTable = findActiveRenderedTable(viewportRef.current, tableAffordanceGeometryRef.current)
      setTableAxisReorderIndicatorState(
        resolveTableAxisReorderIndicator(renderedTable, pending.axis, pending.sourceIndex, clientX, clientY) ??
          createHiddenTableAxisReorderIndicatorState(pending.axis, pending.sourceIndex)
      )
      setTableAxisDragGhostPosition(createTableAxisDragGhostPosition(pending, clientY))
      return nextDragState
    },
    [cancelTableQuickRailHide, editorRef, selectTableAxisAtIndex, setTableMenuState, tableAffordanceGeometryRef, viewportRef]
  )

  const startPendingTableAxisDrag = useCallback(
    (
      axis: TableAxis,
      sourceIndex: number,
      pointerId: number,
      clientX: number,
      clientY: number,
      completeClickWithoutDrag?: () => boolean
    ) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return

      const tableRect = getCurrentSelectedTableRect(currentEditor)
      const tablePos = tableRect ? Math.max(0, tableRect.tableStart - 1) : null
      if (!tableRect || tablePos === null) return
      const renderedTable = findActiveRenderedTable(viewportRef.current, tableAffordanceGeometryRef.current)
      const resolvedSourceIndex = resolveTableAxisIndexFromPointer(renderedTable, axis, clientX, clientY) ?? sourceIndex

      const withinBounds =
        axis === "row"
          ? resolvedSourceIndex >= 0 && resolvedSourceIndex < tableRect.map.height
          : resolvedSourceIndex >= 0 && resolvedSourceIndex < tableRect.map.width
      if (!withinBounds) return

      clearStructuralSelectionNativeText()
      markTableStructuralSelectionOwner(1_200)
      clearPendingTableAxisDrag()
      tableAxisDragSuppressClickRef.current = false

      pendingTableAxisDragRef.current = createPendingTableAxisDragState(
        axis,
        resolvedSourceIndex,
        pointerId,
        tablePos,
        clientX,
        clientY,
        tableAffordanceGeometryRef.current
      )
      tableAxisMenuStabilizationTokenRef.current += 1
      tableAxisMenuSuppressUntilRef.current = 0
      tableAxisMenuKeepAliveSelectionRef.current = { axis, index: resolvedSourceIndex, tablePos }
      selectTableAxisAtIndex(currentEditor, tablePos, axis, resolvedSourceIndex)
      clearNativeTableTextSelectionOnly(currentEditor)

      const DRAG_THRESHOLD_PX = 5
      let activeDragState: Exclude<DraggedTableAxisState, null> | null = null

      const handlePendingPointerMove = (moveEvent: PointerEvent) => {
        if (activeDragState) {
          if (moveEvent.pointerId !== activeDragState.pointerId) return
          const activeRenderedTable = findActiveRenderedTable(viewportRef.current, tableAffordanceGeometryRef.current)
          const nextIndicator = resolveTableAxisReorderIndicator(
            activeRenderedTable,
            activeDragState.axis,
            activeDragState.sourceIndex,
            moveEvent.clientX,
            moveEvent.clientY
          )
          setTableAxisReorderIndicatorState(
            nextIndicator ??
              createHiddenTableAxisReorderIndicatorState(activeDragState.axis, activeDragState.sourceIndex)
          )
          if (activeDragState.axis === "row") {
            setTableAxisDragGhostPosition(createTableAxisDragGhostPosition(activeDragState, moveEvent.clientY))
          }
          return
        }

        const pending = pendingTableAxisDragRef.current
        if (!pending || moveEvent.pointerId !== pending.pointerId) return

        const distance = Math.hypot(moveEvent.clientX - pending.startX, moveEvent.clientY - pending.startY)
        if (distance < DRAG_THRESHOLD_PX) return

        pendingTableAxisDragRef.current = null
        activeDragState = beginTableAxisDragFromPending(pending, moveEvent.clientX, moveEvent.clientY)
      }

      const handlePendingPointerDone = (doneEvent: PointerEvent) => {
        if (activeDragState) {
          if (doneEvent.pointerId !== activeDragState.pointerId) return
          const activeRenderedTable = findActiveRenderedTable(viewportRef.current, tableAffordanceGeometryRef.current)
          const nextIndicator = resolveTableAxisReorderIndicator(
            activeRenderedTable,
            activeDragState.axis,
            activeDragState.sourceIndex,
            doneEvent.clientX,
            doneEvent.clientY
          )
          if (nextIndicator) {
            reorderTableAxisAtPosition(
              activeDragState.tablePos,
              activeDragState.axis,
              activeDragState.sourceIndex,
              nextIndicator.insertionIndex
            )
          }
          activeDragState = null
          setDraggedTableAxisState(null)
          setTableAxisDragGhostPosition(null)
          setTableAxisReorderIndicatorState(hideTableAxisReorderIndicatorState)
          clearPendingTableAxisDrag()
          return
        }

        const pending = pendingTableAxisDragRef.current
        if (!pending || doneEvent.pointerId !== pending.pointerId) return
        if (doneEvent.type !== "pointerup") {
          clearPendingTableAxisDrag()
          return
        }
        const completedClick = completeClickWithoutDrag?.() ?? false
        if (completedClick) {
          markTableStructuralSelectionOwner(1_200)
          const stabilizationToken = tableAxisMenuStabilizationTokenRef.current
          tableAxisMenuKeepAliveUntilRef.current = getTableAxisMenuNow() + 3_000
          const stabilizeCompletedAxisSelection = () => {
            if (tableAxisMenuStabilizationTokenRef.current !== stabilizationToken) return
            const activeEditor = editorRef.current
            if (!activeEditor) return
            const anchor = pending.axis === "row" ? tableAffordanceGeometryRef.current.rowHandleAnchor : tableAffordanceGeometryRef.current.columnHandleAnchor
            setTableMenuState({ kind: pending.axis, left: Math.round(anchor.left), top: Math.round(anchor.top + 28), axisTarget: { axis: pending.axis, index: pending.sourceIndex, tablePos: pending.tablePos } })
            setSelectionTick((prev) => prev + 1)
          }
          stabilizeCompletedAxisSelection()
          window.requestAnimationFrame(stabilizeCompletedAxisSelection)
          window.setTimeout(stabilizeCompletedAxisSelection, 0)
          window.setTimeout(stabilizeCompletedAxisSelection, 80)
          window.setTimeout(stabilizeCompletedAxisSelection, 180)
          tableAxisDragSuppressClickRef.current = true
          window.setTimeout(() => {
            tableAxisDragSuppressClickRef.current = false
          }, 0)
        }
        clearPendingTableAxisDrag()
      }

      window.addEventListener("pointermove", handlePendingPointerMove)
      window.addEventListener("pointerup", handlePendingPointerDone)
      window.addEventListener("pointercancel", handlePendingPointerDone)

      pendingTableAxisDragCleanupRef.current = () => {
        window.removeEventListener("pointermove", handlePendingPointerMove)
        window.removeEventListener("pointerup", handlePendingPointerDone)
        window.removeEventListener("pointercancel", handlePendingPointerDone)
      }
    },
    [
      beginTableAxisDragFromPending,
      clearNativeTableTextSelectionOnly,
      clearPendingTableAxisDrag,
      clearStructuralSelectionNativeText,
      editorRef,
      getCurrentSelectedTableRect,
      reorderTableAxisAtPosition,
      selectTableAxisAtIndex,
      setSelectionTick,
      setTableMenuState,
      tableAffordanceGeometryRef,
      viewportRef,
    ]
  )

  const currentTableAxisSelection = useMemo(() => {
    if (!editor || (!isTableStructuralSelection && !(editor.state.selection instanceof CellSelection))) return null
    void selectionTick
    let rect: ReturnType<typeof selectedRect> | null = null
    try {
      rect = selectedRect(editor.state)
    } catch {
      rect = null
    }
    if (!rect) return null
    if (rect.left === 0 && rect.right === rect.map.width && rect.bottom === rect.top + 1) {
      return { axis: "row" as const, index: rect.top }
    }
    if (rect.top === 0 && rect.bottom === rect.map.height && rect.right === rect.left + 1) {
      return { axis: "column" as const, index: rect.left }
    }
    return null
  }, [editor, isTableStructuralSelection, selectionTick])

  useEffect(() => {
    if (typeof window === "undefined") return
    const keepAliveAxisSelection = currentTableAxisSelection ?? tableAxisMenuKeepAliveSelectionRef.current
    if (!keepAliveAxisSelection) return
    const stabilizationToken = tableAxisMenuStabilizationTokenRef.current; let timeoutId: number | null = null
    const stabilizeAxisMenu = () => {
      if (tableAxisMenuStabilizationTokenRef.current !== stabilizationToken) return
      const now = getTableAxisMenuNow(); if (now < tableAxisMenuSuppressUntilRef.current || (!currentTableAxisSelection && now > tableAxisMenuKeepAliveUntilRef.current)) return
      const activeEditor = editorRef.current
      const keepAliveSelection = tableAxisMenuKeepAliveSelectionRef.current
      if (!activeEditor || (!isActiveTableAxisSelection(activeEditor) && !keepAliveSelection)) return
      if (!isActiveTableAxisSelection(activeEditor) && keepAliveSelection) selectTableAxisAtIndex(activeEditor, keepAliveSelection.tablePos, keepAliveSelection.axis, keepAliveSelection.index)
      const currentAxisTarget = (() => {
        if (!currentTableAxisSelection) return keepAliveSelection
        try {
          const rect = selectedRect(activeEditor.state)
          return { ...currentTableAxisSelection, tablePos: rect.tableStart - 1 }
        } catch {
          return keepAliveSelection
        }
      })()
      if (currentAxisTarget) tableAxisMenuKeepAliveSelectionRef.current = currentAxisTarget
      let tableElement: Element | null = null
      try {
        const anchorDom = activeEditor.view.domAtPos(activeEditor.state.selection.from).node
        const anchorElement = anchorDom instanceof Element ? anchorDom : anchorDom.parentElement
        const selectedCellTable = viewportRef.current?.querySelector(".selectedCell")?.closest("table") ?? null
        tableElement = anchorElement?.closest("table") ?? selectedCellTable ?? findActiveRenderedTable(viewportRef.current, tableAffordanceGeometryRef.current)
      } catch { tableElement = viewportRef.current?.querySelector(".selectedCell")?.closest("table") ?? findActiveRenderedTable(viewportRef.current, tableAffordanceGeometryRef.current) }
      const tableRect = tableElement?.getBoundingClientRect()
      if (!tableElement || !tableRect) return
      const nextGeometry = resolveSyncedTableAxisGeometryFromDom(tableAffordanceGeometryRef.current, tableElement, keepAliveAxisSelection)
      if (!nextGeometry) return
      tableAffordanceGeometryRef.current = nextGeometry
      setTableAffordanceGeometry(nextGeometry)
      const anchor = keepAliveAxisSelection.axis === "row" ? nextGeometry.rowHandleAnchor : nextGeometry.columnHandleAnchor
      const nextState = { kind: keepAliveAxisSelection.axis, left: Math.round(anchor.left), top: Math.round(anchor.top + 28), axisTarget: currentAxisTarget ?? undefined } as const
      setTableMenuState((prev) =>
        prev?.kind === nextState.kind && prev.left === nextState.left && prev.top === nextState.top && prev.axisTarget?.axis === nextState.axisTarget?.axis && prev.axisTarget?.index === nextState.axisTarget?.index && prev.axisTarget?.tablePos === nextState.axisTarget?.tablePos
          ? prev
          : nextState
      )
      if (timeoutId !== null) window.clearTimeout(timeoutId); timeoutId = window.setTimeout(() => { timeoutId = null; stabilizeAxisMenu() }, 80)
    }
    const syncViewport = () => window.requestAnimationFrame(stabilizeAxisMenu)
    const suppressViewport = () => suppressTableAxisMenuKeepAlive()
    stabilizeAxisMenu()
    window.addEventListener("scroll", syncViewport, { capture: true, passive: true }); window.addEventListener("wheel", suppressViewport, { capture: true, passive: true })
    return () => { if (timeoutId !== null) window.clearTimeout(timeoutId); window.removeEventListener("scroll", syncViewport, true); window.removeEventListener("wheel", suppressViewport, true) }
  }, [currentTableAxisSelection, editorRef, isActiveTableAxisSelection, selectTableAxisAtIndex, setTableAffordanceGeometry, setTableMenuState, suppressTableAxisMenuKeepAlive, tableAffordanceGeometryRef, viewportRef])

  useEffect(() => {
    return () => {
      clearPendingTableAxisDrag()
    }
  }, [clearPendingTableAxisDrag])

  useEffect(() => {
    if (typeof document === "undefined" || !draggedTableAxisState) return
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = draggedTableAxisState.axis === "column" ? "col-resize" : "grabbing"
    document.body.style.userSelect = "none"
    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
    }
  }, [draggedTableAxisState])

  return {
    beginTableAxisDragFromPending,
    clearPendingTableAxisDrag,
    currentTableAxisSelection,
    draggedTableAxisState,
    isCurrentTableColumnSelection,
    isCurrentTableRowSelection,
    reorderTableAxisAtPosition,
    selectTableAxisAtIndex,
    selectTableColumnByIndex,
    selectTableRowByIndex,
    startPendingTableAxisDrag,
    suppressTableAxisMenuKeepAlive,
    tableAxisDragGhostPosition,
    tableAxisDragSuppressClickRef,
    tableAxisReorderIndicatorState,
  }
}
