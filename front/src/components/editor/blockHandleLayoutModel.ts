import type { BlockEditorDoc } from "./serialization"

export const BLOCK_HANDLE_VIEWPORT_PADDING_PX = 12
export const BLOCK_HANDLE_GUTTER_GAP_PX = 10
export const BLOCK_HANDLE_STACKED_GAP_PX = 8

export type BlockHandleRailLayout = {
  left: number
  top: number
}

export type BlockChromePositionMode = "editor-local" | "viewport"
type BlockChromeSurfaceRect = Pick<DOMRect, "left" | "top"> | null
export type WindowScrollAnchor = {
  x: number
  y: number
}

export const resolveBlockChromeLeft = (
  left: number,
  surfaceRect: BlockChromeSurfaceRect,
  mode: BlockChromePositionMode
) => (mode === "editor-local" ? left - (surfaceRect?.left ?? 0) : left)

export const resolveBlockChromeTop = (
  top: number,
  surfaceRect: BlockChromeSurfaceRect,
  mode: BlockChromePositionMode
) => (mode === "editor-local" ? top - (surfaceRect?.top ?? 0) : top)

export const resolveBlockSelectionOverlayLayout = (
  rect: DOMRect,
  surfaceRect: BlockChromeSurfaceRect
) => ({
  visible: true,
  left: resolveBlockChromeLeft(rect.left - 6, surfaceRect, "editor-local"),
  top: resolveBlockChromeTop(rect.top - 4, surfaceRect, "editor-local"),
  width: rect.width + 12,
  height: rect.height + 8,
})

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

export const resolveBlockHandleRailLayoutForSurface = (
  rect: DOMRect,
  railWidth: number,
  railHeight: number,
  anchoredTop: number,
  surfaceRect: BlockChromeSurfaceRect,
  mode: BlockChromePositionMode
): BlockHandleRailLayout => {
  const railLayout = resolveBlockHandleRailLayout(rect, railWidth, railHeight, anchoredTop)
  return {
    left: resolveBlockChromeLeft(railLayout.left, surfaceRect, mode),
    top: resolveBlockChromeTop(railLayout.top, surfaceRect, mode),
  }
}

export const preserveWindowScrollAcrossFrames = (
  frames = 6,
  tolerance = 4,
  minDurationMs = 0,
  cancelOnTextSelectionChange = false,
  cancelOnPointerMove = true
) => {
  if (typeof window === "undefined" || typeof document === "undefined") return
  const scrollingElement = document.scrollingElement
  preserveWindowScrollPositionAcrossFrames(
    { x: window.scrollX, y: scrollingElement?.scrollTop ?? window.scrollY },
    frames,
    tolerance,
    minDurationMs,
    cancelOnTextSelectionChange,
    cancelOnPointerMove
  )
}

export const preserveWindowScrollPositionAcrossFrames = (
  anchor: WindowScrollAnchor,
  frames = 6,
  tolerance = 4,
  minDurationMs = 0,
  cancelOnTextSelectionChange = false,
  cancelOnPointerMove = true
) => {
  if (typeof window === "undefined" || typeof document === "undefined") return
  const scrollingElement = document.scrollingElement
  const startX = anchor.x
  const startY = anchor.y
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now()
  let cancelled = false
  let frame = 0
  const cancel = () => {
    cancelled = true
    cleanup()
  }
  const cancelForTextSelection = () => {
    if (!cancelOnTextSelectionChange) return
    cancel()
  }
  const cleanup = () => {
    window.removeEventListener("wheel", cancel, true)
    window.removeEventListener("pointerdown", cancel, true)
    if (cancelOnPointerMove) {
      window.removeEventListener("pointermove", cancel, true)
      window.removeEventListener("mousemove", cancel, true)
      window.removeEventListener("touchmove", cancel, true)
    }
    window.removeEventListener("keydown", cancel, true)
    document.removeEventListener("selectionchange", cancelForTextSelection, true)
  }
  window.addEventListener("wheel", cancel, { capture: true, passive: true, once: true })
  window.addEventListener("pointerdown", cancel, { capture: true, passive: true, once: true })
  if (cancelOnPointerMove) {
    window.addEventListener("pointermove", cancel, { capture: true, passive: true, once: true })
    window.addEventListener("mousemove", cancel, { capture: true, passive: true, once: true })
    window.addEventListener("touchmove", cancel, { capture: true, passive: true, once: true })
  }
  window.addEventListener("keydown", cancel, { capture: true, once: true })
  if (cancelOnTextSelectionChange) {
    document.addEventListener("selectionchange", cancelForTextSelection, true)
  }
  const restore = () => {
    if (cancelled) return
    const currentY = scrollingElement?.scrollTop ?? window.scrollY
    if (Math.abs(window.scrollX - startX) > tolerance || Math.abs(currentY - startY) > tolerance) {
      window.scrollTo(startX, startY)
    }
    frame += 1
    const elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt
    if (frame < frames || elapsedMs < minDurationMs) {
      window.requestAnimationFrame(restore)
    } else {
      cleanup()
    }
  }
  restore()
}

let preserveNextEditorPointerAfterTable = false

export const markNextEditorPointerAfterTable = () => {
  preserveNextEditorPointerAfterTable = true
}

const EDITOR_POINTER_FOCUS_SCROLL_PRESERVE_FRAMES = 72
const EDITOR_POINTER_FOCUS_SCROLL_PRESERVE_MIN_MS = 1_120
const EDITOR_POINTER_GENERAL_SCROLL_PRESERVE_FRAMES = 4
const EDITOR_POINTER_GENERAL_SCROLL_PRESERVE_MIN_MS = 64
const EDITOR_POINTER_SCROLL_PRESERVE_SELECTOR = "[data-testid='block-editor-prosemirror'], .ProseMirror"
const EDITOR_POINTER_SCROLL_CONTROL_SELECTOR =
  "button, input, textarea, select, summary, [role='button'], [contenteditable='false']"
const EDITOR_POINTER_SCROLL_RICH_BLOCK_SELECTOR = [
  ".aq-code-shell",
  ".aq-code-editor-content",
  "[data-code-block-wrapper='true']",
  ".aq-table-shell",
  ".tableWrapper",
  "table",
  "[data-mermaid-block]",
  ".aq-mermaid-code-input",
  ".aq-mermaid",
  ".aq-mermaid-stage",
].join(", ")

export const preserveWindowScrollForRichBlockSelectAll = () => {
  preserveWindowScrollAcrossFrames(
    EDITOR_POINTER_FOCUS_SCROLL_PRESERVE_FRAMES,
    4,
    EDITOR_POINTER_FOCUS_SCROLL_PRESERVE_MIN_MS
  )
}

const preserveWindowScrollForTablePointerTextDrag = () => {
  preserveWindowScrollAcrossFrames(
    EDITOR_POINTER_FOCUS_SCROLL_PRESERVE_FRAMES,
    4,
    EDITOR_POINTER_FOCUS_SCROLL_PRESERVE_MIN_MS
  )
}

export const preserveWindowScrollForEditorPointerFocus = (
  target: EventTarget | null,
  tableSelectionActive: boolean,
  blockSelectionActive = false
) => {
  const targetElement = target instanceof Element ? target : target instanceof Node ? target.parentElement : null
  const tablePointerTarget = Boolean(targetElement?.closest(".aq-table-shell, .tableWrapper, table"))
  const editorPointerTarget = Boolean(targetElement?.closest(EDITOR_POINTER_SCROLL_PRESERVE_SELECTOR))
  const editorControlTarget = Boolean(targetElement?.closest(EDITOR_POINTER_SCROLL_CONTROL_SELECTOR))
  const editorRichBlockTarget = Boolean(targetElement?.closest(EDITOR_POINTER_SCROLL_RICH_BLOCK_SELECTOR))
  const shouldPreserveRichEditorPointer = editorPointerTarget && editorRichBlockTarget && !tablePointerTarget
  const shouldPreserveBlockSelectionPointer = editorPointerTarget && blockSelectionActive && !editorControlTarget
  const shouldPreserveTableBlockSelectionPointer = tablePointerTarget && blockSelectionActive
  const shouldPreserveGeneralEditorPointer =
    editorPointerTarget && !editorRichBlockTarget && !editorControlTarget && !blockSelectionActive
  const shouldPreserveFollowUp = !tablePointerTarget && preserveNextEditorPointerAfterTable
  if (tablePointerTarget) {
    markNextEditorPointerAfterTable()
  } else if (shouldPreserveFollowUp) {
    preserveNextEditorPointerAfterTable = false
  }
  if (
    shouldPreserveRichEditorPointer ||
    shouldPreserveBlockSelectionPointer ||
    shouldPreserveTableBlockSelectionPointer ||
    tableSelectionActive ||
    shouldPreserveFollowUp
  ) {
    preserveWindowScrollForRichBlockSelectAll()
    return
  }
  if (tablePointerTarget) {
    preserveWindowScrollForTablePointerTextDrag()
    return
  }
  if (shouldPreserveGeneralEditorPointer) {
    preserveWindowScrollAcrossFrames(
      EDITOR_POINTER_GENERAL_SCROLL_PRESERVE_FRAMES,
      4,
      EDITOR_POINTER_GENERAL_SCROLL_PRESERVE_MIN_MS,
      true
    )
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
