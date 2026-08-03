import type { GetServerSideProps } from "next"
import MetaConfig from "src/components/MetaConfig"
import { getPostsBootstrap } from "src/apis/backend/posts"
import { resolvePublicSurfaceUrl } from "src/libs/publicSurfaceUrl"
import CompanyPageView from "src/routes/Company/CompanyPageView"
import {
  BLOG_URL,
  COMPANY_SURFACE,
  toCompanyNewsDate,
  toCompanyNewsIndex,
  toCompanyNewsSummary,
  type CompanyNewsItem,
} from "src/routes/Company/CompanyPageModel"
import type { NextPageWithLayout } from "../../types"

const NEWS_ITEM_COUNT = 3
const CACHE_CONTROL = "public, max-age=0, s-maxage=300, stale-while-revalidate=600"

/**
 * 소식은 선택 섹션이다. 그런데 이 fetch의 서버측 정책 타임아웃은 8초(+전이 실패 재시도 1회)라서,
 * 백엔드가 응답을 늦추면 회사 랜딩의 비캐시 응답 전체가 그만큼 늦어진다. 없어도 되는 섹션 하나가
 * 페이지의 TTFB를 정하는 셈이다. 그래서 페이지가 스스로 짧은 deadline을 걸고, 넘기면 섹션이
 * 사라진 채로(빈 목록) 렌더한다.
 */
const NEWS_DEADLINE_MS = 1_500

/**
 * deadline을 넘겨도 진행 중인 fetch를 취소하지는 않는다. getPostsBootstrap에 signal을 넘기면
 * 서버측 SSR 스냅샷 캐시와 동일 요청 합치기가 함께 꺼져(그 경로는 signal이 없을 때만 쓴다)
 * 요청마다 백엔드를 새로 때린다. 그대로 두면 늦게 도착한 응답이 스냅샷을 채워 다음 요청이 그
 * 값을 즉시 쓴다. 남는 promise가 reject를 던지지 않는 것은 loadCompanyNews가 자기 실패를
 * 이미 빈 목록으로 흡수하기 때문이다.
 */
const withDeadline = async <T,>(work: Promise<T>, deadlineMs: number, onDeadline: T): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(onDeadline), deadlineMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

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
    return bootstrap.posts.slice(0, NEWS_ITEM_COUNT).map((post, position) => ({
      id: post.id,
      index: toCompanyNewsIndex(position),
      title: post.title,
      summary: toCompanyNewsSummary(post.summary),
      date: toCompanyNewsDate(post.modifiedTime || post.createdTime),
      href: `${BLOG_URL}/posts/${post.id}`,
      // 썸네일이 없는 글도 있다. 그 경우 카드 미디어 슬롯은 자리를 채우는 이미지 대신 글 번호를 쓴다.
      thumbnail: post.thumbnail || "",
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
      news: await withDeadline(loadCompanyNews(), NEWS_DEADLINE_MS, []),
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
    <CompanyPageView news={news} surfaceUrl={canonicalUrl} />
  </>
)

export default CompanyPage
