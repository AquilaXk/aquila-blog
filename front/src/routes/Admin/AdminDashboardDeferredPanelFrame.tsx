import { useEffect, useRef, useState } from "react"
import { PanelFrame } from "src/routes/Admin/AdminDashboardWorkspace.styles"

export const DASHBOARD_PANEL_STAGGER_MS = 640

const DASHBOARD_INTERSECTION_ROOT_MARGIN = "0px"
const DASHBOARD_IDLE_ACTIVATION_TIMEOUT_MS = 1400
let dashboardPanelActivationCursor = 0

const reserveDashboardPanelActivationDelay = (delayMs: number) => {
  if (typeof performance === "undefined") return Math.max(0, delayMs)
  const now = performance.now()
  const requestedAt = now + Math.max(0, delayMs)
  const scheduledAt = Math.max(requestedAt, dashboardPanelActivationCursor)
  dashboardPanelActivationCursor = scheduledAt + DASHBOARD_PANEL_STAGGER_MS
  return Math.max(0, Math.round(scheduledAt - now))
}

export const DeferredPanelFrame: React.FC<{
  eager?: boolean
  activationDelayMs?: number
  src: string
  title: string
}> = ({ eager = false, activationDelayMs = 0, src, title }) => {
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const [isActivated, setIsActivated] = useState(eager)

  useEffect(() => {
    if (isActivated || !src || typeof window === "undefined") return

    let observer: IntersectionObserver | null = null
    let activationDelayId: number | null = null
    let idleId: number | null = null
    let activationQueued = false
    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: {
          timeout?: number
        }
      ) => number
      cancelIdleCallback?: (id: number) => void
    }

    const activate = () => {
      setIsActivated(true)
    }

    const queueIdleActivation = () => {
      if (typeof idleWindow.requestIdleCallback === "function") {
        idleId = idleWindow.requestIdleCallback(activate, { timeout: DASHBOARD_IDLE_ACTIVATION_TIMEOUT_MS })
        return
      }
      activate()
    }

    const scheduleActivation = (delayMs: number) => {
      if (activationQueued) return
      activationQueued = true
      const nextDelayMs = eager ? 0 : reserveDashboardPanelActivationDelay(delayMs)
      if (nextDelayMs <= 0) {
        queueIdleActivation()
        return
      }
      activationDelayId = window.setTimeout(queueIdleActivation, nextDelayMs)
    }

    if (anchorRef.current && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return
          scheduleActivation(activationDelayMs)
          observer?.disconnect()
        },
        { root: null, rootMargin: DASHBOARD_INTERSECTION_ROOT_MARGIN }
      )
      observer.observe(anchorRef.current)
    }

    return () => {
      observer?.disconnect()
      if (idleId !== null && typeof idleWindow.cancelIdleCallback === "function") {
        idleWindow.cancelIdleCallback(idleId)
      }
      if (activationDelayId !== null) {
        window.clearTimeout(activationDelayId)
      }
    }
  }, [activationDelayMs, eager, isActivated, src])

  return (
    <div ref={anchorRef}>
      {isActivated ? (
        <PanelFrame src={src} title={title} loading={eager ? "eager" : "lazy"} referrerPolicy="no-referrer" />
      ) : (
        <PanelFrame as="div" aria-hidden="true" data-pending="true" />
      )}
    </div>
  )
}
