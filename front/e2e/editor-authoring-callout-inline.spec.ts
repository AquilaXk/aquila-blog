import { expect, test } from "@playwright/test"
import {
  QA_ENGINE_ROUTE,
  QA_WRITER_ROUTE,
  expectVisibleBox,
  getWordDragPoints,
  selectWordInEditable,
  setWordSelectionInEditable,
} from "./helpers/editorAuthoringFlow"

test.describe("editor authoring callout and inline formatting", () => {
  test("writer surface 토글 요약줄은 본문 스케일에 맞는 크기와 hit area를 유지한다", async ({ page }) => {
    await page.goto(QA_WRITER_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.getByRole("button", { name: "토글", exact: true }).first().click()

    const summary = page.getByTestId("toggle-block-summary").first()
    await expect(summary).toBeVisible()

    const metrics = await summary.evaluate((element) => {
      const summaryElement = element as HTMLElement
      const toggleRoot = summaryElement.closest("details")
      const titleInput = summaryElement.querySelector("input")
      const chevron = summaryElement.querySelector("[data-testid='toggle-block-chevron']")
      if (
        !(titleInput instanceof HTMLInputElement) ||
        !(chevron instanceof HTMLElement) ||
        !(toggleRoot instanceof HTMLElement) ||
        !(summaryElement.nextElementSibling instanceof HTMLElement)
      ) {
        return null
      }

      const summaryRect = summaryElement.getBoundingClientRect()
      const toggleRootRect = toggleRoot.getBoundingClientRect()
      const chevronRect = chevron.getBoundingClientRect()
      const titleRect = titleInput.getBoundingClientRect()
      const titleStyle = window.getComputedStyle(titleInput)
      const chevronStyle = window.getComputedStyle(chevron)
      const chevronShapeStyle = window.getComputedStyle(chevron, "::before")
      const bodyStyle = window.getComputedStyle(summaryElement.nextElementSibling)

      return {
        summaryHeight: summaryRect.height,
        chevronWidth: chevronRect.width,
        chevronHeight: chevronRect.height,
        chevronFontSize: Number.parseFloat(chevronStyle.fontSize),
        chevronClipPath: chevronShapeStyle.clipPath,
        titleOffset: titleRect.left - toggleRootRect.left,
        bodyIndent: Number.parseFloat(bodyStyle.paddingLeft),
        titleFontSize: Number.parseFloat(titleStyle.fontSize),
        titleLineHeight: Number.parseFloat(titleStyle.lineHeight),
      }
    })

    expect(metrics).not.toBeNull()
    expect(metrics?.summaryHeight ?? 0).toBeGreaterThanOrEqual(44)
    expect(metrics?.chevronWidth ?? 0).toBeGreaterThanOrEqual(18)
    expect(metrics?.chevronHeight ?? 0).toBeGreaterThanOrEqual(18)
    expect(metrics?.chevronClipPath ?? "").toContain("polygon")
    expect((metrics?.chevronHeight ?? 0) + 1).toBeGreaterThanOrEqual(metrics?.titleFontSize ?? 0)
    expect(Math.abs((metrics?.titleOffset ?? 0) - (metrics?.bodyIndent ?? 0))).toBeLessThanOrEqual(2)
    expect(metrics?.titleFontSize ?? 0).toBeGreaterThanOrEqual(17.5)
    expect(metrics?.titleLineHeight ?? 0).toBeGreaterThanOrEqual(26)
  })

  test("콜아웃 본문은 단일 리치 편집 surface로 동작하고 split preview를 노출하지 않는다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("앞 문단")

    await page.getByRole("button", { name: "QA 콜아웃" }).click()

    const calloutBodyContent = page.locator("[data-callout-body-content='true']").first()
    await expect(calloutBodyContent).toBeVisible()
    await expect(page.locator("[data-callout-markdown-role='body']")).toHaveCount(0)
    await expect(page.locator("[data-callout-markdown-preview='true']")).toHaveCount(0)

    await calloutBodyContent.click()
    await page.keyboard.type("콜아웃 첫 줄")
    await page.keyboard.press("Enter")
    await page.keyboard.type("콜아웃 둘째 줄")

    const leadParagraph = editor.locator("p", { hasText: "앞 문단" }).first()
    await leadParagraph.click()
    await calloutBodyContent.click()
    await page.keyboard.type(" 입력 유지")

    const markdownOutput = page.getByTestId("qa-markdown-output")
    await expect(markdownOutput).toContainText("> 콜아웃 첫 줄")
    await expect(markdownOutput).toContainText("입력 유지")
    await expect(markdownOutput).toContainText("콜아웃 둘째 줄")
  })

  test("새 콜아웃은 빈 제목 placeholder로 생성되고 즉시 paste가 본문에 들어간다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("앞 문단")
    await page.keyboard.press("Enter")
    await page.getByRole("button", { name: "QA 콜아웃" }).click()

    const calloutTitleInput = page.locator("input[placeholder='제목']").first()
    await expect(calloutTitleInput).toHaveValue("")

    const calloutBodyContent = page.locator("[data-callout-body-content='true']").first()
    await expect(calloutBodyContent).toBeVisible()
    await calloutBodyContent.click()

    await editor.evaluate((element, text) => {
      const data = new DataTransfer()
      data.setData("text/plain", text)
      const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true })
      Object.defineProperty(event, "clipboardData", { value: data })
      element.dispatchEvent(event)
    }, "콜아웃 즉시 붙여넣기")

    const markdownOutput = page.getByTestId("qa-markdown-output")
    await expect(markdownOutput).toContainText("> [!TIP]")
    await expect(markdownOutput).not.toContainText("핵심 포인트")
    await expect(markdownOutput).toContainText("> 콜아웃 즉시 붙여넣기")
  })

  test("빈 콜아웃 본문에서 html clipboard paste도 콜아웃 본문에 유지된다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("앞 문단")
    await page.keyboard.press("Enter")
    await page.getByRole("button", { name: "QA 콜아웃" }).click()

    const calloutBodyContent = page.locator("[data-callout-body-content='true']").first()
    await expect(calloutBodyContent).toBeVisible()
    await calloutBodyContent.click()

    await editor.evaluate((element) => {
      const data = new DataTransfer()
      data.setData("text/plain", "콜아웃 HTML 붙여넣기")
      data.setData("text/html", "<p><strong>콜아웃 HTML 붙여넣기</strong></p>")
      const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true })
      Object.defineProperty(event, "clipboardData", { value: data })
      element.dispatchEvent(event)
    })

    const markdownOutput = page.getByTestId("qa-markdown-output")
    await expect(markdownOutput).toContainText("> [!TIP]")
    await expect(markdownOutput).toContainText("> 콜아웃 HTML 붙여넣기")
    const markdownRaw = (await markdownOutput.textContent()) || ""
    expect(markdownRaw).not.toContain("\n\n콜아웃 HTML 붙여넣기\n")
  })

  test("콜아웃 본문에서 선택 버블 포맷이 직접 적용되고 markdown로 직렬화된다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.getByRole("button", { name: "QA 콜아웃" }).click()

    const calloutBodyContent = page.locator("[data-callout-body-content='true']").first()
    await expect(calloutBodyContent).toBeVisible()
    await calloutBodyContent.click()
    await page.keyboard.type("굵게 코드")

    await selectWordInEditable(page, calloutBodyContent, "굵게")
    const textBubbleToolbar = page.getByTestId("editor-text-bubble-toolbar")
    await expect(textBubbleToolbar).toBeVisible()
    await textBubbleToolbar.getByRole("button", { name: "굵게" }).click()

    await selectWordInEditable(page, calloutBodyContent, "코드")
    await expect(textBubbleToolbar).toBeVisible()
    await textBubbleToolbar.getByRole("button", { name: "인라인 코드", exact: true }).click()

    const markdownOutput = page.getByTestId("qa-markdown-output")
    await expect(markdownOutput).toContainText("> **굵게** `코드`")
  })

  test("텍스트 선택 상태에서 포맷 도구로 글자 크기/강조/색상을 바로 적용할 수 있다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    const markdownOutput = page.getByTestId("qa-markdown-output")
    await editor.click()
    await page.keyboard.type("버블 포맷 테스트")

    await selectWordInEditable(page, editor, "포맷")
    await page.getByRole("button", { name: "굵게" }).first().click()
    await expect(markdownOutput).toContainText("**포맷**")

    await selectWordInEditable(page, editor, "버블")
    await page.getByRole("button", { name: "제목 2" }).first().click()
    await expect(markdownOutput).toContainText("## ")

    await selectWordInEditable(page, editor, "테스트")
    await page.locator("[aria-label='글자색']").first().click()
    await page.getByRole("button", { name: "하늘" }).first().click()
    await expect(markdownOutput).toContainText("{{color:#60a5fa|테스트}}")
  })

  test("이미 색이 있는 텍스트도 다른 글자색으로 즉시 교체할 수 있다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    const markdownOutput = page.getByTestId("qa-markdown-output")
    await editor.click()
    await page.keyboard.type("색상 교체 테스트")

    await selectWordInEditable(page, editor, "테스트")
    await page.locator("[aria-label='글자색']").first().click()
    await page.getByRole("button", { name: "하늘" }).first().click()
    await expect(markdownOutput).toContainText("{{color:#60a5fa|테스트}}")

    await selectWordInEditable(page, editor, "테스트")
    await page.locator("[aria-label='글자색']").first().click()
    const roseColorButton = page.getByRole("button", { name: "로즈" }).first()
    await expect(roseColorButton).toHaveAttribute("data-active", "false")
    await roseColorButton.click()

    await expect(markdownOutput).toContainText("{{color:#f472b6|테스트}}")
    await expect(markdownOutput).not.toContainText("{{color:#60a5fa|테스트}}")
  })

  test("writer surface에서도 일반 본문/콜아웃 본문 텍스트 선택 시 인라인 버블이 노출된다", async ({
    page,
  }) => {
    await page.goto(QA_WRITER_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("버블 노출 테스트 문장")

    await selectWordInEditable(page, editor, "노출")
    if ((await page.getByTestId("editor-text-bubble-toolbar").count()) === 0) {
      await selectWordInEditable(page, editor, "노출")
    }
    await expect(page.getByTestId("editor-text-bubble-toolbar")).toBeVisible()
    await expect(page.getByTestId("keyboard-block-selection-overlay")).toHaveCount(0)
    await expect
      .poll(() =>
        page.evaluate(
          () => document.querySelectorAll(".aq-block-editor__content > *[data-block-selected='true']").length
        )
      )
      .toBe(0)

    await page.keyboard.press("Enter")
    await page.getByRole("button", { name: "콜아웃" }).click()
    const calloutBodyContent = page.locator("[data-callout-body-content='true']").first()
    await calloutBodyContent.click()
    await page.keyboard.type("콜아웃 버블 노출")

    await selectWordInEditable(page, calloutBodyContent, "버블")
    if ((await page.getByTestId("editor-text-bubble-toolbar").count()) === 0) {
      await selectWordInEditable(page, calloutBodyContent, "버블")
    }
    await expect(page.getByTestId("editor-text-bubble-toolbar")).toBeVisible()
    await expect(page.getByTestId("keyboard-block-selection-overlay")).toHaveCount(0)
    await expect
      .poll(() =>
        page.evaluate(
          () => document.querySelectorAll(".aq-block-editor__content > *[data-block-selected='true']").length
        )
      )
      .toBe(0)
  })

  test("writer heading 시작부 선택 bubble은 block rail 영역으로 밀리지 않는다", async ({ page }) => {
    await page.goto(QA_WRITER_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("버블헤딩 오버랩 회피")
    await selectWordInEditable(page, editor, "버블헤딩")
    await page.getByRole("button", { name: "제목 2" }).first().click()
    await expect(editor.locator("h2", { hasText: "버블헤딩" }).first()).toBeVisible()

    const heading = editor.locator("h2", { hasText: "버블헤딩" }).first()
    await selectWordInEditable(page, heading, "버블헤딩")
    const textBubbleToolbar = page.getByTestId("editor-text-bubble-toolbar")
    await expect(textBubbleToolbar).toBeVisible()

    const metrics = await page.evaluate(() => {
      const toolbar = document.querySelector<HTMLElement>("[data-testid='editor-text-bubble-toolbar']")
      const bubbleRoot = toolbar?.parentElement
      const heading = Array.from(document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] h2"))
        .find((element) => element.textContent?.includes("버블헤딩"))
      if (!toolbar || !bubbleRoot || !heading) return null
      const toolbarRect = toolbar.getBoundingClientRect()
      const headingRect = heading.getBoundingClientRect()
      return {
        anchor: bubbleRoot.getAttribute("data-anchor"),
        headingLeft: headingRect.left,
        headingTop: headingRect.top,
        toolbarBottom: toolbarRect.bottom,
        toolbarLeft: toolbarRect.left,
      }
    })

    if (!metrics) throw new Error("heading bubble metrics are missing")
    expect(metrics.anchor).toBe("left")
    expect(metrics.toolbarLeft).toBeGreaterThanOrEqual(metrics.headingLeft - 4)
    expect(metrics.toolbarBottom).toBeLessThanOrEqual(metrics.headingTop - 4)
  })

  test("writer surface에서는 마우스 드래그 선택 중 버블을 숨기고 mouseup 이후에만 노출한다", async ({
    page,
  }) => {
    await page.goto(QA_WRITER_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("마우스 업에서만 버블 노출")

    const points = await getWordDragPoints(editor, "버블")
    const textBubbleToolbar = page.getByTestId("editor-text-bubble-toolbar")

    await page.mouse.move(points.startX, points.startY)
    await page.mouse.down()
    await setWordSelectionInEditable(editor, "버블")
    await expect(textBubbleToolbar).toHaveCount(0)

    await page.mouse.up()
    await expect(textBubbleToolbar).toBeVisible()
  })

  test("writer surface의 본문 첫 글자 더블클릭은 글블록 전체 선택으로 승격되지 않는다", async ({
    page,
  }) => {
    await page.goto(QA_WRITER_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expect(editor).toBeVisible()
    await editor.locator("p").first().click()
    await page.keyboard.type("전체 선택 테두리 방지")

    const paragraph = editor.locator("p", { hasText: "전체 선택 테두리 방지" }).first()
    const paragraphBox = await expectVisibleBox(
      paragraph,
      "본문 첫 글자 더블클릭 좌표를 계산할 수 없습니다."
    )

    await paragraph.dispatchEvent("mousedown", {
      button: 0,
      buttons: 1,
      clientX: paragraphBox.x + 2,
      clientY: paragraphBox.y + paragraphBox.height / 2,
      detail: 2,
      bubbles: true,
      cancelable: true,
    })

    await expect(page.getByTestId("keyboard-block-selection-overlay")).toHaveCount(0)
    await expect
      .poll(() =>
        paragraph.evaluate((element) => ({
          selected: element.getAttribute("data-block-selected"),
          boxShadow: window.getComputedStyle(element).boxShadow,
        }))
      )
      .toMatchObject({
        selected: null,
        boxShadow: "none",
      })
  })
})
