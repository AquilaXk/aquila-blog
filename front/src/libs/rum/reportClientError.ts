export type ClientErrorBoundaryKind = "global" | "surface"

export type ClientErrorSurface = "app" | "markdown" | "editor"

export type ClientErrorReport = {
  id: string
  boundary: ClientErrorBoundaryKind
  surface: ClientErrorSurface
  path: string
  errorName: string
  occurredAt: string
}

declare global {
  interface Window {
    __AQUILA_CLIENT_ERROR_REPORTS__?: ClientErrorReport[]
  }
}

type ReportClientErrorInput = {
  id: string
  boundary: ClientErrorBoundaryKind
  surface: ClientErrorSurface
  error: unknown
}

const CLIENT_ERROR_ENDPOINT = "/api/rum/client-errors"

export const createClientErrorId = () => {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8)
  return `err_${timestamp}_${random}`
}

const resolveErrorName = (error: unknown) => {
  if (error instanceof Error && error.name.trim()) return error.name.trim().slice(0, 80)
  return "Error"
}

const sendClientError = (payload: ClientErrorReport) => {
  const body = JSON.stringify(payload)

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      if (navigator.sendBeacon(CLIENT_ERROR_ENDPOINT, new Blob([body], { type: "application/json" }))) {
        return
      }
    } catch {
      // fallback to fetch below
    }
  }

  void fetch(CLIENT_ERROR_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
    keepalive: true,
  }).catch(() => {
    // ignore
  })
}

export const reportClientError = ({ id, boundary, surface, error }: ReportClientErrorInput) => {
  if (typeof window === "undefined") return

  const payload: ClientErrorReport = {
    id,
    boundary,
    surface,
    path: window.location.pathname,
    errorName: resolveErrorName(error),
    occurredAt: new Date().toISOString(),
  }

  window.__AQUILA_CLIENT_ERROR_REPORTS__ = [...(window.__AQUILA_CLIENT_ERROR_REPORTS__ || []), payload]

  if (process.env.NODE_ENV === "production") {
    sendClientError(payload)
  }
}
