import type { Editor as TiptapEditor } from "@tiptap/core"
import { NodeSelection } from "@tiptap/pm/state"
import { CellSelection, selectedRect } from "@tiptap/pm/tables"
import type { Dispatch, SetStateAction } from "react"
import { useCallback, useEffect, useMemo } from "react"
import { getTopLevelBlockIndexFromSelection, getTopLevelBlockPosition } from "./blockSelectionModel"
import { resolveTableMenuState, type TableMenuKind, type TableMenuState } from "./tableFloatingUiModel"
import { clearTableTextSelectionForStructuralSelection } from "./tableTextSelectionModel"
import { getTableOverflowMode } from "./tableWidthModel"
import { focusElementWithoutScroll, resolveDocPosSafe, type TableOverlaySelectionRect } from "./useBlockEditorTableOverlayDomAdapter"

type UseBlockEditorTableOverlayMenuArgs = {
  cancelTableQuickRailHide: () => void
  clearStickyTopLevelBlockSelection: () => void
  editor: TiptapEditor | null
  getCurrentSelectedTableRect: (activeEditor?: TiptapEditor | null) => TableOverlaySelectionRect | null
  isTableStructuralSelection: boolean
  selectionTick: number
  setSelectionTick: Dispatch<SetStateAction<number>>
  setTableMenuState: Dispatch<SetStateAction<TableMenuState>>
  stabilizeTableSelectionSurface: (nextEditor?: TiptapEditor | null) => void
  suppressTableAxisMenuKeepAlive: (durationMs?: number) => void
  tableMenuState: TableMenuState
}

export const useBlockEditorTableOverlayMenu = ({
  cancelTableQuickRailHide,
  clearStickyTopLevelBlockSelection,
  editor,
  getCurrentSelectedTableRect,
  isTableStructuralSelection,
  selectionTick,
  setSelectionTick,
  setTableMenuState,
  stabilizeTableSelectionSurface,
  suppressTableAxisMenuKeepAlive,
  tableMenuState,
}: UseBlockEditorTableOverlayMenuArgs) => {
  const updateActiveTableCellAttrs = useCallback(
    (attrs: Record<string, unknown>) => {
      if (!editor) return
      const entries = Object.entries(attrs)
      if (entries.length === 0) return

      const cellPositions = new Set<number>()
      const { selection } = editor.state

      if (selection instanceof CellSelection) {
        selection.forEachCell((_node, pos) => {
          cellPositions.add(pos)
        })
      } else {
        const collectFromResolvedPos = (resolvedPos: typeof selection.$from) => {
          for (let depth = resolvedPos.depth; depth >= 0; depth -= 1) {
            const nodeTypeName = resolvedPos.node(depth).type.name
            if (nodeTypeName !== "tableCell" && nodeTypeName !== "tableHeader") continue
            cellPositions.add(resolvedPos.before(depth))
            return
          }
        }

        collectFromResolvedPos(selection.$from)
        collectFromResolvedPos(selection.$to)
      }

      if (cellPositions.size > 0) {
        let transaction = editor.state.tr
        let changed = false

        cellPositions.forEach((cellPos) => {
          const cellNode = transaction.doc.nodeAt(cellPos)
          if (!cellNode) return

          const nextAttrs = { ...(cellNode.attrs || {}) }
          let cellChanged = false
          entries.forEach(([name, value]) => {
            if (nextAttrs[name] === value) return
            nextAttrs[name] = value
            cellChanged = true
          })

          if (!cellChanged) return
          transaction = transaction.setNodeMarkup(cellPos, undefined, nextAttrs, cellNode.marks)
          changed = true
        })

        if (changed) {
          editor.view.dispatch(transaction)
          setSelectionTick((prev) => prev + 1)
        }
        return
      }

      const chain = editor.chain().focus()
      const cellNodeType = editor.isActive("tableHeader") ? "tableHeader" : "tableCell"
      chain.updateAttributes(cellNodeType, attrs).run()
    },
    [editor, setSelectionTick]
  )

  const updateActiveTableOverflowMode = useCallback(
    (activeEditor: TiptapEditor, overflowMode: "normal" | "wide") => {
      const tableRect = getCurrentSelectedTableRect(activeEditor)
      const tablePos = tableRect ? Math.max(0, tableRect.tableStart - 1) : null
      if (!tableRect || tablePos === null) return false

      const tableNode = activeEditor.state.doc.nodeAt(tablePos)
      if (!tableNode || tableNode.type.name !== "table") return false
      if (getTableOverflowMode(tableNode) === overflowMode) return true

      activeEditor.view.dispatch(
        activeEditor.state.tr.setNodeMarkup(tablePos, undefined, {
          ...tableNode.attrs,
          overflowMode,
        })
      )
      setSelectionTick((prev) => prev + 1)
      return true
    },
    [getCurrentSelectedTableRect, setSelectionTick]
  )

  const selectCurrentTableAxis = useCallback(
    (axis: "row" | "column") => {
      if (!editor) return

      let anchorCellPos = -1
      let headCellPos = -1
      try {
        const rect = selectedRect(editor.state)
        if (rect.bottom <= rect.top || rect.right <= rect.left) return
        anchorCellPos = rect.tableStart + rect.map.positionAt(rect.top, rect.left, rect.table)
        headCellPos = rect.tableStart + rect.map.positionAt(rect.bottom - 1, rect.right - 1, rect.table)
      } catch {
        return
      }

      const anchorResolved = resolveDocPosSafe(editor, anchorCellPos)
      const headResolved = resolveDocPosSafe(editor, headCellPos)
      if (!anchorResolved || !headResolved) return

      const selection =
        axis === "row"
          ? CellSelection.rowSelection(anchorResolved, headResolved)
          : CellSelection.colSelection(anchorResolved, headResolved)

      clearStickyTopLevelBlockSelection()
      clearTableTextSelectionForStructuralSelection()
      editor.view.dispatch(editor.state.tr.setSelection(selection))
      focusElementWithoutScroll(editor.view.dom)
      window.getSelection()?.removeAllRanges()
      setSelectionTick((prev) => prev + 1)
    },
    [clearStickyTopLevelBlockSelection, editor, setSelectionTick]
  )

  const selectActiveTableBlock = useCallback(() => {
    if (!editor) return
    const blockIndex = getTopLevelBlockIndexFromSelection(editor)
    const position = getTopLevelBlockPosition(editor, blockIndex)
    const targetNode = editor.state.doc.nodeAt(position)
    if (!targetNode || targetNode.type.name !== "table") return
    const selection = NodeSelection.create(editor.state.doc, position)
    editor.view.dispatch(editor.state.tr.setSelection(selection))
    focusElementWithoutScroll(editor.view.dom)
  }, [editor])

  const activeTableCellNodeType =
    editor?.isActive("tableHeader") ?? false ? "tableHeader" : "tableCell"
  const activeTableCellAttrs = editor?.getAttributes(activeTableCellNodeType) || {}

  const canMergeSelectedTableCells = useMemo(() => {
    if (!editor) return false
    try {
      return editor.can().chain().focus().mergeCells().run()
    } catch {
      return false
    }
  }, [editor])

  const canSplitSelectedTableCell = useMemo(() => {
    if (!editor) return false
    try {
      return editor.can().chain().focus().splitCell().run()
    } catch {
      return false
    }
  }, [editor])

  useEffect(() => {
    void selectionTick
    const isTableNodeSelection = () =>
      editor?.state.selection instanceof NodeSelection && editor.state.selection.node.type.name === "table"
    if (isTableStructuralSelection || (tableMenuState?.kind === "table" && isTableNodeSelection())) return
    if (typeof window === "undefined") {
      setTableMenuState(null)
      return
    }
    const closeTimer = window.setTimeout(() => {
      if (editor?.state.selection instanceof CellSelection) return
      if (tableMenuState?.kind === "table" && isTableNodeSelection()) return
      setTableMenuState(null)
    }, 360)
    return () => window.clearTimeout(closeTimer)
  }, [editor, isTableStructuralSelection, selectionTick, setTableMenuState, tableMenuState?.kind])

  const closeTableMenu = useCallback(() => setTableMenuState(null), [setTableMenuState])

  const runTableMenuEditorAction = useCallback(
    (action: (activeEditor: TiptapEditor) => void) => {
      if (!editor) {
        closeTableMenu()
        return
      }

      action(editor)
      suppressTableAxisMenuKeepAlive(Number.POSITIVE_INFINITY)
      closeTableMenu()
      stabilizeTableSelectionSurface(editor)
    },
    [closeTableMenu, editor, stabilizeTableSelectionSurface, suppressTableAxisMenuKeepAlive]
  )

  const openTableMenu = useCallback((kind: TableMenuKind, anchorRect: DOMRect, options: { forceOpen?: boolean } = {}) => {
    cancelTableQuickRailHide()
    setTableMenuState((prev) =>
      resolveTableMenuState(
        options.forceOpen ? null : prev,
        kind,
        anchorRect,
        typeof window === "undefined"
          ? null
          : {
              width: window.innerWidth,
              height: window.innerHeight,
            }
      )
    )
  }, [cancelTableQuickRailHide, setTableMenuState])

  const openSelectionAwareTableMenu = useCallback(
    (kind: TableMenuKind, anchorRect: DOMRect) => {
      if (kind === "row") {
        suppressTableAxisMenuKeepAlive(0)
        selectCurrentTableAxis("row")
      } else if (kind === "column") {
        suppressTableAxisMenuKeepAlive(0)
        selectCurrentTableAxis("column")
      } else {
        selectActiveTableBlock()
      }
      openTableMenu(kind, anchorRect)
    },
    [openTableMenu, selectActiveTableBlock, selectCurrentTableAxis, suppressTableAxisMenuKeepAlive]
  )

  return {
    activeTableCellAttrs,
    canMergeSelectedTableCells,
    canSplitSelectedTableCell,
    closeTableMenu,
    openSelectionAwareTableMenu,
    openTableMenu,
    runTableMenuEditorAction,
    selectActiveTableBlock,
    selectCurrentTableAxis,
    tableMenuState,
    updateActiveTableCellAttrs,
    updateActiveTableOverflowMode,
  }
}
