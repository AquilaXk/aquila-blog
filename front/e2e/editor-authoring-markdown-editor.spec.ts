import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { Page, Route } from "./helpers/authoringPlaywright"
import { expect, test } from "./helpers/authoringPlaywright"

const sourcePath = (...segments: string[]) => resolve(__dirname, "../src", ...segments)
const localDraftStorageKey = "admin.editor.localDraft.v1"
const adminMember = {
  id: 1,
  username: "qa-admin",
  nickname: "aquila",
  isAdmin: true,
}
const longGithubMarkdownDraft = [
  "# GitHub Markdown Contract",
  "",
  "아래 내용은 507 긴 본문 하단에서 반복되던 table/code/list 선택 문제를 대체 경로로 검증한다.",
  "",
  "- [ ] task item at bottom",
  "- [x] checked item at bottom",
  "",
  "| Column 1 | Column 2 | Column 3 |",
  "| --- | --- | --- |",
  "| 507 | table | bottom |",
  "| drag | selection | stable |",
  "",
  "```js",
  "console.log(\"507-code\")",
  "```",
  "",
  "> quote at the bottom",
].join("\n")

const fulfillJson = async (route: Route, data: unknown) => {
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(data),
  })
}

const routeAuthenticatedEditor = async (page: Page, markdown = longGithubMarkdownDraft) => {
  await page.route("**/member/api/v1/auth/me", async (route) => {
    await fulfillJson(route, adminMember)
  })
  await page.route("**/post/api/v1/posts/tags", async (route) => {
    await fulfillJson(route, [])
  })
  await page.route("**/post/api/v1/posts/temp", async (route) => {
    await fulfillJson(route, {
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
    })
  })
  await page.addInitScript(
    ({ storageKey, content }) => {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          title: "GitHub Markdown 작성 테스트",
          content,
          summary: "Markdown split editor test",
          thumbnailUrl: "",
          thumbnailFocusX: 50,
          thumbnailFocusY: 50,
          thumbnailZoom: 1,
          tags: ["markdown", "507"],
          category: "",
          visibility: "PUBLIC_UNLISTED",
          savedAt: "2026-06-14T10:00:00.000Z",
        })
      )
    },
    { storageKey: localDraftStorageKey, content: markdown }
  )
}

test.describe("GitHub Markdown editor replacement", () => {
  test("writer host uses Markdown split editor instead of the legacy block editor", () => {
    const writerHostSource = readFileSync(sourcePath("routes/Admin/WriterEditorHost.tsx"), "utf8")
    const markdownEditorSource = readFileSync(
      sourcePath("components/markdown-editor/GitHubMarkdownEditor.tsx"),
      "utf8"
    )

    expect(writerHostSource).not.toContain("BlockEditorShell")
    expect(writerHostSource).not.toContain("blockEditorContract")
    expect(writerHostSource).toContain("GitHubMarkdownEditor")
    expect(markdownEditorSource).toContain("MarkdownRenderer")
  })

  test("legacy block editor user affordances are not part of the dedicated writer surface", () => {
    const dedicatedSurfaceSource = readFileSync(
      sourcePath("routes/Admin/EditorStudioDedicatedEditorSurface.tsx"),
      "utf8"
    )
    const composeRootSource = readFileSync(
      sourcePath("routes/Admin/EditorStudioWorkspaceControllerRootView.tsx"),
      "utf8"
    )

    expect(dedicatedSurfaceSource).not.toContain("block-drag-handle")
    expect(dedicatedSurfaceSource).not.toContain("keyboard-block-selection-overlay")
    expect(composeRootSource).not.toContain("BLOCK_EDITOR_V2_MERMAID_ENABLED")
    expect(composeRootSource).not.toContain("handleBlockEditorChange")
  })

  test("/editor/new renders GitHub Markdown write and preview panes for 507-style bottom content", async ({
    page,
  }) => {
    await routeAuthenticatedEditor(page)

    await page.goto("/editor/new?source=local-draft")

    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue("GitHub Markdown 작성 테스트")
    await expect(page.getByTestId("github-markdown-editor")).toBeVisible()
    await expect(page.getByTestId("github-markdown-write-pane")).toBeVisible()
    await expect(page.getByTestId("github-markdown-preview-pane")).toBeVisible()
    await expect(page.locator("[data-testid='block-editor-prosemirror']")).toHaveCount(0)
    await expect(page.locator("[data-testid='keyboard-block-selection-overlay']")).toHaveCount(0)
    await expect(page.locator("[data-testid='block-drag-handle']")).toHaveCount(0)

    const preview = page.getByTestId("github-markdown-preview-pane")
    await expect(preview.getByRole("heading", { name: "GitHub Markdown Contract" })).toBeVisible()
    await expect(preview.locator("table")).toContainText("507")
    await expect(preview.locator("pre")).toContainText("console.log(\"507-code\")")
    await expect(preview.locator("input[type='checkbox']")).toHaveCount(2)
    await expect(preview.getByText("quote at the bottom")).toBeVisible()
  })

  test("toolbar snippets insert at the CodeMirror caret instead of appending at the document end", async ({
    page,
  }) => {
    await routeAuthenticatedEditor(page, ["alpha", "omega"].join("\n"))

    await page.goto("/editor/new?source=local-draft")

    const writePane = page.getByTestId("github-markdown-write-pane")
    await expect(writePane).toBeVisible()
    await writePane.locator(".cm-content").click()
    await page.keyboard.press(process.platform === "darwin" ? "Meta+Home" : "Control+Home")
    await page.keyboard.press("ArrowRight")
    await page.getByRole("button", { name: "표" }).click()

    const editorText = await writePane.locator(".cm-content").innerText()
    expect(editorText.indexOf("| Column 1 | Column 2 | Column 3 |")).toBeLessThan(editorText.indexOf("omega"))
    await expect(page.getByTestId("github-markdown-preview-pane").locator("table")).toContainText("Column 1")
  })

  test("preview keeps raw HTML script and javascript URLs out of the rendered DOM", async ({
    page,
  }) => {
    await routeAuthenticatedEditor(
      page,
      [
        "# Security preview",
        "",
        "<script>window.__markdownPreviewScript = true</script>",
        "",
        "[bad link](javascript:alert(1))",
        "",
        "![bad image](javascript:alert(1))",
      ].join("\n")
    )

    await page.goto("/editor/new?source=local-draft")

    const preview = page.getByTestId("github-markdown-preview-pane")
    await expect(preview).toBeVisible()
    await expect(preview.locator("script")).toHaveCount(0)
    await expect(preview.locator("a[href^='javascript:']")).toHaveCount(0)
    await expect(preview.locator("img[src^='javascript:']")).toHaveCount(0)
    await expect
      .poll(() => page.evaluate(() => Boolean((window as unknown as { __markdownPreviewScript?: boolean }).__markdownPreviewScript)))
      .toBe(false)
  })
})
