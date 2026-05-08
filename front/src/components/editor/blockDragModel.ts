export type BlockDragPreview = {
  previewWidth: number
  previewHeight: number
  previewText: string
  previewLabel: string
}

export type PendingBlockDragState = {
  sourceIndex: number
  pointerId: number
  startX: number
  startY: number
} & BlockDragPreview

export type DraggedBlockState =
  | ({
      sourceIndex: number
      pointerId: number
    } & BlockDragPreview)
  | null

export type DropIndicatorState = {
  visible: boolean
  insertionIndex: number
  top: number
  left: number
  width: number
  highlightTop: number
  highlightLeft: number
  highlightWidth: number
  highlightHeight: number
}

export type DropIndicatorGeometry = Omit<DropIndicatorState, "visible">

const createHiddenDropIndicatorGeometry = (): DropIndicatorGeometry => ({
  insertionIndex: 0,
  top: 0,
  left: 0,
  width: 0,
  highlightTop: 0,
  highlightLeft: 0,
  highlightWidth: 0,
  highlightHeight: 0,
})

export const createHiddenDropIndicatorState = (): DropIndicatorState => ({
  visible: false,
  ...createHiddenDropIndicatorGeometry(),
})

export const createBlockDragPreview = (
  sourceElement: HTMLElement | null | undefined,
  viewportWidth: number
): BlockDragPreview => {
  const sourceRect = sourceElement?.getBoundingClientRect()
  const trimmedText = sourceElement?.textContent?.trim() ?? ""
  const previewLabel = trimmedText.slice(0, 100) || "블록 이동"
  const previewText = trimmedText.replace(/\s+/g, " ").slice(0, 220) || previewLabel
  const effectiveViewportWidth = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 528

  return {
    previewWidth: sourceRect
      ? Math.round(Math.min(Math.max(sourceRect.width, 320), Math.max(320, effectiveViewportWidth - 48)))
      : 480,
    previewHeight: sourceRect ? Math.round(Math.min(Math.max(sourceRect.height, 44), 320)) : 120,
    previewText,
    previewLabel,
  }
}

export const createPendingBlockDragState = (
  sourceIndex: number,
  pointerId: number,
  startX: number,
  startY: number,
  preview: BlockDragPreview
): PendingBlockDragState => ({
  sourceIndex,
  pointerId,
  startX,
  startY,
  ...preview,
})

export const createDraggedBlockState = (pending: PendingBlockDragState): DraggedBlockState => ({
  sourceIndex: pending.sourceIndex,
  pointerId: pending.pointerId,
  previewWidth: pending.previewWidth,
  previewHeight: pending.previewHeight,
  previewText: pending.previewText,
  previewLabel: pending.previewLabel,
})

export const createDropIndicatorState = (geometry: DropIndicatorGeometry): DropIndicatorState => ({
  visible: true,
  ...geometry,
})

export const hideDropIndicatorState = (state: DropIndicatorState): DropIndicatorState =>
  state.visible ? { ...state, visible: false } : state

export const resolveBlockDropIndicatorByClientY = (
  elements: HTMLElement[],
  clientY: number
): DropIndicatorGeometry => {
  const firstElement = elements[0]
  const lastElement = elements[elements.length - 1]
  if (!firstElement || !lastElement) {
    return createHiddenDropIndicatorGeometry()
  }

  const rootRect = firstElement.parentElement?.getBoundingClientRect()
  let insertionIndex = elements.length
  let top = lastElement.getBoundingClientRect().bottom
  let highlightTop = 0
  let highlightLeft = 0
  let highlightWidth = 0
  let highlightHeight = 0

  for (let index = 0; index < elements.length; index += 1) {
    const rect = elements[index].getBoundingClientRect()
    const midpoint = rect.top + rect.height / 2
    if (clientY < midpoint) {
      insertionIndex = index
      top = rect.top
      highlightTop = Math.round(rect.top - 4)
      highlightLeft = Math.round(rect.left - 8)
      highlightWidth = Math.round(rect.width + 16)
      highlightHeight = Math.round(rect.height + 8)
      break
    }
  }

  if (insertionIndex === elements.length) {
    const tailRect = lastElement.getBoundingClientRect()
    highlightTop = Math.round(tailRect.bottom + 6)
    highlightLeft = Math.round(tailRect.left)
    highlightWidth = Math.round(tailRect.width)
    highlightHeight = 18
  }

  return {
    insertionIndex,
    top: Math.round(top),
    left: Math.round(rootRect?.left || firstElement.getBoundingClientRect().left),
    width: Math.round(rootRect?.width || firstElement.getBoundingClientRect().width),
    highlightTop,
    highlightLeft,
    highlightWidth,
    highlightHeight,
  }
}
