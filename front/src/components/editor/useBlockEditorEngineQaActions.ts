import type { Editor as TiptapEditor } from "@tiptap/core"
import { tableEditingKey } from "@tiptap/pm/tables"
import { useEffect } from "react"
import type { RefObject } from "react"
import type { BlockEditorQaActions } from "./blockEditorContract"
import type { BlockEditorDoc } from "./serialization"
import { createCalloutNode, createFormulaNode } from "./serialization"
import { getEditorUndoDepth } from "./editorHistoryModel"
import { refocusEditorForSelectionReveal } from "./editorScrollSelectionGuard"
import { selectTopLevelBlockNode } from "./blockSelectionModel"

type UseBlockEditorEngineQaActionsArgs = {
  editor: TiptapEditor | null
  editorRef: RefObject<TiptapEditor | null>
  insertBlocksAtIndex: (
    insertionIndex: number,
    blocks: NonNullable<BlockEditorDoc["content"]>,
    focusIndex?: number
  ) => void
  moveTaskItemInFirstTaskList: (
    sourceIndex: number,
    insertionIndex: number
  ) => void
  onQaActionsReady: ((actions: BlockEditorQaActions | null) => void) | undefined
  resizeFirstTableColumnBy: (deltaPx: number) => void
  resizeFirstTableRowBy: (deltaPx: number) => void
  selectCurrentTableAxis: (axis: "row" | "column") => boolean
  selectTableColumnByIndex: (columnIndex: number) => unknown
  updateActiveTableCellAttrs: (attrs: Record<string, unknown>) => void
  withTrailingParagraph: (
    blocks: BlockEditorDoc[]
  ) => NonNullable<BlockEditorDoc["content"]>
}

export const useBlockEditorEngineQaActions = ({
  editor,
  editorRef,
  insertBlocksAtIndex,
  moveTaskItemInFirstTaskList,
  onQaActionsReady,
  resizeFirstTableColumnBy,
  resizeFirstTableRowBy,
  selectCurrentTableAxis,
  selectTableColumnByIndex,
  updateActiveTableCellAttrs,
  withTrailingParagraph,
}: UseBlockEditorEngineQaActionsArgs) => {
  useEffect(() => {
    if (!onQaActionsReady) return
    const runTableStructureAction = (
      axis: "row" | "column",
      command: (activeEditor: TiptapEditor) => boolean
    ) => {
      const currentEditor = editorRef.current ?? editor
      if (!currentEditor) return
      if (!selectCurrentTableAxis(axis)) return
      const previousDoc = currentEditor.state.doc
      const applied = command(currentEditor)
      if (applied && currentEditor.state.doc !== previousDoc) return
      if (typeof window === "undefined") return
      window.requestAnimationFrame(() => {
        const retryEditor = editorRef.current ?? editor
        if (!retryEditor) return
        if (!selectCurrentTableAxis(axis)) return
        command(retryEditor)
      })
    }

    onQaActionsReady({
      getSelectionSnapshot: () => {
        const currentEditor = editorRef.current ?? editor
        if (!currentEditor) return null
        const { selection } = currentEditor.state
        return {
          docChildTypes: Array.from(
            { length: currentEditor.state.doc.childCount },
            (_value, index) => currentEditor.state.doc.child(index).type.name
          ),
          from: selection.from,
          selectionType: selection.constructor.name,
          tableEditingState: String(
            tableEditingKey.getState(currentEditor.state) ?? "null"
          ),
          to: selection.to,
        }
      },
      selectBlockAtIndex: (blockIndex) => {
        const currentEditor = editorRef.current ?? editor
        if (!currentEditor) return
        selectTopLevelBlockNode(currentEditor, blockIndex)
      },
      selectTableAxis: (axis) => {
        selectCurrentTableAxis(axis)
      },
      selectTableColumnViaDomFallback: (columnIndex) => {
        const currentEditor = editorRef.current ?? editor
        if (!currentEditor) return
        currentEditor.chain().focus("end").run()
        selectTableColumnByIndex(columnIndex)
      },
      setActiveTableCellAlign: (align) => {
        updateActiveTableCellAttrs({ textAlign: align })
      },
      setActiveTableCellBackground: (color) => {
        updateActiveTableCellAttrs({ backgroundColor: color })
      },
      addTableRowAfter: () => {
        runTableStructureAction("row", (activeEditor) =>
          activeEditor.commands.addRowAfter()
        )
      },
      addTableColumnAfter: () => {
        runTableStructureAction("column", (activeEditor) =>
          activeEditor.commands.addColumnAfter()
        )
      },
      deleteSelectedTableRow: () => {
        runTableStructureAction("row", (activeEditor) =>
          activeEditor.commands.deleteRow()
        )
      },
      deleteSelectedTableColumn: () => {
        runTableStructureAction("column", (activeEditor) =>
          activeEditor.commands.deleteColumn()
        )
      },
      resizeFirstTableRow: (deltaPx) => {
        resizeFirstTableRowBy(deltaPx)
      },
      resizeFirstTableColumn: (deltaPx) => {
        resizeFirstTableColumnBy(deltaPx)
      },
      focusDocumentEnd: () => {
        const currentEditor = editorRef.current ?? editor
        currentEditor?.chain().focus("end").run()
      },
      appendCalloutBlock: () => {
        const currentEditor = editorRef.current
        if (!currentEditor) return
        insertBlocksAtIndex(
          currentEditor.state.doc.childCount,
          withTrailingParagraph([
            createCalloutNode({
              kind: "tip",
              title: "",
              body: "",
            }),
          ])
        )
      },
      appendFormulaBlock: () => {
        const currentEditor = editorRef.current
        if (!currentEditor) return
        insertBlocksAtIndex(
          currentEditor.state.doc.childCount,
          withTrailingParagraph([
            createFormulaNode({
              formula: "",
            }),
          ])
        )
      },
      moveTaskItemInFirstTaskList: (sourceIndex, insertionIndex) => {
        moveTaskItemInFirstTaskList(sourceIndex, insertionIndex)
      },
      scrollCurrentSelectionIntoView: () =>
        refocusEditorForSelectionReveal(editorRef.current ?? editor),
      getUndoDepth: () => {
        const currentEditor = editorRef.current ?? editor
        return currentEditor ? getEditorUndoDepth(currentEditor) : 0
      },
    })

    return () => {
      onQaActionsReady(null)
    }
  }, [
    editor,
    editorRef,
    insertBlocksAtIndex,
    moveTaskItemInFirstTaskList,
    onQaActionsReady,
    resizeFirstTableColumnBy,
    resizeFirstTableRowBy,
    selectTableColumnByIndex,
    selectCurrentTableAxis,
    updateActiveTableCellAttrs,
    withTrailingParagraph,
  ])
}
