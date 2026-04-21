import { expect, test } from "@playwright/test"
import { readFileSync } from "node:fs"
import path from "node:path"
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

  test("/editor/new local draft 복구는 서버 temp draft bootstrap으로 덮어쓰지 않는다", () => {
    const routingSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/useEditorStudioRouting.ts"), "utf8")

    expect(routingSource).toContain('if (source !== "local-draft") return')
    expect(routingSource).toContain("autoCreatedTempDraftRef.current = true")
    expect(routingSource).toContain("setIsNewEditorBootstrapPending(false)")
    expect(routingSource).toContain('if (source === "local-draft") return')
  })

  test("/editor/new?source=local-draft는 브라우저 임시저장 제목과 본문을 실제로 복구한다", async ({
    page,
  }) => {
    let tempDraftRequestCount = 0
    const adminMember = {
      id: 1,
      username: "qa-admin",
      nickname: "aquila",
      isAdmin: true,
    }
    const localDraft = {
      title: "브라우저 임시저장 복구 제목",
      content: "복구된 임시저장 본문입니다.",
      summary: "복구 요약",
      thumbnailUrl: "",
      thumbnailFocusX: 50,
      thumbnailFocusY: 50,
      thumbnailZoom: 1,
      tags: ["draft", "restore"],
      category: "",
      visibility: "PUBLIC_UNLISTED",
      savedAt: "2026-04-20T11:25:00.000Z",
    }

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/posts/temp", async (route) => {
      tempDraftRequestCount += 1
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          resultCode: "200-1",
          msg: "temp draft",
          data: {
            id: 990,
            title: "임시글",
            content: "",
            published: false,
            listed: false,
            tempDraft: true,
          },
        }),
      })
    })
    await page.addInitScript((draft) => {
      window.localStorage.setItem("admin.editor.localDraft.v1", JSON.stringify(draft))
    }, localDraft)

    await page.goto("/editor/new?source=local-draft")

    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue(localDraft.title)
    await expect(page.getByText(localDraft.content)).toBeVisible()
    await expect(page.getByText("draft")).toBeVisible()
    await page.waitForTimeout(600)
    expect(tempDraftRequestCount).toBe(0)
  })
})
