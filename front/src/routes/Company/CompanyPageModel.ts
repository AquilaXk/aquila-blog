import { CONFIG } from "site.config"

export const COMPANY_SURFACE = CONFIG.surfaces.company
export const PRODUCT_SURFACE = CONFIG.surfaces.product

/** 블로그는 별개의 canonical 표면이라 회사 표면에서는 절대 URL로 나간다. */
export const BLOG_URL = CONFIG.link
export const CONTACT_MAILTO = `mailto:${COMPANY_SURFACE.contactEmail}`

/**
 * 제품 표면으로의 이동은 상대 경로다. 같은 Next 앱이 회사 호스트에서도 이 라우트를 서빙하므로
 * 전용 호스트 DNS가 아직 없는 동안에도 링크가 끊기지 않는다. canonical만 전용 호스트를 가리킨다.
 */
export const PRODUCT_ROUTE = PRODUCT_SURFACE.route

export type CompanyCapabilityIcon = "route" | "verify" | "operate"

export type CompanyCapability = {
  id: string
  tag: string
  icon: CompanyCapabilityIcon
  title: string
  body: string
}

export type CompanyProductPoint = {
  id: string
  keyword: string
  body: string
}

export type CompanyScopeChip = {
  id: string
  label: string
  accent?: boolean
}

export type CompanyNewsItem = {
  id: string
  title: string
  summary: string
  date: string
  href: string
}

/** 실제로 주장할 수 있는 것만 적는다. 고객 로고·성과 수치·후기는 넣지 않는다. */
export const COMPANY_CAPABILITIES: CompanyCapability[] = [
  {
    id: "accessibility",
    tag: "ACCESSIBILITY",
    icon: "route",
    title: "이동을 막는 조건부터 계산합니다",
    body: "계단, 엘리베이터, 환승 동선을 기본값으로 다룹니다. 나중에 붙이는 옵션이 아니라 첫 화면의 계산에 들어갑니다.",
  },
  {
    id: "verification",
    tag: "DATA INTEGRITY",
    icon: "verify",
    title: "화면과 원본을 매번 대조합니다",
    body: "역과 노선 데이터는 배포마다 원본과 맞춰 봅니다. 역명과 노드가 어긋나는 오류를 사람 눈이 아니라 검증 단계가 잡습니다.",
  },
  {
    id: "operations",
    tag: "OPERATIONS",
    icon: "operate",
    title: "우리 서버에서 직접 운영합니다",
    body: "빌드부터 배포와 모니터링까지 우리가 소유한 인프라에서 돌립니다. 장애 원인을 남의 대시보드에서 찾지 않습니다.",
  },
]

/**
 * EasySubway 섹션의 hairline 리스트. 수치는 확인 가능한 것만 쓰고, 나머지는 가치 키워드로 둔다.
 */
export const COMPANY_PRODUCT_POINTS: CompanyProductPoint[] = [
  {
    id: "route",
    keyword: "교통약자 우선",
    body: "가장 빠른 경로가 아니라 끝까지 이동할 수 있는 경로를 먼저 보여줍니다.",
  },
  {
    id: "verified",
    keyword: "확인된 정보만",
    body: "시설 정보에는 출처와 확인 일자를 남기고, 모르는 것은 모른다고 표시합니다.",
  },
  {
    id: "no-account",
    keyword: "가입 없이",
    body: "경로를 찾기 위해 계정을 만들거나 개인정보를 먼저 낼 필요가 없습니다.",
  },
]

/**
 * 공개할 수 있는 제품 실기기 검수본은 이 한 장이다. 같은 랜딩 자산의 다른 컷은 개발용 광고
 * 자리표시가 찍혀 있어 공개 페이지에 쓸 수 없다. 그래서 이 표면은 화면을 hero에서 한 번만 쓰고,
 * 제품 섹션은 사실 칩으로 채운다 - 같은 이미지를 반복하거나 자리를 채우는 이미지를 만들지 않는다.
 */
export const PRODUCT_SCREENSHOT = "/easysubway/station-detail.png"
export const PRODUCT_SCREENSHOT_ALT =
  "EasySubway 노선도 화면. 수도권 노선도에서 상록수역을 선택해 출발·경유·도착을 고르는 상태."

/** 제품 섹션의 사실 칩. 확인 가능한 범위만 적는다. */
export const COMPANY_PRODUCT_SCOPE_CHIPS: CompanyScopeChip[] = [
  { id: "sangnoksu", label: "4호선 상록수", accent: true },
  { id: "sadang", label: "4호선 사당", accent: true },
  { id: "platform", label: "Android 출시 준비 중" },
  { id: "account", label: "가입 없이 이용" },
]

export const COMPANY_FOOTER_LINK_GROUPS = [
  {
    id: "product",
    title: "제품",
    links: [
      { label: "EasySubway", href: PRODUCT_ROUTE, external: false },
      { label: "기술 블로그", href: BLOG_URL, external: true },
    ],
  },
  {
    id: "legal",
    title: "약관",
    links: [
      { label: "개인정보처리방침", href: `${BLOG_URL}/privacy`, external: true },
      { label: "이용약관", href: `${BLOG_URL}/terms`, external: true },
    ],
  },
] as const

const NEWS_SUMMARY_MAX_LENGTH = 96

/** 요약이 없는 글은 카드를 비워 두지 않고 제목만 남긴다. 자리를 채우는 문구를 만들지 않는다. */
export const toCompanyNewsSummary = (summary: string | undefined) => {
  const normalized = (summary || "").replace(/\s+/g, " ").trim()
  if (normalized.length <= NEWS_SUMMARY_MAX_LENGTH) return normalized
  return `${normalized.slice(0, NEWS_SUMMARY_MAX_LENGTH).trimEnd()}…`
}

export const toCompanyNewsDate = (isoDate: string) => {
  const parsed = new Date(isoDate)
  if (Number.isNaN(parsed.getTime())) return ""
  const year = parsed.getUTCFullYear()
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0")
  const day = String(parsed.getUTCDate()).padStart(2, "0")
  return `${year}.${month}.${day}`
}
