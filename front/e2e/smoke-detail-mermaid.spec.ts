import { expect, test } from "@playwright/test"
import { mockAvatarAsset } from "./helpers/smokeFixtures"
test.beforeEach(async ({ page }) => {
  await mockAvatarAsset(page)
})

test.describe("core smoke detail mermaid", () => {
  test("상세 페이지 머메이드 블록은 코드 텍스트가 아니라 다이어그램 SVG로 렌더된다", async ({ page }) => {
  await page.route("**/post/api/v1/posts/777**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 777,
        createdAt: "2026-03-16T00:00:00Z",
        modifiedAt: "2026-03-16T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "머메이드 렌더링 테스트",
        content: [
          "```mermaid",
          "graph TD",
          "  A[요청] --> B[완료]",
          "```",
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

  await page.route("**/post/api/v1/posts/777/hit**", async (route) => {
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

  await page.goto("/posts/777")
  await expect(page.getByText("머메이드 렌더링 테스트")).toBeVisible()
  await expect
    .poll(async () => await page.locator("pre.aq-mermaid[data-mermaid-rendered='true']").count(), { timeout: 20_000 })
    .toBeGreaterThan(0)
  await expect
    .poll(async () => await page.locator(".aq-mermaid-stage svg").count(), { timeout: 20_000 })
    .toBeGreaterThan(0)
  await expect(page.locator("pre code", { hasText: "graph TD" })).toHaveCount(0)
})

  test("깃허브 호환용 mermaid info 블록도 렌더 경로를 탄다", async ({ page }) => {
  await page.route("**/post/api/v1/posts/780**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 780,
        createdAt: "2026-03-16T00:00:00Z",
        modifiedAt: "2026-03-16T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "머메이드 info 테스트",
        content: ["```mermaid", "info", "```"].join("\n"),
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

  await page.route("**/post/api/v1/posts/780/hit**", async (route) => {
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

  await page.goto("/posts/780")
  await expect(page.getByText("머메이드 info 테스트")).toBeVisible()
  await expect
    .poll(async () => await page.locator("pre.aq-mermaid[data-mermaid-rendered='true']").count(), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0)
  await expect(page.locator(".aq-mermaid-stage")).toContainText("v10.")
  await expect(page.locator("pre code", { hasText: /^info$/ })).toHaveCount(0)
})

  test("mermaid source style 지시문이 있어도 상세 배경은 V4 paper preset을 유지한다", async ({ page }) => {
  await page.route("**/post/api/v1/posts/782**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 782,
        createdAt: "2026-03-16T00:00:00Z",
        modifiedAt: "2026-03-16T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "머메이드 스타일 지시문 투명 배경 테스트",
        content: [
          "```mermaid",
          "flowchart TD",
          "classDef default fill:#2b2d3a,stroke:#30363d,color:#f0f6fc",
          "  A[에러 로그 다발] --> B[SSE 원인]",
          "  A --> C[Like 500]",
          "```",
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

  await page.route("**/post/api/v1/posts/782/hit**", async (route) => {
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

  await page.goto("/posts/782")
  await expect(page.getByText("머메이드 스타일 지시문 투명 배경 테스트")).toBeVisible()
  await expect
    .poll(async () => await page.locator("pre.aq-mermaid[data-mermaid-rendered='true']").count(), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0)

  const mermaidStyleText = (await page.locator(".aq-mermaid-stage svg style").first().textContent()) || ""
  expect(mermaidStyleText).not.toContain("#2b2d3a!important")

  const mermaidBlockBackground = await page.locator("pre.aq-mermaid").first().evaluate((node) => {
    return window.getComputedStyle(node).backgroundColor
  })
  expect(["rgb(255, 255, 255)", "rgba(255, 255, 255, 1)"]).toContain(mermaidBlockBackground)

  const nodeFill = await page.locator(".aq-mermaid-stage svg .node rect").first().evaluate((node) => {
    return window.getComputedStyle(node as SVGGraphicsElement).fill
  })
  expect(["transparent", "rgba(0, 0, 0, 0)"]).toContain(nodeFill)
})

  test("mermaid init theme override 가 있어도 상세 배경은 V4 paper preset을 유지한다", async ({ page }) => {
  await page.route("**/post/api/v1/posts/783**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 783,
        createdAt: "2026-04-12T00:00:00Z",
        modifiedAt: "2026-04-12T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "머메이드 init override 투명 배경 테스트",
        content: [
          "```mermaid",
          '%%{init: {"theme":"dark","themeVariables":{"mainBkg":"#2b2d3a","clusterBkg":"#2b2d3a","edgeLabelBackground":"#2b2d3a","primaryColor":"#2b2d3a","background":"#333333"},"flowchart":{"curve":"basis"}}}%%',
          "flowchart TD",
          "  A[자동 변환 이후 자주 보이는 상태] --> B[nullable 남발]",
          "  A --> C[var 중심 설계 유지]",
          "```",
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

  await page.route("**/post/api/v1/posts/783/hit**", async (route) => {
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

  await page.goto("/posts/783")
  await expect(page.getByText("머메이드 init override 투명 배경 테스트")).toBeVisible()
  await expect
    .poll(async () => await page.locator("pre.aq-mermaid[data-mermaid-rendered='true']").count(), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0)

  const mermaidStyleText = (await page.locator(".aq-mermaid-stage svg style").first().textContent()) || ""
  expect(mermaidStyleText).not.toContain("fill:#2b2d3a")
  expect(mermaidStyleText).not.toContain("background-color:#2b2d3a")

  const mermaidBlockBackground = await page.locator("pre.aq-mermaid").first().evaluate((node) => {
    return window.getComputedStyle(node).backgroundColor
  })
  expect(["rgb(255, 255, 255)", "rgba(255, 255, 255, 1)"]).toContain(mermaidBlockBackground)

  const nodeFill = await page.locator(".aq-mermaid-stage svg .node rect").first().evaluate((node) => {
    return window.getComputedStyle(node as SVGGraphicsElement).fill
  })
  expect(["transparent", "rgba(0, 0, 0, 0)"]).toContain(nodeFill)
})

  test("긴 Mermaid 라벨은 자동 줄바꿈 힌트를 적용해 렌더된다", async ({ page }) => {
  await page.route("**/post/api/v1/posts/781**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 781,
        createdAt: "2026-03-16T00:00:00Z",
        modifiedAt: "2026-03-16T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "머메이드 긴 라벨 줄바꿈 테스트",
        content: [
          "```mermaid",
          "flowchart TD",
          '  A["SSE 알림이 잠깐 되다가 멈추는 현상을 추적한 트러블슈팅 기록입니다"] --> B{"20초 내 heartbeat 수신 여부와 재연결 누락 여부를 함께 확인해야 하나요?"}',
          "  B -->|Yes| C[정상]",
          "  B -->|No| D[점검]",
          "```",
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

  await page.route("**/post/api/v1/posts/781/hit**", async (route) => {
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

  await page.goto("/posts/781")
  await expect(page.getByText("머메이드 긴 라벨 줄바꿈 테스트")).toBeVisible()
  await expect
    .poll(async () => await page.locator("pre.aq-mermaid[data-mermaid-rendered='true']").count(), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0)
  await expect
    .poll(async () => {
      return (
        (await page
          .locator("pre.aq-mermaid[data-mermaid-rendered='true']")
          .first()
          .getAttribute("data-mermaid-rendered-source")) ||
        ""
      )
    })
    .toContain("<br/>")
})

  test("복잡한 Mermaid는 복잡도 가드를 표시하고 확대 버튼을 유지한다", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })

  const chainLines = Array.from({ length: 82 }, (_, index) => {
    return `  N${index}[노드 ${index}] --> N${index + 1}[노드 ${index + 1}]`
  })

  await page.route("**/post/api/v1/posts/782**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 782,
        createdAt: "2026-03-16T00:00:00Z",
        modifiedAt: "2026-03-16T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "머메이드 복잡도 가드 테스트",
        content: ["```mermaid", "flowchart TD", ...chainLines, "```"].join("\n"),
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

  await page.route("**/post/api/v1/posts/782/hit**", async (route) => {
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

  await page.goto("/posts/782")
  await expect(page.getByText("머메이드 복잡도 가드 테스트")).toBeVisible()
  await expect
    .poll(async () => await page.locator("pre.aq-mermaid[data-mermaid-rendered='true']").count(), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0)
  await expect(page.locator("pre.aq-mermaid[data-mermaid-complexity='high']")).toHaveCount(1)
  await expect(page.locator("pre.aq-mermaid[data-mermaid-expandable='true'] .aq-mermaid-expand-btn")).toBeVisible()

  const overflow = await page.evaluate(() => {
    const html = document.documentElement
    const body = document.body
    return {
      htmlClientWidth: html.clientWidth,
      htmlScrollWidth: html.scrollWidth,
      bodyClientWidth: body.clientWidth,
      bodyScrollWidth: body.scrollWidth,
    }
  })
  expect(overflow.htmlScrollWidth).toBeLessThanOrEqual(overflow.htmlClientWidth + 1)
  expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.bodyClientWidth + 1)
})

  test("잘못된 닫힘 fence(```4) 입력도 복구되어 머메이드와 후속 마크다운이 함께 정상 렌더된다", async ({ page }) => {
  await page.route("**/post/api/v1/posts/778**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 778,
        createdAt: "2026-03-16T00:00:00Z",
        modifiedAt: "2026-03-16T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "머메이드 fence 복구 테스트",
        content: [
          "```mermaid",
          "flowchart LR",
          "  A[시작] --> B[완료]",
          "```4",
          "",
          "이 문장은 **볼드**로 렌더되어야 합니다.",
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

  await page.route("**/post/api/v1/posts/778/hit**", async (route) => {
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

  await page.goto("/posts/778")
  await expect(page.getByText("머메이드 fence 복구 테스트")).toBeVisible()
  await expect
    .poll(async () => await page.locator(".aq-mermaid-stage svg").count())
    .toBeGreaterThan(0)
  await expect(page.locator("pre code", { hasText: "flowchart LR" })).toHaveCount(0)
  await expect(page.locator("strong", { hasText: "볼드" })).toBeVisible()
})
})
