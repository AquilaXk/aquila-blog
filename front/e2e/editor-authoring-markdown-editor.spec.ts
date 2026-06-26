import { Buffer } from "node:buffer"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { resolve } from "node:path"
import type { Page, Route } from "./helpers/authoringPlaywright"
import { expect, test } from "./helpers/authoringPlaywright"

const sourcePath = (...segments: string[]) => resolve(__dirname, "../src", ...segments)
const frontPath = (...segments: string[]) => resolve(__dirname, "..", ...segments)
const joinParts = (...parts: string[]) => parts.join("")
const localDraftStorageKey = "admin.editor.localDraft.v1"
const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
)
const adminMember = {
  id: 1,
  username: "qa-admin",
  nickname: "aquila",
  isAdmin: true,
}
const longMarkdownDraft = [
  "# Markdown Rendering Contract",
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

const routeAuthenticatedEditor = async (page: Page, markdown = longMarkdownDraft) => {
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
          title: "Markdown 작성 테스트",
          content,
          summary: "Markdown split editor test",
          thumbnailUrl: "",
          thumbnailFocusX: 50,
          thumbnailFocusY: 50,
          thumbnailZoom: 1,
          tags: ["markdown", "507"],
          category: "",
          visibility: "PUBLIC_UNLISTED",
          savedAt: new Date().toISOString(),
        })
      )
    },
    { storageKey: localDraftStorageKey, content: markdown }
  )
}

test.describe("Markdown editor replacement", () => {
  test("legacy block editor implementation and route files are removed from the frontend tree", () => {
    const forbiddenPaths = [
      sourcePath("components", "editor"),
      sourcePath("pages", "_qa", joinParts("block", "-", "editor", "-", "slash.tsx")),
      sourcePath("routes", "Admin", joinParts("Qa", "Editor", "Harness.tsx")),
    ]

    expect(forbiddenPaths.filter((path) => existsSync(path))).toEqual([])
  })

  test("authoring e2e suite no longer depends on legacy block editor selectors", () => {
    const e2eRoot = frontPath("e2e")
    const forbiddenPatterns = [
      joinParts("Block", "Editor", "Engine"),
      joinParts("Block", "Editor", "Shell"),
      joinParts("block", "-", "editor", "-", "prose", "mirror"),
      joinParts("_qa/", "block", "-", "editor", "-", "slash"),
      joinParts(".aq-", "block", "-", "editor", "__content"),
      "aq-code-editor-content",
      "aq-code-highlight-layer",
      "data-code-block-wrapper",
    ]
    const allowedFiles = new Set(["editor-authoring-markdown-editor.spec.ts"])
    const violations: string[] = []

    const scan = (directory: string) => {
      for (const entry of readdirSync(directory)) {
        const entryPath = resolve(directory, entry)
        const stat = statSync(entryPath)
        if (stat.isDirectory()) {
          if (entry === "node_modules" || entry === "test-results" || entry === "playwright-report") continue
          scan(entryPath)
          continue
        }
        if (!entryPath.endsWith(".ts") || allowedFiles.has(entry)) continue

        const source = readFileSync(entryPath, "utf8")
        const matched = forbiddenPatterns.filter((pattern) => source.includes(pattern))
        if (matched.length > 0) violations.push(`${entryPath.replace(`${frontPath("")}/`, "")}: ${matched.join(", ")}`)
      }
    }

    scan(e2eRoot)

    expect(violations).toEqual([])
  })

  test("writer host uses Markdown split editor instead of the legacy block editor", () => {
    const writerHostSource = readFileSync(sourcePath("routes/Admin/WriterEditorHost.tsx"), "utf8")
    const markdownEditorSource = readFileSync(
      sourcePath("components/markdown-editor/MarkdownEditor.tsx"),
      "utf8"
    )

    expect(writerHostSource).not.toContain(joinParts("Block", "Editor", "Shell"))
    expect(writerHostSource).not.toContain(joinParts("block", "Editor", "Contract"))
    expect(writerHostSource).toContain("MarkdownEditor")
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
    expect(composeRootSource).not.toContain(joinParts("BLOCK", "_EDITOR", "_V2", "_MERMAID", "_ENABLED"))
    expect(composeRootSource).not.toContain(joinParts("handle", "Block", "Editor", "Change"))
  })

  test("publish confirmation modal follows the admin neutral dialog contract", async ({ page }) => {
    await routeAuthenticatedEditor(page)

    await page.goto("/editor/new?source=local-draft")
    await page.getByRole("button", { name: /^(발행 설정|발행|새 글 작성|수정 반영)$/ }).first().click()

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

    expect(dialogContract.borderRadius).toBeLessThanOrEqual(12)
    expect(dialogContract.width).toBeLessThanOrEqual(1120)
    expect(dialogContract.backgroundImage).toBe("none")
  })

  test("publish modal uses an admin workflow layout instead of stacked explanation cards", async ({ page }) => {
    await routeAuthenticatedEditor(page)

    await page.goto("/editor/new?source=local-draft")
    await page.getByRole("button", { name: /^(발행 설정|발행|새 글 작성|수정 반영)$/ }).first().click()

    const dialog = page.getByRole("dialog", { name: /^(발행 설정|새 글 작성|수정 설정)$/ })
    await expect(dialog).toBeVisible()

    const layout = await dialog.evaluate((element) => {
      const previewPanel = element.querySelector<HTMLElement>("[data-testid='publish-preview-panel']")
      const visibilityPanel = element.querySelector<HTMLElement>("[data-testid='publish-visibility-panel']")
      const optionButtons = Array.from(element.querySelectorAll<HTMLButtonElement>("[aria-pressed]"))
      const optionHeights = optionButtons.map((button) => button.getBoundingClientRect().height)
      const previewRect = previewPanel?.getBoundingClientRect()
      const visibilityRect = visibilityPanel?.getBoundingClientRect()

      return {
        previewLeft: previewRect?.left ?? 0,
        visibilityLeft: visibilityRect?.left ?? 0,
        maxOptionHeight: Math.max(...optionHeights),
        optionCount: optionButtons.length,
      }
    })

    expect(layout.optionCount).toBe(3)
    expect(layout.previewLeft).toBeLessThan(layout.visibilityLeft)
    expect(layout.maxOptionHeight).toBeLessThanOrEqual(60)
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

  test("/editor/new renders Markdown write and preview panes for 507-style bottom content", async ({
    page,
  }) => {
    await routeAuthenticatedEditor(page)

    await page.goto("/editor/new?source=local-draft")

    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue("Markdown 작성 테스트")
    await expect(page.getByTestId("markdown-editor")).toBeVisible()
    await expect(page.getByTestId("markdown-editor-write-pane")).toBeVisible()
    await expect(page.getByTestId("markdown-editor-preview-pane")).toBeVisible()
    await expect(page.locator("[data-testid='keyboard-block-selection-overlay']")).toHaveCount(0)
    await expect(page.locator("[data-testid='block-drag-handle']")).toHaveCount(0)

    const preview = page.getByTestId("markdown-editor-preview-pane")
    await expect(preview.getByRole("heading", { name: "Markdown Rendering Contract" })).toBeVisible()
    await expect(preview.locator("table")).toContainText("507")
    await expect(preview.locator("pre")).toContainText("console.log(\"507-code\")")
    await expect(preview.locator("input[type='checkbox']")).toHaveCount(2)
    await expect(preview.getByText("quote at the bottom")).toBeVisible()
  })

  test("split preview reserves the V4 public preview header before body content", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await routeAuthenticatedEditor(page, "ㄷㄷㄷ")

    await page.goto("/editor/new?source=local-draft")

    await expect(page.getByTestId("markdown-editor-write-pane").locator("textarea")).toBeVisible()
    await expect(page.getByTestId("markdown-editor-preview-pane").getByText("ㄷㄷㄷ")).toBeVisible()

    const startPointContract = await page.evaluate(() => {
      const writePane = document.querySelector<HTMLElement>("[data-testid='markdown-editor-write-pane']")
      const previewPane = document.querySelector<HTMLElement>("[data-testid='markdown-editor-preview-pane']")
      const textarea = writePane?.querySelector<HTMLTextAreaElement>("textarea")
      const firstPreviewBlock = previewPane?.querySelector<HTMLElement>(".aq-markdown > :first-child")
      if (!writePane || !previewPane || !textarea || !firstPreviewBlock) {
        throw new Error("markdown split pane elements not found")
      }

      const writePaneRect = writePane.getBoundingClientRect()
      const previewPaneRect = previewPane.getBoundingClientRect()
      const textareaRect = textarea.getBoundingClientRect()
      const textareaStyle = window.getComputedStyle(textarea)
      const firstPreviewBlockRect = firstPreviewBlock.getBoundingClientRect()

      return {
        writeStartLeft: textareaRect.left + Number.parseFloat(textareaStyle.paddingLeft) - writePaneRect.left,
        writeStartTop: textareaRect.top + Number.parseFloat(textareaStyle.paddingTop) - writePaneRect.top,
        previewStartLeft: firstPreviewBlockRect.left - previewPaneRect.left,
        previewStartTop: firstPreviewBlockRect.top - previewPaneRect.top,
      }
    })

    expect(Math.abs(startPointContract.writeStartLeft - startPointContract.previewStartLeft)).toBeLessThanOrEqual(12)
    expect(startPointContract.previewStartTop).toBeGreaterThan(startPointContract.writeStartTop + 160)
  })

  test("dedicated editor exposes V4 full-screen chrome around the editor", async ({ page }) => {
    await page.setViewportSize({ width: 2048, height: 1152 })
    await routeAuthenticatedEditor(page, "본문이 없습니다.")

    await page.goto("/editor/new?source=local-draft")

    const editor = page.getByTestId("markdown-editor")
    const exitButton = page.getByRole("button", { name: "← 글 관리" })
    const guideButton = page.getByRole("button", { name: "Markdown 가이드" })
    const publishButton = page.getByRole("button", { name: "발행 설정" }).first()
    await expect(editor).toBeVisible()
    await expect(exitButton).toBeVisible()
    await expect(guideButton).toBeVisible()
    await expect(publishButton).toBeVisible()
    await expect(page.getByRole("heading", { name: "Document outline" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Publish inspector" })).toBeVisible()
    await expect(page.getByLabel("Summary")).toHaveAttribute("maxLength", "150")

    await page.getByLabel("Summary").fill("x".repeat(200))
    await expect(page.getByLabel("Summary")).toHaveValue("x".repeat(150))

    await page.getByPlaceholder("제목을 입력하세요").fill("")
    await page.getByLabel("Markdown 본문").fill("")
    await page.getByLabel("Summary").fill("")
    await expect(page.locator('aside[aria-label="발행 설정"] b[data-tone="warn"]')).toHaveCount(2)

    const editorBox = await editor.boundingBox()
    const exitBox = await exitButton.boundingBox()
    const publishBox = await publishButton.boundingBox()
    expect(editorBox).not.toBeNull()
    expect(exitBox).not.toBeNull()
    expect(publishBox).not.toBeNull()
    if (!editorBox || !exitBox || !publishBox) return

    expect(exitBox.y).toBeLessThan(editorBox.y)
    expect(publishBox.y).toBeLessThan(editorBox.y)
  })

  test("preview matches supported table markdown for alignment, escaped pipes, and inline cell formatting", async ({
    page,
  }) => {
    await routeAuthenticatedEditor(
      page,
      [
        "# Table parity",
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

    const preview = page.getByTestId("markdown-editor-preview-pane")
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
    expect(tableContract.clientWidth).toBeLessThanOrEqual(tableContract.shellWidth + 1)
    expect(tableContract.tableWidth).toBeLessThanOrEqual(tableContract.scrollWidth + 1)

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

  test("write pane uses the V4 dark markdown source surface", async ({ page }) => {
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

    const styles = await page.getByTestId("markdown-editor-write-pane").evaluate((pane) => {
      const gutterTestId = ["markdown", "editor", "line", "number", "gutter"].join("-")
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
        frame: readStyle("[data-testid='markdown-textarea-frame']"),
        textarea: readStyle("textarea"),
        gutterCount: pane.querySelectorAll(`[data-testid='${gutterTestId}']`).length,
      }
    })

    expect(styles.frame.backgroundColor).toBe("rgb(15, 23, 40)")
    expect(styles.textarea.backgroundColor).toBe(styles.frame.backgroundColor)
    expect(styles.gutterCount).toBe(0)
    expect(styles.textarea.color).toBe("rgb(217, 228, 247)")
  })

  test("write pane focus does not render the global blue textarea outline", async ({ page }) => {
    await routeAuthenticatedEditor(
      page,
      [
        "### Stateful",
        "",
        "Markdown textarea focus should keep the writing surface visually stable.",
      ].join("\n")
    )

    await page.goto("/editor/new?source=local-draft")

    const textarea = page.getByTestId("markdown-editor-write-pane").locator("textarea")
    await expect(textarea).toBeVisible()
    await textarea.click()
    await textarea.pressSequentially("\n\n추가 입력")

    const focusContract = await textarea.evaluate((element) => {
      const style = window.getComputedStyle(element)
      return {
        active: document.activeElement === element,
        outlineColor: style.outlineColor,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      }
    })

    expect(focusContract.active).toBe(true)
    expect(focusContract.outlineStyle).toBe("none")
    expect(focusContract.outlineWidth).toBe("0px")
    expect(focusContract.outlineColor).not.toBe("rgb(63, 81, 181)")
  })

  test("write pane supports native mouse drag text selection", async ({ page }) => {
    await routeAuthenticatedEditor(
      page,
      [
        "# Drag Selection",
        "",
        "마우스 드래그로 이 문장을 선택할 수 있어야 합니다.",
        "선택이 풀리거나 preview pane으로 focus가 튀면 안 됩니다.",
      ].join("\n")
    )

    await page.goto("/editor/new?source=local-draft")

    const writePane = page.getByTestId("markdown-editor-write-pane")
    await expect(writePane).toBeVisible()
    const textarea = writePane.locator("textarea")
    await expect(textarea).toBeVisible()

    const textareaBox = await textarea.boundingBox()
    expect(textareaBox).not.toBeNull()
    if (!textareaBox) return

    const dragMetrics = await textarea.evaluate((element) => {
      const style = window.getComputedStyle(element)
      return {
        lineHeight: Number.parseFloat(style.lineHeight),
        paddingTop: Number.parseFloat(style.paddingTop),
        paddingLeft: Number.parseFloat(style.paddingLeft),
      }
    })
    const targetY = textareaBox.y + dragMetrics.paddingTop + dragMetrics.lineHeight * 2 + dragMetrics.lineHeight / 2

    await page.mouse.move(textareaBox.x + dragMetrics.paddingLeft, targetY)
    await page.mouse.down()
    await page.mouse.move(textareaBox.x + dragMetrics.paddingLeft + 330, targetY, {
      steps: 12,
    })
    await page.mouse.up()

    const selectionState = await textarea.evaluate((element) => {
      return {
        selectedText: element.value.slice(element.selectionStart, element.selectionEnd),
        selectionStart: element.selectionStart,
        selectionEnd: element.selectionEnd,
        activeInsideWritePane: document.activeElement === element,
      }
    })

    expect(selectionState.selectionEnd).toBeGreaterThan(selectionState.selectionStart)
    expect(selectionState.selectedText).toContain("드래그")
    expect(selectionState.selectedText).toContain("선택")
    expect(selectionState.activeInsideWritePane).toBe(true)
  })

  test("split preview keeps readable width and typography while matching the write start", async ({
    page,
  }) => {
    await routeAuthenticatedEditor(page)

    await page.goto("/editor/new?source=local-draft")

    const previewContract = await page
      .getByTestId("markdown-editor-preview-pane")
      .locator("article")
      .evaluate((article) => {
        const markdownRoot = article.querySelector(".aq-markdown")
        if (!(markdownRoot instanceof HTMLElement)) throw new Error("preview markdown root not found")
        const articleStyle = window.getComputedStyle(article)
        const style = window.getComputedStyle(markdownRoot)
        const rect = markdownRoot.getBoundingClientRect()
        return {
          articleBackground: articleStyle.backgroundColor,
          paddingLeft: articleStyle.paddingLeft,
          paddingRight: articleStyle.paddingRight,
          marginTop: style.marginTop,
          maxWidth: style.maxWidth,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          renderedWidth: rect.width,
        }
    })

    expect(previewContract.articleBackground).not.toBe("rgb(13, 17, 23)")
    expect(previewContract.paddingLeft).toBe("44px")
    expect(previewContract.paddingRight).toBe("44px")
    expect(previewContract.marginTop).toBe("0px")
    expect(previewContract.maxWidth).toBe("760px")
    expect(previewContract.fontSize).toBe("17px")
    expect(previewContract.lineHeight).toBe("28px")
    expect(previewContract.renderedWidth).toBeLessThanOrEqual(760)
  })

  test("narrow split mode keeps the write pane primary and shows detail preview through the Preview tab", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 760, height: 900 })
    await routeAuthenticatedEditor(page)

    await page.goto("/editor/new?source=local-draft")

    const writePane = page.getByTestId("markdown-editor-write-pane")
    const previewPane = page.getByTestId("markdown-editor-preview-pane")

    await expect(writePane).toBeVisible()
    await expect(previewPane).toBeVisible()

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

    expect(previewContract.maxWidth).toBe("760px")
    expect(previewContract.renderedWidth).toBeLessThanOrEqual(728)
  })

  test("split panes keep write and preview scroll positions synchronized", async ({ page }) => {
    const longMarkdown = Array.from({ length: 64 }, (_, index) => [
      `## Section ${index + 1}`,
      "",
      `긴 글 작성 위치와 미리보기 위치가 함께 움직여야 합니다. paragraph ${index + 1}`,
      "",
      "| Column 1 | Column 2 |",
      "| --- | --- |",
      `| Value ${index + 1} | Result ${index + 1} |`,
      "",
    ].join("\n")).join("\n")

    await routeAuthenticatedEditor(page, longMarkdown)

    await page.goto("/editor/new?source=local-draft")

    const textarea = page.getByTestId("markdown-editor-write-pane").locator("textarea")
    const previewPane = page.getByTestId("markdown-editor-preview-pane")
    const previewScroll = previewPane
    await expect(textarea).toBeVisible()
    await expect(previewPane).toBeVisible()
    await expect(previewScroll).toBeVisible()

    const textareaScroll = await textarea.evaluate((element) => {
      element.scrollTop = element.scrollHeight
      element.dispatchEvent(new Event("scroll", { bubbles: true }))
      return {
        top: element.scrollTop,
        max: element.scrollHeight - element.clientHeight,
      }
    })
    expect(textareaScroll.max).toBeGreaterThan(0)

    await expect
      .poll(async () => previewScroll.evaluate((element) => element.scrollTop), {
        message: "preview pane should follow write pane scrolling",
      })
      .toBeGreaterThan(0)

    const previewAtBottom = await previewScroll.evaluate((element) => ({
      top: element.scrollTop,
      max: element.scrollHeight - element.clientHeight,
    }))
    expect(previewAtBottom.max).toBeGreaterThan(0)

    await previewScroll.evaluate((element) => {
      element.scrollTop = 0
      element.dispatchEvent(new Event("scroll", { bubbles: true }))
    })

    await expect
      .poll(async () => textarea.evaluate((element) => element.scrollTop), {
        message: "write pane should follow preview pane scrolling",
      })
      .toBeLessThan(textareaScroll.top)
  })

  test("분할 미리보기 wheel은 내부 스크롤 가능 구간에서 미리보기를 먼저 스크롤한다", async ({ page }) => {
    const longMarkdown = Array.from({ length: 32 }, (_, index) => [
      `## Section ${index + 1}`,
      "",
      `preview 내부 wheel 스크롤이 먼저 동작해야 합니다. paragraph ${index + 1}`,
      "",
      "| Column 1 | Column 2 |",
      "| --- | --- |",
      `| Value ${index + 1} | Result ${index + 1} |`,
      "",
    ].join("\n")).join("\n")

    await routeAuthenticatedEditor(page, longMarkdown)

    await page.goto("/editor/new?source=local-draft")

    const previewScroll = page.getByTestId("markdown-editor-preview-pane")
    await expect(previewScroll).toBeVisible()
    await previewScroll.evaluate((element) => {
      element.scrollTop = 0
    })

    const box = await previewScroll.boundingBox()
    if (!box) {
      throw new Error("preview scroll metrics are missing before wheel")
    }

    const beforeDocumentScrollTop = await page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY)
    await page.mouse.move(box.x + Math.min(box.width / 2, 160), box.y + Math.min(box.height / 2, 160))
    await page.mouse.wheel(0, 420)

    await expect
      .poll(async () => previewScroll.evaluate((element) => element.scrollTop), {
        message: "preview wheel should keep native preview scrolling active before overscroll",
      })
      .toBeGreaterThan(80)
    await expect
      .poll(async () => page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY), {
        message: "window should not scroll while preview can consume the wheel",
      })
      .toBe(beforeDocumentScrollTop)
  })

  test("분할 미리보기 wheel은 끝에서 문서 페이지 스크롤 체인을 유지한다", async ({ page }) => {
    const longMarkdown = Array.from({ length: 24 }, (_, index) => [
      `## Section ${index + 1}`,
      "",
      "```ts",
      `const previewWheelScrollChain${index + 1} = true`,
      "```",
      "",
      "| Column 1 | Column 2 |",
      "| --- | --- |",
      `| Value ${index + 1} | Result ${index + 1} |`,
      "",
    ].join("\n")).join("\n")

    await routeAuthenticatedEditor(page, longMarkdown)

    await page.goto("/editor/new?source=local-draft")

    const previewScroll = page.getByTestId("markdown-editor-preview-pane")
    await expect(previewScroll).toBeVisible()
    await previewScroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await previewScroll.locator("table").last().scrollIntoViewIfNeeded()

    await page.evaluate(() => {
      if (document.querySelector("[data-testid='markdown-preview-wheel-spacer']")) return
      const spacer = document.createElement("div")
      spacer.setAttribute("data-testid", "markdown-preview-wheel-spacer")
      spacer.style.height = "1600px"
      document.body.appendChild(spacer)
    })

    const box = await previewScroll.locator("table").last().boundingBox()
    if (!box) {
      throw new Error("preview table metrics are missing before wheel")
    }

    await page.mouse.move(box.x + Math.min(box.width / 2, 120), box.y + Math.min(box.height / 2, 40))
    const beforeScrollTop = await page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY)
    await page.mouse.wheel(0, 420)

    await expect
      .poll(async () => page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY), {
        message: "preview wheel should keep page scroll chaining active",
      })
      .toBeGreaterThan(beforeScrollTop + 80)
  })

  test("분할 미리보기 wheel은 끝을 넘는 남은 스크롤을 문서로 전달한다", async ({ page }) => {
    const longMarkdown = Array.from({ length: 32 }, (_, index) => [
      `## Section ${index + 1}`,
      "",
      `preview 끝 근처 wheel 잔여량이 문서 스크롤로 전달되어야 합니다. paragraph ${index + 1}`,
      "",
      "| Column 1 | Column 2 |",
      "| --- | --- |",
      `| Value ${index + 1} | Result ${index + 1} |`,
      "",
    ].join("\n")).join("\n")

    await routeAuthenticatedEditor(page, longMarkdown)

    await page.goto("/editor/new?source=local-draft")

    const previewScroll = page.getByTestId("markdown-editor-preview-pane")
    await expect(previewScroll).toBeVisible()

    await page.evaluate(() => {
      if (document.querySelector("[data-testid='markdown-preview-wheel-remainder-spacer']")) return
      const spacer = document.createElement("div")
      spacer.setAttribute("data-testid", "markdown-preview-wheel-remainder-spacer")
      spacer.style.height = "1600px"
      document.body.appendChild(spacer)
    })

    const edgeState = await previewScroll.evaluate((element) => {
      const max = element.scrollHeight - element.clientHeight
      element.scrollTop = Math.max(0, max - 10)
      return {
        max,
        top: element.scrollTop,
      }
    })
    expect(edgeState.max).toBeGreaterThan(10)

    const box = await previewScroll.boundingBox()
    if (!box) {
      throw new Error("preview scroll metrics are missing before remainder wheel")
    }

    const beforeDocumentScrollTop = await page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY)
    await page.mouse.move(box.x + Math.min(box.width / 2, 160), box.y + Math.min(box.height / 2, 160))
    await page.mouse.wheel(0, 420)

    await expect
      .poll(async () => previewScroll.evaluate((element) => element.scrollTop), {
        message: "preview should clamp to the scroll edge before forwarding wheel remainder",
      })
      .toBeGreaterThanOrEqual(edgeState.max - 1)
    await expect
      .poll(async () => page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY), {
        message: "remaining wheel delta should scroll the document after preview reaches its edge",
      })
      .toBeGreaterThan(beforeDocumentScrollTop + 80)
  })

  test("분할 미리보기 wheel은 라인 단위 delta도 픽셀로 환산해 남은 스크롤을 전달한다", async ({ page }) => {
    const longMarkdown = Array.from({ length: 32 }, (_, index) => [
      `## Section ${index + 1}`,
      "",
      `line delta wheel 잔여량이 문서 스크롤로 전달되어야 합니다. paragraph ${index + 1}`,
      "",
      "| Column 1 | Column 2 |",
      "| --- | --- |",
      `| Value ${index + 1} | Result ${index + 1} |`,
      "",
    ].join("\n")).join("\n")

    await routeAuthenticatedEditor(page, longMarkdown)

    await page.goto("/editor/new?source=local-draft")

    const previewScroll = page.getByTestId("markdown-editor-preview-pane")
    await expect(previewScroll).toBeVisible()

    await page.evaluate(() => {
      const win = window as typeof window & { __previewWheelScrollByCalls?: number[] }
      win.__previewWheelScrollByCalls = []
      const originalScrollBy = window.scrollBy.bind(window)
      window.scrollBy = ((options?: ScrollToOptions | number, y?: number) => {
        const top = typeof options === "number" ? y ?? 0 : options?.top ?? 0
        win.__previewWheelScrollByCalls?.push(top)
        if (typeof options === "number") {
          originalScrollBy(options, y ?? 0)
          return
        }
        originalScrollBy(options)
      }) as typeof window.scrollBy
    })

    const eventState = await previewScroll.evaluate((element) => {
      element.style.lineHeight = "24px"
      const max = element.scrollHeight - element.clientHeight
      element.scrollTop = Math.max(0, max - 10)
      const wheelEvent = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaMode: WheelEvent.DOM_DELTA_LINE,
        deltaY: 2,
      })
      element.dispatchEvent(wheelEvent)
      return {
        max,
        top: element.scrollTop,
      }
    })

    expect(eventState.max).toBeGreaterThan(10)
    expect(eventState.top).toBeGreaterThanOrEqual(eventState.max - 1)
    const scrollByCalls = await page.evaluate(() => (window as typeof window & { __previewWheelScrollByCalls?: number[] }).__previewWheelScrollByCalls ?? [])
    expect(scrollByCalls.some((top) => top > 20)).toBe(true)
  })

  test("toolbar snippets insert at the textarea caret instead of appending at the document end", async ({
    page,
  }) => {
    await routeAuthenticatedEditor(page, ["alpha", "omega"].join("\n"))

    await page.goto("/editor/new?source=local-draft")

    const writePane = page.getByTestId("markdown-editor-write-pane")
    await expect(writePane).toBeVisible()
    await writePane.locator("textarea").click()
    await page.keyboard.press(process.platform === "darwin" ? "Meta+Home" : "Control+Home")
    await page.keyboard.press("ArrowRight")
    await page.getByRole("button", { name: "표" }).click()

    const editorText = await writePane.locator("textarea").inputValue()
    expect(editorText.indexOf("| 항목 | 설명 |")).toBeLessThan(editorText.indexOf("omega"))
    await expect(page.getByTestId("markdown-editor-preview-pane").locator("table")).toContainText("항목")
  })

  test("image upload inserts a url-only upload response at the textarea caret", async ({ page }) => {
    await routeAuthenticatedEditor(page, ["alpha", "omega"].join("\n"))
    let uploadCalled = false
    await page.route("**/post/api/v1/posts/images", async (route) => {
      uploadCalled = true
      await fulfillJson(route, {
        resultCode: "201-1",
        msg: "이미지가 업로드되었습니다.",
        data: {
          key: "post-images/body-image.png",
          url: "https://cdn.example.test/post-images/body-image.png",
        },
      })
    })

    await page.goto("/editor/new?source=local-draft")

    const writePane = page.getByTestId("markdown-editor-write-pane")
    const textarea = writePane.locator("textarea")
    await expect(textarea).toBeVisible()
    await textarea.click()
    await page.keyboard.press(process.platform === "darwin" ? "Meta+Home" : "Control+Home")
    await page.keyboard.press("ArrowRight")

    await page
      .getByTestId("markdown-editor")
      .locator("input[type='file'][accept='image/*']")
      .setInputFiles({
        name: "본문 이미지.png",
        mimeType: "image/png",
        buffer: onePixelPng,
      })

    await expect.poll(() => uploadCalled, { message: "post image upload request should be sent" }).toBe(true)
    await expect(page.getByText("이미지 업로드에 실패했습니다.")).toHaveCount(0)
    await expect(page.getByText(/이미지 업로드 실패:/)).toHaveCount(0)

    const editorText = await textarea.inputValue()
    const imageMarkdown = "![본문 이미지.png](https://cdn.example.test/post-images/body-image.png)"
    expect(editorText).toContain(imageMarkdown)
    expect(editorText.indexOf(imageMarkdown)).toBeLessThan(editorText.indexOf("omega"))
    await expect(page.getByTestId("markdown-editor-preview-pane").locator("img")).toHaveAttribute(
      "src",
      "https://cdn.example.test/post-images/body-image.png"
    )
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

    const preview = page.getByTestId("markdown-editor-preview-pane")
    await expect(preview).toBeVisible()
    await expect(preview.locator("script")).toHaveCount(0)
    await expect(preview.locator("a[href^='javascript:']")).toHaveCount(0)
    await expect(preview.locator("img[src^='javascript:']")).toHaveCount(0)
    await expect
      .poll(() => page.evaluate(() => Boolean((window as unknown as { __markdownPreviewScript?: boolean }).__markdownPreviewScript)))
      .toBe(false)
  })

  test("code block language labels keep common fenced language aliases out of TXT fallback", async ({
    page,
  }) => {
    const languageCases = [
      ["java", "public Token login(User user) {\n  return new Token(access, refresh);\n}", "Java"],
      ["js", "const value = 1", "JavaScript"],
      ["javascript", "const value = 1", "JavaScript"],
      ["ts", "const value: string = 'ok'", "TypeScript"],
      ["typescript", "const value: string = 'ok'", "TypeScript"],
      ["tsx", "export const View = () => <div />", "TSX"],
      ["jsx", "export const View = () => <div />", "JSX"],
      ["kotlin", "fun login(): Token = token", "Kotlin"],
      ["kt", "val token = Token()", "Kotlin"],
      ["python", "def login():\n    return token", "Python"],
      ["py", "def login():\n    return token", "Python"],
      ["bash", "echo hello", "Bash"],
      ["sh", "echo hello", "Shell"],
      ["shell", "echo hello", "Shell"],
      ["sql", "SELECT * FROM users", "SQL"],
      ["yaml", "name: aquila", "YAML"],
      ["yml", "name: aquila", "YAML"],
      ["json", "{\"ok\": true}", "JSON"],
      ["html", "<main>hello</main>", "HTML"],
      ["xml", "<root>hello</root>", "XML"],
      ["css", ".login { color: red; }", "CSS"],
      ["scss", "$color: red;\n.login { color: $color; }", "SCSS"],
      ["markdown", "# Heading", "Markdown"],
      ["md", "# Heading", "Markdown"],
      ["go", "func main() {}", "Go"],
      ["rust", "fn main() {}", "Rust"],
      ["rs", "fn main() {}", "Rust"],
    ] as const

    await routeAuthenticatedEditor(
      page,
      languageCases
        .map(([language, source]) => ["```" + language, source, "```"].join("\n"))
        .join("\n\n")
    )

    await page.goto("/editor/new?source=local-draft")

    const codeTitles = page
      .getByTestId("markdown-editor-preview-pane")
      .locator(".aq-code-title")
    await expect(codeTitles).toHaveText(languageCases.map(([, , label]) => label))
    expect(await codeTitles.allTextContents()).not.toContain("TXT")
  })

  test("code block title metadata renders in the V4 header next to copy", async ({ page }) => {
    await routeAuthenticatedEditor(
      page,
      ["```kotlin title=\"UserService.kt\"", "fun login(): Token = token", "```"].join("\n")
    )

    await page.goto("/editor/new?source=local-draft")

    const preview = page.getByTestId("markdown-editor-preview-pane")
    const codeBlock = preview.locator(".aq-code-block").first()
    await expect(codeBlock.locator(".aq-code-title")).toHaveText("UserService.kt")
    await expect(codeBlock.locator(".aq-code-copy")).toHaveText("COPY")
  })
})
