import { CONFIG } from "site.config"
import { getServerSideSitemap, ISitemapField } from "next-sitemap"
import { GetServerSideProps } from "next"
import { collectSitemapPosts } from "src/libs/sitemapPosts"
import { toCanonicalPostPath } from "src/libs/utils/postPath"

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const posts = await collectSitemapPosts()
  const dynamicPaths = posts.map((post) => `${CONFIG.link}${toCanonicalPostPath(post.id)}`)

  const fields: ISitemapField[] = dynamicPaths.map((path) => ({
    loc: path,
    lastmod: new Date().toISOString(),
    priority: 0.7,
    changefreq: "daily",
  }))

  fields.unshift({
    loc: CONFIG.link,
    lastmod: new Date().toISOString(),
    priority: 1.0,
    changefreq: "daily",
  })

  return getServerSideSitemap(ctx, fields)
}

const Sitemap = () => null

export default Sitemap
