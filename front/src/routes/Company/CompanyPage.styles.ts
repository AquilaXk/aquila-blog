import styled from "@emotion/styled"
import { breakpoint, editorialLabel, fontWeight, layoutBreakpoint, radius } from "src/design-system/tokens"
import { focusVisibleRing } from "src/design-system/focusRing"
import { marketingDark as dark, marketingLight as light } from "src/design-system/marketingPalette"
import { variables } from "src/styles"

/**
 * 회사 표면의 chrome(공지 스트립 · 헤더 · 히어로 · footer)과 섹션 공통 프리미티브.
 * 섹션별 레이아웃은 `CompanySection.styles.ts`에 있다.
 *
 * 이 표면은 방문자 테마와 무관하게 라이트로 고정한다 - 회사 사이트의 화이트 헤더는 브랜드
 * 정체성이지 사용자 설정이 아니다. 그래서 Emotion 테마가 아니라 마케팅 팔레트를 직접 참조한다.
 * 색·대비 근거는 `src/design-system/marketingPalette.ts` 주석에 있다.
 *
 * 배경 장식(세로 그리드 라인 + 양측 소프트 일립스)은 오너가 마케팅 표면 한정으로 승인한
 * gradient 예외다(2026-08-02). 블로그·관리자 표면에는 적용하지 않는다.
 * 그림자는 히어로 플로팅 카드와 그 위 폰 목업 두 곳뿐이다.
 */
export const CONTENT_MAX_WIDTH = "75rem"
export const SECTION_PADDING_Y = "clamp(4.5rem, 10vw, 10rem)"
export const SECTION_PADDING_X = "clamp(1.25rem, 5vw, 3rem)"
export const TRANSITION = "160ms ease-out"

export const CompanySurface = styled.div`
  /* 이 표면 안의 focus ring은 브랜드 focus 색을 쓴다(정본 semantic focus.default). */
  --aq-focus-ring: ${light.focus};
  background: ${light.surface};
  color: ${light.inkPrimary};
  /* 한국어 본문이 단어 중간에서 끊기지 않게 한다. 블로그 타이포에 영향을 주지 않도록 이 표면에만 둔다. */
  word-break: keep-all;
  overflow-wrap: break-word;
`

/**
 * 헤더 위 공지 스트립. 채운 accent 면이라 focus ring을 그 위에서 보이는 색으로 바꾼다 -
 * 기본 ring 색이 배경과 같은 값이면 키보드 위치가 사라진다.
 */
export const NoticeBanner = styled.div`
  --aq-focus-ring: ${light.onAccent};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 ${SECTION_PADDING_X};
  background: ${light.accent};
  text-align: center;

  a {
    ${focusVisibleRing};
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 0.35rem;
    border-radius: ${radius.sm}px;
    color: ${light.onAccent};
    font-size: 0.9rem;
    font-weight: ${fontWeight.medium};
    text-decoration: underline;
    text-underline-offset: 3px;
  }
`

export const SurfaceHeader = styled.header`
  position: sticky;
  top: 0;
  z-index: ${({ theme }) => theme.zIndexes.header};
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 1rem;
  min-height: 72px;
  padding: 0.75rem ${SECTION_PADDING_X};
  background: ${light.surface};
  border-bottom: 1px solid ${light.border};

  /* 좁은 폭에서는 내비가 통째로 둘째 줄로 내려가 남은 폭 안에서 랩한다. 가로 스크롤 컨테이너로
     만들면 항목이 화면 밖에 주차된 채로도 "보인다"고 측정된다. */
  @media (max-width: ${layoutBreakpoint.navCompact}px) {
    grid-template-columns: minmax(0, 1fr) auto;
    row-gap: 0.35rem;
  }
`

export const BrandLink = styled.a`
  ${focusVisibleRing};
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  justify-self: start;
  min-height: 44px;
  padding-right: 0.35rem;
  border-radius: ${radius.md}px;
  color: ${light.inkPrimary};
  text-decoration: none;
  font-size: 1.06rem;
  font-weight: ${fontWeight.extraBold};
  letter-spacing: -0.02em;

  > span:first-of-type {
    display: block;
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
  }
`

export const SurfaceNav = styled.nav`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;

  @media (max-width: ${layoutBreakpoint.navCompact}px) {
    grid-row: 2;
    grid-column: 1 / -1;
    flex-wrap: wrap;
    justify-content: flex-start;
    margin-left: -0.5rem;
    row-gap: 0.25rem;
  }
`

export const NavLink = styled.a`
  ${focusVisibleRing};
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  min-height: 44px;
  padding: 0 0.75rem;
  border-radius: ${radius.md}px;
  color: ${light.inkSecondary};
  text-decoration: none;
  font-size: 0.94rem;
  font-weight: ${fontWeight.medium};
  transition: color ${TRANSITION}, background-color ${TRANSITION};

  &:hover {
    color: ${light.onSignature};
    background: ${light.surfaceBrand};
  }
`

/** pill CTA. accent 면 + 흰 글자가 정본 contrastPairs의 primary-action 조합이다. */
export const PillAction = styled.a`
  ${focusVisibleRing};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 1.5rem;
  border-radius: ${variables.ui.button.radiusPill}px;
  background: ${light.accent};
  color: ${light.onAccent};
  text-decoration: none;
  font-size: 1rem;
  font-weight: ${fontWeight.bold};
  letter-spacing: -0.01em;
  transition: background-color ${TRANSITION};

  &:hover {
    background: ${light.accentPressed};
  }
`

/** 좁은 폭에서도 브랜드와 같은 줄에 남는다 - 내비만 둘째 줄로 내려간다. */
export const HeaderAction = styled(PillAction)`
  justify-self: end;
  min-height: 44px;
  padding: 0 1.25rem;
  font-size: 0.94rem;

  @media (max-width: ${layoutBreakpoint.navCompact}px) {
    grid-row: 1;
    grid-column: 2;
  }
`

export const Hero = styled.section`
  position: relative;
  padding: clamp(4rem, 9.5vw, 9.5rem) ${SECTION_PADDING_X} 0;
  text-align: center;
`

/**
 * 히어로 배경. 옅은 세로 그리드는 실제 1px 보더를 가진 열로 그리고, 양측 소프트 일립스는 승인된
 * gradient 예외다. 일립스가 섹션 밖으로 새지 않도록 clip은 이 래퍼가 담당한다 - 히어로 자신에
 * `overflow: hidden`을 걸면 다음 섹션에 걸치는 플로팅 카드가 잘린다.
 */
export const HeroBackdrop = styled.div`
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
`

export const HeroGrid = styled.div`
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(8, 1fr);

  span {
    border-left: 1px solid ${light.border};
  }

  span:first-of-type {
    border-left: 0;
  }

  @media (max-width: ${breakpoint.md}px) {
    grid-template-columns: repeat(4, 1fr);
  }
`

export const HeroEllipse = styled.span<{ $side: "left" | "right" }>`
  position: absolute;
  top: ${({ $side }) => ($side === "left" ? "2%" : "16%")};
  ${({ $side }) => ($side === "left" ? "left: -14%;" : "right: -12%;")}
  width: ${({ $side }) => ($side === "left" ? "42%" : "48%")};
  height: ${({ $side }) => ($side === "left" ? "58%" : "66%")};
  background: radial-gradient(closest-side, ${light.surfaceBrandStrong}, transparent);
`

export const HeroCopy = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  width: min(100%, 52rem);
  margin: 0 auto;
`

export const HeroTitle = styled.h1`
  margin: 0;
  font-size: clamp(2.1rem, 6vw, 4.25rem);
  line-height: 1.1;
  letter-spacing: -0.02em;
  font-weight: ${fontWeight.extraBold};
  color: ${light.inkPrimary};
`

export const HeroAccent = styled.em`
  font-style: normal;
  color: ${light.accentText};
`

export const HeroLead = styled.p`
  margin: 0;
  max-width: 34rem;
  font-size: clamp(1rem, 1.5vw, 1.12rem);
  line-height: 1.6;
  color: ${light.inkSecondary};
`

/**
 * 와이드 플로팅 제품 카드. 뷰포트 62% 폭(1440에서 896px)이고 하단이 다음 섹션에 걸친다.
 * 카드 안의 컷은 라이브 블로그 홈 캡처이며 폰 목업이 우하단에 겹친다.
 */
export const HeroShowcase = styled.figure`
  position: relative;
  z-index: 1;
  margin: clamp(3rem, 5.5vw, 4.5rem) auto calc(-1 * clamp(3rem, 6vw, 5.5rem));
  width: min(100%, 56rem);
  padding: 0.75rem;
  border: 1px solid ${light.border};
  border-radius: 1rem;
  background: ${light.surface};
  box-shadow: ${variables.ui.card.shadowFloating};
`

/** 브라우저 프레임 상단 바. 단색 원 세 개만 두고 텍스처를 만들지 않는다. */
export const ShowcaseChrome = styled.div`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.1rem 0.35rem 0.6rem;

  span {
    display: block;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: ${radius.pill}px;
    background: ${light.border};
  }
`

export const ShowcaseCapture = styled.div`
  overflow: hidden;
  border-radius: 0.5rem;
  background: ${light.surfaceSubtle};

  img {
    display: block;
    width: 100%;
    height: auto;
  }
`

/**
 * 카드 위에 겹치는 소형 폰. 스크린샷은 1080x2340 원본 비율 그대로다.
 * 가로 오프셋은 카드 안에 두고 아래로만 걸치게 한다 - 좁은 폭에서 가로 넘침을 만들지 않기 위한
 * 제약이다.
 */
export const ShowcasePhone = styled.div`
  position: absolute;
  right: clamp(0.75rem, 3vw, 2rem);
  bottom: calc(-1 * clamp(1rem, 3vw, 2.5rem));
  width: clamp(4.5rem, 11vw, 9rem);
  padding: 0.3rem;
  border: 1px solid ${dark.hairline};
  border-radius: 1.15rem;
  background: ${dark.field};
  box-shadow: ${variables.ui.card.shadowFloating};

  img {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 0.9rem;
  }
`

export const Section = styled.section<{ $tone?: "plain" | "scaffold" | "chrome" }>`
  position: relative;
  padding: ${SECTION_PADDING_Y} ${SECTION_PADDING_X};
  background: ${({ $tone }) => {
    if ($tone === "scaffold") return light.surfaceScaffold
    if ($tone === "chrome") return light.surfaceBrandChrome
    return light.surface
  }};
`

export const SectionInner = styled.div`
  width: min(100%, ${CONTENT_MAX_WIDTH});
  margin: 0 auto;
`

export const SectionLabel = styled.p`
  margin: 0 0 1rem;
  font-family: ${editorialLabel.fontFamily};
  font-size: ${editorialLabel.fontSize};
  font-weight: ${editorialLabel.fontWeight};
  letter-spacing: ${editorialLabel.letterSpacing};
  text-transform: ${editorialLabel.textTransform};
  color: ${light.accentText};
`

export const SectionHeading = styled.h2`
  margin: 0;
  max-width: 34rem;
  font-size: clamp(1.75rem, 3.4vw, 2.65rem);
  line-height: 1.2;
  letter-spacing: -0.02em;
  font-weight: ${fontWeight.extraBold};
  color: ${light.inkPrimary};
`

export const SectionAside = styled.p`
  margin: 0;
  max-width: 24rem;
  font-size: 0.94rem;
  line-height: 1.75;
  color: ${light.inkSecondary};
`

/** 다크 풀블리드 footer. 라이트 페이지의 마지막 면을 제품 표면과 같은 인디고-블랙으로 닫는다. */
export const SurfaceFooter = styled.footer`
  padding: clamp(2.75rem, 6vw, 4.5rem) ${SECTION_PADDING_X};
  background: ${dark.field};
  color: ${dark.textPrimary};
`

export const FooterInner = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) repeat(2, minmax(0, 0.6fr));
  gap: clamp(1.75rem, 4vw, 3.5rem);
  width: min(100%, ${CONTENT_MAX_WIDTH});
  margin: 0 auto;

  @media (max-width: ${breakpoint.md}px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`

export const FooterBrand = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;

  @media (max-width: ${breakpoint.md}px) {
    grid-column: 1 / -1;
  }

  > div {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 1.02rem;
    font-weight: ${fontWeight.extraBold};
    letter-spacing: -0.02em;
  }

  /* 마스코트는 어두운 실루엣이라 다크 면에 그대로 얹으면 사라진다. 밝은 원판 위에 올린다. */
  > div > span:first-of-type {
    display: block;
    flex: 0 0 auto;
    width: 34px;
    height: 34px;
    padding: 3px;
    border-radius: ${radius.pill}px;
    background: ${light.surface};
  }

  p {
    margin: 0;
    max-width: 22rem;
    font-size: 0.92rem;
    line-height: 1.7;
    color: ${dark.textSecondary};
  }

  small {
    font-size: 0.82rem;
    color: ${dark.textMuted};
  }
`

export const FooterGroup = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 0.15rem;

  h2 {
    margin: 0 0 0.35rem;
    font-family: ${editorialLabel.fontFamily};
    font-size: ${editorialLabel.fontSize};
    font-weight: ${editorialLabel.fontWeight};
    letter-spacing: ${editorialLabel.letterSpacing};
    text-transform: ${editorialLabel.textTransform};
    color: ${dark.textMuted};
  }

  a {
    ${focusVisibleRing};
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    border-radius: ${radius.sm}px;
    color: ${dark.textPrimary};
    text-decoration: none;
    font-size: 0.94rem;
    font-weight: ${fontWeight.medium};
    transition: color ${TRANSITION};

    &:hover {
      color: ${dark.signature};
    }
  }
`
