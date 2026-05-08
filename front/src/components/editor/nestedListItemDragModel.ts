import type {
  NestedListItemContext,
  NestedListItemDropIndicatorGeometry,
} from "./nestedListItemModel"
import { sameListPath } from "./nestedListItemModel"

export type NestedListItemDragPreview = {
  previewWidth: number
  previewHeight: number
  previewText: string
  previewLabel: string
}

export type PendingNestedListItemHandleDragState = {
  pointerId: number
  startX: number
  startY: number
  started: boolean
  context: NestedListItemContext
  targetListBlockIndex: number | null
  targetListPath: number[] | null
  insertionIndex: number | null
} & NestedListItemDragPreview

export type DraggedNestedListItemState =
  | ({
      listBlockIndex: number
      listPath: number[]
      sourceItemIndex: number
    } & NestedListItemDragPreview)
  | null

export type NestedListItemDropIndicatorState = {
  visible: boolean
  listBlockIndex: number
  listPath: number[]
  insertionIndex: number
  top: number
  left: number
  width: number
}

export const createHiddenNestedListItemDropIndicatorState = (): NestedListItemDropIndicatorState => ({
  visible: false,
  listBlockIndex: -1,
  listPath: [],
  insertionIndex: -1,
  top: 0,
  left: 0,
  width: 0,
})

export const createNestedListItemDragPreview = (
  sourceElement: HTMLElement,
  viewportWidth: number
): NestedListItemDragPreview => {
  const sourceRect = sourceElement.getBoundingClientRect()
  const trimmedText = sourceElement.textContent?.trim() ?? ""
  const previewLabel = trimmedText.slice(0, 100) || "목록 항목 이동"
  const previewText = trimmedText.replace(/\s+/g, " ").slice(0, 220) || previewLabel
  const effectiveViewportWidth = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 528

  return {
    previewWidth: Math.round(Math.min(Math.max(sourceRect.width, 320), Math.max(320, effectiveViewportWidth - 48))),
    previewHeight: Math.round(Math.min(Math.max(sourceRect.height, 44), 320)),
    previewText,
    previewLabel,
  }
}

export const createDraggedNestedListItemState = (
  context: NestedListItemContext,
  preview: NestedListItemDragPreview
): DraggedNestedListItemState => ({
  listBlockIndex: context.listBlockIndex,
  listPath: [...context.listPath],
  sourceItemIndex: context.itemIndex,
  ...preview,
})

export const createPendingNestedListItemHandleDragState = (
  pointerId: number,
  startX: number,
  startY: number,
  context: NestedListItemContext,
  preview: NestedListItemDragPreview
): PendingNestedListItemHandleDragState => ({
  pointerId,
  startX,
  startY,
  started: false,
  context,
  targetListBlockIndex: null,
  targetListPath: null,
  insertionIndex: null,
  ...preview,
})

export const createNestedListItemDropIndicatorState = (
  context: NestedListItemContext,
  indicator: NestedListItemDropIndicatorGeometry
): NestedListItemDropIndicatorState => ({
  visible: true,
  listBlockIndex: context.listBlockIndex,
  listPath: [...context.listPath],
  ...indicator,
})

export const hideNestedListItemDropIndicatorState = (
  state: NestedListItemDropIndicatorState
): NestedListItemDropIndicatorState => (state.visible ? { ...state, visible: false } : state)

export const isNestedListItemContextInDraggedList = (
  context: NestedListItemContext | null | undefined,
  draggedState: DraggedNestedListItemState
): context is NestedListItemContext =>
  Boolean(
    context &&
      draggedState &&
      context.listBlockIndex === draggedState.listBlockIndex &&
      sameListPath(context.listPath, draggedState.listPath)
  )
