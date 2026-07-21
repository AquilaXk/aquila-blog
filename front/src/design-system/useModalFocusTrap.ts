import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react"

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const canRestoreFocus = (element: HTMLElement) => {
  if (!element.isConnected) return false
  if (element.matches(":disabled") || element.getAttribute("aria-disabled") === "true") return false
  return element.matches(FOCUSABLE_SELECTOR)
}

const restoreFocus = (element: HTMLElement | null) => {
  if (!element || !canRestoreFocus(element)) return
  element.focus({ preventScroll: true })
}

type UseModalFocusTrapOptions = {
  open: boolean
  onClose: () => void
  containerRef: RefObject<HTMLElement | null>
  initialFocusRef?: RefObject<HTMLElement | null>
  /** Nested dialog open: keep trigger restore deferred, pause Esc/Tab trap. */
  paused?: boolean
}

export const useModalFocusTrap = ({
  open,
  onClose,
  containerRef,
  initialFocusRef,
  paused = false,
}: UseModalFocusTrapOptions) => {
  const triggerRef = useRef<HTMLElement | null>(null)
  const pausedRef = useRef(paused)
  const trapActive = open && !paused

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    if (!open) return

    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

    const raf = window.requestAnimationFrame(() => {
      if (pausedRef.current) return
      const initialTarget =
        initialFocusRef?.current ??
        containerRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      initialTarget?.focus()
    })

    return () => {
      window.cancelAnimationFrame(raf)
      const trigger = triggerRef.current
      window.requestAnimationFrame(() => {
        restoreFocus(trigger)
      })
    }
  }, [open, containerRef, initialFocusRef])

  useEffect(() => {
    if (!trapActive) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      onClose()
    }

    window.addEventListener("keydown", handleEscape)
    return () => window.removeEventListener("keydown", handleEscape)
  }, [trapActive, onClose])

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (!trapActive || event.key !== "Tab") return

      const container = containerRef.current
      if (!container) return

      const focusableElements = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((element) => !element.hasAttribute("disabled") && element.tabIndex !== -1)

      if (focusableElements.length === 0) {
        event.preventDefault()
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
        return
      }

      if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    },
    [containerRef, trapActive]
  )

  return { handleKeyDown }
}
