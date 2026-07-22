import { expect, test } from "@playwright/test"
import { ApiError, ApiTimeoutError } from "../../src/apis/backend/client"
import {
  ACCOUNT_DELETION_GENERIC_FAILURE_MESSAGE,
  ACCOUNT_DELETION_SESSION_EXPIRED_MESSAGE,
  resolveAccountDeletionFailure,
} from "../../src/routes/Settings/settingsAccountDeletionFeedback"

test("resolveAccountDeletionFailure maps password-related 400/401 to password field errors", () => {
  const missingPassword = resolveAccountDeletionFailure(
    new ApiError(400, "/member/api/v1/privacy/account", JSON.stringify({
      resultCode: "400-1",
      msg: "비밀번호를 입력해주세요.",
    }))
  )
  expect(missingPassword).toEqual({
    kind: "password",
    message: "비밀번호를 입력해주세요.",
  })

  const wrongPassword = resolveAccountDeletionFailure(
    new ApiError(401, "/member/api/v1/privacy/account", JSON.stringify({
      resultCode: "401-1",
      msg: "비밀번호가 일치하지 않습니다.",
    }))
  )
  expect(wrongPassword).toEqual({
    kind: "password",
    message: "비밀번호가 일치하지 않습니다.",
  })
})

test("resolveAccountDeletionFailure maps non-password 400/401 correctly", () => {
  const oauthConfirm = resolveAccountDeletionFailure(
    new ApiError(400, "/member/api/v1/privacy/account", JSON.stringify({
      resultCode: "400-2",
      msg: "소셜 계정 탈퇴 확인이 필요합니다.",
    }))
  )
  expect(oauthConfirm).toEqual({
    kind: "generic",
    message: "소셜 계정 탈퇴 확인이 필요합니다.",
  })

  expect(
    resolveAccountDeletionFailure(
      new ApiError(401, "/member/api/v1/privacy/account", JSON.stringify({
        resultCode: "401-1",
        msg: "인증이 필요합니다.",
      }))
    )
  ).toEqual({
    kind: "session",
    message: ACCOUNT_DELETION_SESSION_EXPIRED_MESSAGE,
  })
})

test("resolveAccountDeletionFailure maps other errors to generic danger feedback", () => {
  const forbidden = resolveAccountDeletionFailure(
    new ApiError(403, "/member/api/v1/privacy/account", JSON.stringify({ msg: "권한이 없습니다." }))
  )
  expect(forbidden).toEqual({
    kind: "generic",
    message: "권한이 없습니다.",
  })

  expect(
    resolveAccountDeletionFailure(
      new ApiError(500, "/member/api/v1/privacy/account", JSON.stringify({ msg: "서버가 바쁩니다." }))
    )
  ).toEqual({
    kind: "generic",
    message: "서버가 바쁩니다.",
  })

  expect(resolveAccountDeletionFailure(new ApiTimeoutError("/member/api/v1/privacy/account", 8_000))).toEqual({
    kind: "generic",
    message: "요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.",
  })

  expect(resolveAccountDeletionFailure(new Error("boom"))).toEqual({
    kind: "generic",
    message: ACCOUNT_DELETION_GENERIC_FAILURE_MESSAGE,
  })
})

test("ApiError prefers localized body and ignores English proxy/validation copy", () => {
  expect(new ApiError(502, "/api/backend/x", JSON.stringify({ message: "Backend proxy request failed." })).userMessage)
    .toBe("서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.")

  expect(
    new ApiError(400, "/member/api/v1/privacy/account", JSON.stringify({
      resultCode: "400-1",
      msg: "password-Size-size must be between 1 and 128",
    })).userMessage
  ).toBe("요청 값이 올바르지 않습니다.")

  expect(
    new ApiError(503, "/cloud/api/v1/files", JSON.stringify({
      resultCode: "503-1",
      msg: "스토리지 초기화 실패: AccessDenied on bucket aquila-private",
    })).userMessage
  ).toBe("서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.")

  expect(
    new ApiError(400, "/member/api/v1/privacy/account", JSON.stringify({
      resultCode: "400-1",
      msg: "비밀번호를 입력해주세요.",
    })).userMessage
  ).toBe("비밀번호를 입력해주세요.")
})
