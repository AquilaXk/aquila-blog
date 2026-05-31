import { expect, test } from "@playwright/test"
import {
  expectEditorToContainLoadedText,
  QA_ENGINE_ROUTE,
  QA_WRITER_ROUTE,
} from "./helpers/editorAuthoringFlow"

test.describe("editor authoring code and mermaid blocks", () => {
  test("코드 블록은 작성 surface에서도 Prism 하이라이트 토큰을 렌더한다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("/코드")
    await page.keyboard.press("Enter")
    await page.keyboard.type("const count = 1")
    await page.keyboard.press("Enter")
    await page.keyboard.type('return "ok"')

    const codeBlock = page.locator(".aq-code-shell").first()
    await expect(codeBlock).toBeVisible()
    await expect(codeBlock.locator(".aq-code-highlight-layer .token.keyword").first()).toBeVisible()
    await expect(codeBlock.locator(".aq-code-highlight-layer .token.string").first()).toBeVisible()

    const colors = await codeBlock.evaluate((element) => {
      const root = element as HTMLElement
      const base = root.querySelector<HTMLElement>(".aq-code-highlight-layer")
      const keyword = root.querySelector<HTMLElement>(".aq-code-highlight-layer .token.keyword")
      const stringToken = root.querySelector<HTMLElement>(".aq-code-highlight-layer .token.string")
      return {
        base: base ? window.getComputedStyle(base).color : "",
        keyword: keyword ? window.getComputedStyle(keyword).color : "",
        string: stringToken ? window.getComputedStyle(stringToken).color : "",
      }
    })

    expect(colors.base).toBeTruthy()
    expect(colors.keyword).toBeTruthy()
    expect(colors.string).toBeTruthy()
    expect(colors.keyword).not.toBe(colors.base)
    expect(colors.string).not.toBe(colors.base)
  })

  test("코드 블록 hover scroll surface는 wrapper chrome transition과 세로 gesture 차단을 쓰지 않는다", async ({ page }) => {
    const seed = encodeURIComponent("```javascript\nconst count = 1;\nreturn \"ok\";\n```\n\n아래 문단")
    await page.goto(`${QA_ENGINE_ROUTE}&seed=${seed}`)

    const codeWrapper = page.locator("[data-code-block-wrapper='true']").first()
    const codeShell = page.locator(".aq-code-shell").first()
    await expect(codeWrapper).toBeVisible()
    await expect(codeShell.locator(".aq-code-highlight-layer .token.keyword").first()).toBeVisible()

    const metrics = await codeWrapper.evaluate((element) => {
      const wrapperStyle = window.getComputedStyle(element as HTMLElement)
      const shell = element.querySelector<HTMLElement>(".aq-code-shell")
      const shellStyle = shell ? window.getComputedStyle(shell) : null
      return {
        transitionProperty: wrapperStyle.transitionProperty,
        shellTouchAction: shellStyle?.touchAction ?? "",
      }
    })

    expect(metrics.transitionProperty.split(",").map((property) => property.trim())).not.toEqual(
      expect.arrayContaining(["background-color", "box-shadow"])
    )
    expect(metrics.shellTouchAction === "auto" || metrics.shellTouchAction.includes("pan-y")).toBe(true)
  })

  test("코드 언어 선택 팝오버는 본문 숨김 텍스트 스타일을 상속하지 않는다", async ({ page }) => {
    const seed = encodeURIComponent("```javascript\nconst answer = 42;\n```")
    await page.goto(`${QA_ENGINE_ROUTE}&seed=${seed}`)

    await page.getByRole("button", { name: /JavaScript/i }).click()

    const languageDialog = page.getByRole("dialog", { name: "코드 언어 선택" })
    await expect(languageDialog).toBeVisible()
    await expect(languageDialog.getByRole("button", { name: "TXT", exact: true })).toBeVisible()

    const computed = await languageDialog.getByRole("button", { name: "TXT", exact: true }).evaluate((element) => {
      const buttonStyle = window.getComputedStyle(element as HTMLElement)
      const label = element.querySelector("span")
      const labelStyle = label ? window.getComputedStyle(label) : null

      return {
        buttonTextSecurity: buttonStyle.webkitTextSecurity,
        buttonTextFill: buttonStyle.webkitTextFillColor,
        labelTextSecurity: labelStyle?.webkitTextSecurity ?? "",
        labelTextFill: labelStyle?.webkitTextFillColor ?? "",
      }
    })

    expect(computed.buttonTextSecurity).toBe("none")
    expect(computed.labelTextSecurity).toBe("none")
    expect(computed.buttonTextFill).not.toBe("transparent")
    expect(computed.labelTextFill).not.toBe("transparent")
  })

  test("writer surface 코드 언어 선택 팝오버는 header clip 없이 옵션 리스트를 아래로 펼친다", async ({ page }) => {
    await page.goto(QA_WRITER_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("/code")
    await page.keyboard.press("Enter")

    const codeBlock = page.locator("[data-code-block-wrapper='true']").first()
    await expect(codeBlock).toBeVisible()

    await codeBlock.locator("button[aria-haspopup='dialog']").click()

    const languageDialog = page.getByRole("dialog", { name: "코드 언어 선택" })
    const txtOption = languageDialog.getByRole("button", { name: "TXT", exact: true })
    await expect(languageDialog).toBeVisible()
    await expect(txtOption).toBeVisible()

    await expect
      .poll(async () => {
        const headerRect = await codeBlock.locator("[data-code-block-header='true']").boundingBox()
        const optionRect = await txtOption.boundingBox()
        if (!headerRect || !optionRect) return Number.NEGATIVE_INFINITY
        return optionRect.y - headerRect.y - headerRect.height
      })
      .toBeGreaterThanOrEqual(8)
  })

  test("실제 /editor/[id] 수정 route 코드 언어 선택은 dialog를 열고 언어를 갱신한다", async ({
    page,
  }) => {
    const adminMember = {
      id: 1,
      username: "qa-admin",
      nickname: "aquila",
      isAdmin: true,
    }
    const content = [
      "코드 언어 선택 회귀 대상입니다.",
      "",
      "```ts",
      "const selectedLanguage = true",
      "```",
      "",
      "언어 선택 뒤 문단입니다.",
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
          version: 3,
          title: "코드 언어 선택 회귀 글",
          content,
          contentHtml: "",
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/998")

    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue("코드 언어 선택 회귀 글")
    await expectEditorToContainLoadedText(
      page.locator("[data-testid='block-editor-prosemirror']").first(),
      "언어 선택 뒤 문단입니다."
    )

    const codeBlock = page.locator("[data-code-block-wrapper='true']").first()
    await expect(codeBlock).toBeVisible({ timeout: 15_000 })
    await expect(codeBlock.locator(".aq-code-highlight-layer")).toContainText("const selectedLanguage")

    const codeContent = codeBlock.locator(".aq-code-editor-content").first()
    const dragPoints = await codeContent.evaluate((element) => {
      const targetText = "selectedLanguage"
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const current = walker.currentNode as Text
        const startOffset = current.data.indexOf(targetText)
        if (startOffset < 0) continue
        const range = document.createRange()
        range.setStart(current, startOffset)
        range.setEnd(current, startOffset + targetText.length)
        const rect = range.getBoundingClientRect()
        if (rect.width <= 2 || rect.height <= 2) break
        return {
          endX: rect.right - 1,
          startX: rect.left + 1,
          y: rect.top + rect.height / 2,
        }
      }
      throw new Error("code language regression selection target is missing")
    })
    await page.mouse.move(dragPoints.startX, dragPoints.y)
    await page.mouse.down()
    await page.mouse.move(dragPoints.endX, dragPoints.y, { steps: 12 })
    await page.mouse.up()
    await expect
      .poll(() =>
        page.evaluate(() => {
          const selectionText = window.getSelection()?.toString() ?? ""
          const persistedCodeSelectionText =
            document.querySelector("[data-code-drag-selection-text]")?.getAttribute("data-code-drag-selection-text") ??
            ""
          return (selectionText || persistedCodeSelectionText).replace(/\s+/g, " ").trim()
        })
      )
      .toContain("selectedLanguage")

    await page.evaluate(() => {
      const originalElementsFromPoint = document.elementsFromPoint.bind(document)
      Object.defineProperty(document, "elementsFromPoint", {
        configurable: true,
        value: (x: number, y: number) => {
          const elements = originalElementsFromPoint(x, y)
          const topElement = elements[0]
          const languageButton =
            topElement instanceof Element ? topElement.closest("[data-code-block-header='true'] button[aria-haspopup='dialog']") : null
          const codeShell = languageButton
            ?.closest("[data-code-block-wrapper='true']")
            ?.querySelector<HTMLElement>(".aq-code-shell")
          if (!codeShell || elements.includes(codeShell)) return elements
          return [topElement, codeShell, ...elements.filter((element) => element !== topElement)].filter(
            Boolean
          ) as Element[]
        },
      })
      const diagnosticsWindow = window as typeof window & {
        __aqCodeLanguagePointerDiagnostics?: Array<{ defaultPrevented: boolean; type: string }>
      }
      diagnosticsWindow.__aqCodeLanguagePointerDiagnostics = []
      const recordLanguageControlPointer = (event: Event) => {
        const target = event.target instanceof Element ? event.target : null
        if (!target?.closest("[data-code-block-header='true'] button[aria-haspopup='dialog']")) return
        diagnosticsWindow.__aqCodeLanguagePointerDiagnostics?.push({
          defaultPrevented: event.defaultPrevented,
          type: event.type,
        })
      }
      document.addEventListener("pointerdown", recordLanguageControlPointer, true)
      document.addEventListener("mousedown", recordLanguageControlPointer, true)
    })

    await codeBlock.getByRole("button", { name: /TypeScript/i }).click()

    const pointerDiagnostics = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __aqCodeLanguagePointerDiagnostics?: Array<{ defaultPrevented: boolean; type: string }>
          }
        ).__aqCodeLanguagePointerDiagnostics ?? []
    )
    expect(pointerDiagnostics.map((event) => event.type)).toEqual(["pointerdown", "mousedown"])
    expect(pointerDiagnostics.some((event) => event.defaultPrevented)).toBe(false)

    const languageDialog = page.getByRole("dialog", { name: "코드 언어 선택" })
    await expect(languageDialog).toBeVisible()
    await languageDialog.getByRole("button", { name: "Python", exact: true }).click()

    await expect(languageDialog).toHaveCount(0)
    await expect(
      codeBlock
        .locator("[data-code-block-header='true']")
        .getByRole("button", { name: "Python", exact: true })
    ).toBeVisible()
  })

  test("머메이드 블록 코드를 바꾸면 preview가 이전 템플릿이 아니라 최신 source로 즉시 다시 렌더된다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)
    await expect(page.getByTestId("qa-editor-ready")).toHaveCount(1)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("/mermaid")
    await page.keyboard.press("Enter")

    const mermaidInput = page.locator(".aq-mermaid-code-input").first()
    await expect(mermaidInput).toBeVisible()

    await mermaidInput.fill(
      [
        "sequenceDiagram",
        "autonumber",
        "participant C as Client (Browser)",
        "participant S as Server (API)",
        "participant DB as Session Store",
        "",
        "C->>S: 로그인 시도",
        "S->>DB: 세션 생성",
        "DB-->>S: Session Store 응답",
        "S-->>C: 결과 응답",
      ].join("\n")
    )

    const mermaidPreviewText = page.locator(".aq-mermaid-stage").first()
    await expect
      .poll(async () => ((await mermaidPreviewText.textContent()) || "").replace(/\s+/g, " ").trim())
      .toContain("Session Store")
    await expect
      .poll(async () => ((await mermaidPreviewText.textContent()) || "").replace(/\s+/g, " ").trim())
      .not.toContain("사용자 요청")
  })

  test("머메이드 코드 pane은 caret 이동 후에도 textarea와 highlight overlay의 가로 스크롤이 즉시 동기화된다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)
    await expect(page.getByTestId("qa-editor-ready")).toHaveCount(1)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("/mermaid")
    await page.keyboard.press("Enter")

    const mermaidInput = page.locator(".aq-mermaid-code-input").first()
    await expect(mermaidInput).toBeVisible()
    await mermaidInput.fill(
      [
        "sequenceDiagram",
        "participant VeryLongClientIdentifierForHorizontalScrollTesting1234567890 as VeryLongClientIdentifierForHorizontalScrollTesting1234567890",
        "participant S as Server",
        "VeryLongClientIdentifierForHorizontalScrollTesting1234567890->>S: 가로 스크롤이 필요한 아주 긴 요청 메시지 HorizontalScrollHorizontalScrollHorizontalScroll",
        "S-->>C: 응답",
      ].join("\n")
    )

    const maxScrollLeft = await mermaidInput.evaluate((element) => {
      const textarea = element as HTMLTextAreaElement
      return Math.max(0, textarea.scrollWidth - textarea.clientWidth)
    })
    expect(maxScrollLeft).toBeGreaterThanOrEqual(24)

    await mermaidInput.click()
    await mermaidInput.press("ArrowUp")
    await mermaidInput.press("End")
    await mermaidInput.press("ArrowDown")

    await expect
      .poll(() =>
        mermaidInput.evaluate((element) => {
          const textarea = element as HTMLTextAreaElement
          const highlight = textarea.parentElement?.querySelector<HTMLPreElement>(".aq-mermaid-code-highlight")
          return Math.abs(Math.round(textarea.scrollLeft) - Math.round(highlight?.scrollLeft || 0))
        })
      )
      .toBeLessThanOrEqual(1)
  })
})
