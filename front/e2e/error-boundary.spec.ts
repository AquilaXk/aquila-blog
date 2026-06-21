import { expect, test } from "@playwright/test"
import { existsSync, readFileSync } from "fs"
import path from "path"

const sourcePath = (...parts: string[]) => path.resolve(__dirname, "../src", ...parts)
type ClientErrorReport = {
  boundary: string
  surface: string
  path: string
}

test.describe("error boundary launch gate", () => {
  test("source wiring keeps global, markdown, and editor boundaries in place", () => {
    const appSource = readFileSync(sourcePath("pages", "_app.tsx"), "utf8")
    const postDetailSource = readFileSync(sourcePath("routes", "Detail", "PostDetail", "index.tsx"), "utf8")
    const writerHostSource = readFileSync(sourcePath("routes", "Admin", "WriterEditorHost.tsx"), "utf8")

    expect(existsSync(sourcePath("pages", "500.tsx"))).toBe(true)
    expect(existsSync(sourcePath("components", "error", "ErrorBoundary.tsx"))).toBe(true)
    expect(existsSync(sourcePath("libs", "rum", "reportClientError.ts"))).toBe(true)
    expect(existsSync(sourcePath("pages", "api", "rum", "client-errors.ts"))).toBe(true)

    expect(appSource).toContain("GlobalErrorBoundary")
    expect(postDetailSource).toContain('surface="markdown"')
    expect(postDetailSource).toContain("<RecoverableSurfaceBoundary")
    expect(writerHostSource).toContain('surface="editor"')
    expect(writerHostSource).toContain("<RecoverableSurfaceBoundary")
  })

  test("global render exception shows recoverable 500 UX and sanitized telemetry", async ({ page }) => {
    await page.goto("/_qa/error-boundary?mode=global")

    await expect(page.getByRole("heading", { name: "문제가 발생했습니다" })).toBeVisible()
    await expect(page.getByText(/오류 ID: err_/)).toBeVisible()
    await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible()
    await expect(page.getByRole("link", { name: "홈으로 이동" })).toBeVisible()

    const reports = await page.evaluate(
      () =>
        ((window as Window & { __AQUILA_CLIENT_ERROR_REPORTS__?: ClientErrorReport[] })
          .__AQUILA_CLIENT_ERROR_REPORTS__ || [])
    )
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      boundary: "global",
      surface: "app",
      path: "/_qa/error-boundary",
    })
    expect(JSON.stringify(reports[0])).not.toContain("secret-token")
  })

  test("local surface render exception is contained without replacing the whole app", async ({ page }) => {
    await page.goto("/_qa/error-boundary?mode=local")

    await expect(page.getByTestId("qa-error-boundary-shell")).toBeVisible()
    await expect(page.getByRole("heading", { name: "콘텐츠를 표시하지 못했습니다" })).toBeVisible()
    await expect(page.getByText(/오류 ID: err_/)).toBeVisible()
    await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible()
    await expect(page.getByRole("link", { name: "홈으로 이동" })).toBeVisible()

    const reports = await page.evaluate(
      () =>
        ((window as Window & { __AQUILA_CLIENT_ERROR_REPORTS__?: ClientErrorReport[] })
          .__AQUILA_CLIENT_ERROR_REPORTS__ || [])
    )
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      boundary: "surface",
      surface: "markdown",
      path: "/_qa/error-boundary",
    })
    expect(JSON.stringify(reports[0])).not.toContain("secret-token")
  })

  test("client error telemetry endpoint accepts only sanitized POST payloads", async ({ request }) => {
    const response = await request.post("/api/rum/client-errors", {
      data: {
        id: "err_fixture_123",
        boundary: "global",
        surface: "app",
        path: "/_qa/error-boundary",
        errorName: "Error",
        message: "secret-token must be ignored",
        stack: "secret-token must be ignored",
      },
    })

    expect(response.status()).toBe(204)

    const getResponse = await request.get("/api/rum/client-errors")
    expect(getResponse.status()).toBe(405)
  })
})
