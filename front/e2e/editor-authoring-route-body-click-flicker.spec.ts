import { expect, test } from "./helpers/authoringPlaywright"
import {
  expectEditorToContainLoadedText,
  expectVisibleBox,
  getWordDragPoints,
} from "./helpers/editorAuthoringFlow"

test.describe("editor authoring route body click flicker", () => {
  test("실제 /editor/[id] 본문 선택 드래그는 빠른 focus reveal 이후 이전 scrollTop으로 되돌아가지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })
    const adminMember = {
      id: 1,
      username: "qa-admin",
      nickname: "aquila",
      isAdmin: true,
    }
    const targetLabel = "본문선택스크롤점프대상"
    const paragraphs = Array.from({ length: 82 }, (_, index) =>
      index === 51
        ? `본문 선택 회귀 ${targetLabel} ${index + 1}. 드래그 선택 중 이전 scrollTop으로 되돌아가면 안 됩니다.`
        : `body selection scroll jump paragraph ${index + 1}. 글수정 본문 선택 위치 점프 회귀를 확인합니다.`
    )
    const content = paragraphs.join("\n\n")
    const contentHtml = paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("")

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/991", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 991,
          version: 5,
          title: "본문 선택 scroll jump 회귀 글",
          content,
          contentHtml,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/991")
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue(
      "본문 선택 scroll jump 회귀 글"
    )
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expectEditorToContainLoadedText(editor, targetLabel)

    const targetParagraph = editor.locator("p", { hasText: targetLabel }).first()
    await targetParagraph.scrollIntoViewIfNeeded()
    const dragPoints = await getWordDragPoints(targetParagraph, targetLabel)
    const beforeGeometry = await page.evaluate((label) => {
      const paragraph =
        Array.from(document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] p")).find(
          (element) => element.textContent?.includes(label)
        ) ?? null
      if (!paragraph) return null
      const rect = paragraph.getBoundingClientRect()
      return {
        scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
        paragraphTop: rect.top,
        visible: rect.bottom > 0 && rect.top < window.innerHeight,
      }
    }, targetLabel)
    if (!beforeGeometry) {
      throw new Error("body selection scroll jump geometry is missing before drag")
    }
    expect(beforeGeometry.visible).toBe(true)

    await page.evaluate(
      ({ label, beforeScrollTop }) => {
        const win = window as Window & {
          __bodySelectionScrollCalls?: Array<{ targetY: number; elapsedMs: number }>
          __restoreBodySelectionScrollTo?: () => void
        }
        const root = document.querySelector<HTMLElement>("[data-testid='block-editor-prosemirror']")
        const originalScrollTo = window.scrollTo.bind(window)
        const startedAt = performance.now()
        win.__bodySelectionScrollCalls = []
        win.__restoreBodySelectionScrollTo = () => {
          window.scrollTo = originalScrollTo
        }
        window.scrollTo = ((xOrOptions?: number | ScrollToOptions, y?: number) => {
          const targetY =
            typeof xOrOptions === "object"
              ? Number(xOrOptions.top ?? window.scrollY)
              : Number(y ?? window.scrollY)
          win.__bodySelectionScrollCalls?.push({
            targetY,
            elapsedMs: performance.now() - startedAt,
          })
          return originalScrollTo(xOrOptions as never, y as never)
        }) as typeof window.scrollTo
        root?.addEventListener(
          "pointerdown",
          (event) => {
            if (!(event.target instanceof Element)) return
            const paragraph = event.target.closest("p")
            if (!paragraph?.textContent?.includes(label)) return
            window.setTimeout(() => {
              const textNode =
                Array.from(paragraph.childNodes).find((node) => node.nodeType === Node.TEXT_NODE) ?? null
              if (textNode?.textContent) {
                const start = textNode.textContent.indexOf(label)
                if (start >= 0) {
                  const range = document.createRange()
                  range.setStart(textNode, start)
                  range.setEnd(textNode, start + label.length)
                  const selection = window.getSelection()
                  selection?.removeAllRanges()
                  selection?.addRange(range)
                  document.dispatchEvent(new Event("selectionchange", { bubbles: true }))
                }
              }
              window.scrollTo(0, beforeScrollTop + 96)
            }, 24)
          },
          { capture: true, once: true }
        )
      },
      { label: targetLabel, beforeScrollTop: beforeGeometry.scrollTop }
    )

    await page.mouse.move(dragPoints.startX, dragPoints.startY)
    await page.mouse.down()
    await page.waitForTimeout(72)
    await page.mouse.move(dragPoints.endX, dragPoints.endY, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(240)

    const afterGeometry = await page.evaluate(() => {
      const win = window as Window & {
        __bodySelectionScrollCalls?: Array<{ targetY: number; elapsedMs: number }>
        __restoreBodySelectionScrollTo?: () => void
      }
      const scrollCalls = win.__bodySelectionScrollCalls ?? []
      win.__restoreBodySelectionScrollTo?.()
      return {
        scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
        scrollCalls,
      }
    })
    const staleRestoreCalls = afterGeometry.scrollCalls.filter(
      (call) => call.elapsedMs > 24 && Math.abs(call.targetY - beforeGeometry.scrollTop) <= 4
    )

    expect(afterGeometry.scrollTop).toBeGreaterThan(beforeGeometry.scrollTop + 60)
    expect(staleRestoreCalls).toHaveLength(0)
  })

  test("실제 /editor/[id] 일반 본문 클릭은 지연 reveal scroll을 restore loop로 되돌리지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })
    const adminMember = {
      id: 1,
      username: "qa-admin",
      nickname: "aquila",
      isAdmin: true,
    }
    const targetLabel = "plain body click delayed reveal target"
    const paragraphs = Array.from({ length: 78 }, (_, index) =>
      index === 46
        ? `${targetLabel} ${index + 1}. 일반 본문 클릭은 focus reveal scroll을 장시간 restore loop로 되돌리면 안 됩니다.`
        : `plain delayed reveal paragraph ${index + 1}. 일반 본문 클릭 flicker 회귀를 확인합니다.`
    )
    const content = paragraphs.join("\n\n")
    const contentHtml = paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("")

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/990", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 990,
          version: 3,
          title: "일반 본문 클릭 delayed reveal 회귀 글",
          content,
          contentHtml,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/990")
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue(
      "일반 본문 클릭 delayed reveal 회귀 글"
    )
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expectEditorToContainLoadedText(editor, targetLabel)

    const targetParagraph = editor.locator("p", { hasText: targetLabel }).first()
    await targetParagraph.scrollIntoViewIfNeeded()
    const targetBox = await expectVisibleBox(targetParagraph, "plain delayed reveal target metrics are missing")
    const beforeGeometry = await page.evaluate((label) => {
      const paragraph =
        Array.from(document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] p")).find(
          (element) => element.textContent?.includes(label)
        ) ?? null
      if (!paragraph) return null
      const rect = paragraph.getBoundingClientRect()
      return {
        scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
        paragraphTop: rect.top,
        visible: rect.bottom > 0 && rect.top < window.innerHeight,
      }
    }, targetLabel)
    if (!beforeGeometry) {
      throw new Error("plain delayed reveal geometry is missing before click")
    }
    expect(beforeGeometry.visible).toBe(true)

    await page.evaluate(
      ({ label, beforeScrollTop }) => {
        const win = window as Window & {
          __plainBodyClickScrollCalls?: Array<{ targetY: number; elapsedMs: number }>
          __restorePlainBodyClickScrollTo?: () => void
        }
        const root = document.querySelector<HTMLElement>("[data-testid='block-editor-prosemirror']")
        const originalScrollTo = window.scrollTo.bind(window)
        const startedAt = performance.now()
        win.__plainBodyClickScrollCalls = []
        win.__restorePlainBodyClickScrollTo = () => {
          window.scrollTo = originalScrollTo
        }
        window.scrollTo = ((xOrOptions?: number | ScrollToOptions, y?: number) => {
          const targetY =
            typeof xOrOptions === "object"
              ? Number(xOrOptions.top ?? window.scrollY)
              : Number(y ?? window.scrollY)
          win.__plainBodyClickScrollCalls?.push({
            targetY,
            elapsedMs: performance.now() - startedAt,
          })
          return originalScrollTo(xOrOptions as never, y as never)
        }) as typeof window.scrollTo
        root?.addEventListener(
          "pointerdown",
          (event) => {
            if (!(event.target instanceof Element)) return
            const paragraph = event.target.closest("p")
            if (!paragraph?.textContent?.includes(label)) return
            window.setTimeout(() => {
              window.scrollTo(0, beforeScrollTop + 96)
            }, 80)
          },
          { capture: true, once: true }
        )
      },
      { label: targetLabel, beforeScrollTop: beforeGeometry.scrollTop }
    )

    await page.mouse.click(
      targetBox.x + Math.min(targetBox.width / 2, 260),
      targetBox.y + Math.min(targetBox.height / 2, 18)
    )
    await page.waitForTimeout(360)

    const afterGeometry = await page.evaluate(() => {
      const win = window as Window & {
        __plainBodyClickScrollCalls?: Array<{ targetY: number; elapsedMs: number }>
        __restorePlainBodyClickScrollTo?: () => void
      }
      const scrollCalls = win.__plainBodyClickScrollCalls ?? []
      win.__restorePlainBodyClickScrollTo?.()
      return {
        scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
        scrollCalls,
      }
    })
    const restoreCalls = afterGeometry.scrollCalls.filter(
      (call) => call.elapsedMs > 90 && Math.abs(call.targetY - beforeGeometry.scrollTop) <= 4
    )
    expect(afterGeometry.scrollTop).toBeGreaterThan(beforeGeometry.scrollTop + 60)
    expect(restoreCalls).toHaveLength(0)
  })
})
