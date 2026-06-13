import type { Editor as TiptapEditor } from "@tiptap/core"
import { NodeSelection } from "@tiptap/pm/state"
import { CellSelection, selectedRect } from "@tiptap/pm/tables"
import type { Dispatch, SetStateAction } from "react"
import { useCallback, useEffect, useMemo, useRef } from "react"
import {
  getTopLevelBlockIndexFromSelection,
  getTopLevelBlockNodePosition,
  selectTopLevelBlockNode,
} from "./blockSelectionModel"
import type { TableAxisSelectionTarget } from "./tableAxisDragModel"
import {
  resolveTableMenuState,
  type TableMenuKind,
  type TableMenuState,
} from "./tableFloatingUiModel"
import { dispatchEditorSelectionSafely } from "./tableSelectionDispatchModel"
import { clearTableTextSelectionForStructuralSelection } from "./tableTextSelectionModel"
import { getTableOverflowMode } from "./tableWidthModel"
import {
  focusElementWithoutScroll,
  type TableOverlaySelectionRect,
} from "./useBlockEditorTableOverlayDomAdapter"

type UseBlockEditorTableOverlayMenuArgs = {
  cancelTableQuickRailHide: () => void
  clearStickyTopLevelBlockSelection: () => void
  editor: TiptapEditor | null
  getCurrentSelectedTableRect: (
    activeEditor?: TiptapEditor | null
  ) => TableOverlaySelectionRect | null
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
  const tableMenuOpenedSelectionTickRef = useRef<number | null>(null)

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
        const collectFromResolvedPos = (
          resolvedPos: typeof selection.$from
        ) => {
          for (let depth = resolvedPos.depth; depth >= 0; depth -= 1) {
            const nodeTypeName = resolvedPos.node(depth).type.name
            if (nodeTypeName !== "tableCell" && nodeTypeName !== "tableHeader")
              continue
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
          transaction = transaction.setNodeMarkup(
            cellPos,
            undefined,
            nextAttrs,
            cellNode.marks
          )
          changed = true
        })

        if (changed) {
          editor.view.dispatch(transaction)
          setSelectionTick((prev) => prev + 1)
        }
        return
      }

      const chain = editor.chain().focus()
      const cellNodeType = editor.isActive("tableHeader")
        ? "tableHeader"
        : "tableCell"
      chain.updateAttributes(cellNodeType, attrs).run()
    },
    [editor, setSelectionTick]
  )

  const resolveActiveTablePosition = useCallback(
    (activeEditor: TiptapEditor) => {
      if (
        tableMenuState?.kind === "table" &&
        typeof tableMenuState.tablePos === "number"
      ) {
        const menuTableNode = activeEditor.state.doc.nodeAt(
          tableMenuState.tablePos
        )
        if (menuTableNode?.type.name === "table") {
          return tableMenuState.tablePos
        }
      }

      const tableRect = getCurrentSelectedTableRect(activeEditor)
      const tablePos = tableRect ? Math.max(0, tableRect.tableStart - 1) : null
      if (tablePos === null) return null

      const tableNode = activeEditor.state.doc.nodeAt(tablePos)
      return tableNode?.type.name === "table" ? tablePos : null
    },
    [getCurrentSelectedTableRect, tableMenuState]
  )

  const updateActiveTableOverflowMode = useCallback(
    (activeEditor: TiptapEditor, overflowMode: "normal" | "wide") => {
      const tablePos = resolveActiveTablePosition(activeEditor)
      if (tablePos === null) return false

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
    [resolveActiveTablePosition, setSelectionTick]
  )

  const deleteActiveTable = useCallback(
    (activeEditor: TiptapEditor) => {
      const tablePos = resolveActiveTablePosition(activeEditor)
      if (tablePos === null) return false

      const tableNode = activeEditor.state.doc.nodeAt(tablePos)
      if (!tableNode || tableNode.type.name !== "table") return false

      activeEditor.view.dispatch(
        activeEditor.state.tr.delete(tablePos, tablePos + tableNode.nodeSize)
      )
      setSelectionTick((prev) => prev + 1)
      return true
    },
    [resolveActiveTablePosition, setSelectionTick]
  )

  const resolveTopLevelBlockIndexAtPosition = useCallback(
    (activeEditor: TiptapEditor, targetPosition: number) => {
      let position = 0
      for (
        let index = 0;
        index < activeEditor.state.doc.childCount;
        index += 1
      ) {
        const node = activeEditor.state.doc.child(index)
        if (position === targetPosition) return index
        position += node.nodeSize
      }
      return null
    },
    []
  )

  const selectCurrentTableAxis = useCallback(
    (axis: "row" | "column") => {
      if (!editor) return false

      const resolveAxisSelection = () => {
        let tableRect: TableOverlaySelectionRect | null = null
        let sourceTop: number | null = null
        let sourceLeft: number | null = null

        try {
          const selectedTableRect = selectedRect(editor.state)
          tableRect = selectedTableRect
          sourceTop = selectedTableRect.top
          sourceLeft = selectedTableRect.left
        } catch {
          tableRect = getCurrentSelectedTableRect(editor)
        }

        if (!tableRect) return null

        const menuAxisTarget =
          tableMenuState?.kind === axis &&
          tableMenuState.axisTarget?.axis === axis
            ? tableMenuState.axisTarget
            : null
        const sourceIndex =
          menuAxisTarget?.index ??
          (axis === "row" ? sourceTop : sourceLeft) ??
          0
        const anchorIndex = menuAxisTarget?.anchorIndex ?? sourceIndex
        const rowIndex =
          axis === "row"
            ? Math.max(0, Math.min(sourceIndex, tableRect.map.height - 1))
            : 0
        const anchorRowIndex =
          axis === "row"
            ? Math.max(0, Math.min(anchorIndex, tableRect.map.height - 1))
            : 0
        const columnIndex =
          axis === "column"
            ? Math.max(0, Math.min(sourceIndex, tableRect.map.width - 1))
            : 0
        const anchorColumnIndex =
          axis === "column"
            ? Math.max(0, Math.min(anchorIndex, tableRect.map.width - 1))
            : 0
        const anchorCellPos =
          tableRect.tableStart +
          tableRect.map.positionAt(anchorRowIndex, anchorColumnIndex, tableRect.table)
        const headCellPos =
          tableRect.tableStart +
          tableRect.map.positionAt(
            axis === "row" ? rowIndex : tableRect.map.height - 1,
            axis === "column" ? columnIndex : tableRect.map.width - 1,
            tableRect.table
          )
        const anchorResolved = editor.state.doc.resolve(anchorCellPos)
        const headResolved = editor.state.doc.resolve(headCellPos)
        return axis === "row"
          ? CellSelection.rowSelection(anchorResolved, headResolved)
          : CellSelection.colSelection(anchorResolved, headResolved)
      }

      clearStickyTopLevelBlockSelection()
      clearTableTextSelectionForStructuralSelection()
      if (
        !dispatchEditorSelectionSafely(editor, (state) => {
          try {
            return resolveAxisSelection()
          } catch {
            return null
          }
        })
      )
        return false
      focusElementWithoutScroll(editor.view.dom)
      window.getSelection()?.removeAllRanges()
      setSelectionTick((prev) => prev + 1)
      return true
    },
    [
      clearStickyTopLevelBlockSelection,
      editor,
      getCurrentSelectedTableRect,
      setSelectionTick,
      tableMenuState,
    ]
  )

  const selectActiveTableBlock = useCallback(() => {
    if (!editor) return null
    const blockIndex = getTopLevelBlockIndexFromSelection(editor)
    const position = getTopLevelBlockNodePosition(editor, blockIndex)
    const targetNode = editor.state.doc.nodeAt(position)
    const tablePos =
      targetNode?.type.name === "table"
        ? position
        : resolveActiveTablePosition(editor)
    if (tablePos === null) return null

    const tableBlockIndex =
      targetNode?.type.name === "table"
        ? blockIndex
        : resolveTopLevelBlockIndexAtPosition(editor, tablePos)
    if (tableBlockIndex === null) return null

    selectTopLevelBlockNode(editor, tableBlockIndex)
    focusElementWithoutScroll(editor.view.dom)
    return tablePos
  }, [editor, resolveActiveTablePosition, resolveTopLevelBlockIndexAtPosition])

  const activeTableCellNodeType =
    editor?.isActive("tableHeader") ?? false ? "tableHeader" : "tableCell"
  const activeTableCellAttrs =
    editor?.getAttributes(activeTableCellNodeType) || {}

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
    const hasActiveTableMenuTarget = () => {
      if (
        !editor ||
        tableMenuState?.kind !== "table" ||
        typeof tableMenuState.tablePos !== "number"
      ) {
        return false
      }
      const tablePos = tableMenuState.tablePos
      if (editor.state.doc.nodeAt(tablePos)?.type.name !== "table") {
        return false
      }
      if (tableMenuOpenedSelectionTickRef.current === selectionTick) {
        return true
      }

      const { selection } = editor.state
      if (selection instanceof NodeSelection) {
        return (
          selection.from === tablePos && selection.node.type.name === "table"
        )
      }
      if (selection instanceof CellSelection) {
        try {
          return selectedRect(editor.state).tableStart - 1 === tablePos
        } catch {
          return false
        }
      }

      const tableRect = getCurrentSelectedTableRect(editor)
      return tableRect ? tableRect.tableStart - 1 === tablePos : false
    }
    const isTableNodeSelection = () =>
      editor?.state.selection instanceof NodeSelection &&
      editor.state.selection.node.type.name === "table"
    if (isTableStructuralSelection || hasActiveTableMenuTarget()) return
    if (typeof window === "undefined") {
      setTableMenuState(null)
      return
    }
    const closeTimer = window.setTimeout(() => {
      if (editor?.state.selection instanceof CellSelection) return
      if (tableMenuState?.kind === "table" && isTableNodeSelection()) return
      if (hasActiveTableMenuTarget()) return
      setTableMenuState(null)
    }, 360)
    return () => window.clearTimeout(closeTimer)
  }, [
    editor,
    getCurrentSelectedTableRect,
    isTableStructuralSelection,
    selectionTick,
    setTableMenuState,
    tableMenuState?.kind,
    tableMenuState?.tablePos,
  ])

  const closeTableMenu = useCallback(
    () => setTableMenuState(null),
    [setTableMenuState]
  )

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
    [
      closeTableMenu,
      editor,
      stabilizeTableSelectionSurface,
      suppressTableAxisMenuKeepAlive,
    ]
  )

  const openTableMenu = useCallback(
    (
      kind: TableMenuKind,
      anchorRect: DOMRect,
      options: {
        axisTarget?: TableAxisSelectionTarget
        forceOpen?: boolean
        tablePos?: number
      } = {}
    ) => {
      cancelTableQuickRailHide()
      setTableMenuState((prev) => {
        const nextState = resolveTableMenuState(
          options.forceOpen ? null : prev,
          kind,
          anchorRect,
          typeof window === "undefined"
            ? null
            : {
                width: window.innerWidth,
                height: window.innerHeight,
              },
          {
            axisTarget: options.axisTarget,
            tablePos: options.tablePos,
          }
        )
        tableMenuOpenedSelectionTickRef.current =
          nextState?.kind === "table" ? selectionTick : null
        return nextState
      })
    },
    [cancelTableQuickRailHide, selectionTick, setTableMenuState]
  )

  const openSelectionAwareTableMenu = useCallback(
    (kind: TableMenuKind, anchorRect: DOMRect) => {
      if (kind === "row") {
        suppressTableAxisMenuKeepAlive(0)
        if (!selectCurrentTableAxis("row")) return
      } else if (kind === "column") {
        suppressTableAxisMenuKeepAlive(0)
        if (!selectCurrentTableAxis("column")) return
      } else {
        const tablePos = selectActiveTableBlock()
        if (tablePos === null) return
        openTableMenu(kind, anchorRect, { tablePos })
        return
      }
      openTableMenu(kind, anchorRect)
    },
    [
      openTableMenu,
      selectActiveTableBlock,
      selectCurrentTableAxis,
      suppressTableAxisMenuKeepAlive,
    ]
  )

  return {
    activeTableCellAttrs,
    canMergeSelectedTableCells,
    canSplitSelectedTableCell,
    deleteActiveTable,
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
