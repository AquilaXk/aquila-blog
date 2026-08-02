import type { GetServerSideProps } from "next"
import MetaConfig from "src/components/MetaConfig"
import { resolvePublicSurfaceUrl } from "src/libs/publicSurfaceUrl"
import EasySubwayPageView from "src/routes/EasySubway/EasySubwayPageView"
import { PRODUCT_SURFACE } from "src/routes/EasySubway/EasySubwayPageModel"
import type { NextPageWithLayout } from "../../types"

const CACHE_CONTROL = "public, max-age=0, s-maxage=300, stale-while-revalidate=600"

type EasySubwayPageProps = {
  canonicalUrl: string
}

export const getServerSideProps: GetServerSideProps<EasySubwayPageProps> = async ({ req, res }) => {
  res.setHeader("Cache-Control", CACHE_CONTROL)

  return {
    props: {
      canonicalUrl: resolvePublicSurfaceUrl("product", req.headers.host),
    },
  }
}

const EasySubwayPage: NextPageWithLayout<EasySubwayPageProps> = ({ canonicalUrl }) => (
  <>
    <MetaConfig
      title={`${PRODUCT_SURFACE.name} — 교통약자를 먼저 생각한 지하철 길찾기`}
      description="계단과 환승 동선을 함께 계산해 끝까지 이동할 수 있는 경로를 먼저 보여줍니다. 수도권 파일럿 범위에서 검증한 역 정보만 담고, Android 출시를 준비하고 있습니다."
      type="website"
      url={canonicalUrl}
      canonicalUrl={canonicalUrl}
      siteName={PRODUCT_SURFACE.name}
    />
    <EasySubwayPageView surfaceUrl={canonicalUrl} />
  </>
)

export default EasySubwayPage
