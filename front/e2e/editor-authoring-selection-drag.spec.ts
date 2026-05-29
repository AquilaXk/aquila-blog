import { expect, test, type Locator, type Page } from "@playwright/test"
import {
  QA_WRITER_ROUTE,
  expectEditorToContainLoadedText,
  expectVisibleBox,
  getWordDragPoints,
  selectWordInEditable,
} from "./helpers/editorAuthoringFlow"

const adminMember = {
  id: 1,
  username: "qa-admin",
  nickname: "aquila",
  isAdmin: true,
}

const isLocalResourceConsoleNoise = (text: string) =>
  text.startsWith("Failed to load resource:") ||
  text.includes("/_vercel/speed-insights/script.js") ||
  text.includes("/_vercel/insights/script.js")

const dragSelectWord = async (page: Page, editable: Locator, word: string) => {
  await editable.scrollIntoViewIfNeeded()
  const points = await getWordDragPoints(editable, word)
  const beforeScrollTop = await page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY)

  await page.mouse.move(points.startX, points.startY)
  await page.mouse.down()
  await page.mouse.move(points.endX, points.endY, { steps: 8 })
  await page.mouse.up()

  try {
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const selectionText = window.getSelection()?.toString() ?? ""
            const fallbackSelectionText =
              document.querySelector("[data-table-drag-selection-text]")?.getAttribute("data-table-drag-selection-text") ||
              document.querySelector("[data-code-drag-selection-text]")?.getAttribute("data-code-drag-selection-text") ||
              ""
            return (selectionText || fallbackSelectionText).replace(/\s+/g, " ").trim()
          }),
        { timeout: 2_000 }
      )
      .toContain(word)
  } catch {
    const diagnostics = await page.evaluate(
      ({ startX, startY, endX, endY }) => {
        const describeElement = (element: Element | null) => {
          if (!element) return null
          return {
            tagName: element.tagName.toLowerCase(),
            className: element.getAttribute("class"),
            testId: element.getAttribute("data-testid"),
            contentEditable: (element as HTMLElement).contentEditable,
            text: (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
          }
        }
        const selection = window.getSelection()
        const activeElement = document.activeElement
        const codeContent = document.querySelector<HTMLElement>(".aq-code-editor-content")
        return {
          activeElement: describeElement(activeElement instanceof Element ? activeElement : null),
          anchorElement: describeElement(
            selection?.anchorNode instanceof Element
              ? selection.anchorNode
              : selection?.anchorNode?.parentElement ?? null
          ),
          focusElement: describeElement(
            selection?.focusNode instanceof Element
              ? selection.focusNode
              : selection?.focusNode?.parentElement ?? null
          ),
          selectionRangeCount: selection?.rangeCount ?? 0,
          selectionText:
            selection?.toString() ||
            document.querySelector("[data-table-drag-selection-text]")?.getAttribute("data-table-drag-selection-text") ||
            document.querySelector("[data-code-drag-selection-text]")?.getAttribute("data-code-drag-selection-text") ||
            "",
          startElement: describeElement(document.elementFromPoint(startX, startY)),
          endElement: describeElement(document.elementFromPoint(endX, endY)),
          codeContent: describeElement(codeContent),
          codeContentStyle: codeContent
            ? {
                userSelect: window.getComputedStyle(codeContent).userSelect,
                pointerEvents: window.getComputedStyle(codeContent).pointerEvents,
                color: window.getComputedStyle(codeContent).color,
                webkitTextFillColor: window.getComputedStyle(codeContent).webkitTextFillColor,
              }
            : null,
        }
      },
      points
    )
    throw new Error(`drag selection did not include "${word}": ${JSON.stringify(diagnostics)}`)
  }
  const afterScrollTop = await page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY)
  expect(Math.abs(afterScrollTop - beforeScrollTop), `${word} drag 이후 scrollTop이 유지되어야 합니다`).toBeLessThanOrEqual(24)
}

const expectSelectionScopedToWord = async (page: Page, word: string, unrelatedWords: string[]) => {
  await expect
    .poll(
      async () => {
        const selectionText = await page.evaluate(() => {
          const text =
            window.getSelection()?.toString() ||
            document.querySelector("[data-table-drag-selection-text]")?.getAttribute("data-table-drag-selection-text") ||
            document.querySelector("[data-code-drag-selection-text]")?.getAttribute("data-code-drag-selection-text") ||
            ""
          return text.replace(/\s+/g, " ").trim()
        })
        return (
          selectionText.includes(word) &&
          unrelatedWords.every((unrelatedWord) => !selectionText.includes(unrelatedWord))
        )
      },
      { timeout: 2_000 }
    )
    .toBe(true)
}

const expectSelectionContainsOnly = async (page: Page, includedWords: string[], excludedWords: string[]) => {
  await expect
    .poll(
      async () => {
        const selectionText = await page.evaluate(() => {
          const text =
            window.getSelection()?.toString() ||
            document.documentElement.getAttribute("data-table-drag-selection-text") ||
            document.querySelector("[data-table-drag-selection-text]")?.getAttribute("data-table-drag-selection-text") ||
            document.querySelector("[data-code-drag-selection-text]")?.getAttribute("data-code-drag-selection-text") ||
            ""
          return text.replace(/\s+/g, " ").trim()
        })
        return (
          includedWords.every((includedWord) => selectionText.includes(includedWord)) &&
          excludedWords.every((excludedWord) => !selectionText.includes(excludedWord))
        )
      },
      { timeout: 2_000 }
    )
    .toBe(true)
}

const expectCodeHighlightLayerAligned = async (page: Page, word: string) => {
  const metrics = await page.evaluate((targetWord) => {
    const content = Array.from(document.querySelectorAll<HTMLElement>(".aq-code-editor-content")).find((element) =>
      element.textContent?.includes(targetWord)
    )
    const shell = content?.closest(".aq-code-shell")
    const highlightLine = shell?.querySelector<HTMLElement>(".aq-code-highlight-layer .line")
    if (!content || !highlightLine) return null
    const contentStyle = window.getComputedStyle(content)
    const highlightLineStyle = window.getComputedStyle(highlightLine)
    return {
      contentLineHeight: Number.parseFloat(contentStyle.lineHeight || "0"),
      highlightLineMinHeight: Number.parseFloat(highlightLineStyle.minHeight || "0"),
    }
  }, word)

  if (!metrics) {
    throw new Error(`code highlight metrics are missing for "${word}"`)
  }

  expect(
    Math.abs(metrics.contentLineHeight - metrics.highlightLineMinHeight),
    JSON.stringify(metrics)
  ).toBeLessThanOrEqual(1)
}

test.describe("editor authoring route text selection drag", () => {
  test("writer table cell 기존 텍스트 선택 후 단순 클릭은 caret만 남긴다", async ({ page }) => {
    await page.goto(QA_WRITER_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.getByRole("button", { name: "테이블", exact: true }).first().click()

    const firstCell = page.locator("table th, table td").first()
    await firstCell.click()
    await page.keyboard.type("셀 커서 테스트")

    await selectWordInEditable(page, firstCell, "커서")
    await expect
      .poll(async () => page.evaluate(() => window.getSelection()?.toString().replace(/\s+/g, " ").trim() ?? ""))
      .toContain("커서")

    const points = await getWordDragPoints(firstCell, "커서")
    await firstCell.evaluate(
      (element, point) => {
        const target = document.elementFromPoint(point.x, point.y) ?? element
        const init = {
          bubbles: true,
          button: 0,
          cancelable: true,
          clientX: point.x,
          clientY: point.y,
        }
        target.dispatchEvent(
          new PointerEvent("pointerdown", {
            ...init,
            buttons: 1,
            pointerId: 1,
            pointerType: "mouse",
          })
        )
        target.dispatchEvent(new MouseEvent("mousedown", { ...init, buttons: 1 }))
        target.dispatchEvent(
          new PointerEvent("pointerup", {
            ...init,
            buttons: 0,
            pointerId: 1,
            pointerType: "mouse",
          })
        )
        target.dispatchEvent(new MouseEvent("mouseup", { ...init, buttons: 0 }))
        target.dispatchEvent(new MouseEvent("click", { ...init, buttons: 0 }))
      },
      {
        x: Math.round((points.startX + points.endX) / 2),
        y: points.startY,
      }
    )

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const selection = window.getSelection()
          const anchorElement =
            selection?.anchorNode instanceof Element
              ? selection.anchorNode
              : selection?.anchorNode?.parentElement ?? null
          const focusElement =
            selection?.focusNode instanceof Element
              ? selection.focusNode
              : selection?.focusNode?.parentElement ?? null
          return {
            blockOverlayCount: document.querySelectorAll("[data-testid='keyboard-block-selection-overlay']").length,
            inCell: Boolean(anchorElement?.closest("th, td") && focusElement?.closest("th, td")),
            persistedText: document.documentElement.getAttribute("data-table-drag-selection-text") || "",
            selectedCellCount: document.querySelectorAll(".selectedCell").length,
            selectionCollapsed: selection?.isCollapsed ?? false,
            selectionText: selection?.toString().replace(/\s+/g, " ").trim() ?? "",
          }
        })
      )
      .toEqual({
        blockOverlayCount: 0,
        inCell: true,
        persistedText: "",
        selectedCellCount: 0,
        selectionCollapsed: true,
        selectionText: "",
      })
  })

  test("실제 /editor/[id] table cell 클릭은 이전 block selection 대신 caret으로 진입한다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })
    const previousSelectionLabel = "table caret previous block anchor"
    const marker = "route-table-caret-marker"
    const content = [
      "table caret route 재현 문서",
      ...Array.from({ length: 28 }, (_, index) =>
        index === 8
          ? `${previousSelectionLabel} ${index + 1}. 테이블 클릭 전 이전 block selection을 남깁니다.`
          : `table caret lead paragraph ${index + 1}. 실제 수정 페이지에서 table caret 진입을 검증합니다.`
      ),
      [
        '<!-- aq-table {"overflowMode":"normal","columnWidths":[180,240,220]} -->',
        "| 영역 | 점검 항목 | 확인 기준 |",
        "| --- | --- | --- |",
        `| caret | ${marker} alpha | 클릭 후 caret |`,
        "| result | beta | 선택 없음 |",
      ].join("\n"),
      "table caret trailing paragraph. 테이블 이후 본문입니다.",
    ].join("\n\n")

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/989", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          content,
          contentHtml: null,
          id: 989,
          listed: true,
          published: true,
          title: "table caret route 회귀 글",
          version: 3,
        }),
      })
    })

    await page.goto("/editor/989")
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue(
      "table caret route 회귀 글"
    )
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expectEditorToContainLoadedText(editor, marker)

    const previousSelectionParagraph = editor.locator("p", { hasText: previousSelectionLabel }).first()
    await previousSelectionParagraph.scrollIntoViewIfNeeded()
    const previousSelectionBox = await expectVisibleBox(
      previousSelectionParagraph,
      "table caret previous selection paragraph metrics are missing"
    )
    await page.mouse.move(
      previousSelectionBox.x + Math.min(previousSelectionBox.width / 2, 240),
      previousSelectionBox.y + Math.min(previousSelectionBox.height / 2, 18)
    )
    await previousSelectionParagraph.hover()
    const dragHandle = page.getByTestId("block-drag-handle")
    await expect(dragHandle).toBeVisible()
    await dragHandle.click()
    await expect(page.getByTestId("keyboard-block-selection-overlay")).toBeVisible()

    const targetCell = editor.locator("table th, table td", { hasText: marker }).first()
    await targetCell.scrollIntoViewIfNeeded()
    const clickPoint = await targetCell.evaluate((element, text) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const textNode = walker.currentNode as Text
        const index = textNode.data.indexOf(text)
        if (index < 0) continue

        const range = document.createRange()
        range.setStart(textNode, index + 3)
        range.setEnd(textNode, index + 4)
        const rect = range.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) break
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        }
      }
      return null
    }, marker)

    if (!clickPoint) {
      throw new Error("route table caret click point is missing")
    }

    await page.mouse.click(clickPoint.x, clickPoint.y)
    await page.waitForTimeout(260)

    await expect
      .poll(async () =>
        page.evaluate((text) => {
          const selection = window.getSelection()
          const anchorElement =
            selection?.anchorNode instanceof Element
              ? selection.anchorNode
              : selection?.anchorNode?.parentElement ?? null
          const focusElement =
            selection?.focusNode instanceof Element
              ? selection.focusNode
              : selection?.focusNode?.parentElement ?? null
          return {
            anchorInsideTargetCell: Boolean(anchorElement?.closest("th, td")?.textContent?.includes(text)),
            blockOverlayCount: document.querySelectorAll("[data-testid='keyboard-block-selection-overlay']").length,
            collapsed: selection?.isCollapsed ?? false,
            focusInsideTargetCell: Boolean(focusElement?.closest("th, td")?.textContent?.includes(text)),
            persistedText:
              document.documentElement.getAttribute("data-table-drag-selection-text") ||
              document
                .querySelector("[data-table-drag-selection-text]")
                ?.getAttribute("data-table-drag-selection-text") ||
              "",
            selectedCellCount: document.querySelectorAll(".selectedCell").length,
            selectionText: selection?.toString().replace(/\s+/g, " ").trim() ?? "",
          }
        }, marker)
      )
      .toEqual({
        anchorInsideTargetCell: true,
        blockOverlayCount: 0,
        collapsed: true,
        focusInsideTargetCell: true,
        persistedText: "",
        selectedCellCount: 0,
        selectionText: "",
      })

    await page.mouse.click(clickPoint.x, clickPoint.y)
    await page.waitForTimeout(120)
    const postClickState = await page.evaluate(() => ({
      blockOverlayCount: document.querySelectorAll("[data-testid='keyboard-block-selection-overlay']").length,
      selectedCellCount: document.querySelectorAll(".selectedCell").length,
      selectionText: window.getSelection()?.toString().replace(/\s+/g, " ").trim() ?? "",
      selectionCollapsed: window.getSelection()?.isCollapsed ?? true,
    }))
    expect(postClickState).toMatchObject({
      blockOverlayCount: 0,
      selectedCellCount: 0,
      selectionText: "",
      selectionCollapsed: true,
    })
  })

  test("실제 /editor/[id] 텍스트 드래그 선택은 code/table/body에서 에러 없이 유지된다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })
    const runtimeErrors: string[] = []
    const bodyLabel = "본문드래그선택대상"
    const codeLabel = "코드드래그선택대상"
    const tableLabel = "테이블드래그선택대상"
    const codeMarkdown = ["```ts", `const marker = "${codeLabel}";`, "console.log(marker);", "```"].join("\n")
    const tableMarkdown = [
      '<!-- aq-table {"overflowMode":"normal","columnWidths":[180,220]} -->',
      "| 구분 | 값 |",
      "| --- | --- |",
      `| inline code | \`${tableLabel}\` |`,
    ].join("\n")
    const content = [
      "드래그 선택 회귀 재현용 글입니다.",
      `일반 본문 ${bodyLabel} 문장을 마우스로 선택해도 에러가 없어야 합니다.`,
      codeMarkdown,
      tableMarkdown,
    ].join("\n\n")

    page.on("pageerror", (error) => {
      runtimeErrors.push(error.message)
    })
    page.on("console", (message) => {
      if (message.type() === "error" && !isLocalResourceConsoleNoise(message.text())) {
        runtimeErrors.push(message.text())
      }
    })
    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/989", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 989,
          version: 4,
          title: "드래그 선택 버벅임 회귀 글",
          content,
          contentHtml: null,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/989")
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue(
      "드래그 선택 버벅임 회귀 글"
    )
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expectEditorToContainLoadedText(editor, tableLabel)

    await expectCodeHighlightLayerAligned(page, codeLabel)
    await page.setViewportSize({ width: 390, height: 720 })
    await expectCodeHighlightLayerAligned(page, codeLabel)
    await page.setViewportSize({ width: 980, height: 720 })

    await dragSelectWord(page, editor.locator("p", { hasText: bodyLabel }).first(), bodyLabel)
    const codeContent = editor.locator(".aq-code-editor-content", { hasText: codeLabel }).first()
    await dragSelectWord(page, codeContent, codeLabel)
    await expect(codeContent).toContainText(codeLabel)
    await expectSelectionScopedToWord(page, codeLabel, [bodyLabel, tableLabel])
    const codePoints = await getWordDragPoints(codeContent, codeLabel)
    await page.mouse.click(codePoints.startX, codePoints.startY)
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A")
    await expectSelectionScopedToWord(page, codeLabel, [bodyLabel, tableLabel])
    await dragSelectWord(page, editor.locator("table th, table td", { hasText: tableLabel }).first(), tableLabel)
    await expectSelectionScopedToWord(page, tableLabel, [bodyLabel, codeLabel])

    const tableCell = editor.locator("table th, table td", { hasText: tableLabel }).first()
    const tableCellPoints = await getWordDragPoints(tableCell, tableLabel)
    await page.mouse.click(tableCellPoints.startX, tableCellPoints.startY)
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A")
    await expectSelectionContainsOnly(page, ["구분", "값", tableLabel], [bodyLabel, codeLabel])

    await expect(page.getByTestId("keyboard-block-selection-overlay")).toHaveCount(0)
    expect(runtimeErrors).toEqual([])
  })

  test("실제 /editor/[id] 테이블 다중 셀 텍스트 드래그는 마우스 업 이후에도 범위 선택을 유지한다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1000 })
    const tableMarkdown = [
      '<!-- aq-table {"overflowMode":"normal","columnWidths":[160,220,240]} -->',
      "| 영역 | 점검 항목 | 확인 기준 |",
      "| --- | --- | --- |",
      "| 개념 이해 | Stateless 의미 | 요청만으로 처리 가능한가 |",
      "| 토큰 구조 | Access/Refresh 구분 | 역할 명확 |",
      "| 보안 | HTTPS 사용 | 필수 |",
      "| 저장소 | Refresh 저장 | DB/Redis |",
      "| 만료 | Access 짧게 | 15~60분 |",
      "| 흐름 | 재발급 로직 | 구현되어 있는가 |",
    ].join("\n")
    const content = [
      "테이블 다중 셀 드래그 회귀 재현용 글입니다.",
      tableMarkdown,
      "테이블 아래 문단입니다.",
    ].join("\n\n")

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/988", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 988,
          version: 2,
          title: "테이블 다중 셀 드래그 회귀 글",
          content,
          contentHtml: null,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/988")
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue(
      "테이블 다중 셀 드래그 회귀 글"
    )
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expectEditorToContainLoadedText(editor, "구현되어 있는가")

    const points = await page.evaluate(() => {
      const cells = Array.from(
        document.querySelectorAll<HTMLElement>(
          "[data-testid='block-editor-prosemirror'] th, [data-testid='block-editor-prosemirror'] td"
        )
      )
      const table = document.querySelector<HTMLElement>("[data-testid='block-editor-prosemirror'] table")
      table?.scrollIntoView({ block: "center", inline: "nearest" })
      const startCell = cells.find((cell) => cell.textContent?.includes("영역"))
      const endCell = cells.find((cell) => cell.textContent?.includes("구현되어 있는가"))
      if (!startCell || !endCell) return null
      startCell.scrollIntoView({ block: "center", inline: "nearest" })
      const startRect = startCell.getBoundingClientRect()
      const endRect = endCell.getBoundingClientRect()
      return {
        startX: startRect.left + Math.min(startRect.width / 2, 80),
        startY: startRect.top + startRect.height / 2,
        endX: endRect.right - Math.min(endRect.width / 2, 80),
        endY: endRect.top + endRect.height / 2,
        scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
      }
    })
    if (!points) throw new Error("table multi-cell drag points are missing")

    await page.mouse.move(points.startX, points.startY)
    await page.mouse.down()
    await page.mouse.move(points.endX, points.endY, { steps: 18 })
    await page.mouse.up()

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const text =
              window.getSelection()?.toString() ||
              document.documentElement.getAttribute("data-table-drag-selection-text") ||
              document.querySelector("[data-table-drag-selection-text]")?.getAttribute("data-table-drag-selection-text") ||
              ""
            return text.replace(/\s+/g, " ").trim()
          }),
        { timeout: 2_000 }
      )
      .toContain("구현되어 있는가")
    await expect
      .poll(() =>
        page.evaluate(() => {
          const text =
            window.getSelection()?.toString() ||
            document.documentElement.getAttribute("data-table-drag-selection-text") ||
            document.querySelector("[data-table-drag-selection-text]")?.getAttribute("data-table-drag-selection-text") ||
            ""
          return text.replace(/\s+/g, " ").trim()
        })
      )
      .toContain("영역")
    await expect(page.getByTestId("keyboard-block-selection-overlay")).toHaveCount(0)
    const afterScrollTop = await page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY)
    expect(Math.abs(afterScrollTop - points.scrollTop)).toBeLessThanOrEqual(24)
  })

  test("table multi-cell 선택 toolbar는 이전 본문 selection anchor로 순간이동하지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    const staleAnchorLabel = "이전 글 선택 anchor"
    const filler = Array.from({ length: 54 }, (_, index) =>
      index === 4
        ? `${staleAnchorLabel} ${index + 1}. table 선택 전 이전 본문 selection anchor가 남아 있습니다.`
        : `toolbar stale anchor filler ${index + 1}. 글 선택 toolbar 위치 회귀를 재현하기 위한 긴 본문입니다.`
    )
    const tableMarkdown = [
      '<!-- aq-table {"overflowMode":"normal","columnWidths":[160,220,240]} -->',
      "| 영역 | 점검 항목 | 확인 기준 |",
      "| --- | --- | --- |",
      "| 개념 이해 | Stateless 의미 | 요청만으로 처리 가능한가 |",
      "| 토큰 구조 | Access/Refresh 구분 | 역할 명확 |",
      "| 보안 | HTTPS 사용 | 필수 |",
      "| 저장소 | Refresh 저장 | DB/Redis |",
      "| 만료 | Access 짧게 | 15~60분 |",
      "| 흐름 | 재발급 로직 | 구현되어 있는가 |",
    ].join("\n")
    const content = [
      "글 선택 toolbar stale anchor 회귀 재현용 글입니다.",
      ...filler,
      tableMarkdown,
      "테이블 아래 문단입니다.",
    ].join("\n\n")

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/987", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 987,
          version: 3,
          title: "글 선택 toolbar stale anchor 회귀 글",
          content,
          contentHtml: null,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/987")
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue(
      "글 선택 toolbar stale anchor 회귀 글"
    )
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expectEditorToContainLoadedText(editor, "구현되어 있는가")

    const staleParagraph = editor.locator("p", { hasText: staleAnchorLabel }).first()
    await selectWordInEditable(page, staleParagraph, staleAnchorLabel)
    await expect(page.getByTestId("editor-text-bubble-toolbar")).toBeVisible()

    const points = await page.evaluate(() => {
      const cells = Array.from(
        document.querySelectorAll<HTMLElement>(
          "[data-testid='block-editor-prosemirror'] th, [data-testid='block-editor-prosemirror'] td"
        )
      )
      const table = document.querySelector<HTMLElement>("[data-testid='block-editor-prosemirror'] table")
      table?.scrollIntoView({ block: "center", inline: "nearest" })
      const startCell = cells.find((cell) => cell.textContent?.includes("영역"))
      const endCell = cells.find((cell) => cell.textContent?.includes("구현되어 있는가"))
      if (!startCell || !endCell) return null
      const startRect = startCell.getBoundingClientRect()
      const endRect = endCell.getBoundingClientRect()
      return {
        startX: startRect.left + Math.min(startRect.width / 2, 80),
        startY: startRect.top + startRect.height / 2,
        endX: endRect.right - Math.min(endRect.width / 2, 80),
        endY: endRect.top + endRect.height / 2,
      }
    })
    if (!points) throw new Error("table multi-cell stale toolbar drag points are missing")

    await page.mouse.move(points.startX, points.startY)
    await page.mouse.down()
    await page.mouse.move(points.endX, points.endY, { steps: 18 })
    await page.mouse.up()

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const text =
              window.getSelection()?.toString() ||
              document.documentElement.getAttribute("data-table-drag-selection-text") ||
              document.querySelector("[data-table-drag-selection-text]")?.getAttribute("data-table-drag-selection-text") ||
              ""
            return text.replace(/\s+/g, " ").trim()
          }),
        { timeout: 2_000 }
      )
      .toContain("구현되어 있는가")

    const textBubbleToolbar = page.getByTestId("editor-text-bubble-toolbar")
    await expect(textBubbleToolbar).toBeVisible()
    const toolbarGeometry = await page.evaluate(() => {
      const toolbar = document.querySelector<HTMLElement>("[data-testid='editor-text-bubble-toolbar']")
      const cells = Array.from(
        document.querySelectorAll<HTMLElement>(
          "[data-testid='block-editor-prosemirror'] th, [data-testid='block-editor-prosemirror'] td"
        )
      )
      const startCell = cells.find((cell) => cell.textContent?.includes("영역"))
      const endCell = cells.find((cell) => cell.textContent?.includes("구현되어 있는가"))
      if (!toolbar || !startCell || !endCell) return null
      const toolbarRect = toolbar.getBoundingClientRect()
      const startRect = startCell.getBoundingClientRect()
      const endRect = endCell.getBoundingClientRect()
      return {
        selectionLeft: Math.min(startRect.left, endRect.left),
        selectionRight: Math.max(startRect.right, endRect.right),
        selectionTop: Math.min(startRect.top, endRect.top),
        toolbarBottom: toolbarRect.bottom,
        toolbarCenterX: toolbarRect.left + toolbarRect.width / 2,
        toolbarTop: toolbarRect.top,
      }
    })
    if (!toolbarGeometry) throw new Error("text bubble toolbar geometry is missing")
    expect(toolbarGeometry.toolbarCenterX).toBeGreaterThanOrEqual(toolbarGeometry.selectionLeft - 24)
    expect(toolbarGeometry.toolbarCenterX).toBeLessThanOrEqual(toolbarGeometry.selectionRight + 24)
    expect(toolbarGeometry.toolbarTop).toBeLessThanOrEqual(toolbarGeometry.selectionTop + 24)
    expect(toolbarGeometry.toolbarTop).toBeGreaterThanOrEqual(0)

    const beforeClickScrollTop = await page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY)
    await textBubbleToolbar.getByRole("button", { name: "굵게", exact: true }).click()
    await page.waitForTimeout(180)
    const afterClickScrollTop = await page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY)
    expect(Math.abs(afterClickScrollTop - beforeClickScrollTop)).toBeLessThanOrEqual(24)
  })
})
