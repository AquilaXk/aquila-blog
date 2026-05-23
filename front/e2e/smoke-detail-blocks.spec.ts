import { expect, test } from "@playwright/test"
import { mockAvatarAsset } from "./helpers/smokeFixtures"
test.beforeEach(async ({ page }) => {
  await mockAvatarAsset(page)
})

test.describe("core smoke detail blocks and typography", () => {
  test("상세 페이지 콜아웃과 토글 블록은 작성 문법대로 렌더된다", async ({ page }) => {
  await page.route("**/post/api/v1/posts/779**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 779,
        createdAt: "2026-03-16T00:00:00Z",
        modifiedAt: "2026-03-16T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "콜아웃 토글 렌더링 테스트",
        content: [
          "> [!TIP]",
          "> **핵심 포인트**",
          "> 콜아웃 본문입니다.",
          "",
          "<aside>",
          "ℹ️",
          "**추가 정보**",
          '정확히는 **"OAuth 2.0 흐름을 사용하되, 인증 시나리오는 OIDC로 구현한다"**가 가장 적절한 선택이었습니다.',
          "</aside>",
          "",
          "<aside>",
          "ℹ️",
          "**Endpoint**는 연결을 여는 입구입니다.",
          "",
          "- **Prefix**는 메시지의 진입 방향과 배포 방향을 나누는 규칙입니다.",
          "- **Broker**는 구독자에게 메시지를 전달하는 우체국입니다.",
          "</aside>",
          "",
          "```txt",
          "src/main/java/com/team/bidnow",
          "|-- BidNowApplication.java",
          "|",
          "|-- global",
          "|   |-- config",
          "|   |   |-- WebSocketConfig.java",
          "```",
          "",
          ":::toggle 더 보기",
          "토글 내부 본문입니다.",
          ":::",
        ].join("\n"),
        tags: [],
        category: [],
        published: true,
        listed: true,
        likesCount: 0,
        commentsCount: 0,
        hitCount: 0,
        actorHasLiked: false,
        actorCanModify: false,
        actorCanDelete: false,
      }),
    })
  })

  await page.route("**/post/api/v1/posts/779/hit**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCode: "200-1",
        msg: "ok",
        data: { hitCount: 1 },
      }),
    })
  })

  await page.goto("/posts/779")
  await expect(page.getByText("콜아웃 토글 렌더링 테스트")).toBeVisible()
  await expect(page.locator(".aq-callout.aq-admonition-tip")).toBeVisible()
  await expect(page.locator(".aq-callout.aq-admonition-tip .aq-callout-title")).toHaveText("핵심 포인트")
  await expect(page.locator(".aq-callout.aq-admonition-tip")).toContainText("콜아웃 본문입니다.")
  const infoCallout = page.locator(".aq-callout.aq-admonition-info").first()
  await expect(infoCallout).toBeVisible()
  await expect(infoCallout.locator(".aq-callout-title")).toHaveText("추가 정보")
  await expect(infoCallout).toContainText(
    '정확히는 "OAuth 2.0 흐름을 사용하되, 인증 시나리오는 OIDC로 구현한다"가 가장 적절한 선택이었습니다.'
  )
  await expect(infoCallout.locator(".aq-markdown-text strong")).toHaveText(
    '"OAuth 2.0 흐름을 사용하되, 인증 시나리오는 OIDC로 구현한다"'
  )
  await expect(infoCallout).not.toContainText('**"OAuth 2.0 흐름을 사용하되, 인증 시나리오는 OIDC로 구현한다"**')
  const inlineBoldInfoCallout = page.locator(".aq-callout.aq-admonition-info").nth(1)
  await expect(inlineBoldInfoCallout).toBeVisible()
  await expect(inlineBoldInfoCallout.locator(".aq-callout-title")).toHaveCount(0)
  await expect(inlineBoldInfoCallout).toContainText("Endpoint는 연결을 여는 입구입니다.")
  await expect(inlineBoldInfoCallout.locator(".aq-markdown-text strong").first()).toHaveText("Endpoint")
  await expect(page.getByText(/^Tip$/)).toHaveCount(0)
  await expect(page.getByText(/^Information$/)).toHaveCount(0)
  await page.getByText("더 보기").click()
  await expect(page.getByText("토글 내부 본문입니다.")).toBeVisible()

  const toggleSummary = page.locator(".aq-toggle > summary").first()
  const toggleMetrics = await toggleSummary.evaluate((element) => {
    const summaryElement = element as HTMLElement
    const contentWrapper = summaryElement.parentElement?.querySelector(".aq-toggle__body")
    const titleElement = summaryElement.querySelector(".aq-toggle__title")
    const caretElement = summaryElement.querySelector(".aq-toggle__caret")
    const bodyParagraph = contentWrapper?.querySelector("p")
    if (
      !(contentWrapper instanceof HTMLElement) ||
      !(titleElement instanceof HTMLElement) ||
      !(caretElement instanceof HTMLElement) ||
      !(bodyParagraph instanceof HTMLElement) ||
      !(titleElement.firstChild instanceof Text)
    ) {
      return null
    }

    const titleRange = document.createRange()
    titleRange.selectNodeContents(titleElement.firstChild)
    const titleRect = titleRange.getBoundingClientRect()
    const bodyRect = bodyParagraph.getBoundingClientRect()
    const caretRect = caretElement.getBoundingClientRect()
    const caretStyle = window.getComputedStyle(caretElement, "::before")

    return {
      titleLeft: titleRect.left,
      bodyLeft: bodyRect.left,
      caretWidth: caretRect.width,
      caretHeight: caretRect.height,
      caretClipPath: caretStyle.clipPath,
    }
  })

  expect(toggleMetrics).not.toBeNull()
  expect(toggleMetrics?.caretClipPath ?? "").toContain("polygon")
  expect(toggleMetrics?.caretWidth ?? 0).toBeGreaterThanOrEqual(12)
  expect(toggleMetrics?.caretHeight ?? 0).toBeGreaterThanOrEqual(12)
  expect(Math.abs((toggleMetrics?.titleLeft ?? 0) - (toggleMetrics?.bodyLeft ?? 0))).toBeLessThanOrEqual(2)

  const codeBlock = page.locator(".aq-code-block").first()
  await expect(codeBlock).toBeVisible()
  const codeLines = codeBlock.locator(".aq-pretty-pre code [data-line]")
  await expect(codeLines).toHaveCount(6)
  await expect(codeLines.nth(1)).toHaveText("|-- BidNowApplication.java")
  await expect(codeLines.nth(5)).toHaveText("|   |   |-- WebSocketConfig.java")

  const codeMetrics = await codeBlock.evaluate((element) => {
    const block = element as HTMLElement
    const pre = block.querySelector(".aq-pretty-pre")
    const code = pre?.querySelector("code")
    const lines = code ? Array.from(code.querySelectorAll<HTMLElement>("[data-line]")) : []
    const firstLine = lines[0]
    const secondLine = lines[1]

    if (
      !(pre instanceof HTMLElement) ||
      !(code instanceof HTMLElement) ||
      !(firstLine instanceof HTMLElement) ||
      !(secondLine instanceof HTMLElement)
    ) {
      return null
    }

    const preStyle = window.getComputedStyle(pre)
    const lineStyle = window.getComputedStyle(firstLine)
    const gutterStyle = window.getComputedStyle(firstLine, "::before")
    const firstRect = firstLine.getBoundingClientRect()
    const secondRect = secondLine.getBoundingClientRect()

    return {
      prePaddingLeft: Number.parseFloat(preStyle.paddingLeft),
      linePaddingLeft: Number.parseFloat(lineStyle.paddingLeft),
      gutterWidth: Number.parseFloat(gutterStyle.width),
      lineDeltaTop: secondRect.top - firstRect.top,
    }
  })

  expect(codeMetrics).not.toBeNull()
  expect(codeMetrics?.lineDeltaTop ?? 0).toBeGreaterThan(12)
  expect(codeMetrics?.prePaddingLeft ?? 999).toBeLessThanOrEqual(16)
  const lineGap = (codeMetrics?.linePaddingLeft ?? 999) - (codeMetrics?.gutterWidth ?? 0)
  expect(lineGap).toBeGreaterThanOrEqual(8)
  expect(lineGap).toBeLessThanOrEqual(10)
})
})
