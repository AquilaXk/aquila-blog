import styled from "@emotion/styled"
import { breakpoint, editorialLabel, fontWeight, layoutBreakpoint, radius } from "src/design-system/tokens"
import { focusVisibleRing } from "src/design-system/focusRing"
import { marketingDark as dark, marketingLight as light } from "src/design-system/marketingPalette"
import { variables } from "src/styles"
import { CONTENT_MAX_WIDTH, SECTION_PADDING_X, TRANSITION } from "src/routes/Company/CompanyPage.styles"

/**
 * 회사 표면 섹션 레이아웃: 워드마크 스트립 · 기능 카드 캐러셀 · 타일 그리드 · 비대칭 스토리 ·
 * 비전 체크리스트 · 소식 카드 · 문의 밴드.
 *
 * 구도는 섹션마다 바꾼다(중앙 → 한 줄 스트립 → 캐러셀 → 풀블리드 타일 → 비대칭 2열 → 2x2 목록
 * → 3열 카드 → 밴드). 같은 3카드 그리드를 반복하지 않기 위한 제약이다.
 */

/**
 * 히어로 플로팅 카드가 이 섹션 위로 걸치므로 상단 여백이 그 침범량보다 커야 한다.
 * 카드 오버행 최대 5.5rem + 폰 오버행 최대 2.5rem = 8rem.
 */
export const WordmarkStrip = styled.section`
  padding: clamp(7rem, 14vw, 12rem) ${SECTION_PADDING_X} clamp(3rem, 6vw, 4.5rem);
  background: ${light.surfaceScaffold};
  text-align: center;
`

export const WordmarkLabel = styled.p`
  margin: 0 0 1.5rem;
  font-family: ${editorialLabel.fontFamily};
  font-size: ${editorialLabel.fontSize};
  font-weight: ${editorialLabel.fontWeight};
  letter-spacing: ${editorialLabel.letterSpacing};
  text-transform: ${editorialLabel.textTransform};
  color: ${light.inkMuted};
`

/** 모노크롬 워드마크 한 줄. 가짜 파트너 로고 대신 우리가 만들고 운영하는 것들의 텍스트 로고다. */
export const WordmarkRow = styled.ul`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 1rem clamp(1.5rem, 4vw, 3.5rem);
  width: min(100%, ${CONTENT_MAX_WIDTH});
  margin: 0 auto;
  padding: 0;
  list-style: none;

  li {
    font-size: clamp(0.95rem, 1.6vw, 1.15rem);
    font-weight: ${fontWeight.bold};
    letter-spacing: 0.12em;
    color: ${light.inkSecondary};
  }
`

export const CarouselHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.5rem 2.5rem;
`

/**
 * 카드 뷰포트. 키보드로도 움직여야 하므로 스크롤 컨테이너 자체를 포커스 가능하게 두고
 * (`tabIndex`는 뷰에서 준다) 화살표 버튼을 함께 제공한다.
 */
export const CarouselViewport = styled.div`
  ${focusVisibleRing};
  display: flex;
  gap: clamp(1rem, 2vw, 1.5rem);
  margin-top: clamp(2.25rem, 5vw, 3.5rem);
  padding-bottom: 0.5rem;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`

export const FeatureCard = styled.article`
  display: flex;
  flex: 0 0 calc((100% - 2 * clamp(1rem, 2vw, 1.5rem)) / 3);
  flex-direction: column;
  gap: 1rem;
  padding: clamp(1.25rem, 2.4vw, 1.75rem);
  border: 1px solid ${light.border};
  border-radius: ${radius.lg}px;
  background: ${light.surface};
  scroll-snap-align: start;
  transition: border-color ${TRANSITION};

  &:hover {
    border-color: ${light.borderStrong};
  }

  h3 {
    margin: 0;
    font-size: 1.2rem;
    line-height: 1.4;
    letter-spacing: -0.01em;
    font-weight: ${fontWeight.bold};
    color: ${light.inkPrimary};
  }

  p {
    margin: 0;
    font-size: 0.94rem;
    line-height: 1.7;
    color: ${light.inkSecondary};
  }

  @media (max-width: ${layoutBreakpoint.adminCompact}px) {
    flex-basis: calc((100% - clamp(1rem, 2vw, 1.5rem)) / 2);
  }

  @media (max-width: ${breakpoint.sm}px) {
    flex-basis: 86%;
  }
`

export const FeatureGlyphPanel = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 7rem;
  border-radius: ${radius.md}px;
  background: ${light.surfaceBrand};
  color: ${light.accentText};
`

export const FeatureTag = styled.span`
  align-self: flex-start;
  padding: 0.25rem 0.6rem;
  border-radius: ${variables.ui.button.radiusPill}px;
  background: ${light.surfaceBrandStrong};
  color: ${light.onSignature};
  font-family: ${editorialLabel.fontFamily};
  font-size: 11px;
  font-weight: ${editorialLabel.fontWeight};
  letter-spacing: 0.06em;
  text-transform: uppercase;
`

/** 캐러셀 컨트롤: 좌측 원형 화살표 2개 + 그 오른쪽 진행 라인. */
export const CarouselControls = styled.div`
  display: flex;
  align-items: center;
  gap: clamp(1rem, 3vw, 2rem);
  margin-top: clamp(1.5rem, 3vw, 2.25rem);
`

export const CarouselArrows = styled.div`
  display: flex;
  flex: 0 0 auto;
  gap: 0.5rem;
`

export const CarouselArrow = styled.button`
  ${focusVisibleRing};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 1px solid ${light.borderStrong};
  border-radius: ${radius.pill}px;
  background: ${light.surface};
  color: ${light.accentText};
  cursor: pointer;
  transition: background-color ${TRANSITION}, border-color ${TRANSITION};

  &:hover:not(:disabled) {
    background: ${light.surfaceBrand};
  }

  &:disabled {
    border-color: ${light.border};
    color: ${light.inkMuted};
    cursor: default;
  }
`

export const CarouselProgress = styled.div`
  position: relative;
  flex: 1 1 auto;
  height: 2px;
  border-radius: ${radius.pill}px;
  background: ${light.border};

  span {
    position: absolute;
    top: 0;
    bottom: 0;
    border-radius: ${radius.pill}px;
    background: ${light.accent};
    transition: left ${TRANSITION}, width ${TRANSITION};
  }
`

export const WorkHeading = styled.h2`
  margin: 0 auto clamp(2.5rem, 5vw, 4rem);
  max-width: 40rem;
  font-size: clamp(1.85rem, 3.8vw, 3rem);
  line-height: 1.18;
  letter-spacing: -0.02em;
  font-weight: ${fontWeight.extraBold};
  color: ${light.inkPrimary};
  text-align: center;
`

export const WorkGrid = styled.ul`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;

  @media (max-width: ${layoutBreakpoint.adminCompact}px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: ${breakpoint.sm}px) {
    grid-template-columns: minmax(0, 1fr);
  }
`

/**
 * 다크 단색 타일. 사진 대신 타일마다 다른 1px 라인아트 모티프를 우상단에 크게 놓고 라벨은 좌하단에
 * 둔다. 면은 두 단계를 교대해 격자에 리듬을 준다.
 */
export const WorkTile = styled.li<{ $alternate?: boolean }>`
  position: relative;
  overflow: hidden;
  aspect-ratio: 4 / 3;
  border-radius: ${radius.lg}px;
  background: ${({ $alternate }) => ($alternate ? dark.fieldRaised : dark.field)};

  > span:first-of-type {
    position: absolute;
    top: 8%;
    right: 8%;
    color: ${dark.graphic};
  }

  > span:last-of-type {
    position: absolute;
    bottom: clamp(0.9rem, 2vw, 1.35rem);
    left: clamp(0.9rem, 2vw, 1.35rem);
    max-width: calc(100% - 2 * clamp(0.9rem, 2vw, 1.35rem));
    font-size: clamp(0.9rem, 1.5vw, 1.02rem);
    font-weight: ${fontWeight.bold};
    letter-spacing: -0.01em;
    color: ${dark.textPrimary};
  }
`

export const StoryLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
  align-items: start;
  gap: clamp(1.75rem, 5vw, 4.5rem);

  @media (max-width: ${layoutBreakpoint.adminCompact}px) {
    grid-template-columns: minmax(0, 1fr);
  }
`

export const StoryHeadline = styled.h2`
  margin: 0;
  font-size: clamp(1.9rem, 4vw, 3rem);
  line-height: 1.16;
  letter-spacing: -0.02em;
  font-weight: ${fontWeight.extraBold};
  color: ${light.inkPrimary};

  strong {
    display: block;
    font-weight: inherit;
    color: ${light.accentText};
  }
`

/** hairline divider stat 리스트. 확인 가능한 값만 올린다. */
export const StatList = styled.dl`
  margin: clamp(2.25rem, 5vw, 3.5rem) 0 0;
  max-width: 34rem;

  > div {
    display: grid;
    grid-template-columns: minmax(0, 9rem) minmax(0, 1fr);
    align-items: baseline;
    gap: 0.35rem 1.5rem;
    padding: 1.15rem 0;
    border-top: 1px solid ${light.border};
  }

  > div:last-of-type {
    border-bottom: 1px solid ${light.border};
  }

  dt {
    margin: 0;
    font-size: clamp(1.3rem, 2.4vw, 1.75rem);
    line-height: 1.2;
    letter-spacing: -0.02em;
    font-weight: ${fontWeight.extraBold};
    color: ${light.inkPrimary};
  }

  dd {
    margin: 0;
    font-size: 0.92rem;
    line-height: 1.6;
    color: ${light.inkSecondary};
  }

  @media (max-width: ${breakpoint.sm}px) {
    > div {
      grid-template-columns: minmax(0, 1fr);
    }
  }
`

export const PrincipleList = styled.ul`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 clamp(1.5rem, 4vw, 3.5rem);
  margin: clamp(2.25rem, 5vw, 3.5rem) 0 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 1.1rem 0;
    border-top: 1px solid ${light.borderBrand};
    font-size: clamp(1rem, 1.8vw, 1.15rem);
    line-height: 1.5;
    font-weight: ${fontWeight.semibold};
    color: ${light.inkPrimary};
  }

  li > span:first-of-type {
    display: flex;
    flex: 0 0 auto;
    color: ${light.accentText};
  }

  @media (max-width: ${breakpoint.md}px) {
    grid-template-columns: minmax(0, 1fr);
  }
`

export const NewsGrid = styled.ul`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(1rem, 2vw, 1.5rem);
  margin: clamp(2.25rem, 5vw, 3.5rem) 0 0;
  padding: 0;
  list-style: none;

  @media (max-width: ${layoutBreakpoint.adminCompact}px) {
    grid-template-columns: minmax(0, 1fr);
  }
`

export const NewsCard = styled.a`
  ${focusVisibleRing};
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  height: 100%;
  padding: clamp(1rem, 2vw, 1.25rem);
  border: 1px solid ${light.border};
  border-radius: ${radius.lg}px;
  background: ${light.surface};
  text-decoration: none;
  transition: border-color ${TRANSITION};

  &:hover {
    border-color: ${light.borderStrong};
  }

  &:hover strong {
    color: ${light.accentText};
  }

  strong {
    font-size: 1.1rem;
    line-height: 1.45;
    letter-spacing: -0.01em;
    font-weight: ${fontWeight.bold};
    color: ${light.inkPrimary};
    transition: color ${TRANSITION};
  }

  p {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.65;
    color: ${light.inkSecondary};
  }

  time {
    font-family: ${editorialLabel.fontFamily};
    font-size: 0.78rem;
    color: ${light.inkMuted};
  }
`

/**
 * 카드 상단 미디어 슬롯. 글에 실제 썸네일이 있으면 그 이미지를, 없으면 자리를 채우는 이미지를
 * 만들지 않고 같은 크기의 단색 면에 글 번호만 올린다 - 카드 실루엣은 유지되고 없는 자산을
 * 지어내지도 않는다.
 */
export const NewsMedia = styled.div`
  display: flex;
  align-items: flex-end;
  overflow: hidden;
  aspect-ratio: 16 / 9;
  border-radius: ${radius.md}px;
  background: ${light.surfaceBrand};

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  span {
    padding: 0 0 0.6rem 0.75rem;
    font-family: ${editorialLabel.fontFamily};
    font-size: clamp(1.75rem, 4vw, 2.5rem);
    font-weight: ${fontWeight.extraBold};
    letter-spacing: -0.02em;
    color: ${light.onSignature};
  }
`

/**
 * 문의 밴드. 오너 페어링의 시그니처 면이고 그 위 텍스트·focus는 전부 onSignature다
 * (기본 focus 색은 이 면에서 3:1을 못 넘긴다).
 */
export const ContactBand = styled.div`
  --aq-focus-ring: ${light.onSignature};
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem 2.5rem;
  width: min(100%, ${CONTENT_MAX_WIDTH});
  margin: 0 auto;
  padding: clamp(1.75rem, 4vw, 3rem);
  border-radius: 1.75rem;
  background: ${light.signature};
  color: ${light.onSignature};

  h2 {
    margin: 0 0 0.5rem;
    font-size: clamp(1.4rem, 2.8vw, 2rem);
    line-height: 1.25;
    letter-spacing: -0.02em;
    font-weight: ${fontWeight.extraBold};
  }

  p {
    margin: 0;
    font-size: 0.98rem;
    line-height: 1.65;
  }
`
