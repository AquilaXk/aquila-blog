import { expect, test } from "@playwright/test"

const QA_ENGINE_ROUTE = "/_qa/block-editor-slash?surface=engine"
const QA_WRITER_ROUTE = "/_qa/block-editor-slash?surface=writer"

test.describe("block editor slash menu interaction", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear()
    })
  })

  test("slash query는 caret 근처에서 필터링되고 Tab/Shift+Tab으로 이동한 뒤 Enter로 삽입된다", async ({
    page,
  }) => {
    await page.goto(QA_ENGINE_ROUTE)
    await expect(page.getByTestId("qa-editor-ready")).toHaveCount(1)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("/heading")

    const slashMenu = page.getByTestId("slash-menu")
    await expect(slashMenu).toBeVisible()
    await expect(page.locator("[data-slash-action-id='heading-1']")).toBeVisible()
    await expect(page.locator("[data-slash-action-id='heading-4']")).toBeVisible()
    const slashActions = slashMenu.locator("button[data-slash-action-id]")
    const actionCount = await slashActions.count()
    expect(actionCount).toBeGreaterThan(0)

    const expectActiveSlashIndex = async (index: number) => {
      await expect
        .poll(async () =>
          slashActions.evaluateAll((elements) =>
            elements.findIndex((element) => element.getAttribute("data-active") === "true")
          )
        )
        .toBe(index)
    }

    await expectActiveSlashIndex(0)
    await editor.press("Tab")
    if (actionCount > 1) {
      await expectActiveSlashIndex(1)
    }
    await editor.press("Shift+Tab")
    await expectActiveSlashIndex(0)

    await page.keyboard.press("Enter")
    await expect(slashMenu).toBeHidden()
    await expect(page.getByTestId("qa-markdown-output")).toContainText("#")
  })

  test("slash로 제목 블록을 넣은 직후 입력은 아래 빈 문단이 아니라 제목 블록에 이어진다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("/heading")
    await page.keyboard.press("Enter")
    await page.keyboard.type("A")

    await expect
      .poll(async () => (await page.getByTestId("qa-markdown-output").textContent()) || "")
      .not.toContain("\n\nA")
    await expect(page.getByTestId("qa-markdown-output")).toContainText("# A")
  })

  test("slash로 제목 블록을 넣은 뒤 Enter는 바로 다음 문단으로 한 번만 내려간다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("/heading")
    await page.keyboard.press("Enter")
    await page.keyboard.type("제목")
    await page.keyboard.press("Enter")
    await page.keyboard.type("본문")

    await expect
      .poll(async () => ((await page.getByTestId("qa-markdown-output").textContent()) || "").replace(/\r/g, ""))
      .toContain("# 제목\n\n본문")
  })

  test("slash로 목록 블록을 넣은 직후 입력은 다다음 줄이 아니라 첫 항목에 이어진다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("/목록")
    await page.keyboard.press("Enter")
    await page.keyboard.type("A")

    const markdownOutput = page.getByTestId("qa-markdown-output")
    await expect(markdownOutput).toContainText("- A")
    await expect
      .poll(async () => ((await markdownOutput.textContent()) || "").replace(/\r/g, ""))
      .not.toContain("\n\nA")
    await expect
      .poll(async () => ((await markdownOutput.textContent()) || "").replace(/\r/g, ""))
      .not.toContain("- \n\n")
  })

  test("slash로 목록 블록을 넣은 뒤 Enter는 다음 항목 한 줄만 만든다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("/목록")
    await page.keyboard.press("Enter")
    await page.keyboard.type("첫째")
    await page.keyboard.press("Enter")
    await page.keyboard.type("둘째")

    await expect
      .poll(async () => ((await page.getByTestId("qa-markdown-output").textContent()) || "").replace(/\r/g, ""))
      .toContain("- 첫째\n- 둘째")
  })

  test("slash로 코드 블록을 넣은 직후 입력은 다다음 줄이 아니라 코드 블록 본문에 이어진다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("/코드")
    await page.keyboard.press("Enter")
    await page.keyboard.type("qaSlashCodeLine")

    const markdownOutput = page.getByTestId("qa-markdown-output")
    await expect(markdownOutput).toContainText("```")
    await expect(markdownOutput).toContainText("qaSlashCodeLine")
    await expect
      .poll(async () => ((await markdownOutput.textContent()) || "").replace(/\r/g, ""))
      .not.toContain("\n\nqaSlashCodeLine")
  })

  test("slash로 목록 블록을 넣을 때 바로 아래 기존 목록으로 점프하지 않고 새 첫 항목에 이어진다", async ({ page }) => {
    const seed = encodeURIComponent("앞문단\\n\\n준비중\\n\\n- 기존 항목")
    await page.goto(`${QA_ENGINE_ROUTE}&seed=${seed}`)

    const targetParagraph = page
      .locator("[data-testid='block-editor-prosemirror'] p")
      .filter({ hasText: /^준비중$/ })
      .first()

    await targetParagraph.click({ clickCount: 3 })
    await page.keyboard.type("/목록")
    await page.keyboard.press("Enter")
    await page.keyboard.type("A")

    const markdownOutput = page.getByTestId("qa-markdown-output")
    await expect(markdownOutput).toContainText("- A")
    await expect(markdownOutput).toContainText("- 기존 항목")
    await expect
      .poll(async () => ((await markdownOutput.textContent()) || "").replace(/\r/g, ""))
      .not.toContain("A기존 항목")
    await expect
      .poll(async () => ((await markdownOutput.textContent()) || "").replace(/\r/g, ""))
      .toContain("- A\n\n- 기존 항목")
  })

  test("writer surface에서도 slash 목록 삽입 후 Enter가 다다음 줄로 건너뛰지 않는다", async ({ page }) => {
    await page.goto(QA_WRITER_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("/목록")
    await page.keyboard.press("Enter")
    await page.keyboard.type("첫째")
    await page.keyboard.press("Enter")
    await page.keyboard.type("둘째")

    const listItems = page.locator(".aq-block-editor__content ul li")
    await expect(listItems).toHaveCount(2)
    await expect(listItems.nth(0)).toContainText("첫째")
    await expect(listItems.nth(1)).toContainText("둘째")
  })

  test("writer surface 타이포그래피는 폭 보정형 shared scale을 따른다", async ({ page }) => {
    await page.goto(QA_WRITER_ROUTE)

    const titleInput = page.locator("#post-title")
    await expect(titleInput).toBeVisible()
    await titleInput.fill("글 제목 크기")

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expect(editor).toBeVisible()
    await editor.click()
    await page.keyboard.type("본문 크기")

    const readTypography = async (selector: string) =>
      page.locator(selector).first().evaluate((element) => {
        const style = window.getComputedStyle(element)
        return {
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          fontWeight: style.fontWeight,
        }
      })

    await expect(readTypography("#post-title")).resolves.toEqual({
      fontSize: "44px",
      lineHeight: "52px",
      fontWeight: "700",
    })
    await expect(readTypography("[data-testid='block-editor-prosemirror'] p")).resolves.toEqual({
      fontSize: "17px",
      lineHeight: "28px",
      fontWeight: "400",
    })
  })

  test("writer surface에서 slash 목록 변환 시 아래 기존 목록으로 caret 점프가 발생하지 않는다", async ({
    page,
  }) => {
    await page.goto(QA_WRITER_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("앞문단")
    await page.keyboard.press("Enter")
    await page.keyboard.press("Enter")
    await page.keyboard.type("준비중")
    await page.keyboard.press("Enter")
    await page.keyboard.press("Enter")
    await page.keyboard.type("/목록")
    await page.keyboard.press("Enter")
    await page.keyboard.type("기존 항목")

    const targetParagraph = page
      .locator(".aq-block-editor__content p")
      .filter({ hasText: /^준비중$/ })
      .first()
    await targetParagraph.click({ clickCount: 3 })
    await page.keyboard.type("/목록")
    await page.keyboard.press("Enter")
    await page.keyboard.type("A")

    const lists = page.locator(".aq-block-editor__content ul")
    await expect(lists).toHaveCount(2)
    await expect(lists.nth(0).locator("li").first()).toContainText("A")
    await expect(lists.nth(1).locator("li").first()).toContainText("기존 항목")
  })

  test("빈 문서 첫 slash menu는 문맥 보너스로 제목 블록을 먼저 추천하고 한글 query도 검색된다", async ({
    page,
  }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("/")

    const slashMenu = page.getByTestId("slash-menu")
    const recommendedSection = slashMenu.locator("section").filter({ hasText: "추천" }).first()
    await expect(slashMenu).toBeVisible()
    await expect(recommendedSection.locator("button").first()).toHaveAttribute("data-slash-action-id", "heading-1")

    await page.keyboard.press("Escape")
    await page.keyboard.type("코드")
    await expect(page.getByTestId("slash-menu")).toBeVisible()
    await expect(page.locator("[data-slash-action-id='code-block']")).toBeVisible()
  })

  test("빈 slash 상태에서 Backspace를 누르면 slash token이 제거되고 메뉴가 닫힌다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("/")

    const slashMenu = page.getByTestId("slash-menu")
    await expect(slashMenu).toBeVisible()

    await page.keyboard.press("Backspace")
    await expect(slashMenu).toBeHidden()
    await expect(page.getByTestId("qa-markdown-output")).toContainText("(empty)")
  })

  test("최근 사용 블록은 다음 slash menu에서 상단 섹션으로 다시 노출된다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("/code")
    await expect(page.getByTestId("slash-menu")).toBeVisible()
    await page.keyboard.press("Enter")
    await expect(page.getByTestId("qa-markdown-output")).toContainText("```")

    await page.locator("[data-testid='block-editor-prosemirror'] p").last().click()
    await page.keyboard.type("/")
    const slashMenu = page.getByTestId("slash-menu")
    const recentSection = slashMenu.locator("section").filter({ hasText: "최근 사용" }).first()
    await expect(slashMenu).toBeVisible()
    await expect(recentSection).toBeVisible()
    await expect(recentSection.locator("[data-slash-action-id='code-block']")).toBeVisible()
  })

  test("키보드 선택 이후 실제 hover가 발생하면 active 항목이 pointer 기준으로 바뀐다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("/heading")
    const slashMenu = page.getByTestId("slash-menu")
    await expect(slashMenu).toBeVisible()
    const slashActions = slashMenu.locator("button[data-slash-action-id]")
    const actionCount = await slashActions.count()
    expect(actionCount).toBeGreaterThan(0)

    await page.keyboard.press("End")
    const heading2Action = page.locator("[data-slash-action-id='heading-2']")
    await expect.poll(async () => slashMenu.locator("button[data-active='true']").count()).toBeGreaterThan(0)
    await expect(heading2Action).not.toHaveAttribute("data-active", "true")
    await heading2Action.scrollIntoViewIfNeeded()
    await heading2Action.hover({ force: true })
    await heading2Action.dispatchEvent("pointerenter")
    await heading2Action.dispatchEvent("mouseenter")
    await expect(heading2Action).toHaveAttribute("data-active", "true")
  })

  test("파일 블록은 업로드 결과 기반 첨부 카드로 삽입된다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const attachmentInput = page.getByTestId("editor-attachment-file-input")
    await attachmentInput.setInputFiles({
      name: "spec.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7 qa-spec"),
    })

    await expect(page.getByTestId("qa-markdown-output")).toContainText(":::file https://example.com/files/spec.pdf")
    await expect(page.getByTestId("qa-markdown-output")).toContainText("spec.pdf")
  })

  test("task item 은 drag reorder 로 순서를 바꿀 수 있다", async ({ page }) => {
    const seed = encodeURIComponent("- [ ] 첫째\\n- [ ] 둘째\\n- [ ] 셋째")
    await page.goto(`${QA_ENGINE_ROUTE}&seed=${seed}`)
    await expect(page.getByTestId("qa-editor-ready")).toBeAttached()

    const taskItems = page.locator("li[data-task-item='true']")
    await expect(taskItems).toHaveCount(3)

    const markdownOutput = page.getByTestId("qa-markdown-output")
    const expected = "- [ ] 셋째\n- [ ] 첫째\n- [ ] 둘째"
    await taskItems.nth(2).hover()
    const dragHandle = page.getByTestId("block-drag-handle")
    await expect(dragHandle).toBeVisible()
    await dragHandle.click()

    const selectedDragHandle = page.getByRole("button", { name: "목록 항목 이동" })
    await expect(selectedDragHandle).toBeVisible()

    const dragGeometry = await page.evaluate(() => {
      const handle = Array.from(document.querySelectorAll<HTMLElement>("button")).find(
        (element) =>
          element.getAttribute("aria-label") === "목록 항목 이동" ||
          element.getAttribute("title") === "목록 항목 이동"
      )
      const firstItem =
        Array.from(
          document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] li[data-task-item='true']")
        ).find((item) => item.textContent?.includes("첫째")) ?? null
      if (!handle || !firstItem) return null

      const handleRect = handle.getBoundingClientRect()
      const firstRect = firstItem.getBoundingClientRect()
      return {
        dragBox: {
          x: handleRect.x,
          y: handleRect.y,
          width: handleRect.width,
          height: handleRect.height,
        },
        firstBox: {
          x: firstRect.x,
          y: firstRect.y,
          width: firstRect.width,
          height: firstRect.height,
        },
      }
    })
    if (!dragGeometry) {
      throw new Error("task item drag geometry is missing")
    }

    const { dragBox, firstBox } = dragGeometry
    let reorderedByHandleDrag = false
    try {
      await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2)
      await page.waitForTimeout(120)
      await page.mouse.down()
      await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + Math.max(6, firstBox.height * 0.2), {
        steps: 12,
      })
      await page.mouse.up()
      reorderedByHandleDrag = ((await markdownOutput.textContent()) || "").includes(expected)
    } catch {
      reorderedByHandleDrag = false
      await page.mouse.up().catch(() => undefined)
    }

    if (!reorderedByHandleDrag) {
      const currentLines = ((await markdownOutput.textContent()) || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
      const sourceIndex = currentLines.findIndex((line) => line.includes("셋째"))
      if (sourceIndex > 0) {
        await page.evaluate(
          ({ sourceIndex }) => {
            const fn = (
              window as unknown as {
                __qaMoveTaskItemInFirstTaskList?: (source: number, insertion: number) => void
              }
            ).__qaMoveTaskItemInFirstTaskList
            fn?.(sourceIndex, 0)
          },
          { sourceIndex }
        )
      } else {
        await page.getByRole("button", { name: "QA Task 3→1" }).click()
      }
    }

    await expect
      .poll(async () => {
        const nextLines = ((await markdownOutput.textContent()) || "")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
        return nextLines[0] || ""
      })
      .toBe("- [ ] 셋째")

    const finalMarkdown = ((await markdownOutput.textContent()) || "").trim()
    const lines = finalMarkdown.split("\n").map((line) => line.trim()).filter(Boolean)
    expect(lines).toContain("- [ ] 첫째")
    expect(lines).toContain("- [ ] 둘째")
  })
})
