import type { Editor as TiptapEditor } from "@tiptap/core"
import { type Node as ProseMirrorNode } from "@tiptap/pm/model"
import { TextSelection } from "@tiptap/pm/state"
import { CellSelection, selectedRect, TableMap } from "@tiptap/pm/tables"
import type { MutableRefObject, RefObject } from "react"
import { useCallback } from "react"
import { getFirstEditableTextPositionInNode } from "./blockSelectionModel"
import { TABLE_STALE_AXIS_HOTZONE_TOP_MARGIN_PX, type TableAffordanceGeometry } from "./tableAffordanceModel"
import { findActiveRenderedTable, resolveTableScopedSelectedCell } from "./tableRenderedDomModel"
import { isTableSelectionActive } from "./tableStructureModel"

const resolveElementsFromPoint = (clientX: number, clientY: number) => {
  if (typeof document.elementsFromPoint === "function") {
    return document.elementsFromPoint(clientX, clientY)
  }
  const pointElement = document.elementFromPoint(clientX, clientY)
  return pointElement ? [pointElement] : []
}

const TABLE_AXIS_HOTZONE_CELL_FALLBACK_MARGIN_PX = 32

type UseBlockEditorTableOverlayDomAdapterArgs = {
  activeTableElementRef: MutableRefObject<HTMLTableElement | null>
  editorRef: MutableRefObject<TiptapEditor | null>
  hoveredTableElementRef: MutableRefObject<HTMLTableElement | null>
  tableAffordanceGeometryRef: MutableRefObject<TableAffordanceGeometry>
  tableHoverAnchorLockUntilRef: MutableRefObject<number>
  viewportRef: RefObject<HTMLDivElement>
}

type SelectedTableRect = ReturnType<typeof selectedRect>
export type TableOverlaySelectionRect = {
  bottom?: SelectedTableRect["bottom"]
  left?: SelectedTableRect["left"]
  map: SelectedTableRect["map"]
  right?: SelectedTableRect["right"]
  table: SelectedTableRect["table"]
  tableStart: SelectedTableRect["tableStart"]
  top?: SelectedTableRect["top"]
}

export const focusElementWithoutScroll = (element: HTMLElement | null) => {
  if (!element) return
  if (typeof window === "undefined") {
    element.focus()
    return
  }

  const previousScrollX = window.scrollX
  const previousScrollY = window.scrollY
  try {
    element.focus({ preventScroll: true })
  } catch {
    element.focus()
  }
  if (window.scrollX !== previousScrollX || window.scrollY !== previousScrollY) {
    window.scrollTo(previousScrollX, previousScrollY)
  }
}

export const resolveDocPosSafe = (editor: TiptapEditor, pos: number) => {
  if (!Number.isFinite(pos)) return null
  const normalizedPos = Math.round(pos)
  const maxPos = editor.state.doc.content.size
  if (normalizedPos < 0 || normalizedPos > maxPos) return null
  try {
    return editor.state.doc.resolve(normalizedPos)
  } catch {
    return null
  }
}

export const useBlockEditorTableOverlayDomAdapter = ({
  activeTableElementRef,
  editorRef,
  hoveredTableElementRef,
  tableAffordanceGeometryRef,
  tableHoverAnchorLockUntilRef,
  viewportRef,
}: UseBlockEditorTableOverlayDomAdapterArgs) => {
  const getTableCellFromTarget = useCallback((target: EventTarget | null) => {
    const normalizedTarget =
      target instanceof Element ? target : target instanceof Node ? target.parentElement : null
    if (!(normalizedTarget instanceof Element)) return null
    const cell = normalizedTarget.closest("td, th")
    if (!(cell instanceof HTMLTableCellElement)) return null
    return cell
  }, [])

  const getTableCellFromClientPoint = useCallback(
    (clientX: number, clientY: number, target: EventTarget | null) => {
      const targetCell = getTableCellFromTarget(target)
      if (targetCell) return targetCell
      if (typeof document === "undefined") return null

      const pointElements = resolveElementsFromPoint(clientX, clientY)
      const pointCell = pointElements
        .map((element) => element.closest("td, th"))
        .find((cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement)
      if (pointCell) return pointCell

      const normalizedTarget =
        target instanceof Element ? target : target instanceof Node ? target.parentElement : null
      const tableSurfaceElement =
        normalizedTarget?.closest(".aq-table-shell, .tableWrapper, table") ??
        pointElements
          .map((element) => element.closest(".aq-table-shell, .tableWrapper, table"))
          .find((surface): surface is Element => surface instanceof Element) ??
        null
      const tableElement =
        tableSurfaceElement instanceof HTMLTableElement
          ? tableSurfaceElement
          : (tableSurfaceElement?.querySelector("table") as HTMLTableElement | null) ??
            (() => {
              const activeTable =
                activeTableElementRef.current ??
                findActiveRenderedTable(viewportRef.current, tableAffordanceGeometryRef.current)
              if (!activeTable?.isConnected) return null
              const rect = activeTable.getBoundingClientRect()
              const hitTestMargin = 32
              const isInsideActiveTableSurface =
                clientX >= rect.left &&
                clientX <= rect.right &&
                clientY >= rect.top - TABLE_STALE_AXIS_HOTZONE_TOP_MARGIN_PX &&
                clientY <= rect.bottom + hitTestMargin
              return isInsideActiveTableSurface ? activeTable : null
            })()
      if (!tableElement) return null

      const cells = Array.from(tableElement.querySelectorAll("th, td")).filter(
        (cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement
      )
      const strictCell = cells.find((cell) => {
        const rect = cell.getBoundingClientRect()
        return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
      })
      if (strictCell) return strictCell

      const tableRect = tableElement.getBoundingClientRect()
      const isNearTableSurface =
        clientX >= tableRect.left - TABLE_AXIS_HOTZONE_CELL_FALLBACK_MARGIN_PX &&
        clientX <= tableRect.right + TABLE_AXIS_HOTZONE_CELL_FALLBACK_MARGIN_PX &&
        clientY >= tableRect.top - TABLE_STALE_AXIS_HOTZONE_TOP_MARGIN_PX &&
        clientY <= tableRect.bottom + TABLE_AXIS_HOTZONE_CELL_FALLBACK_MARGIN_PX
      if (!isNearTableSurface) return null

      const rows = Array.from(tableElement.querySelectorAll("tr")).filter(
        (row): row is HTMLTableRowElement => row instanceof HTMLTableRowElement && row.cells.length > 0
      )
      const firstRowCells = Array.from(rows[0]?.cells ?? []).filter(
        (cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement
      )
      const topAxisCell =
        clientY <= tableRect.top + TABLE_AXIS_HOTZONE_CELL_FALLBACK_MARGIN_PX
          ? firstRowCells.find((cell) => {
              const rect = cell.getBoundingClientRect()
              return clientX >= rect.left && clientX <= rect.right
            }) ?? firstRowCells[0] ?? null
          : null
      if (topAxisCell) return topAxisCell

      const leftAxisRow =
        clientX <= tableRect.left + TABLE_AXIS_HOTZONE_CELL_FALLBACK_MARGIN_PX
          ? rows.find((row) => {
              const rect = row.getBoundingClientRect()
              return clientY >= rect.top && clientY <= rect.bottom
            }) ?? rows[0] ?? null
          : null
      return (
        Array.from(leftAxisRow?.cells ?? []).find(
          (cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement
        ) ?? null
      )
    },
    [activeTableElementRef, getTableCellFromTarget, tableAffordanceGeometryRef, viewportRef]
  )

  const getActiveTableRectFromDom = useCallback((activeEditor?: TiptapEditor | null) => {
    if (!activeEditor) return null

    const tableElement = findActiveRenderedTable(
      viewportRef.current,
      tableAffordanceGeometryRef.current,
      activeTableElementRef.current
    )
    const resolveRectFromTableElement = (domSource: HTMLElement | null) => {
      if (!domSource) return null

      let domPosition = 0
      try {
        domPosition = activeEditor.view.posAtDOM(domSource, 0)
      } catch {
        return null
      }

      const resolvedPosition = resolveDocPosSafe(activeEditor, domPosition)
      if (!resolvedPosition) return null

      for (let depth = resolvedPosition.depth; depth > 0; depth -= 1) {
        if (resolvedPosition.node(depth).type.name !== "table") continue
        const table = resolvedPosition.node(depth)
        const tableStart = resolvedPosition.start(depth)
        return {
          map: TableMap.get(table),
          table,
          tableStart,
        }
      }

      return null
    }

    const firstCell = tableElement?.querySelector<HTMLElement>(
      "thead tr:first-of-type > th, thead tr:first-of-type > td, tbody tr:first-of-type > th, tbody tr:first-of-type > td, tr:first-of-type > th, tr:first-of-type > td"
    )
    if (!tableElement) return null

    const fallbackFirstCell = tableElement.querySelector<HTMLElement>("th, td")
    const firstRowCell = firstCell ?? fallbackFirstCell
    if (!firstRowCell) return null

    const tableRect = resolveRectFromTableElement(tableElement)
    if (tableRect) return tableRect

    let domPosition = 0
    try {
      domPosition = activeEditor.view.posAtDOM(firstRowCell, 0)
    } catch {
      return null
    }

    const resolvedPosition = resolveDocPosSafe(activeEditor, domPosition)
    if (!resolvedPosition) return null

    for (let depth = resolvedPosition.depth; depth > 0; depth -= 1) {
      if (resolvedPosition.node(depth).type.name !== "table") continue
      const table = resolvedPosition.node(depth)
      const tableStart = resolvedPosition.start(depth)
      return {
        map: TableMap.get(table),
        table,
        tableStart,
      }
    }

    return null
  }, [activeTableElementRef, tableAffordanceGeometryRef, viewportRef])

  const getCurrentSelectedTableRect = useCallback((activeEditor?: TiptapEditor | null) => {
    if (!activeEditor) return null
    if (isTableSelectionActive(activeEditor)) {
      try {
        return selectedRect(activeEditor.state)
      } catch {
        return getActiveTableRectFromDom(activeEditor)
      }
    }

    return getActiveTableRectFromDom(activeEditor)
  }, [getActiveTableRectFromDom])

  const resolveTableNodePosition = useCallback((activeEditor: TiptapEditor, tableNode: ProseMirrorNode) => {
    let tablePos: number | null = null
    activeEditor.state.doc.descendants((node: ProseMirrorNode, pos: number) => {
      if (node === tableNode) {
        tablePos = pos
        return false
      }
      return true
    })
    return tablePos
  }, [])

  const focusRenderedTableCell = useCallback((cell: HTMLTableCellElement) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return false

    let domPosition = 0
    try {
      domPosition = currentEditor.view.posAtDOM(cell, 0)
    } catch {
      return false
    }

    const resolvedPosition = resolveDocPosSafe(currentEditor, domPosition)
    if (!resolvedPosition) return false

    for (let depth = resolvedPosition.depth; depth > 0; depth -= 1) {
      const node = resolvedPosition.node(depth)
      if (node.type.name !== "tableCell" && node.type.name !== "tableHeader") continue

      const cellPosition = resolvedPosition.before(depth)
      const cellNode = currentEditor.state.doc.nodeAt(cellPosition)
      if (!cellNode) return false

      const selectionPos =
        getFirstEditableTextPositionInNode(cellNode, cellPosition) ?? Math.max(1, cellPosition + 1)
      currentEditor.view.dispatch(
        currentEditor.state.tr.setSelection(TextSelection.create(currentEditor.state.doc, selectionPos))
      )
      focusElementWithoutScroll(currentEditor.view.dom)
      return true
    }

    return false
  }, [editorRef])

  const resolveTableQuickRailAnchorElement = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return null

    const now =
      typeof window !== "undefined" && typeof window.performance !== "undefined"
        ? window.performance.now()
        : Date.now()
    const hoveredTable =
      hoveredTableElementRef.current?.isConnected &&
      viewport.contains(hoveredTableElementRef.current) &&
      now <= tableHoverAnchorLockUntilRef.current
        ? hoveredTableElementRef.current
        : null
    const renderedTable =
      hoveredTable ??
      findActiveRenderedTable(
        viewport,
        tableAffordanceGeometryRef.current,
        activeTableElementRef.current
      )
    const selectedCell = resolveTableScopedSelectedCell(renderedTable)
    if (selectedCell) return selectedCell

    if (!renderedTable) return null

    const rows = Array.from(renderedTable.querySelectorAll("tr")).filter(
      (node): node is HTMLTableRowElement => node instanceof HTMLTableRowElement
    )
    const row = rows[tableAffordanceGeometryRef.current.rowIndex] ?? null
    if (!row) return renderedTable.querySelector("th, td") as HTMLElement | null

    const cells = Array.from(row.children).filter((node): node is HTMLElement => node instanceof HTMLElement)
    return (
      cells[tableAffordanceGeometryRef.current.columnIndex] ??
      (row.querySelector("th, td") as HTMLElement | null) ??
      (renderedTable.querySelector("th, td") as HTMLElement | null)
    )
  }, [activeTableElementRef, hoveredTableElementRef, tableAffordanceGeometryRef, tableHoverAnchorLockUntilRef, viewportRef])

  return {
    focusRenderedTableCell,
    getActiveTableRectFromDom,
    getCurrentSelectedTableRect,
    getTableCellFromClientPoint,
    resolveTableNodePosition,
    resolveTableQuickRailAnchorElement,
  }
}
