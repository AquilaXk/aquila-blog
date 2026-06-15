import { expect, test } from "@playwright/test"
import {
  mockAvatarAsset,
} from "./helpers/smokeFixtures"

test.beforeEach(async ({ page }) => {
  await mockAvatarAsset(page)
})

test.describe("core smoke detail rendering", () => {
  test("상세 본문은 legacy inline code html을 인라인 코드로 정규화한다", async ({ page }) => {
  await page.route("**/post/api/v1/posts/105", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 105,
        createdAt: "2026-03-16T00:00:00Z",
        modifiedAt: "2026-03-16T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "인라인 코드 정규화 회귀 방지",
        content: [
          "1. 클라이언트가 <code>/pub/chat/message</code> 로 메시지를 보냅니다.",
          '2. 서버는 <code>@MessageMapping("/chat/message")</code> 에서 이를 받습니다.',
          "3. 최종 메시지를 <code>/sub/chat/room/{roomId}</code> 구독자에게 브로드캐스트합니다.",
        ].join("\n\n"),
        tags: ["테스트태그"],
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

  await page.route("**/post/api/v1/posts/105/hit", async (route) => {
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

  await page.goto("/posts/105")
  await expect(page.getByText("인라인 코드 정규화 회귀 방지")).toBeVisible()
  await expect(page.locator(".aq-inline-code").filter({ hasText: "/pub/chat/message" })).toBeVisible()
  await expect(
    page.locator(".aq-inline-code").filter({ hasText: '@MessageMapping("/chat/message")' })
  ).toBeVisible()
  await expect(
    page.locator(".aq-inline-code").filter({ hasText: "/sub/chat/room/{roomId}" })
  ).toBeVisible()
  await expect(page.getByText("<code>/pub/chat/message</code>")).toHaveCount(0)
})

  test("상세 본문은 inline color quoted strong 토큰과 blockquote soft line break를 그대로 노출하지 않는다", async ({ page }) => {
  await page.route("**/post/api/v1/posts/507", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 507,
        createdAt: "2026-04-08T00:36:08.787Z",
        modifiedAt: "2026-04-17T01:03:59.132Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "post 507 detail rendering 회귀 방지",
        content: [
          "> **세션 = 서버 저장****토큰 = 클라이언트 저장**",
          "",
          "👉 {{color:#fb923c|**서버가 사용자가 로그인한 상태를 기억**}}**하고 있기 때문입니다**",
          "",
          '왜냐하면 중요한건 {{color:#34d399|**"어디에"}}**저장하느냐가 아니라',
          "",
          '*"요청이 진짜 우리 사용자의 의도인가"*를 서버가 판단할 수 있어야 합니다.',
        ].join("\n"),
        tags: ["테스트태그"],
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

  await page.route("**/post/api/v1/posts/507/hit", async (route) => {
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

  await page.goto("/posts/507")
  await expect(page.getByText("post 507 detail rendering 회귀 방지")).toBeVisible()
  await expect(page.locator(".aq-inline-color").filter({ hasText: "서버가 사용자가 로그인한 상태를 기억" })).toBeVisible()
  const coloredQuotedStrong = page.locator(".aq-inline-color").filter({ hasText: '"어디에"' }).first()
  await expect(coloredQuotedStrong).toBeVisible()
  await expect(coloredQuotedStrong).not.toContainText("**")
  await expect(page.getByText("{{color:#fb923c|")).toHaveCount(0)
  await expect(page.locator(".aq-markdown em").filter({ hasText: '"요청이 진짜 우리 사용자의 의도인가"' })).toBeVisible()

  const blockquoteMetrics = await page.locator("blockquote").first().evaluate((element) => {
    const html = element.innerHTML
    return {
      hasBreak: html.includes("<br"),
      strongCount: element.querySelectorAll("strong").length,
      text: element.textContent || "",
    }
  })

  expect(blockquoteMetrics.hasBreak).toBeTruthy()
  expect(blockquoteMetrics.strongCount).toBeGreaterThanOrEqual(2)
  expect(blockquoteMetrics.text).toContain("세션 = 서버 저장")
  expect(blockquoteMetrics.text).toContain("토큰 = 클라이언트 저장")

  const markdownText = await page.locator(".aq-markdown").first().evaluate((element) => element.textContent || "")
  expect(markdownText).not.toContain('**"어디에"**')
  expect(markdownText).not.toContain('*"요청이 진짜 우리 사용자의 의도인가"*를')
})

  test("상세 본문은 trailing-space malformed strong marker를 그대로 노출하지 않는다", async ({ page }) => {
  await page.route("**/post/api/v1/posts/508", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 508,
        createdAt: "2026-04-08T00:36:08.787Z",
        modifiedAt: "2026-04-23T01:03:59.132Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "post 508 malformed strong 회귀 방지",
        content: [
          '왜냐하면 중요한건 {{color:#34d399|**"어디에" **}}저장하느냐가 아니라',
          "",
          "## **구현 예시 **",
        ].join("\n"),
        tags: ["테스트태그"],
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

  await page.route("**/post/api/v1/posts/508/hit", async (route) => {
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

  await page.goto("/posts/508")
  await expect(page.getByText("post 508 malformed strong 회귀 방지")).toBeVisible()

  const coloredMalformedStrong = page.locator(".aq-inline-color").filter({ hasText: '"어디에"' }).first()
  await expect(coloredMalformedStrong).toBeVisible()
  await expect(coloredMalformedStrong).not.toContainText("**")
  await expect(page.getByRole("heading", { name: "구현 예시" })).toBeVisible()

  const markdownText = await page.locator(".aq-markdown").first().evaluate((element) => element.textContent || "")
  expect(markdownText).not.toContain('**"어디에" **')
  expect(markdownText).not.toContain("**구현 예시 **")
})

  test("상세 코드블럭은 Prism fallback 토큰 하이라이팅을 유지한다", async ({ page }) => {
  await page.addInitScript(() => {
    type CodeLineSnapshot = {
      html: string
      lineCount: number
      text: string
    }
    const windowWithSnapshots = window as typeof window & {
      __aqCodeLineSnapshots?: CodeLineSnapshot[]
    }
    windowWithSnapshots.__aqCodeLineSnapshots = []

    const capture = () => {
      const code = document.querySelector<HTMLElement>(".aq-code-block .aq-pretty-pre code")
      if (!code) return
      windowWithSnapshots.__aqCodeLineSnapshots?.push({
        html: code.innerHTML.slice(0, 240),
        lineCount: code.querySelectorAll("[data-line]").length,
        text: code.textContent || "",
      })
    }

    let frameCount = 0
    const captureFrame = () => {
      capture()
      frameCount += 1
      if (frameCount < 24) {
        window.requestAnimationFrame(captureFrame)
      }
    }
    window.requestAnimationFrame(captureFrame)
    const interval = window.setInterval(capture, 16)
    window.setTimeout(() => window.clearInterval(interval), 3000)
  })

  await page.route("**/post/api/v1/posts/104", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 104,
        createdAt: "2026-03-16T00:00:00Z",
        modifiedAt: "2026-03-16T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "코드 하이라이트 회귀 방지",
        content: [
          "```javascript",
          "const count = 1",
          "function run() {",
          "  return \"ok\"",
          "}",
          "```",
        ].join("\n"),
        tags: ["테스트태그"],
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

  await page.route("**/post/api/v1/posts/104/hit", async (route) => {
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

  await page.goto("/posts/104")

  const codeRoot = page.locator(".aq-code-block pre code").first()
  await expect(codeRoot).toBeVisible()
  await expect(page.locator(".aq-code-block pre code .token.keyword").first()).toBeVisible()
  await expect(page.locator(".aq-code-block pre code .token.string").first()).toBeVisible()

  const lineSnapshots = await page.evaluate(() => {
    const windowWithSnapshots = window as typeof window & {
      __aqCodeLineSnapshots?: Array<{ html: string; lineCount: number; text: string }>
    }
    const code = document.querySelector<HTMLElement>(".aq-code-block .aq-pretty-pre code")
    if (code) {
      windowWithSnapshots.__aqCodeLineSnapshots?.push({
        html: code.innerHTML.slice(0, 240),
        lineCount: code.querySelectorAll("[data-line]").length,
        text: code.textContent || "",
      })
    }
    return windowWithSnapshots.__aqCodeLineSnapshots || []
  })
  expect(lineSnapshots.length).toBeGreaterThan(0)
  const codeSnapshots = lineSnapshots.filter((snapshot) => snapshot.text.includes("const count"))
  expect(codeSnapshots.length).toBeGreaterThan(0)
  expect(codeSnapshots.some((snapshot) => snapshot.lineCount === 0)).toBe(false)

  const colors = await page.evaluate(() => {
    const code = document.querySelector<HTMLElement>(".aq-code-block pre code")
    const keyword = document.querySelector<HTMLElement>(".aq-code-block pre code .token.keyword")
    const stringToken = document.querySelector<HTMLElement>(".aq-code-block pre code .token.string")

    return {
      code: code ? window.getComputedStyle(code).color : "",
      keyword: keyword ? window.getComputedStyle(keyword).color : "",
      string: stringToken ? window.getComputedStyle(stringToken).color : "",
    }
  })

  expect(colors.code).toBeTruthy()
  expect(colors.keyword).toBeTruthy()
  expect(colors.string).toBeTruthy()
  expect(colors.keyword).not.toBe(colors.code)
  expect(colors.string).not.toBe(colors.code)
})

  test("상세 코드블럭은 fenced language alias 라벨을 TXT로 떨어뜨리지 않는다", async ({ page }) => {
  const languageCases = [
    ["java", "public Token login(User user) {\n  return new Token(access, refresh);\n}", "Java"],
    ["js", "const value = 1", "JavaScript"],
    ["javascript", "const value = 1", "JavaScript"],
    ["ts", "const value: string = 'ok'", "TypeScript"],
    ["typescript", "const value: string = 'ok'", "TypeScript"],
    ["tsx", "export const View = () => <div />", "TSX"],
    ["jsx", "export const View = () => <div />", "JSX"],
    ["kotlin", "fun login(): Token = token", "Kotlin"],
    ["kt", "val token = Token()", "Kotlin"],
    ["python", "def login():\n    return token", "Python"],
    ["py", "def login():\n    return token", "Python"],
    ["bash", "echo hello", "Bash"],
    ["sh", "echo hello", "Shell"],
    ["shell", "echo hello", "Shell"],
    ["sql", "SELECT * FROM users", "SQL"],
    ["yaml", "name: aquila", "YAML"],
    ["yml", "name: aquila", "YAML"],
    ["json", "{\"ok\": true}", "JSON"],
    ["html", "<main>hello</main>", "HTML"],
    ["xml", "<root>hello</root>", "XML"],
    ["css", ".login { color: red; }", "CSS"],
    ["scss", "$color: red;\n.login { color: $color; }", "SCSS"],
    ["markdown", "# Heading", "Markdown"],
    ["md", "# Heading", "Markdown"],
    ["go", "func main() {}", "Go"],
    ["rust", "fn main() {}", "Rust"],
    ["rs", "fn main() {}", "Rust"],
  ] as const

  await page.route("**/post/api/v1/posts/114", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 114,
        createdAt: "2026-06-15T00:00:00Z",
        modifiedAt: "2026-06-15T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "코드 언어 라벨 회귀 방지",
        content: languageCases
          .map(([language, source]) => ["```" + language, source, "```"].join("\n"))
          .join("\n\n"),
        tags: ["테스트태그"],
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

  await page.route("**/post/api/v1/posts/114/hit", async (route) => {
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

  await page.goto("/posts/114")

  const languageLabels = page.locator(".aq-code-language")
  await expect(languageLabels).toHaveCount(languageCases.length)
  const labels = await languageLabels.allTextContents()
  expect(labels).toEqual(languageCases.map(([, , label]) => label))
  expect(labels).not.toContain("TXT")
})

  test("code-heavy 상세 페이지는 markdown AST prop 누수 없이 hydration 된다", async ({ page }) => {
  const runtimeErrors: string[] = []
  const isHydrationRuntimeSignal = (value: string) =>
    /minified react error|hydration|did not match/i.test(value)

  page.on("pageerror", (error) => {
    runtimeErrors.push(error.message)
  })

  page.on("console", (message) => {
    if (message.type() === "error" && isHydrationRuntimeSignal(message.text())) {
      runtimeErrors.push(message.text())
    }
  })

  await page.route("**/post/api/v1/posts/465", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 465,
        createdAt: "2026-03-24T01:16:04.400Z",
        modifiedAt: "2026-03-24T01:16:04.400Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "code-heavy hydration 회귀 방지",
        content: [
          "요약 문장에 `inline-code`가 있고 표와 머메이드가 함께 나옵니다.",
          "",
          "```text",
          "src/main/resources",
          "├── application.yml",
          "└── static/",
          "```",
          "",
          "> [!INFO] 실시간 기능은 전역 관심사가 빠르게 늘어납니다",
          "> Config, Security, Interceptor 같은 공통 요소를 `global`에 모아둡니다.",
          "",
          "| 항목 | 내용 |",
          "| --- | --- |",
          "| 문제 | HTTP 요청/응답만으로는 채팅 같은 실시간 양방향 통신을 자연스럽게 처리하기 어렵습니다. |",
          "| 핵심 경로 | `/ws-stomp` 로 연결하고 `/pub` 로 발행하며 `/sub` 를 구독합니다. |",
          "",
          "```mermaid",
          "sequenceDiagram",
          "    participant Client as 클라이언트",
          "    participant Endpoint as Endpoint<br/>(/ws-stomp)",
          "    Client->>Endpoint: HTTP Upgrade",
          "```",
        ].join("\n"),
        tags: ["테스트태그"],
        category: [],
        published: true,
        listed: true,
        likesCount: 1,
        commentsCount: 0,
        hitCount: 2,
        actorHasLiked: false,
        actorCanModify: false,
        actorCanDelete: false,
      }),
    })
  })

  await page.route("**/post/api/v1/posts/465/hit", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCode: "200-1",
        msg: "ok",
        data: { hitCount: 3 },
      }),
    })
  })

  await page.goto("/posts/465")
  await expect(page.getByText("code-heavy hydration 회귀 방지")).toBeVisible()
  await expect(page.locator(".aq-markdown code[node], .aq-markdown pre[node]")).toHaveCount(0)
  await page.waitForTimeout(300)
  expect(runtimeErrors).toEqual([])
})

  test("상세 runtime guard 는 hydration 오류에서 build당 1회만 hard reload 한다", async ({ page }) => {
  await page.route("**/post/api/v1/posts/467", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 467,
        createdAt: "2026-04-13T00:00:00Z",
        modifiedAt: "2026-04-13T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "runtime guard reload 회귀 방지",
        content: "stale build hydration guard",
        tags: ["테스트태그"],
        category: [],
        published: true,
        listed: true,
        likesCount: 0,
        commentsCount: 0,
        hitCount: 1,
        actorHasLiked: false,
        actorCanModify: false,
        actorCanDelete: false,
      }),
    })
  })

  await page.route("**/post/api/v1/posts/467/hit", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCode: "200-1",
        msg: "ok",
        data: { hitCount: 2 },
      }),
    })
  })

  await page.goto("/posts/467")
  await expect(page.getByText("runtime guard reload 회귀 방지")).toBeVisible()

  const reloadPromise = page.waitForEvent("framenavigated", {
    predicate: (frame) => frame === page.mainFrame(),
    timeout: 5000,
  })

  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent("error", { message: "Minified React error #418" }))
  })

  await reloadPromise
  await expect(page.getByText("runtime guard reload 회귀 방지")).toBeVisible()
  await expect.poll(async () => {
    return page.evaluate(() => performance.getEntriesByType("navigation")[0]?.type || "")
  }).toBe("reload")
  const recoveredTimeOrigin = await page.evaluate(() => performance.timeOrigin)

  const guardState = await page.evaluate(() => {
    const keys = Object.keys(sessionStorage).filter(
      (entry) =>
        entry.indexOf("__aquila_client_runtime_recovery__") === 0 &&
        entry.indexOf(":reason") === -1
    )

    return {
      keys,
      reasons: keys.map((key) => sessionStorage.getItem(key + ":reason") || ""),
    }
  })

  expect(guardState.keys).toHaveLength(1)
  expect(guardState.keys[0]).toContain("/posts/467")
  expect(guardState.reasons[0]).toContain("hydration:")

  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent("error", { message: "Minified React error #423" }))
  })
  await page.waitForTimeout(500)

  expect(await page.evaluate(() => performance.timeOrigin)).toBe(recoveredTimeOrigin)
})

  test("상세 normal table metadata는 저장 viewport 폭이 아니라 현재 본문 폭을 채운다", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1100 })

  await page.route("**/post/api/v1/posts/466", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 466,
        createdAt: "2026-04-13T00:00:00Z",
        modifiedAt: "2026-04-13T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "table width metadata 회귀 방지",
        content: [
          '<!-- aq-table {"overflowMode":"normal","columnWidths":[220,320]} -->',
          "| 항목 | 내용 |",
          "| --- | --- |",
          "| 문제 | HTTP 요청/응답만으로는 채팅 같은 실시간 양방향 통신을 자연스럽게 처리하기 어렵습니다. |",
          "| 핵심 경로 | `/ws-stomp` 로 연결하고 `/pub` 로 발행하며 `/sub` 를 구독합니다. |",
        ].join("\n"),
        tags: ["테스트태그"],
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

  await page.route("**/post/api/v1/posts/466/hit", async (route) => {
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

  await page.goto("/posts/466")
  await expect(page.getByText("table width metadata 회귀 방지")).toBeVisible()
  await expect(page.locator(".aq-table-scroll")).toBeVisible()

  const metrics = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(".aq-table-scroll")
    const table = document.querySelector<HTMLElement>(".aq-table")
    if (!shell || !table) return null

    const headerCells = Array.from(table.querySelectorAll<HTMLElement>("thead th"))
    return {
      shellWidth: Math.round(shell.getBoundingClientRect().width),
      tableWidth: Math.round(table.getBoundingClientRect().width),
      scrollWidth: shell.scrollWidth,
      clientWidth: shell.clientWidth,
      headerWidths: headerCells.map((cell) => Math.round(cell.getBoundingClientRect().width)),
    }
  })

  expect(metrics).not.toBeNull()
  expect(Math.abs((metrics?.tableWidth || 0) - (metrics?.shellWidth || 0))).toBeLessThanOrEqual(2)
  expect((metrics?.scrollWidth || 0) - (metrics?.clientWidth || 0)).toBeLessThanOrEqual(2)
  expect(metrics?.headerWidths[1] || 0).toBeGreaterThan(metrics?.headerWidths[0] || 0)
})

  test("상세 본문 타이포그래피는 폭 보정형 shared scale을 따른다", async ({ page }) => {
  await mockAvatarAsset(page)
  await page.route("**/post/api/v1/posts/871**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 871,
        createdAt: "2026-04-22T00:00:00Z",
        modifiedAt: "2026-04-22T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "글 제목 크기",
        content: [
          "# 제목 1 크기",
          "",
          "## 제목 2 크기",
          "",
          "### 제목 3 크기",
          "",
          "본문 크기",
          "",
          "```txt",
          "코드 블럭 내 폰트 크기",
          "```",
          "",
          "<aside>",
          "ℹ️",
          "콜아웃 내 폰트 크기",
          "</aside>",
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

  await page.route("**/post/api/v1/posts/871/hit**", async (route) => {
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

  await page.goto("/posts/871")
  await expect(page.getByRole("heading", { name: "글 제목 크기", level: 1 })).toBeVisible()
  await expect(page.locator(".aq-callout").filter({ hasText: "콜아웃 내 폰트 크기" })).toBeVisible()

  const readTypography = async (selector: string) =>
    page.locator(selector).first().evaluate((element) => {
      const style = window.getComputedStyle(element)
      return {
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fontWeight: style.fontWeight,
      }
    })

  await expect(readTypography("h1.title")).resolves.toEqual({
    fontSize: "44px",
    lineHeight: "52px",
    fontWeight: "700",
  })
  await expect(readTypography(".aq-markdown h1")).resolves.toEqual({
    fontSize: "32px",
    lineHeight: "40px",
    fontWeight: "600",
  })
  await expect(readTypography(".aq-markdown h2")).resolves.toEqual({
    fontSize: "26px",
    lineHeight: "36px",
    fontWeight: "600",
  })
  await expect(readTypography(".aq-markdown h3")).resolves.toEqual({
    fontSize: "22px",
    lineHeight: "31px",
    fontWeight: "600",
  })
  await expect(readTypography(".aq-markdown p")).resolves.toEqual({
    fontSize: "17px",
    lineHeight: "28px",
    fontWeight: "400",
  })
  await expect(readTypography(".aq-code code, pre code")).resolves.toEqual({
    fontSize: "15px",
    lineHeight: "23px",
    fontWeight: "400",
  })
  await expect(readTypography(".aq-callout .aq-markdown-text")).resolves.toEqual({
    fontSize: "17px",
    lineHeight: "28px",
    fontWeight: "400",
  })
})
})
