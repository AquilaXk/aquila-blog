import type { CompanyCapabilityIcon as IconName } from "src/routes/Company/CompanyPageModel"

/**
 * 역량 카드용 1px stroke 단색 geometric 글리프. 이모지·일러스트팩을 쓰지 않기 위해 직접 그린다.
 * 색은 `currentColor`라 카드가 정한 accent를 그대로 따르고, 의미는 옆 텍스트가 전달하므로
 * 접근성 트리에서는 숨긴다.
 */
const ICON_PATHS: Record<IconName, React.ReactNode> = {
  // 경로: 두 지점을 직각으로 잇는 동선.
  route: (
    <>
      <path d="M6 30V14a4 4 0 0 1 4-4h20" />
      <circle cx="6" cy="34" r="3" />
      <circle cx="34" cy="10" r="3" />
    </>
  ),
  // 정합: 사각 프레임 안의 대조 표시.
  verify: (
    <>
      <rect x="7" y="7" width="26" height="26" rx="4" />
      <path d="M14 21l5 5 9-11" />
    </>
  ),
  // 운영: 쌓인 런타임 면.
  operate: (
    <>
      <rect x="7" y="9" width="26" height="9" rx="3" />
      <rect x="7" y="22" width="26" height="9" rx="3" />
      <path d="M13 13.5h4M13 26.5h4" />
    </>
  ),
}

type Props = {
  name: IconName
}

const CompanyCapabilityGlyph: React.FC<Props> = ({ name }) => (
  <svg
    viewBox="0 0 40 40"
    width="40"
    height="40"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {ICON_PATHS[name]}
  </svg>
)

export default CompanyCapabilityGlyph
