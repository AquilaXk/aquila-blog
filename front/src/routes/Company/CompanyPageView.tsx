/* eslint-disable @next/next/no-img-element */
import { CONFIG } from "site.config"
import BrandMark from "src/components/branding/BrandMark"
import CompanyFeatureCarousel from "src/routes/Company/CompanyFeatureCarousel"
import CompanyGlyph from "src/routes/Company/CompanyGlyph"
import {
  BLOG_CAPTURE,
  BLOG_CAPTURE_ALT,
  BLOG_CAPTURE_SIZE,
  BLOG_URL,
  COMPANY_FOOTER_LINK_GROUPS,
  COMPANY_NOTICE,
  COMPANY_PRINCIPLES,
  COMPANY_STATS,
  COMPANY_SURFACE,
  COMPANY_WORDMARKS,
  COMPANY_WORK_TILES,
  CONTACT_MAILTO,
  PRODUCT_SCREENSHOT,
  PRODUCT_SCREENSHOT_ALT,
  PRODUCT_SCREENSHOT_SIZE,
  PRODUCT_URL,
  type CompanyNewsItem,
} from "src/routes/Company/CompanyPageModel"
import * as S from "src/routes/Company/CompanyPage.styles"
import * as Sec from "src/routes/Company/CompanySection.styles"

/**
 * 회사 표면은 링크가 전부 정적이라 next/link 없이 일반 앵커를 쓴다. 블로그·제품·약관은 자기
 * canonical을 가진 다른 표면이라 절대 URL로 나간다.
 * 이미지도 next/image를 쓰지 않는다: 이 앱은 전부 native img이고, 랜딩 두 장을 위해 런타임 이미지
 * 최적화 경로를 새로 여는 것은 이 표면이 감당할 이유가 없는 운영 비용이다.
 *
 * 페이지의 주어는 언제나 '회사'다. 제품은 회사가 만드는 것 중 하나로만 등장하고, 기능 서술은
 * 제품 표면이 소유한다.
 */
/**
 * `surfaceUrl`은 요청 호스트로 resolve한 이 표면의 공개 URL이다(페이지의 canonical과 같은 값).
 * 브랜드 셀프 링크에 내부 라우트 `/company`를 쓰면 전용 호스트에서 robots가 disallow한 중복 경로로
 * 방문자를 보낸다 - 그 호스트의 공개 페이지는 루트다.
 */
type Props = {
  news: CompanyNewsItem[]
  surfaceUrl: string
}

/**
 * 소식 섹션은 backend가 응답하지 않거나 글이 0건이면 자리를 채우지 않고 사라진다. 내비 항목은 그
 * 조건을 그대로 따라야 한다 - 섹션 없이 링크만 남으면 '소식' 클릭이 아무 일도 하지 않는 죽은
 * anchor가 된다. 그래서 섹션 id와 내비 href가 같은 상수를 공유한다.
 */
const NEWS_SECTION_ID = "news"

const NAV_ITEMS = [
  { id: "product", label: "제품", href: PRODUCT_URL },
  { id: "capabilities", label: "역량", href: "#capabilities" },
  { id: NEWS_SECTION_ID, label: "소식", href: `#${NEWS_SECTION_ID}` },
  { id: "blog", label: "기술 블로그", href: BLOG_URL },
] as const

const visibleNavItems = (hasNews: boolean) =>
  NAV_ITEMS.filter((item) => item.id !== NEWS_SECTION_ID || hasNews)

const CompanyPageView: React.FC<Props> = ({ news, surfaceUrl }) => (
  <S.CompanySurface>
    <S.NoticeBanner>
      <a href={COMPANY_NOTICE.href}>{COMPANY_NOTICE.label}</a>
    </S.NoticeBanner>

    <S.SurfaceHeader>
      <S.BrandLink href={surfaceUrl} aria-current="page">
        <BrandMark priority />
        {COMPANY_SURFACE.name}
      </S.BrandLink>
      <S.SurfaceNav aria-label="회사 소개 둘러보기">
        {visibleNavItems(news.length > 0).map((item) => (
          <S.NavLink key={item.id} href={item.href}>
            {item.label}
          </S.NavLink>
        ))}
      </S.SurfaceNav>
      <S.HeaderAction href={CONTACT_MAILTO}>문의하기</S.HeaderAction>
    </S.SurfaceHeader>

    <main>
      <S.Hero>
        <S.HeroBackdrop aria-hidden="true">
          <S.HeroGrid>
            {Array.from({ length: 8 }, (_, column) => (
              <span key={`hero-rule-${column}`} />
            ))}
          </S.HeroGrid>
          <S.HeroEllipse $side="left" />
          <S.HeroEllipse $side="right" />
        </S.HeroBackdrop>
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
          <S.PillAction href={PRODUCT_URL}>EasySubway 살펴보기</S.PillAction>
        </S.HeroCopy>
        <S.HeroShowcase>
          <S.ShowcaseChrome aria-hidden="true">
            <span />
            <span />
            <span />
          </S.ShowcaseChrome>
          <S.ShowcaseCapture>
            <img
              src={BLOG_CAPTURE}
              alt={BLOG_CAPTURE_ALT}
              width={BLOG_CAPTURE_SIZE.width}
              height={BLOG_CAPTURE_SIZE.height}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              data-ui="company-hero-capture"
            />
          </S.ShowcaseCapture>
          <S.ShowcasePhone>
            <img
              src={PRODUCT_SCREENSHOT}
              alt={PRODUCT_SCREENSHOT_ALT}
              width={PRODUCT_SCREENSHOT_SIZE.width}
              height={PRODUCT_SCREENSHOT_SIZE.height}
              loading="lazy"
              decoding="async"
              data-ui="company-hero-phone"
            />
          </S.ShowcasePhone>
        </S.HeroShowcase>
      </S.Hero>

      <Sec.WordmarkStrip>
        <Sec.WordmarkLabel>우리가 만들고 운영하는 것들</Sec.WordmarkLabel>
        <Sec.WordmarkRow>
          {COMPANY_WORDMARKS.map((wordmark) => (
            <li key={wordmark.id}>{wordmark.label}</li>
          ))}
        </Sec.WordmarkRow>
      </Sec.WordmarkStrip>

      <S.Section id="capabilities">
        <S.SectionInner>
          <Sec.CarouselHead>
            <div>
              <S.SectionLabel>핵심 역량</S.SectionLabel>
              <S.SectionHeading>제품에 실제로 들어간 판단</S.SectionHeading>
            </div>
            <S.SectionAside>
              카드마다 지금 코드와 운영에 있는 것만 적었습니다. 좌우로 넘겨 볼 수 있습니다.
            </S.SectionAside>
          </Sec.CarouselHead>
          <CompanyFeatureCarousel />
        </S.SectionInner>
      </S.Section>

      <S.Section id="work" $tone="scaffold">
        <S.SectionInner>
          <Sec.WorkHeading>회사가 지금 만들고 운영하는 것</Sec.WorkHeading>
          <Sec.WorkGrid>
            {COMPANY_WORK_TILES.map((tile, position) => (
              <Sec.WorkTile key={tile.id} $alternate={position % 2 === 1}>
                <span>
                  <CompanyGlyph name={tile.glyph} size={96} />
                </span>
                <span>{tile.label}</span>
              </Sec.WorkTile>
            ))}
          </Sec.WorkGrid>
        </S.SectionInner>
      </S.Section>

      <S.Section id="approach">
        <S.SectionInner>
          <Sec.StoryLayout>
            <div>
              <S.SectionLabel>회사 소개</S.SectionLabel>
              <Sec.StoryHeadline>
                작은 팀이
                <strong>끝까지 봅니다</strong>
              </Sec.StoryHeadline>
            </div>
            <S.SectionAside>
              설계부터 배포와 운영까지 같은 사람이 봅니다. 넘기는 단계가 없으니 틀린 것을 늦게 알지
              않습니다.
            </S.SectionAside>
          </Sec.StoryLayout>
          <Sec.StatList>
            {COMPANY_STATS.map((stat) => (
              <div key={stat.id}>
                <dt>{stat.value}</dt>
                <dd>{stat.label}</dd>
              </div>
            ))}
          </Sec.StatList>
        </S.SectionInner>
      </S.Section>

      <S.Section $tone="chrome">
        <S.SectionInner>
          <S.SectionLabel>일하는 방식</S.SectionLabel>
          <S.SectionHeading>먼저 확인하고, 그다음 공개합니다</S.SectionHeading>
          <Sec.PrincipleList>
            {COMPANY_PRINCIPLES.map((principle) => (
              <li key={principle}>
                <span>
                  <CompanyGlyph name="check" size={24} />
                </span>
                {principle}
              </li>
            ))}
          </Sec.PrincipleList>
        </S.SectionInner>
      </S.Section>

      {news.length > 0 ? (
        <S.Section id={NEWS_SECTION_ID}>
          <S.SectionInner>
            <S.SectionLabel>소식</S.SectionLabel>
            <S.SectionHeading>만들면서 남긴 기록</S.SectionHeading>
            <Sec.NewsGrid>
              {news.map((item) => (
                <li key={item.id}>
                  <Sec.NewsCard href={item.href}>
                    <Sec.NewsMedia>
                      {item.thumbnail ? (
                        <img src={item.thumbnail} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <span aria-hidden="true">{item.index}</span>
                      )}
                    </Sec.NewsMedia>
                    {item.date ? (
                      <time dateTime={item.date.replace(/\./g, "-")}>{item.date}</time>
                    ) : null}
                    <strong>{item.title}</strong>
                    {item.summary ? <p>{item.summary}</p> : null}
                  </Sec.NewsCard>
                </li>
              ))}
            </Sec.NewsGrid>
          </S.SectionInner>
        </S.Section>
      ) : null}

      <S.Section>
        <Sec.ContactBand>
          <div>
            <h2>함께 만들 이야기가 있다면</h2>
            <p>제품 협업, 데이터 검증, 기술 문의를 이 주소로 받습니다.</p>
          </div>
          <S.PillAction href={CONTACT_MAILTO}>{COMPANY_SURFACE.contactEmail}</S.PillAction>
        </Sec.ContactBand>
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
          <small>
            © {CONFIG.since} {COMPANY_SURFACE.name}
          </small>
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
