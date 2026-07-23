import type { GetServerSideProps, GetServerSidePropsContext } from "next"
import { CONFIG } from "site.config"
import { getFeedPostsPage } from "src/apis/backend/posts"
import {
  buildRssFeedXml,
  collectRssFeedPosts,
  RSS_FEED_CONTENT_TYPE,
  type RssFeedPostPageLoader,
} from "src/libs/rssFeed"

const RSS_SUCCESS_CACHE_CONTROL =
  "public, s-maxage=600, stale-while-revalidate=3600, stale-if-error=86400"
const RSS_FAILURE_RETRY_AFTER_SECONDS = "300"

export const createFeedServerSideProps =
  (loadPage: RssFeedPostPageLoader = getFeedPostsPage): GetServerSideProps =>
  async ({ res }: GetServerSidePropsContext) => {
    try {
      const posts = await collectRssFeedPosts(loadPage)
      const rssXml = buildRssFeedXml(posts, {
        siteUrl: CONFIG.link,
        title: CONFIG.blog.title,
        description: CONFIG.blog.description,
        lang: CONFIG.lang,
      })

      res.statusCode = 200
      res.setHeader("Content-Type", RSS_FEED_CONTENT_TYPE)
      res.setHeader("Cache-Control", RSS_SUCCESS_CACHE_CONTROL)
      res.write(rssXml)
      res.end()

      return { props: {} }
    } catch (error) {
      console.error("[rss-feed] collection failed; returning 503", error)

      res.statusCode = 503
      res.setHeader("Retry-After", RSS_FAILURE_RETRY_AFTER_SECONDS)
      res.setHeader("Cache-Control", "no-store")
      res.setHeader("Content-Type", "text/plain; charset=utf-8")
      res.write("Service Unavailable")
      res.end()

      return { props: {} }
    }
  }

export const getServerSideProps = createFeedServerSideProps()

const FeedPage = () => null

export default FeedPage
