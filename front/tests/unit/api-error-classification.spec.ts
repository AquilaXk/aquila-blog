import { expect, test } from "@playwright/test"
import {
  ApiError,
  ApiNetworkError,
  ApiTimeoutError,
  readApiResultCode,
} from "../../src/apis/backend/client"
import {
  classifyApiError,
  toUserFacingMessage,
} from "../../src/apis/backend/errorClassification"

test("readApiResultCode extracts body resultCode", () => {
  expect(readApiResultCode(JSON.stringify({ resultCode: "409-4", msg: "policy" }))).toBe("409-4")
  expect(readApiResultCode("")).toBe("")
  expect(readApiResultCode("{")).toBe("")
})

test("ApiError exposes resultCode from body JSON", () => {
  const error = new ApiError(
    409,
    "/signup/complete",
    JSON.stringify({ resultCode: "409-4", msg: "약관이 변경되었습니다." })
  )
  expect(error.resultCode).toBe("409-4")
  expect(error.userMessage).toContain("약관")
})

test("classifyApiError maps timeout and network first", () => {
  expect(classifyApiError(new ApiTimeoutError("/x", 1_000))).toBe("timeout")
  expect(classifyApiError(new ApiNetworkError("/x"))).toBe("network")
})

test("classifyApiError maps ApiError status categories", () => {
  expect(classifyApiError(new ApiError(400, "/x", ""))).toBe("validation")
  expect(classifyApiError(new ApiError(401, "/x", ""))).toBe("auth")
  expect(classifyApiError(new ApiError(403, "/x", ""))).toBe("forbidden")
  expect(classifyApiError(new ApiError(404, "/x", ""))).toBe("notFound")
  expect(classifyApiError(new ApiError(409, "/x", ""))).toBe("conflict")
  expect(classifyApiError(new ApiError(413, "/x", ""))).toBe("payloadTooLarge")
  expect(classifyApiError(new ApiError(429, "/x", ""))).toBe("rateLimit")
  expect(classifyApiError(new ApiError(500, "/x", ""))).toBe("server")
  expect(classifyApiError(new ApiError(503, "/x", ""))).toBe("server")
})

test("classifyApiError falls back to network for unknown errors", () => {
  expect(classifyApiError(new Error("boom"))).toBe("network")
  expect(classifyApiError("string")).toBe("network")
})

test("toUserFacingMessage prefers ApiError.userMessage", () => {
  const error = new ApiError(403, "/x", JSON.stringify({ msg: "권한이 없습니다." }))
  expect(toUserFacingMessage(error)).toBe("권한이 없습니다.")
})

test("toUserFacingMessage uses category fallbacks", () => {
  expect(toUserFacingMessage(new ApiTimeoutError("/x", 1_000))).toBe(
    "요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요."
  )
  expect(toUserFacingMessage(new ApiNetworkError("/x"))).toBe(
    "네트워크 연결에 실패했습니다. 잠시 후 다시 시도해주세요."
  )
  expect(toUserFacingMessage(new Error("raw"))).toBe(
    "네트워크 연결에 실패했습니다. 잠시 후 다시 시도해주세요."
  )
})
