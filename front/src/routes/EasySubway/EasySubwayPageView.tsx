/* eslint-disable @next/next/no-img-element */
import { CONFIG } from "site.config"
import {
  COMPANY_ROUTE,
  COMPANY_SURFACE,
  CONTACT_MAILTO,
  PRODUCT_FEATURES,
  PRODUCT_FOOTER_LINKS,
  PRODUCT_META_FACTS,
  PRODUCT_RELEASE_STATUS,
  PRODUCT_SCOPE_CHIPS,
  PRODUCT_SCREENSHOT,
  PRODUCT_SCREENSHOT_ALT,
  PRODUCT_SURFACE,
} from "src/routes/EasySubway/EasySubwayPageModel"
import * as S from "src/routes/EasySubway/EasySubwayPage.styles"

/**
 * 공개 가능한 실기기 검수본이 한 장이라, 그 한 장을 hero에서 원본 비율 무잘림으로 한 번, 기능
 * 블록에서 확대 컷으로 한 번만 쓴다. 확대 컷은 캡션으로 잘린 컷임을 밝히고, 나머지 섹션은 단색
 * 패널과 타이포로 구성한다 - 같은 이미지를 세 번째로 반복하거나 자리를 채우는 이미지를 만드는
 * 것보다 정직하고 덜 지루하다.
 */
const [PICK_FEATURE, OFFLINE_FEATURE] = PRODUCT_FEATURES

const EasySubwayPageView: React.FC = () => (
  <S.ProductSurface>
    <S.SurfaceHeader>
      <S.BrandLink href={PRODUCT_SURFACE.route} aria-current="page">
        {PRODUCT_SURFACE.name}
        <small>by {COMPANY_SURFACE.name}</small>
      </S.BrandLink>
      <S.HeaderLinks aria-label="제품 소개 둘러보기">
        <S.NavLink href="#features">기능</S.NavLink>
        <S.NavLink href="#scope">제공 범위</S.NavLink>
        <S.NavLink href={COMPANY_ROUTE}>회사 소개</S.NavLink>
        <S.HeaderAction href={CONTACT_MAILTO}>문의</S.HeaderAction>
      </S.HeaderLinks>
    </S.SurfaceHeader>

    <main>
      <S.Hero>
        <S.HeroStage aria-hidden="true">
          <span />
          <span />
          <span />
        </S.HeroStage>
        <S.HeroCopy>
          <S.StatusPill>{PRODUCT_RELEASE_STATUS}</S.StatusPill>
          <S.HeroTitle>
            갈 수 있는 길을
            <strong>먼저 보여주는 지하철</strong>
          </S.HeroTitle>
          <S.HeroLead>
            계단과 환승 동선을 함께 계산해 <S.InlineHighlight>끝까지 이동할 수 있는 경로</S.InlineHighlight>
            를 먼저 내놓습니다.
          </S.HeroLead>
        </S.HeroCopy>
        <S.HeroPhoneWrap>
          <S.PhoneFrame $tilt={-4} $width="20rem">
            <img
              src={PRODUCT_SCREENSHOT}
              alt={PRODUCT_SCREENSHOT_ALT}
              width={1080}
              height={2340}
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
          </S.PhoneFrame>
        </S.HeroPhoneWrap>
      </S.Hero>

      <S.Section $tone="raised" id="overview">
        <S.SectionInner>
          <S.IntroLayout>
            <div>
              <S.Eyebrow>제품 개요</S.Eyebrow>
              <S.DisplayHeading>
                시간보다 먼저
                <strong>갈 수 있는지 봅니다</strong>
              </S.DisplayHeading>
            </div>
            <S.IntroAside>
              수도권 일부 역에서 검증을 진행하는 파일럿 단계입니다. <strong>확인한 범위</strong>만 제품에
              넣고, 확인 일자를 함께 남깁니다.
            </S.IntroAside>
          </S.IntroLayout>
          <S.MetaFactRow>
            {PRODUCT_META_FACTS.map((fact) => (
              <div key={fact.id}>
                <dt>{fact.label}</dt>
                <dd>
                  <S.MetaPill $accent={fact.accent}>{fact.value}</S.MetaPill>
                </dd>
              </div>
            ))}
          </S.MetaFactRow>
        </S.SectionInner>
      </S.Section>

      <S.Section id="features">
        <S.SectionInner>
          <S.IntroLayout>
            <div>
              <S.Eyebrow>핵심 기능</S.Eyebrow>
              <S.DisplayHeading>
                화면을 늘리는 대신
                <strong>한 화면을 정확하게</strong>
              </S.DisplayHeading>
            </div>
            <S.IntroAside>
              노선도 한 화면에서 <strong>역 선택</strong>과 <strong>경로 지정</strong>이 끝나야 지하에서
              쓸 수 있습니다.
            </S.IntroAside>
          </S.IntroLayout>

          <S.FeatureBlock>
            <div>
              <S.GhostIndex aria-hidden="true">{PICK_FEATURE.index}</S.GhostIndex>
              <S.FeatureName>{PICK_FEATURE.name}</S.FeatureName>
              <S.FeatureBody>
                {PICK_FEATURE.lead} <S.InlineHighlight>{PICK_FEATURE.keyword}</S.InlineHighlight>
                {PICK_FEATURE.tail}
              </S.FeatureBody>
            </div>
            <div>
              <S.FeatureStage>
                <S.DetailCrop>
                  <div>
                    <img
                      src={PRODUCT_SCREENSHOT}
                      alt="노선도에서 역을 선택하면 출발·경유·도착 버튼이 함께 열린 모습."
                      width={1080}
                      height={2340}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <figcaption>노선도 화면 일부 — 역 선택 시 출발·경유·도착 지정</figcaption>
                </S.DetailCrop>
              </S.FeatureStage>
            </div>
          </S.FeatureBlock>

          <S.FeatureBlock $reverse>
            <div>
              <S.GhostIndex aria-hidden="true">{OFFLINE_FEATURE.index}</S.GhostIndex>
              <S.FeatureName>{OFFLINE_FEATURE.name}</S.FeatureName>
              <S.FeatureBody>
                {OFFLINE_FEATURE.lead} <S.InlineHighlight>{OFFLINE_FEATURE.keyword}</S.InlineHighlight>
                {OFFLINE_FEATURE.tail}
              </S.FeatureBody>
            </div>
            <div>
              <S.StatementPanel>
                <span>화면에 적히는 문장</span>
                <p>&ldquo;실시간 정보를 불러오지 못했어요. 역 정보와 경로 검색은 계속 이용할 수 있습니다.&rdquo;</p>
              </S.StatementPanel>
            </div>
          </S.FeatureBlock>
        </S.SectionInner>
      </S.Section>

      <S.BreakCut>
        <S.BreakCutStage aria-hidden="true">
          <span />
          <span />
        </S.BreakCutStage>
        <p>
          연결이 끊기는 곳에서 필요한 정보는, <strong>이미 화면에 있어야 합니다.</strong>
        </p>
      </S.BreakCut>

      <S.Section $tone="raised" id="scope">
        <S.SectionInner>
          <S.Eyebrow>현재 제공 범위</S.Eyebrow>
          <S.DisplayHeading>
            넓히기 전에
            <strong>확인부터 합니다</strong>
          </S.DisplayHeading>
          <S.ScopeLayout>
            <div>
              <S.IntroAside>
                공개 검증을 마친 역만 파일럿 범위에 넣습니다. 범위를 넓히는 일보다{" "}
                <strong>틀린 정보를 내보내지 않는 일</strong>이 먼저입니다.
              </S.IntroAside>
              <S.ChipCluster>
                {PRODUCT_SCOPE_CHIPS.map((chip) => (
                  <li key={chip.id}>
                    <S.MetaPill $accent={chip.accent}>{chip.label}</S.MetaPill>
                  </li>
                ))}
              </S.ChipCluster>
            </div>
            <S.StatCard>
              <strong>2역</strong>
              <span>공개 검증을 마친 파일럿 역 — 4호선 상록수·사당</span>
            </S.StatCard>
          </S.ScopeLayout>
        </S.SectionInner>
      </S.Section>

      <S.Section>
        <S.ContactBand>
          <div>
            <h2>출시 소식과 협업 문의</h2>
            <p>
              {PRODUCT_RELEASE_STATUS}입니다. 공개 다운로드가 열리면 이 페이지에서 안내합니다. 데이터
              검증과 기술 협업 문의도 같은 주소로 받습니다.
            </p>
          </div>
          <S.PillAction href={CONTACT_MAILTO}>{PRODUCT_SURFACE.contactEmail}</S.PillAction>
        </S.ContactBand>
      </S.Section>
    </main>

    <S.SurfaceFooter>
      <S.FooterInner>
        <S.FooterBrand>
          <strong>{PRODUCT_SURFACE.name}</strong>
          <span>교통약자를 먼저 생각한 지하철 길찾기</span>
          <small>
            © {CONFIG.since} {COMPANY_SURFACE.name}
          </small>
        </S.FooterBrand>
        <S.FooterLinks aria-label="제품 관련 링크">
          {PRODUCT_FOOTER_LINKS.map((link) => (
            <a key={link.label} href={link.href}>
              {link.label}
            </a>
          ))}
        </S.FooterLinks>
      </S.FooterInner>
    </S.SurfaceFooter>
  </S.ProductSurface>
)

export default EasySubwayPageView
