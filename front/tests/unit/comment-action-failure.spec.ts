import { expect, test } from "@playwright/test"
import { ApiError, ApiNetworkError, ApiTimeoutError } from "../../src/apis/backend/client"
import {
  COMMENT_ACTION_NETWORK_FAILURE_MESSAGE,
  COMMENT_CREATE_FAILURE_MESSAGE,
  COMMENT_DELETE_FAILURE_MESSAGE,
  COMMENT_EDIT_FAILURE_MESSAGE,
  COMMENT_REPLY_FAILURE_MESSAGE,
  buildCommentContentSnippet,
  resolveCommentActionFailure,
} from "../../src/routes/Detail/PostDetail/CommentBox/commentActionFailureModel"

test("resolveCommentActionFailure maps 401 to unauthorized", () => {
  expect(
    resolveCommentActionFailure(
      new ApiError(401, "/post/api/v1/posts/1/comments", JSON.stringify({ msg: "로그인이 필요합니다." })),
      "create"
    )
  ).toEqual({
    kind: "unauthorized",
    message: "로그인이 필요합니다.",
  })
})

test("resolveCommentActionFailure prefers server msg for 403/404/other", () => {
  expect(
    resolveCommentActionFailure(
      new ApiError(403, "/post/api/v1/posts/1/comments/9", JSON.stringify({ msg: "삭제 권한이 없습니다." })),
      "delete"
    )
  ).toEqual({
    kind: "error",
    message: "삭제 권한이 없습니다.",
  })

  expect(
    resolveCommentActionFailure(
      new ApiError(404, "/post/api/v1/posts/1/comments/9", JSON.stringify({ msg: "댓글을 찾을 수 없습니다." })),
      "delete"
    )
  ).toEqual({
    kind: "error",
    message: "댓글을 찾을 수 없습니다.",
  })

  expect(
    resolveCommentActionFailure(
      new ApiError(500, "/post/api/v1/posts/1/comments", JSON.stringify({ msg: "서버가 바쁩니다." })),
      "create"
    )
  ).toEqual({
    kind: "error",
    message: "서버가 바쁩니다.",
  })
})

test("resolveCommentActionFailure uses status/userMessage then action fallbacks", () => {
  expect(resolveCommentActionFailure(new ApiError(403, "/comments", ""), "delete")).toEqual({
    kind: "error",
    message: "권한이 없습니다.",
  })

  expect(resolveCommentActionFailure(new ApiError(404, "/comments", ""), "edit")).toEqual({
    kind: "error",
    message: "요청한 정보를 찾을 수 없습니다.",
  })

  expect(resolveCommentActionFailure(new Error("boom"), "create")).toEqual({
    kind: "error",
    message: COMMENT_CREATE_FAILURE_MESSAGE,
  })

  expect(resolveCommentActionFailure(new Error("boom"), "reply")).toEqual({
    kind: "error",
    message: COMMENT_REPLY_FAILURE_MESSAGE,
  })

  expect(resolveCommentActionFailure(new Error("boom"), "edit")).toEqual({
    kind: "error",
    message: COMMENT_EDIT_FAILURE_MESSAGE,
  })

  expect(resolveCommentActionFailure(new Error("boom"), "delete")).toEqual({
    kind: "error",
    message: COMMENT_DELETE_FAILURE_MESSAGE,
  })
})

test("resolveCommentActionFailure maps timeout and network errors", () => {
  expect(resolveCommentActionFailure(new ApiTimeoutError("/comments", 8_000), "create")).toEqual({
    kind: "error",
    message: "요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.",
  })

  expect(resolveCommentActionFailure(new TypeError("Failed to fetch"), "delete")).toEqual({
    kind: "error",
    message: COMMENT_ACTION_NETWORK_FAILURE_MESSAGE,
  })

  expect(resolveCommentActionFailure(new ApiNetworkError("/post/api/v1/posts/1/comments"), "delete")).toEqual({
    kind: "error",
    message: COMMENT_ACTION_NETWORK_FAILURE_MESSAGE,
  })
})

test("buildCommentContentSnippet truncates long comment content", () => {
  expect(buildCommentContentSnippet("짧은 댓글")).toBe("짧은 댓글")
  expect(buildCommentContentSnippet("   ")).toBe("(내용 없음)")
  expect(buildCommentContentSnippet("가".repeat(100))).toBe(`${"가".repeat(80)}…`)
})
