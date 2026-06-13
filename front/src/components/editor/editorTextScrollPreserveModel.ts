import type { WindowScrollAnchor } from "./blockHandleLayoutModel"

const CODE_TEXT_SCROLL_PRESERVE_CANCEL_DISTANCE_PX = 3_200
const TABLE_TEXT_SCROLL_PRESERVE_CANCEL_DISTANCE_PX = 3_200

export const shouldCancelCodeTextScrollPreserve =
  (scrollAnchor: WindowScrollAnchor) => () =>
    Math.abs(window.scrollX - scrollAnchor.x) >
      CODE_TEXT_SCROLL_PRESERVE_CANCEL_DISTANCE_PX ||
    Math.abs(
      (document.scrollingElement?.scrollTop ?? window.scrollY) - scrollAnchor.y
    ) > CODE_TEXT_SCROLL_PRESERVE_CANCEL_DISTANCE_PX

export const shouldCancelTableTextScrollPreserve =
  (scrollAnchor: WindowScrollAnchor) => () => {
    const currentY = document.scrollingElement?.scrollTop ?? window.scrollY
    return (
      Math.abs(window.scrollX - scrollAnchor.x) >
        TABLE_TEXT_SCROLL_PRESERVE_CANCEL_DISTANCE_PX ||
      Math.abs(currentY - scrollAnchor.y) >
        TABLE_TEXT_SCROLL_PRESERVE_CANCEL_DISTANCE_PX
    )
  }
