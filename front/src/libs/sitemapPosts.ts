import { getFeedPostsPage, type ExplorePostsPage } from "src/apis/backend/posts"
import type { TPost } from "src/types"
import { toCanonicalPostPath } from "src/libs/utils/postPath"

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

type SitemapField = {
  loc: string
  lastmod: string
  priority: number
  changefreq: "daily"
}

const toSafePositiveInteger = (value: number | undefined, fallback: number) => {
  if (!Number.isFinite(value)) return fallback
  return Math.max(1, Math.trunc(value || fallback))
}

const toStableIsoTimestamp = (value: string | undefined) => {
  if (typeof value !== "string" || value.trim().length === 0) return null
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return null
  return new Date(timestamp).toISOString()
}

const isSitemapVisiblePost = (post: TPost) =>
  post.status.includes("Public") &&
  !post.status.includes("Private") &&
  !post.status.includes("PublicOnDetail")

export const getSitemapPostLastmod = (post: TPost) =>
  toStableIsoTimestamp(post.modifiedTime) ??
  toStableIsoTimestamp(post.createdTime) ??
  toStableIsoTimestamp(post.date.start_date) ??
  "1970-01-01T00:00:00.000Z"

const getLatestLastmod = (lastmods: string[], fallback: string) =>
  lastmods.reduce((latest, candidate) => {
    const latestTime = Date.parse(latest)
    const candidateTime = Date.parse(candidate)
    if (!Number.isFinite(candidateTime)) return latest
    if (!Number.isFinite(latestTime)) return candidate
    return candidateTime > latestTime ? candidate : latest
  }, fallback)

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

export const buildSitemapFields = (
  posts: TPost[],
  siteUrl: string,
  fallbackSiteLastmod = "1970-01-01T00:00:00.000Z"
): SitemapField[] => {
  const normalizedSiteUrl = siteUrl.replace(/\/+$/, "")
  const normalizedFallbackLastmod =
    toStableIsoTimestamp(fallbackSiteLastmod) ?? "1970-01-01T00:00:00.000Z"

  const postFields = posts.map((post) => ({
    loc: `${normalizedSiteUrl}${toCanonicalPostPath(post.id)}`,
    lastmod: getSitemapPostLastmod(post),
    priority: 0.7,
    changefreq: "daily" as const,
  }))

  return [
    {
      loc: normalizedSiteUrl,
      lastmod: getLatestLastmod(
        postFields.map((field) => field.lastmod),
        normalizedFallbackLastmod
      ),
      priority: 1.0,
      changefreq: "daily",
    },
    ...postFields,
  ]
}
