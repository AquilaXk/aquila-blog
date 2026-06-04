import { expect, test, type Locator } from "@playwright/test"
import { QA_ENGINE_ROUTE, QA_WRITER_ROUTE } from "./helpers/editorAuthoringFlow"
import { mockEditorRouteWithPost507 } from "./helpers/post507Fixtures"

const SELECT_ALL_SHORTCUT = process.platform === "darwin" ? "Meta+A" : "Control+A"

const expectCodeBlockInnerChromeHidden = async (codeBlock: Locator) => {
  const chrome = await codeBlock.evaluate((element) => {
    const readNodeChrome = (node: HTMLElement, selector: string) => {
      const style = window.getComputedStyle(node)
      return {
        backgroundColor: style.backgroundColor,
        borderBottomWidth: style.borderBottomWidth,
        borderLeftWidth: style.borderLeftWidth,
        borderRadius: style.borderTopLeftRadius,
        borderRightWidth: style.borderRightWidth,
        borderTopWidth: style.borderTopWidth,
        boxShadow: style.boxShadow,
        selector,
        tagName: node.tagName,
      }
    }
    const readChrome = (selector: string) => {
      const node = element.querySelector<HTMLElement>(selector)
      if (!node) throw new Error(`${selector} is missing`)
      return readNodeChrome(node, selector)
    }
    const readAllChrome = (selector: string) =>
      Array.from(element.querySelectorAll<HTMLElement>(selector)).map((node) =>
        readNodeChrome(node, selector)
      )

    return {
      content: readChrome(".aq-code-editor-content"),
      contentDescendants: [
        ...readAllChrome(".aq-code-editor-content > *"),
        ...readAllChrome(".aq-code-editor-content pre"),
        ...readAllChrome(".aq-code-editor-content code"),
        ...readAllChrome(".aq-code-highlight-layer code"),
      ],
      highlight: readChrome(".aq-code-highlight-layer"),
    }
  })

  for (const layer of [chrome.highlight, chrome.content, ...chrome.contentDescendants]) {
    expect([
      layer.borderTopWidth,
      layer.borderRightWidth,
      layer.borderBottomWidth,
      layer.borderLeftWidth,
    ], `${layer.selector} ${layer.tagName} border should be reset`).toEqual(["0px", "0px", "0px", "0px"])
    expect(layer.borderRadius, `${layer.selector} ${layer.tagName} radius should be reset`).toBe("0px")
    expect(layer.boxShadow, `${layer.selector} ${layer.tagName} shadow should be reset`).toBe("none")
    expect(layer.backgroundColor, `${layer.selector} ${layer.tagName} background should be reset`).toBe(
      "rgba(0, 0, 0, 0)"
    )
  }
}

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
    await expectCodeBlockInnerChromeHidden(codeBlock)

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
    await mockEditorRouteWithPost507(page, {
      postId: 565,
      title: "post 507 code language route 글",
    })

    const codeBlock = page.locator("[data-code-block-wrapper='true']").first()
    await expect(codeBlock).toBeVisible({ timeout: 15_000 })
    await expectCodeBlockInnerChromeHidden(codeBlock)

    await page.evaluate(() => {
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
      document.addEventListener("click", recordLanguageControlPointer, true)
    })

    const languageButton = codeBlock.locator("[data-code-block-header='true'] button[aria-haspopup='dialog']").first()
    await languageButton.scrollIntoViewIfNeeded()
    const beforeLanguageClickScrollTop = await page.evaluate(
      () => document.scrollingElement?.scrollTop ?? window.scrollY
    )
    const languageLabelBox = await languageButton.locator("span", { hasText: "TXT" }).boundingBox()
    if (!languageLabelBox) {
      throw new Error("code language label hit-test box is missing")
    }
    await page.mouse.click(
      languageLabelBox.x + languageLabelBox.width / 2,
      languageLabelBox.y + languageLabelBox.height / 2
    )
    await expect
      .poll(async () => {
        const scrollTop = await page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY)
        return Math.abs(scrollTop - beforeLanguageClickScrollTop)
      })
      .toBeLessThanOrEqual(24)

    const pointerDiagnostics = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __aqCodeLanguagePointerDiagnostics?: Array<{ defaultPrevented: boolean; type: string }>
          }
        ).__aqCodeLanguagePointerDiagnostics ?? []
    )
    expect(pointerDiagnostics.map((event) => event.type)).toEqual(["pointerdown", "mousedown", "click"])
    expect(pointerDiagnostics.some((event) => event.defaultPrevented)).toBe(false)
    await expect(languageButton).toHaveAttribute("aria-expanded", "true")

    const languageDialog = page.getByRole("dialog", { name: "코드 언어 선택" })
    await expect(languageDialog).toBeVisible()
    const pythonOption = languageDialog.getByRole("button", { name: "Python", exact: true })
    await pythonOption.click()

    await expect(languageDialog).toHaveCount(0)
    await expect(
      codeBlock
        .locator("[data-code-block-header='true']")
        .getByRole("button", { name: "Python", exact: true })
    ).toBeVisible()
  })

  test("실제 /editor/[id] 수정 route 코드블럭 block handle은 코드 text capture에 막히지 않는다", async ({
    page,
  }) => {
    await mockEditorRouteWithPost507(page, {
      postId: 591,
      title: "post 507 code block selection route 글",
    })

    const codeBlock = page.locator("[data-code-block-wrapper='true']").first()
    await expect(codeBlock).toBeVisible({ timeout: 15_000 })

    await codeBlock.evaluate((element) => {
      element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" })
    })
    await page.waitForTimeout(120)
    const codeBlockBox = await codeBlock.boundingBox()
    if (!codeBlockBox) {
      throw new Error("code block hit-test box is missing")
    }

    await page.mouse.move(codeBlockBox.x + 32, codeBlockBox.y + 36)
    const blockHandle = page.getByTestId("block-drag-handle")
    await expect(blockHandle).toBeVisible()
    await page.evaluate(() => {
      const diagnosticsWindow = window as typeof window & {
        __qaCodeBlockHandleEvents?: Array<Record<string, unknown>>
      }
      diagnosticsWindow.__qaCodeBlockHandleEvents = []
      const record = (phase: string, event: Event) => {
        const target = event.target instanceof Element ? event.target : null
        diagnosticsWindow.__qaCodeBlockHandleEvents?.push({
          activeTag: document.activeElement?.tagName ?? "",
          defaultPrevented: event.defaultPrevented,
          overlayCount: document.querySelectorAll("[data-testid='keyboard-block-selection-overlay']").length,
          phase,
          targetLabel: target?.getAttribute("aria-label") ?? "",
          targetTestId: target?.getAttribute("data-testid") ?? "",
          targetTitle: target?.getAttribute("title") ?? "",
          type: event.type,
        })
      }
      for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"] as const) {
        window.addEventListener(type, (event) => record("window-capture", event), { capture: true })
        document.addEventListener(type, (event) => record("document-bubble", event))
      }
    })
    await page.waitForTimeout(80)
    await blockHandle.hover()
    await expect
      .poll(async () =>
        blockHandle.evaluate((handle) => {
          const rect = handle.getBoundingClientRect()
          const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
          return Boolean(target?.closest("[data-testid='block-drag-handle']"))
        })
      )
      .toBe(true)
    await blockHandle.click()

    const blockSelectionOverlay = page.getByTestId("keyboard-block-selection-overlay")
    await expect(blockSelectionOverlay).toBeVisible({ timeout: 10_000 }).catch(async (error) => {
      const diagnostics = await page.evaluate(() => {
        const diagnosticsWindow = window as typeof window & {
          __qaCodeBlockHandleEvents?: Array<Record<string, unknown>>
        }
        return {
          activeText: document.activeElement?.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) ?? "",
          events: diagnosticsWindow.__qaCodeBlockHandleEvents ?? [],
          handleCount: document.querySelectorAll("[data-testid='block-drag-handle']").length,
          nativeSelection: window.getSelection()?.toString() ?? "",
          overlayCount: document.querySelectorAll("[data-testid='keyboard-block-selection-overlay']").length,
        }
      })
      throw new Error(`code block handle click did not create overlay: ${JSON.stringify(diagnostics)}\n${error.message}`)
    })
    const selectedOverlayBox = await blockSelectionOverlay.boundingBox()
    const selectedCodeBlockBox = await codeBlock.boundingBox()
    if (!selectedOverlayBox || !selectedCodeBlockBox) {
      throw new Error("code block selection overlay metrics are missing")
    }
    expect(Math.abs(selectedOverlayBox.y - selectedCodeBlockBox.y)).toBeLessThanOrEqual(8)
    expect(Math.abs(selectedOverlayBox.height - selectedCodeBlockBox.height)).toBeLessThanOrEqual(12)
    await expect
      .poll(async () => page.evaluate(() => window.getSelection()?.toString() ?? ""))
      .toBe("")
  })

  test("실제 /editor/[id] 수정 route 코드블럭 native 캐럿 클릭은 전체 root preserve로 승격되지 않는다", async ({
    page,
  }) => {
    await mockEditorRouteWithPost507(page, {
      postId: 609,
      title: "post 507 code block native selection route 글",
    })

    let codeBlockIndex = -1
    await expect
      .poll(async () => {
        codeBlockIndex = await page.locator("[data-code-block-wrapper='true']").evaluateAll((blocks) =>
          blocks.findIndex((block) => {
            const content = block.querySelector<HTMLElement>(".aq-code-editor-content")
            return Boolean(content && content.getBoundingClientRect().height > 0 && (content.innerText || content.textContent || "").trim())
          })
        )
        return codeBlockIndex >= 0
      })
      .toBe(true)
    const codeBlock = page.locator("[data-code-block-wrapper='true']").nth(codeBlockIndex)
    const codeContent = codeBlock.locator(".aq-code-editor-content").first()
    await expect(codeBlock).toBeVisible({ timeout: 15_000 })
    await expectCodeBlockInnerChromeHidden(codeBlock)
    await expect.poll(async () => (await codeContent.textContent())?.trim() ?? "").not.toBe("")

    await codeContent.scrollIntoViewIfNeeded()
    const codeContentBox = await codeContent.boundingBox()
    if (!codeContentBox) {
      throw new Error("code block content hit-test box is missing")
    }

    const partialSelectionText = await codeContent.evaluate((element) => {
      const root = element as HTMLElement
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let textNode: Text | null = null
      let selectionStart = 0
      while (walker.nextNode()) {
        const candidate = walker.currentNode as Text
        const candidateText = candidate.textContent || ""
        const nonWhitespaceStart = candidateText.search(/\S/)
        if (nonWhitespaceStart >= 0 && candidateText.slice(nonWhitespaceStart).trim().length >= 8) {
          textNode = candidate
          selectionStart = nonWhitespaceStart
          break
        }
      }
      if (!textNode) throw new Error("code block target text node is missing")
      const rawText = textNode.textContent || ""
      const start = selectionStart
      const end = start + 16
      const range = document.createRange()
      range.setStart(textNode, start)
      range.setEnd(textNode, Math.min(rawText.length, end))
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      return selection?.toString() || ""
    })
    expect(partialSelectionText.trim().length).toBeGreaterThanOrEqual(8)

    await page.mouse.click(codeContentBox.x + 180, codeContentBox.y + 28)

    await expect
      .poll(async () =>
        codeContent.evaluate((element) => {
          const root = element as HTMLElement
          const shell = root.closest<HTMLElement>(".aq-code-shell")
          const rootText = (root.innerText || root.textContent || "").trim()
          const selection = window.getSelection()
          const selectionText = selection?.toString() || ""
          return {
            fallbackText: shell?.getAttribute("data-code-drag-selection-text") || "",
            isCollapsed: Boolean(selection?.isCollapsed),
            isFullRootSelection: Boolean(rootText && selectionText.trim() === rootText),
            selectionText,
          }
        })
      )
      .toEqual({
        fallbackText: "",
        isCollapsed: true,
        isFullRootSelection: false,
        selectionText: "",
      })
  })

  test("실제 /editor/[id] 수정 route 코드 hover 중 제목 Cmd/Ctrl+A는 제목 입력 selection을 유지한다", async ({
    page,
  }) => {
    const routeTitle = "post 507 code hover select all guard 글"
    await mockEditorRouteWithPost507(page, {
      postId: 610,
      title: routeTitle,
    })

    const codeContent = page.locator(".aq-code-editor-content").first()
    const titleInput = page.getByPlaceholder("제목을 입력하세요").first()
    await expect(codeContent).toBeVisible({ timeout: 15_000 })
    await expect(titleInput).toHaveValue(routeTitle)

    const codeContentBox = await codeContent.boundingBox()
    if (!codeContentBox) {
      throw new Error("code block content hover box is missing")
    }

    await titleInput.focus()
    await page.mouse.move(codeContentBox.x + Math.min(80, codeContentBox.width / 2), codeContentBox.y + 24)
    await page.keyboard.press(SELECT_ALL_SHORTCUT)

    const selectionState = await titleInput.evaluate((element) => {
      const input = element as HTMLInputElement | HTMLTextAreaElement
      const activeElement = document.activeElement
      const activeTextField =
        activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement
          ? activeElement
          : null
      return {
        activePlaceholder: activeTextField?.placeholder ?? "",
        end: input.selectionEnd ?? -1,
        start: input.selectionStart ?? -1,
        value: input.value,
      }
    })

    expect(selectionState).toEqual({
      activePlaceholder: "제목을 입력하세요",
      end: routeTitle.length,
      start: 0,
      value: routeTitle,
    })
  })

  test("실제 /editor/[id] 수정 route 코드 visible 중 본문 Cmd/Ctrl+A는 코드 선택으로 가로채지 않는다", async ({
    page,
  }) => {
    await mockEditorRouteWithPost507(page, {
      postId: 611,
      title: "post 507 code visible select all guard 글",
    })

    const codeContent = page.locator(".aq-code-editor-content").first()
    const bodyParagraph = page
      .locator(".ProseMirror p")
      .filter({ hasText: "보통 처음 인증을 구현한다면" })
      .first()
    await expect(codeContent).toBeVisible({ timeout: 15_000 })
    await expect.poll(async () => ((await codeContent.textContent()) || "").trim()).not.toBe("")
    await expect(bodyParagraph).toBeVisible()

    await codeContent.evaluate((element) => {
      element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" })
    })
    await bodyParagraph.click()
    await page.keyboard.press(SELECT_ALL_SHORTCUT)

    const selectionState = await codeContent.evaluate((codeRoot) => {
      return {
        codeFallbackText: codeRoot?.closest(".aq-code-shell")?.getAttribute("data-code-drag-selection-text") || "",
        codeText: (codeRoot?.innerText || codeRoot?.textContent || "").trim(),
        selectionText: window.getSelection()?.toString().trim() || "",
      }
    })

    expect(selectionState.codeFallbackText).toBe("")
    expect(selectionState.selectionText).not.toBe(selectionState.codeText)
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
