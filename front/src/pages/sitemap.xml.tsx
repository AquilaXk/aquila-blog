import { CONFIG } from "site.config"
import { getServerSideSitemap } from "next-sitemap"
import { GetServerSideProps } from "next"
import { buildSitemapFields, collectSitemapPosts } from "src/libs/sitemapPosts"

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const posts = await collectSitemapPosts()
  const fields = buildSitemapFields(posts, CONFIG.link, `${CONFIG.since}-01-01T00:00:00.000Z`)

  return getServerSideSitemap(ctx, fields)
}

const Sitemap = () => null

export default Sitemap
