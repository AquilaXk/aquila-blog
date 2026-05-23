import { expect, test } from "@playwright/test"
import {
  expectEditorToContainLoadedText,
} from "./helpers/editorAuthoringFlow"

test.describe("editor authoring route code recovery", () => {
  test("실제 /editor/[id] 수정 진입은 pretty-code 원문으로 빈 코드블럭을 복구한다", async ({
    page,
  }) => {
    const adminMember = {
      id: 1,
      username: "qa-admin",
      nickname: "aquila",
      isAdmin: true,
    }
    const staleContent = [
      "수정 대상 코드입니다.",
      "",
      "```ts",
      "```",
      "",
      "다음 문단입니다.",
    ].join("\n")
    const prettyCodeHtml = [
      '<div class="aq-code-block">',
      '<div class="aq-code-toolbar"><span class="aq-code-language">TS</span></div>',
      '<div class="aq-code-body"><div class="aq-code-shell">',
      '<pre class="aq-code aq-pretty-pre">',
      '<code class="language-ts" data-raw-code="const answer = 42;&#10;return answer">',
      '<span class="token keyword">const</span> answer = 42;',
      '</code>',
      '</pre>',
      '</div></div>',
      '</div>',
    ].join("")

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/991", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 991,
          version: 7,
          title: "코드 복구 글",
          content: staleContent,
          contentHtml: prettyCodeHtml,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/991")

    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue("코드 복구 글")
    await expectEditorToContainLoadedText(
      page.locator("[data-testid='block-editor-prosemirror']").first(),
      "다음 문단입니다."
    )
    const codeBlock = page.locator(".aq-code-shell").first()
    await expect(codeBlock).toBeVisible({ timeout: 15_000 })
    await expect(codeBlock.locator(".aq-code-highlight-layer")).toContainText("const answer = 42;")
    await expect(codeBlock.locator(".aq-code-highlight-layer")).toContainText("return answer")
    await expect(codeBlock.locator(".aq-code-highlight-layer .token.keyword").first()).toBeVisible()
  })

  test("실제 /editor/[id] 수정 진입은 보이지 않는 placeholder 코드 fence를 pretty-code 원문으로 복구한다", async ({
    page,
  }) => {
    const adminMember = {
      id: 1,
      username: "qa-admin",
      nickname: "aquila",
      isAdmin: true,
    }
    const staleContent = [
      "코드 placeholder 복구 대상입니다.",
      "",
      "```ts",
      "\u200B",
      "```",
      "",
      "복구 뒤 문단입니다.",
    ].join("\n")
    const prettyCodeHtml = [
      '<section><p>본문 앞 HTML</p>',
      '<div class="aq-code-block" data-language="ts" data-raw-code="const invisibleRestored = 306;&#10;return invisibleRestored">',
      '<pre class="aq-code aq-pretty-pre">',
      '<code class="language-ts"></code>',
      "</pre></div></section>",
    ].join("")

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/993", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 993,
          version: 9,
          title: "코드 invisible placeholder 복구 글",
          content: staleContent,
          contentHtml: prettyCodeHtml,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/993")

    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue("코드 invisible placeholder 복구 글")
    const codeBlock = page.locator(".aq-code-shell").first()
    await expect(codeBlock).toBeVisible({ timeout: 15_000 })
    await expect(codeBlock.locator(".aq-code-highlight-layer")).toContainText("const invisibleRestored = 306;")
    await expect(codeBlock.locator(".aq-code-highlight-layer")).toContainText("return invisibleRestored")
  })

  test("실제 /editor/[id] 수정 진입은 content markdown 코드 본문만 있어도 코드블럭 본문을 유지한다", async ({
    page,
  }) => {
    const adminMember = {
      id: 1,
      username: "qa-admin",
      nickname: "aquila",
      isAdmin: true,
    }
    const markdownOnlyContent = [
      "코드 본문 보존 대상입니다.",
      "",
      "```text",
      "로그인 -> 세션 생성 -> 이후 요청에서 세션 확인",
      "```",
      "",
      "```java",
      "public Token login(User user) {",
      "",
      "    String access = createAccessToken(user);",
      "    String refresh = createRefreshToken(user);",
      "",
      "    return new Token(access, refresh);",
      "}",
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
    await page.route("**/post/api/v1/adm/posts/994", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 994,
          version: 10,
          title: "코드 markdown-only 글",
          content: markdownOnlyContent,
          contentHtml: "",
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/994")

    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue("코드 markdown-only 글")
    await expectEditorToContainLoadedText(
      page.locator("[data-testid='block-editor-prosemirror']").first(),
      "마지막 문단입니다."
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

    await page.waitForTimeout(1_500)
    await expect(codeBlocks.nth(0).locator(".aq-code-highlight-layer")).toContainText(
      "로그인 -> 세션 생성 -> 이후 요청에서 세션 확인"
    )
    await expect(codeBlocks.nth(1).locator(".aq-code-highlight-layer")).toContainText("public Token login")
  })

  test("실제 /editor/[id] 수정 진입은 frontmatter와 inline color 뒤의 코드블럭 본문을 유지한다", async ({
    page,
  }) => {
    const adminMember = {
      id: 1,
      username: "qa-admin",
      nickname: "aquila",
      isAdmin: true,
    }
    const markdownWithMetaAndColor = [
      "---",
      'tags: ["Stateless", "인증", "JWT"]',
      'thumbnail: "https://api.aquilaxk.site/post/api/v1/images/posts/test.jpg#::aqfx=50::aqfy=60.1::aqfz=1"',
      "---",
      "",
      "## **시작하며**",
      "",
      '왜냐하면 중요한건 {{color:#34d399|**"어디에" **}}저장하느냐가 아니라',
      "",
      "요청을 처리할 때 {{color:#fb923c|**\"무엇이\"**}} 필요하냐 이기 때문입니다.",
      "",
      "---",
      "",
      "## 왜 이 문제가 중요한가",
      "",
      "보통 처음 인증을 구현한다면 이런 식으로 할 것 입니다",
      "",
      "```text",
      "로그인 -> 세션 생성 -> 이후 요청에서 세션 확인",
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
    await page.route("**/post/api/v1/adm/posts/995", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 995,
          version: 11,
          title: "코드 frontmatter 글",
          content: markdownWithMetaAndColor,
          contentHtml: "",
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/995")

    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue("코드 frontmatter 글")
    await expectEditorToContainLoadedText(
      page.locator("[data-testid='block-editor-prosemirror']").first(),
      "마지막 문단입니다."
    )

    const codeBlock = page.locator(".aq-code-shell").first()
    await expect(codeBlock).toBeVisible({ timeout: 15_000 })
    await expect(codeBlock.locator(".aq-code-highlight-layer")).toContainText(
      "로그인 -> 세션 생성 -> 이후 요청에서 세션 확인"
    )
    await page.waitForTimeout(1_500)
    await expect(codeBlock.locator(".aq-code-highlight-layer")).toContainText(
      "로그인 -> 세션 생성 -> 이후 요청에서 세션 확인"
    )
  })
})
