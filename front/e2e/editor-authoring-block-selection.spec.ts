import { expect, test } from "@playwright/test"
import {
  QA_ENGINE_ROUTE,
  QA_WRITER_ROUTE,
  expectVisibleBox,
} from "./helpers/editorAuthoringFlow"

test.describe("editor authoring block selection and drag", () => {
  test("블록 핸들 + 메뉴 삽입은 hover 블록 기준을 유지한다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("첫 줄")
    await page.keyboard.press("Enter")
    await page.keyboard.type("둘째 줄")

    const firstParagraph = editor.locator("p", { hasText: "첫 줄" }).first()
    await firstParagraph.hover()

    const addBlockButton = page.getByRole("button", { name: "블록 추가" })
    await expect(addBlockButton).toBeVisible()
    await addBlockButton.click()

    const blockMenu = page.locator("[data-block-menu-root='true']")
    await expect(blockMenu).toBeVisible()
    await blockMenu.getByRole("button", { name: "인용문" }).click()

    const markdownOutput = page.getByTestId("qa-markdown-output")
    const markdown = await markdownOutput.innerText()

    const firstLineIndex = markdown.indexOf("첫 줄")
    const quoteLineMatch = markdown.match(/^>.*$/m)
    const quoteIndex = quoteLineMatch ? markdown.indexOf(quoteLineMatch[0]) : -1
    const secondLineIndex = markdown.indexOf("둘째 줄")

    expect(firstLineIndex).toBeGreaterThanOrEqual(0)
    expect(quoteIndex).toBeGreaterThan(firstLineIndex)
    expect(secondLineIndex).toBeGreaterThan(quoteIndex)
  })

  test("새 블록 템플릿은 샘플 문구 없이 빈 입력 상태로 생성된다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    const markdownOutput = page.getByTestId("qa-markdown-output")
    await editor.click()

    await page.getByRole("button", { name: "체크리스트", exact: true }).click()
    await page.getByRole("button", { name: "코드", exact: true }).click()
    await page.getByRole("button", { name: "토글", exact: true }).click()
    await page.getByRole("button", { name: "테이블", exact: true }).click()

    await expect(markdownOutput).not.toContainText("| 제목 | 값 |")
    await expect(markdownOutput).not.toContainText("| 항목 | 내용 |")
    await expect(markdownOutput).not.toContainText("코드를 입력하세요")
    await expect(markdownOutput).not.toContainText("- [ ] 할 일")
    await expect(markdownOutput).not.toContainText(":::toggle 더 보기")
  })

  test("본문 hover wheel scroll과 블록 선택 overlay scroll 정렬을 유지한다", async ({ page }) => {
    await page.setViewportSize({ width: 980, height: 720 })
    const targetLabel = "scroll anchor target block"
    const seed = encodeURIComponent(
      Array.from({ length: 28 }, (_, index) =>
        index === 4
          ? `${targetLabel} ${index + 1}`
          : `scroll regression paragraph ${index + 1}. 본문 hover wheel 입력과 block selection overlay 정렬을 확인합니다.`
      ).join("\\n\\n")
    )

    await page.goto(`${QA_ENGINE_ROUTE}&seed=${seed}`)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    const firstParagraph = editor.locator("p").first()
    await expect(firstParagraph).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 0))

    const firstBox = await firstParagraph.boundingBox()
    if (!firstBox) {
      throw new Error("first paragraph metrics are missing before wheel")
    }
    await page.mouse.move(firstBox.x + Math.min(firstBox.width / 2, 120), firstBox.y + firstBox.height / 2)

    const hoverScrollBefore = await page.evaluate(() => window.scrollY)
    await page.mouse.wheel(0, 360)
    await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeGreaterThan(hoverScrollBefore + 120)

    const targetParagraph = editor.locator("p", { hasText: targetLabel }).first()
    await targetParagraph.scrollIntoViewIfNeeded()
    const targetBox = await targetParagraph.boundingBox()
    if (!targetBox) {
      throw new Error("target paragraph metrics are missing before block selection")
    }
    await page.mouse.move(targetBox.x + Math.min(targetBox.width / 2, 120), targetBox.y + targetBox.height / 2)
    await targetParagraph.hover()

    const dragHandle = page.getByTestId("block-drag-handle")
    await expect(dragHandle).toBeVisible()
    await dragHandle.click()

    const selectionOverlay = page.getByTestId("keyboard-block-selection-overlay")
    await expect(selectionOverlay).toBeVisible()

    const readSelectionGeometry = async () =>
      page.evaluate((label) => {
        const paragraph =
          Array.from(document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] p")).find(
            (element) => element.textContent?.includes(label)
          ) ?? null
        const overlay = document.querySelector<HTMLElement>("[data-testid='keyboard-block-selection-overlay']")
        const handle = document.querySelector<HTMLElement>("[data-testid='block-drag-handle']")
        if (!paragraph || !overlay || !handle) return null
        const paragraphRect = paragraph.getBoundingClientRect()
        const overlayRect = overlay.getBoundingClientRect()
        const handleRect = handle.getBoundingClientRect()
        const overlayStyle = window.getComputedStyle(overlay)
        const handleStyle = window.getComputedStyle(handle)
        return {
          scrollY: window.scrollY,
          paragraphTop: paragraphRect.top,
          overlayTop: overlayRect.top,
          handleTop: handleRect.top,
          overlayVisible:
            overlayRect.width > 0 &&
            overlayRect.height > 0 &&
            overlayStyle.display !== "none" &&
            overlayStyle.visibility !== "hidden",
          handleVisible:
            handleRect.width > 0 &&
            handleRect.height > 0 &&
            handleStyle.display !== "none" &&
            handleStyle.visibility !== "hidden" &&
            Number.parseFloat(handleStyle.opacity || "1") > 0.5,
        }
      }, targetLabel)

    const beforeGeometry = await readSelectionGeometry()
    if (!beforeGeometry) {
      throw new Error("block selection geometry is missing before scroll")
    }

    await page.mouse.move(targetBox.x + Math.min(targetBox.width / 2, 120), targetBox.y + targetBox.height / 2)
    await page.mouse.wheel(0, 180)

    await expect
      .poll(async () => (await readSelectionGeometry())?.scrollY ?? 0)
      .toBeGreaterThan(beforeGeometry.scrollY + 60)

    const afterGeometry = await readSelectionGeometry()
    if (!afterGeometry) {
      throw new Error("block selection geometry is missing after scroll")
    }

    const paragraphDelta = afterGeometry.paragraphTop - beforeGeometry.paragraphTop
    expect(afterGeometry.overlayVisible).toBe(true)
    expect(afterGeometry.handleVisible).toBe(true)
    expect(Math.abs(afterGeometry.overlayTop - beforeGeometry.overlayTop - paragraphDelta)).toBeLessThanOrEqual(10)
    expect(Math.abs(afterGeometry.handleTop - beforeGeometry.handleTop - paragraphDelta)).toBeLessThanOrEqual(12)
    expect(Math.abs(afterGeometry.overlayTop + 4 - afterGeometry.paragraphTop)).toBeLessThanOrEqual(10)
  })

  test("텍스트 블록에서 Tab은 부분 선택이 아니라 블록 선택으로 승격된다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("노션 예시")
    await page.keyboard.press("Enter")
    await page.keyboard.type("둘째 줄")

    const firstParagraph = editor.locator("p", { hasText: "노션 예시" }).first()
    await firstParagraph.click()
    await page.keyboard.press("Tab")

    await expect(page.getByTestId("keyboard-block-selection-overlay")).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(() => {
          const selection = window.getSelection()
          return selection ? selection.toString() : ""
        })
      )
      .toBe("")
  })

  test("블록 내부 클릭/텍스트 더블클릭은 편집만 유지하고 좌측 외곽 더블클릭에서만 블록 선택된다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("첫 줄")
    await page.keyboard.press("Enter")
    await page.keyboard.type("둘째 줄")
    await page.keyboard.press("Enter")

    const blocks = editor.locator(":scope > p")
    await expect(blocks).toHaveCount(3)

    const textBlock = blocks.nth(0)
    const emptyBlock = blocks.nth(2)
    const selectionOverlay = page.getByTestId("keyboard-block-selection-overlay")

    await textBlock.click()
    await expect(selectionOverlay).toHaveCount(0)
    await textBlock.dblclick()
    await expect(selectionOverlay).toHaveCount(0)

    const textBlockRect = await textBlock.boundingBox()
    if (!textBlockRect) {
      throw new Error("텍스트 블록 좌표를 계산할 수 없습니다.")
    }
    await textBlock.dispatchEvent("mousedown", {
      button: 0,
      buttons: 1,
      clientX: textBlockRect.x - 12,
      clientY: textBlockRect.y + textBlockRect.height / 2,
      detail: 2,
      bubbles: true,
      cancelable: true,
    })
    await expect(selectionOverlay).toBeVisible()
    await expect
      .poll(() => textBlock.evaluate((element) => window.getComputedStyle(element).boxShadow))
      .toBe("none")
    await expect
      .poll(() => selectionOverlay.evaluate((element) => window.getComputedStyle(element).boxShadow))
      .toBe("none")
    await expect
      .poll(async () => {
        const textRect = textBlockRect
        const overlayRect = await selectionOverlay.boundingBox()
        if (!textRect || !overlayRect) return Number.POSITIVE_INFINITY
        return Math.abs((overlayRect.y + 4) - textRect.y)
      })
      .toBeLessThanOrEqual(10)

    await emptyBlock.click()
    await expect(selectionOverlay).toHaveCount(0)
    await emptyBlock.dblclick()
    await expect(selectionOverlay).toHaveCount(0)
  })

  test("블록 이동 핸들 1회 클릭은 블록 선택을 고정하고 Backspace로 삭제된다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("첫 줄")
    await page.keyboard.press("Enter")
    await page.keyboard.type("둘째 줄")

    const firstParagraph = editor.locator("p", { hasText: "첫 줄" }).first()
    await firstParagraph.hover()

    const dragHandle = page.getByTestId("block-drag-handle")
    await expect(dragHandle).toBeVisible()
    await dragHandle.click()

    await expect(page.getByTestId("keyboard-block-selection-overlay")).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(() => {
          const selection = window.getSelection()
          return selection ? selection.toString() : ""
        })
      )
      .toBe("")

    await page.keyboard.press("Backspace")

    const markdownOutput = page.getByTestId("qa-markdown-output")
    await expect(markdownOutput).not.toContainText("첫 줄")
    await expect(markdownOutput).toContainText("둘째 줄")
  })

  test("블록 드래그 시 source ghost와 destination 삽입선 피드백이 동시에 보인다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("첫 줄")
    await page.keyboard.press("Enter")
    await page.keyboard.type("둘째 줄")

    const firstParagraph = editor.locator("p").first()
    const secondParagraph = editor.locator("p").nth(1)

    await firstParagraph.hover()
    const dragHandle = page.getByTestId("block-drag-handle")
    await expect(dragHandle).toBeVisible()

    const dragBox = await dragHandle.boundingBox()
    const secondBox = await secondParagraph.boundingBox()
    if (!dragBox || !secondBox) {
      throw new Error("드래그 좌표를 계산할 수 없습니다.")
    }

    await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(secondBox.x + Math.min(24, secondBox.width / 3), secondBox.y + secondBox.height / 2)

    await expect(page.getByTestId("block-drag-ghost")).toBeVisible()
    await expect(page.getByTestId("block-drop-indicator").first()).toBeVisible()
    await expect(page.getByTestId("block-drop-target-highlight")).toHaveCount(0)

    await page.mouse.up()
  })

  test("구분선 block handle은 다음 문단이 아니라 divider 중심에 맞춰 뜬다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await expect(page.getByTestId("qa-editor-ready")).toHaveCount(1)
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("/구분선")
    await page.keyboard.press("Enter")
    await page.keyboard.type("아래 문단")

    const divider = page.locator("hr").first()
    await divider.hover({ force: true })

    const dragHandle = page.getByTestId("block-drag-handle")
    await expect(dragHandle).toBeVisible()

    const geometry = await Promise.all([
      divider.boundingBox(),
      page.locator(".aq-block-editor__content > p", { hasText: "아래 문단" }).first().boundingBox(),
      dragHandle.boundingBox(),
    ])

    const [dividerBox, paragraphBox, handleBox] = geometry
    if (!dividerBox || !paragraphBox || !handleBox) {
      throw new Error("구분선 block handle 위치를 계산할 수 없습니다.")
    }

    const dividerCenterY = dividerBox.y + dividerBox.height / 2
    const paragraphCenterY = paragraphBox.y + paragraphBox.height / 2
    const handleCenterY = handleBox.y + handleBox.height / 2

    expect(Math.abs(handleCenterY - dividerCenterY)).toBeLessThanOrEqual(12)
    expect(Math.abs(handleCenterY - dividerCenterY)).toBeLessThan(
      Math.abs(handleCenterY - paragraphCenterY)
    )
  })

  test("빠른 block drag release 뒤에는 drop indicator가 남지 않는다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await expect(page.getByTestId("qa-editor-ready")).toHaveCount(1)
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("첫 줄")
    await page.keyboard.press("Enter")
    await page.keyboard.type("둘째 줄")

    const firstParagraph = editor.locator("p").first()
    const secondParagraph = editor.locator("p").nth(1)
    await firstParagraph.hover()

    const dragHandle = page.getByTestId("block-drag-handle")
    await expect(dragHandle).toBeVisible()

    const [dragBox, targetBox] = await Promise.all([
      dragHandle.boundingBox(),
      secondParagraph.boundingBox(),
    ])
    if (!dragBox || !targetBox) {
      throw new Error("빠른 block drag 좌표를 계산할 수 없습니다.")
    }

    const pointerId = 44
    const startX = dragBox.x + dragBox.width / 2
    const startY = dragBox.y + dragBox.height / 2
    const endX = targetBox.x + Math.min(24, targetBox.width / 3)
    const endY = targetBox.y + targetBox.height / 2

    await dragHandle.dispatchEvent("pointerdown", {
      pointerId,
      pointerType: "mouse",
      button: 0,
      buttons: 1,
      clientX: startX,
      clientY: startY,
      bubbles: true,
      cancelable: true,
    })
    await page.evaluate(
      ({ pointerId: nextPointerId, endX: nextEndX, endY: nextEndY }) => {
        window.dispatchEvent(
          new PointerEvent("pointermove", {
            pointerId: nextPointerId,
            pointerType: "mouse",
            button: 0,
            buttons: 1,
            clientX: nextEndX,
            clientY: nextEndY,
            bubbles: true,
            cancelable: true,
          })
        )
        window.dispatchEvent(
          new PointerEvent("pointerup", {
            pointerId: nextPointerId,
            pointerType: "mouse",
            button: 0,
            buttons: 0,
            clientX: nextEndX,
            clientY: nextEndY,
            bubbles: true,
            cancelable: true,
          })
        )
      },
      { pointerId, endX, endY }
    )

    await expect(page.getByTestId("block-drag-ghost")).toHaveCount(0)
    await expect(page.getByTestId("block-drop-indicator")).toHaveCount(0)
  })

  test("writer surface 좁은 폭에서도 block handle rail은 본문 첫 줄을 덮지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 640, height: 720 })
    await page.goto(QA_WRITER_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expect(editor).toBeVisible()
    await editor.click()
    await page.keyboard.type("말머리 보호")

    const paragraph = editor.locator("p", { hasText: "말머리 보호" }).first()
    await expect(paragraph).toBeVisible()
    const visibleParagraphBox = await expectVisibleBox(
      paragraph,
      "block handle rail 검증 문단 좌표를 계산할 수 없습니다."
    )
    await page.mouse.move(
      visibleParagraphBox.x + Math.min(24, visibleParagraphBox.width / 2),
      visibleParagraphBox.y + visibleParagraphBox.height / 2
    )

    const handleRail = page.locator("[data-block-handle-rail='true'][data-visible='true']").first()
    await expect(handleRail).toBeVisible()

    const [paragraphBox, railBox] = await Promise.all([
      paragraph.boundingBox(),
      handleRail.boundingBox(),
    ])
    if (!paragraphBox || !railBox) {
      throw new Error("block handle rail 겹침 좌표를 계산할 수 없습니다.")
    }

    const overlapsParagraph =
      railBox.x < paragraphBox.x + paragraphBox.width &&
      railBox.x + railBox.width > paragraphBox.x &&
      railBox.y < paragraphBox.y + paragraphBox.height &&
      railBox.y + railBox.height > paragraphBox.y

    expect(overlapsParagraph).toBe(false)
  })
})
