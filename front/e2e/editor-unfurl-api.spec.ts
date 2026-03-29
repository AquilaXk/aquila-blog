import { expect, test } from "@playwright/test"

test.describe("editor unfurl api safety", () => {
  test("QA fixture URL은 안전하게 unfurl 메타데이터를 반환한다", async ({ request }) => {
    const response = await request.get("/api/editor/unfurl", {
      params: {
        url: "https://github.com/aquilaxk/aquila-blog",
      },
    })

    expect(response.ok()).toBeTruthy()
    const payload = await response.json()
    expect(payload).toMatchObject({
      ok: true,
      data: expect.objectContaining({
        url: "https://github.com/aquilaxk/aquila-blog",
        title: "aquila-blog",
        provider: "GitHub",
      }),
    })
  })

  test("localhost/private 대상을 unfurl하지 않는다", async ({ request }) => {
    const response = await request.get("/api/editor/unfurl", {
      params: {
        url: "http://127.0.0.1:8080/private",
      },
    })

    expect(response.status()).toBe(400)
    const payload = await response.json()
    expect(payload).toEqual({
      ok: false,
      message: "허용된 외부 링크만 unfurl할 수 있습니다.",
    })
  })

  test("허용되지 않은 외부 호스트는 서버 fetch 전에 차단한다", async ({ request }) => {
    const response = await request.get("/api/editor/unfurl", {
      params: {
        url: "https://example.com/forbidden",
      },
    })

    expect(response.status()).toBe(400)
    const payload = await response.json()
    expect(payload).toEqual({
      ok: false,
      message: "허용된 외부 링크만 unfurl할 수 있습니다.",
    })
  })
})
