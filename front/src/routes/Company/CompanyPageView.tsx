/* eslint-disable @next/next/no-img-element */
import { CONFIG } from "site.config"
import BrandMark from "src/components/branding/BrandMark"
import CompanyCapabilityGlyph from "src/routes/Company/CompanyCapabilityIcon"
import {
  BLOG_URL,
  COMPANY_CAPABILITIES,
  COMPANY_FOOTER_LINK_GROUPS,
  COMPANY_PRODUCT_POINTS,
  COMPANY_PRODUCT_SCOPE_CHIPS,
  COMPANY_SURFACE,
  CONTACT_MAILTO,
  PRODUCT_ROUTE,
  PRODUCT_SCREENSHOT,
  PRODUCT_SCREENSHOT_ALT,
  type CompanyNewsItem,
} from "src/routes/Company/CompanyPageModel"
import * as S from "src/routes/Company/CompanyPage.styles"

/**
 * 회사 표면은 링크가 전부 정적이라 next/link 없이 일반 앵커를 쓴다. 표면 사이 이동은 상대 경로,
 * 블로그와 약관은 절대 URL이다 - 블로그는 자기 canonical을 가진 다른 표면이다.
 * 스크린샷도 next/image를 쓰지 않는다: 이 앱은 전부 native img이고, 랜딩 한 장을 위해 런타임
 * 이미지 최적화 경로를 새로 여는 것은 이 표면이 감당할 이유가 없는 운영 비용이다.
 */
type Props = {
  news: CompanyNewsItem[]
}

/**
 * 소식 섹션은 backend가 응답하지 않거나 글이 0건이면 자리를 채우지 않고 사라진다. 내비 항목은 그
 * 조건을 그대로 따라야 한다 - 섹션 없이 링크만 남으면 '소식' 클릭이 아무 일도 하지 않는 죽은
 * anchor가 된다. 그래서 섹션 id와 내비 href가 같은 상수를 공유한다.
 */
const NEWS_SECTION_ID = "news"

const NAV_ITEMS = [
  { id: "capabilities", label: "역량", href: "#capabilities" },
  { id: "product", label: "제품", href: "#product" },
  { id: NEWS_SECTION_ID, label: "소식", href: `#${NEWS_SECTION_ID}` },
] as const

const visibleNavItems = (hasNews: boolean) =>
  NAV_ITEMS.filter((item) => item.id !== NEWS_SECTION_ID || hasNews)

const CompanyPageView: React.FC<Props> = ({ news }) => (
  <S.CompanySurface>
    <S.SurfaceHeader>
      <S.BrandLink href={COMPANY_SURFACE.route} aria-current="page">
        <BrandMark priority />
        {COMPANY_SURFACE.name}
      </S.BrandLink>
      <S.SurfaceNav aria-label="회사 소개 둘러보기">
        {visibleNavItems(news.length > 0).map((item) => (
          <S.NavLink key={item.id} href={item.href}>
            {item.label}
          </S.NavLink>
        ))}
        <S.NavLink href={BLOG_URL}>기술 블로그</S.NavLink>
      </S.SurfaceNav>
      <S.HeaderAction href={CONTACT_MAILTO}>문의하기</S.HeaderAction>
    </S.SurfaceHeader>

    <main>
      <S.Hero>
        <S.HeroGrid aria-hidden="true">
          {Array.from({ length: 8 }, (_, column) => (
            <span key={`hero-rule-${column}`} />
          ))}
        </S.HeroGrid>
        <S.HeroCopy>
          <S.HeroTitle>
            이동의 <S.HeroAccent>문턱</S.HeroAccent>을 낮추는
            <br />
            소프트웨어를 만듭니다
          </S.HeroTitle>
          <S.HeroLead>
            교통약자가 먼저 쓸 수 있는 길찾기부터 만듭니다. 검증한 데이터와 직접 운영하는 인프라 위에
            제품을 올립니다.
          </S.HeroLead>
          <S.HeroActions>
            <S.PillAction href={PRODUCT_ROUTE}>EasySubway 살펴보기</S.PillAction>
            <S.QuietLink href={BLOG_URL}>기술 블로그</S.QuietLink>
          </S.HeroActions>
        </S.HeroCopy>
        <S.HeroShowcase>
          <img
            src={PRODUCT_SCREENSHOT}
            alt={PRODUCT_SCREENSHOT_ALT}
            width={1080}
            height={2340}
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
          <figcaption>EasySubway · 노선도에서 역을 선택한 화면</figcaption>
        </S.HeroShowcase>
      </S.Hero>

      <S.Section id="capabilities">
        <S.SectionInner>
          <S.SectionLabel>핵심 역량</S.SectionLabel>
          <S.SectionHeading>제품에 실제로 들어간 판단</S.SectionHeading>
          <S.CapabilityGrid>
            {COMPANY_CAPABILITIES.map((capability) => (
              <S.CapabilityCard key={capability.id}>
                <S.CapabilityGlyphPanel>
                  <CompanyCapabilityGlyph name={capability.icon} />
                </S.CapabilityGlyphPanel>
                <S.CapabilityTag>{capability.tag}</S.CapabilityTag>
                <h3>{capability.title}</h3>
                <p>{capability.body}</p>
              </S.CapabilityCard>
            ))}
          </S.CapabilityGrid>
        </S.SectionInner>
      </S.Section>

      <S.Section id="product" $tone="accent">
        <S.SectionInner>
          <S.ProductLayout>
            <div>
              <S.SectionLabel>대표 제품 · EasySubway</S.SectionLabel>
              <S.ProductHeadline>갈 수 있는 길을 먼저 보여주는 지하철</S.ProductHeadline>
              <S.ProductPointList>
                {COMPANY_PRODUCT_POINTS.map((point) => (
                  <div key={point.id}>
                    <dt>{point.keyword}</dt>
                    <dd>{point.body}</dd>
                  </div>
                ))}
              </S.ProductPointList>
              <S.HeroActions $align="start">
                <S.PillAction href={PRODUCT_ROUTE}>EasySubway 자세히 보기</S.PillAction>
              </S.HeroActions>
            </div>
            <S.ProductAside>
              <S.SectionAside>
                수도권 일부 역에서 검증을 진행하는 파일럿 단계입니다. 확인한 범위만 제품에 넣고, 확인
                일자를 함께 남깁니다.
              </S.SectionAside>
              <S.ChipCluster>
                {COMPANY_PRODUCT_SCOPE_CHIPS.map((chip) => (
                  <li key={chip.id}>
                    <S.FactChip $accent={chip.accent}>{chip.label}</S.FactChip>
                  </li>
                ))}
              </S.ChipCluster>
            </S.ProductAside>
          </S.ProductLayout>
        </S.SectionInner>
      </S.Section>

      {news.length > 0 ? (
        <S.Section id={NEWS_SECTION_ID}>
          <S.SectionInner>
            <S.SectionLabel>소식</S.SectionLabel>
            <S.SectionHeading>만들면서 부딪힌 기록</S.SectionHeading>
            <S.NewsList>
              {news.map((item) => (
                <li key={item.id}>
                  <S.NewsLink href={item.href}>
                    <div>
                      <strong>{item.title}</strong>
                      {item.summary ? <span>{item.summary}</span> : null}
                    </div>
                    {item.date ? <time dateTime={item.date.replace(/\./g, "-")}>{item.date}</time> : null}
                  </S.NewsLink>
                </li>
              ))}
            </S.NewsList>
          </S.SectionInner>
        </S.Section>
      ) : null}

      <S.Section>
        <S.ContactBand>
          <div>
            <h2>함께 만들 이야기가 있다면</h2>
            <p>제품 협업, 데이터 검증, 기술 문의를 이 주소로 받습니다.</p>
          </div>
          <S.PillAction href={CONTACT_MAILTO}>{COMPANY_SURFACE.contactEmail}</S.PillAction>
        </S.ContactBand>
      </S.Section>
    </main>

    <S.SurfaceFooter>
      <S.FooterInner>
        <S.FooterBrand>
          <div>
            <BrandMark />
            {COMPANY_SURFACE.name}
          </div>
          <p>이동의 문턱을 낮추는 소프트웨어를 만듭니다.</p>
          <small>© {CONFIG.since} {COMPANY_SURFACE.name}</small>
        </S.FooterBrand>
        {COMPANY_FOOTER_LINK_GROUPS.map((group) => (
          <S.FooterGroup key={group.id} aria-labelledby={`company-footer-${group.id}`}>
            <h2 id={`company-footer-${group.id}`}>{group.title}</h2>
            {group.links.map((link) => (
              <a key={link.label} href={link.href}>
                {link.label}
              </a>
            ))}
          </S.FooterGroup>
        ))}
      </S.FooterInner>
    </S.SurfaceFooter>
  </S.CompanySurface>
)

export default CompanyPageView
