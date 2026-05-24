import { expect, test } from "@playwright/test"
import {
  QA_ENGINE_ROUTE,
  expectEditorToContainLoadedText,
  expectVisibleBox,
} from "./helpers/editorAuthoringFlow"

test.describe("editor authoring route rich block focus", () => {
  test("실제 /editor/[id] rich block 클릭은 지연된 내부 focus reveal 이후에도 scroll jump하지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })
    const adminMember = {
      id: 1,
      username: "qa-admin",
      nickname: "aquila",
      isAdmin: true,
    }
    const previousSelectionLabel = "rich block previous selection anchor"
    const codeLabel = "rich code click scroll jump target"
    const tableLabel = "rich table click scroll jump target"
    const mermaidLabel = "RichMermaidClickTarget"
    const leadParagraphs = Array.from({ length: 72 }, (_, index) =>
      index === 50
        ? `${previousSelectionLabel} ${index + 1}. rich block 클릭 전 이전 selection anchor가 남아 있는 본문입니다.`
        : `rich block lead paragraph ${index + 1}. 긴 수정 문서에서 rich block 클릭 scrollTop 보존을 검증합니다.`
    )
    const codeMarkdown = ["```ts", `const marker = "${codeLabel}";`, "console.log(marker);", "```"].join("\n")
    const tableMarkdown = [
      '<!-- aq-table {"overflowMode":"normal","columnWidths":[160,220]} -->',
      "| 구분 | 값 |",
      "| --- | --- |",
      `| table | ${tableLabel} |`,
      "| expected | scroll 유지 |",
    ].join("\n")
    const mermaidMarkdown = [
      "```mermaid",
      "flowchart TD",
      `  A[${mermaidLabel}] --> B[scroll 유지]`,
      "```",
    ].join("\n")
    const trailingParagraphs = Array.from({ length: 20 }, (_, index) =>
      `rich block trailing paragraph ${index + 1}. rich block 클릭 이후에도 화면 위치가 유지되어야 합니다.`
    )
    const content = [
      "rich block 클릭 scroll jump 회귀 재현용 글입니다.",
      ...leadParagraphs,
      codeMarkdown,
      tableMarkdown,
      mermaidMarkdown,
      ...trailingParagraphs,
    ].join("\n\n")

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/997", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 997,
          version: 5,
          title: "rich block 클릭 scroll jump 회귀 글",
          content,
          contentHtml: null,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/997")
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue(
      "rich block 클릭 scroll jump 회귀 글"
    )
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expectEditorToContainLoadedText(editor, codeLabel)

    const previousSelectionParagraph = editor.locator("p", { hasText: previousSelectionLabel }).first()
    await previousSelectionParagraph.scrollIntoViewIfNeeded()
    const previousSelectionBox = await expectVisibleBox(
      previousSelectionParagraph,
      "previous rich block selection paragraph metrics are missing"
    )
    await page.mouse.move(
      previousSelectionBox.x + Math.min(previousSelectionBox.width / 2, 260),
      previousSelectionBox.y + Math.min(previousSelectionBox.height / 2, 18)
    )
    await previousSelectionParagraph.hover()
    const dragHandle = page.getByTestId("block-drag-handle")
    await expect(dragHandle).toBeVisible()
    await dragHandle.click()
    await expect(page.getByTestId("keyboard-block-selection-overlay")).toBeVisible()
    const staleSelectionScrollTop = await page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY)

    const assertRichBlockClickPreservesScroll = async (
      target: Locator,
      label: string,
      clickOffset = { x: 40, y: 24 }
    ) => {
      await target.scrollIntoViewIfNeeded()
      await target.evaluate((element) => {
        element.scrollIntoView({ block: "center", inline: "nearest" })
      })
      const targetBox = await expectVisibleBox(target, `${label} metrics are missing before click`)

      const beforeGeometry = await page.evaluate(
        ({ selector, text }) => {
          const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector))
          const target =
            candidates.find((element) => {
              const elementText =
                element instanceof HTMLTextAreaElement ? element.value : element.textContent ?? ""
              return elementText.includes(text)
            }) ??
            candidates[0] ??
            null
          if (!target) return null
          const rect = target.getBoundingClientRect()
          return {
            scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
            targetTop: rect.top,
            targetBottom: rect.bottom,
            visible: rect.bottom > 0 && rect.top < window.innerHeight,
          }
        },
        { selector: label === mermaidLabel ? ".aq-mermaid-code-input" : "[data-testid='block-editor-prosemirror'] *", text: label }
      )
      if (!beforeGeometry) {
        throw new Error(`${label} geometry is missing before click`)
      }
      expect(beforeGeometry.visible).toBe(true)
      await page.evaluate(
        ({ staleScrollTop }) => {
          const root = document.querySelector<HTMLElement>("[data-testid='block-editor-prosemirror']")
          root?.addEventListener(
            "pointerdown",
            (event) => {
              if (!(event.target instanceof Element)) return
              if (!event.target.closest("[data-testid='block-editor-prosemirror']")) return
              window.setTimeout(() => {
                window.scrollTo(0, staleScrollTop)
              }, 720)
            },
            { capture: true, once: true }
          )
        },
        { staleScrollTop: staleSelectionScrollTop }
      )

      await page.mouse.click(
        targetBox.x + Math.min(clickOffset.x, Math.max(8, targetBox.width - 8)),
        targetBox.y + Math.min(clickOffset.y, Math.max(8, targetBox.height - 8))
      )
      await page.waitForTimeout(1_000)

      const afterGeometry = await page.evaluate(
        ({ selector, text }) => {
          const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector))
          const target =
            candidates.find((element) => {
              const elementText =
                element instanceof HTMLTextAreaElement ? element.value : element.textContent ?? ""
              return elementText.includes(text)
            }) ??
            candidates[0] ??
            null
          if (!target) return null
          const rect = target.getBoundingClientRect()
          return {
            scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
            targetTop: rect.top,
            targetBottom: rect.bottom,
          }
        },
        { selector: label === mermaidLabel ? ".aq-mermaid-code-input" : "[data-testid='block-editor-prosemirror'] *", text: label }
      )
      if (!afterGeometry) {
        throw new Error(`${label} geometry is missing after click`)
      }

      expect(Math.abs(afterGeometry.scrollTop - beforeGeometry.scrollTop)).toBeLessThanOrEqual(24)
      expect(Math.abs(afterGeometry.targetTop - beforeGeometry.targetTop)).toBeLessThanOrEqual(24)
      expect(Math.abs(afterGeometry.targetBottom - beforeGeometry.targetBottom)).toBeLessThanOrEqual(24)
      await page.waitForTimeout(180)
    }

    await assertRichBlockClickPreservesScroll(
      editor.locator(".aq-mermaid-code-input").first(),
      mermaidLabel,
      { x: 42, y: 24 }
    )
    await assertRichBlockClickPreservesScroll(
      editor.locator(".aq-code-editor-content", { hasText: codeLabel }).first(),
      codeLabel
    )
    await assertRichBlockClickPreservesScroll(
      editor.locator("table th, table td", { hasText: tableLabel }).first(),
      tableLabel,
      { x: 24, y: 16 }
    )
  })

  test("ProseMirror selection reveal은 rich block viewport를 이전 block selection anchor로 되돌리지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })
    const previousSelectionLabel = "selection reveal stale block anchor"
    const codeLabel = "selection reveal code target"
    const tableLabel = "Selection reveal table target"
    const mermaidLabel = "SelectionRevealMermaidTarget"
    const leadParagraphs = Array.from({ length: 62 }, (_, index) =>
      index === 12
        ? `${previousSelectionLabel} ${index + 1}. 이전 top-level block selection이 남아 있던 문단입니다.`
        : `selection reveal lead paragraph ${index + 1}. rich block 클릭 전 stale selection 거리를 확보합니다.`
    )
    const tableMarkdown = [
      '<!-- aq-table {"overflowMode":"normal","columnWidths":[160,220,240]} -->',
      "| 영역 | 점검 항목 | 확인 기준 |",
      "| --- | --- | --- |",
      `| 테이블 | ${tableLabel} | selection reveal이 scroll을 되돌리지 않음 |`,
      "| 코드 | focus side effect | 현재 viewport 유지 |",
    ].join("\n")
    const markdown = [
      "# selection reveal rich block 재현",
      ...leadParagraphs,
      "```mermaid",
      "sequenceDiagram",
      `    participant ${mermaidLabel}`,
      `    ${mermaidLabel}->>Editor: reveal stale selection`,
      "```",
      "```java",
      `String marker = "${codeLabel}";`,
      "System.out.println(marker);",
      "```",
      tableMarkdown,
      "selection reveal trailing paragraph. target 아래쪽을 안정화합니다.",
    ].join("\n\n")
    const seed = encodeURIComponent(markdown.replace(/\n/g, "\\n"))

    await page.goto(`${QA_ENGINE_ROUTE}&seed=${seed}`)
    await expect(page.getByTestId("qa-editor-ready")).toHaveCount(1)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expectEditorToContainLoadedText(editor, tableLabel)
    const previousSelectionParagraph = editor.locator("p", { hasText: previousSelectionLabel }).first()
    const dragHandle = page.getByTestId("block-drag-handle")
    const selectPreviousBlockAnchor = async () => {
      await previousSelectionParagraph.scrollIntoViewIfNeeded()
      await previousSelectionParagraph.hover()
      await expect(dragHandle).toBeVisible()
      await dragHandle.click()
      await expect(page.getByTestId("keyboard-block-selection-overlay")).toBeVisible()
    }

    const assertSelectionRevealKeepsViewport = async (target: Locator, label: string) => {
      await selectPreviousBlockAnchor()
      await target.scrollIntoViewIfNeeded()
      await target.evaluate((element) => {
        element.scrollIntoView({ block: "center", inline: "nearest" })
      })
      const beforeGeometry = await target.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return {
          scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
          targetTop: rect.top,
          targetBottom: rect.bottom,
        }
      })

      const actionCalled = await page.evaluate(() => {
        const qaWindow = window as Window & {
          __qaScrollCurrentSelectionIntoView?: () => void
        }
        if (!qaWindow.__qaScrollCurrentSelectionIntoView) return false
        qaWindow.__qaScrollCurrentSelectionIntoView()
        return true
      })
      expect(actionCalled).toBe(true)
      await page.waitForTimeout(100)

      const afterGeometry = await target.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return {
          scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
          targetTop: rect.top,
          targetBottom: rect.bottom,
        }
      })

      expect(Math.abs(afterGeometry.scrollTop - beforeGeometry.scrollTop), label).toBeLessThanOrEqual(24)
      expect(Math.abs(afterGeometry.targetTop - beforeGeometry.targetTop), label).toBeLessThanOrEqual(24)
      expect(Math.abs(afterGeometry.targetBottom - beforeGeometry.targetBottom), label).toBeLessThanOrEqual(24)
    }

    await assertSelectionRevealKeepsViewport(
      editor.locator(".aq-mermaid-stage").first(),
      mermaidLabel
    )
    await assertSelectionRevealKeepsViewport(
      editor.locator(".aq-code-shell", { hasText: codeLabel }).first(),
      codeLabel
    )
    await assertSelectionRevealKeepsViewport(
      editor.locator("table th, table td", { hasText: tableLabel }).first(),
      tableLabel
    )
  })

  test("실제 /editor/[id] rich block 클릭은 이전 block selection anchor로 되돌아가지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })
    const adminMember = {
      id: 1,
      username: "qa-admin",
      nickname: "aquila",
      isAdmin: true,
    }
    const previousSelectionLabel = "stale rich block node selection anchor"
    const codeLabel = "stale code focus target"
    const tableLabel = "Stale table focus target"
    const mermaidLabel = "StaleMermaidFocusTarget"
    const leadParagraphs = Array.from({ length: 56 }, (_, index) =>
      index === 16
        ? `${previousSelectionLabel} ${index + 1}. 이전 block selection이 남아 있던 문단입니다.`
        : `stale selection lead paragraph ${index + 1}. 실제 글수정 rich block 클릭 경로를 검증합니다.`
    )
    const tailParagraphs = Array.from({ length: 14 }, (_, index) =>
      `stale selection tail paragraph ${index + 1}. 클릭 후에도 이 부근 viewport가 유지되어야 합니다.`
    )
    const tableMarkdown = [
      '<!-- aq-table {"overflowMode":"normal","columnWidths":[160,220,240]} -->',
      "| 영역 | 점검 항목 | 확인 기준 |",
      "| --- | --- | --- |",
      `| 개념 이해 | ${tableLabel} | 요청만으로 처리 가능한가 |`,
      "| 토큰 구조 | Access/Refresh 구분 | 역할 명확 |",
      "| 흐름 | 재발급 로직 | 구현되어 있는가 |",
    ].join("\n")
    const content = [
      "# rich block stale selection 재현",
      ...leadParagraphs,
      "```mermaid",
      "sequenceDiagram",
      `    participant ${mermaidLabel}`,
      `    ${mermaidLabel}->>Server: click target`,
      "```",
      "```java",
      `String marker = "${codeLabel}";`,
      "System.out.println(marker);",
      "```",
      tableMarkdown,
      ...tailParagraphs,
    ].join("\n\n")

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
          version: 5,
          title: "rich block stale selection 회귀 글",
          content,
          contentHtml: null,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/998")
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue(
      "rich block stale selection 회귀 글"
    )
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expectEditorToContainLoadedText(editor, tableLabel)

    const previousSelectionParagraph = editor.locator("p", { hasText: previousSelectionLabel }).first()
    const dragHandle = page.getByTestId("block-drag-handle")
    const selectPreviousBlockAnchor = async () => {
      await previousSelectionParagraph.scrollIntoViewIfNeeded()
      const previousSelectionBox = await expectVisibleBox(
        previousSelectionParagraph,
        "stale selection paragraph metrics are missing"
      )
      await page.mouse.move(
        previousSelectionBox.x + Math.min(previousSelectionBox.width / 2, 260),
        previousSelectionBox.y + Math.min(previousSelectionBox.height / 2, 18)
      )
      await previousSelectionParagraph.hover()
      await expect(dragHandle).toBeVisible()
      await dragHandle.click()
      await expect(page.getByTestId("keyboard-block-selection-overlay")).toBeVisible()
    }

    const assertClickKeepsViewport = async (
      target: Locator,
      label: string,
      clickOffset = { x: 36, y: 20 }
    ) => {
      await selectPreviousBlockAnchor()
      await target.scrollIntoViewIfNeeded()
      await target.evaluate((element) => {
        element.scrollIntoView({ block: "center", inline: "nearest" })
      })
      const targetBox = await expectVisibleBox(target, `${label} metrics are missing before click`)
      const beforeGeometry = await target.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return {
          scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
          targetTop: rect.top,
          targetBottom: rect.bottom,
        }
      })

      await page.mouse.click(
        targetBox.x + Math.min(clickOffset.x, Math.max(8, targetBox.width - 8)),
        targetBox.y + Math.min(clickOffset.y, Math.max(8, targetBox.height - 8))
      )
      const scrollSamples = await page.evaluate(
        () =>
          new Promise<Array<{ scrollTop: number; elapsedMs: number }>>((resolve) => {
            const samples: Array<{ scrollTop: number; elapsedMs: number }> = []
            const startedAt = performance.now()
            const collect = () => {
              samples.push({
                scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
                elapsedMs: performance.now() - startedAt,
              })
              if (performance.now() - startedAt >= 760) {
                resolve(samples)
                return
              }
              requestAnimationFrame(collect)
            }
            requestAnimationFrame(collect)
          })
      )

      const afterGeometry = await target.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return {
          scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
          targetTop: rect.top,
          targetBottom: rect.bottom,
        }
      })

      const maxScrollDelta = Math.max(
        ...scrollSamples.map((sample) => Math.abs(sample.scrollTop - beforeGeometry.scrollTop))
      )
      expect(maxScrollDelta).toBeLessThanOrEqual(24)
      expect(Math.abs(afterGeometry.scrollTop - beforeGeometry.scrollTop)).toBeLessThanOrEqual(24)
      expect(Math.abs(afterGeometry.targetTop - beforeGeometry.targetTop)).toBeLessThanOrEqual(24)
      expect(Math.abs(afterGeometry.targetBottom - beforeGeometry.targetBottom)).toBeLessThanOrEqual(24)
    }

    await assertClickKeepsViewport(
      editor.locator(".aq-mermaid-stage").first(),
      mermaidLabel
    )
    await assertClickKeepsViewport(
      editor.locator(".aq-code-shell", { hasText: codeLabel }).first(),
      codeLabel
    )
    await assertClickKeepsViewport(
      editor.locator("table th, table td", { hasText: tableLabel }).first(),
      tableLabel,
      { x: 24, y: 16 }
    )
  })

  test("실제 /editor/[id] 수정 진입은 본문 hover scroll, 선택 block affordance, code 원문을 유지한다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })
    const adminMember = {
      id: 1,
      username: "qa-admin",
      nickname: "aquila",
      isAdmin: true,
    }
    const targetLabel = "edit route selected scroll anchor"
    const paragraphs = Array.from({ length: 36 }, (_, index) =>
      index === 8
        ? `${targetLabel} ${index + 1}`
        : `edit route scroll paragraph ${index + 1}. 본문 hover wheel 입력과 block selection 고정 상태를 확인합니다.`
    )
    const content = [
      paragraphs.slice(0, 12).join("\n\n"),
      "```ts",
      "```",
      paragraphs.slice(12).join("\n\n"),
    ].join("\n\n")
    const prettyCodeHtml = [
      "<section>",
      ...paragraphs.slice(0, 12).map((paragraph) => `<p>${paragraph}</p>`),
      '<div class="aq-code-block" data-language="ts" data-raw-code="const restored = 305;&#10;return restored">',
      '<pre class="aq-code aq-pretty-pre">',
      '<code class="language-ts"></code>',
      '</pre></div>',
      ...paragraphs.slice(12).map((paragraph) => `<p>${paragraph}</p>`),
      "</section>",
    ].join("")

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/992", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 992,
          version: 8,
          title: "수정 route scroll/code 회귀 글",
          content,
          contentHtml: prettyCodeHtml,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/992")

    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue("수정 route scroll/code 회귀 글")
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expectEditorToContainLoadedText(editor, "edit route scroll paragraph 36")
    const codeBlock = page.locator(".aq-code-shell").first()
    await expect(codeBlock).toBeVisible({ timeout: 15_000 })
    await expect(codeBlock.locator(".aq-code-highlight-layer")).toContainText("const restored = 305;")
    await expect(codeBlock.locator(".aq-code-highlight-layer")).toContainText("return restored")

    const readScrollTop = () =>
      page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY)
    const firstParagraph = editor.locator("p", { hasText: "edit route scroll paragraph 1" }).first()
    await expect(firstParagraph).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 0))

    const firstBox = await firstParagraph.boundingBox()
    if (!firstBox) {
      throw new Error("edit route first paragraph metrics are missing before wheel")
    }
    await page.mouse.move(firstBox.x + Math.min(firstBox.width / 2, 120), firstBox.y + firstBox.height / 2)

    const hoverScrollBefore = await readScrollTop()
    await page.mouse.wheel(0, 360)
    await expect.poll(readScrollTop).toBeGreaterThan(hoverScrollBefore + 120)

    const targetParagraph = editor.locator("p", { hasText: targetLabel }).first()
    await targetParagraph.scrollIntoViewIfNeeded()
    const targetBox = await targetParagraph.boundingBox()
    if (!targetBox) {
      throw new Error("edit route target paragraph metrics are missing before block selection")
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
          scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
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
      throw new Error("edit route block selection geometry is missing before scroll")
    }

    await page.evaluate(
      ({ label, base }) => {
        const win = window as Window & {
          __editorScrollGeometrySamples?: Array<{
            scrollTop: number
            paragraphTop: number
            overlayTop: number
            handleTop: number
            overlayError: number
            handleError: number
            overlayVisible: boolean
            handleVisible: boolean
          }>
          __cleanupEditorScrollGeometrySamples?: () => void
        }
        win.__cleanupEditorScrollGeometrySamples?.()
        win.__editorScrollGeometrySamples = []

        const read = () => {
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
          const paragraphDelta = paragraphRect.top - base.paragraphTop
          return {
            scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
            paragraphTop: paragraphRect.top,
            overlayTop: overlayRect.top,
            handleTop: handleRect.top,
            overlayError: Math.abs(overlayRect.top - base.overlayTop - paragraphDelta),
            handleError: Math.abs(handleRect.top - base.handleTop - paragraphDelta),
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
        }

        const record = () => {
          if ((win.__editorScrollGeometrySamples?.length ?? 0) >= 8) return
          const next = read()
          if (next) win.__editorScrollGeometrySamples?.push(next)
        }

        window.addEventListener("scroll", record, { capture: true, passive: true })
        win.__cleanupEditorScrollGeometrySamples = () => {
          window.removeEventListener("scroll", record, true)
        }
      },
      { label: targetLabel, base: beforeGeometry }
    )

    await page.mouse.move(targetBox.x + Math.min(targetBox.width / 2, 120), targetBox.y + targetBox.height / 2)
    await page.mouse.wheel(0, 220)
    await expect
      .poll(async () => (await readSelectionGeometry())?.scrollTop ?? 0)
      .toBeGreaterThan(beforeGeometry.scrollTop + 60)

    const scrollSamples = await page.evaluate(() => {
      const win = window as Window & {
        __editorScrollGeometrySamples?: Array<{
          scrollTop: number
          overlayError: number
          handleError: number
          overlayVisible: boolean
          handleVisible: boolean
        }>
        __cleanupEditorScrollGeometrySamples?: () => void
      }
      win.__cleanupEditorScrollGeometrySamples?.()
      return win.__editorScrollGeometrySamples ?? []
    })
    const movedSamples = scrollSamples.filter((sample) => sample.scrollTop > beforeGeometry.scrollTop + 30)
    expect(movedSamples.length).toBeGreaterThan(0)
    expect(movedSamples.every((sample) => sample.overlayVisible && sample.handleVisible)).toBe(true)
    expect(Math.max(...movedSamples.map((sample) => sample.overlayError))).toBeLessThanOrEqual(10)
    expect(Math.max(...movedSamples.map((sample) => sample.handleError))).toBeLessThanOrEqual(12)

    const samples = await page.evaluate(async (label) => {
      const nextFrame = () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
      const read = () => {
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
      }

      const frames: Array<ReturnType<typeof read>> = []
      for (let index = 0; index < 8; index += 1) {
        await nextFrame()
        frames.push(read())
      }
      return frames
    }, targetLabel)

    expect(samples.every((sample) => sample?.overlayVisible && sample.handleVisible)).toBe(true)

    const afterGeometry = await readSelectionGeometry()
    if (!afterGeometry) {
      throw new Error("edit route block selection geometry is missing after scroll")
    }

    const paragraphDelta = afterGeometry.paragraphTop - beforeGeometry.paragraphTop
    expect(afterGeometry.overlayVisible).toBe(true)
    expect(afterGeometry.handleVisible).toBe(true)
    expect(Math.abs(afterGeometry.overlayTop - beforeGeometry.overlayTop - paragraphDelta)).toBeLessThanOrEqual(10)
    expect(Math.abs(afterGeometry.handleTop - beforeGeometry.handleTop - paragraphDelta)).toBeLessThanOrEqual(12)
    expect(Math.abs(afterGeometry.overlayTop + 4 - afterGeometry.paragraphTop)).toBeLessThanOrEqual(10)
  })
})
