import type { GetServerSideProps, GetServerSidePropsContext } from "next"
import { CONFIG } from "site.config"
import { getFeedPostsPage } from "src/apis/backend/posts"
import {
  buildRssFeedXml,
  collectRssFeedPosts,
  RSS_FEED_CONTENT_TYPE,
  type RssFeedPostPageLoader,
} from "src/libs/rssFeed"

export const createFeedServerSideProps =
  (loadPage: RssFeedPostPageLoader = getFeedPostsPage): GetServerSideProps =>
  async ({ res }: GetServerSidePropsContext) => {
    const posts = await collectRssFeedPosts(loadPage)
    const rssXml = buildRssFeedXml(posts, {
      siteUrl: CONFIG.link,
      title: CONFIG.blog.title,
      description: CONFIG.blog.description,
      lang: CONFIG.lang,
    })

    res.statusCode = 200
    res.setHeader("Content-Type", RSS_FEED_CONTENT_TYPE)
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600")
    res.write(rssXml)
    res.end()

    return { props: {} }
  }

export const getServerSideProps = createFeedServerSideProps()

const FeedPage = () => null

export default FeedPage
