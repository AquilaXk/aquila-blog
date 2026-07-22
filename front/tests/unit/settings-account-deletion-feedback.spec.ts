import { expect, test } from "@playwright/test"
import { ApiError, ApiTimeoutError } from "../../src/apis/backend/client"
import {
  ACCOUNT_DELETION_GENERIC_FAILURE_MESSAGE,
  ACCOUNT_DELETION_SESSION_EXPIRED_MESSAGE,
  resolveAccountDeletionFailure,
} from "../../src/routes/Settings/settingsAccountDeletionFeedback"

test("resolveAccountDeletionFailure maps 400 and password-related 401 to password field errors", () => {
  const badPassword = resolveAccountDeletionFailure(
    new ApiError(400, "/member/api/v1/privacy/account", JSON.stringify({ msg: "비밀번호를 입력해주세요." }))
  )
  expect(badPassword).toEqual({
    kind: "password",
    message: "비밀번호를 입력해주세요.",
  })

  const wrongPassword = resolveAccountDeletionFailure(
    new ApiError(401, "/member/api/v1/privacy/account", JSON.stringify({ msg: "비밀번호가 일치하지 않습니다." }))
  )
  expect(wrongPassword).toEqual({
    kind: "password",
    message: "비밀번호가 일치하지 않습니다.",
  })
})

test("resolveAccountDeletionFailure maps non-password 401 to session guidance copy", () => {
  expect(
    resolveAccountDeletionFailure(
      new ApiError(401, "/member/api/v1/privacy/account", JSON.stringify({ msg: "인증이 필요합니다." }))
    )
  ).toEqual({
    kind: "session",
    message: ACCOUNT_DELETION_SESSION_EXPIRED_MESSAGE,
  })
})

test("resolveAccountDeletionFailure maps 403 and other errors to generic danger feedback", () => {
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
