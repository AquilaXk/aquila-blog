import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test, type Page } from "./helpers/authoringPlaywright"

const adminMember = {
  id: 1,
  username: "qa-admin",
  nickname: "aquila",
  isAdmin: true,
}

const pushEditorRoute = async (page: Page, postId: number) => {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await expect
    .poll(async () => {
      try {
        return await page.evaluate(() => {
          const router = (
            window as typeof window & {
              next?: { router?: { push?: (url: string) => Promise<boolean>; isReady?: boolean } }
            }
          ).next?.router
          return Boolean(router?.push && router.isReady !== false)
        })
      } catch {
        return false
      }
    })
    .toBe(true)
  await page.evaluate((nextPostId) => {
    const router = (window as typeof window & { next?: { router?: { push?: (url: string) => Promise<boolean> } } })
      .next?.router
    if (!router?.push) throw new Error("Next router is missing")
    window.setTimeout(() => {
      void router.push(`/editor/${nextPostId}`)
    }, 0)
  }, postId)
}

test.describe("editor authoring SSR initial post contract", () => {
  test("전용 글 수정 라우트는 SSR 초기 글 스냅샷으로 client auth fetch 실패와 분리한다", () => {
    const editorPageSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/EditorStudioPage.tsx"),
      "utf8"
    )
    const editorRootSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/EditorStudioWorkspaceControllerRoot.tsx"),
      "utf8"
    )
    const routingSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/useEditorStudioRouting.ts"),
      "utf8"
    )
    const draftLifecycleSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/useEditorStudioDraftLifecycle.ts"),
      "utf8"
    )

    expect(editorPageSource).toContain("initialEditorPost")
    expect(editorPageSource).toContain("serverApiFetch(req, `/post/api/v1/adm/posts/${postId}`")
    expect(editorRootSource).toContain("initialEditorPost = null")
    expect(routingSource).toContain("void loadPostForEditor(queryPostId, { initialPost })")
    expect(draftLifecycleSource).toContain("options.initialPost")
    expect(draftLifecycleSource).toContain("initialPost ??")
    expect(draftLifecycleSource).toContain("const freshPost = await")
    expect(draftLifecycleSource).toContain("post = freshPost")
  })

  test("SSR initialEditorPost가 있으면 client admin post 401에도 에디터 본문을 유지한다", async ({
    page,
  }) => {
    const initialContent = [
      "---",
      'tags: ["SSR", "Hydrate"]',
      "---",
      "",
      "## SSR 초기 본문",
      "",
      "| 영역 | 점검 항목 |",
      "| --- | --- |",
      "| hydrate | initialEditorPost 유지 |",
      "",
      "client admin fetch가 실패해도 이 문단이 남아야 합니다.",
    ].join("\n")
    let clientPostFetchCount = 0

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/997", async (route) => {
      clientPostFetchCount += 1
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "로그인이 필요합니다." }),
      })
    })
    await page.route("**/_next/data/**/editor/997.json**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          pageProps: {
            dehydratedState: {
              mutations: [],
              queries: [],
            },
            initialMember: adminMember,
            initialEditorPost: {
              id: 997,
              version: 3,
              title: "SSR 초기 hydrate 글",
              content: initialContent,
              contentHtml: null,
              published: true,
              listed: true,
            },
          },
          __N_SSP: true,
        }),
      })
    })

    await pushEditorRoute(page, 997)

    await expect(page).toHaveURL(/\/editor\/997/)
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue("SSR 초기 hydrate 글")
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expect(editor).toContainText("SSR 초기 본문")
    await expect(editor.locator("td", { hasText: "initialEditorPost 유지" }).first()).toBeVisible()
    expect(clientPostFetchCount).toBe(1)
  })

  test("SSR initialEditorPost의 빈 코드블럭은 client admin content로 복구한다", async ({
    page,
  }) => {
    const staleContent = ["## JWT 내부 예시", "", "```", "```"].join("\n")
    const freshContent = [
      "## JWT 내부 예시",
      "",
      "```",
      "{",
      "  \"userId\": 123,",
      "  \"role\": \"USER\"",
      "}",
      "```",
    ].join("\n")
    let clientPostFetchCount = 0

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/996", async (route) => {
      clientPostFetchCount += 1
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 996,
          version: 4,
          title: "SSR stale code hydrate 글",
          content: freshContent,
          contentHtml: null,
          published: true,
          listed: true,
        }),
      })
    })
    await page.route("**/_next/data/**/editor/996.json**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          pageProps: {
            dehydratedState: {
              mutations: [],
              queries: [],
            },
            initialMember: adminMember,
            initialEditorPost: {
              id: 996,
              version: 3,
              title: "SSR stale code hydrate 글",
              content: staleContent,
              contentHtml: null,
              published: true,
              listed: true,
            },
          },
          __N_SSP: true,
        }),
      })
    })

    await pushEditorRoute(page, 996)

    await expect(page).toHaveURL(/\/editor\/996/)
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue("SSR stale code hydrate 글")
    const codeBlock = page.locator("[data-code-block-wrapper='true']").filter({ hasText: "\"userId\": 123" })
    await expect(codeBlock).toHaveCount(1)
    await expect(codeBlock.locator(".aq-code-highlight-layer")).toContainText("\"role\": \"USER\"")
    expect(clientPostFetchCount).toBe(1)
  })
})
