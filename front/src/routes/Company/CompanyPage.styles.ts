import styled from "@emotion/styled"
import { breakpoint, editorialLabel, fontWeight, layoutBreakpoint, radius } from "src/design-system/tokens"
import { focusVisibleRing } from "src/design-system/focusRing"
import { colors, variables } from "src/styles"

/**
 * 회사 표면의 시각 정체성은 순백 배경 + 브랜드 블루다. 블루는 기존 blue 스케일 단계만 쓴다.
 *
 * 블루 단계 선택은 색이 아니라 대비가 결정했다.
 * - 채운 컨트롤(pill CTA)은 `blue9`/`blue10` 배경 + `gray12` 글자다. 같은 배경에 흰 글자를 얹으면
 *   대비가 3:1 아래로 떨어져 axe color-contrast가 실패한다(관리자 팔레트에서 이미 실측된 회귀다).
 * - 큰 디스플레이 텍스트(≥24px bold)는 large-text 기준 3:1이 적용되므로 `blue10`을 쓴다.
 * - 본문 크기 텍스트·링크는 `blue11`이다.
 * 배경 층위는 `blue1`~`blue3` 단색 단계이고 gradient·glow·overlay는 쓰지 않는다.
 * 그림자는 hero 플로팅 카드와 제품 스크린샷 패널 두 곳뿐이다.
 */
const CONTENT_MAX_WIDTH = "75rem"
const SECTION_PADDING_Y = "clamp(4rem, 10vw, 10rem)"
const SECTION_PADDING_X = "clamp(1.25rem, 5vw, 3rem)"
const TRANSITION = "150ms ease-out"

/** 다크 footer는 라이트 테마 위에 얹히므로 다크 스케일을 직접 참조한다. */
const darkColors = colors.dark

export const CompanySurface = styled.div`
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  /* 한국어 본문이 단어 중간에서 끊기지 않게 한다. 블로그 타이포에 영향을 주지 않도록 이 표면에만 둔다. */
  word-break: keep-all;
  overflow-wrap: break-word;
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
  background: ${({ theme }) => theme.colors.gray1};
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray4};

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
  color: ${({ theme }) => theme.colors.gray12};
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
    grid-column: 1 / -1;
    justify-content: flex-start;
    margin-left: -0.5rem;
    overflow-x: auto;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }
`

export const NavLink = styled.a<{ $current?: boolean }>`
  ${focusVisibleRing};
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  min-height: 44px;
  padding: 0 0.75rem;
  border-radius: ${radius.md}px;
  color: ${({ theme, $current }) => ($current ? theme.colors.blue11 : theme.colors.gray11)};
  text-decoration: none;
  font-size: 0.94rem;
  font-weight: ${({ $current }) => ($current ? fontWeight.bold : fontWeight.medium)};
  transition: color ${TRANSITION}, background-color ${TRANSITION};

  &:hover {
    color: ${({ theme }) => theme.colors.blue11};
    background: ${({ theme }) => theme.colors.blue2};
  }
`

/** pill CTA. blue9 면 + near-black 글자로 브랜드 블루를 유지하면서 AA 대비를 넘긴다. */
export const PillAction = styled.a`
  ${focusVisibleRing};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 1.5rem;
  border-radius: ${variables.ui.button.radiusPill}px;
  background: ${({ theme }) => theme.colors.blue9};
  color: ${({ theme }) => theme.colors.gray12};
  text-decoration: none;
  font-size: 1rem;
  font-weight: ${fontWeight.bold};
  letter-spacing: -0.01em;
  transition: background-color ${TRANSITION};

  &:hover {
    background: ${({ theme }) => theme.colors.blue10};
  }
`

export const HeaderAction = styled(PillAction)`
  justify-self: end;
  min-height: 44px;
  padding: 0 1.25rem;
  font-size: 0.94rem;
`

export const QuietLink = styled.a`
  ${focusVisibleRing};
  display: inline-flex;
  align-items: center;
  min-height: 48px;
  padding: 0 0.35rem;
  border-radius: ${radius.sm}px;
  color: ${({ theme }) => theme.colors.blue11};
  text-decoration: none;
  font-size: 1rem;
  font-weight: ${fontWeight.semibold};
  transition: color ${TRANSITION};

  &::after {
    content: "→";
    margin-left: 0.35rem;
  }

  &:hover {
    color: ${({ theme }) => theme.colors.blue12};
  }
`

export const Hero = styled.section`
  position: relative;
  padding: clamp(3.5rem, 9vw, 9rem) ${SECTION_PADDING_X} 0;
  text-align: center;
`

/**
 * hero 배경의 옅은 세로 규칙선. gradient 대신 실제 1px 보더를 가진 열로 그린다 —
 * 배경에는 단색만 쓴다는 규칙을 우회하지 않으려는 선택이다.
 */
export const HeroGrid = styled.div`
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  pointer-events: none;

  span {
    border-left: 1px solid ${({ theme }) => theme.colors.gray3};
  }

  span:first-of-type {
    border-left: 0;
  }

  @media (max-width: ${breakpoint.md}px) {
    grid-template-columns: repeat(4, 1fr);
  }
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
  font-size: clamp(2.5rem, 6vw, 4.25rem);
  line-height: 1.1;
  letter-spacing: -0.02em;
  font-weight: ${fontWeight.extraBold};
  color: ${({ theme }) => theme.colors.gray12};
`

export const HeroAccent = styled.em`
  font-style: normal;
  color: ${({ theme }) => theme.colors.blue10};
`

export const HeroLead = styled.p`
  margin: 0;
  max-width: 30rem;
  font-size: clamp(1rem, 1.5vw, 1.12rem);
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.gray11};
`

export const HeroActions = styled.div<{ $align?: "center" | "start" }>`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: ${({ $align }) => ($align === "start" ? "flex-start" : "center")};
  gap: 0.5rem 1rem;
`

/**
 * hero 스크린샷 플로팅 카드. 다음 섹션에 살짝 걸치도록 음수 마진으로 내려 앉힌다.
 * 스크린샷은 1080x2340 원본 비율을 유지하고 잘라내지 않는다.
 */
export const HeroShowcase = styled.figure`
  position: relative;
  margin: clamp(3rem, 6vw, 5rem) auto calc(-1 * clamp(2rem, 5vw, 4rem));
  width: min(100%, 20rem);
  padding: 0.75rem;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 1.5rem;
  background: ${({ theme }) => theme.colors.gray1};
  box-shadow: ${variables.ui.card.shadowFloating};

  img {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 1rem;
    background: ${({ theme }) => theme.colors.blue2};
  }

  figcaption {
    margin-top: 0.75rem;
    font-size: 0.82rem;
    color: ${({ theme }) => theme.colors.gray10};
  }
`

export const Section = styled.section<{ $tone?: "plain" | "accent" }>`
  padding: ${SECTION_PADDING_Y} ${SECTION_PADDING_X};
  background: ${({ theme, $tone }) => ($tone === "accent" ? theme.colors.blue1 : theme.colors.gray1)};
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
  color: ${({ theme }) => theme.colors.blue11};
`

export const SectionHeading = styled.h2`
  margin: 0;
  max-width: 34rem;
  font-size: clamp(1.75rem, 3.4vw, 2.65rem);
  line-height: 1.2;
  letter-spacing: -0.02em;
  font-weight: ${fontWeight.extraBold};
  color: ${({ theme }) => theme.colors.gray12};
`

export const SectionAside = styled.p`
  margin: 0;
  max-width: 22rem;
  font-size: 0.94rem;
  line-height: 1.7;
  color: ${({ theme }) => theme.colors.gray10};
`

export const CapabilityGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(1rem, 2vw, 1.5rem);
  margin-top: clamp(2.25rem, 5vw, 3.5rem);

  @media (max-width: ${layoutBreakpoint.adminCompact}px) {
    grid-template-columns: minmax(0, 1fr);
  }
`

export const CapabilityCard = styled.article`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: clamp(1.25rem, 2.4vw, 1.75rem);
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: ${radius.lg}px;
  background: ${({ theme }) => theme.colors.gray1};
  transition: border-color ${TRANSITION};

  &:hover {
    border-color: ${({ theme }) => theme.colors.gray7};
  }

  h3 {
    margin: 0;
    font-size: 1.25rem;
    line-height: 1.4;
    letter-spacing: -0.01em;
    font-weight: ${fontWeight.bold};
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0;
    font-size: 0.94rem;
    line-height: 1.7;
    color: ${({ theme }) => theme.colors.gray11};
  }
`

export const CapabilityGlyphPanel = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 6.5rem;
  border-radius: ${radius.md}px;
  background: ${({ theme }) => theme.colors.blue2};
  color: ${({ theme }) => theme.colors.blue10};
`

export const CapabilityTag = styled.span`
  align-self: flex-start;
  padding: 0.25rem 0.6rem;
  border-radius: ${variables.ui.button.radiusPill}px;
  background: ${({ theme }) => theme.colors.blue3};
  color: ${({ theme }) => theme.colors.blue11};
  font-family: ${editorialLabel.fontFamily};
  font-size: 11px;
  font-weight: ${editorialLabel.fontWeight};
  letter-spacing: 0.06em;
  text-transform: uppercase;
`

export const ProductLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.75fr);
  align-items: start;
  gap: clamp(2rem, 5vw, 4.5rem);

  @media (max-width: ${layoutBreakpoint.adminCompact}px) {
    grid-template-columns: minmax(0, 1fr);
  }
`

export const ProductHeadline = styled.h2`
  margin: 0 0 1.75rem;
  font-size: clamp(1.85rem, 4vw, 2.9rem);
  line-height: 1.18;
  letter-spacing: -0.02em;
  font-weight: ${fontWeight.extraBold};
  color: ${({ theme }) => theme.colors.gray12};
`

export const ProductPointList = styled.dl`
  margin: 0;

  > div {
    display: grid;
    grid-template-columns: minmax(0, 10rem) minmax(0, 1fr);
    gap: 0.5rem 1.5rem;
    padding: 1.15rem 0;
    border-top: 1px solid ${({ theme }) => theme.colors.gray4};
  }

  > div:last-of-type {
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray4};
  }

  dt {
    margin: 0;
    font-size: 1.06rem;
    font-weight: ${fontWeight.bold};
    letter-spacing: -0.01em;
    color: ${({ theme }) => theme.colors.gray12};
  }

  dd {
    margin: 0;
    font-size: 0.94rem;
    line-height: 1.7;
    color: ${({ theme }) => theme.colors.gray11};
  }

  @media (max-width: ${breakpoint.sm}px) {
    > div {
      grid-template-columns: minmax(0, 1fr);
    }
  }
`

export const ProductAside = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`

/** 제품 섹션 우측 칼럼의 사실 칩. 스크린샷 반복 대신 확인 가능한 범위를 보여 준다. */
export const ChipCluster = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
`

export const FactChip = styled.span<{ $accent?: boolean }>`
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 0.85rem;
  border-radius: ${variables.ui.button.radiusPill}px;
  background: ${({ theme, $accent }) => ($accent ? theme.colors.blue3 : theme.colors.gray3)};
  color: ${({ theme, $accent }) => ($accent ? theme.colors.blue11 : theme.colors.gray11)};
  font-size: 0.9rem;
  font-weight: ${fontWeight.medium};
`

export const NewsList = styled.ol`
  margin: clamp(2rem, 4vw, 3rem) 0 0;
  padding: 0;
  list-style: none;
  counter-reset: company-news;

  li {
    counter-increment: company-news;
    border-top: 1px solid ${({ theme }) => theme.colors.gray4};
  }

  li:last-of-type {
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray4};
  }
`

export const NewsLink = styled.a`
  ${focusVisibleRing};
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 0.35rem 1.5rem;
  padding: 1.35rem 0.35rem;
  border-radius: ${radius.sm}px;
  text-decoration: none;
  transition: background-color ${TRANSITION};

  &:hover {
    background: ${({ theme }) => theme.colors.blue2};
  }

  &:hover strong {
    color: ${({ theme }) => theme.colors.blue11};
  }

  &::before {
    content: counter(company-news, decimal-leading-zero);
    font-family: ${editorialLabel.fontFamily};
    font-size: ${editorialLabel.fontSize};
    font-weight: ${editorialLabel.fontWeight};
    letter-spacing: ${editorialLabel.letterSpacing};
    color: ${({ theme }) => theme.colors.blue10};
  }

  strong {
    display: block;
    font-size: 1.12rem;
    line-height: 1.45;
    letter-spacing: -0.01em;
    font-weight: ${fontWeight.bold};
    color: ${({ theme }) => theme.colors.gray12};
    transition: color ${TRANSITION};
  }

  span {
    display: block;
    margin-top: 0.35rem;
    font-size: 0.92rem;
    line-height: 1.65;
    color: ${({ theme }) => theme.colors.gray10};
  }

  time {
    font-family: ${editorialLabel.fontFamily};
    font-size: 0.78rem;
    color: ${({ theme }) => theme.colors.gray10};
    white-space: nowrap;
  }

  @media (max-width: ${breakpoint.sm}px) {
    grid-template-columns: auto minmax(0, 1fr);

    time {
      grid-column: 2;
    }
  }
`

export const ContactBand = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem 2.5rem;
  width: min(100%, ${CONTENT_MAX_WIDTH});
  margin: 0 auto;
  padding: clamp(1.75rem, 4vw, 3rem);
  border-radius: 1.75rem;
  background: ${({ theme }) => theme.colors.blue3};

  h2 {
    margin: 0 0 0.5rem;
    font-size: clamp(1.4rem, 2.8vw, 2rem);
    line-height: 1.25;
    letter-spacing: -0.02em;
    font-weight: ${fontWeight.extraBold};
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0;
    font-size: 0.98rem;
    line-height: 1.65;
    color: ${({ theme }) => theme.colors.gray11};
  }
`

/** 다크 풀블리드 footer. 라이트 페이지의 마지막 면을 우리 near-black 스케일로 닫는다. */
export const SurfaceFooter = styled.footer`
  padding: clamp(2.75rem, 6vw, 4.5rem) ${SECTION_PADDING_X};
  background: ${darkColors.gray1};
  color: ${darkColors.gray12};
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

  > div > span:first-of-type {
    display: block;
    flex: 0 0 auto;
    width: 32px;
    height: 32px;
  }

  p {
    margin: 0;
    max-width: 22rem;
    font-size: 0.92rem;
    line-height: 1.7;
    color: ${darkColors.gray10};
  }

  small {
    font-size: 0.82rem;
    color: ${darkColors.gray10};
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
    color: ${darkColors.gray10};
  }

  a {
    ${focusVisibleRing};
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    border-radius: ${radius.sm}px;
    color: ${darkColors.gray12};
    text-decoration: none;
    font-size: 0.94rem;
    font-weight: ${fontWeight.medium};
    transition: color ${TRANSITION};

    &:hover {
      color: ${darkColors.blue11};
    }
  }
`
