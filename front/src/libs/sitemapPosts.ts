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
  const responsePageNumber = toSafePositiveInteger(page.pageNumber, requestedPage)
  const responsePageSize = toSafePositiveInteger(page.pageSize, requestedPageSize)
  const totalCount = Number.isFinite(page.totalCount) ? Math.max(0, Math.trunc(page.totalCount)) : 0
  return responsePageNumber * responsePageSize < totalCount
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

    if (result.posts.length === 0 || !hasMoreSitemapPages(result, page, safePageSize)) {
      break
    }
  }

  return posts
}
