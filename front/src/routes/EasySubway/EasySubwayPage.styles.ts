import styled from "@emotion/styled"
import { breakpoint, editorialLabel, fontWeight, layoutBreakpoint, radius } from "src/design-system/tokens"
import { focusVisibleRing } from "src/design-system/focusRing"
import { colors, variables } from "src/styles"

/**
 * 제품 표면은 사이트 전역 라이트 테마와 무관하게 near-black 다크 톤으로 고정한다. 그래서 테마
 * 객체가 아니라 다크 스케일을 직접 참조한다 - 이 페이지의 색은 방문자 설정이 아니라 제품 정체성이다.
 *
 * 블루는 near-black 위에서 `blue9`도 5.7:1을 넘기므로 인터랙티브 면·강조·수치에 그대로 쓴다.
 * 채운 blue 면 위의 글자는 near-black(`gray1`)이다 - 밝은 블루에 흰 글자를 얹으면 대비가 무너진다.
 * 텍스처·사진·gradient·glow는 쓰지 않는다. 깊이는 gray2/gray3 단색 기하 패널로만 만든다.
 * 그림자는 폰 목업 패널과 stat 카드 두 곳뿐이다.
 */
const c = colors.dark
const CONTENT_MAX_WIDTH = "75rem"
const SECTION_PADDING_Y = "clamp(4rem, 9vw, 9rem)"
const SECTION_PADDING_X = "clamp(1.25rem, 5vw, 3rem)"
const TRANSITION = "160ms ease-out"

export const ProductSurface = styled.div`
  background: ${c.gray1};
  color: ${c.gray12};
  /* 한국어 본문이 단어 중간에서 끊기지 않게 한다. 블로그 타이포에 영향을 주지 않도록 이 표면에만 둔다. */
  word-break: keep-all;
  overflow-wrap: break-word;
`

export const SurfaceHeader = styled.header`
  position: sticky;
  top: 0;
  z-index: ${({ theme }) => theme.zIndexes.header};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 72px;
  padding: 0.75rem ${SECTION_PADDING_X};
  background: ${c.gray1};
  border-bottom: 1px solid ${c.gray3};

  /* 브랜드 + 내비 4개는 좁은 폭에서 한 줄에 들어가지 않는다. 상위 풀블리드 래퍼가 가로 overflow를
     clip하므로 줄바꿈을 허용하지 않으면 우측 링크와 문의 CTA가 스크롤도 못 하는 상태로 잘려 나간다. */
  @media (max-width: ${layoutBreakpoint.navCompact}px) {
    flex-wrap: wrap;
    row-gap: 0.35rem;
  }
`

export const BrandLink = styled.a`
  ${focusVisibleRing};
  display: inline-flex;
  align-items: baseline;
  gap: 0.5rem;
  min-height: 44px;
  border-radius: ${radius.md}px;
  color: ${c.gray12};
  text-decoration: none;
  font-size: 1.06rem;
  font-weight: ${fontWeight.bold};
  letter-spacing: -0.02em;

  small {
    font-size: 0.8rem;
    font-weight: ${fontWeight.regular};
    color: ${c.gray10};

    /* 모바일 헤더는 브랜드명만 남긴다. by-line까지 두면 브랜드가 두 줄로 랩해 헤더 높이가 흔들린다.
       회사 귀속은 footer가 유지하므로 여기서 숨겨도 정보가 사라지지 않는다. */
    @media (max-width: ${breakpoint.sm}px) {
      display: none;
    }
  }
`

export const HeaderLinks = styled.nav`
  display: flex;
  align-items: center;
  gap: 0.25rem;

  /* 좁은 폭에서는 통째로 둘째 줄로 내려가 남은 폭 안에서 랩한다. 가로 스크롤 컨테이너로 만들지
     않는 이유는 문의 CTA가 이 nav 안에 있어서다 - 스크롤이면 CTA가 화면 밖에 주차된 채로도
     "보인다"고 측정되고, 실제로는 아무도 닿지 못한다. */
  @media (max-width: ${layoutBreakpoint.navCompact}px) {
    flex: 1 0 100%;
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
  min-height: 44px;
  padding: 0 0.75rem;
  border-radius: ${radius.md}px;
  color: ${c.gray10};
  text-decoration: none;
  font-size: 0.94rem;
  font-weight: ${fontWeight.regular};
  transition: color ${TRANSITION}, background-color ${TRANSITION};

  &:hover {
    color: ${c.gray12};
    background: ${c.gray3};
  }

  @media (max-width: ${breakpoint.sm}px) {
    padding: 0 0.5rem;
    font-size: 0.88rem;
  }
`

export const PillAction = styled.a`
  ${focusVisibleRing};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 1.5rem;
  border-radius: ${variables.ui.button.radiusPill}px;
  background: ${c.blue9};
  color: ${c.gray1};
  text-decoration: none;
  font-size: 1rem;
  font-weight: ${fontWeight.semibold};
  letter-spacing: -0.01em;
  transition: background-color ${TRANSITION};

  &:hover {
    background: ${c.blue10};
  }
`

export const HeaderAction = styled(PillAction)`
  min-height: 44px;
  padding: 0 1.15rem;
  font-size: 0.92rem;
`

export const StatusPill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.4rem 0.9rem;
  border-radius: ${variables.ui.button.radiusPill}px;
  background: ${c.gray3};
  color: ${c.gray12};
  font-size: 0.86rem;
  font-weight: ${fontWeight.medium};

  &::before {
    content: "";
    width: 0.4rem;
    height: 0.4rem;
    border-radius: ${radius.pill}px;
    background: ${c.blue9};
  }
`

/**
 * 시네마틱 다크 히어로. 폰이 주인공이고 텍스트는 그 위에서 최소로 머문다.
 * 배경 깊이는 크게 겹친 단색 기하 패널 세 장이 만든다 - 텍스처도 사진도 gradient도 쓰지 않는다.
 */
export const Hero = styled.section`
  position: relative;
  overflow: hidden;
  padding: clamp(3rem, 7vw, 6rem) ${SECTION_PADDING_X} 0;
  background: ${c.gray1};
`

export const HeroStage = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;

  span {
    position: absolute;
    display: block;
    border-radius: 2.5rem;
  }

  span:nth-of-type(1) {
    top: -12%;
    left: -8%;
    width: 46%;
    height: 78%;
    background: ${c.gray2};
    transform: rotate(-9deg);
  }

  span:nth-of-type(2) {
    right: -14%;
    bottom: -22%;
    width: 52%;
    height: 86%;
    background: ${c.gray3};
    transform: rotate(7deg);
  }

  span:nth-of-type(3) {
    top: 26%;
    right: 18%;
    width: 22%;
    height: 34%;
    background: ${c.gray2};
    transform: rotate(-16deg);
  }
`

export const HeroCopy = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  width: min(100%, 44rem);
  margin: 0 auto;
  text-align: center;
`

export const HeroTitle = styled.h1`
  margin: 0;
  font-size: clamp(2.25rem, 5.4vw, 3.9rem);
  line-height: 1.1;
  letter-spacing: -0.02em;
  font-weight: ${fontWeight.regular};
  color: ${c.gray10};

  strong {
    display: block;
    font-weight: ${fontWeight.bold};
    color: ${c.gray12};
  }
`

export const HeroLead = styled.p`
  position: relative;
  margin: 0;
  max-width: 30rem;
  font-size: clamp(0.98rem, 1.4vw, 1.08rem);
  line-height: 1.7;
  color: ${c.gray10};
`

/** 본문 안에서 키워드만 blue 틴트 박스로 들어 올린다. */
export const InlineHighlight = styled.strong`
  padding: 0.1rem 0.35rem;
  border-radius: ${radius.sm}px;
  background: ${c.blue3};
  color: ${c.blue11};
  font-weight: ${fontWeight.semibold};
`

/**
 * 폰 목업. 스크린샷은 1080x2340 원본 비율 그대로 들어가고 잘리지 않는다.
 * 기울기는 정적 transform 한 번이며 스크롤 연동 효과는 두지 않는다.
 */
export const PhoneFrame = styled.figure<{ $tilt?: number; $width?: string }>`
  position: relative;
  margin: 0;
  width: min(100%, ${({ $width }) => $width || "19rem"});
  padding: 0.6rem;
  border: 2px solid ${c.gray6};
  border-radius: 2.75rem;
  background: ${c.gray2};
  box-shadow: ${variables.ui.card.shadowFloatingDark};
  transform: rotate(${({ $tilt }) => $tilt ?? 0}deg);

  /* 노치는 단순 pill 하나로만 표현한다. */
  &::before {
    content: "";
    position: absolute;
    top: 1.15rem;
    left: 50%;
    width: 3.5rem;
    height: 0.3rem;
    border-radius: ${radius.pill}px;
    background: ${c.gray6};
    transform: translateX(-50%);
  }

  img {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 2.25rem;
  }
`

export const HeroPhoneWrap = styled.div`
  position: relative;
  display: flex;
  justify-content: center;
  margin-top: clamp(2.5rem, 5vw, 4rem);
  /* 폰 아래쪽이 섹션 밖으로 걸치며 잘리는 구도. */
  margin-bottom: calc(-1 * clamp(4rem, 9vw, 8rem));
`

export const Section = styled.section<{ $tone?: "base" | "raised" }>`
  padding: ${SECTION_PADDING_Y} ${SECTION_PADDING_X};
  background: ${({ $tone }) => ($tone === "raised" ? c.gray2 : c.gray1)};
`

export const SectionInner = styled.div`
  width: min(100%, ${CONTENT_MAX_WIDTH});
  margin: 0 auto;
`

export const Eyebrow = styled.p`
  margin: 0 0 1rem;
  font-family: ${editorialLabel.fontFamily};
  font-size: ${editorialLabel.fontSize};
  font-weight: ${editorialLabel.fontWeight};
  letter-spacing: ${editorialLabel.letterSpacing};
  text-transform: ${editorialLabel.textTransform};
  color: ${c.blue11};
`

/** 혼합 웨이트 디스플레이. 1행은 얇은 gray, 2행은 굵은 white. */
export const DisplayHeading = styled.h2`
  margin: 0;
  max-width: 32rem;
  font-size: clamp(1.9rem, 4vw, 3.1rem);
  line-height: 1.14;
  letter-spacing: -0.02em;
  font-weight: ${fontWeight.regular};
  color: ${c.gray10};

  strong {
    display: block;
    font-weight: ${fontWeight.bold};
    color: ${c.gray12};
  }
`

export const IntroLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.7fr);
  align-items: start;
  gap: clamp(1.5rem, 4vw, 4rem);

  @media (max-width: ${layoutBreakpoint.adminCompact}px) {
    grid-template-columns: minmax(0, 1fr);
  }
`

export const IntroAside = styled.p`
  margin: 0;
  max-width: 22rem;
  font-size: 0.94rem;
  line-height: 1.75;
  color: ${c.gray10};

  strong {
    font-weight: ${fontWeight.semibold};
    color: ${c.gray12};
  }
`

export const MetaFactRow = styled.dl`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1.25rem 1.5rem;
  margin: clamp(2rem, 4vw, 3rem) 0 0;
  padding-top: clamp(1.5rem, 3vw, 2.25rem);
  border-top: 1px solid ${c.gray3};

  dt {
    margin: 0 0 0.5rem;
    font-family: ${editorialLabel.fontFamily};
    font-size: ${editorialLabel.fontSize};
    font-weight: ${editorialLabel.fontWeight};
    letter-spacing: ${editorialLabel.letterSpacing};
    text-transform: ${editorialLabel.textTransform};
    color: ${c.gray10};
  }

  dd {
    margin: 0;
  }

  @media (max-width: ${breakpoint.md}px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`

export const MetaPill = styled.span<{ $accent?: boolean }>`
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 0.85rem;
  border-radius: ${variables.ui.button.radiusPill}px;
  background: ${({ $accent }) => ($accent ? c.blue9 : c.gray3)};
  color: ${({ $accent }) => ($accent ? c.gray1 : c.gray11)};
  font-size: 0.92rem;
  font-weight: ${fontWeight.medium};
`

export const FeatureBlock = styled.div<{ $reverse?: boolean }>`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: clamp(2rem, 5vw, 5rem);
  padding: clamp(2.5rem, 6vw, 5rem) 0;

  > div:last-of-type {
    order: ${({ $reverse }) => ($reverse ? -1 : 0)};
  }

  @media (max-width: ${layoutBreakpoint.adminCompact}px) {
    grid-template-columns: minmax(0, 1fr);

    > div:last-of-type {
      order: 0;
    }
  }
`

/** 거대한 아웃라인 고스트 숫자. 채움 없이 1px stroke만. */
export const GhostIndex = styled.span`
  display: block;
  margin-bottom: -0.35em;
  font-size: clamp(5.5rem, 11vw, 9rem);
  line-height: 1;
  letter-spacing: -0.04em;
  font-weight: ${fontWeight.bold};
  color: transparent;
  -webkit-text-stroke: 1px ${c.gray6};
`

export const FeatureName = styled.h3`
  margin: 0 0 1rem;
  font-size: clamp(1.5rem, 2.8vw, 2rem);
  line-height: 1.25;
  letter-spacing: -0.02em;
  font-weight: ${fontWeight.bold};
  color: ${c.gray12};
`

export const FeatureBody = styled.p`
  margin: 0;
  max-width: 30rem;
  font-size: 1rem;
  line-height: 1.8;
  color: ${c.gray10};
`

/** 스크린샷이 없는 블록의 시각 축. 자리를 채우는 이미지를 만들지 않고 단색 면과 타이포로 만든다. */
export const StatementPanel = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1rem;
  min-height: 16rem;
  padding: clamp(1.75rem, 4vw, 2.75rem);
  border: 1px solid ${c.gray6};
  border-radius: 1.5rem;
  background: ${c.gray2};

  p {
    margin: 0;
    font-size: clamp(1.15rem, 2.2vw, 1.5rem);
    line-height: 1.5;
    letter-spacing: -0.01em;
    font-weight: ${fontWeight.regular};
    color: ${c.gray12};
  }

  span {
    font-family: ${editorialLabel.fontFamily};
    font-size: ${editorialLabel.fontSize};
    font-weight: ${editorialLabel.fontWeight};
    letter-spacing: ${editorialLabel.letterSpacing};
    text-transform: ${editorialLabel.textTransform};
    color: ${c.gray10};
  }
`

export const FeatureStage = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: clamp(1rem, 2vw, 1.75rem);
  padding: clamp(1.25rem, 2.4vw, 1.85rem);
  border-radius: 1.5rem;
  background: ${c.gray2};

  @media (max-width: ${breakpoint.sm}px) {
    flex-direction: column;
    align-items: center;
  }
`

/**
 * 보조 시각으로 쓰는 화면 일부 확대 카드. 전체 화면은 같은 페이지에서 무잘림으로 이미 보여 주므로,
 * 여기서는 `object-fit: cover`로 특정 영역만 크게 띄운다. 캡션이 잘린 컷임을 밝힌다.
 */
export const DetailCrop = styled.figure`
  margin: 0;
  width: min(100%, 26rem);

  > div {
    overflow: hidden;
    aspect-ratio: 4 / 3;
    border: 1px solid ${c.gray6};
    border-radius: 1rem;
    background: ${c.gray3};
  }

  /*
   * object-position 의 세로 값은 캡션이 약속한 영역을 실제로 보여 주기 위한 값이다. 원본
   * 1080x2340에서 역 선택 액션 시트가 세로 51% 지점에 있으므로 그 지점을 중심으로 자른다.
   * 값을 바꾸면 캡션과 화면이 어긋난다.
   */
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: 50% 51%;
  }

  figcaption {
    margin-top: 0.6rem;
    font-size: 0.8rem;
    color: ${c.gray10};
  }
`

/** 섹션 사이 호흡용 풀블리드 브레이크 컷. 사선으로 걸친 폰 하나와 한 줄 텍스트만 둔다. */
/**
 * 섹션 사이 호흡용 풀블리드 브레이크 컷. 공개 가능한 검수본이 한 장뿐이라 폰 컷을 세 번째로
 * 반복하지 않고, 한 줄 진술과 단색 기하 패널만으로 화면을 비운다.
 */
export const BreakCut = styled.section`
  position: relative;
  overflow: hidden;
  padding: clamp(4rem, 9vw, 8rem) ${SECTION_PADDING_X};
  background: ${c.gray1};
  border-top: 1px solid ${c.gray3};
  border-bottom: 1px solid ${c.gray3};

  p {
    position: relative;
    width: min(100%, 34rem);
    margin: 0 0 0 auto;
    text-align: right;
    font-size: clamp(1.35rem, 3vw, 2.25rem);
    line-height: 1.4;
    letter-spacing: -0.02em;
    font-weight: ${fontWeight.regular};
    color: ${c.gray11};
  }

  strong {
    font-weight: ${fontWeight.bold};
    color: ${c.gray12};
  }

  @media (max-width: ${breakpoint.md}px) {
    p {
      margin: 0;
      text-align: left;
    }
  }
`

export const BreakCutStage = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;

  span {
    position: absolute;
    display: block;
    border-radius: 2rem;
    background: ${c.gray2};
  }

  span:nth-of-type(1) {
    top: -18%;
    left: -6%;
    width: 34%;
    height: 96%;
    transform: rotate(-11deg);
  }

  span:nth-of-type(2) {
    bottom: -26%;
    left: 22%;
    width: 24%;
    height: 78%;
    transform: rotate(9deg);
  }
`

export const ScopeLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
  align-items: center;
  gap: clamp(2rem, 5vw, 4rem);
  margin-top: clamp(2rem, 4vw, 3rem);

  @media (max-width: ${layoutBreakpoint.adminCompact}px) {
    grid-template-columns: minmax(0, 1fr);
  }
`

export const ChipCluster = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
`

/** 임팩트용 stat 카드 하나. 큰 radius 단색 blue 면에 실측값만 올린다. */
export const StatCard = styled.div`
  padding: clamp(1.75rem, 4vw, 2.75rem);
  border-radius: 2.5rem;
  background: ${c.blue9};
  color: ${c.gray1};
  box-shadow: ${variables.ui.card.shadowFloatingDark};

  strong {
    display: block;
    font-size: clamp(3rem, 7vw, 4rem);
    line-height: 1;
    letter-spacing: -0.03em;
    font-weight: ${fontWeight.bold};
  }

  span {
    display: block;
    margin-top: 0.85rem;
    max-width: 14rem;
    font-size: 0.98rem;
    line-height: 1.6;
    font-weight: ${fontWeight.medium};
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
  border: 1px solid ${c.gray3};
  border-radius: 1.75rem;
  background: ${c.gray2};

  h2 {
    margin: 0 0 0.6rem;
    font-size: clamp(1.4rem, 2.8vw, 2rem);
    line-height: 1.25;
    letter-spacing: -0.02em;
    font-weight: ${fontWeight.bold};
    color: ${c.gray12};
  }

  p {
    margin: 0;
    max-width: 30rem;
    font-size: 0.96rem;
    line-height: 1.7;
    color: ${c.gray10};
  }
`

export const SurfaceFooter = styled.footer`
  padding: clamp(2.5rem, 5vw, 4rem) ${SECTION_PADDING_X};
  border-top: 1px solid ${c.gray3};
  background: ${c.gray1};
`

export const FooterInner = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.5rem 2.5rem;
  width: min(100%, ${CONTENT_MAX_WIDTH});
  margin: 0 auto;
`

export const FooterBrand = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  strong {
    font-size: 1rem;
    font-weight: ${fontWeight.bold};
    letter-spacing: -0.02em;
    color: ${c.gray12};
  }

  span {
    font-size: 0.9rem;
    color: ${c.gray10};
  }

  small {
    font-size: 0.82rem;
    color: ${c.gray10};
  }
`

export const FooterLinks = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1.25rem;

  a {
    ${focusVisibleRing};
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    border-radius: ${radius.sm}px;
    color: ${c.gray11};
    text-decoration: none;
    font-size: 0.94rem;
    font-weight: ${fontWeight.regular};
    transition: color ${TRANSITION};

    &:hover {
      color: ${c.blue11};
    }
  }
`
