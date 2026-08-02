import type { GetServerSideProps } from "next"
import MetaConfig from "src/components/MetaConfig"
import { getPostsBootstrap } from "src/apis/backend/posts"
import { resolvePublicSurfaceUrl } from "src/libs/publicSurfaceUrl"
import CompanyPageView from "src/routes/Company/CompanyPageView"
import {
  BLOG_URL,
  COMPANY_SURFACE,
  toCompanyNewsDate,
  toCompanyNewsSummary,
  type CompanyNewsItem,
} from "src/routes/Company/CompanyPageModel"
import type { NextPageWithLayout } from "../../types"

const NEWS_ITEM_COUNT = 3
const CACHE_CONTROL = "public, max-age=0, s-maxage=300, stale-while-revalidate=600"

type CompanyPageProps = {
  canonicalUrl: string
  news: CompanyNewsItem[]
}

/**
 * 소식 섹션은 실제 공개 글만 보여준다. 백엔드가 응답하지 않으면 섹션 자체가 사라진다 - 자리를
 * 채우는 카드를 만들지 않는다(placeholder 금지). 회사 표면이 블로그 가용성에 묶이지 않도록
 * 실패를 그대로 빈 목록으로 되돌린다.
 */
const loadCompanyNews = async (): Promise<CompanyNewsItem[]> => {
  try {
    const bootstrap = await getPostsBootstrap({ pageSize: NEWS_ITEM_COUNT })
    return bootstrap.posts.slice(0, NEWS_ITEM_COUNT).map((post) => ({
      id: post.id,
      title: post.title,
      summary: toCompanyNewsSummary(post.summary),
      date: toCompanyNewsDate(post.modifiedTime || post.createdTime),
      href: `${BLOG_URL}/posts/${post.id}`,
    }))
  } catch {
    return []
  }
}

export const getServerSideProps: GetServerSideProps<CompanyPageProps> = async ({ req, res }) => {
  res.setHeader("Cache-Control", CACHE_CONTROL)

  return {
    props: {
      canonicalUrl: resolvePublicSurfaceUrl("company", req.headers.host),
      news: await loadCompanyNews(),
    },
  }
}

const CompanyPage: NextPageWithLayout<CompanyPageProps> = ({ canonicalUrl, news }) => (
  <>
    <MetaConfig
      title={`${COMPANY_SURFACE.name} — 이동의 문턱을 낮추는 소프트웨어`}
      description="Aquila Software는 교통약자가 먼저 쓸 수 있는 길찾기를 만듭니다. 검증한 데이터와 직접 운영하는 인프라 위에 제품을 올립니다."
      type="website"
      url={canonicalUrl}
      canonicalUrl={canonicalUrl}
      siteName={COMPANY_SURFACE.name}
    />
    <CompanyPageView news={news} />
  </>
)

export default CompanyPage
