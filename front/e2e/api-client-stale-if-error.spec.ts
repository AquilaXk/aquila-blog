import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

const readFrontText = (relativePath: string): string =>
  readFileSync(path.resolve(__dirname, "..", relativePath), "utf8")

test.describe("api client stale-if-error contract", () => {
  test("runtime stale fallback returns meta and telemetry without changing cached payload", async ({ page }) => {
    const cachedPayload = { title: "cached feed payload" }
    let fetchCount = 0

    await page.route("**/post/api/v1/posts/feed**", async (route) => {
      fetchCount += 1
      if (fetchCount === 1) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: {
            "cache-control": "max-age=60",
            etag: '"feed-v1"',
          },
          body: JSON.stringify(cachedPayload),
        })
        return
      }

      await route.fulfill({
        status: 503,
        body: "temporarily unavailable",
      })
    })

    await page.goto("/_qa/api-client-stale-if-error")
    await page.getByRole("button", { name: "Run stale-if-error scenario" }).click()

    await expect
      .poll(async () => {
        const rawText = await page.getByTestId("qa-api-client-stale-result").textContent()
        return rawText ? JSON.parse(rawText) : null
      })
      .toMatchObject({
        fresh: {
          data: cachedPayload,
          meta: { stale: false },
        },
        stale: {
          data: cachedPayload,
          meta: {
            stale: true,
            staleReason: "http-status",
            staleStatus: 503,
            staleAgeMs: expect.any(Number),
          },
        },
        telemetry: [
          expect.objectContaining({
            pathBucket: "/post/api/v1/posts/feed",
            reason: "http-status",
            status: 503,
          }),
        ],
        error: null,
      })

    expect(fetchCount).toBe(3)
  })

  test("stale fallback exposes opt-in meta without changing apiFetch payload callers", () => {
    const clientSource = readFrontText("src/apis/backend/client.ts")
    const revalidateCacheSource = readFrontText("src/apis/backend/clientRevalidateCache.ts")

    expect(clientSource).toContain('export type { ApiFetchMeta, ApiFetchResult } from "./clientRevalidateCache"')
    expect(clientSource).toContain("export const apiFetchWithMeta")
    expect(clientSource).toMatch(/apiFetch\s*=\s*async\s*<T>[\s\S]*apiFetchWithMeta<T>\(path, init\)\)\.data/)
    expect(clientSource).not.toContain("refreshRevalidateCacheEntry(url, revalidateCacheEntry, null, null)")
    expect(revalidateCacheSource).toContain("export type ApiFetchMeta")
    expect(revalidateCacheSource).toContain("export type ApiFetchResult<T>")
    expect(revalidateCacheSource).toContain('staleReason?: "transport" | "timeout" | "http-status"')
    expect(revalidateCacheSource).toContain("maxStaleAgeMs")
    expect(revalidateCacheSource).toContain("emitStaleIfErrorTelemetry")
    expect(revalidateCacheSource).toContain("reason,")
    expect(revalidateCacheSource).toContain("staleAgeMs,")
  })

  test("public detail and feed hooks retain stale meta beside React Query data", () => {
    const detailRequestsSource = readFrontText("src/apis/backend/posts/PostApiDetailRequests.ts")
    const postsRequestsSource = readFrontText("src/apis/backend/posts/PostApiRequests.ts")
    const dtoSource = readFrontText("src/apis/backend/posts/PostApiDtos.ts")
    const postQuerySource = readFrontText("src/hooks/usePostQuery.ts")
    const feedQuerySource = readFrontText("src/hooks/useExplorePostsQuery.ts")

    expect(detailRequestsSource).toContain("getPostDetailByIdWithMeta")
    expect(detailRequestsSource).toContain("apiFetchWithMeta<ApiPostWithContentDto>")
    expect(postsRequestsSource).toContain("apiFetchWithMeta<PageDto<ApiPostDto>>")
    expect(postsRequestsSource).toContain("staleMeta: response.meta")
    expect(dtoSource).toContain("staleMeta?: ApiFetchMeta")
    expect(postQuerySource).toContain("useQuery<ApiFetchResult<PostDetail | null>>")
    expect(postQuerySource).toContain("queryFn: () => getPostDetailByIdWithMeta(routeId)")
    expect(postQuerySource).toContain("staleMeta: query.data?.meta ?? null")
    expect(feedQuerySource).toContain("query.data?.pages.find((page) => page.staleMeta?.stale)?.staleMeta")
    expect(feedQuerySource).toContain("query.data?.pages.find((page) => page.staleMeta)?.staleMeta")
    expect(feedQuerySource).toContain("staleMeta,")
  })
})
