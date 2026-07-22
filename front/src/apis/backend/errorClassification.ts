import { ApiError, ApiNetworkError, ApiTimeoutError } from "./client"

export type ApiErrorCategory =
  | "validation"
  | "auth"
  | "forbidden"
  | "notFound"
  | "conflict"
  | "rateLimit"
  | "payloadTooLarge"
  | "server"
  | "network"
  | "timeout"

const CATEGORY_FALLBACK_MESSAGES: Record<ApiErrorCategory, string> = {
  validation: "요청 값이 올바르지 않습니다.",
  auth: "로그인이 필요합니다.",
  forbidden: "권한이 없습니다.",
  notFound: "요청한 정보를 찾을 수 없습니다.",
  conflict: "요청 충돌이 발생했습니다. 다시 시도해주세요.",
  rateLimit: "요청이 많습니다. 잠시 후 다시 시도해주세요.",
  payloadTooLarge: "요청 본문 용량이 너무 큽니다. 용량을 줄여 다시 시도해주세요.",
  server: "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
  network: "네트워크 연결에 실패했습니다. 잠시 후 다시 시도해주세요.",
  timeout: "요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.",
}

const mapApiErrorStatusToCategory = (status: number): ApiErrorCategory => {
  if (status === 400) return "validation"
  if (status === 401) return "auth"
  if (status === 403) return "forbidden"
  if (status === 404) return "notFound"
  if (status === 409) return "conflict"
  if (status === 413) return "payloadTooLarge"
  if (status === 429) return "rateLimit"
  if (status >= 500) return "server"
  return "network"
}

export const classifyApiError = (error: unknown): ApiErrorCategory => {
  if (error instanceof ApiTimeoutError) return "timeout"
  if (error instanceof ApiNetworkError) return "network"
  if (error instanceof ApiError) return mapApiErrorStatusToCategory(error.status)
  return "network"
}

export const toUserFacingMessage = (error: unknown): string => {
  if (error instanceof ApiError && error.userMessage.trim()) {
    return error.userMessage
  }

  return CATEGORY_FALLBACK_MESSAGES[classifyApiError(error)]
}
