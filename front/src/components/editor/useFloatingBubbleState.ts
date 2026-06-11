import { useCallback, useEffect, useRef, useState } from "react"

export type FloatingBubbleState = {
  visible: boolean
  mode: "text" | "image"
  anchor: "center" | "left"
  placement: "above" | "below" | "side"
  left: number
  top: number
}

type FloatingBubbleCoords = {
  bottom: number
  left: number
  right: number
  top: number
}

export const FLOATING_BUBBLE_HIDE_DELAY_MS = 220

export const INITIAL_FLOATING_BUBBLE_STATE: FloatingBubbleState = {
  visible: false,
  mode: "text",
  anchor: "center",
  placement: "above",
  left: 0,
  top: 0,
}

export const resolveFloatingBubbleStateFromCoords = (
  mode: FloatingBubbleState["mode"],
  startCoords: FloatingBubbleCoords,
  endCoords: FloatingBubbleCoords
): FloatingBubbleState => ({
  visible: true,
  mode,
  anchor: "center",
  placement: "above",
  left: Math.round((startCoords.left + endCoords.right) / 2),
  top: Math.round(Math.min(startCoords.top, endCoords.top)),
})

export const areFloatingBubbleStatesEqual = (
  left: FloatingBubbleState,
  right: FloatingBubbleState
) =>
  left.visible === right.visible &&
  left.mode === right.mode &&
  left.anchor === right.anchor &&
  left.placement === right.placement &&
  left.left === right.left &&
  left.top === right.top

export const hideFloatingBubbleState = (state: FloatingBubbleState) =>
  state.visible ? { ...state, visible: false } : state

const HEADING_SELECTION_SELECTOR = "h1, h2, h3, h4, h5, h6"
const TEXT_BUBBLE_OCCLUSION_SELECTOR = "p, h1, h2, h3, h4, h5, h6, blockquote, li, th, td, pre"
const TEXT_BUBBLE_COLLISION_GAP_PX = 10
const TEXT_BUBBLE_ESTIMATED_HEIGHT_PX = 50
const TEXT_BUBBLE_ESTIMATED_WIDTH_PX = 340
const TEXT_BUBBLE_VIEWPORT_PADDING_PX = 12
const MAX_TEXT_BUBBLE_OCCLUSION_CANDIDATES = 16
const resolveSelectionElement = (node: Node | null | undefined) => node instanceof Element ? node : node?.parentElement ?? null

const clampTextBubbleViewport = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const isUsableTextBubbleRect = (rect: DOMRect | ClientRect) =>
  Number.isFinite(rect.top) && rect.width > 0 && rect.height > 0

const resolveVisibleSelectionAnchorRect = (range: Range) => {
  const rangeRects = Array.from(range.getClientRects()).filter(isUsableTextBubbleRect)
  const viewportBottom = window.innerHeight - TEXT_BUBBLE_VIEWPORT_PADDING_PX
  const visibleRects = rangeRects.filter(
    (rect) =>
      rect.bottom >= TEXT_BUBBLE_VIEWPORT_PADDING_PX &&
      rect.top <= viewportBottom
  )
  const anchorRect = visibleRects[0] ?? rangeRects[0] ?? range.getBoundingClientRect()
  return isUsableTextBubbleRect(anchorRect) ? anchorRect : null
}

const addTextBubbleOcclusionCandidate = (
  candidates: Set<HTMLElement>,
  candidate: Element | null | undefined,
  editorRoot: HTMLElement,
  selectedContainers: Element[]
) => {
  if (!(candidate instanceof HTMLElement)) return
  if (!editorRoot.contains(candidate)) return
  if (!candidate.matches(TEXT_BUBBLE_OCCLUSION_SELECTOR)) return
  if (selectedContainers.some((selected) => candidate.contains(selected))) return
  if (candidates.size >= MAX_TEXT_BUBBLE_OCCLUSION_CANDIDATES) return
  candidates.add(candidate)
}

const collectTextBubbleOcclusionCandidates = (
  editorRoot: HTMLElement,
  selectedContainers: Element[]
) => {
  const candidates = new Set<HTMLElement>()
  selectedContainers.forEach((selected) => {
    const readable = selected.closest(TEXT_BUBBLE_OCCLUSION_SELECTOR)
    addTextBubbleOcclusionCandidate(candidates, readable?.previousElementSibling, editorRoot, selectedContainers)
    addTextBubbleOcclusionCandidate(candidates, readable?.nextElementSibling, editorRoot, selectedContainers)
    addTextBubbleOcclusionCandidate(candidates, readable?.parentElement, editorRoot, selectedContainers)

    let previous = readable?.previousElementSibling ?? null
    let next = readable?.nextElementSibling ?? null
    while (candidates.size < MAX_TEXT_BUBBLE_OCCLUSION_CANDIDATES && (previous || next)) {
      addTextBubbleOcclusionCandidate(candidates, previous, editorRoot, selectedContainers)
      addTextBubbleOcclusionCandidate(candidates, next, editorRoot, selectedContainers)
      previous = previous?.previousElementSibling ?? null
      next = next?.nextElementSibling ?? null
    }
  })
  return Array.from(candidates)
}

export const hasNativeEditorTextSelection = (editorRoot: HTMLElement) => {
  const selection = typeof window !== "undefined" ? window.getSelection() : null
  const anchorElement = resolveSelectionElement(selection?.anchorNode)
  const focusElement = resolveSelectionElement(selection?.focusNode)
  return Boolean(selection?.toString().trim() && anchorElement && focusElement && editorRoot.contains(anchorElement) && editorRoot.contains(focusElement))
}

export const resolveHeadingSelectionBubbleState = (state: FloatingBubbleState, editorRoot: HTMLElement) => {
  if (state.mode !== "text") return state
  const selection = typeof window !== "undefined" ? window.getSelection() : null
  if (!selection || selection.isCollapsed || !selection.toString().trim()) return state
  const anchorHeading = resolveSelectionElement(selection.anchorNode)?.closest<HTMLElement>(HEADING_SELECTION_SELECTOR)
  const focusHeading = resolveSelectionElement(selection.focusNode)?.closest<HTMLElement>(HEADING_SELECTION_SELECTOR)
  if (!anchorHeading || anchorHeading !== focusHeading || !editorRoot.contains(anchorHeading)) return state
  const headingRect = anchorHeading.getBoundingClientRect()
  if (!Number.isFinite(headingRect.left) || headingRect.width <= 0) return state
  return { ...state, anchor: "left" as const, left: Math.max(12, Math.round(headingRect.left)) }
}

export const resolveOcclusionAwareTextBubbleState = (state: FloatingBubbleState, editorRoot: HTMLElement) => {
  if (state.mode !== "text" || state.placement !== "above") return state
  if (typeof window === "undefined") return state
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || !selection.toString().trim() || selection.rangeCount === 0) return state
  const range = selection.getRangeAt(0)
  const selectionRect = resolveVisibleSelectionAnchorRect(range)
  if (!selectionRect) return state
  if (!Number.isFinite(selectionRect.top) || selectionRect.width <= 0 || selectionRect.height <= 0) return state

  const anchorElement = resolveSelectionElement(selection.anchorNode)
  const focusElement = resolveSelectionElement(selection.focusNode)
  const selectedContainers = [anchorElement, focusElement].filter(Boolean) as Element[]
  const toolbarTop =
    Math.min(selectionRect.top, state.top) - TEXT_BUBBLE_ESTIMATED_HEIGHT_PX - TEXT_BUBBLE_COLLISION_GAP_PX
  const toolbarBottom = Math.min(selectionRect.top, state.top) - TEXT_BUBBLE_COLLISION_GAP_PX
  const collidesWithReadableContent = collectTextBubbleOcclusionCandidates(
    editorRoot,
    selectedContainers
  ).some((candidate) => {
    const rect = candidate.getBoundingClientRect()
    if (!Number.isFinite(rect.top) || rect.width <= 0 || rect.height <= 0) return false
    const overlapsToolbarY = rect.bottom > toolbarTop && rect.top < toolbarBottom
    const overlapsSelectionX = rect.right > selectionRect.left - 8 && rect.left < selectionRect.right + 8
    return overlapsToolbarY && overlapsSelectionX
  })

  if (!collidesWithReadableContent) return state

  const sideLeft = Math.round(selectionRect.right)
  const sideTop = clampTextBubbleViewport(
    Math.round(selectionRect.top + selectionRect.height / 2),
    TEXT_BUBBLE_VIEWPORT_PADDING_PX,
    window.innerHeight - TEXT_BUBBLE_VIEWPORT_PADDING_PX
  )
  const sideFits =
    sideLeft + TEXT_BUBBLE_COLLISION_GAP_PX + TEXT_BUBBLE_ESTIMATED_WIDTH_PX <=
    window.innerWidth - TEXT_BUBBLE_VIEWPORT_PADDING_PX

  if (sideFits) {
    return {
      ...state,
      anchor: "left" as const,
      placement: "side" as const,
      left: Math.max(TEXT_BUBBLE_VIEWPORT_PADDING_PX, sideLeft),
      top: sideTop,
    }
  }

  return {
    ...state,
    placement: "below" as const,
    top: clampTextBubbleViewport(
      Math.round(selectionRect.bottom + TEXT_BUBBLE_COLLISION_GAP_PX),
      TEXT_BUBBLE_VIEWPORT_PADDING_PX,
      window.innerHeight - TEXT_BUBBLE_VIEWPORT_PADDING_PX
    ),
  }
}

export const useFloatingBubbleState = () => {
  const [bubbleState, setBubbleState] = useState<FloatingBubbleState>(
    INITIAL_FLOATING_BUBBLE_STATE
  )
  const bubbleHideTimerRef = useRef<number | null>(null)
  const bubbleToolbarHoveredRef = useRef(false)

  const cancelBubbleHide = useCallback(() => {
    if (bubbleHideTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(bubbleHideTimerRef.current)
      bubbleHideTimerRef.current = null
    }
  }, [])

  const scheduleBubbleHide = useCallback(
    (delayMs = FLOATING_BUBBLE_HIDE_DELAY_MS) => {
      cancelBubbleHide()
      if (typeof window === "undefined") return
      bubbleHideTimerRef.current = window.setTimeout(() => {
        if (!bubbleToolbarHoveredRef.current) {
          setBubbleState((prev) => ({ ...prev, visible: false }))
        }
        bubbleHideTimerRef.current = null
      }, delayMs)
    },
    [cancelBubbleHide]
  )

  useEffect(() => () => cancelBubbleHide(), [cancelBubbleHide])

  return {
    bubbleState,
    setBubbleState,
    bubbleToolbarHoveredRef,
    cancelBubbleHide,
    scheduleBubbleHide,
  }
}
