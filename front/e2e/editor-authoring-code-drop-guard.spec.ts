import { expect, test } from "./helpers/authoringPlaywright"

const adminMember = {
  id: 1,
  username: "qa-admin",
  nickname: "aquila",
  isAdmin: true,
}

test.describe("editor authoring code drop guard", () => {
  test("코드블럭 내부 collapsed caret은 외부 drop을 internal drag로 차단하지 않는다", async ({
    page,
  }) => {
    const content = [
      "외부 drop 검증 글입니다.",
      "",
      "```ts",
      "const dropTarget = 1",
      "```",
      "",
      "마지막 문단입니다.",
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
          version: 1,
          title: "코드 drop guard 글",
          content,
          contentHtml: "",
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/997")

    const codeBlock = page.locator(".aq-code-shell").first()
    const codeContent = codeBlock.locator(".aq-code-editor-content").first()
    await expect(codeContent).toContainText("const dropTarget = 1")

    const dropPrevented = await codeBlock.evaluate((element) => {
      const contentRoot = element.querySelector<HTMLElement>(".aq-code-editor-content")
      if (!contentRoot) throw new Error("code content root is missing")
      const walker = document.createTreeWalker(contentRoot, NodeFilter.SHOW_TEXT)
      const firstText = walker.nextNode()
      if (!firstText) throw new Error("code text node is missing")

      const range = document.createRange()
      range.setStart(firstText, Math.min(1, firstText.textContent?.length ?? 0))
      range.collapse(true)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      contentRoot.focus({ preventScroll: true })

      const dropEvent = new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
      })
      const dispatchResult = element.dispatchEvent(dropEvent)
      return dropEvent.defaultPrevented || !dispatchResult
    })
    expect(dropPrevented).toBe(false)
  })
})
