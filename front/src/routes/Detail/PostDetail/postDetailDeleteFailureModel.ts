import { ApiError, ApiNetworkError, ApiTimeoutError } from "src/apis/backend/client"

export const POST_DETAIL_DELETE_GENERIC_FAILURE_MESSAGE = "삭제에 실패했습니다"

export const POST_DETAIL_DELETE_NETWORK_FAILURE_MESSAGE =
  "네트워크 오류가 발생했습니다. 연결을 확인한 뒤 다시 시도해주세요."

export const POST_DETAIL_DELETE_FORBIDDEN_MESSAGE = "이 글을 삭제할 권한이 없습니다."

export const POST_DETAIL_DELETE_NOT_FOUND_MESSAGE = "이미 삭제되었거나 찾을 수 없는 글입니다."

export type PostDetailDeleteFailure =
  | { kind: "unauthorized"; message: string }
  | { kind: "error"; message: string }

const isNetworkTransportError = (error: unknown) => {
  if (error instanceof ApiNetworkError) return true
  if (error instanceof TypeError) return true
  if (!(error instanceof Error)) return false
  return /failed to fetch|networkerror|load failed|network request failed/i.test(error.message)
}

export const resolvePostDetailDeleteFailure = (error: unknown): PostDetailDeleteFailure => {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return {
        kind: "unauthorized",
        message: error.userMessage || "로그인이 필요합니다.",
      }
    }

    if (error.status === 403) {
      return {
        kind: "error",
        message: error.userMessage || POST_DETAIL_DELETE_FORBIDDEN_MESSAGE,
      }
    }

    if (error.status === 404) {
      return {
        kind: "error",
        message: error.userMessage || POST_DETAIL_DELETE_NOT_FOUND_MESSAGE,
      }
    }

    return {
      kind: "error",
      message: error.userMessage || POST_DETAIL_DELETE_GENERIC_FAILURE_MESSAGE,
    }
  }

  if (error instanceof ApiTimeoutError) {
    return {
      kind: "error",
      message: error.message || POST_DETAIL_DELETE_GENERIC_FAILURE_MESSAGE,
    }
  }

  if (isNetworkTransportError(error)) {
    return {
      kind: "error",
      message: POST_DETAIL_DELETE_NETWORK_FAILURE_MESSAGE,
    }
  }

  return {
    kind: "error",
    message: POST_DETAIL_DELETE_GENERIC_FAILURE_MESSAGE,
  }
}
