import { ApiError, ApiNetworkError, ApiTimeoutError } from "src/apis/backend/client"
import { classifyApiError, type ApiErrorCategory } from "src/apis/backend/errorClassification"
import { hasOptionalTrackingConsent } from "src/libs/privacy/optionalTrackingConsentCore"
import {
  extractStackTop,
  resolveErrorMessageFromUnknown,
  toUrlPathOnly,
} from "src/libs/rum/errorPayloadSanitize"
import type { ClientErrorBoundaryKind, ClientErrorSurface } from "src/libs/rum/reportClientError"

export const NETWORK_API_ERROR_SAMPLE_RATE = 0.1

const CLIENT_ERROR_ENDPOINT = "/api/rum/client-errors"
const reportedApiErrors = new WeakSet<object>()

export type ApiErrorReport = {
  id: string
  boundary: ClientErrorBoundaryKind
  surface: ClientErrorSurface
  path: string
  errorName: string
  occurredAt: string
  errorMessage?: string
  stackTop?: string
  requestId?: string
  category?: ApiErrorCategory
  status?: number
  url?: string
}

declare global {
  interface Window {
    __AQUILA_API_ERROR_REPORTS__?: ApiErrorReport[]
  }
}

const createApiErrorReportId = () => {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8)
  return `err_${timestamp}_${random}`
}

export const wasApiErrorReported = (error: unknown) =>
  typeof error === "object" && error !== null && reportedApiErrors.has(error)

export const markApiErrorReported = (error: unknown) => {
  if (typeof error === "object" && error !== null) {
    reportedApiErrors.add(error)
  }
}

/**
 * 5xx always; network/timeout 10% fixed sample; 4xx never.
 * Timeout is treated as transport failure (same sample bucket as network).
 */
export const shouldReportApiError = (
  error: unknown,
  random: () => number = Math.random
): boolean => {
  if (error instanceof ApiError) {
    if (error.status >= 500) return true
    if (error.status >= 400) return false
    return false
  }

  if (error instanceof ApiNetworkError || error instanceof ApiTimeoutError) {
    return random() < NETWORK_API_ERROR_SAMPLE_RATE
  }

  const category = classifyApiError(error)
  if (category === "server") return true
  if (category === "network" || category === "timeout") {
    return random() < NETWORK_API_ERROR_SAMPLE_RATE
  }
  return false
}

const resolveErrorName = (error: unknown) => {
  if (error instanceof Error && error.name.trim()) return error.name.trim().slice(0, 80)
  return "Error"
}

const resolveStatus = (error: unknown): number | undefined => {
  if (error instanceof ApiError && Number.isFinite(error.status)) return error.status
  return undefined
}

const resolveRequestUrlPath = (error: unknown) => {
  if (error instanceof ApiError) return toUrlPathOnly(error.url)
  if (error instanceof ApiTimeoutError) return toUrlPathOnly(error.url)
  return ""
}

const resolveRequestId = (error: unknown) => {
  if (!(error instanceof ApiError) || typeof error.requestId !== "string") return undefined
  const normalized = error.requestId.trim().slice(0, 64)
  return normalized || undefined
}

const sendApiError = (payload: ApiErrorReport) => {
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

export const reportApiError = (
  error: unknown,
  options: { random?: () => number } = {}
) => {
  if (typeof window === "undefined") return
  if (wasApiErrorReported(error)) return
  if (!shouldReportApiError(error, options.random)) return

  const category: ApiErrorCategory = classifyApiError(error)
  const errorMessage = resolveErrorMessageFromUnknown(error)
  const stackTop = extractStackTop(error)
  const requestId = resolveRequestId(error)
  const status = resolveStatus(error)
  const url = resolveRequestUrlPath(error)

  const payload: ApiErrorReport = {
    id: createApiErrorReportId(),
    boundary: "global",
    surface: "app",
    path: window.location.pathname,
    errorName: resolveErrorName(error),
    occurredAt: new Date().toISOString(),
    ...(errorMessage ? { errorMessage } : {}),
    ...(stackTop ? { stackTop } : {}),
    ...(requestId ? { requestId } : {}),
    category,
    ...(typeof status === "number" ? { status } : {}),
    ...(url ? { url } : {}),
  }

  markApiErrorReported(error)
  window.__AQUILA_API_ERROR_REPORTS__ = [...(window.__AQUILA_API_ERROR_REPORTS__ || []), payload]

  if (process.env.NODE_ENV === "production" && hasOptionalTrackingConsent()) {
    sendApiError(payload)
  }
}
