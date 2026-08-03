import { CONFIG } from "site.config"
import { getServerSideSitemap } from "next-sitemap"
import { GetServerSideProps } from "next"
import { isPublicSurfaceHost } from "src/libs/publicSurfaceUrl"
import { buildSitemapFields, collectSitemapPosts } from "src/libs/sitemapPosts"

/**
 * 이 sitemap은 블로그 표면 하나만 설명한다 - `loc`가 전부 `CONFIG.link` 파생이다.
 * 같은 이미지가 회사·제품 호스트도 서빙하므로, 그 호스트에서 이 경로가 200을 내면 한 사이트가
 * 다른 호스트의 URL 목록을 자기 sitemap으로 광고하는 상태가 된다. 그래서 전용 호스트에서는 404다.
 * 그 호스트들의 robots.txt는 Caddy vhost가 응답하며 이 sitemap을 광고하지 않는다.
 */
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const requestHost = ctx.req.headers.host
  if (isPublicSurfaceHost("company", requestHost) || isPublicSurfaceHost("product", requestHost)) {
    return { notFound: true }
  }

  const posts = await collectSitemapPosts()
  const fields = buildSitemapFields(posts, CONFIG.link, `${CONFIG.since}-01-01T00:00:00.000Z`)

  return getServerSideSitemap(ctx, fields)
}

const Sitemap = () => null

export default Sitemap
