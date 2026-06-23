import { expect, test } from "@playwright/test"
import {
  MOBILE_VIEWPORT,
  addPublicAboutSnapshotCookie,
  captureLayoutSnapshot,
  mockAnonymousSession,
  mockAvatarAsset,
  mockDetailEndpoint,
  mockFeedEndpoints,
} from "./helpers/mobileLayoutFixtures"

test.use({
  viewport: MOBILE_VIEWPORT,
  isMobile: true,
  hasTouch: true,
})

test.beforeEach(async ({ page }) => {
  await mockAvatarAsset(page)
  await mockAnonymousSession(page)
})

test.describe("mobile layout public", () => {
  test("iPhone 15 Pro 메인 피드는 카드 overflow 없이 viewport 내부에 렌더된다", async ({ page }) => {
  await mockFeedEndpoints(page)

  await page.goto("/")
  await expect(page.getByLabel("Search posts by keyword")).toBeVisible()
  await expect(page.getByRole("link", { name: "Notes" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Topics" })).toBeVisible()
  await expect(page.getByRole("link", { name: "About" })).toBeVisible()
  await expect(page.getByRole("button", { name: "전체보기" })).toBeVisible()
  await expect(page.locator("a[href^='/posts/'] h2").first()).toBeVisible()
  const moreTagButton = page.getByRole("button", { name: /더보기/ })
  await expect(moreTagButton).toBeVisible()

  const moreTagRect = await moreTagButton.evaluate((button) => {
    const rect = button.getBoundingClientRect()
    return { left: rect.left, right: rect.right, width: rect.width }
  })
  expect(moreTagRect.left).toBeGreaterThanOrEqual(0)
  expect(moreTagRect.right).toBeLessThanOrEqual(MOBILE_VIEWPORT.width + 0.5)

  const firstSnapshot = await captureLayoutSnapshot(page)
  expect(firstSnapshot.htmlScrollWidth).toBeLessThanOrEqual(firstSnapshot.viewportWidth)
  expect(firstSnapshot.bodyScrollWidth).toBeLessThanOrEqual(firstSnapshot.viewportWidth)
  expect(firstSnapshot.maxCardRight).toBeLessThanOrEqual(firstSnapshot.viewportWidth + 0.5)
  expect(firstSnapshot.minCardLeft).toBeGreaterThanOrEqual(-0.5)

  await page.reload()
  await expect(page.getByRole("button", { name: "전체보기" })).toBeVisible()
  await expect(page.locator("a[href^='/posts/'] h2").first()).toBeVisible()

  const secondSnapshot = await captureLayoutSnapshot(page)
  expect(secondSnapshot.htmlScrollWidth).toBeLessThanOrEqual(secondSnapshot.viewportWidth)
  expect(secondSnapshot.bodyScrollWidth).toBeLessThanOrEqual(secondSnapshot.viewportWidth)
  expect(Math.abs(firstSnapshot.firstCardWidth - secondSnapshot.firstCardWidth)).toBeLessThanOrEqual(1.5)
})

  test("iPhone 15 Pro about 페이지는 소개/cta/프로젝트/이력/링크 순서와 compact avatar 계약을 유지한다", async ({ page }) => {
  await addPublicAboutSnapshotCookie(page)
  await page.goto("/about")
  await expect(page.locator('[data-ui="about-eyebrow"]')).toHaveText("Profile")

  const snapshot = await page.evaluate(() => {
    const readRect = (selector: string) => {
      const element = document.querySelector(selector) as HTMLElement | null
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return {
        top: rect.top,
        width: rect.width,
        right: rect.right,
      }
    }

    return {
      viewportWidth: window.innerWidth,
      htmlScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      hero: readRect('[data-ui="about-hero"]'),
      eyebrowFontSize: Number.parseFloat(
        window.getComputedStyle(document.querySelector('[data-ui="about-eyebrow"]') as HTMLElement).fontSize
      ),
      cta: readRect('[data-ui="about-cta-group"]'),
      projects: readRect('[data-ui="about-projects"]'),
      timeline: readRect('[data-ui="about-timeline-section"]'),
      contact: readRect('[data-ui="about-contact-section"]'),
      service: readRect('[data-ui="about-service-section"]'),
      avatar: readRect('[data-ui="about-avatar"]'),
    }
  })

  expect(snapshot.htmlScrollWidth).toBeLessThanOrEqual(snapshot.viewportWidth)
  expect(snapshot.bodyScrollWidth).toBeLessThanOrEqual(snapshot.viewportWidth)
  expect(snapshot.eyebrowFontSize).toBeGreaterThanOrEqual(16)
  expect(snapshot.hero).not.toBeNull()
  expect(snapshot.cta).not.toBeNull()
  expect(snapshot.projects).not.toBeNull()
  expect(snapshot.timeline).not.toBeNull()
  expect(snapshot.contact).not.toBeNull()
  expect(snapshot.service).not.toBeNull()
  expect((snapshot.cta?.top ?? 0)).toBeGreaterThan(snapshot.hero?.top ?? 0)
  expect((snapshot.projects?.top ?? 0)).toBeGreaterThan(snapshot.cta?.top ?? 0)
  expect((snapshot.timeline?.top ?? 0)).toBeGreaterThan(snapshot.projects?.top ?? 0)
  expect((snapshot.contact?.top ?? 0)).toBeGreaterThan(snapshot.timeline?.top ?? 0)
  expect((snapshot.service?.top ?? 0)).toBeGreaterThan(snapshot.contact?.top ?? 0)
  expect(snapshot.avatar?.width ?? 0).toBeLessThanOrEqual(96)
  expect(snapshot.avatar?.right ?? 0).toBeLessThanOrEqual(snapshot.viewportWidth + 0.5)
})

  test("iPhone 15 Pro 상세 본문(table/code block)은 가로 클리핑 없이 유지된다", async ({ page }) => {
  await mockDetailEndpoint(page)

  await page.goto("/posts/990")
  await expect(page.getByText("모바일 테이블/코드블록 회귀 테스트")).toBeVisible()
  const tables = page.locator("table")
  await expect(tables).toHaveCount(2)
  await expect(tables.first()).toBeVisible()
  await expect(page.locator("pre")).toBeVisible()

  const firstSnapshot = await captureLayoutSnapshot(page)
  expect(firstSnapshot.htmlScrollWidth).toBeLessThanOrEqual(firstSnapshot.viewportWidth)
  expect(firstSnapshot.bodyScrollWidth).toBeLessThanOrEqual(firstSnapshot.viewportWidth)
  expect(firstSnapshot.codeShellClientWidth ?? 0).toBeLessThanOrEqual(firstSnapshot.viewportWidth + 0.5)
  expect((firstSnapshot.codeShellScrollWidth ?? 0) >= (firstSnapshot.codeShellClientWidth ?? 0)).toBeTruthy()
  expect(["auto", "scroll"]).toContain(firstSnapshot.codeShellOverflowX)
  expect(firstSnapshot.codeShellTouchAction).toBe("pan-x")
  expect(firstSnapshot.codeShellOverscrollBehaviorX).toBe("contain")
  expect((firstSnapshot.codeShellScrollLeftAfter ?? 0) >= (firstSnapshot.codeShellScrollLeftBefore ?? 0)).toBeTruthy()
  expect(["auto", "scroll", "hidden", "clip"]).toContain(firstSnapshot.codeOverflowX)
  expect(firstSnapshot.firstTableScrollRight ?? 0).toBeLessThanOrEqual(firstSnapshot.viewportWidth + 0.5)
  expect(firstSnapshot.secondTableScrollRight ?? 0).toBeLessThanOrEqual(firstSnapshot.viewportWidth + 0.5)
  expect((firstSnapshot.firstTableScrollWidth ?? 0) >= (firstSnapshot.firstTableScrollClientWidth ?? 0)).toBeTruthy()
  expect((firstSnapshot.secondTableScrollWidth ?? 0) >= (firstSnapshot.secondTableScrollClientWidth ?? 0)).toBeTruthy()
  expect(["auto", "scroll"]).toContain(firstSnapshot.firstTableScrollOverflowX)
  expect(["auto", "scroll"]).toContain(firstSnapshot.secondTableScrollOverflowX)
  expect((firstSnapshot.tableRight ?? 0) + 2 >= (firstSnapshot.firstTableScrollRight ?? 0)).toBeTruthy()
  expect((firstSnapshot.secondTableRight ?? 0) + 2 >= (firstSnapshot.secondTableScrollRight ?? 0)).toBeTruthy()
  expect(firstSnapshot.firstTableCellLabel).toBe("항목")
  expect(firstSnapshot.firstTableHeadDisplay).not.toBe("none")
  expect(["none", "normal"]).toContain(firstSnapshot.firstTableCellBeforeContent)
  expect(firstSnapshot.secondTableHeadDisplay).not.toBe("none")
  expect(["none", "normal"]).toContain(firstSnapshot.secondTableCellBeforeContent)

  await page.reload()
  await expect(page.locator("table").first()).toBeVisible()
  await expect(page.locator("pre")).toBeVisible()

  const secondSnapshot = await captureLayoutSnapshot(page)
  expect(secondSnapshot.htmlScrollWidth).toBeLessThanOrEqual(secondSnapshot.viewportWidth)
  expect(secondSnapshot.bodyScrollWidth).toBeLessThanOrEqual(secondSnapshot.viewportWidth)
  expect(secondSnapshot.codeShellClientWidth ?? 0).toBeLessThanOrEqual(secondSnapshot.viewportWidth + 0.5)
  expect((secondSnapshot.codeShellScrollWidth ?? 0) >= (secondSnapshot.codeShellClientWidth ?? 0)).toBeTruthy()
  expect(["auto", "scroll"]).toContain(secondSnapshot.codeShellOverflowX)
  expect(secondSnapshot.codeShellTouchAction).toBe("pan-x")
  expect(secondSnapshot.codeShellOverscrollBehaviorX).toBe("contain")
  expect((secondSnapshot.codeShellScrollLeftAfter ?? 0) >= (secondSnapshot.codeShellScrollLeftBefore ?? 0)).toBeTruthy()
  expect(["auto", "scroll", "hidden", "clip"]).toContain(secondSnapshot.codeOverflowX)
  expect(secondSnapshot.firstTableScrollRight ?? 0).toBeLessThanOrEqual(secondSnapshot.viewportWidth + 0.5)
  expect(secondSnapshot.secondTableScrollRight ?? 0).toBeLessThanOrEqual(secondSnapshot.viewportWidth + 0.5)
  expect((secondSnapshot.firstTableScrollWidth ?? 0) >= (secondSnapshot.firstTableScrollClientWidth ?? 0)).toBeTruthy()
  expect((secondSnapshot.secondTableScrollWidth ?? 0) >= (secondSnapshot.secondTableScrollClientWidth ?? 0)).toBeTruthy()
  expect(["auto", "scroll"]).toContain(secondSnapshot.firstTableScrollOverflowX)
  expect(["auto", "scroll"]).toContain(secondSnapshot.secondTableScrollOverflowX)
  expect((secondSnapshot.tableRight ?? 0) + 2 >= (secondSnapshot.firstTableScrollRight ?? 0)).toBeTruthy()
  expect((secondSnapshot.secondTableRight ?? 0) + 2 >= (secondSnapshot.secondTableScrollRight ?? 0)).toBeTruthy()
  expect(secondSnapshot.firstTableCellLabel).toBe("항목")
  expect(secondSnapshot.firstTableHeadDisplay).not.toBe("none")
  expect(["none", "normal"]).toContain(secondSnapshot.firstTableCellBeforeContent)
  expect(secondSnapshot.secondTableHeadDisplay).not.toBe("none")
  expect(["none", "normal"]).toContain(secondSnapshot.secondTableCellBeforeContent)
})

  test("iPhone 15 Pro 상세 제목은 한국어 단어를 음절 단위로 끊지 않는다", async ({ page }) => {
  await mockDetailEndpoint(page, {
    id: 992,
    title: "Stateless란 무엇인가?",
    content: "모바일 제목 줄바꿈 회귀 테스트입니다.",
  })

  await page.goto("/posts/992")
  const title = page.getByRole("heading", { name: "Stateless란 무엇인가?", level: 1 })
  await expect(title).toBeVisible()

  const titleWrapSnapshot = await title.evaluate((element) => {
    const target = "무엇인가?"
    const textNode = Array.from(element.childNodes).find(
      (node): node is Text => node.nodeType === Node.TEXT_NODE && (node.textContent || "").includes(target)
    )
    if (!textNode || !textNode.textContent) return null

    const startOffset = textNode.textContent.indexOf(target)
    const range = document.createRange()
    range.setStart(textNode, startOffset)
    range.setEnd(textNode, startOffset + target.length)
    const rects = Array.from(range.getClientRects()).map((rect) => ({
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width,
    }))
    range.detach()

    return {
      target,
      rects,
      distinctLineCount: new Set(rects.map((rect) => Math.round(rect.top))).size,
      viewportWidth: window.innerWidth,
      htmlScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }
  })

  expect(titleWrapSnapshot).not.toBeNull()
  expect(titleWrapSnapshot?.distinctLineCount).toBe(1)
  expect(titleWrapSnapshot?.rects.length).toBe(1)
  expect(titleWrapSnapshot?.rects[0]?.right ?? 0).toBeLessThanOrEqual(
    (titleWrapSnapshot?.viewportWidth ?? 0) + 0.5
  )
  expect(titleWrapSnapshot?.htmlScrollWidth).toBeLessThanOrEqual(titleWrapSnapshot?.viewportWidth ?? 0)
  expect(titleWrapSnapshot?.bodyScrollWidth).toBeLessThanOrEqual(titleWrapSnapshot?.viewportWidth ?? 0)
})

  test("iPhone 15 Pro 상세 액션은 메타/공유/댓글/작성자 유틸리티 순서를 유지한다", async ({ page }) => {
  await mockDetailEndpoint(page, {
    id: 991,
    title: "모바일 액션 위계 테스트",
    likesCount: 1,
    commentsCount: 4,
    hitCount: 24,
    actorCanModify: true,
    actorCanDelete: true,
  })

  await page.goto("/posts/991")

  const engagementRow = page.locator('[aria-label="post engagement"]')
  const metaViewStat = page.locator(".metaInlineViewStat")
  const compactActionBar = page.getByLabel("빠른 이동 및 반응")
  const likeButton = compactActionBar.getByRole("button", { name: "좋아요 1" })
  const shareButton = compactActionBar.getByRole("button", { name: /^공유/ })
  const commentButton = compactActionBar.getByRole("button", { name: /^댓글/ })
  const editButton = page.getByRole("button", { name: "수정" }).first()
  const deleteButton = page.getByRole("button", { name: "삭제" }).first()

  await expect(engagementRow).toBeHidden()
  await expect(metaViewStat).toContainText("조회 25")
  await expect(likeButton).toBeVisible()
  await expect(shareButton).toBeVisible()
  await expect(commentButton).toBeVisible()
  await expect(editButton).toBeVisible()
  await expect(deleteButton).toBeVisible()

  const [metaViewBox, likeBox, shareBox, commentActionBox, editBox, deleteBox] = await Promise.all([
    metaViewStat.boundingBox(),
    likeButton.boundingBox(),
    shareButton.boundingBox(),
    commentButton.boundingBox(),
    editButton.boundingBox(),
    deleteButton.boundingBox(),
  ])

  expect(metaViewBox).not.toBeNull()
  expect(likeBox).not.toBeNull()
  expect(shareBox).not.toBeNull()
  expect(commentActionBox).not.toBeNull()
  expect(editBox).not.toBeNull()
  expect(deleteBox).not.toBeNull()

  expect((metaViewBox?.y ?? 0)).toBeLessThan((likeBox?.y ?? 0))
  expect((likeBox?.height ?? 0)).toBeLessThanOrEqual(72)
  expect(Math.abs((likeBox?.y ?? 0) - (shareBox?.y ?? 0))).toBeLessThanOrEqual(4)
  expect(Math.abs((shareBox?.y ?? 0) - (commentActionBox?.y ?? 0))).toBeLessThanOrEqual(4)
  expect(Math.abs((likeBox?.width ?? 0) - (shareBox?.width ?? 0))).toBeLessThanOrEqual(20)
  expect(Math.abs((commentActionBox?.width ?? 0) - (shareBox?.width ?? 0))).toBeLessThanOrEqual(20)
  expect((editBox?.y ?? 0)).toBeLessThan((likeBox?.y ?? 0))
  expect((deleteBox?.y ?? 0)).toBeLessThan((likeBox?.y ?? 0))
})

test.describe("데스크톱 상세 floating reaction 액션", () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
  })

  test("하트/공유 아이콘은 원형 버튼 크기에 맞는 시각 크기를 유지한다", async ({ page }) => {
    await mockDetailEndpoint(page, {
      id: 993,
      title: "반응 버튼 아이콘 크기 테스트",
      likesCount: 0,
      commentsCount: 0,
      hitCount: 10,
    })

    await page.goto("/posts/993")
    await expect(page.getByRole("heading", { name: "반응 버튼 아이콘 크기 테스트", level: 1 })).toBeVisible()

    const metrics = await page.evaluate(() => {
      const readMetric = (buttonSelector: string) => {
        const button = document.querySelector<HTMLButtonElement>(buttonSelector)
        const icon = button?.querySelector<SVGElement>("svg") ?? null
        const buttonBox = button?.getBoundingClientRect() ?? null
        const iconBox = icon?.getBoundingClientRect() ?? null
        const iconStyle = icon ? window.getComputedStyle(icon) : null

        return {
          buttonWidth: buttonBox?.width ?? 0,
          buttonHeight: buttonBox?.height ?? 0,
          iconWidth: iconBox?.width ?? 0,
          iconHeight: iconBox?.height ?? 0,
          iconFontSize: iconStyle ? Number.parseFloat(iconStyle.fontSize) : 0,
        }
      }

      return {
        like: readMetric(".floatingLikeButton"),
        share: readMetric(".floatingShareButton"),
      }
    })

    expect(metrics.like.buttonWidth).toBeGreaterThanOrEqual(55.5)
    expect(metrics.like.buttonHeight).toBeGreaterThanOrEqual(55.5)
    expect(metrics.share.buttonWidth).toBeGreaterThanOrEqual(55.5)
    expect(metrics.share.buttonHeight).toBeGreaterThanOrEqual(55.5)
    expect(metrics.like.iconWidth).toBeGreaterThanOrEqual(28)
    expect(metrics.like.iconHeight).toBeGreaterThanOrEqual(28)
    expect(metrics.share.iconWidth).toBeGreaterThanOrEqual(28)
    expect(metrics.share.iconHeight).toBeGreaterThanOrEqual(28)
    expect(metrics.like.iconFontSize).toBeGreaterThanOrEqual(28)
    expect(metrics.share.iconFontSize).toBeGreaterThanOrEqual(28)
  })
})
})
