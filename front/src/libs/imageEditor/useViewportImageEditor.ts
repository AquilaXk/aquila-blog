import { PointerEvent as ReactPointerEvent, RefObject, useCallback, useEffect, useRef, useState } from "react"

type ViewportTransform = {
  focusX: number
  focusY: number
  zoom: number
}

type PointerPosition = {
  clientX: number
  clientY: number
}

type DragState<T extends ViewportTransform> = {
  pointerId: number
  startClientX: number
  startClientY: number
  startTransform: T
}

type PinchState<T extends ViewportTransform> = {
  startDistance: number
  startCenterXRatio: number
  startCenterYRatio: number
  startTransform: T
}

type UseViewportImageEditorOptions<T extends ViewportTransform> = {
  frameRef: RefObject<HTMLDivElement | null>
  initialTransform: T
  enabled: boolean
  clampZoom: (zoom: number) => number
  normalizeTransform: (transform: T) => T
  computeAnchoredZoomTransform: (
    baseTransform: T,
    nextZoom: number,
    anchorXRatio: number,
    anchorYRatio: number
  ) => T
  computeDraggedTransform: (
    baseTransform: T,
    deltaXRatio: number,
    deltaYRatio: number
  ) => T
  onCommit: (transform: T) => void
}

const clampRatio = (value: number) => Math.min(1, Math.max(0, value))

const supportsPointerCapture = (
  target: EventTarget & HTMLDivElement,
  pointerId: number
): target is EventTarget & HTMLDivElement & { hasPointerCapture(id: number): boolean } => {
  return typeof target.hasPointerCapture === "function" && target.hasPointerCapture(pointerId)
}

const releasePointerCaptureSafely = (target: HTMLDivElement, pointerId: number) => {
  if (!supportsPointerCapture(target, pointerId)) return
  target.releasePointerCapture(pointerId)
}

const useViewportImageEditor = <T extends ViewportTransform>({
  frameRef,
  initialTransform,
  enabled,
  clampZoom,
  normalizeTransform,
  computeAnchoredZoomTransform,
  computeDraggedTransform,
  onCommit,
}: UseViewportImageEditorOptions<T>) => {
  const activePointersRef = useRef<Map<number, PointerPosition>>(new Map())
  const dragRef = useRef<DragState<T> | null>(null)
  const pinchRef = useRef<PinchState<T> | null>(null)
  const transformRef = useRef<T>(initialTransform)
  const transformRafRef = useRef<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const commitTransform = useCallback(
    (next: T) => {
      const normalized = normalizeTransform(next)
      transformRef.current = normalized
      onCommit(normalized)
    },
    [normalizeTransform, onCommit]
  )

  const scheduleTransform = useCallback(
    (next: T) => {
      transformRef.current = next
      if (transformRafRef.current !== null) return

      transformRafRef.current = window.requestAnimationFrame(() => {
        transformRafRef.current = null
        commitTransform(transformRef.current)
      })
    },
    [commitTransform]
  )

  const resetInteractions = useCallback(() => {
    activePointersRef.current.clear()
    dragRef.current = null
    pinchRef.current = null
    setIsDragging(false)
    if (transformRafRef.current !== null) {
      window.cancelAnimationFrame(transformRafRef.current)
      transformRafRef.current = null
    }
  }, [])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!enabled) return
      if (event.button !== 0) return

      event.preventDefault()
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // 일부 브라우저는 포인터 캡처가 실패할 수 있다.
      }

      activePointersRef.current.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      })

      if (activePointersRef.current.size === 1) {
        dragRef.current = {
          pointerId: event.pointerId,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startTransform: transformRef.current,
        }
        setIsDragging(true)
        return
      }

      if (activePointersRef.current.size < 2) return

      const [firstPointer, secondPointer] = Array.from(activePointersRef.current.values())
      const distance = Math.hypot(
        secondPointer.clientX - firstPointer.clientX,
        secondPointer.clientY - firstPointer.clientY
      )
      if (distance <= 0) return

      const frameRect = event.currentTarget.getBoundingClientRect()
      const centerXRatio =
        frameRect.width > 0
          ? ((firstPointer.clientX + secondPointer.clientX) / 2 - frameRect.left) / frameRect.width
          : 0.5
      const centerYRatio =
        frameRect.height > 0
          ? ((firstPointer.clientY + secondPointer.clientY) / 2 - frameRect.top) / frameRect.height
          : 0.5

      pinchRef.current = {
        startDistance: distance,
        startCenterXRatio: clampRatio(centerXRatio),
        startCenterYRatio: clampRatio(centerYRatio),
        startTransform: transformRef.current,
      }
      dragRef.current = null
      setIsDragging(false)
    },
    [enabled]
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!enabled) return

      event.preventDefault()
      if (activePointersRef.current.has(event.pointerId)) {
        activePointersRef.current.set(event.pointerId, {
          clientX: event.clientX,
          clientY: event.clientY,
        })
      }

      const rect = event.currentTarget.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return

      const pinchState = pinchRef.current
      if (pinchState && activePointersRef.current.size >= 2) {
        const [firstPointer, secondPointer] = Array.from(activePointersRef.current.values())
        const distance = Math.hypot(
          secondPointer.clientX - firstPointer.clientX,
          secondPointer.clientY - firstPointer.clientY
        )
        if (distance > 0) {
          const zoomFactor = distance / pinchState.startDistance
          const nextZoom = clampZoom(pinchState.startTransform.zoom * zoomFactor)
          let nextTransform = computeAnchoredZoomTransform(
            pinchState.startTransform,
            nextZoom,
            pinchState.startCenterXRatio,
            pinchState.startCenterYRatio
          )
          const currentCenterXRatio = ((firstPointer.clientX + secondPointer.clientX) / 2 - rect.left) / rect.width
          const currentCenterYRatio = ((firstPointer.clientY + secondPointer.clientY) / 2 - rect.top) / rect.height
          nextTransform = {
            ...nextTransform,
            focusX:
              nextTransform.focusX + (currentCenterXRatio - pinchState.startCenterXRatio) * 100,
            focusY:
              nextTransform.focusY + (currentCenterYRatio - pinchState.startCenterYRatio) * 100,
          }
          scheduleTransform(nextTransform)
        }
        return
      }

      const dragState = dragRef.current
      if (!dragState || dragState.pointerId !== event.pointerId) return

      const deltaXRatio = (event.clientX - dragState.startClientX) / rect.width
      const deltaYRatio = (event.clientY - dragState.startClientY) / rect.height
      scheduleTransform(computeDraggedTransform(dragState.startTransform, deltaXRatio, deltaYRatio))
    },
    [clampZoom, computeAnchoredZoomTransform, computeDraggedTransform, enabled, scheduleTransform]
  )

  const finalizePointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(event.pointerId)
    releasePointerCaptureSafely(event.currentTarget, event.pointerId)

    const dragState = dragRef.current
    if (dragState && dragState.pointerId === event.pointerId) {
      dragRef.current = null
    }

    if (activePointersRef.current.size >= 2) {
      const [firstPointer, secondPointer] = Array.from(activePointersRef.current.values())
      const rect = event.currentTarget.getBoundingClientRect()
      const distance = Math.hypot(
        secondPointer.clientX - firstPointer.clientX,
        secondPointer.clientY - firstPointer.clientY
      )
      if (distance > 0 && rect.width > 0 && rect.height > 0) {
        pinchRef.current = {
          startDistance: distance,
          startCenterXRatio: ((firstPointer.clientX + secondPointer.clientX) / 2 - rect.left) / rect.width,
          startCenterYRatio: ((firstPointer.clientY + secondPointer.clientY) / 2 - rect.top) / rect.height,
          startTransform: transformRef.current,
        }
      }
      setIsDragging(false)
      return
    }

    pinchRef.current = null

    if (activePointersRef.current.size === 1) {
      const [remainingPointerId, remainingPointer] = Array.from(activePointersRef.current.entries())[0]
      dragRef.current = {
        pointerId: remainingPointerId,
        startClientX: remainingPointer.clientX,
        startClientY: remainingPointer.clientY,
        startTransform: transformRef.current,
      }
      setIsDragging(true)
      return
    }

    setIsDragging(false)
  }, [])

  useEffect(() => {
    if (!enabled) {
      resetInteractions()
    }
  }, [enabled, resetInteractions])

  useEffect(() => {
    transformRef.current = initialTransform
  }, [initialTransform])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame || !enabled) return

    const handleWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault()
      const rect = frame.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return

      const current = transformRef.current
      const delta = event.deltaY < 0 ? 0.08 : -0.08
      const nextZoom = clampZoom(current.zoom + delta)
      if (nextZoom === current.zoom) return

      const anchorXRatio = clampRatio((event.clientX - rect.left) / rect.width)
      const anchorYRatio = clampRatio((event.clientY - rect.top) / rect.height)
      const nextTransform = computeAnchoredZoomTransform(current, nextZoom, anchorXRatio, anchorYRatio)
      scheduleTransform(nextTransform)
    }

    frame.addEventListener("wheel", handleWheel, { passive: false })
    return () => frame.removeEventListener("wheel", handleWheel)
  }, [clampZoom, computeAnchoredZoomTransform, enabled, frameRef, scheduleTransform])

  useEffect(
    () => () => {
      if (transformRafRef.current !== null) {
        window.cancelAnimationFrame(transformRafRef.current)
      }
    },
    []
  )

  return {
    commitTransform,
    handlePointerDown,
    handlePointerMove,
    finalizePointer,
    isDragging,
    resetInteractions,
    scheduleTransform,
    transformRef,
  }
}

export default useViewportImageEditor
