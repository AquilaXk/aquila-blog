import { ApiError, ApiTimeoutError } from "./client"

type AuthAction = "login" | "signupStart" | "signupVerify" | "signupComplete"

const authStatusMessages: Record<AuthAction, Partial<Record<number, string>>> = {
  login: {
    401: "이메일(또는 아이디) 또는 비밀번호가 올바르지 않습니다.",
    429: "로그인 시도가 많습니다. 잠시 후 다시 시도해주세요.",
    500: "로그인 처리 중 서버 오류가 발생했습니다.",
  },
  signupStart: {
    400: "이메일 형식을 확인해주세요.",
    409: "이미 가입된 이메일입니다.",
    429: "인증 메일 요청이 많습니다. 잠시 후 다시 시도해주세요.",
    500: "회원가입 메일 발송에 실패했습니다.",
  },
  signupVerify: {
    400: "회원가입 링크가 유효하지 않습니다.",
    404: "회원가입 링크를 찾지 못했습니다.",
    410: "회원가입 링크가 만료되었습니다. 다시 요청해주세요.",
    500: "회원가입 링크 확인 중 서버 오류가 발생했습니다.",
  },
  signupComplete: {
    400: "입력값을 다시 확인해주세요.",
    409: "이미 사용 중인 정보입니다.",
    500: "회원가입 처리 중 서버 오류가 발생했습니다.",
  },
}

export const toFriendlyApiMessage = (error: unknown, fallback: string) => {
  if (error instanceof ApiTimeoutError) {
    return "응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요."
  }

  if (error instanceof ApiError) {
    return error.userMessage || fallback
  }

  if (error instanceof Error && error.message.trim()) {
    return fallback
  }

  return fallback
}

export const toAuthErrorMessage = (action: AuthAction, error: unknown, fallback: string) => {
  if (error instanceof ApiTimeoutError) {
    return "응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요."
  }

  if (error instanceof ApiError) {
    const mapped = authStatusMessages[action][error.status]
    if (mapped) return mapped
    return error.userMessage || fallback
  }

  return fallback
}
