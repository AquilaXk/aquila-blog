import { expect, test, type Locator, type Page } from "@playwright/test"
import { expectEditorToContainLoadedText } from "./helpers/editorAuthoringFlow"

const adminMember = {
  id: 1,
  username: "qa-admin",
  nickname: "aquila",
  isAdmin: true,
}

const readScrollTop = (page: Page) =>
  page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY)

const readSelectionText = (page: Page) =>
  page.evaluate(
    () =>
      window.getSelection()?.toString() ||
      document.documentElement.getAttribute("data-table-drag-selection-text") ||
      document.querySelector("[data-table-drag-selection-text]")?.getAttribute("data-table-drag-selection-text") ||
      ""
  )

const filler = (label: string, count: number) =>
  Array.from({ length: count }, (_, index) => [
    `${label} ${index + 1}: 인증 흐름을 설명하는 긴 문단입니다.`,
    "",
  ]).flat()

const dragBetweenTextRanges = async (
  page: Page,
  startTarget: Locator,
  endTarget: Locator,
  label: string,
  texts: { end: string; start: string },
  options: { cancelAtStart?: boolean; cancelBeforeMouseup?: boolean; dragOverBeforeRelease?: boolean; dropInsteadOfMouseup?: boolean; skipRelease?: boolean; skipSyntheticMoves?: boolean; syntheticWithoutNativeSelection?: boolean } = {}
) => {
  await startTarget.count()
  await endTarget.count()
  const metrics = await page.evaluate(
    ({ endText, label, startText }) => {
      const table = Array.from(document.querySelectorAll("table")).find((candidate) => {
        const text = candidate.textContent?.replace(/\s+/g, " ").trim() ?? ""
        return text.includes(startText) && text.includes(endText)
      })
      const cells = Array.from(table?.querySelectorAll("th, td") ?? [])
      const startElement = cells.find((candidate) =>
        candidate.textContent?.replace(/\s+/g, " ").trim().includes(startText)
      )
      const endElement = cells.find((candidate) =>
        candidate.textContent?.replace(/\s+/g, " ").trim().includes(endText)
      )
      if (!startElement) throw new Error(`${label} start cell is missing`)
      if (!endElement) throw new Error(`${label} end cell is missing`)
      table?.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" })

      const measureText = (element: Element, textToSelect: string, edge: "end" | "start") => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
        while (walker.nextNode()) {
          const textNode = walker.currentNode as Text
          const startOffset = textNode.data.indexOf(textToSelect)
          if (startOffset < 0) continue

          const range = document.createRange()
          range.setStart(textNode, startOffset)
          range.setEnd(textNode, startOffset + textToSelect.length)
          const rect =
            Array.from(range.getClientRects()).find(
              (candidate) => candidate.width > 2 && candidate.height > 2
            ) ?? range.getBoundingClientRect()
          if (rect.width <= 2 || rect.height <= 2) {
            throw new Error(`${label} ${edge} text rect is too small`)
          }
          return {
            x: edge === "start" ? rect.left + 2 : rect.right - 2,
            y: rect.top + rect.height / 2,
          }
        }
        throw new Error(`${label} ${edge} text node is missing`)
      }

      return {
        end: measureText(endElement, endText, "end"),
        start: measureText(startElement, startText, "start"),
      }
    },
    { endText: texts.end, label, startText: texts.start }
  )
  const beforeScrollTop = await readScrollTop(page)

  if (options.syntheticWithoutNativeSelection) {
    await page.evaluate(({ cancelAtStart, cancelBeforeMouseup, dragOverBeforeRelease, dropInsteadOfMouseup, end, skipRelease, skipSyntheticMoves, start }) => {
      window.getSelection()?.removeAllRanges()
      document.querySelectorAll("[data-table-drag-selection-text]").forEach((element) => {
        element.removeAttribute("data-table-drag-selection-text")
      })
      document.documentElement.removeAttribute("data-table-drag-selection-text")
      const dispatch = (type: string, point: { x: number; y: number }, buttons: number) => {
        const target = document.elementFromPoint(point.x, point.y) ?? document
        const init = {
          bubbles: true,
          button: 0,
          buttons,
          cancelable: true,
          clientX: point.x,
          clientY: point.y,
          composed: true,
          isPrimary: true,
          pointerId: 1,
          pointerType: "mouse",
        }
        target.dispatchEvent(new PointerEvent(type, init))
      }
      dispatch("pointerdown", start, 1)
      dispatch("mousedown", start, 1)
      if (!skipSyntheticMoves) {
        for (let index = 1; index <= 36; index += 1) {
          const ratio = index / 36
          const point = {
            x: start.x + (end.x - start.x) * ratio,
            y: start.y + (end.y - start.y) * ratio,
          }
          dispatch("pointermove", point, 1)
          dispatch("mousemove", point, 1)
        }
      }
      if (dragOverBeforeRelease) dispatch("dragover", end, 1)
      if (cancelBeforeMouseup) dispatch("pointercancel", cancelAtStart ? start : end, 0)
      else dispatch("pointerup", end, 0)
      if (!skipRelease) {
        if (dropInsteadOfMouseup) dispatch("drop", end, 0)
        else dispatch("mouseup", end, 0)
      }
    }, { ...metrics, cancelAtStart: options.cancelAtStart ?? false, cancelBeforeMouseup: options.cancelBeforeMouseup ?? false, dragOverBeforeRelease: options.dragOverBeforeRelease ?? false, dropInsteadOfMouseup: options.dropInsteadOfMouseup ?? false, skipRelease: options.skipRelease ?? false, skipSyntheticMoves: options.skipSyntheticMoves ?? false })
    await page.waitForTimeout(1_000)
    return { beforeScrollTop, afterScrollTop: await readScrollTop(page), selectionText: await readSelectionText(page) }
  }

  await page.mouse.move(metrics.start.x, metrics.start.y)
  await page.mouse.down()
  await page.mouse.move(metrics.end.x, metrics.end.y, { steps: 36 })
  await page.mouse.up()
  await page.waitForTimeout(1_000)

  return { beforeScrollTop, afterScrollTop: await readScrollTop(page), selectionText: await readSelectionText(page) }
}

test("live 507 형태의 table multi-cell drag는 여러 셀 텍스트를 연속 선택한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1580, height: 900 })

  const live507TableContent = [
    "---",
    'tags: ["Stateless", "인증", "JWT", "Refresh Token"]',
    "---",
    "",
    "## 시작하며",
    "",
    ...filler("table 이전 본문", 96),
    "",
    '<!-- aq-table {"overflowMode":"normal","columnWidths":[160,220,220]} -->',
    "| **영역** | **점검 항목** | **확인 기준** |",
    "| --- | --- | --- |",
    "| 개념 이해 | Stateless 의미 | 요청만으로 처리 가능한가 |",
    "| 토큰 구조 | Access/Refresh 구분 | 역할 명확 |",
    "| 보안 | HTTPS 사용 | 필수 |",
    "| 저장소 | Refresh 저장 | DB/Redis |",
    "| 만료 | Access 짧게 | 15~60분 |",
    "| 흐름 | 재발급 로직 | 구현되어 있는가 |",
    "",
    ...filler("table 이후 본문", 12),
  ].join("\n")

  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(adminMember),
    })
  })
  await page.route("**/post/api/v1/adm/posts/999", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: 999,
        version: 1,
        title: "live 507 table multi cell selection 글",
        content: live507TableContent,
        contentHtml: null,
        published: true,
        listed: true,
      }),
    })
  })

  await page.goto("/editor/999")
  const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
  await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue(
    "live 507 table multi cell selection 글"
  )
  await expectEditorToContainLoadedText(editor, "구현되어 있는가")

  const startCell = editor.locator("th", { hasText: "영역" }).first()
  const endCell = editor.locator("td", { hasText: "구현되어 있는가" }).first()
  await page.evaluate(() => {
    window.getSelection()?.removeAllRanges()
    document.querySelectorAll("[data-table-drag-selection-text]").forEach((element) => {
      element.removeAttribute("data-table-drag-selection-text")
    })
    ;(window as typeof window & { __qaMultiCellDragEvents?: unknown[] }).__qaMultiCellDragEvents = []
    const record = (event: MouseEvent | PointerEvent) => {
      const cell = document.elementsFromPoint(event.clientX, event.clientY)
        .find((element) => Boolean(element.closest("th, td")))
        ?.closest("th, td")
      ;(window as typeof window & { __qaMultiCellDragEvents?: unknown[] }).__qaMultiCellDragEvents?.push({
        buttons: event.buttons,
        cellText: cell?.textContent?.replace(/\s+/g, " ").trim() ?? null,
        selectionText: window.getSelection()?.toString() ?? "",
        type: event.type,
        x: Math.round(event.clientX),
        y: Math.round(event.clientY),
      })
    }
    for (const type of ["pointerdown", "pointermove", "pointerup", "mousedown", "mousemove", "mouseup"] as const) {
      window.addEventListener(type, record, { capture: true })
    }
  })

  const tableDrag = await dragBetweenTextRanges(page, startCell, endCell, "live 507 table multi-cell drag", {
    end: "구현되어 있는가",
    start: "영역",
  })
  const selectedCellCount = await editor.locator(".selectedCell").count()
  if (!tableDrag.selectionText.includes("점검 항목") || !tableDrag.selectionText.includes("구현되어 있는가")) {
    const diagnostics = await startCell.evaluate(() => {
      const table = document.querySelector("table")
      const startCell = Array.from(table?.querySelectorAll("th, td") ?? []).find((cell) =>
        cell.textContent?.replace(/\s+/g, " ").trim().includes("영역")
      )
      const endCell = Array.from(table?.querySelectorAll("th, td") ?? []).find((cell) =>
        cell.textContent?.replace(/\s+/g, " ").trim().includes("구현되어 있는가")
      )
      const measureRangeText = () => {
        if (!startCell || !endCell) return ""
        const boundary = (element: Element, edge: "end" | "start") => {
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
          let first: Text | null = null
          let last: Text | null = null
          while (walker.nextNode()) {
            const textNode = walker.currentNode as Text
            first ??= textNode
            last = textNode
          }
          const textNode = edge === "start" ? first : last
          return textNode
            ? { node: textNode, offset: edge === "start" ? 0 : textNode.data.length }
            : { node: element, offset: edge === "start" ? 0 : element.childNodes.length }
        }
        const range = document.createRange()
        const start = boundary(startCell, "start")
        const end = boundary(endCell, "end")
        range.setStart(start.node, start.offset)
        range.setEnd(end.node, end.offset)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
        return selection?.toString() ?? ""
      }
      const selection = window.getSelection()
      return {
        anchorText: selection?.anchorNode?.textContent ?? null,
        focusText: selection?.focusNode?.textContent ?? null,
        finalizerInstalled: (window as typeof window & { __aqTableTextSelectionFinalizerInstalled?: boolean }).__aqTableTextSelectionFinalizerInstalled ?? false,
        events: ((window as typeof window & { __qaMultiCellDragEvents?: unknown[] }).__qaMultiCellDragEvents ?? []).slice(-120),
        manualRangeText: measureRangeText(),
        persisted: Array.from(document.querySelectorAll("[data-table-drag-selection-text]")).map(
          (element) => element.getAttribute("data-table-drag-selection-text")
        ),
      }
    })
    throw new Error(`multi-cell table drag stayed in one cell: ${JSON.stringify({ diagnostics, tableDrag })}`)
  }

  expect(tableDrag.selectionText).toContain("영역")
  expect(tableDrag.selectionText).toContain("점검 항목")
  expect(tableDrag.selectionText).toContain("확인 기준")
  expect(tableDrag.selectionText).toContain("Stateless 의미")
  expect(tableDrag.selectionText).toContain("구현되어 있는가")
  expect(selectedCellCount).toBe(0)
  expect(tableDrag.afterScrollTop).toBeLessThanOrEqual(tableDrag.beforeScrollTop + 24)
  expect(tableDrag.afterScrollTop).toBeGreaterThanOrEqual(tableDrag.beforeScrollTop - 24)

  await page.evaluate(() => {
    window.getSelection()?.removeAllRanges()
    document.querySelectorAll("[data-table-drag-selection-text]").forEach((element) => {
      element.removeAttribute("data-table-drag-selection-text")
    })
    document.documentElement.removeAttribute("data-table-drag-selection-text")
  })

  const emptyNativeMouseupDrag = await dragBetweenTextRanges(
    page,
    startCell,
    endCell,
    "live 507 table multi-cell drag with empty native mouseup selection",
    {
      end: "구현되어 있는가",
      start: "영역",
    },
    { syntheticWithoutNativeSelection: true }
  )

  if (!emptyNativeMouseupDrag.selectionText.includes("영역")) {
    const diagnostics = await page.evaluate(() => ({
      events: ((window as typeof window & { __qaMultiCellDragEvents?: unknown[] }).__qaMultiCellDragEvents ?? []).slice(-80),
      htmlPersisted: document.documentElement.getAttribute("data-table-drag-selection-text"),
      persisted: Array.from(document.querySelectorAll("[data-table-drag-selection-text]")).map((element) => ({
        tagName: element.tagName,
        text: element.textContent?.replace(/\s+/g, " ").trim().slice(0, 120),
        value: element.getAttribute("data-table-drag-selection-text"),
      })),
      selectionText: window.getSelection()?.toString() ?? "",
    }))
    throw new Error(`empty native mouseup multi-cell drag lost selection: ${JSON.stringify({ diagnostics, emptyNativeMouseupDrag })}`)
  }
  expect(emptyNativeMouseupDrag.selectionText).toContain("영역")
  expect(emptyNativeMouseupDrag.selectionText).toContain("점검 항목")
  expect(emptyNativeMouseupDrag.selectionText).toContain("확인 기준")
  expect(emptyNativeMouseupDrag.selectionText).toContain("구현되어 있는가")
  expect(await editor.locator(".selectedCell").count()).toBe(0)

  await page.evaluate(() => {
    window.getSelection()?.removeAllRanges()
    document.querySelectorAll("[data-table-drag-selection-text]").forEach((element) => {
      element.removeAttribute("data-table-drag-selection-text")
    })
    document.documentElement.removeAttribute("data-table-drag-selection-text")
  })

  const pointerCancelBeforeMouseupDrag = await dragBetweenTextRanges(
    page,
    startCell,
    endCell,
    "live 507 table multi-cell drag with pointercancel before mouseup",
    {
      end: "구현되어 있는가",
      start: "영역",
    },
    { cancelAtStart: true, cancelBeforeMouseup: true, skipSyntheticMoves: true, syntheticWithoutNativeSelection: true }
  )

  expect(pointerCancelBeforeMouseupDrag.selectionText).toContain("영역")
  expect(pointerCancelBeforeMouseupDrag.selectionText).toContain("점검 항목")
  expect(pointerCancelBeforeMouseupDrag.selectionText).toContain("확인 기준")
  expect(pointerCancelBeforeMouseupDrag.selectionText).toContain("구현되어 있는가")
  expect(await editor.locator(".selectedCell").count()).toBe(0)

  await page.evaluate(() => {
    window.getSelection()?.removeAllRanges()
    document.querySelectorAll("[data-table-drag-selection-text]").forEach((element) => {
      element.removeAttribute("data-table-drag-selection-text")
    })
    document.documentElement.removeAttribute("data-table-drag-selection-text")
  })

  const dropReleaseDrag = await dragBetweenTextRanges(
    page,
    startCell,
    endCell,
    "live 507 table multi-cell drag with drop release",
    {
      end: "구현되어 있는가",
      start: "영역",
    },
    { cancelAtStart: true, cancelBeforeMouseup: true, dropInsteadOfMouseup: true, skipSyntheticMoves: true, syntheticWithoutNativeSelection: true }
  )

  expect(dropReleaseDrag.selectionText).toContain("영역")
  expect(dropReleaseDrag.selectionText).toContain("점검 항목")
  expect(dropReleaseDrag.selectionText).toContain("확인 기준")
  expect(dropReleaseDrag.selectionText).toContain("구현되어 있는가")
  expect(await editor.locator(".selectedCell").count()).toBe(0)

  await page.evaluate(() => {
    window.getSelection()?.removeAllRanges()
    document.querySelectorAll("[data-table-drag-selection-text]").forEach((element) => {
      element.removeAttribute("data-table-drag-selection-text")
    })
    document.documentElement.removeAttribute("data-table-drag-selection-text")
  })

  const dragOverCancelDrag = await dragBetweenTextRanges(
    page,
    startCell,
    endCell,
    "live 507 table multi-cell drag with dragover before pointercancel",
    {
      end: "구현되어 있는가",
      start: "영역",
    },
    { cancelAtStart: true, cancelBeforeMouseup: true, dragOverBeforeRelease: true, skipRelease: true, skipSyntheticMoves: true, syntheticWithoutNativeSelection: true }
  )

  expect(dragOverCancelDrag.selectionText).toContain("영역")
  expect(dragOverCancelDrag.selectionText).toContain("점검 항목")
  expect(dragOverCancelDrag.selectionText).toContain("확인 기준")
  expect(dragOverCancelDrag.selectionText).toContain("구현되어 있는가")
  expect(await editor.locator(".selectedCell").count()).toBe(0)

  await page.evaluate((selectionText) => {
    window.getSelection()?.removeAllRanges()
    document.documentElement.setAttribute("data-table-drag-selection-text", selectionText)
    const table = Array.from(document.querySelectorAll("table")).find((candidate) =>
      candidate.textContent?.includes("구현되어 있는가")
    )
    const startCell = Array.from(table?.querySelectorAll("th, td") ?? []).find((cell) =>
      cell.textContent?.replace(/\s+/g, " ").trim().includes("영역")
    )
    startCell?.setAttribute("data-table-drag-selection-text", selectionText)
    window.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        button: 0,
        buttons: 0,
        cancelable: true,
        clientX: 0,
        clientY: 0,
      })
    )
  }, emptyNativeMouseupDrag.selectionText)
  await page.waitForTimeout(100)
  const afterTrailingMouseup = await readSelectionText(page)
  expect(afterTrailingMouseup).toContain("영역")
  expect(afterTrailingMouseup).toContain("구현되어 있는가")
})

test("pointercancel 이전후에도 table multi-cell drag 선택 텍스트가 비지 않는다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1580, height: 900 })

  const content = [
    "## 멀티셀 보정",
    ...filler("table multicell recovery", 40),
    '',
    '<!-- aq-table {"overflowMode":"normal","columnWidths":[160,220,220]} -->',
    "| **영역** | **점검 항목** | **확인 기준** |",
    "| --- | --- | --- |",
    "| 시작 | A | B |",
    "| 중간 | C | D |",
    "| 끝 | E | F |",
    "| 연동 | G | H |",
    "| 회귀 | I | J |",
    "| 정리 | K | L |",
    '',
    ...filler("table multicell recovery after", 10),
  ].join("\n")

  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(adminMember),
    })
  })
  await page.route("**/post/api/v1/adm/posts/998", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: 998,
        version: 1,
        title: "table multicell recover route 글",
        content,
        contentHtml: null,
        published: true,
        listed: true,
      }),
    })
  })

  await page.goto("/editor/998")
  const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
  await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue("table multicell recover route 글")
  await expectEditorToContainLoadedText(editor, "점검 항목")

  const startCell = editor.locator("th, td", { hasText: "시작" }).first()
  const endCell = editor.locator("th, td", { hasText: "끝" }).first()
  const tableDrag = await dragBetweenTextRanges(page, startCell, endCell, "live 507 table multi-cell drag restore", {
    end: "끝",
    start: "시작",
  }, { cancelAtStart: true, cancelBeforeMouseup: true, skipSyntheticMoves: true, syntheticWithoutNativeSelection: true })

  expect(tableDrag.selectionText).toContain("시작")
  expect(tableDrag.selectionText).toContain("끝")
  expect(await editor.locator(".selectedCell").count()).toBe(0)
  expect(Math.abs(tableDrag.afterScrollTop - tableDrag.beforeScrollTop)).toBeLessThanOrEqual(24)
})
