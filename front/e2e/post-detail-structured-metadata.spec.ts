import { expect, type Page, test } from "@playwright/test"

type PostFixture = {
  id: number
  title: string
  summary: string
  createdAt: string
  modifiedAt: string
}

const fixtures: PostFixture[] = [
  {
    id: 1313,
    title: "구조화 데이터 첫 번째 글",
    summary: "첫 번째 글 요약입니다.",
    createdAt: "2026-06-01T01:02:03Z",
    modifiedAt: "2026-06-05T04:05:06Z",
  },
  {
    id: 1314,
    title: "구조화 데이터 두 번째 글",
    summary: "두 번째 글 요약입니다.",
    createdAt: "2026-06-10T07:08:09Z",
    modifiedAt: "2026-06-11T10:11:12Z",
  },
]

const mockPost = async (page: Page, fixture: PostFixture) => {
  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ resultCode: "401-1", msg: "unauthorized" }),
    })
  })
  await page.route(`**/post/api/v1/posts/${fixture.id}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: fixture.id,
        createdAt: fixture.createdAt,
        modifiedAt: fixture.modifiedAt,
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: fixture.title,
        content: fixture.summary,
        type: "Post",
        tags: ["SEO"],
        category: ["메타데이터"],
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
  await page.route(`**/post/api/v1/posts/${fixture.id}/hit`, async (route) => {
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
}

const toExpectedIso = (value: string) => new Date(value).toISOString()

const toExpectedFallbackImage = (title: string) =>
  `https://og-image-korean.vercel.app/${encodeURIComponent(title)}.png`

const readStructuredData = async (page: Page) => {
  return await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((nodes) =>
      nodes
        .map((node) => {
          try {
            return JSON.parse(node.textContent || "{}")
          } catch {
            return null
          }
        })
        .filter(Boolean)
    )
}

test.describe("post detail structured metadata", () => {
  for (const fixture of fixtures) {
    test(`${fixture.title} head metadata는 canonical post와 같은 DTO 값을 사용한다`, async ({
      page,
    }) => {
      await mockPost(page, fixture)

      await page.goto(`/posts/${fixture.id}`)
      await expect(
        page.getByRole("heading", { name: fixture.title })
      ).toBeVisible()

      const canonicalUrl = `https://www.aquilaxk.site/posts/${fixture.id}`
      const expectedCreatedAt = toExpectedIso(fixture.createdAt)
      const expectedModifiedAt = toExpectedIso(fixture.modifiedAt)
      const expectedImage = toExpectedFallbackImage(fixture.title)
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        canonicalUrl
      )
      await expect(
        page.locator('meta[property="og:site_name"]')
      ).toHaveAttribute("content", "AquilaLog")
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
        "content",
        expectedImage
      )
      await expect(
        page.locator('meta[property="article:published_time"]')
      ).toHaveAttribute("content", expectedCreatedAt)
      await expect(
        page.locator('meta[property="article:modified_time"]')
      ).toHaveAttribute("content", expectedModifiedAt)

      const structuredData = await readStructuredData(page)
      const blogPosting = structuredData.find(
        (entry) => entry["@type"] === "BlogPosting"
      )
      const breadcrumb = structuredData.find(
        (entry) => entry["@type"] === "BreadcrumbList"
      )

      expect(blogPosting).toMatchObject({
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: fixture.title,
        description: fixture.summary,
        url: canonicalUrl,
        mainEntityOfPage: canonicalUrl,
        datePublished: expectedCreatedAt,
        dateModified: expectedModifiedAt,
        image: [expectedImage],
      })
      expect(blogPosting.author).toMatchObject({
        "@type": "Person",
        name: "관리자",
      })
      expect(blogPosting.publisher).toMatchObject({
        "@type": "Organization",
        name: "AquilaLog",
      })

      expect(breadcrumb).toMatchObject({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
      })
      expect(breadcrumb.itemListElement).toEqual([
        {
          "@type": "ListItem",
          position: 1,
          name: "홈",
          item: "https://www.aquilaxk.site",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: fixture.title,
          item: canonicalUrl,
        },
      ])
    })
  }
})
