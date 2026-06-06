import { readFileSync } from "fs"
import { expect, test, type Locator, type Page } from "@playwright/test"
import {
  mockEditorRouteWithPost507,
  POST_507_CODE_REQUIRED_TEXTS,
} from "./helpers/post507Fixtures"

const readScrollTop = (page: Page) =>
  page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY)

const resolvePost507CodeShell = async (page: Page) =>
  page.evaluate(
    (requiredTexts) => {
      const codeShells = Array.from(
        document.querySelectorAll<HTMLElement>(".aq-code-shell")
      )
      const codeShell =
        codeShells.find((shell) =>
          requiredTexts.every((text) => shell.textContent?.includes(text))
        ) ??
        codeShells[0] ??
        null
      if (!codeShell) return null
      const contentRoot = codeShell.querySelector<HTMLElement>(
        ".aq-code-editor-content"
      )
      codeShell.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "instant",
      })
      const rect = (contentRoot ?? codeShell).getBoundingClientRect()
      return {
        text: (codeShell.textContent || "").trim(),
        x: rect.left + Math.min(28, Math.max(8, rect.width / 2)),
        y: rect.top + Math.min(18, Math.max(8, rect.height / 2)),
      }
    },
    [...POST_507_CODE_REQUIRED_TEXTS]
  )

const resolveTextRangeBox = async (locator: Locator, text: string) =>
  locator.evaluate((element, targetText) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text
      const startOffset = textNode.data.indexOf(targetText)
      if (startOffset < 0) continue

      const range = document.createRange()
      range.setStart(textNode, startOffset)
      range.setEnd(textNode, startOffset + targetText.length)
      const rect =
        Array.from(range.getClientRects()).find(
          (candidate) => candidate.width > 2 && candidate.height > 2
        ) ?? range.getBoundingClientRect()
      if (rect.width <= 2 || rect.height <= 2) {
        throw new Error("post 507 text range box is too small")
      }
      return {
        endX: rect.right - 2,
        startX: rect.left + 2,
        y: rect.top + rect.height / 2,
      }
    }
    throw new Error(`post 507 text range is missing: ${targetText}`)
  }, text)

const dragTextRangeAndReadSelection = async (
  page: Page,
  locator: Locator,
  text: string
) => {
  let selectionText = ""
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await locator.scrollIntoViewIfNeeded()
    await page.waitForTimeout(80)
    const box = await resolveTextRangeBox(locator, text)
    await page.evaluate(() => window.getSelection()?.removeAllRanges())
    await page.mouse.move(box.startX, box.y)
    await page.waitForTimeout(80)
    await page.mouse.down()
    for (let index = 1; index <= 56; index += 1) {
      const ratio = index / 56
      await page.mouse.move(box.startX + (box.endX - box.startX) * ratio, box.y)
      await page.waitForTimeout(index === 1 ? 16 : 4)
    }
    await page.waitForTimeout(40)
    await page.mouse.up()
    await page.waitForTimeout(220)
    selectionText = await page.evaluate(
      () => window.getSelection()?.toString() ?? ""
    )
    if (selectionText.includes(text)) return selectionText
  }
  return selectionText
}

test.describe("editor authoring route 507 selection scroll owner", () => {
  test("code selection follow-up scroll preserve source contract는 hover pre-arm과 pointerdown 취소를 분리한다", () => {
    const source = readFileSync(
      "src/components/editor/blockHandleLayoutModel.ts",
      "utf8"
    )
    const followUpBranch =
      source.match(
        /if \(shouldPreserveCodeSelectionFollowUp && !tablePointerTarget\) \{[\s\S]*?\n  \}/
      )?.[0] ?? ""

    expect(source).toContain("CODE_SELECTION_FOLLOW_UP_UNTIL_ATTR")
    expect(source).toContain("codeSelectionFollowUpOnly")
    expect(followUpBranch).toContain(
      "preserveWindowScrollForCodePointerFocus(!codeSelectionFollowUpOnly)"
    )
    expect(followUpBranch).not.toContain(
      "preserveNextEditorPointerAfterCodeSelectionUntil = 0"
    )
  })

  test("code text click scroll preserve source contract는 active 교체와 독립 restore를 같이 유지한다", () => {
    const source = readFileSync(
      "src/components/editor/codeBlockNodeView.tsx",
      "utf8"
    )
    const helper =
      source.match(
        /const preserveCodePointerFocusScroll = useCallback\([\s\S]*?\n  \}, \[\]\)/
      )?.[0] ?? ""

    expect(helper).toContain(
      "CODE_SCROLL_PRESERVE_MIN_MS, false, false, true, false, false, shouldCancelCodeScrollPreserve(scrollAnchor), true"
    )
    expect(helper).toContain(
      "CODE_SCROLL_PRESERVE_MIN_MS, false, false, true, false, false, shouldCancelCodeScrollPreserve(scrollAnchor))"
    )
  })

  test("code text drag scroll preserve source contract는 먼 사용자 이동에서 취소된다", () => {
    const source = readFileSync(
      "src/components/editor/useBlockEditorEngineSelectionBubbleEffects.ts",
      "utf8"
    )

    expect(source).toContain(
      "shouldCancelCodeTextScrollPreserve(codeTextDragStart.scrollAnchor)"
    )
  })

  test("table single-cell native preserve source contract는 range 재삽입 전에 먼 이동을 취소한다", () => {
    const source = readFileSync(
      "src/components/editor/tableTextSelectionModel.ts",
      "utf8"
    )
    const helperStart = source.indexOf(
      "const preserveNativeSingleCellRangeAcrossFrames"
    )
    const restoreStart = source.indexOf("const restore = () =>", helperStart)
    const farScrollCancel = source.indexOf(
      "if (shouldCancelForFarScroll())",
      restoreStart
    )
    const rangeInsert = source.indexOf("selection?.addRange", restoreStart)

    expect(helperStart).toBeGreaterThanOrEqual(0)
    expect(restoreStart).toBeGreaterThanOrEqual(helperStart)
    expect(farScrollCancel).toBeGreaterThanOrEqual(restoreStart)
    expect(farScrollCancel).toBeLessThan(rangeInsert)
  })

  test("table structural selection 해제는 table 밖 safe text selection을 사용한다", () => {
    const axisDragSource = readFileSync(
      "src/components/editor/useBlockEditorTableOverlayAxisDrag.ts",
      "utf8"
    )
    const tableTextSource = readFileSync(
      "src/components/editor/tableTextSelectionModel.ts",
      "utf8"
    )
    const tableStructureSource = readFileSync(
      "src/components/editor/tableStructureModel.ts",
      "utf8"
    )
    const blockSelectionSource = readFileSync(
      "src/components/editor/blockSelectionModel.ts",
      "utf8"
    )
    const tableOverlayControllerSource = readFileSync(
      "src/components/editor/useBlockEditorTableOverlayControllerEffects.ts",
      "utf8"
    )
    const tableOverlayDomAdapterSource = readFileSync(
      "src/components/editor/useBlockEditorTableOverlayDomAdapter.ts",
      "utf8"
    )

    expect(blockSelectionSource).toContain(
      "export const getTopLevelBlockNodePosition"
    )
    expect(blockSelectionSource).toContain(
      "NodeSelection.create(editor.state.doc, nextPosition)"
    )
    expect(blockSelectionSource).toContain(
      "getTopLevelBlockNodePosition(editor, clampedIndex)"
    )
    expect(blockSelectionSource).toContain(
      'const isTableBlockSelection = topLevelBlock.type.name === "table"'
    )
    expect(blockSelectionSource).toContain(
      "const collapseTableBlockSelection = () =>"
    )
    expect(blockSelectionSource).toContain(
      "const createTableBlockSelectionCollapse = ("
    )
    expect(blockSelectionSource).toContain(
      "return TextSelection.near(doc.resolve(safePos), bias)"
    )
    expect(blockSelectionSource).toContain("cancelTableAxisSelectionSurface()")
    expect(blockSelectionSource).toContain(".setMeta(tableEditingKey, -1)")
    expect(blockSelectionSource).toContain(
      "const clearTableSelectedCellDomMarkers = ("
    )
    expect(tableStructureSource).toContain(
      "export const createSafeTextSelectionOutsideTable"
    )
    expect(axisDragSource).toContain(
      "createSafeTextSelectionOutsideTable(state.doc, state.selection.to, -1)"
    )
    expect(axisDragSource).toContain(
      "const restoreToken = tableAxisMenuStabilizationTokenRef.current"
    )
    expect(axisDragSource).toContain(
      "const restoreGeneration = getTableAxisSelectionRestoreGeneration()"
    )
    expect(axisDragSource).toContain(
      "tableAxisMenuStabilizationTokenRef.current !== restoreToken"
    )
    expect(axisDragSource).toContain(
      "getTableAxisSelectionRestoreGeneration() !== restoreGeneration"
    )
    expect(axisDragSource).toContain(
      "activeEditor.state.selection instanceof NodeSelection"
    )
    expect(axisDragSource).toContain(
      "target?.closest(BLOCK_SELECTION_CONTROL_SELECTOR)"
    )
    expect(tableOverlayControllerSource).toContain(
      "target.closest(BLOCK_SELECTION_CONTROL_SELECTOR)"
    )
    expect(tableOverlayControllerSource).toContain(
      "collapseTableAxisSelectionOutsideTable(editorRef.current)"
    )
    expect(tableOverlayControllerSource).toContain(
      "const safeOutsideSelection = createSafeTextSelectionOutsideTable("
    )
    expect(tableOverlayControllerSource).toContain(
      "if (safeOutsideSelection) return safeOutsideSelection"
    )
    expect(tableOverlayControllerSource).toContain(
      "return TextSelection.near(state.doc.resolve(safePos), -1)"
    )
    expect(tableTextSource).toContain("createSafeTextSelectionOutsideTable(")
    expect(tableTextSource).toContain(
      "export const cancelTableAxisSelectionRestore"
    )
    expect(tableTextSource).toContain(
      "export const TABLE_AXIS_SELECTION_SURFACE_CANCEL_EVENT"
    )
    expect(tableTextSource).toContain(
      "export const cancelTableAxisSelectionSurface"
    )
    expect(axisDragSource).toContain(
      "TABLE_AXIS_SELECTION_SURFACE_CANCEL_EVENT"
    )
    const currentTableRectStart = tableOverlayDomAdapterSource.indexOf(
      "const getCurrentSelectedTableRect = useCallback"
    )
    const selectionFirstStart = tableOverlayDomAdapterSource.indexOf(
      "if (isTableSelectionActive(activeEditor))",
      currentTableRectStart
    )
    const selectedRectStart = tableOverlayDomAdapterSource.indexOf(
      "return selectedRect(activeEditor.state)",
      selectionFirstStart
    )
    const domFallbackStart = tableOverlayDomAdapterSource.indexOf(
      "return getActiveTableRectFromDom(activeEditor)",
      currentTableRectStart
    )
    expect(currentTableRectStart).toBeGreaterThanOrEqual(0)
    expect(selectionFirstStart).toBeGreaterThan(currentTableRectStart)
    expect(selectedRectStart).toBeGreaterThan(selectionFirstStart)
    expect(domFallbackStart).toBeGreaterThan(selectedRectStart)
    expect(axisDragSource).not.toContain(
      "TextSelection.near(state.selection.$to"
    )
    expect(tableTextSource).not.toContain("TextSelection.near(")
  })

  test("실제 /editor/[id] post 507 일반 본문 클릭 직후 scroll 이벤트가 이전 anchor로 되돌아가지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })

    const { editor } = await mockEditorRouteWithPost507(page, {
      postId: 995,
      title: "post 507 body scroll owner route 글",
      version: 3,
    })

    const targetParagraph = editor
      .locator("p", { hasText: "JWT 구조를 이해하면 자연스럽게" })
      .first()
    await targetParagraph.scrollIntoViewIfNeeded()
    await page.waitForTimeout(120)

    const targetBox = await targetParagraph.boundingBox()
    if (!targetBox) {
      throw new Error(
        "post 507 body scroll owner target paragraph metrics are missing"
      )
    }

    await page.mouse.click(
      targetBox.x + Math.min(targetBox.width / 2, 160),
      targetBox.y + targetBox.height / 2
    )
    const beforeScrollTop = await readScrollTop(page)
    await page.mouse.wheel(0, 260)
    await page.waitForTimeout(120)
    const afterScrollTop = await readScrollTop(page)

    expect(afterScrollTop).toBeGreaterThan(beforeScrollTop + 120)
  })

  test("실제 /editor/[id] post 507 일반 본문 drag selection은 native text selection을 유지한다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })

    const { editor } = await mockEditorRouteWithPost507(page, {
      postId: 996,
      title: "post 507 body text drag route 글",
      version: 4,
    })

    const targetParagraph = editor
      .locator("p", { hasText: "JWT 구조를 이해하면 자연스럽게" })
      .first()
    await targetParagraph.scrollIntoViewIfNeeded()
    await page.waitForTimeout(120)

    const selectionText = await dragTextRangeAndReadSelection(
      page,
      targetParagraph,
      "JWT 구조를 이해하면"
    )
    expect(selectionText).toContain("JWT 구조를 이해하면")

    const beforeScrollTop = await readScrollTop(page)
    await page.mouse.wheel(0, 220)
    await page.waitForTimeout(120)
    const afterScrollTop = await readScrollTop(page)
    expect(afterScrollTop).toBeGreaterThan(beforeScrollTop + 100)
  })

  test("실제 /editor/[id] post 507 code block follow-up focus는 click 보정 후 사용자 wheel scroll을 막지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })

    const { editor } = await mockEditorRouteWithPost507(page, {
      postId: 997,
      title: "post 507 code follow-up focus route 글",
      version: 5,
    })

    const codeShell = await expect
      .poll(() => resolvePost507CodeShell(page), { timeout: 20_000 })
      .not.toBeNull()
      .then(() => resolvePost507CodeShell(page))
    if (!codeShell) {
      throw new Error("post 507 code follow-up shell is missing")
    }
    await page.waitForTimeout(120)

    const beforeClickScrollTop = await readScrollTop(page)
    await page.mouse.click(codeShell.x, codeShell.y)
    await page.waitForTimeout(220)
    const afterClickScrollTop = await readScrollTop(page)
    expect(
      Math.abs(afterClickScrollTop - beforeClickScrollTop)
    ).toBeLessThanOrEqual(24)

    await page.mouse.wheel(0, 260)
    await page.waitForTimeout(160)
    const afterWheelScrollTop = await readScrollTop(page)
    expect(afterWheelScrollTop).toBeGreaterThan(afterClickScrollTop + 100)
  })
})
