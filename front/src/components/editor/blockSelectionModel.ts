export type TopLevelBlockHandleState = {
  visible: boolean
  kind: "top-level" | "list-item"
  blockIndex: number
  listPath: number[]
  itemIndex: number | null
  left: number
  top: number
  bottom: number
  width: number
}

export type BlockSelectionOverlayState = {
  visible: boolean
  left: number
  top: number
  width: number
  height: number
}

export type BlockSelectionPointerEventLike = {
  button: number
  detail: number
  clientX: number
  clientY: number
  target: EventTarget | null
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}

type BlockSelectionRect = Pick<DOMRect, "left" | "right" | "top" | "bottom">

export const BLOCK_HANDLE_POSITION_EPSILON_PX = 0.4
export const BLOCK_OUTER_SELECT_LEFT_GUTTER_PX = 76
export const BLOCK_OUTER_SELECT_LEFT_EDGE_GAP_PX = 2
export const BLOCK_OUTER_SELECT_VERTICAL_MARGIN_PX = 10

const sameListPath = (left: number[], right: number[]) =>
  left.length === right.length && left.every((value, index) => value === right[index])

const isWithinBlockHandleEpsilon = (prev: number, next: number) =>
  Math.abs(prev - next) <= BLOCK_HANDLE_POSITION_EPSILON_PX

export const isStableBlockHandleState = (
  prev: TopLevelBlockHandleState,
  next: TopLevelBlockHandleState
) =>
  prev.visible === next.visible &&
  prev.kind === next.kind &&
  prev.blockIndex === next.blockIndex &&
  prev.itemIndex === next.itemIndex &&
  sameListPath(prev.listPath, next.listPath) &&
  isWithinBlockHandleEpsilon(prev.left, next.left) &&
  isWithinBlockHandleEpsilon(prev.top, next.top) &&
  isWithinBlockHandleEpsilon(prev.bottom, next.bottom) &&
  isWithinBlockHandleEpsilon(prev.width, next.width)

export const isStableBlockSelectionOverlayState = (
  prev: BlockSelectionOverlayState,
  next: BlockSelectionOverlayState
) =>
  prev.visible === next.visible &&
  isWithinBlockHandleEpsilon(prev.left, next.left) &&
  isWithinBlockHandleEpsilon(prev.top, next.top) &&
  isWithinBlockHandleEpsilon(prev.width, next.width) &&
  isWithinBlockHandleEpsilon(prev.height, next.height)

const isSelectionPointerGesture = (event: BlockSelectionPointerEventLike) =>
  event.button === 0 &&
  event.detail >= 2 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.altKey &&
  !event.shiftKey

const getEventTargetElement = (target: EventTarget | null) =>
  target instanceof Element ? target : target instanceof Node ? target.parentElement : null

const hasClosestTarget = (target: Element | null, selectors: string[]) =>
  Boolean(target && selectors.some((selector) => target.closest(selector)))

const isOuterSelectionHit = (event: BlockSelectionPointerEventLike, rect: BlockSelectionRect) => {
  const withinVerticalRange =
    event.clientY >= rect.top - BLOCK_OUTER_SELECT_VERTICAL_MARGIN_PX &&
    event.clientY <= rect.bottom + BLOCK_OUTER_SELECT_VERTICAL_MARGIN_PX
  if (!withinVerticalRange) return false

  return (
    event.clientX >= rect.left - BLOCK_OUTER_SELECT_LEFT_GUTTER_PX &&
    event.clientX <= rect.left - BLOCK_OUTER_SELECT_LEFT_EDGE_GAP_PX
  )
}

export const resolveOuterBlockSelectionGesture = (
  event: BlockSelectionPointerEventLike,
  blockElement: HTMLElement | null
) => {
  if (!blockElement || !isSelectionPointerGesture(event)) return false

  const targetElement = getEventTargetElement(event.target)
  if (
    hasClosestTarget(targetElement, [
      "[data-block-handle-rail='true'] button",
      "[data-block-menu-root='true']",
      "[data-table-menu-root='true']",
      "[data-table-axis-rail='true']",
      "[data-table-corner-handle='true']",
      "[data-table-menu-trigger='true']",
    ])
  ) {
    return false
  }

  return isOuterSelectionHit(event, blockElement.getBoundingClientRect())
}

export const resolveOuterListItemSelectionGesture = (
  event: BlockSelectionPointerEventLike,
  listItemElement: HTMLElement | null
) => {
  if (!listItemElement || !isSelectionPointerGesture(event)) return false

  const targetElement = getEventTargetElement(event.target)
  if (
    hasClosestTarget(targetElement, [
      "[data-block-handle-rail='true'] button",
      "[data-block-menu-root='true']",
      "[data-table-menu-root='true']",
    ])
  ) {
    return false
  }

  return isOuterSelectionHit(event, listItemElement.getBoundingClientRect())
}
