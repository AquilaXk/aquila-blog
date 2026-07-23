import { expect, test } from "@playwright/test"
import { ApiError, ApiNetworkError, ApiTimeoutError } from "../../src/apis/backend/client"
import {
  POST_DETAIL_DELETE_GENERIC_FAILURE_MESSAGE,
  POST_DETAIL_DELETE_NETWORK_FAILURE_MESSAGE,
  resolvePostDetailDeleteFailure,
} from "../../src/routes/Detail/PostDetail/postDetailDeleteFailureModel"

test("resolvePostDetailDeleteFailure maps 401 to unauthorized", () => {
  expect(
    resolvePostDetailDeleteFailure(
      new ApiError(401, "/post/api/v1/posts/1", JSON.stringify({ msg: "로그인이 필요합니다." }))
    )
  ).toEqual({
    kind: "unauthorized",
    message: "로그인이 필요합니다.",
  })
})

test("resolvePostDetailDeleteFailure prefers server msg for 403/404", () => {
  expect(
    resolvePostDetailDeleteFailure(
      new ApiError(403, "/post/api/v1/posts/1", JSON.stringify({ msg: "권한이 없습니다." }))
    )
  ).toEqual({
    kind: "error",
    message: "권한이 없습니다.",
  })

  expect(
    resolvePostDetailDeleteFailure(
      new ApiError(404, "/post/api/v1/posts/1", JSON.stringify({ msg: "요청한 정보를 찾을 수 없습니다." }))
    )
  ).toEqual({
    kind: "error",
    message: "요청한 정보를 찾을 수 없습니다.",
  })
})

test("resolvePostDetailDeleteFailure uses ApiError status fallbacks when msg is absent", () => {
  expect(resolvePostDetailDeleteFailure(new ApiError(403, "/post/api/v1/posts/1", ""))).toEqual({
    kind: "error",
    message: "권한이 없습니다.",
  })

  expect(resolvePostDetailDeleteFailure(new ApiError(404, "/post/api/v1/posts/1", ""))).toEqual({
    kind: "error",
    message: "요청한 정보를 찾을 수 없습니다.",
  })
})

test("resolvePostDetailDeleteFailure maps timeout and network errors", () => {
  expect(resolvePostDetailDeleteFailure(new ApiTimeoutError("/post/api/v1/posts/1", 8_000))).toEqual({
    kind: "error",
    message: "요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.",
  })

  expect(resolvePostDetailDeleteFailure(new TypeError("Failed to fetch"))).toEqual({
    kind: "error",
    message: POST_DETAIL_DELETE_NETWORK_FAILURE_MESSAGE,
  })

  expect(resolvePostDetailDeleteFailure(new ApiNetworkError("/post/api/v1/posts/1"))).toEqual({
    kind: "error",
    message: POST_DETAIL_DELETE_NETWORK_FAILURE_MESSAGE,
  })
})

test("resolvePostDetailDeleteFailure falls back to generic delete failure message", () => {
  expect(resolvePostDetailDeleteFailure(new Error("boom"))).toEqual({
    kind: "error",
    message: POST_DETAIL_DELETE_GENERIC_FAILURE_MESSAGE,
  })

  expect(
    resolvePostDetailDeleteFailure(
      new ApiError(500, "/post/api/v1/posts/1", JSON.stringify({ msg: "서버가 바쁩니다." }))
    )
  ).toEqual({
    kind: "error",
    message: "서버가 바쁩니다.",
  })
})
