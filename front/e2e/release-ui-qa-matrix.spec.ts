import { expect, test } from "@playwright/test"
import {
  RELEASE_UI_QA_COMMENTS,
  RELEASE_UI_QA_DETAIL_CONTENT,
  RELEASE_UI_QA_FLOW_GROUPS,
  RELEASE_UI_QA_IMAGE_PATHS,
  RELEASE_UI_QA_LONG_URL,
  RELEASE_UI_QA_POST_ID,
  RELEASE_UI_QA_TAGS,
  RELEASE_UI_QA_VIEWPORTS,
  mockReleaseUiQaEndpoints,
} from "./helpers/releaseUiQaFixtures"

const expectedViewportWidths = [320, 360, 390, 768, 1024, 1440]

test.describe("release UI QA matrix", () => {
  test("launch gate fixture covers required viewport, content, and flow contracts", () => {
    expect(RELEASE_UI_QA_VIEWPORTS.map((viewport) => viewport.width)).toEqual(expectedViewportWidths)
    expect(RELEASE_UI_QA_TAGS).toHaveLength(20)
    expect(RELEASE_UI_QA_IMAGE_PATHS).toHaveLength(20)
    expect(RELEASE_UI_QA_COMMENTS).toHaveLength(100)
    expect(RELEASE_UI_QA_FLOW_GROUPS).toEqual([
      "anonymous-public-navigation",
      "author-new-post-autosave-refresh-recover-upload-preview-publish-edit-cache",
      "failure-timeout-401-409-413-429-500-offline-slow3g-upload-disconnect",
    ])
    expect(RELEASE_UI_QA_DETAIL_CONTENT).toContain(RELEASE_UI_QA_LONG_URL)
    expect(RELEASE_UI_QA_DETAIL_CONTENT).toContain("```mermaid")
    expect(RELEASE_UI_QA_DETAIL_CONTENT).toContain("$$")
    expect(RELEASE_UI_QA_DETAIL_CONTENT).toContain("| viewport | flow | expected | owner | note |")
  })

  for (const viewport of RELEASE_UI_QA_VIEWPORTS) {
    test(`${viewport.name} detail fixture stays inside viewport`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await mockReleaseUiQaEndpoints(page)

      await page.goto(`/posts/${RELEASE_UI_QA_POST_ID}`)
      await expect(page.getByRole("heading", { name: /출시 전 실제 기기 UI QA 매트릭스/ })).toBeVisible()
      await expect(page.locator("table").first()).toBeVisible()
      await expect(page.locator(".aq-markdown a", { hasText: RELEASE_UI_QA_LONG_URL }).first()).toBeVisible()

      const snapshot = await page.evaluate(() => {
        const html = document.documentElement
        const body = document.body
        const viewportWidth = window.innerWidth
        const firstTableScroll = document.querySelector<HTMLElement>(".aq-table-scroll")
        const firstImage = document.querySelector<HTMLImageElement>(".aq-markdown img")
        const firstTableScrollRect = firstTableScroll?.getBoundingClientRect()
        const firstImageRect = firstImage?.getBoundingClientRect()

        return {
          viewportWidth,
          htmlScrollWidth: html.scrollWidth,
          bodyScrollWidth: body.scrollWidth,
          firstTableScrollRight: firstTableScrollRect?.right ?? 0,
          firstImageRight: firstImageRect?.right ?? 0,
          imageCount: document.querySelectorAll(".aq-markdown img").length,
        }
      })

      expect(snapshot.htmlScrollWidth).toBeLessThanOrEqual(snapshot.viewportWidth)
      expect(snapshot.bodyScrollWidth).toBeLessThanOrEqual(snapshot.viewportWidth)
      expect(snapshot.firstTableScrollRight).toBeLessThanOrEqual(snapshot.viewportWidth + 0.5)
      expect(snapshot.firstImageRight).toBeLessThanOrEqual(snapshot.viewportWidth + 0.5)
      expect(snapshot.imageCount).toBeGreaterThanOrEqual(1)
    })
  }
})
