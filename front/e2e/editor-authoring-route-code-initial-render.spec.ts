import { expect, test, type Page } from "./helpers/authoringPlaywright"
import { mockAvatarAsset } from "./helpers/smokeFixtures"
import { POST_507_TITLE } from "./helpers/post507Fixtures"
import { resolveMarkdownRenderModel } from "src/libs/markdown/rendering"

type InitialCodeSnapshot = {
  stage: string
  elapsedMs: number
  codeText: string
  lineCount: number
  shellText: string
}

const javaLoginCode = [
  "public Token login(User user) {",
  "",
  "    String access = createAccessToken(user);   // 짧게",
  "    String refresh = createRefreshToken(user); // 길게",
  "",
  "    saveRefreshToken(user.getId(), refresh);",
  "",
  "    return new Token(access, refresh);",
  "}",
].join("\n")

const mermaidSequenceCode = [
  "sequenceDiagram",
  "    participant Client",
  "    participant Server",
  "    Client->>Server: 로그인",
].join("\n")

const escapeHtmlAttribute = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("\n", "&#10;")

const buildPost507CopiedCodeHtml = () => {
  const rawCodeAttribute = escapeHtmlAttribute(javaLoginCode)
  const emptyLines = javaLoginCode
    .split("\n")
    .map(() => '<span data-line class="line"></span>')
    .join("")

  return [
    "<h2>구현 예시</h2>",
    "<h3>로그인</h3>",
    '<div class="aq-code-block">',
    '<div class="aq-code-toolbar"><span class="aq-code-language">JAVA</span></div>',
    '<div class="aq-code-body"><div class="aq-code-shell">',
    '<pre class="aq-code aq-pretty-pre">',
    `<code class="language-java" data-language="java" data-prism-language="java" data-prism-source="${rawCodeAttribute}" data-raw-code="${rawCodeAttribute}">${emptyLines}</code>`,
    "</pre>",
    "</div></div>",
    "</div>",
  ].join("")
}

const buildPost507WrapperRawCodeHtml = () => {
  const rawCodeAttribute = escapeHtmlAttribute(javaLoginCode)
  const emptyLines = javaLoginCode
    .split("\n")
    .map(() => '<span data-line class="line"></span>')
    .join("")

  return [
    "<h2>구현 예시</h2>",
    "<h3>로그인</h3>",
    `<div class="aq-code-block" data-language="java" data-raw-code="${rawCodeAttribute}">`,
    '<div class="aq-code-toolbar"><span class="aq-code-language">JAVA</span></div>',
    '<div class="aq-code-body"><div class="aq-code-shell">',
    '<pre class="aq-code aq-pretty-pre">',
    `<code class="language-java">${emptyLines}</code>`,
    "</pre>",
    "</div></div>",
    "</div>",
  ].join("")
}

const buildWrapperRawMermaidHtml = () => {
  const rawCodeAttribute = escapeHtmlAttribute(mermaidSequenceCode)
  const emptyLines = mermaidSequenceCode
    .split("\n")
    .map(() => '<span data-line class="line"></span>')
    .join("")

  return [
    `<div class="aq-code-block" data-language="mermaid" data-raw-code="${rawCodeAttribute}">`,
    '<div class="aq-code-body"><div class="aq-code-shell">',
    '<pre class="aq-code aq-pretty-pre">',
    `<code class="language-mermaid">${emptyLines}</code>`,
    "</pre>",
    "</div></div>",
    "</div>",
  ].join("")
}

const extractVisibleHtmlText = (html: string) =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#10;/g, "\n")

const emptyJavaFenceContent = [
  "## **구현 예시 **",
  "",
  "### **로그인**",
  "",
  "```java",
  "```",
].join("\n")

const contentOnlyPost507CodeMarkdown = [
  "## 왜 이 문제가 중요한가",
  "",
  "보통 처음 인증을 구현한다면 이런 식으로 할 것 입니다",
  "",
  "```text",
  "로그인 -> 세션 생성 -> 이후 요청에서 세션 확인",
  "```",
  "",
  "### JWT 내부 예시",
  "",
  "```java",
  "{",
  "  \"sub\": \"user-id\",",
  "  \"iat\": 1710000000",
  "}",
  "```",
  "",
  "### 구현 예시",
  "",
  "```java",
  "public Token login(User user) {",
  "    String access = createAccessToken(user);",
  "    return new Token(access, refresh);",
  "}",
  "```",
].join("\n")

const installInitialCodeSnapshotProbe = async (page: Page) => {
  await page.addInitScript(() => {
    const windowWithSnapshots = window as typeof window & {
      __aqInitialCodeSnapshots?: InitialCodeSnapshot[]
    }
    const startedAt = performance.now()
    windowWithSnapshots.__aqInitialCodeSnapshots = []

    const capture = (stage: string) => {
      const shell = document.querySelector<HTMLElement>(".aq-code-shell")
      if (!shell) return

      const detailCode = shell.querySelector<HTMLElement>("pre > code")
      const editorHighlight = shell.querySelector<HTMLElement>(".aq-code-highlight-layer")
      const editorContent = shell.querySelector<HTMLElement>(".aq-code-editor-content")
      const codeText = detailCode?.textContent || editorHighlight?.textContent || editorContent?.textContent || ""
      const lineCount =
        detailCode?.querySelectorAll("[data-line]").length ||
        editorHighlight?.querySelectorAll("[data-line]").length ||
        shell.querySelectorAll("[data-line]").length

      windowWithSnapshots.__aqInitialCodeSnapshots?.push({
        stage,
        elapsedMs: Math.round(performance.now() - startedAt),
        shellText: shell.textContent || "",
        codeText,
        lineCount,
      })
    }

    let frameCount = 0
    const captureFrame = () => {
      capture(`raf:${frameCount}`)
      frameCount += 1
      if (frameCount < 30) window.requestAnimationFrame(captureFrame)
    }
    window.requestAnimationFrame(captureFrame)

    const interval = window.setInterval(() => capture("interval"), 8)
    const observer = new MutationObserver(() => capture("mutation"))
    const startObserver = () => {
      const root = document.documentElement || document.body
      if (!root) return
      observer.observe(root, { childList: true, subtree: true })
    }
    if (document.documentElement || document.body) {
      startObserver()
    } else {
      document.addEventListener("DOMContentLoaded", startObserver, { once: true })
    }
    window.setTimeout(() => {
      observer.disconnect()
      window.clearInterval(interval)
    }, 3_000)
  })
}

test.beforeEach(async ({ page }) => {
  await mockAvatarAsset(page)
})

test.describe("editor authoring route code initial render", () => {
  test("contentHtml-only 렌더 모델은 data-raw-code만 있는 507 코드블럭도 visible text로 채운다", () => {
    const renderModel = resolveMarkdownRenderModel({
      content: "",
      contentHtml: buildPost507CopiedCodeHtml(),
    })
    const visibleText = extractVisibleHtmlText(renderModel.resolvedContentHtml)

    expect(visibleText).toContain("public Token login(User user)")
    expect(visibleText).toContain("createAccessToken(user)")
    expect(visibleText).toContain("return new Token(access, refresh);")
  })

  test("contentHtml-only 렌더 모델은 wrapper data-raw-code도 visible text로 채운다", () => {
    const renderModel = resolveMarkdownRenderModel({
      content: "",
      contentHtml: buildPost507WrapperRawCodeHtml(),
    })
    const visibleText = extractVisibleHtmlText(renderModel.resolvedContentHtml)

    expect(visibleText).toContain("public Token login(User user)")
    expect(visibleText).toContain("createAccessToken(user)")
    expect(visibleText).toContain("return new Token(access, refresh);")
  })

  test("contentHtml-only 렌더 모델은 wrapper data-raw-code mermaid를 초기 mermaid block으로 채운다", () => {
    const renderModel = resolveMarkdownRenderModel({
      content: "",
      contentHtml: buildWrapperRawMermaidHtml(),
    })
    const visibleText = extractVisibleHtmlText(renderModel.resolvedContentHtml)

    expect(renderModel.resolvedContentHtml).toContain('data-aq-mermaid="true"')
    expect(visibleText).toContain("sequenceDiagram")
    expect(visibleText).toContain("Client->>Server: 로그인")
  })

  test("browser contentHtml 코드블럭은 escaped numeric entity literal을 tag text로 재해석하지 않는다", async ({
    page,
  }) => {
    const escapedNumericLiteralHtml =
      '<pre class="aq-code aq-pretty-pre"><code class="language-text">&amp;#60;not-tag&amp;#62;</code></pre>'

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 1,
          username: "qa-admin",
          nickname: "aquila",
          isAdmin: true,
        }),
      })
    })
    await page.route("**/post/api/v1/adm/posts/585", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: 585,
          version: 1,
          title: POST_507_TITLE,
          content: "",
          contentHtml: escapedNumericLiteralHtml,
          published: true,
          listed: true,
        }),
      })
    })
    await page.route("**/post/api/v1/posts/585", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          content: "",
          contentHtml: escapedNumericLiteralHtml,
        }),
      })
    })

    await page.goto("/editor/585")
    await expect(page.locator(".aq-code-shell").first()).toContainText("&#60;not-tag&#62;")
    await expect(page.locator(".aq-code-shell").first()).not.toContainText("<not-tag>")
  })

  test("507 contentHtml 코드블럭은 첫 DOM snapshot부터 raw code text를 표시한다", async ({
    page,
  }) => {
    await installInitialCodeSnapshotProbe(page)

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 1,
          username: "qa-admin",
          nickname: "aquila",
          isAdmin: true,
        }),
      })
    })
    await page.route("**/post/api/v1/adm/posts/584", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: 584,
          version: 1,
          title: POST_507_TITLE,
          content: emptyJavaFenceContent,
          contentHtml: buildPost507CopiedCodeHtml(),
          published: true,
          listed: true,
        }),
      })
    })
    await page.route("**/post/api/v1/posts/584", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          content: emptyJavaFenceContent,
          contentHtml: buildPost507CopiedCodeHtml(),
        }),
      })
    })

    await page.goto("/editor/584")
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue(POST_507_TITLE)
    await expect(page.locator(".aq-code-shell").first()).toBeVisible()

    const snapshots = await page.evaluate(() => {
      const windowWithSnapshots = window as typeof window & {
        __aqInitialCodeSnapshots?: InitialCodeSnapshot[]
      }
      return windowWithSnapshots.__aqInitialCodeSnapshots || []
    })
    const firstCodeSnapshot = snapshots.find((snapshot) => snapshot.lineCount > 0)

    expect(firstCodeSnapshot, JSON.stringify(snapshots.slice(0, 8), null, 2)).toBeTruthy()
    expect(firstCodeSnapshot?.codeText).toContain("createAccessToken(user)")
    expect(firstCodeSnapshot?.shellText).toContain("return new Token(access, refresh);")
  })

  test("507 content-only markdown 코드블럭은 login redirect 이후 code shell text를 유지한다", async ({
    page,
  }) => {
    await installInitialCodeSnapshotProbe(page)

    await page.route("**/member/api/v1/auth/login", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          resultCode: "200",
          msg: "OK",
          data: {},
        }),
      })
    })
    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 1,
          username: "qa-admin",
          nickname: "aquila",
          isAdmin: true,
        }),
      })
    })
    await page.route("**/_next/data/**/editor/583.json**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          pageProps: {
            dehydratedState: { mutations: [], queries: [] },
            initialMember: {
              id: 1,
              username: "qa-admin",
              nickname: "aquila",
              isAdmin: true,
            },
            initialProfileSnapshot: null,
            initialEditorPost: {
              id: 583,
              version: 1,
              title: POST_507_TITLE,
              content: contentOnlyPost507CodeMarkdown,
              contentHtml: "",
              published: true,
              listed: true,
            },
          },
          __N_SSP: true,
        }),
      })
    })
    await page.route("**/post/api/v1/adm/posts/583", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 900))
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: 583,
          version: 1,
          title: POST_507_TITLE,
          content: contentOnlyPost507CodeMarkdown,
          contentHtml: "",
          published: true,
          listed: true,
        }),
      })
    })
    await page.route("**/post/api/v1/posts/583", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          content: contentOnlyPost507CodeMarkdown,
          contentHtml: "",
        }),
      })
    })

    const editorDocumentRequests: string[] = []
    page.on("request", (request) => {
      if (request.resourceType() !== "document") return
      if (!new URL(request.url()).pathname.endsWith("/editor/583")) return
      editorDocumentRequests.push(request.url())
    })

    await page.goto("/login?next=%2Feditor%2F583")
    await page.locator("#email").fill("qa-admin@example.test")
    await page.locator("#password").fill("local-password")
    await page.getByRole("button", { name: /^로그인$/ }).click()
    await page.waitForURL("**/editor/583")
    await expect.poll(() => editorDocumentRequests.length).toBeGreaterThan(0)
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue(POST_507_TITLE)
    const codeShells = page.locator(".aq-code-shell")
    await expect(codeShells.first()).toBeVisible()
    await expect(codeShells.first()).toContainText("로그인 -> 세션 생성 -> 이후 요청에서 세션 확인")
    await expect(codeShells.nth(1)).toContainText('"sub": "user-id"')
    await expect(codeShells.nth(2)).toContainText("createAccessToken(user)")

    const snapshots = await page.evaluate(() => {
      const windowWithSnapshots = window as typeof window & {
        __aqInitialCodeSnapshots?: InitialCodeSnapshot[]
      }
      return windowWithSnapshots.__aqInitialCodeSnapshots || []
    })
    const firstCodeSnapshot = snapshots.find((snapshot) => snapshot.lineCount > 0)

    expect(firstCodeSnapshot, JSON.stringify(snapshots.slice(0, 8), null, 2)).toBeTruthy()
    expect(firstCodeSnapshot?.codeText).toContain("로그인 -> 세션 생성")
  })
})
