import { expect, test } from "@playwright/test"
import {
  consumeGuardOnExpectedUpdate,
  createBlockEditorLoadGuardState,
  shouldIgnoreBlockEditorEmptyUpdate,
} from "src/routes/Admin/editorLoadSyncGuard"

test.describe("editor load sync guard", () => {
  test("수정 진입 직후 빈 markdown 업데이트는 무시한다", () => {
    const nowMs = 1_000
    const guard = createBlockEditorLoadGuardState("실제 본문 첫 줄\n실제 본문 둘째 줄", nowMs)

    expect(
      shouldIgnoreBlockEditorEmptyUpdate({
        nextMarkdown: "",
        currentMarkdown: "실제 본문 첫 줄\n실제 본문 둘째 줄",
        guardState: guard,
        nowMs: nowMs + 200,
      })
    ).toBe(true)

    expect(
      shouldIgnoreBlockEditorEmptyUpdate({
        nextMarkdown: "",
        currentMarkdown: "실제 본문 첫 줄\n실제 본문 둘째 줄",
        guardState: guard,
        nowMs: nowMs + 2_000,
      })
    ).toBe(false)
  })

  test("예상 본문 동기화가 들어오면 guard를 즉시 해제한다", () => {
    const nowMs = 2_000
    const guard = createBlockEditorLoadGuardState("본문 유지", nowMs)
    const released = consumeGuardOnExpectedUpdate(guard, "본문 유지")

    expect(released.ignoreUntilMs).toBe(0)
    expect(
      shouldIgnoreBlockEditorEmptyUpdate({
        nextMarkdown: "",
        currentMarkdown: "본문 유지",
        guardState: released,
        nowMs: nowMs + 100,
      })
    ).toBe(false)
  })

  test("로드 본문이 비어있으면 guard를 두지 않는다", () => {
    const guard = createBlockEditorLoadGuardState("   \n")

    expect(guard.expectedBody).toBe("")
    expect(guard.ignoreUntilMs).toBe(0)
    expect(
      shouldIgnoreBlockEditorEmptyUpdate({
        nextMarkdown: "",
        currentMarkdown: "본문",
        guardState: guard,
      })
    ).toBe(false)
  })
})
