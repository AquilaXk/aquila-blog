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
