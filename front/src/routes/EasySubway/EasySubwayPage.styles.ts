import styled from "@emotion/styled"
import { breakpoint, editorialLabel, fontWeight, layoutBreakpoint, radius } from "src/design-system/tokens"
import { focusVisibleRing } from "src/design-system/focusRing"
import { marketingDark as dark } from "src/design-system/marketingPalette"
import { variables } from "src/styles"

/**
 * 제품 표면은 방문자 테마와 무관하게 인디고-블랙 다크로 고정한다 - 이 페이지의 색은 사용자 설정이
 * 아니라 제품 정체성이다. 색·대비 근거는 `src/design-system/marketingPalette.ts` 주석에 있다.
 *
 * 배경은 한 세계로 읽혀야 한다. 그래서 층위를 세 가지 장치로만 만든다:
 * 1) 필드 세 단계(`fieldDeep` / `field` / `fieldRaised`)의 섹션 명도 교대 + hairline 구획선
 * 2) 좌우에서 중앙으로 좁아지는 깊이 형상 두 장(터널 구도) - 회전한 라운드 사각형(블롭)은 쓰지 않는다
 * 3) 추상 노선도 라인 아트(별도 컴포넌트, 저대비)
 * 히어로 폰 뒤 저강도 radial 광원 하나는 오너가 마케팅 표면 한정으로 승인한 gradient 예외다
 * (2026-08-02). 보조 광원은 두지 않는다.
 *
 * 그림자는 폰 목업과 stat 카드 두 곳뿐이다.
 *
 * 타이포 하한(상용 마케팅 기준, 2026-08-03): 본문·설명·내비·CTA는 1rem 이상, 히어로 서브와 기능
 * 본문은 1.0625~1.125rem, 캡션·저작권 같은 보조 텍스트는 0.875rem 이상, 한국어 본문 line-height는
 * 1.6~1.7이다. 예외는 대문자 + letter-spacing으로 읽는 editorial 라벨(eyebrow·메타 라벨)뿐이며 그
 * 값은 `editorialLabel` 토큰이 소유한다.
 */
const CONTENT_MAX_WIDTH = "75rem"
const SECTION_PADDING_Y = "clamp(4rem, 9vw, 9rem)"
const SECTION_PADDING_X = "clamp(1.25rem, 5vw, 3rem)"
const TRANSITION = "160ms ease-out"

export const ProductSurface = styled.div`
  background: ${dark.field};
  color: ${dark.textPrimary};
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
  background: ${dark.fieldDeep};
  border-bottom: 1px solid ${dark.hairline};

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
  color: ${dark.textPrimary};
  text-decoration: none;
  font-size: 1.06rem;
  font-weight: ${fontWeight.bold};
  letter-spacing: -0.02em;

  small {
    font-size: 0.875rem;
    font-weight: ${fontWeight.regular};
    color: ${dark.textMuted};

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
  color: ${dark.textSecondary};
  text-decoration: none;
  font-size: 1rem;
  font-weight: ${fontWeight.regular};
  transition: color ${TRANSITION}, background-color ${TRANSITION};

  &:hover {
    color: ${dark.textPrimary};
    background: ${dark.fieldRaised};
  }

  /* 좁은 폭에서는 글자를 줄이지 않고 좌우 패딩만 좁힌다 - 내비는 이미 둘째 줄에서 랩한다. */
  @media (max-width: ${breakpoint.sm}px) {
    padding: 0 0.5rem;
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
  background: ${dark.accent};
  color: ${dark.onAccent};
  text-decoration: none;
  font-size: 1rem;
  font-weight: ${fontWeight.semibold};
  letter-spacing: -0.01em;
  transition: background-color ${TRANSITION};

  &:hover {
    background: ${dark.accentPressed};
  }
`

/** 글자 크기는 줄이지 않고 `PillAction`의 1rem을 그대로 쓴다. 높이·패딩만 좁힌다. */
export const HeaderAction = styled(PillAction)`
  min-height: 44px;
  padding: 0 1.15rem;
`

export const StatusPill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.4rem 0.9rem;
  border-radius: ${variables.ui.button.radiusPill}px;
  background: ${dark.fieldRaised};
  color: ${dark.textPrimary};
  font-size: 0.9375rem;
  font-weight: ${fontWeight.medium};

  &::before {
    content: "";
    width: 0.4rem;
    height: 0.4rem;
    border-radius: ${radius.pill}px;
    background: ${dark.signature};
  }
`

/**
 * 시네마틱 다크 히어로. 폰이 주인공이고 텍스트는 그 위에서 최소로 머문다.
 * 가장 어두운 필드 단계를 쓰고 층위는 아래 무대 장치들이 만든다.
 */
export const Hero = styled.section`
  position: relative;
  overflow: hidden;
  padding: clamp(3rem, 7vw, 6rem) ${SECTION_PADDING_X} 0;
  background: ${dark.fieldDeep};
`

/**
 * 히어로 무대. 좌우에서 중앙으로 좁아지는 깊이 형상 두 장이 터널 구도를 만들고, 그 사이 중앙에
 * 폰 뒤로 들어가는 저강도 radial 광원 하나를 둔다.
 */
export const HeroStage = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;

  /* 좌측 벽: 왼쪽 끝은 화면 높이를 다 쓰고 중앙으로 갈수록 좁아진다. */
  span:nth-of-type(1) {
    position: absolute;
    inset: 0 62% 0 0;
    background: ${dark.field};
    clip-path: polygon(0 0, 100% 26%, 100% 76%, 0 100%);
  }

  /* 우측 벽: 좌측의 거울상이되 비대칭이 남게 비율을 다르게 잡는다. */
  span:nth-of-type(2) {
    position: absolute;
    inset: 0 0 0 58%;
    background: ${dark.field};
    clip-path: polygon(100% 0, 0 20%, 0 82%, 100% 100%);
  }

  /* 폰 뒤 광원 하나. 승인된 gradient 예외이며 세기는 필드 한 단계 밝기까지만 올린다. */
  span:nth-of-type(3) {
    position: absolute;
    top: 22%;
    left: 50%;
    width: min(46rem, 92%);
    height: 62%;
    background: radial-gradient(closest-side, ${dark.hairline}, transparent);
    transform: translateX(-50%);
  }
`

/** 배경 노선도 라인 아트를 담는 층. 텍스트보다 뒤, 무대 형상보다 앞이다. */
export const LineArtLayer = styled.div<{ $align?: "top" | "bottom" }>`
  position: absolute;
  right: 0;
  left: 0;
  ${({ $align }) => ($align === "bottom" ? "bottom: 0;" : "top: 0;")}
  height: clamp(14rem, 34vw, 26rem);
  pointer-events: none;
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
  font-size: clamp(2.1rem, 5.4vw, 3.9rem);
  line-height: 1.1;
  letter-spacing: -0.02em;
  font-weight: ${fontWeight.regular};
  color: ${dark.textMuted};

  strong {
    display: block;
    font-weight: ${fontWeight.bold};
    color: ${dark.textPrimary};
  }
`

export const HeroLead = styled.p`
  position: relative;
  margin: 0;
  max-width: 30rem;
  font-size: clamp(1.0625rem, 1.5vw, 1.125rem);
  line-height: 1.7;
  color: ${dark.textSecondary};
`

/** 본문 안에서 키워드만 인디고 틴트 박스로 들어 올린다. */
export const InlineHighlight = styled.strong`
  padding: 0.1rem 0.35rem;
  border-radius: ${radius.sm}px;
  background: ${dark.hairline};
  color: ${dark.textPrimary};
  font-weight: ${fontWeight.semibold};
`

/**
 * 폰 목업. 스크린샷은 1080x2340 원본 비율 그대로 들어가고 잘리지 않는다.
 * 기울기는 정적 transform 한 번이며 스크롤 연동 효과는 두지 않는다.
 */
export const PhoneFrame = styled.figure<{ $tilt?: number; $width?: string }>`
  position: relative;
  margin: 0;
  /* 좁은 폭에서도 무대 여백이 남게 컨테이너를 다 채우지 않는다. */
  width: min(94%, ${({ $width }) => $width || "19rem"});
  padding: 0.6rem;
  border: 2px solid ${dark.borderStrong};
  border-radius: 2.75rem;
  background: ${dark.fieldDeep};
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
    background: ${dark.borderStrong};
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

/**
 * 섹션 명도 교대. `base`와 `raised`를 번갈아 쓰고 경계마다 hairline을 둬서 한 세계 안에서 층이
 * 바뀐 것처럼 읽히게 한다.
 */
export const Section = styled.section<{ $tone?: "base" | "raised" }>`
  position: relative;
  overflow: hidden;
  padding: ${SECTION_PADDING_Y} ${SECTION_PADDING_X};
  background: ${({ $tone }) => ($tone === "raised" ? dark.fieldRaised : dark.field)};
  border-top: 1px solid ${dark.hairline};
`

export const SectionInner = styled.div`
  position: relative;
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
  color: ${dark.textMuted};
`

/** 혼합 웨이트 디스플레이. 1행은 얇은 인디고 틴트, 2행은 굵은 white. */
export const DisplayHeading = styled.h2`
  margin: 0;
  max-width: 32rem;
  font-size: clamp(1.75rem, 4vw, 3.1rem);
  line-height: 1.14;
  letter-spacing: -0.02em;
  font-weight: ${fontWeight.regular};
  color: ${dark.textMuted};

  strong {
    display: block;
    font-weight: ${fontWeight.bold};
    color: ${dark.textPrimary};
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
  font-size: 1.0625rem;
  line-height: 1.7;
  color: ${dark.textSecondary};

  strong {
    font-weight: ${fontWeight.semibold};
    color: ${dark.textPrimary};
  }
`

export const MetaFactRow = styled.dl`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1.25rem 1.5rem;
  margin: clamp(2rem, 4vw, 3rem) 0 0;
  padding-top: clamp(1.5rem, 3vw, 2.25rem);
  border-top: 1px solid ${dark.hairline};

  dt {
    margin: 0 0 0.5rem;
    font-family: ${editorialLabel.fontFamily};
    font-size: ${editorialLabel.fontSize};
    font-weight: ${editorialLabel.fontWeight};
    letter-spacing: ${editorialLabel.letterSpacing};
    text-transform: ${editorialLabel.textTransform};
    color: ${dark.textMuted};
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
  background: ${({ $accent }) => ($accent ? dark.signature : dark.fieldDeep)};
  color: ${({ $accent }) => ($accent ? dark.onSignature : dark.textSecondary)};
  font-size: 1rem;
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

/**
 * 거대한 아웃라인 고스트 숫자. 채움 없이 stroke만 쓰되, 배경 위 1.3:1이던 near-black gray 대신
 * 인디고 포인트 색(4.2:1)으로 올려 실제로 읽히게 한다.
 */
export const GhostIndex = styled.span`
  display: block;
  /* 대비를 올린 뒤에는 기존 -0.35em이 기능명 글자를 파고들어 둘 다 읽기 어려워진다. */
  margin-bottom: -0.1em;
  font-size: clamp(5.5rem, 11vw, 9rem);
  line-height: 1;
  letter-spacing: -0.04em;
  font-weight: ${fontWeight.bold};
  color: transparent;
  -webkit-text-stroke: 1.5px ${dark.lineArtAccent};
`

export const FeatureName = styled.h3`
  margin: 0 0 1rem;
  font-size: clamp(1.5rem, 2.8vw, 2rem);
  line-height: 1.25;
  letter-spacing: -0.02em;
  font-weight: ${fontWeight.bold};
  color: ${dark.textPrimary};
`

export const FeatureBody = styled.p`
  margin: 0;
  max-width: 30rem;
  font-size: 1.0625rem;
  line-height: 1.7;
  color: ${dark.textSecondary};
`

/** 스크린샷이 없는 블록의 시각 축. 자리를 채우는 이미지를 만들지 않고 단색 면과 타이포로 만든다. */
export const StatementPanel = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1rem;
  min-height: 16rem;
  padding: clamp(1.75rem, 4vw, 2.75rem);
  border: 1px solid ${dark.hairline};
  border-radius: 1.5rem;
  background: ${dark.fieldDeep};

  p {
    margin: 0;
    font-size: clamp(1.15rem, 2.2vw, 1.5rem);
    line-height: 1.5;
    letter-spacing: -0.01em;
    font-weight: ${fontWeight.regular};
    color: ${dark.textPrimary};
  }

  span {
    font-family: ${editorialLabel.fontFamily};
    font-size: ${editorialLabel.fontSize};
    font-weight: ${editorialLabel.fontWeight};
    letter-spacing: ${editorialLabel.letterSpacing};
    text-transform: ${editorialLabel.textTransform};
    color: ${dark.textMuted};
  }
`

export const FeatureStage = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: clamp(1rem, 2vw, 1.75rem);
  padding: clamp(1.25rem, 2.4vw, 1.85rem);
  border: 1px solid ${dark.hairline};
  border-radius: 1.5rem;
  background: ${dark.fieldDeep};

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
    border: 1px solid ${dark.borderStrong};
    border-radius: 1rem;
    background: ${dark.fieldRaised};
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
    font-size: 0.875rem;
    color: ${dark.textMuted};
  }
`

/**
 * 섹션 사이 호흡용 풀블리드 브레이크 컷. 공개 가능한 검수본이 한 장뿐이라 폰 컷을 세 번째로
 * 반복하지 않고, 가장 어두운 필드 위에 노선도 라인 아트와 한 줄 진술만 둔다.
 */
export const BreakCut = styled.section`
  position: relative;
  overflow: hidden;
  padding: clamp(4rem, 9vw, 8rem) ${SECTION_PADDING_X};
  background: ${dark.fieldDeep};
  border-top: 1px solid ${dark.hairline};
  border-bottom: 1px solid ${dark.hairline};

  p {
    position: relative;
    width: min(100%, 34rem);
    margin: 0 0 0 auto;
    text-align: right;
    font-size: clamp(1.35rem, 3vw, 2.25rem);
    line-height: 1.4;
    letter-spacing: -0.02em;
    font-weight: ${fontWeight.regular};
    color: ${dark.textSecondary};
  }

  strong {
    font-weight: ${fontWeight.bold};
    color: ${dark.textPrimary};
  }

  @media (max-width: ${breakpoint.md}px) {
    p {
      margin: 0;
      text-align: left;
    }
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

/**
 * 임팩트용 stat 카드 하나. 오너 페어링의 시그니처 면이고 그 위 텍스트는 전부 onSignature다.
 * 채운 면이라 focus ring도 그 위에서 보이는 색으로 바꾼다.
 */
export const StatCard = styled.div`
  --aq-focus-ring: ${dark.onSignature};
  padding: clamp(1.75rem, 4vw, 2.75rem);
  border-radius: 2.5rem;
  background: ${dark.signature};
  color: ${dark.onSignature};
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
    font-size: 1.0625rem;
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
  border: 1px solid ${dark.hairline};
  border-radius: 1.75rem;
  background: ${dark.fieldRaised};

  h2 {
    margin: 0 0 0.6rem;
    font-size: clamp(1.4rem, 2.8vw, 2rem);
    line-height: 1.25;
    letter-spacing: -0.02em;
    font-weight: ${fontWeight.bold};
    color: ${dark.textPrimary};
  }

  p {
    margin: 0;
    max-width: 30rem;
    font-size: 1.0625rem;
    line-height: 1.7;
    color: ${dark.textSecondary};
  }
`

export const SurfaceFooter = styled.footer`
  padding: clamp(2.5rem, 5vw, 4rem) ${SECTION_PADDING_X};
  border-top: 1px solid ${dark.hairline};
  background: ${dark.fieldDeep};
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
    color: ${dark.textPrimary};
  }

  span {
    font-size: 1rem;
    color: ${dark.textSecondary};
  }

  small {
    font-size: 0.875rem;
    color: ${dark.textMuted};
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
    color: ${dark.textSecondary};
    text-decoration: none;
    font-size: 1rem;
    font-weight: ${fontWeight.regular};
    transition: color ${TRANSITION};

    &:hover {
      color: ${dark.signature};
    }
  }
`
