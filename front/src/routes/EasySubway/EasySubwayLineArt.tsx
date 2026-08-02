import { marketingDark as dark } from "src/design-system/marketingPalette"

/**
 * 배경용 추상 노선도 라인 아트.
 *
 * 실제 노선도가 아니다 - 실제 노선 형상을 배경 장식으로 쓰면 검증한 데이터와 장식의 구분이
 * 흐려진다. 그래서 방향은 노선도 문법(수평·수직·45도만 쓰는 octilinear)만 빌려 오고 형상은
 * 임의로 그린다.
 *
 * 대비는 낮게 유지한다. 기본 선은 배경 위 1.8:1이라 본문을 방해하지 않고, 포인트 한 선만
 * 4.2:1로 올려 시선을 준다. 의미는 옆 텍스트가 전달하므로 접근성 트리에서는 숨긴다.
 */
const BASE_LINES = [
  "M0 118 L150 118 L292 260 L706 260 L822 144 L1200 144",
  "M0 382 L414 382 L534 262 L898 262 L1010 374 L1200 374",
  "M478 0 L478 116 L598 236 L598 400",
  "M0 40 L262 40 L360 138 L1200 138",
]

const ACCENT_LINE = "M0 300 L198 300 L318 180 L642 180 L760 58 L1200 58"

const NODES = [
  { cx: 292, cy: 260 },
  { cx: 706, cy: 260 },
  { cx: 534, cy: 262 },
  { cx: 478, cy: 116 },
  { cx: 598, cy: 236 },
  { cx: 318, cy: 180 },
  { cx: 642, cy: 180 },
]

const EasySubwayLineArt: React.FC = () => (
  <svg
    viewBox="0 0 1200 400"
    preserveAspectRatio="xMidYMid slice"
    width="100%"
    height="100%"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    {BASE_LINES.map((line) => (
      <path key={line} d={line} stroke={dark.lineArt} strokeWidth="2" strokeLinejoin="round" />
    ))}
    <path d={ACCENT_LINE} stroke={dark.lineArtAccent} strokeWidth="2" strokeLinejoin="round" />
    {NODES.map((node) => (
      <circle
        key={`${node.cx}-${node.cy}`}
        cx={node.cx}
        cy={node.cy}
        r="5"
        fill={dark.field}
        stroke={dark.lineArt}
        strokeWidth="2"
      />
    ))}
  </svg>
)

export default EasySubwayLineArt
