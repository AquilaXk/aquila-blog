import { acquireBodyScrollLock } from "src/libs/utils/bodyScrollLock"

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export const openMermaidOverlay = (
  svgMarkup: string,
  previousCleanup?: (() => void) | null
) => {
  if (typeof document === "undefined") return null

  previousCleanup?.()
  const previousFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null

  const overlay = document.createElement("div")
  overlay.setAttribute("data-aq-mermaid-overlay", "true")
  overlay.setAttribute("role", "dialog")
  overlay.setAttribute("aria-modal", "true")
  overlay.setAttribute("aria-label", "Mermaid 확대 보기")
  overlay.style.position = "fixed"
  overlay.style.inset = "0"
  overlay.style.zIndex = "180"
  overlay.style.background = "rgba(2, 6, 23, 0.7)"
  overlay.style.display = "grid"
  overlay.style.alignItems = "center"
  overlay.style.justifyItems = "center"
  overlay.style.padding =
    "max(0.9rem, env(safe-area-inset-top, 0px)) max(0.9rem, env(safe-area-inset-right, 0px)) max(0.9rem, env(safe-area-inset-bottom, 0px)) max(0.9rem, env(safe-area-inset-left, 0px))"

  const panel = document.createElement("div")
  panel.style.width = "min(96vw, 1280px)"
  panel.style.maxHeight = "min(90dvh, 820px)"
  panel.style.overflow = "auto"
  panel.style.borderRadius = "14px"
  panel.style.border = "1px solid rgba(255, 255, 255, 0.14)"
  panel.style.background = "rgba(11, 16, 23, 0.98)"
  panel.style.padding = "0.75rem"

  const closeButton = document.createElement("button")
  closeButton.type = "button"
  closeButton.textContent = "닫기"
  closeButton.style.display = "inline-flex"
  closeButton.style.alignItems = "center"
  closeButton.style.justifyContent = "center"
  closeButton.style.minHeight = "44px"
  closeButton.style.padding = "0 0.8rem"
  closeButton.style.borderRadius = "999px"
  closeButton.style.border = "1px solid rgba(255, 255, 255, 0.2)"
  closeButton.style.background = "rgba(15, 23, 42, 0.7)"
  closeButton.style.color = "#f3f4f6"
  closeButton.style.fontSize = "0.82rem"
  closeButton.style.fontWeight = "700"
  closeButton.style.marginLeft = "auto"
  closeButton.style.marginBottom = "0.56rem"
  closeButton.style.cursor = "pointer"

  const stage = document.createElement("div")
  stage.style.overflow = "auto"
  stage.style.setProperty("-webkit-overflow-scrolling", "touch")
  stage.innerHTML = svgMarkup
  const stageSvg = stage.querySelector("svg")
  if (stageSvg) {
    stageSvg.removeAttribute("width")
    stageSvg.removeAttribute("height")
    stageSvg.style.maxWidth = "none"
    stageSvg.style.width = "max-content"
    stageSvg.style.height = "auto"
    stageSvg.style.display = "block"
  }

  panel.appendChild(closeButton)
  panel.appendChild(stage)
  overlay.appendChild(panel)
  document.body.appendChild(overlay)

  const releaseBodyScrollLock = acquireBodyScrollLock()
  let closed = false
  let closeOverlay: () => void

  const handleOverlayKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault()
      closeOverlay()
      return
    }

    if (event.key !== "Tab") return

    const focusable = Array.from(overlay.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) =>
        !element.hasAttribute("disabled") &&
        element.tabIndex !== -1 &&
        element.offsetParent !== null
    )
    if (!focusable.length) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement as HTMLElement | null

    if (event.shiftKey) {
      if (!active || active === first || !overlay.contains(active)) {
        event.preventDefault()
        last.focus()
      }
      return
    }

    if (!active || active === last || !overlay.contains(active)) {
      event.preventDefault()
      first.focus()
    }
  }

  const handleOverlayClick = (event: MouseEvent) => {
    if (event.target === overlay) {
      closeOverlay()
    }
  }

  closeOverlay = () => {
    if (closed) return
    closed = true
    releaseBodyScrollLock()
    overlay.remove()
    document.removeEventListener("keydown", handleOverlayKeyDown)
    closeButton.removeEventListener("click", closeOverlay)
    overlay.removeEventListener("click", handleOverlayClick)
    if (previousFocusedElement?.isConnected) {
      previousFocusedElement.focus()
    }
  }

  closeButton.focus()
  overlay.addEventListener("click", handleOverlayClick)
  closeButton.addEventListener("click", closeOverlay)
  document.addEventListener("keydown", handleOverlayKeyDown)

  return closeOverlay
}
