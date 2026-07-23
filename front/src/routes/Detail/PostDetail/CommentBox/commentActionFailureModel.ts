import { ApiError, ApiNetworkError, ApiTimeoutError } from "src/apis/backend/client"

export type CommentActionKind = "create" | "reply" | "edit" | "delete"

export type CommentActionFailure =
  | { kind: "unauthorized"; message: string }
  | { kind: "error"; message: string }

export const COMMENT_CREATE_FAILURE_MESSAGE = "댓글 작성에 실패했습니다."
export const COMMENT_REPLY_FAILURE_MESSAGE = "답글 작성에 실패했습니다."
export const COMMENT_EDIT_FAILURE_MESSAGE = "댓글 수정에 실패했습니다."
export const COMMENT_DELETE_FAILURE_MESSAGE = "댓글 삭제에 실패했습니다."

export const COMMENT_ACTION_NETWORK_FAILURE_MESSAGE =
  "네트워크 오류가 발생했습니다. 연결을 확인한 뒤 다시 시도해주세요."

export const COMMENT_DELETE_CONFIRM_TITLE = "댓글을 삭제할까요?"
export const COMMENT_DELETE_CONFIRM_IRREVERSIBLE_GUIDANCE =
  "삭제하면 되돌릴 수 없습니다. 대상 댓글 내용:"

const COMMENT_DELETE_SNIPPET_MAX_LENGTH = 80

const ACTION_FALLBACK_MESSAGE: Record<CommentActionKind, string> = {
  create: COMMENT_CREATE_FAILURE_MESSAGE,
  reply: COMMENT_REPLY_FAILURE_MESSAGE,
  edit: COMMENT_EDIT_FAILURE_MESSAGE,
  delete: COMMENT_DELETE_FAILURE_MESSAGE,
}

const isNetworkTransportError = (error: unknown) => {
  if (error instanceof ApiNetworkError) return true
  if (error instanceof TypeError) return true
  if (!(error instanceof Error)) return false
  return /failed to fetch|networkerror|load failed|network request failed/i.test(error.message)
}

export const buildCommentContentSnippet = (content: string, maxLength = COMMENT_DELETE_SNIPPET_MAX_LENGTH) => {
  const normalized = content.replace(/\s+/g, " ").trim()
  if (!normalized) return "(내용 없음)"
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength).trimEnd()}…`
}

export const resolveCommentActionFailure = (
  error: unknown,
  action: CommentActionKind
): CommentActionFailure => {
  const fallbackMessage = ACTION_FALLBACK_MESSAGE[action]

  if (error instanceof ApiError) {
    if (error.status === 401) {
      return {
        kind: "unauthorized",
        message: error.userMessage || "로그인이 필요합니다.",
      }
    }

    return {
      kind: "error",
      message: error.userMessage || fallbackMessage,
    }
  }

  if (error instanceof ApiTimeoutError) {
    return {
      kind: "error",
      message: error.message || fallbackMessage,
    }
  }

  if (isNetworkTransportError(error)) {
    return {
      kind: "error",
      message: COMMENT_ACTION_NETWORK_FAILURE_MESSAGE,
    }
  }

  return {
    kind: "error",
    message: fallbackMessage,
  }
}
