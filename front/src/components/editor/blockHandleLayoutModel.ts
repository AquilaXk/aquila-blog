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
type BlockHandleProtectedRect = Pick<DOMRect, "bottom" | "left" | "right" | "top">
export type WindowScrollAnchor = { x: number; y: number }

let preserveNextEditorPointerAfterTable = false
let preserveNextEditorPointerAfterCodeSelection = false
let preserveNextEditorPointerAfterCodeSelectionReentryUntil = 0
let activeWindowScrollPreserveCancel: (() => void) | null = null, windowScrollPreserveGeneration = 0
let activeWindowScrollPreserveOwner: string | null = null
let suppressGeneralEditorPointerPreserveUntil = 0
const activeTablePointerScrollPreserveCancels = new Set<() => void>()

export const markNextEditorPointerAfterTable = () => { preserveNextEditorPointerAfterTable = true }

export const clearNextEditorPointerAfterTable = () => { preserveNextEditorPointerAfterTable = false }

const setActiveWindowScrollPreserveOwner = (owner: string | null) => {
  activeWindowScrollPreserveOwner = owner
  if (typeof document === "undefined") return
  if (owner) document.documentElement.setAttribute("data-editor-scroll-preserve-owner", owner)
  else document.documentElement.removeAttribute("data-editor-scroll-preserve-owner")
}

export const cancelActiveWindowScrollPreserve = () => { activeWindowScrollPreserveCancel?.(); activeWindowScrollPreserveCancel = null }

export const cancelAllWindowScrollPreserves = () => { windowScrollPreserveGeneration += 1; cancelActiveWindowScrollPreserve() }

export const cancelActiveTableWindowScrollPreserve = () => {
  if (activeWindowScrollPreserveOwner === "table") cancelActiveWindowScrollPreserve()
}

export const cancelTablePointerScrollPreserves = () => {
  clearNextEditorPointerAfterTable()
  activeTablePointerScrollPreserveCancels.forEach((cancel) => cancel())
  activeTablePointerScrollPreserveCancels.clear()
}

const trackTablePointerScrollPreserve = (cancel?: (() => void) | void) => {
  if (!cancel) return
  activeTablePointerScrollPreserveCancels.add(cancel)
  window.setTimeout(() => activeTablePointerScrollPreserveCancels.delete(cancel), EDITOR_POINTER_FOCUS_SCROLL_PRESERVE_MIN_MS + 250)
}

const getScrollPreserveNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now())
const suppressGeneralEditorPointerPreserve = () => { suppressGeneralEditorPointerPreserveUntil = getScrollPreserveNow() + 120 }
const isGeneralEditorPointerPreserveSuppressed = () => getScrollPreserveNow() < suppressGeneralEditorPointerPreserveUntil

export const markNextEditorPointerAfterCodeSelection = () => { preserveNextEditorPointerAfterCodeSelection = true; preserveNextEditorPointerAfterCodeSelectionReentryUntil = 0 }

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
  rect: Pick<DOMRect, "height" | "left" | "top" | "width">,
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
  anchoredTop: number,
  gutterBoundaryLeft = rect.left
): BlockHandleRailLayout => {
  const gutterLeft = gutterBoundaryLeft - railWidth - BLOCK_HANDLE_GUTTER_GAP_PX
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

const resolveBlockHandleGutterBoundaryLeft = (
  blockElement: HTMLElement | null | undefined
) => {
  if (!blockElement || typeof document === "undefined" || typeof NodeFilter === "undefined") return null
  if (!blockElement.matches("li, blockquote")) return null

  const walker = document.createTreeWalker(blockElement, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text
    const trimmed = textNode.data.trim()
    if (!trimmed) continue

    const textOffset = textNode.data.indexOf(trimmed)
    const range = document.createRange()
    range.setStart(textNode, textOffset)
    range.setEnd(textNode, textOffset + Math.min(trimmed.length, 6))
    const textRect = range.getBoundingClientRect()
    if (textRect.width <= 0 || textRect.height <= 0) return null

    const elementRect = blockElement.getBoundingClientRect()
    return Math.min(elementRect.left, textRect.left)
  }

  return null
}

const BLOCK_HANDLE_PROTECTED_SIBLING_WINDOW = 2

const isBlockHandleProtectedElement = (element: Element | null): element is HTMLElement =>
  typeof HTMLElement !== "undefined" && element instanceof HTMLElement && element.matches("li, blockquote")

const collectBlockHandleProtectedElements = (protectedAnchor?: HTMLElement | null) => {
  if (!protectedAnchor) return []

  const elements: HTMLElement[] = []
  const seen = new Set<HTMLElement>()
  const push = (element: Element | null) => {
    if (!isBlockHandleProtectedElement(element) || seen.has(element)) return
    seen.add(element)
    elements.push(element)
  }
  const pushDescendants = (element: Element | null, edge: "all" | "end" | "start") => {
    if (!(element instanceof HTMLElement) || element.matches("li, blockquote")) return

    const descendants = Array.from(element.children).flatMap((child) => {
      if (isBlockHandleProtectedElement(child)) return [child]
      if (!(child instanceof HTMLElement) || !child.matches("ul, ol")) return []
      return Array.from(child.children).filter(isBlockHandleProtectedElement)
    })
    const boundedDescendants =
      edge === "end"
        ? descendants.slice(-BLOCK_HANDLE_PROTECTED_SIBLING_WINDOW)
        : edge === "start"
          ? descendants.slice(0, BLOCK_HANDLE_PROTECTED_SIBLING_WINDOW)
          : descendants.slice(0, BLOCK_HANDLE_PROTECTED_SIBLING_WINDOW * 2 + 1)
    boundedDescendants.forEach(push)
  }
  const pushCandidate = (element: Element | null, edge: "all" | "end" | "start" = "all") => {
    push(element)
    pushDescendants(element, edge)
  }

  pushCandidate(protectedAnchor)

  let previousSibling = protectedAnchor.previousElementSibling
  let nextSibling = protectedAnchor.nextElementSibling
  for (let index = 0; index < BLOCK_HANDLE_PROTECTED_SIBLING_WINDOW; index += 1) {
    pushCandidate(previousSibling, "end")
    pushCandidate(nextSibling, "start")
    previousSibling = previousSibling?.previousElementSibling ?? null
    nextSibling = nextSibling?.nextElementSibling ?? null
  }

  return elements
}

const collectBlockHandleProtectedRects = (
  protectedAnchor: HTMLElement | null | undefined
): BlockHandleProtectedRect[] => {
  if (!protectedAnchor || typeof document === "undefined" || typeof NodeFilter === "undefined") return []

  return collectBlockHandleProtectedElements(protectedAnchor).flatMap((element) => {
    const boundaryLeft = resolveBlockHandleGutterBoundaryLeft(element)
    if (boundaryLeft === null) return []

    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text
      const trimmed = textNode.data.trim()
      if (!trimmed) continue

      const textOffset = textNode.data.indexOf(trimmed)
      const range = document.createRange()
      range.setStart(textNode, textOffset)
      range.setEnd(textNode, textOffset + Math.min(trimmed.length, 6))
      const textRect = range.getBoundingClientRect()
      if (textRect.width <= 0 || textRect.height <= 0) return []

      return [
        {
          bottom: textRect.bottom,
          left: boundaryLeft,
          right: textRect.left,
          top: textRect.top,
        },
        {
          bottom: textRect.bottom,
          left: textRect.left,
          right: textRect.right,
          top: textRect.top,
        },
      ]
    }

    return []
  })
}

const resolvePrefixSafeBlockHandleRailLayout = (
  railLayout: BlockHandleRailLayout,
  railWidth: number,
  railHeight: number,
  protectedRoot?: HTMLElement | null
): BlockHandleRailLayout => {
  if (typeof window === "undefined") return railLayout

  const protectedRects = collectBlockHandleProtectedRects(protectedRoot).filter(
    (protectedRect) =>
      protectedRect.bottom >= -railHeight &&
      protectedRect.top <= window.innerHeight + railHeight &&
      railLayout.left < protectedRect.right &&
      railLayout.left + railWidth > protectedRect.left
  )
  if (!protectedRects.length) return railLayout

  const hasCollision = (top: number) =>
    protectedRects.some(
      (protectedRect) =>
        top < protectedRect.bottom &&
        top + railHeight > protectedRect.top
    )
  if (!hasCollision(railLayout.top)) return railLayout

  const minTop = BLOCK_HANDLE_VIEWPORT_PADDING_PX
  const maxTop = Math.max(minTop, window.innerHeight - railHeight - BLOCK_HANDLE_VIEWPORT_PADDING_PX)
  const clampTop = (top: number) => Math.min(Math.max(minTop, top), maxTop)
  const candidates = new Set<number>()
  protectedRects.forEach((protectedRect) => {
    candidates.add(clampTop(protectedRect.top - railHeight - BLOCK_HANDLE_STACKED_GAP_PX))
    candidates.add(clampTop(protectedRect.bottom + BLOCK_HANDLE_STACKED_GAP_PX))
  })

  const safeTop = Array.from(candidates)
    .sort((a, b) => Math.abs(a - railLayout.top) - Math.abs(b - railLayout.top) || a - b)
    .find((top) => !hasCollision(top))

  return typeof safeTop === "number" ? { ...railLayout, top: safeTop } : railLayout
}

export const resolveBlockHandleRailLayoutForSurface = (
  rect: DOMRect,
  railWidth: number,
  railHeight: number,
  anchoredTop: number,
  surfaceRect: BlockChromeSurfaceRect,
  mode: BlockChromePositionMode,
  gutterBoundaryElement?: HTMLElement | null
): BlockHandleRailLayout => {
  const railLayout = resolvePrefixSafeBlockHandleRailLayout(
    resolveBlockHandleRailLayout(
      rect,
      railWidth,
      railHeight,
      anchoredTop,
      resolveBlockHandleGutterBoundaryLeft(gutterBoundaryElement) ?? rect.left
    ),
    railWidth,
    railHeight,
    gutterBoundaryElement
  )
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
  cancelOnPointerMove = true,
  cancelOnPointerDown = true,
  cancelOnPointerUp = false,
  cancelOnTextSelectionChangeRequiresText = false,
  shouldCancelBeforeRestore?: () => boolean,
  cancelOnTextSelectionChangeAfterMs = Number.POSITIVE_INFINITY
) => {
  if (typeof window === "undefined" || typeof document === "undefined") return
  const scrollingElement = document.scrollingElement
  return preserveWindowScrollPositionAcrossFrames(
    { x: window.scrollX, y: scrollingElement?.scrollTop ?? window.scrollY },
    frames,
    tolerance,
    minDurationMs,
    cancelOnTextSelectionChange,
    cancelOnPointerMove,
    cancelOnPointerDown,
    cancelOnPointerUp,
    cancelOnTextSelectionChangeRequiresText,
    shouldCancelBeforeRestore,
    true,
    cancelOnTextSelectionChangeAfterMs
  )
}

export const preserveWindowScrollPositionAcrossFrames = (
  anchor: WindowScrollAnchor,
  frames = 6,
  tolerance = 4,
  minDurationMs = 0,
  cancelOnTextSelectionChange = false,
  cancelOnPointerMove = true,
  cancelOnPointerDown = true,
  cancelOnPointerUp = false,
  cancelOnTextSelectionChangeRequiresText = false,
  shouldCancelBeforeRestore?: () => boolean,
  replaceActivePreserve = false,
  cancelOnTextSelectionChangeAfterMs = Number.POSITIVE_INFINITY,
  preserveOwner: string | null = null,
  deferPointerDownCancel = false
) => {
  if (typeof window === "undefined" || typeof document === "undefined") return
  const scrollingElement = document.scrollingElement
  const startX = anchor.x, startY = anchor.y, startedAt = typeof performance !== "undefined" ? performance.now() : Date.now(), preserveGeneration = windowScrollPreserveGeneration
  let cancelled = false, frame = 0
  let deferredPointerDownCancelId: number | null = null
  const cancel = () => {
    cancelled = true
    cleanup()
  }
  const cancelIfRestoreIsNoLongerValid = () => {
    if (preserveGeneration !== windowScrollPreserveGeneration) { cancel(); return true }
    if (!shouldCancelBeforeRestore) return false
    let shouldCancel = false
    try {
      shouldCancel = shouldCancelBeforeRestore()
    } catch {
      shouldCancel = true
    }
    if (!shouldCancel) return false
    cancel()
    return true
  }
  const cancelForTextSelection = () => {
    if (!cancelOnTextSelectionChange) return
    if (!cancelOnTextSelectionChangeRequiresText) {
      cancel()
      return
    }
    const selection = window.getSelection()
    const hasTextSelection = selection && !selection.isCollapsed && selection.toString().trim()
    if (hasTextSelection || getScrollPreserveNow() - startedAt > cancelOnTextSelectionChangeAfterMs) {
      clearNextEditorPointerAfterTable()
      cancel()
    }
  }
  const restoreScrollPosition = () => {
    const currentY = scrollingElement?.scrollTop ?? window.scrollY
    if (Math.abs(window.scrollX - startX) > tolerance || Math.abs(currentY - startY) > tolerance) {
      window.scrollTo(startX, startY)
    }
  }
  const restoreOnScroll = () => {
    if (!cancelled && !cancelIfRestoreIsNoLongerValid()) restoreScrollPosition()
  }
  const cleanup = () => {
    window.removeEventListener("wheel", cancel, true)
    window.removeEventListener("scroll", restoreOnScroll, true)
    if (deferredPointerDownCancelId !== null) {
      window.clearTimeout(deferredPointerDownCancelId)
      deferredPointerDownCancelId = null
    }
    if (cancelOnPointerDown) {
      window.removeEventListener("pointerdown", cancel, true)
    }
    if (cancelOnPointerUp) {
      window.removeEventListener("pointerup", cancel, true)
      window.removeEventListener("pointercancel", cancel, true)
      window.removeEventListener("mouseup", cancel, true)
    }
    if (cancelOnPointerMove) {
      window.removeEventListener("pointermove", cancel, true)
      window.removeEventListener("mousemove", cancel, true)
      window.removeEventListener("touchmove", cancel, true)
    }
    window.removeEventListener("keydown", cancel, true)
    document.removeEventListener("selectionchange", cancelForTextSelection, true)
    if (replaceActivePreserve && activeWindowScrollPreserveCancel === cancel) {
      activeWindowScrollPreserveCancel = null
      setActiveWindowScrollPreserveOwner(null)
    }
  }
  if (replaceActivePreserve) {
    activeWindowScrollPreserveCancel?.()
    activeWindowScrollPreserveCancel = cancel
    setActiveWindowScrollPreserveOwner(preserveOwner)
  }
  window.addEventListener("wheel", cancel, { capture: true, passive: true, once: true })
  window.addEventListener("scroll", restoreOnScroll, { capture: true, passive: true })
  if (cancelOnPointerDown) {
    const attachPointerDownCancel = () => {
      deferredPointerDownCancelId = null
      if (!cancelled) {
        window.addEventListener("pointerdown", cancel, { capture: true, passive: true, once: true })
      }
    }
    if (deferPointerDownCancel) {
      deferredPointerDownCancelId = window.setTimeout(attachPointerDownCancel, 0)
    } else {
      attachPointerDownCancel()
    }
  }
  if (cancelOnPointerUp) {
    window.addEventListener("pointerup", cancel, { capture: true, passive: true, once: true })
    window.addEventListener("pointercancel", cancel, { capture: true, passive: true, once: true })
    window.addEventListener("mouseup", cancel, { capture: true, passive: true, once: true })
  }
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
    if (cancelIfRestoreIsNoLongerValid()) return
    restoreScrollPosition()
    frame += 1
    const elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt
    if (frame < frames || elapsedMs < minDurationMs) {
      window.requestAnimationFrame(restore)
    } else {
      cleanup()
    }
  }
  restore()
  return cancel
}

const EDITOR_POINTER_FOCUS_SCROLL_PRESERVE_FRAMES = 168
const EDITOR_POINTER_FOCUS_SCROLL_PRESERVE_MIN_MS = 2_800
const EDITOR_POINTER_TABLE_SELECT_ALL_SCROLL_PRESERVE_FRAMES = 24
const EDITOR_POINTER_TABLE_SELECT_ALL_SCROLL_PRESERVE_MIN_MS = 320
const EDITOR_POINTER_CODE_FOLLOW_UP_SCROLL_PRESERVE_FRAMES = 192
const EDITOR_POINTER_CODE_FOLLOW_UP_SCROLL_PRESERVE_MIN_MS = 3_200
const EDITOR_POINTER_CODE_FOLLOW_UP_REENTRY_MS = 160
const EDITOR_POINTER_TABLE_FOLLOW_UP_SCROLL_PRESERVE_FRAMES = 144
const EDITOR_POINTER_TABLE_FOLLOW_UP_SCROLL_PRESERVE_MIN_MS = 2_400
const EDITOR_POINTER_GENERAL_SCROLL_PRESERVE_FRAMES = 72, EDITOR_POINTER_GENERAL_SCROLL_PRESERVE_MAX_MS = 72, EDITOR_POINTER_SCROLL_PRESERVE_CANCEL_DISTANCE_PX = 3_200
const EDITOR_POINTER_SCROLL_PRESERVE_SELECTOR = "[data-testid='block-editor-prosemirror'], .ProseMirror"
const EDITOR_POINTER_SCROLL_CONTROL_SELECTOR =
  "button, input, textarea, select, summary, [role='button'], [contenteditable='false']"
const EDITOR_POINTER_SCROLL_RICH_BLOCK_SELECTOR = ".aq-code-shell, .aq-code-editor-content, [data-code-block-wrapper='true'], .aq-table-shell, .tableWrapper, table, [data-mermaid-block], .aq-mermaid-code-input, .aq-mermaid, .aq-mermaid-stage"
const shouldCancelEditorPointerScrollPreserve = (anchor: WindowScrollAnchor) => () => Math.abs(window.scrollX - anchor.x) > EDITOR_POINTER_SCROLL_PRESERVE_CANCEL_DISTANCE_PX || Math.abs((document.scrollingElement?.scrollTop ?? window.scrollY) - anchor.y) > EDITOR_POINTER_SCROLL_PRESERVE_CANCEL_DISTANCE_PX

export const preserveWindowScrollForRichBlockSelectAll = () => { const anchor = { x: window.scrollX, y: document.scrollingElement?.scrollTop ?? window.scrollY }; preserveWindowScrollPositionAcrossFrames(anchor, EDITOR_POINTER_FOCUS_SCROLL_PRESERVE_FRAMES, 4, EDITOR_POINTER_FOCUS_SCROLL_PRESERVE_MIN_MS, false, true, true, false, false, shouldCancelEditorPointerScrollPreserve(anchor), true) }

export const preserveWindowScrollForTableSelectAll = () => {
  const anchor = { x: window.scrollX, y: document.scrollingElement?.scrollTop ?? window.scrollY }
  preserveWindowScrollPositionAcrossFrames(anchor, EDITOR_POINTER_TABLE_SELECT_ALL_SCROLL_PRESERVE_FRAMES, 4, EDITOR_POINTER_TABLE_SELECT_ALL_SCROLL_PRESERVE_MIN_MS, false, true, true, true, true, shouldCancelEditorPointerScrollPreserve(anchor), true)
}

const preserveWindowScrollForTablePointerTextDrag = () => {
  // Keep collapsed click focus-reveal correction alive; real text drags cancel on selectionchange.
  const anchor = { x: window.scrollX, y: document.scrollingElement?.scrollTop ?? window.scrollY }
  trackTablePointerScrollPreserve(preserveWindowScrollPositionAcrossFrames(anchor, EDITOR_POINTER_FOCUS_SCROLL_PRESERVE_FRAMES, 4, EDITOR_POINTER_FOCUS_SCROLL_PRESERVE_MIN_MS, true, true, true, false, true, shouldCancelEditorPointerScrollPreserve(anchor), true, Number.POSITIVE_INFINITY, "table"))
}

const preserveWindowScrollForTableFollowUpPointer = () => {
  const anchor = { x: window.scrollX, y: document.scrollingElement?.scrollTop ?? window.scrollY }
  trackTablePointerScrollPreserve(preserveWindowScrollPositionAcrossFrames(anchor, EDITOR_POINTER_TABLE_FOLLOW_UP_SCROLL_PRESERVE_FRAMES, 4, EDITOR_POINTER_TABLE_FOLLOW_UP_SCROLL_PRESERVE_MIN_MS, true, true, true, false, true, shouldCancelEditorPointerScrollPreserve(anchor), true, Number.POSITIVE_INFINITY, "table"))
}

export const preserveWindowScrollForCodePointerFocus = (cancelOnPointerDown = false) => {
  const anchor = { x: window.scrollX, y: document.scrollingElement?.scrollTop ?? window.scrollY }
  preserveWindowScrollPositionAcrossFrames(anchor, EDITOR_POINTER_CODE_FOLLOW_UP_SCROLL_PRESERVE_FRAMES, 4, EDITOR_POINTER_CODE_FOLLOW_UP_SCROLL_PRESERVE_MIN_MS, false, false, cancelOnPointerDown, false, false, shouldCancelEditorPointerScrollPreserve(anchor), true, Number.POSITIVE_INFINITY, "code", cancelOnPointerDown)
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
  const shouldPreserveTableBlockSelectionPointer = tablePointerTarget && blockSelectionActive
  const shouldPreserveGeneralEditorPointer =
    editorPointerTarget && !editorRichBlockTarget && !editorControlTarget
  const codeSelectionFollowUpReentryActive = getScrollPreserveNow() < preserveNextEditorPointerAfterCodeSelectionReentryUntil
  const shouldPreserveCodeSelectionFollowUp =
    editorPointerTarget &&
    !editorControlTarget &&
    (preserveNextEditorPointerAfterCodeSelection || codeSelectionFollowUpReentryActive)
  const shouldPreserveFollowUp = !tablePointerTarget && preserveNextEditorPointerAfterTable
  if (shouldPreserveCodeSelectionFollowUp) {
    preserveNextEditorPointerAfterCodeSelection = false
    preserveNextEditorPointerAfterCodeSelectionReentryUntil =
      getScrollPreserveNow() + EDITOR_POINTER_CODE_FOLLOW_UP_REENTRY_MS
  }
  if (tablePointerTarget) {
    markNextEditorPointerAfterTable()
  } else if (shouldPreserveFollowUp) {
    preserveNextEditorPointerAfterTable = false
  }
  if (shouldPreserveCodeSelectionFollowUp && !tablePointerTarget) {
    suppressGeneralEditorPointerPreserve()
    preserveWindowScrollForCodePointerFocus(true)
    return
  }
  if (shouldPreserveFollowUp) {
    suppressGeneralEditorPointerPreserve()
    preserveWindowScrollForTableFollowUpPointer()
    return
  }
  if (
    shouldPreserveRichEditorPointer ||
    shouldPreserveTableBlockSelectionPointer ||
    (tableSelectionActive && tablePointerTarget)
  ) {
    preserveWindowScrollForRichBlockSelectAll()
    return
  }
  if (tablePointerTarget) {
    preserveWindowScrollForTablePointerTextDrag()
    return
  }
  if (shouldPreserveGeneralEditorPointer && !isGeneralEditorPointerPreserveSuppressed()) {
    const startedAt = getScrollPreserveNow()
    const anchor = { x: window.scrollX, y: document.scrollingElement?.scrollTop ?? window.scrollY }
    preserveWindowScrollPositionAcrossFrames(anchor, EDITOR_POINTER_GENERAL_SCROLL_PRESERVE_FRAMES, 4, EDITOR_POINTER_GENERAL_SCROLL_PRESERVE_MAX_MS, true, false, true, false, true, () => shouldCancelEditorPointerScrollPreserve(anchor)() || getScrollPreserveNow() - startedAt > EDITOR_POINTER_GENERAL_SCROLL_PRESERVE_MAX_MS, true, 20)
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
