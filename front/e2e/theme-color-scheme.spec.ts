import { expect, test } from "@playwright/test"
import { addPublicAboutSnapshotCookie, mockAvatarAsset, mockFeedEndpoints } from "./helpers/smokeFixtures"

test.describe("theme color-scheme", () => {
  test("헤더 테마 토글은 루트와 form control color-scheme을 함께 전환한다", async ({ page }) => {
    await mockAvatarAsset(page)
    await mockFeedEndpoints(page)
    await addPublicAboutSnapshotCookie(page)
    await page.context().addCookies([
      {
        name: "scheme",
        value: "dark",
        url: "http://127.0.0.1:3000",
      },
    ])

    await page.goto("/")
    await expect(page.getByRole("button", { name: "라이트 모드로 전환" })).toBeVisible()

    const initialScheme = await page.evaluate(() => {
      const input = document.createElement("input")
      document.body.append(input)
      const result = {
        body: window.getComputedStyle(document.body).colorScheme,
        html: window.getComputedStyle(document.documentElement).colorScheme,
        input: window.getComputedStyle(input).colorScheme,
      }
      input.remove()
      return result
    })

    expect(initialScheme).toEqual({
      body: "dark",
      html: "dark",
      input: "dark",
    })

    await page.getByRole("button", { name: "라이트 모드로 전환" }).click()
    await expect(page.getByRole("button", { name: "다크 모드로 전환" })).toBeVisible()

    const nextScheme = await page.evaluate(() => {
      const input = document.createElement("input")
      document.body.append(input)
      const result = {
        bootstrapScheme: document.documentElement.getAttribute("data-aquila-scheme-bootstrap"),
        bootstrapStyleCount: document.querySelectorAll('style[data-aquila-scheme-bootstrap-style="true"]').length,
        datasetScheme: document.documentElement.dataset.aquilaScheme,
        body: window.getComputedStyle(document.body).colorScheme,
        html: window.getComputedStyle(document.documentElement).colorScheme,
        inlineHtmlColorScheme: document.documentElement.style.colorScheme,
        input: window.getComputedStyle(input).colorScheme,
      }
      input.remove()
      return result
    })

    expect(nextScheme).toEqual({
      bootstrapScheme: null,
      bootstrapStyleCount: 0,
      datasetScheme: "light",
      body: "light",
      html: "light",
      inlineHtmlColorScheme: "",
      input: "light",
    })
  })
})
