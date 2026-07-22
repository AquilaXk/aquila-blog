import { ApiError, ApiTimeoutError } from "src/apis/backend/client"

export type AccountDeletionFailure =
  | { kind: "password"; message: string }
  | { kind: "session"; message: string }
  | { kind: "generic"; message: string }

export const ACCOUNT_DELETION_SESSION_EXPIRED_MESSAGE =
  "세션이 만료되었습니다. 다시 로그인해 주세요"

export const ACCOUNT_DELETION_GENERIC_FAILURE_MESSAGE =
  "계정 확인 상태를 확인했지만 탈퇴를 완료하지 못했습니다."

const isPasswordRelatedMessage = (message: string) => /비밀번호/.test(message)

export const parseAccountDeletionRevokedSessionCount = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  return null
}

export const resolveAccountDeletionFailure = (error: unknown): AccountDeletionFailure => {
  if (error instanceof ApiError) {
    // Backend wrong-password reauth uses HTTP 401 + "비밀번호가 일치하지 않습니다.".
    // Other 400s (reason validation, oauth confirmation) must stay generic, not password-field.
    if (
      (error.status === 400 || error.status === 401) &&
      isPasswordRelatedMessage(error.userMessage)
    ) {
      return {
        kind: "password",
        message: error.userMessage || ACCOUNT_DELETION_GENERIC_FAILURE_MESSAGE,
      }
    }
    if (error.status === 401) {
      return {
        kind: "session",
        message: ACCOUNT_DELETION_SESSION_EXPIRED_MESSAGE,
      }
    }
    return {
      kind: "generic",
      message: error.userMessage || ACCOUNT_DELETION_GENERIC_FAILURE_MESSAGE,
    }
  }

  if (error instanceof ApiTimeoutError) {
    return {
      kind: "generic",
      message: error.message || ACCOUNT_DELETION_GENERIC_FAILURE_MESSAGE,
    }
  }

  return {
    kind: "generic",
    message: ACCOUNT_DELETION_GENERIC_FAILURE_MESSAGE,
  }
}
