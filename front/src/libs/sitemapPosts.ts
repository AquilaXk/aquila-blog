import { getFeedPostsPage, type ExplorePostsPage } from "src/apis/backend/posts"
import type { TPost } from "src/types"

export const SITEMAP_POST_PAGE_SIZE = 30
export const SITEMAP_MAX_POST_PAGES = 1_000

export type SitemapPostPageLoader = (params: {
  order?: "asc" | "desc"
  page?: number
  pageSize?: number
}) => Promise<ExplorePostsPage>

type CollectSitemapPostsOptions = {
  pageSize?: number
  maxPages?: number
}

const toSafePositiveInteger = (value: number | undefined, fallback: number) => {
  if (!Number.isFinite(value)) return fallback
  return Math.max(1, Math.trunc(value || fallback))
}

const isSitemapVisiblePost = (post: TPost) =>
  post.status.includes("Public") &&
  !post.status.includes("Private") &&
  !post.status.includes("PublicOnDetail")

const hasMoreSitemapPages = (page: ExplorePostsPage, requestedPage: number, requestedPageSize: number) => {
  if (page.hasNext === true) return true
  const responsePageSize = toSafePositiveInteger(page.pageSize, requestedPageSize)
  const totalCount = Number.isFinite(page.totalCount) ? Math.max(0, Math.trunc(page.totalCount)) : 0
  return requestedPage * responsePageSize < totalCount
}

export const collectSitemapPosts = async (
  loadPage: SitemapPostPageLoader = getFeedPostsPage,
  { pageSize = SITEMAP_POST_PAGE_SIZE, maxPages = SITEMAP_MAX_POST_PAGES }: CollectSitemapPostsOptions = {}
) => {
  const safePageSize = toSafePositiveInteger(pageSize, SITEMAP_POST_PAGE_SIZE)
  const safeMaxPages = toSafePositiveInteger(maxPages, SITEMAP_MAX_POST_PAGES)
  const posts: TPost[] = []
  const seenPostIds = new Set<string>()

  for (let page = 1; page <= safeMaxPages; page += 1) {
    const result = await loadPage({
      order: "desc",
      page,
      pageSize: safePageSize,
    })

    for (const post of result.posts) {
      if (!isSitemapVisiblePost(post) || seenPostIds.has(post.id)) continue
      seenPostIds.add(post.id)
      posts.push(post)
    }

    const hasMore = result.posts.length > 0 && hasMoreSitemapPages(result, page, safePageSize)
    if (!hasMore) {
      break
    }

    if (page === safeMaxPages) {
      throw new Error(
        `Sitemap collection reached maxPages=${safeMaxPages} before exhausting posts. Increase the limit or split the sitemap.`
      )
    }
  }

  return posts
}
