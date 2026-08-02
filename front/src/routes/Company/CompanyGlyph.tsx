import type { CompanyGlyphName } from "src/routes/Company/CompanyPageModel"

/**
 * 회사 표면의 1px stroke 단색 geometric 글리프. 이모지·3D 클립아트·일러스트팩을 쓰지 않기 위해
 * 직접 그린다. 색은 `currentColor`라 카드/타일이 정한 톤을 그대로 따르고, 의미는 옆 텍스트가
 * 전달하므로 접근성 트리에서는 숨긴다.
 */
const GLYPH_PATHS: Record<CompanyGlyphName, React.ReactNode> = {
  // 경로: 직각으로 꺾이는 동선과 양 끝 노드.
  route: (
    <>
      <path d="M10 38V26a6 6 0 0 1 6-6h10l8-8" />
      <circle cx="10" cy="41" r="3" />
      <circle cx="36" cy="10" r="3" />
    </>
  ),
  // 기록: 본문 줄이 쌓인 문서 면.
  journal: (
    <>
      <rect x="12" y="8" width="24" height="32" rx="3" />
      <path d="M18 17h12M18 24h12M18 31h7" />
    </>
  ),
  // 정합: 프레임 안에서 원본과 화면을 대조한 표시.
  verify: (
    <>
      <rect x="9" y="9" width="30" height="30" rx="4" />
      <path d="M17 25l5 5 10-12" />
    </>
  ),
  // 운영: 쌓인 런타임 면과 상태 표시.
  operate: (
    <>
      <rect x="9" y="11" width="30" height="10" rx="3" />
      <rect x="9" y="27" width="30" height="10" rx="3" />
      <path d="M15 16h5M15 32h5" />
    </>
  ),
  // 접근성: 위아래로 움직이는 수직 이동 설비.
  access: (
    <>
      <rect x="12" y="9" width="24" height="30" rx="3" />
      <path d="M24 15v18" />
      <path d="M19 20l5-5 5 5" />
      <path d="M19 28l5 5 5-5" />
    </>
  ),
  // 게이트: 통과 조건을 넘은 것만 지나가는 관문.
  gate: (
    <>
      <path d="M12 38V14M36 38V14" />
      <path d="M12 20h24" />
      <path d="M18 29l4 4 8-9" />
    </>
  ),
  // 체크: 목록 항목 앞의 확인 표시.
  check: <path d="M13 25l7 7 15-17" />,
}

type Props = {
  name: CompanyGlyphName
  size?: number
}

const CompanyGlyph: React.FC<Props> = ({ name, size = 48 }) => (
  <svg
    viewBox="0 0 48 48"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {GLYPH_PATHS[name]}
  </svg>
)

export default CompanyGlyph
