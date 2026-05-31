import { useCallback, useEffect, useRef, useState } from "react"

export type FloatingBubbleState = {
  visible: boolean
  mode: "text" | "image"
  anchor: "center" | "left"
  left: number
  top: number
}

type FloatingBubbleCoords = {
  left: number
  right: number
  top: number
}

export const FLOATING_BUBBLE_HIDE_DELAY_MS = 220

export const INITIAL_FLOATING_BUBBLE_STATE: FloatingBubbleState = {
  visible: false,
  mode: "text",
  anchor: "center",
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
  left.left === right.left &&
  left.top === right.top

export const hideFloatingBubbleState = (state: FloatingBubbleState) =>
  state.visible ? { ...state, visible: false } : state

const HEADING_SELECTION_SELECTOR = "h1, h2, h3, h4, h5, h6"
const resolveSelectionElement = (node: Node | null | undefined) => node instanceof Element ? node : node?.parentElement ?? null

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
