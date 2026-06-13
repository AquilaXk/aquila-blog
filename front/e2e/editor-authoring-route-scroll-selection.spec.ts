import { expect, test } from "./helpers/authoringPlaywright"
import {
  expectEditorToContainLoadedText,
  expectVisibleBox,
} from "./helpers/editorAuthoringFlow"

test.describe("editor authoring route scroll and selection", () => {
  test("실제 /editor/[id] 텍스트 선택 후 block handle 없이 wheel scroll chain을 유지한다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })
    const adminMember = {
      id: 1,
      username: "qa-admin",
      nickname: "aquila",
      isAdmin: true,
    }
    const targetLabel = "edit route text selection scroll anchor"
    const selectionNeedle = "route text selection scroll anchor"
    const paragraphs = Array.from({ length: 38 }, (_, index) =>
      index === 10
        ? `${targetLabel} ${index + 1}. 선택한 텍스트는 좌측 block handle 없이 scroll 동안 같은 선택 범위를 유지해야 합니다.`
        : `text selection scroll paragraph ${index + 1}. 좌측 block handle 없는 scroll chain을 확인합니다.`
    )
    const content = paragraphs.join("\n\n")
    const contentHtml = paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("")

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
          title: "텍스트 선택 scroll handle 회귀 글",
          content,
          contentHtml,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/994")
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue("텍스트 선택 scroll handle 회귀 글")
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    const targetParagraph = editor.locator("p", { hasText: targetLabel }).first()
    await targetParagraph.scrollIntoViewIfNeeded()
    const targetBox = await targetParagraph.boundingBox()
    if (!targetBox) {
      throw new Error("text selection target paragraph metrics are missing")
    }

    const textY = targetBox.y + Math.min(targetBox.height / 2, 18)
    await page.mouse.move(targetBox.x + 36, textY)
    await page.mouse.down()
    await page.mouse.move(targetBox.x + Math.min(targetBox.width - 24, 430), textY, { steps: 12 })
    await page.mouse.up()

    const dragHandle = page.getByTestId("block-drag-handle")
    await expect(dragHandle).toHaveCount(0)

    const readSelectionGeometry = async () =>
      page.evaluate((label) => {
        const paragraph =
          Array.from(document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] p")).find(
            (element) => element.textContent?.includes(label)
          ) ?? null
        if (!paragraph) return null
        const paragraphRect = paragraph.getBoundingClientRect()
        return {
          blockHandleCount: document.querySelectorAll("[data-testid='block-drag-handle']").length,
          scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
          selectionText: window.getSelection()?.toString().replace(/\s+/g, " ").trim() ?? "",
          paragraphTop: paragraphRect.top,
        }
      }, targetLabel)

    const beforeGeometry = await readSelectionGeometry()
    if (!beforeGeometry) {
      throw new Error("text selection geometry is missing before scroll")
    }
    expect(beforeGeometry.selectionText).toContain(selectionNeedle)
    expect(beforeGeometry.blockHandleCount).toBe(0)

    await page.mouse.wheel(0, 360)
    await page.waitForTimeout(360)

    const afterGeometry = await readSelectionGeometry()
    if (!afterGeometry) {
      throw new Error("text selection geometry is missing after scroll")
    }
    expect(afterGeometry.scrollTop).toBeGreaterThan(beforeGeometry.scrollTop + 80)
    expect(afterGeometry.selectionText).toContain(selectionNeedle)
    expect(afterGeometry.blockHandleCount).toBe(0)
  })

  test("실제 /editor/[id] 본문 클릭과 텍스트 선택 상태의 wheel scroll chain은 handle 없이 유지한다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })
    const adminMember = {
      id: 1,
      username: "qa-admin",
      nickname: "aquila",
      isAdmin: true,
    }
    const targetLabel = "edit route body-selected wheel anchor"
    const selectionNeedle = "route body-selected wheel anchor"
    const paragraphs = Array.from({ length: 42 }, (_, index) =>
      index === 12
        ? `${targetLabel} ${index + 1}. 선택된 글은 좌측 block handle 없이 본문 위 wheel 중에도 선택 범위를 유지해야 합니다.`
        : `body click wheel regression paragraph ${index + 1}. 본문 클릭 후 wheel scroll chain 회귀를 확인합니다.`
    )
    const content = paragraphs.join("\n\n")
    const contentHtml = paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("")

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/996", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 996,
          version: 12,
          title: "본문 클릭 wheel scroll chain 회귀 글",
          content,
          contentHtml,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/996")
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue("본문 클릭 wheel scroll chain 회귀 글")
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expectEditorToContainLoadedText(editor, "body click wheel regression paragraph 42")

    const readScrollTop = () =>
      page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY)

    await page.evaluate(() => window.scrollTo(0, 0))
    const firstParagraph = editor.locator("p", { hasText: "body click wheel regression paragraph 1" }).first()
    const firstBox = await expectVisibleBox(firstParagraph, "body click paragraph metrics are missing")
    await page.mouse.click(firstBox.x + Math.min(firstBox.width / 2, 180), firstBox.y + firstBox.height / 2)

    const clickScrollBefore = await readScrollTop()
    await page.mouse.wheel(0, 420)
    await expect.poll(readScrollTop).toBeGreaterThan(clickScrollBefore + 120)

    const targetParagraph = editor.locator("p", { hasText: targetLabel }).first()
    await targetParagraph.scrollIntoViewIfNeeded()
    const targetBox = await expectVisibleBox(targetParagraph, "body-selected target paragraph metrics are missing")
    const selectionY = targetBox.y + Math.min(targetBox.height / 2, 18)
    const selectionStartX = targetBox.x + 34
    const selectionEndX = targetBox.x + Math.min(targetBox.width - 24, 500)

    await page.mouse.move(selectionStartX, selectionY)
    await page.mouse.down()
    await page.mouse.move(selectionEndX, selectionY, { steps: 14 })
    await page.mouse.up()

    const dragHandle = page.getByTestId("block-drag-handle")
    await expect(dragHandle).toHaveCount(0)

    const readSelectionGeometry = async () =>
      page.evaluate((label) => {
        const paragraph =
          Array.from(document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] p")).find(
            (element) => element.textContent?.includes(label)
          ) ?? null
        if (!paragraph) return null
        const paragraphRect = paragraph.getBoundingClientRect()
        return {
          blockHandleCount: document.querySelectorAll("[data-testid='block-drag-handle']").length,
          scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
          selectionText: window.getSelection()?.toString().replace(/\s+/g, " ").trim() ?? "",
          paragraphTop: paragraphRect.top,
        }
      }, targetLabel)

    const beforeGeometry = await readSelectionGeometry()
    if (!beforeGeometry) {
      throw new Error("body-selected text selection geometry is missing before scroll")
    }
    expect(beforeGeometry.selectionText).toContain(selectionNeedle)
    expect(beforeGeometry.blockHandleCount).toBe(0)

    const immediateGeometry = await page.evaluate((label) => {
      const read = () => {
        const paragraph =
          Array.from(document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] p")).find(
            (element) => element.textContent?.includes(label)
          ) ?? null
        if (!paragraph) return null
        const paragraphRect = paragraph.getBoundingClientRect()
        return {
          blockHandleCount: document.querySelectorAll("[data-testid='block-drag-handle']").length,
          scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
          selectionText: window.getSelection()?.toString().replace(/\s+/g, " ").trim() ?? "",
          paragraphTop: paragraphRect.top,
        }
      }
      window.scrollBy(0, 160)
      return read()
    }, targetLabel)
    if (!immediateGeometry) {
      throw new Error("body-selected text selection geometry is missing during immediate scroll")
    }
    expect(immediateGeometry.scrollTop).toBeGreaterThan(beforeGeometry.scrollTop + 80)
    expect(immediateGeometry.selectionText).toContain(selectionNeedle)
    expect(immediateGeometry.blockHandleCount).toBe(0)

    await page.evaluate(
      ({ label }) => {
        const win = window as Window & {
          __bodySelectedWheelSamples?: Array<{
            blockHandleCount: number
            scrollTop: number
            paragraphTop: number
            selectionText: string
          }>
          __bodySelectedWheelCleanup?: () => void
        }
        win.__bodySelectedWheelCleanup?.()
        win.__bodySelectedWheelSamples = []
        let rafId = 0
        let stopped = false
        const read = () => {
          const paragraph =
            Array.from(document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] p")).find(
              (element) => element.textContent?.includes(label)
            ) ?? null
          if (!paragraph) return null
          const paragraphRect = paragraph.getBoundingClientRect()
          return {
            blockHandleCount: document.querySelectorAll("[data-testid='block-drag-handle']").length,
            scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
            paragraphTop: paragraphRect.top,
            selectionText: window.getSelection()?.toString().replace(/\s+/g, " ").trim() ?? "",
          }
        }
        const record = () => {
          if (stopped) return
          const next = read()
          if (next) win.__bodySelectedWheelSamples?.push(next)
          if ((win.__bodySelectedWheelSamples?.length ?? 0) < 18) {
            rafId = window.requestAnimationFrame(record)
          }
        }
        rafId = window.requestAnimationFrame(record)
        win.__bodySelectedWheelCleanup = () => {
          stopped = true
          window.cancelAnimationFrame(rafId)
        }
      },
      { label: targetLabel }
    )

    await page.mouse.wheel(0, 140)
    await page.waitForTimeout(24)
    await page.mouse.wheel(0, 140)
    await page.waitForTimeout(24)
    await page.mouse.wheel(0, 140)

    await expect
      .poll(async () => (await readSelectionGeometry())?.scrollTop ?? 0)
      .toBeGreaterThan(beforeGeometry.scrollTop + 80)

    const scrollSamples = await page.evaluate(() => {
      const win = window as Window & {
        __bodySelectedWheelSamples?: Array<{
          blockHandleCount: number
          scrollTop: number
          selectionText: string
        }>
        __bodySelectedWheelCleanup?: () => void
      }
      win.__bodySelectedWheelCleanup?.()
      return win.__bodySelectedWheelSamples ?? []
    })
    const movedSamples = scrollSamples.filter((sample) => sample.scrollTop > beforeGeometry.scrollTop + 20)
    expect(movedSamples.length).toBeGreaterThan(0)
    expect(movedSamples.every((sample) => sample.selectionText.includes(selectionNeedle))).toBe(true)
    expect(movedSamples.every((sample) => sample.blockHandleCount === 0)).toBe(true)

    const afterGeometry = await readSelectionGeometry()
    if (!afterGeometry) {
      throw new Error("body-selected text selection geometry is missing after scroll")
    }
    expect(afterGeometry.selectionText).toContain(selectionNeedle)
    expect(afterGeometry.blockHandleCount).toBe(0)
  })

  test("실제 /editor/[id] 테이블 클릭 후 하단 본문 클릭은 scrollTop을 다른 본문 위치로 되돌리지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })
    const adminMember = {
      id: 1,
      username: "qa-admin",
      nickname: "aquila",
      isAdmin: true,
    }
    const tableCellLabel = "table click scroll anchor lower cell"
    const bottomLabel = "edit route table then bottom click scroll jump target"
    const previousSelectionLabel = "pre table selection anchor paragraph"
    const leadParagraphs = Array.from({ length: 72 }, (_, index) =>
      index === 66
        ? `${previousSelectionLabel} ${index + 1}. 하단 표를 클릭하기 전 이전 caret이 남아 있는 중간 본문입니다.`
        : `pre table scroll paragraph ${index + 1}. 긴 글에서 하단 표 클릭 scrollTop 보존 회귀를 확인합니다.`
    )
    const closingParagraphs = Array.from({ length: 20 }, (_, index) =>
      index === 18
        ? `${bottomLabel} ${index + 1}. 테이블을 먼저 클릭한 뒤 글의 맨 아래쪽 본문을 클릭해도 화면 위치가 다른 문단으로 순간이동하면 안 됩니다.`
        : `post table bottom paragraph ${index + 1}. 하단 본문 클릭은 caret/focus만 이동해야 합니다.`
    )
    const tableMarkdown = [
      '<!-- aq-table {"overflowMode":"normal","columnWidths":[119,192,210]} -->',
      "| 영역 | 점검 항목 | 확인 기준 |",
      "| --- | --- | --- |",
      "| 개념 이해 | Stateless 의미 | 요청만으로 처리 가능한가 |",
      "| 토큰 구조 | Access/Refresh 구분 | 역할 명확 |",
      "| 보안 | HTTPS 사용 | 필수 |",
      "| 저장소 | Refresh 저장 | DB/Redis |",
      "| 만료 | Access 짧게 | 15~60분 |",
      `| 흐름 | ${tableCellLabel} | 구현되어 있는가 |`,
    ].join("\n")
    const content = [
      "테이블 클릭 후 하단 본문 클릭 scroll jump 회귀 재현용 글입니다.",
      ...leadParagraphs,
      tableMarkdown,
      ...closingParagraphs,
    ].join("\n\n")
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
          version: 13,
          title: "테이블 후 하단 본문 클릭 scroll jump 회귀 글",
          content,
          contentHtml: null,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/995")
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue(
      "테이블 후 하단 본문 클릭 scroll jump 회귀 글"
    )
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expectEditorToContainLoadedText(editor, bottomLabel)

    const previousSelectionParagraph = editor.locator("p", { hasText: previousSelectionLabel }).first()
    await previousSelectionParagraph.scrollIntoViewIfNeeded()
    const previousSelectionBox = await expectVisibleBox(
      previousSelectionParagraph,
      "previous selection paragraph metrics are missing"
    )
    await page.mouse.click(
      previousSelectionBox.x + Math.min(previousSelectionBox.width / 2, 260),
      previousSelectionBox.y + Math.min(previousSelectionBox.height / 2, 18)
    )

    const tableCell = editor.locator("table th, table td", { hasText: tableCellLabel }).first()
    await tableCell.scrollIntoViewIfNeeded()
    const tableCellBox = await expectVisibleBox(tableCell, "table click anchor cell metrics are missing")

    const readTableAnchorState = () => page.evaluate((label) => {
      const cell =
        Array.from(document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] th, [data-testid='block-editor-prosemirror'] td")).find(
          (element) => element.textContent?.includes(label)
        ) ?? null
      const selection = window.getSelection()
      const anchorElement =
        selection?.anchorNode instanceof HTMLElement
          ? selection.anchorNode
          : selection?.anchorNode?.parentElement ?? null
      return {
        activeInsideTable: Boolean(
          cell &&
            (document.activeElement?.closest("th, td") === cell ||
              anchorElement?.closest("th, td") === cell)
        ),
        scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
      }
    }, tableCellLabel)

    await tableCell.click({
      position: {
        x: Math.min(tableCellBox.width / 2, 120),
        y: tableCellBox.height / 2,
      },
    })
    await expect.poll(async () => (await readTableAnchorState()).activeInsideTable, { timeout: 1_000 }).toBe(true)

    await page.mouse.move(760, 360)
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const bottomParagraphVisible = await page.evaluate((label) => {
        const paragraph =
          Array.from(document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] p")).find(
            (element) => element.textContent?.includes(label)
          ) ?? null
        if (!paragraph) return false
        const rect = paragraph.getBoundingClientRect()
        return rect.bottom > 0 && rect.top < window.innerHeight
      }, bottomLabel)
      if (bottomParagraphVisible) break
      await page.mouse.wheel(0, 1400)
      await page.waitForTimeout(40)
    }

    const beforeGeometry = await page.evaluate((label) => {
      const root = document.querySelector<HTMLElement>("[data-testid='block-editor-prosemirror']")
      const paragraph =
        Array.from(root?.querySelectorAll<HTMLElement>("p") ?? []).find(
          (element) => element.textContent?.includes(label)
        ) ?? null
      if (!root || !paragraph) return null
      const rootRect = root.getBoundingClientRect()
      const rect = paragraph.getBoundingClientRect()
      const clickX = Math.min(rect.left + Math.min(rect.width / 2, 260), rootRect.right - 32)
      const clickY = rect.top + Math.min(rect.height / 2, 18)
      const clickTarget = document.elementFromPoint(clickX, clickY)
      return {
        scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
        paragraphTop: rect.top,
        rootBottom: rootRect.bottom,
        clickX,
        clickY,
        paragraphVisible: rect.bottom > 0 && rect.top < window.innerHeight,
        clickInsideEditor: Boolean(clickTarget?.closest("[data-testid='block-editor-prosemirror']")),
        paragraphText: paragraph.textContent || "",
      }
    }, bottomLabel)
    if (!beforeGeometry) {
      throw new Error("bottom click geometry is missing before click")
    }
    expect(beforeGeometry.paragraphVisible).toBe(true)
    expect(beforeGeometry.clickInsideEditor).toBe(true)

    await page.mouse.click(beforeGeometry.clickX, beforeGeometry.clickY)
    await page.waitForTimeout(180)

    const afterGeometry = await page.evaluate((label) => {
      const paragraph =
        Array.from(document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] p")).find(
          (element) => element.textContent?.includes(label)
        ) ?? null
      const activeElement = document.activeElement
      if (!paragraph) return null
      const rect = paragraph.getBoundingClientRect()
      return {
        scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
        paragraphTop: rect.top,
        activeInsideEditor: Boolean(
          activeElement?.closest("[data-testid='block-editor-prosemirror']")
        ),
      }
    }, bottomLabel)
    if (!afterGeometry) {
      throw new Error("bottom click geometry is missing after click")
    }

    expect(afterGeometry.activeInsideEditor).toBe(true)
    expect(Math.abs(afterGeometry.scrollTop - beforeGeometry.scrollTop)).toBeLessThanOrEqual(24)
    expect(Math.abs(afterGeometry.paragraphTop - beforeGeometry.paragraphTop)).toBeLessThanOrEqual(24)
  })

  test("실제 /editor/[id] 하단 본문 클릭은 이전 선택 위치로 scrollTop을 되돌리지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })
    const adminMember = {
      id: 1,
      username: "qa-admin",
      nickname: "aquila",
      isAdmin: true,
    }
    const previousSelectionLabel = "pre bottom click selection anchor paragraph"
    const bottomLabel = "plain bottom click scroll jump target"
    const leadParagraphs = Array.from({ length: 86 }, (_, index) =>
      index === 52
        ? `${previousSelectionLabel} ${index + 1}. 하단 본문 클릭 전 이전 selection anchor가 남아 있는 본문입니다.`
        : `plain pre bottom paragraph ${index + 1}. 긴 수정 문서에서 본문 클릭 scrollTop 보존을 검증합니다.`
    )
    const closingParagraphs = Array.from({ length: 18 }, (_, index) =>
      index === 16
        ? `${bottomLabel} ${index + 1}. 글 맨 아래쪽의 아무 글자를 클릭해도 화면 위치가 이전 본문으로 되돌아가면 안 됩니다.`
        : `plain bottom paragraph ${index + 1}. 하단 본문 클릭은 caret/focus만 이동해야 합니다.`
    )
    const content = [
      "하단 본문 클릭 scroll jump 회귀 재현용 글입니다.",
      ...leadParagraphs,
      ...closingParagraphs,
    ].join("\n\n")

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/996", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 996,
          version: 7,
          title: "하단 본문 클릭 scroll jump 회귀 글",
          content,
          contentHtml: null,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/996")
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue(
      "하단 본문 클릭 scroll jump 회귀 글"
    )
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expectEditorToContainLoadedText(editor, bottomLabel)

    const previousSelectionParagraph = editor.locator("p", { hasText: previousSelectionLabel }).first()
    await previousSelectionParagraph.scrollIntoViewIfNeeded()
    const previousSelectionBox = await expectVisibleBox(
      previousSelectionParagraph,
      "previous plain selection paragraph metrics are missing"
    )
    await page.mouse.click(
      previousSelectionBox.x + Math.min(previousSelectionBox.width / 2, 260),
      previousSelectionBox.y + Math.min(previousSelectionBox.height / 2, 18)
    )
    const staleSelectionScrollTop = await page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY)

    await page.mouse.move(760, 360)
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const bottomParagraphVisible = await page.evaluate((label) => {
        const paragraph =
          Array.from(document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] p")).find(
            (element) => element.textContent?.includes(label)
          ) ?? null
        if (!paragraph) return false
        const rect = paragraph.getBoundingClientRect()
        return rect.bottom > 0 && rect.top < window.innerHeight
      }, bottomLabel)
      if (bottomParagraphVisible) break
      await page.mouse.wheel(0, 1400)
      await page.waitForTimeout(40)
    }

    await page.evaluate((staleScrollTop) => {
      const root = document.querySelector<HTMLElement>("[data-testid='block-editor-prosemirror']")
      root?.addEventListener(
        "pointerdown",
        (event) => {
          if (!(event.target instanceof Element)) return
          if (!event.target.closest("[data-testid='block-editor-prosemirror']")) return
          window.requestAnimationFrame(() => {
            window.scrollTo(0, staleScrollTop)
          })
        },
        { capture: true, once: true }
      )
    }, staleSelectionScrollTop)

    const beforeGeometry = await page.evaluate((label) => {
      const root = document.querySelector<HTMLElement>("[data-testid='block-editor-prosemirror']")
      const paragraph =
        Array.from(root?.querySelectorAll<HTMLElement>("p") ?? []).find(
          (element) => element.textContent?.includes(label)
        ) ?? null
      if (!root || !paragraph) return null
      const rootRect = root.getBoundingClientRect()
      const rect = paragraph.getBoundingClientRect()
      const clickX = Math.min(rect.left + Math.min(rect.width / 2, 260), rootRect.right - 32)
      const clickY = rect.top + Math.min(rect.height / 2, 18)
      const clickTarget = document.elementFromPoint(clickX, clickY)
      return {
        scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
        paragraphTop: rect.top,
        clickX,
        clickY,
        paragraphVisible: rect.bottom > 0 && rect.top < window.innerHeight,
        clickInsideEditor: Boolean(clickTarget?.closest("[data-testid='block-editor-prosemirror']")),
      }
    }, bottomLabel)
    if (!beforeGeometry) {
      throw new Error("plain bottom click geometry is missing before click")
    }
    expect(beforeGeometry.paragraphVisible).toBe(true)
    expect(beforeGeometry.clickInsideEditor).toBe(true)

    await page.mouse.click(beforeGeometry.clickX, beforeGeometry.clickY)
    await page.waitForTimeout(180)

    const afterGeometry = await page.evaluate((label) => {
      const paragraph =
        Array.from(document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] p")).find(
          (element) => element.textContent?.includes(label)
        ) ?? null
      const activeElement = document.activeElement
      if (!paragraph) return null
      const rect = paragraph.getBoundingClientRect()
      return {
        scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
        paragraphTop: rect.top,
        activeInsideEditor: Boolean(
          activeElement?.closest("[data-testid='block-editor-prosemirror']")
        ),
      }
    }, bottomLabel)
    if (!afterGeometry) {
      throw new Error("plain bottom click geometry is missing after click")
    }

    expect(afterGeometry.activeInsideEditor).toBe(true)
    expect(Math.abs(afterGeometry.scrollTop - beforeGeometry.scrollTop)).toBeLessThanOrEqual(24)
    expect(Math.abs(afterGeometry.paragraphTop - beforeGeometry.paragraphTop)).toBeLessThanOrEqual(24)
  })
})
