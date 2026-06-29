import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

const readFrontText = (relativePath: string): string =>
  readFileSync(path.resolve(__dirname, "..", relativePath), "utf8")

test.describe("api client stale-if-error contract", () => {
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
    expect(postQuerySource).toContain("const [staleMeta, setStaleMeta]")
    expect(postQuerySource).toContain("setStaleMeta(result.meta)")
    expect(postQuerySource).toContain("staleMeta,")
    expect(feedQuerySource).toContain("const staleMeta = query.data?.pages.find((page) => page.staleMeta?.stale)?.staleMeta ?? null")
    expect(feedQuerySource).toContain("staleMeta,")
  })
})
