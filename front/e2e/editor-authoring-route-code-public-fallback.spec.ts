import { expect, test } from "./helpers/authoringPlaywright"
import { expectEditorToContainLoadedText } from "./helpers/editorAuthoringFlow"

test.describe("editor authoring route code public fallback", () => {
  test("실제 /editor/[id] 수정 진입은 admin 코드 fence가 비었으면 공개 markdown 코드 본문으로 복구한다", async ({
    page,
  }) => {
    const adminMember = {
      id: 1,
      username: "qa-admin",
      nickname: "aquila",
      isAdmin: true,
    }
    const adminContentWithEmptyCode = [
      "공개 markdown 복구 대상입니다.",
      "",
      "```text",
      "```",
      "",
      "```java",
      "```",
      "",
      "복구 뒤 문단입니다.",
    ].join("\n")
    const publicContentWithCode = [
      "공개 markdown 복구 대상입니다.",
      "",
      "```text",
      "로그인 -> 세션 생성 -> 이후 요청에서 세션 확인",
      "```",
      "",
      "```java",
      "public Token login(User user) {",
      "    return new Token(access, refresh);",
      "}",
      "```",
      "",
      "복구 뒤 문단입니다.",
    ].join("\n")

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/997", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 997,
          version: 13,
          title: "공개 markdown 코드 복구 글",
          content: adminContentWithEmptyCode,
          contentHtml: "",
          published: true,
          listed: true,
        }),
      })
    })
    await page.route("**/post/api/v1/posts/997", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          content: publicContentWithCode,
          contentHtml: "",
        }),
      })
    })

    await page.goto("/editor/997")

    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue("공개 markdown 코드 복구 글")
    await expectEditorToContainLoadedText(
      page.locator("[data-testid='block-editor-prosemirror']").first(),
      "복구 뒤 문단입니다."
    )

    const codeBlocks = page.locator(".aq-code-shell")
    await expect(codeBlocks).toHaveCount(2)
    await expect(codeBlocks.nth(0).locator(".aq-code-highlight-layer")).toContainText(
      "로그인 -> 세션 생성 -> 이후 요청에서 세션 확인"
    )
    await expect(codeBlocks.nth(1).locator(".aq-code-highlight-layer")).toContainText("public Token login")
    await expect(codeBlocks.nth(1).locator(".aq-code-highlight-layer")).toContainText(
      "return new Token(access, refresh);"
    )
  })
})
