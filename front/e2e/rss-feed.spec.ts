import { expect, test } from "@playwright/test"
import type { GetServerSidePropsContext } from "next"
import type { ExplorePostsPage } from "../src/apis/backend/posts"
import { createFeedServerSideProps } from "../src/pages/feed"
import {
  buildRssFeedXml,
  collectRssFeedPosts,
  RSS_FEED_CONTENT_TYPE,
} from "../src/libs/rssFeed"
import type { TPost, TPostStatus } from "../src/types"

const makePost = (
  id: number,
  status: TPostStatus[] = ["Public"],
  timestamps: { createdTime?: string; modifiedTime?: string } = {}
): TPost => ({
  id: String(id),
  date: { start_date: `2026-06-${String((id % 28) + 1).padStart(2, "0")}` },
  type: ["Post"],
  slug: `rss-post-${id}`,
  title: `RSS Post ${id}`,
  status,
  createdTime: timestamps.createdTime ?? `2026-06-${String((id % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
  ...(timestamps.modifiedTime ? { modifiedTime: timestamps.modifiedTime } : {}),
  summary: `RSS summary ${id}`,
  fullWidth: false,
})

const createPagedLoader =
  (posts: TPost[], requestedPages: number[]) =>
  async ({ page, pageSize }: { page?: number; pageSize?: number }): Promise<ExplorePostsPage> => {
    const safePage = page ?? 1
    const safePageSize = pageSize ?? 30
    requestedPages.push(safePage)
    const start = (safePage - 1) * safePageSize

    return {
      posts: posts.slice(start, start + safePageSize),
      totalCount: posts.length,
      pageNumber: safePage,
      pageSize: safePageSize,
      paginationMode: "page",
    }
  }

test.describe("RSS feed contract", () => {
  test("collects only public feed posts and sorts newest first", async () => {
    const newestPublicPost = makePost(1, ["Public"], {
      createdTime: "2026-06-20T00:00:00.000Z",
      modifiedTime: "2026-06-21T00:00:00.000Z",
    })
    const olderPublicPost = makePost(2, ["Public"], {
      createdTime: "2026-06-10T00:00:00.000Z",
    })
    const privatePost = makePost(3, ["Private"], {
      createdTime: "2026-06-22T00:00:00.000Z",
    })
    const detailOnlyPost = makePost(4, ["PublicOnDetail"], {
      createdTime: "2026-06-23T00:00:00.000Z",
    })
    const requestedPages: number[] = []

    const posts = await collectRssFeedPosts(
      createPagedLoader([olderPublicPost, privatePost, detailOnlyPost, newestPublicPost], requestedPages),
      { pageSize: 2 }
    )

    expect(requestedPages).toEqual([1, 2])
    expect(posts.map((post) => post.id)).toEqual(["1", "2"])
  })

  test("builds valid RSS XML with canonical item URLs", () => {
    const xml = buildRssFeedXml(
      [
        makePost(1, ["Public"], {
          createdTime: "2026-06-20T00:00:00.000Z",
          modifiedTime: "2026-06-21T00:00:00.000Z",
        }),
      ],
      {
        siteUrl: "https://example.com/",
        title: "AquilaLog",
        description: "RSS contract",
        lang: "ko-KR",
      }
    )

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<rss version="2.0">')
    expect(xml).toContain("<link>https://example.com</link>")
    expect(xml).toContain("<guid>https://example.com/posts/1</guid>")
    expect(xml).toContain("<pubDate>Sun, 21 Jun 2026 00:00:00 GMT</pubDate>")
  })

  test("feed route writes 200 RSS response headers and XML body", async () => {
    const chunks: string[] = []
    const headers = new Map<string, string>()
    const res = {
      statusCode: 0,
      setHeader: (name: string, value: string) => headers.set(name.toLowerCase(), value),
      write: (chunk: string) => chunks.push(chunk),
      end: () => undefined,
    }

    const getServerSideProps = createFeedServerSideProps(
      createPagedLoader([makePost(1), makePost(2, ["Private"])], [])
    )

    await getServerSideProps({ res } as unknown as GetServerSidePropsContext)

    expect(res.statusCode).toBe(200)
    expect(headers.get("content-type")).toBe(RSS_FEED_CONTENT_TYPE)
    expect(chunks.join("")).toContain("<title>RSS Post 1</title>")
    expect(chunks.join("")).not.toContain("RSS Post 2")
  })
})
