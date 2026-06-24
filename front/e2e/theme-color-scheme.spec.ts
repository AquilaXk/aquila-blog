import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"
import { addPublicAboutSnapshotCookie, mockAvatarAsset, mockFeedEndpoints } from "./helpers/smokeFixtures"

const prepareHomeThemePage = async (page: Page) => {
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
}

const readControlScheme = async (page: Page) =>
  page.evaluate(() => {
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

const readLightFeedSurface = async (page: Page) =>
  page.evaluate(() => {
    const card = document.querySelector('[data-ui="feed-post-card"] article')
    const category = card?.querySelector(".category")
    const tag = card?.querySelector(".tag")
    const title = card?.querySelector("h2")
    const meta = card?.querySelector(".meta")
    const cardStyle = card ? window.getComputedStyle(card) : null
    const categoryStyle = category ? window.getComputedStyle(category) : null
    const tagStyle = tag ? window.getComputedStyle(tag) : null
    const titleStyle = title ? window.getComputedStyle(title) : null
    const metaStyle = meta ? window.getComputedStyle(meta) : null

    return {
      cardBackgroundColor: cardStyle?.backgroundColor ?? null,
      categoryColor: categoryStyle?.color ?? tagStyle?.color ?? null,
      titleColor: titleStyle?.color ?? null,
      metaColor: metaStyle?.color ?? null,
    }
  })

const expectLightFeedSurface = async (page: Page) => {
  await expect(page.locator('[data-ui="feed-post-card"] article').first()).toBeVisible()
  await expect(page.locator('[data-ui="feed-post-card"] .meta').first()).toBeVisible()
  await expect.poll(() => readLightFeedSurface(page)).toEqual({
    cardBackgroundColor: "rgba(0, 0, 0, 0)",
    categoryColor: "rgb(86, 98, 115)",
    titleColor: "rgb(15, 23, 36)",
    metaColor: "rgb(86, 98, 115)",
  })
}

const installSchemeFrameSampler = async (page: Page) => {
  await page.addInitScript(() => {
    type SchemeFrameSample = {
      bodyBackground: string
      datasetScheme?: string
      time: number
    }

    type SchemeFrameWindow = Window & {
      __aquilaSchemeFrameSamples?: SchemeFrameSample[]
    }

    const sampleWindow = window as SchemeFrameWindow
    sampleWindow.__aquilaSchemeFrameSamples = []
    const startedAt = performance.now()

    const sampleSchemeFrame = () => {
      const datasetScheme = document.documentElement.dataset.aquilaScheme
      if (datasetScheme) {
        const colorTarget = document.body ?? document.documentElement
        sampleWindow.__aquilaSchemeFrameSamples?.push({
          bodyBackground: window.getComputedStyle(colorTarget).backgroundColor,
          datasetScheme,
          time: Math.round(performance.now() - startedAt),
        })
      }

      if (performance.now() - startedAt < 3000) {
        requestAnimationFrame(sampleSchemeFrame)
      }
    }

    requestAnimationFrame(sampleSchemeFrame)
  })
}

const readSchemeFrameSamples = async (page: Page) =>
  page.evaluate(() => {
    type SchemeFrameSample = {
      bodyBackground: string
      datasetScheme?: string
      time: number
    }

    type SchemeFrameWindow = Window & {
      __aquilaSchemeFrameSamples?: SchemeFrameSample[]
    }

    return (window as SchemeFrameWindow).__aquilaSchemeFrameSamples ?? []
  })

const assertHomeThemeToggleUsesLightFeedSurface = async (page: Page) => {
  await page.goto("/")
  await expect(page.getByRole("button", { name: "라이트 모드로 전환" })).toBeVisible()

  await expect(readControlScheme(page)).resolves.toEqual({
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
    inlineHtmlColorScheme: "light",
    input: "light",
  })

  await expectLightFeedSurface(page)
}

test.describe("theme color-scheme", () => {
  test("저장된 dark 테마 새로고침은 hydration 중 light frame으로 되돌아가지 않는다", async ({ page }) => {
    await prepareHomeThemePage(page)
    await installSchemeFrameSampler(page)

    await page.goto("/")
    await expect(page.getByRole("button", { name: "라이트 모드로 전환" })).toBeVisible()

    const samples = await readSchemeFrameSamples(page)
    const sampledSchemes = new Set(samples.map((sample) => sample.datasetScheme))

    expect(samples.length).toBeGreaterThan(0)
    expect(sampledSchemes).toEqual(new Set(["dark"]))
    await expect(page.locator("html")).toHaveAttribute("data-aquila-scheme", "dark")
  })

  test("헤더 테마 토글은 루트, form control, 메인 feed surface를 함께 전환한다", async ({ page }) => {
    await prepareHomeThemePage(page)
    await assertHomeThemeToggleUsesLightFeedSurface(page)
  })

  test("모바일 헤더 테마 토글도 메인 feed surface를 함께 전환한다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await prepareHomeThemePage(page)
    await assertHomeThemeToggleUsesLightFeedSurface(page)
  })
})
