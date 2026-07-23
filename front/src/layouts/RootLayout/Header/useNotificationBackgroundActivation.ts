import { useEffect } from "react"

type UseNotificationBackgroundActivationParams = {
  enabled: boolean
  isDocumentVisible: boolean
  isRealtimeActive: boolean
  notificationAccessState: "pending" | "ready" | "blocked"
  open: boolean
  pathname: string
  loadSnapshot: () => Promise<unknown>
  setIsRealtimeActive: (active: boolean) => void
}

export const shouldDeferNotificationBackgroundActivation = (pathname: string, open: boolean) =>
  pathname === "/admin/cloud" && !open

export const useNotificationBackgroundActivation = ({
  enabled,
  isDocumentVisible,
  isRealtimeActive,
  notificationAccessState,
  open,
  pathname,
  loadSnapshot,
  setIsRealtimeActive,
}: UseNotificationBackgroundActivationParams) => {
  useEffect(() => {
    if (typeof window === "undefined") return
    if (
      !enabled ||
      isRealtimeActive ||
      shouldDeferNotificationBackgroundActivation(pathname, open) ||
      !isDocumentVisible ||
      notificationAccessState === "blocked"
    ) {
      return
    }

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
      cancelIdleCallback?: (handle: number) => void
    }
    let disposed = false
    let fallbackTimer: number | null = null
    let idleHandle: number | null = null

    const activateRealtime = () => {
      if (disposed) return
      setIsRealtimeActive(true)
      void loadSnapshot()
    }

    if (typeof idleWindow.requestIdleCallback === "function") {
      idleHandle = idleWindow.requestIdleCallback(activateRealtime, { timeout: 4000 })
    } else {
      fallbackTimer = window.setTimeout(activateRealtime, 2400)
    }

    return () => {
      disposed = true
      if (idleHandle !== null && typeof idleWindow.cancelIdleCallback === "function") {
        idleWindow.cancelIdleCallback(idleHandle)
      }
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer)
      }
    }
  }, [
    enabled,
    isDocumentVisible,
    isRealtimeActive,
    loadSnapshot,
    notificationAccessState,
    open,
    pathname,
    setIsRealtimeActive,
  ])
}
