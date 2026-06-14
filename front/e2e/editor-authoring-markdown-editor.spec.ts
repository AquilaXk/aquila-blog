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

  test("publish confirmation modal follows the admin neutral dialog contract", async ({ page }) => {
    await routeAuthenticatedEditor(page)

    await page.goto("/editor/new?source=local-draft")
    await page.getByRole("button", { name: /^(발행|새 글 작성|수정 반영)$/ }).first().click()

    const dialog = page.getByRole("dialog", { name: /^(발행 설정|새 글 작성|수정 설정)$/ })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("button", { name: "닫기" })).toBeVisible()
    await expect(dialog.getByRole("button", { name: /^(발행하기|새 글 작성|변경 반영)$/ })).toBeVisible()

    const dialogContract = await dialog.evaluate((element) => {
      const style = window.getComputedStyle(element)
      return {
        borderRadius: Number.parseFloat(style.borderTopLeftRadius),
        width: element.getBoundingClientRect().width,
        backgroundImage: style.backgroundImage,
      }
    })

    expect(dialogContract.borderRadius).toBeLessThanOrEqual(16)
    expect(dialogContract.width).toBeLessThanOrEqual(960)
    expect(dialogContract.backgroundImage).toBe("none")
  })

  test("publish modal shell styles stay in the modal style primitive file", () => {
    const publishModalSource = readFileSync(
      sourcePath("routes/Admin/EditorStudioPublishModal.tsx"),
      "utf8"
    )
    const publishModalStylesSource = readFileSync(
      sourcePath("routes/Admin/EditorStudioPublishModalStyles.tsx"),
      "utf8"
    )
    const publishModalShellStylesSource = readFileSync(
      sourcePath("routes/Admin/EditorStudioPublishModalShellStyles.tsx"),
      "utf8"
    )

    expect(publishModalSource).not.toContain("const PublishModalBackdrop = styled.")
    expect(publishModalSource).not.toContain("const PublishDialog = styled.")
    expect(publishModalSource).not.toContain("const PublishModalHeader = styled.")
    expect(publishModalSource).not.toContain("const PublishModalBody = styled.")
    expect(publishModalSource).not.toContain("const PublishModalFooter = styled.")
    expect(publishModalSource).toContain('from "./EditorStudioPublishModalStyles"')
    expect(publishModalStylesSource).toContain('from "./EditorStudioPublishModalShellStyles"')
    expect(publishModalShellStylesSource).toContain("export const PublishModalBackdrop")
    expect(publishModalShellStylesSource).toContain("export const PublishDialog")
    expect(publishModalShellStylesSource).toContain("export const PublishModalHeader")
    expect(publishModalShellStylesSource).toContain("export const PublishModalBody")
    expect(publishModalShellStylesSource).toContain("export const PublishModalFooter")
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

  test("preview matches GitHub table markdown for alignment, escaped pipes, and inline cell formatting", async ({
    page,
  }) => {
    await routeAuthenticatedEditor(
      page,
      [
        "# GitHub table parity",
        "",
        "```md",
        "| example | only |",
        "| --- | --- |",
        "| this is code | not a rendered table |",
        "```",
        "",
        "    | indented | code |",
        "    | --- | --- |",
        "",
        "escaped \\| pipe is plain text",
        "--- | ---",
        "",
        "Mismatch | Header | Count",
        "--- | ---",
        "one | two",
        "",
        "Inline | `pipe|code`",
        "--- | ---",
        "",
        "Two dash A | Two dash B",
        "-- | --",
        "one | two",
        "",
        "Left | Center | Right",
        ":--- | :---: | ---:",
        "**strong** and *em* | `code` and [link](https://github.com) | escaped \\| pipe",
        "",
        '<!-- aq-table {"overflowMode":"wide","columnWidths":[320,360,420]} -->',
        "| Wide A | Wide B | Wide C |",
        "| --- | --- | --- |",
        "| " + "wide content ".repeat(10) + " | beta | gamma |",
      ].join("\n")
    )

    await page.goto("/editor/new?source=local-draft")

    const preview = page.getByTestId("github-markdown-preview-pane")
    await expect(preview.locator("pre").filter({ hasText: "| example | only |" })).toBeVisible()
    await expect(preview.locator("pre").filter({ hasText: "| indented | code |" })).toBeVisible()
    await expect(preview.getByText("escaped | pipe is plain text")).toBeVisible()
    await expect(preview.getByText("Mismatch | Header | Count")).toBeVisible()
    await expect(preview.getByText("Inline | pipe|code")).toBeVisible()
    await expect(preview.locator("table")).toHaveCount(3)

    const table = preview.locator("table").filter({ hasText: "strong" }).first()
    await expect(table).toBeVisible()
    await expect(table.locator("th")).toHaveCount(3)
    await expect(table.locator("td")).toHaveCount(3)
    await expect(table.locator("td").nth(0).locator("strong")).toHaveText("strong")
    await expect(table.locator("td").nth(0).locator("em")).toHaveText("em")
    await expect(table.locator("td").nth(1).locator("code")).toHaveText("code")
    await expect(table.locator("td").nth(1).locator("a")).toHaveAttribute("href", "https://github.com")
    await expect(table.locator("td").nth(2)).toHaveText("escaped | pipe")

    const tableContract = await table.evaluate((element) => {
      const cells = Array.from(element.querySelectorAll<HTMLElement>("th"))
      const shell = element.closest(".aq-table-shell")
      const scroll = element.closest(".aq-table-scroll")
      return {
        alignments: cells.map((cell) => window.getComputedStyle(cell).textAlign),
        shellWidth: shell?.getBoundingClientRect().width ?? 0,
        tableWidth: element.getBoundingClientRect().width,
        scrollWidth: scroll?.scrollWidth ?? 0,
        clientWidth: scroll?.clientWidth ?? 0,
      }
    })

    expect(tableContract.alignments).toEqual(["left", "center", "right"])
    expect(tableContract.tableWidth).toBeLessThanOrEqual(tableContract.shellWidth + 1)

    const wideTableContract = await preview
      .locator("table")
      .filter({ hasText: "wide content" })
      .first()
      .evaluate((element) => {
        const scroll = element.closest(".aq-table-scroll")
        return {
          mode: element.getAttribute("data-overflow-mode"),
          scrollWidth: scroll?.scrollWidth ?? 0,
          clientWidth: scroll?.clientWidth ?? 0,
        }
      })

    expect(wideTableContract.mode).toBe("wide")
    expect(wideTableContract.scrollWidth).toBeGreaterThan(wideTableContract.clientWidth)
  })

  test("write pane keeps every CodeMirror surface on the dark editor surface", async ({ page }) => {
    await routeAuthenticatedEditor(
      page,
      [
        "# Token Highlight",
        "",
        "[link](https://example.com) and `inline code`",
        "",
        "> quoted text",
      ].join("\n")
    )

    await page.goto("/editor/new?source=local-draft")

    const styles = await page.getByTestId("github-markdown-write-pane").evaluate((pane) => {
      const readStyle = (selector: string) => {
        const element = pane.querySelector(selector)
        if (!element) throw new Error(`${selector} not found`)
        const style = window.getComputedStyle(element)
        return {
          backgroundColor: style.backgroundColor,
          color: style.color,
        }
      }

      return {
        editor: readStyle(".cm-editor"),
        scroller: readStyle(".cm-scroller"),
        content: readStyle(".cm-content"),
        line: readStyle(".cm-line"),
        tokenColors: Array.from(pane.querySelectorAll(".cm-line span"))
          .map((span) => window.getComputedStyle(span).color)
          .filter((color, index, colors) => colors.indexOf(color) === index),
        gutters: readStyle(".cm-gutters"),
      }
    })

    expect(styles.editor.backgroundColor).toBe("rgb(13, 17, 23)")
    expect(styles.scroller.backgroundColor).toBe("rgb(13, 17, 23)")
    expect(styles.content.backgroundColor).toBe("rgb(13, 17, 23)")
    expect(styles.gutters.backgroundColor).toBe("rgb(13, 17, 23)")
    expect(styles.line.color).toBe("rgb(230, 237, 243)")
    expect(styles.tokenColors).toContain("rgb(121, 192, 255)")
    expect(styles.tokenColors).not.toEqual(["rgb(230, 237, 243)"])
  })

  test("split preview uses the same readable width and typography contract as post detail", async ({
    page,
  }) => {
    await routeAuthenticatedEditor(page)

    await page.goto("/editor/new?source=local-draft")

    const previewContract = await page
      .getByTestId("github-markdown-preview-pane")
      .locator("article")
      .evaluate((article) => {
        const markdownRoot = article.querySelector(".aq-markdown")
        if (!(markdownRoot instanceof HTMLElement)) throw new Error("preview markdown root not found")
        const articleStyle = window.getComputedStyle(article)
        const style = window.getComputedStyle(markdownRoot)
        const rect = markdownRoot.getBoundingClientRect()
        return {
          paddingLeft: articleStyle.paddingLeft,
          paddingRight: articleStyle.paddingRight,
          maxWidth: style.maxWidth,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          renderedWidth: rect.width,
        }
      })

    expect(previewContract.paddingLeft).toBe("16px")
    expect(previewContract.paddingRight).toBe("16px")
    expect(previewContract.maxWidth).toBe("768px")
    expect(previewContract.fontSize).toBe("17px")
    expect(previewContract.lineHeight).toBe("28px")
    expect(previewContract.renderedWidth).toBeLessThanOrEqual(768)
  })

  test("narrow split mode keeps the write pane primary and shows detail preview through the Preview tab", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 760, height: 900 })
    await routeAuthenticatedEditor(page)

    await page.goto("/editor/new?source=local-draft")

    const writePane = page.getByTestId("github-markdown-write-pane")
    const previewPane = page.getByTestId("github-markdown-preview-pane")

    await expect(writePane).toBeVisible()
    await expect(previewPane).toBeHidden()

    await page.getByRole("tab", { name: "Preview" }).click()

    await expect(writePane).toHaveCount(0)
    await expect(previewPane).toBeVisible()
    const previewContract = await previewPane.locator(".aq-markdown").evaluate((markdownRoot) => {
      const style = window.getComputedStyle(markdownRoot)
      const rect = markdownRoot.getBoundingClientRect()
      return {
        maxWidth: style.maxWidth,
        renderedWidth: rect.width,
      }
    })

    expect(previewContract.maxWidth).toBe("768px")
    expect(previewContract.renderedWidth).toBeLessThanOrEqual(728)
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
