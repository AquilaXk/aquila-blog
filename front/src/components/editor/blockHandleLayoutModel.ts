import type { BlockEditorDoc } from "./serialization"

export const BLOCK_HANDLE_VIEWPORT_PADDING_PX = 12
export const BLOCK_HANDLE_GUTTER_GAP_PX = 10
export const BLOCK_HANDLE_STACKED_GAP_PX = 8

export type BlockHandleRailLayout = {
  left: number
  top: number
}

export const resolveBlockHandleAnchorTop = (blockElement: HTMLElement, railHeight: number) => {
  const rect = blockElement.getBoundingClientRect()
  if (typeof window === "undefined") return rect.top + 6

  const lineAnchorElement =
    (blockElement.matches("p, h1, h2, h3, h4, blockquote")
      ? blockElement
      : blockElement.querySelector(":scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > blockquote")) ||
    blockElement

  const computedStyle = window.getComputedStyle(lineAnchorElement as Element)
  const fontSize = Number.parseFloat(computedStyle.fontSize || "16")
  const parsedLineHeight = Number.parseFloat(computedStyle.lineHeight || "")
  const lineHeight =
    Number.isFinite(parsedLineHeight) && parsedLineHeight > 0 ? parsedLineHeight : fontSize * 1.42

  return rect.top + Math.max(0, (lineHeight - railHeight) / 2)
}

export const resolveThinBlockHandleAnchorTop = (blockElement: HTMLElement, railHeight: number) => {
  const rect = blockElement.getBoundingClientRect()
  return Math.max(0, rect.top + rect.height / 2 - railHeight / 2)
}

export const resolveBlockHandleRailLayout = (
  rect: DOMRect,
  railWidth: number,
  railHeight: number,
  anchoredTop: number
): BlockHandleRailLayout => {
  const gutterLeft = rect.left - railWidth - BLOCK_HANDLE_GUTTER_GAP_PX
  if (gutterLeft >= BLOCK_HANDLE_VIEWPORT_PADDING_PX || typeof window === "undefined") {
    return {
      left: Math.max(BLOCK_HANDLE_VIEWPORT_PADDING_PX, gutterLeft),
      top: anchoredTop,
    }
  }

  const maxLeft = Math.max(
    BLOCK_HANDLE_VIEWPORT_PADDING_PX,
    window.innerWidth - railWidth - BLOCK_HANDLE_VIEWPORT_PADDING_PX
  )

  return {
    left: Math.min(Math.max(BLOCK_HANDLE_VIEWPORT_PADDING_PX, rect.left), maxLeft),
    top: rect.top - railHeight - BLOCK_HANDLE_STACKED_GAP_PX,
  }
}

export const shouldCenterBlockHandleForNode = (node?: BlockEditorDoc | null) =>
  Boolean(
    node &&
      (node.type === "paragraph" ||
        node.type === "heading" ||
        node.type === "blockquote" ||
        node.type === "bulletList" ||
        node.type === "orderedList" ||
        node.type === "taskList")
  )

export const shouldUseThinBlockHandleAnchor = (node?: BlockEditorDoc | null) =>
  Boolean(node && node.type === "horizontalRule")
