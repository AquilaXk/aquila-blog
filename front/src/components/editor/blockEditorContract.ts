import type { ReactNode } from "react"
import type { FileBlockAttrs, ImageBlockAttrs } from "./serialization"

export type BlockEditorChangeMeta = {
  editorFocused: boolean
}

export type BlockEditorQaActions = {
  selectTableAxis: (axis: "row" | "column") => void
  selectTableColumnViaDomFallback: (columnIndex: number) => void
  setActiveTableCellAlign: (align: "left" | "center" | "right" | null) => void
  setActiveTableCellBackground: (color: string | null) => void
  addTableRowAfter: () => void
  addTableColumnAfter: () => void
  deleteSelectedTableRow: () => void
  deleteSelectedTableColumn: () => void
  resizeFirstTableRow: (deltaPx: number) => void
  resizeFirstTableColumn: (deltaPx: number) => void
  focusDocumentEnd: () => void
  appendCalloutBlock: () => void
  appendFormulaBlock: () => void
  moveTaskItemInFirstTaskList: (sourceIndex: number, insertionIndex: number) => void
}

export type BlockEditorUploadAdapters = {
  onUploadImage: (file: File) => Promise<ImageBlockAttrs>
  onUploadFile?: (file: File) => Promise<FileBlockAttrs>
}

export type BlockEditorFeatureOptions = {
  enableMermaidBlocks?: boolean
}

export type BlockEditorProps = BlockEditorUploadAdapters &
  BlockEditorFeatureOptions & {
    value: string
    onChange: (markdown: string, meta?: BlockEditorChangeMeta) => void
    disabled?: boolean
    className?: string
    preview?: ReactNode
    onQaActionsReady?: (actions: BlockEditorQaActions | null) => void
  }
