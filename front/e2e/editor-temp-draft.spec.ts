import { expect, test } from "@playwright/test"
import { isServerTempDraftPost } from "src/routes/Admin/editorTempDraft"

test.describe("editor temp draft", () => {
  test("tempDraft 플래그가 있으면 제목과 무관하게 임시글로 본다", () => {
    expect(
      isServerTempDraftPost({
        title: "비공개 초안",
        published: false,
        listed: false,
        tempDraft: true,
      })
    ).toBe(true)
  })

  test("legacy placeholder 임시글도 계속 인식한다", () => {
    expect(
      isServerTempDraftPost({
        title: "임시글",
        published: false,
        listed: false,
      })
    ).toBe(true)
  })

  test("일반 비공개 글은 tempDraft 플래그 없으면 임시글로 보지 않는다", () => {
    expect(
      isServerTempDraftPost({
        title: "운영 메모",
        published: false,
        listed: false,
      })
    ).toBe(false)
  })
})
