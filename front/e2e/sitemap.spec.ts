import { expect, test } from "@playwright/test"
import type { ExplorePostsPage } from "../src/apis/backend/posts"
import { buildSitemapFields, collectSitemapPosts } from "../src/libs/sitemapPosts"
import type { TPost, TPostStatus } from "../src/types"

const makePost = (
  id: number,
  status: TPostStatus[] = ["Public"],
  timestamps: { createdTime?: string; modifiedTime?: string } = {}
): TPost => ({
  id: String(id),
  date: { start_date: `2026-06-${String((id % 28) + 1).padStart(2, "0")}` },
  type: ["Post"],
  slug: `post-${id}`,
  title: `Post ${id}`,
  status,
  createdTime: timestamps.createdTime ?? `2026-06-${String((id % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
  ...(timestamps.modifiedTime ? { modifiedTime: timestamps.modifiedTime } : {}),
  fullWidth: false,
})

const createPagedLoader =
  (posts: TPost[], requestedPages: number[], pageNumberOffset = 0) =>
  async ({ page, pageSize }: { page?: number; pageSize?: number }): Promise<ExplorePostsPage> => {
    const safePage = page ?? 1
    const safePageSize = pageSize ?? 30
    requestedPages.push(safePage)
    const start = (safePage - 1) * safePageSize

    return {
      posts: posts.slice(start, start + safePageSize),
      totalCount: posts.length,
      pageNumber: safePage + pageNumberOffset,
      pageSize: safePageSize,
      paginationMode: "page",
    }
  }

test.describe("server sitemap post collection", () => {
  for (const postCount of [31, 100, 1000]) {
    test(`collects all ${postCount} public feed posts without first-page truncation`, async () => {
      const posts = Array.from({ length: postCount }, (_, index) => makePost(index + 1))
      const requestedPages: number[] = []

      const collected = await collectSitemapPosts(createPagedLoader(posts, requestedPages), {
        pageSize: 30,
      })

      expect(collected.map((post) => post.id)).toEqual(posts.map((post) => post.id))
      expect(new Set(collected.map((post) => post.id)).size).toBe(postCount)
      expect(requestedPages).toEqual(
        Array.from({ length: Math.ceil(postCount / 30) }, (_, index) => index + 1)
      )
    })
  }

  test("filters non-public detail-only posts and deduplicates repeated feed rows", async () => {
    const publicPost = makePost(1)
    const repeatedPublicPost = makePost(1)
    const privatePost = makePost(2, ["Private"])
    const detailOnlyPost = makePost(3, ["PublicOnDetail"])
    const requestedPages: number[] = []

    const collected = await collectSitemapPosts(
      createPagedLoader([publicPost, repeatedPublicPost, privatePost, detailOnlyPost], requestedPages),
      { pageSize: 2 }
    )

    expect(collected.map((post) => post.id)).toEqual(["1"])
    expect(requestedPages).toEqual([1, 2])
  })

  test("fails loudly when maxPages is reached before exhausting public posts", async () => {
    const posts = Array.from({ length: 31 }, (_, index) => makePost(index + 1))
    const requestedPages: number[] = []

    await expect(
      collectSitemapPosts(createPagedLoader(posts, requestedPages), {
        pageSize: 30,
        maxPages: 1,
      })
    ).rejects.toThrow("Sitemap collection reached maxPages=1 before exhausting posts")
    expect(requestedPages).toEqual([1])
  })

  test("does not treat zero-based response pageNumber as extra pages at the cap", async () => {
    const posts = Array.from({ length: 60 }, (_, index) => makePost(index + 1))
    const requestedPages: number[] = []

    const collected = await collectSitemapPosts(createPagedLoader(posts, requestedPages, -1), {
      pageSize: 30,
      maxPages: 2,
    })

    expect(collected.map((post) => post.id)).toEqual(posts.map((post) => post.id))
    expect(requestedPages).toEqual([1, 2])
  })

  test("uses stable content timestamps for sitemap lastmod fields", () => {
    const updatedPost = makePost(1, ["Public"], {
      createdTime: "2026-06-01T00:00:00.000Z",
      modifiedTime: "2026-06-07T12:34:56.000Z",
    })
    const createdOnlyPost = makePost(2, ["Public"], {
      createdTime: "2026-06-10T08:00:00.000Z",
    })

    const firstFields = buildSitemapFields(
      [updatedPost, createdOnlyPost],
      "https://example.com/",
      "2026-01-01T00:00:00.000Z"
    )
    const secondFields = buildSitemapFields(
      [updatedPost, createdOnlyPost],
      "https://example.com/",
      "2026-01-01T00:00:00.000Z"
    )

    expect(secondFields).toEqual(firstFields)
    expect(firstFields).toEqual([
      {
        loc: "https://example.com",
        lastmod: "2026-06-10T08:00:00.000Z",
        priority: 1,
        changefreq: "daily",
      },
      {
        loc: "https://example.com/posts/1",
        lastmod: "2026-06-07T12:34:56.000Z",
        priority: 0.7,
        changefreq: "daily",
      },
      {
        loc: "https://example.com/posts/2",
        lastmod: "2026-06-10T08:00:00.000Z",
        priority: 0.7,
        changefreq: "daily",
      },
    ])
  })
})
