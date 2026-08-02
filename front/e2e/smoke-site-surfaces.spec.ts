import { expect, test, type Locator, type Page } from "@playwright/test"

/**
 * 회사·제품 표면 스모크. 두 라우트는 블로그와 같은 이미지에서 나가지만 전용 호스트의 루트로
 * 서빙되므로, 블로그 헤더와 본문 폭 컨테이너를 쓰지 않고 자기 헤더·풀블리드 섹션을 가져야 한다.
 *
 * 스크린샷은 1080x2340 원본 비율이 유지돼야 한다 - 폰 목업 프레임이 화면을 잘라 내면 검수본을
 * 쓰는 의미가 사라진다.
 */
const SCREENSHOT_ASPECT_RATIO = 1080 / 2340
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "narrow", width: 600, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const

const measureLayoutOverflow = async (page: Page) =>
  await page.evaluate(() => {
    const layoutWidth = Math.min(document.documentElement.clientWidth, document.body.clientWidth)
    return {
      layoutWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    }
  })

const expectNoHorizontalOverflow = async (page: Page) => {
  const { layoutWidth, scrollWidth } = await measureLayoutOverflow(page)
  expect(scrollWidth).toBeLessThanOrEqual(layoutWidth + 1)
}

/**
 * 레이아웃 크기로 비율을 본다. `getBoundingClientRect`는 transform이 걸린 요소에서 축 정렬
 * 바운딩 박스를 돌려주므로, 기울인 폰 목업에서는 원본 비율과 다른 값이 나온다.
 */
const measureRenderedAspectRatio = async (image: Locator) =>
  await image.evaluate((element) => {
    const measured = element as HTMLImageElement
    return measured.offsetWidth / measured.offsetHeight
  })

/**
 * 요소가 뷰포트 가로 범위 안에 실제로 남아 있는지 본다.
 *
 * `toBeVisible`로는 부족하다 - 그 단언은 박스가 비어 있지 않고 visibility가 살아 있는지만 보므로,
 * 상위 래퍼가 가로 overflow를 clip해 화면 밖으로 밀려난 요소도 그대로 통과한다. 헤더가 잘리는
 * 회귀는 정확히 그 형태이고, 가로 스크롤도 생기지 않아 overflow 단언에도 걸리지 않는다.
 */
const expectWithinViewport = async (page: Page, target: Locator, label: string) => {
  await expect(target).toBeVisible()
  const box = await target.boundingBox()
  expect(box, label).not.toBeNull()
  const viewport = page.viewportSize()
  const viewportWidth = viewport?.width ?? 0
  expect(box?.x ?? -1, label).toBeGreaterThanOrEqual(0)
  expect((box?.x ?? 0) + (box?.width ?? 0), label).toBeLessThanOrEqual(viewportWidth + 1)
}

const expectTouchTargets = async (page: Page, selector: string) => {
  const boxes = await page.locator(selector).all()
  expect(boxes.length).toBeGreaterThan(0)
  for (const target of boxes) {
    const box = await target.boundingBox()
    expect(box).not.toBeNull()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
}

test.describe("공개 표면 스모크: 회사 소개", () => {
  test("헤더·hero·역량·제품·문의 섹션이 렌더되고 canonical이 요청 호스트를 따른다", async ({ page, baseURL }) => {
    const response = await page.goto("/company")
    expect(response?.status()).toBe(200)

    await expect(page.getByRole("heading", { level: 1 })).toContainText("소프트웨어를 만듭니다")
    await expect(page.locator("#capabilities")).toBeVisible()
    await expect(page.locator("#product")).toBeVisible()
    await expect(page.getByRole("heading", { name: "함께 만들 이야기가 있다면" })).toBeVisible()
    await expect(page.getByRole("link", { name: "aquila@aquilaxk.site" })).toHaveAttribute(
      "href",
      "mailto:aquila@aquilaxk.site"
    )

    // 블로그 헤더(검색·로그인 shell)는 이 표면에 나오지 않는다.
    await expect(page.locator("[data-ui='app-header']")).toHaveCount(0)

    const canonical = page.locator("link[rel='canonical']")
    await expect(canonical).toHaveAttribute("href", `${baseURL}/company`)
    await expect(page.locator("meta[property='og:site_name']")).toHaveAttribute(
      "content",
      "Aquila Software"
    )
    await expect(page).toHaveTitle(/Aquila Software/)
    // 블로그 브랜드가 회사 표면 탭 제목에 강제로 붙지 않아야 한다.
    await expect(page).not.toHaveTitle(/AquilaLog/)
  })

  test("백엔드가 응답하지 않으면 소식 섹션은 자리를 채우지 않고 사라진다", async ({ page }) => {
    // e2e 웹서버는 도달 불가한 BACKEND_INTERNAL_URL로 뜬다. placeholder 카드를 만들지 않는 계약이다.
    await page.goto("/company")
    await expect(page.locator("#news")).toHaveCount(0)
    // 섹션이 사라졌는데 내비 항목이 남으면 '소식'은 아무 일도 하지 않는 죽은 anchor가 된다.
    const nav = page.getByRole("navigation", { name: "회사 소개 둘러보기" })
    await expect(nav.getByRole("link", { name: "소식" })).toHaveCount(0)
    // 나머지 항목은 그대로 있어야 한다 - 조건이 넓게 걸려 내비가 통째로 비면 그것도 회귀다.
    await expect(nav.getByRole("link", { name: "역량" })).toBeVisible()
    await expect(nav.getByRole("link", { name: "제품" })).toBeVisible()
  })

  for (const viewport of VIEWPORTS) {
    test(`${viewport.name} ${viewport.width}x${viewport.height}에서 가로 넘침이 없다`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto("/company")
      await expectNoHorizontalOverflow(page)
    })
  }

  test("헤더 내비와 CTA는 44px 터치 타겟을 유지한다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/company")
    await expectTouchTargets(page, "header a")
  })

  test("hero 스크린샷은 원본 비율로 잘림 없이 표시된다", async ({ page }) => {
    await page.goto("/company")
    const hero = page.locator("main figure img").first()
    await expect(hero).toBeVisible()
    expect(await measureRenderedAspectRatio(hero)).toBeCloseTo(SCREENSHOT_ASPECT_RATIO, 2)
  })
})

test.describe("공개 표면 스모크: EasySubway 제품", () => {
  test("hero·개요·기능·제공 범위·문의 섹션이 렌더되고 canonical이 요청 호스트를 따른다", async ({
    page,
    baseURL,
  }) => {
    const response = await page.goto("/easysubway")
    expect(response?.status()).toBe(200)

    await expect(page.getByRole("heading", { level: 1 })).toContainText("먼저 보여주는 지하철")
    await expect(page.locator("#overview")).toBeVisible()
    await expect(page.locator("#features")).toBeVisible()
    await expect(page.locator("#scope")).toBeVisible()
    // 출시 상태는 과장 없이 준비 중으로만 표기한다.
    await expect(page.getByText("Android 출시 준비 중").first()).toBeVisible()
    await expect(page.locator("[data-ui='app-header']")).toHaveCount(0)

    const canonical = page.locator("link[rel='canonical']")
    await expect(canonical).toHaveAttribute("href", `${baseURL}/easysubway`)
    await expect(page.locator("meta[property='og:site_name']")).toHaveAttribute("content", "EasySubway")
  })

  test("390px 헤더의 내비 링크와 문의 CTA가 뷰포트 안에 남는다", async ({ page }) => {
    // 헤더가 단일 flex row로 고정돼 있으면 이 폭에서 우측 링크와 문의 CTA가 clip돼 닿을 수 없다.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/easysubway")

    const nav = page.getByRole("navigation", { name: "제품 소개 둘러보기" })
    await expectWithinViewport(page, nav.getByRole("link", { name: "문의" }), "문의 CTA")
    for (const label of ["기능", "제공 범위", "회사 소개"]) {
      await expectWithinViewport(page, nav.getByRole("link", { name: label }), label)
    }
    await expectTouchTargets(page, "header a")
  })

  test("파일럿 범위는 검증한 역만 사실대로 노출한다", async ({ page }) => {
    await page.goto("/easysubway")
    await expect(page.locator("#scope")).toContainText("상록수")
    await expect(page.locator("#scope")).toContainText("사당")
  })

  for (const viewport of VIEWPORTS) {
    test(`${viewport.name} ${viewport.width}x${viewport.height}에서 가로 넘침이 없다`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto("/easysubway")
      await expectNoHorizontalOverflow(page)
    })
  }

  test("hero 폰 목업은 원본 비율을 유지하고 확대 컷만 잘린 컷으로 밝힌다", async ({ page }) => {
    await page.goto("/easysubway")
    // 전면 노출은 hero 한 번이며 1080x2340 원본 비율이어야 한다.
    const heroPhone = page.locator("main figure img").first()
    await expect(heroPhone).toBeVisible()
    expect(await measureRenderedAspectRatio(heroPhone)).toBeCloseTo(SCREENSHOT_ASPECT_RATIO, 2)
    // 기능 블록의 확대 컷은 잘린 컷이므로 캡션이 그 사실을 밝혀야 한다.
    await expect(page.locator("#features figcaption")).toContainText("화면 일부")
  })

  test("공개 페이지 자산에 개발용 광고 자리표시가 섞이지 않는다", async ({ page }) => {
    // 광고 슬롯이 없는 저장소다. 랜딩 자산 중 개발용 광고 자리표시가 찍힌 컷은 쓰지 않는다.
    await page.goto("/easysubway")
    const sources = await page.locator("img").evaluateAll((images) =>
      images.map((image) => image.getAttribute("src") || "")
    )
    expect(sources.length).toBeGreaterThan(0)
    for (const source of sources) {
      expect(source).not.toContain("route-map")
    }
  })
})

test.describe("공개 표면 sitemap 경계", () => {
  test("전용 표면 호스트로 온 sitemap 요청은 404다", async ({ request }) => {
    // 회사·제품 호스트에서 200이면 한 사이트가 다른 호스트의 URL 목록을 자기 sitemap으로 광고한다.
    for (const host of ["www.aquilaxk.site", "easysubway.aquilaxk.site"]) {
      const response = await request.get("/sitemap.xml", { headers: { host } })
      expect(response.status(), host).toBe(404)
    }
  })
})
