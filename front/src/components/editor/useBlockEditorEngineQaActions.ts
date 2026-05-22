import type { Editor as TiptapEditor } from "@tiptap/core"
import { useEffect } from "react"
import type { RefObject } from "react"
import type { BlockEditorQaActions } from "./blockEditorContract"
import type { BlockEditorDoc } from "./serialization"
import { createCalloutNode, createFormulaNode } from "./serialization"
import { getEditorUndoDepth } from "./editorHistoryModel"
import { refocusEditorForSelectionReveal } from "./editorScrollSelectionGuard"

type UseBlockEditorEngineQaActionsArgs = {
  editor: TiptapEditor | null
  editorRef: RefObject<TiptapEditor | null>
  insertBlocksAtIndex: (
    insertionIndex: number,
    blocks: NonNullable<BlockEditorDoc["content"]>,
    focusIndex?: number
  ) => void
  moveTaskItemInFirstTaskList: (sourceIndex: number, insertionIndex: number) => void
  onQaActionsReady: ((actions: BlockEditorQaActions | null) => void) | undefined
  resizeFirstTableColumnBy: (deltaPx: number) => void
  resizeFirstTableRowBy: (deltaPx: number) => void
  selectCurrentTableAxis: (axis: "row" | "column") => void
  selectTableColumnByIndex: (columnIndex: number) => void
  updateActiveTableCellAttrs: (attrs: Record<string, unknown>) => void
  withTrailingParagraph: (blocks: BlockEditorDoc[]) => NonNullable<BlockEditorDoc["content"]>
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

    onQaActionsReady({
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
        editor?.chain().focus().addRowAfter().run()
      },
      addTableColumnAfter: () => {
        editor?.chain().focus().addColumnAfter().run()
      },
      deleteSelectedTableRow: () => {
        editor?.chain().focus().deleteRow().run()
      },
      deleteSelectedTableColumn: () => {
        editor?.chain().focus().deleteColumn().run()
      },
      resizeFirstTableRow: (deltaPx) => {
        resizeFirstTableRowBy(deltaPx)
      },
      resizeFirstTableColumn: (deltaPx) => {
        resizeFirstTableColumnBy(deltaPx)
      },
      focusDocumentEnd: () => {
        editor?.chain().focus("end").run()
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
      scrollCurrentSelectionIntoView: () => refocusEditorForSelectionReveal(editorRef.current ?? editor),
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
