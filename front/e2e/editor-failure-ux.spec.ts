import { expect, test } from "@playwright/test"
import { ApiError, ApiTimeoutError } from "src/apis/backend/client"
import {
  resolveEditorFailureRecovery,
  resolveEditorUploadFailureRecovery,
} from "src/routes/Admin/editorFailureRecoveryModel"

test.describe("editor failure recovery UX model", () => {
  test("409 저장 충돌은 현재 draft 보호와 서버 최신본 확인을 안내한다", () => {
    const recovery = resolveEditorFailureRecovery(new ApiError(409, "/post/api/v1/posts/7", ""), {
      action: "modify",
      isOnline: true,
    })

    expect(recovery.statusText).toContain("수정 실패")
    expect(recovery.statusText).toContain("서버 최신본")
    expect(recovery.statusText).toContain("작성 내용은 유지됩니다")
    expect(recovery.result).toMatchObject({
      errorType: "version-conflict",
      draftProtected: true,
      canRetry: true,
    })
    expect(recovery.result.nextActions).toEqual(
      expect.arrayContaining([
        "현재 내용을 로컬 임시저장으로 보존",
        "서버 최신본을 다시 불러와 차이를 비교",
        "필요한 내용을 수동 병합한 뒤 다시 저장",
      ]),
    )
  })

  test("offline과 timeout은 작성 내용 보존과 재시도를 명확히 안내한다", () => {
    const offline = resolveEditorFailureRecovery(new TypeError("Failed to fetch"), {
      action: "write",
      isOnline: false,
    })
    const timeout = resolveEditorFailureRecovery(new ApiTimeoutError("/post/api/v1/posts", 10_000), {
      action: "publish-temp",
      isOnline: true,
    })

    expect(offline.statusText).toContain("오프라인")
    expect(offline.statusText).toContain("작성 내용은 유지됩니다")
    expect(offline.result).toMatchObject({ errorType: "offline", draftProtected: true, canRetry: true })

    expect(timeout.statusText).toContain("응답이 지연")
    expect(timeout.statusText).toContain("작성 내용은 유지됩니다")
    expect(timeout.result).toMatchObject({ errorType: "timeout", draftProtected: true, canRetry: true })
  })

  test("401 413 429 500은 사용자가 다음 행동을 판단할 수 있는 상태로 분류된다", () => {
    const session = resolveEditorFailureRecovery(new ApiError(401, "/post/api/v1/posts", ""), {
      action: "write",
      isOnline: true,
    })
    const tooLarge = resolveEditorFailureRecovery(new ApiError(413, "/post/api/v1/posts/files", ""), {
      action: "write",
      isOnline: true,
    })
    const rateLimited = resolveEditorFailureRecovery(new ApiError(429, "/post/api/v1/posts", ""), {
      action: "modify",
      isOnline: true,
    })
    const server = resolveEditorFailureRecovery(new ApiError(500, "/post/api/v1/posts", ""), {
      action: "publish-temp",
      isOnline: true,
    })

    expect(session.statusText).toContain("로그인")
    expect(session.result.nextActions).toContain("새 탭에서 다시 로그인한 뒤 이 탭으로 돌아와 저장")
    expect(tooLarge.statusText).toContain("용량")
    expect(rateLimited.statusText).toContain("잠시 후")
    expect(server.statusText).toContain("서버 오류")

    for (const recovery of [session, tooLarge, rateLimited, server]) {
      expect(recovery.statusText).toContain("작성 내용은 유지됩니다")
      expect(recovery.result.draftProtected).toBe(true)
    }
  })

  test("업로드 실패는 파일명과 파일별 실패 상태, 재시도 경로를 포함한다", () => {
    const recovery = resolveEditorUploadFailureRecovery(new ApiError(413, "/post/api/v1/posts/images", ""), {
      kind: "image",
      fileName: "diagram.png",
      isOnline: true,
    })

    expect(recovery.statusText).toContain("diagram.png")
    expect(recovery.statusText).toContain("이미지 업로드 실패")
    expect(recovery.statusText).toContain("파일별 실패 상태")
    expect(recovery.statusText).toContain("다시 시도")
    expect(recovery.result).toMatchObject({
      errorType: "too-large",
      fileName: "diagram.png",
      draftProtected: true,
      canRetry: true,
    })
  })
})
