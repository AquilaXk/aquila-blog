import { expect, test } from "@playwright/test"
import { ApiError, ApiNetworkError, ApiTimeoutError } from "../../src/apis/backend/client"
import {
  resolveEditorFailureRecovery,
  resolveEditorUploadFailureRecovery,
} from "../../src/routes/Admin/editorFailureRecoveryModel"

test("editor failure statusText appends requestId when present", () => {
  const recovery = resolveEditorFailureRecovery(
    new ApiError(500, "/post/api/v1/posts", "", "req-editor-1"),
    { action: "write", isOnline: true },
  )

  expect(recovery.statusText).toContain("작성 실패")
  expect(recovery.statusText).toContain("(요청 ID: req-editor-1)")
})

test("editor failure statusText omits requestId for timeout and missing header", () => {
  const timeout = resolveEditorFailureRecovery(new ApiTimeoutError("/post/api/v1/posts", 8_000), {
    action: "modify",
    isOnline: true,
  })
  const missing = resolveEditorFailureRecovery(new ApiError(500, "/post/api/v1/posts", ""), {
    action: "modify",
    isOnline: true,
  })

  expect(timeout.statusText).not.toContain("요청 ID")
  expect(missing.statusText).not.toContain("요청 ID")
})

test("editor failure maps ApiNetworkError to offline recovery", () => {
  const recovery = resolveEditorFailureRecovery(new ApiNetworkError("/post/api/v1/posts"), {
    action: "write",
    isOnline: true,
  })

  expect(recovery.result.errorType).toBe("offline")
  expect(recovery.result.canRetry).toBe(true)
  expect(recovery.statusText).toContain("오프라인")
})

test("editor upload failure statusText appends requestId when present", () => {
  const recovery = resolveEditorUploadFailureRecovery(
    new ApiError(413, "/post/api/v1/posts/images", "", "req-upload-9"),
    { kind: "image", fileName: "diagram.png", isOnline: true },
  )

  expect(recovery.statusText).toContain("diagram.png")
  expect(recovery.statusText).toContain("(요청 ID: req-upload-9)")
})
