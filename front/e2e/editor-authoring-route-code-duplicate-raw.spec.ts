import { expect, test } from "./helpers/authoringPlaywright"

const escapeHtmlAttribute = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("\n", "&#10;")

const buildDuplicatedRawCodeBlockHtml = (language: string, code: string) => {
  const rawCodeAttribute = escapeHtmlAttribute(code)
  return [
    `<div class="aq-code-block" data-language="${language}" data-raw-code="${rawCodeAttribute}">`,
    '<pre class="aq-code aq-pretty-pre">',
    `<code class="language-${language}" data-raw-code="${rawCodeAttribute}">`,
    "</code>",
    "</pre>",
    "</div>",
  ].join("")
}

test.describe("editor authoring route duplicate raw code recovery", () => {
  test("실제 /editor/[id] 수정 진입은 wrapper/code 중복 raw attribute 여러 코드블럭도 순서대로 복구한다", async ({
    page,
  }) => {
    const adminMember = {
      id: 1,
      username: "qa-admin",
      nickname: "aquila",
      isAdmin: true,
    }
    const firstCode = "firstUniqueLine();"
    const secondCode = "secondUniqueLine();"
    const staleContent = [
      "첫 번째 코드입니다.",
      "",
      "```java",
      "```",
      "",
      "두 번째 코드입니다.",
      "",
      "```ts",
      "```",
    ].join("\n")
    const prettyCodeHtml = [
      "<p>첫 번째 코드입니다.</p>",
      buildDuplicatedRawCodeBlockHtml("java", firstCode),
      "<p>두 번째 코드입니다.</p>",
      buildDuplicatedRawCodeBlockHtml("ts", secondCode),
    ].join("")

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/992", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 992,
          version: 4,
          title: "코드 중복 raw 복구 글",
          content: staleContent,
          contentHtml: prettyCodeHtml,
          published: true,
          listed: true,
        }),
      })
    })
    await page.route("**/post/api/v1/posts/992", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          content: staleContent,
          contentHtml: prettyCodeHtml,
        }),
      })
    })

    await page.goto("/editor/992")

    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue("코드 중복 raw 복구 글")
    const codeBlocks = page.locator(".aq-code-shell")
    await expect(codeBlocks).toHaveCount(2, { timeout: 15_000 })
    await expect(codeBlocks.nth(0).locator(".aq-code-highlight-layer")).toContainText(firstCode)
    await expect(codeBlocks.nth(0).locator(".aq-code-highlight-layer")).not.toContainText(secondCode)
    await expect(codeBlocks.nth(1).locator(".aq-code-highlight-layer")).toContainText(secondCode)
    await expect(codeBlocks.nth(1).locator(".aq-code-highlight-layer")).not.toContainText(firstCode)
  })
})
