import { useCallback, useEffect, useRef, useState } from "react"
import CompanyGlyph from "src/routes/Company/CompanyGlyph"
import { COMPANY_FEATURE_CARDS } from "src/routes/Company/CompanyPageModel"
import * as S from "src/routes/Company/CompanySection.styles"

/**
 * 기능 카드 캐러셀.
 *
 * 스크롤 컨테이너 + scroll-snap이 이동을 담당하고 화살표는 그 컨테이너를 한 카드씩 밀기만 한다.
 * 그래서 마우스 드래그·트랙패드·화살표 버튼·키보드가 모두 같은 상태를 본다.
 *
 * 컨테이너 자신이 `tabIndex=0`인 것은 스타일이 아니라 접근성 요구다 - 스크롤 가능한 영역이
 * 포커스를 받지 못하면 키보드만 쓰는 방문자는 두 번째 카드 뒤를 볼 방법이 없다.
 *
 * 진행 라인은 스크롤 위치에서 파생된 값이다. 별도 인덱스 상태를 두면 드래그로 움직였을 때
 * 라인과 실제 위치가 어긋난다.
 */
const SCROLL_EPSILON = 2

type Progress = {
  ratio: number
  offset: number
  atStart: boolean
  atEnd: boolean
}

const INITIAL_PROGRESS: Progress = { ratio: 1, offset: 0, atStart: true, atEnd: true }

const readProgress = (viewport: HTMLDivElement): Progress => {
  const { scrollLeft, scrollWidth, clientWidth } = viewport
  const scrollable = Math.max(scrollWidth - clientWidth, 0)
  return {
    ratio: scrollWidth > 0 ? Math.min(clientWidth / scrollWidth, 1) : 1,
    offset: scrollWidth > 0 ? scrollLeft / scrollWidth : 0,
    atStart: scrollLeft <= SCROLL_EPSILON,
    atEnd: scrollable - scrollLeft <= SCROLL_EPSILON,
  }
}

const CompanyFeatureCarousel: React.FC = () => {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState<Progress>(INITIAL_PROGRESS)

  const syncProgress = useCallback(() => {
    const viewport = viewportRef.current
    if (viewport) setProgress(readProgress(viewport))
  }, [])

  useEffect(() => {
    syncProgress()
    window.addEventListener("resize", syncProgress)
    return () => window.removeEventListener("resize", syncProgress)
  }, [syncProgress])

  /** 한 걸음은 첫 카드 폭 + 카드 간격이다. 카드 폭은 뷰포트에 따라 달라지므로 실측해서 쓴다. */
  const step = useCallback((direction: -1 | 1) => {
    const viewport = viewportRef.current
    const card = viewport?.firstElementChild
    if (!viewport || !card) return
    const gap = Number.parseFloat(getComputedStyle(viewport).columnGap) || 0
    viewport.scrollBy({ left: direction * (card.getBoundingClientRect().width + gap), behavior: "smooth" })
  }, [])

  return (
    <>
      <S.CarouselViewport
        ref={viewportRef}
        onScroll={syncProgress}
        tabIndex={0}
        role="group"
        aria-label="핵심 역량 카드"
      >
        {COMPANY_FEATURE_CARDS.map((card) => (
          <S.FeatureCard key={card.id}>
            <S.FeatureGlyphPanel>
              <CompanyGlyph name={card.glyph} size={72} />
            </S.FeatureGlyphPanel>
            <S.FeatureTag>{card.tag}</S.FeatureTag>
            <h3>{card.title}</h3>
            <p>{card.body}</p>
          </S.FeatureCard>
        ))}
      </S.CarouselViewport>

      <S.CarouselControls>
        <S.CarouselArrows>
          <S.CarouselArrow
            type="button"
            onClick={() => step(-1)}
            disabled={progress.atStart}
            aria-label="이전 카드 보기"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true" focusable="false">
              <path
                d="M14 6l-6 6 6 6"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </S.CarouselArrow>
          <S.CarouselArrow
            type="button"
            onClick={() => step(1)}
            disabled={progress.atEnd}
            aria-label="다음 카드 보기"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true" focusable="false">
              <path
                d="M10 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </S.CarouselArrow>
        </S.CarouselArrows>
        <S.CarouselProgress aria-hidden="true">
          <span
            style={{
              left: `${progress.offset * 100}%`,
              width: `${progress.ratio * 100}%`,
            }}
          />
        </S.CarouselProgress>
      </S.CarouselControls>
    </>
  )
}

export default CompanyFeatureCarousel
