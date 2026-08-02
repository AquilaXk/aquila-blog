import { CONFIG } from "site.config"

export const COMPANY_SURFACE = CONFIG.surfaces.company
export const PRODUCT_SURFACE = CONFIG.surfaces.product

/** 블로그는 별개의 canonical 표면이라 회사 표면에서는 절대 URL로 나간다. */
export const BLOG_URL = CONFIG.link
export const CONTACT_MAILTO = `mailto:${COMPANY_SURFACE.contactEmail}`

/**
 * 제품 표면 링크도 절대 URL이다.
 *
 * 제품은 자기 canonical 호스트를 가진 별개의 공개 표면이고, 회사 사이트의 내비는 그 호스트를
 * 가리켜야 한다 - 상대 경로로 두면 회사 호스트가 제품 URL을 자기 경로로 광고한다. 대가로 이 링크는
 * 제품 호스트 DNS가 붙기 전까지 도달하지 않는다(오너 승인된 컷오버 게이트 이후 유효).
 */
export const PRODUCT_URL = PRODUCT_SURFACE.url

export type CompanyGlyphName =
  | "route"
  | "journal"
  | "verify"
  | "operate"
  | "access"
  | "gate"
  | "check"

export type CompanyNoticeLink = {
  label: string
  href: string
}

export type CompanyWordmark = {
  id: string
  label: string
}

export type CompanyFeatureCard = {
  id: string
  tag: string
  glyph: CompanyGlyphName
  title: string
  body: string
}

export type CompanyWorkTile = {
  id: string
  label: string
  glyph: CompanyGlyphName
}

export type CompanyStat = {
  id: string
  value: string
  label: string
}

export type CompanyNewsItem = {
  id: string
  index: string
  title: string
  summary: string
  date: string
  href: string
  thumbnail: string
}

/** 헤더 위 공지 스트립. 제품 출시 상태는 과장 없이 준비 중으로만 적는다. */
export const COMPANY_NOTICE: CompanyNoticeLink = {
  label: "EasySubway Android 출시 준비 중 — 제품 소개 보기",
  href: PRODUCT_URL,
}

/**
 * 히어로 와이드 카드의 비주얼.
 *
 * 브라우저 프레임 안의 컷은 라이브 공개 블로그(`CONFIG.link`) 홈을 1440 폭으로 캡처한 것이다.
 * 실제로 운영 중인 화면이라 자리를 채우는 껍데기가 아니며, 캡처 범위는 헤더·히어로·목차까지로
 * 잘라 글 목록의 외부 썸네일이 들어가지 않게 했다.
 */
export const BLOG_CAPTURE = "/company/blog-home.webp"
export const BLOG_CAPTURE_ALT =
  "AquilaLog 기술 블로그 홈 화면. 상단 내비게이션과 소개 헤드라인, FOCUS·UPDATED·REPOSITORY 메타 목록, 주제별 글 수 목차가 보인다."
export const BLOG_CAPTURE_SIZE = { width: 1920, height: 733 } as const

/**
 * 공개할 수 있는 제품 실기기 검수본은 이 한 장이다. 같은 랜딩 자산의 다른 컷은 개발용 광고
 * 자리표시가 찍혀 있어 공개 페이지에 쓸 수 없다. 회사 표면에서는 히어로 카드 위 작은 폰으로
 * 한 번만 쓴다 - 같은 이미지를 여러 섹션에 반복하지 않는다.
 */
export const PRODUCT_SCREENSHOT = "/easysubway/station-detail.png"
export const PRODUCT_SCREENSHOT_ALT =
  "EasySubway 노선도 화면. 수도권 노선도에서 상록수역을 선택해 출발·경유·도착을 고르는 상태."
export const PRODUCT_SCREENSHOT_SIZE = { width: 1080, height: 2340 } as const

/** 모노크롬 워드마크 스트립. 우리가 실제로 만들고 운영하는 것만 적는다. */
export const COMPANY_WORDMARKS: CompanyWordmark[] = [
  { id: "easysubway", label: "EASYSUBWAY" },
  { id: "aquilalog", label: "AQUILALOG" },
  { id: "datapack", label: "DATA PIPELINE" },
  { id: "homeserver", label: "HOMESERVER OPS" },
]

/**
 * 기능 카드 캐러셀. 회사 역량과 제품 기능을 섞되 전부 지금 코드와 운영에 있는 사실만 적는다.
 * 고객 로고·성과 수치·후기는 넣지 않는다.
 */
export const COMPANY_FEATURE_CARDS: CompanyFeatureCard[] = [
  {
    id: "accessibility",
    tag: "ACCESSIBILITY",
    glyph: "access",
    title: "계단과 환승을 먼저 계산합니다",
    body: "이동을 막는 조건을 첫 화면의 경로 계산에 넣습니다. 나중에 붙이는 옵션으로 두지 않습니다.",
  },
  {
    id: "route-ui",
    tag: "ROUTE UI",
    glyph: "route",
    title: "노선도 한 화면에서 끝냅니다",
    body: "역을 눌러 출발·경유·도착을 지정합니다. 목록과 지도를 왕복하지 않습니다.",
  },
  {
    id: "data-integrity",
    tag: "DATA INTEGRITY",
    glyph: "verify",
    title: "화면과 원본을 배포마다 대조합니다",
    body: "역명과 노드가 어긋나는 오류를 사람 눈이 아니라 검증 단계가 잡습니다.",
  },
  {
    id: "resilience",
    tag: "RESILIENCE",
    glyph: "journal",
    title: "실시간이 끊겨도 멈추지 않습니다",
    body: "받지 못한 사실을 화면에 적고, 역 정보와 경로 검색은 계속 동작합니다.",
  },
  {
    id: "operations",
    tag: "OPERATIONS",
    glyph: "operate",
    title: "우리 서버에서 직접 운영합니다",
    body: "빌드부터 배포와 모니터링까지 우리가 소유한 인프라에서 돌립니다.",
  },
  {
    id: "quality",
    tag: "QUALITY GATE",
    glyph: "gate",
    title: "게이트를 통과하지 않으면 배포하지 않습니다",
    body: "접근성·성능·이미지 예산을 자동 게이트로 검사하고, 실패하면 배포를 멈춥니다.",
  },
]

/** 3x2 타일 그리드. 실제 활동 6개다. */
export const COMPANY_WORK_TILES: CompanyWorkTile[] = [
  { id: "easysubway", label: "EasySubway", glyph: "route" },
  { id: "aquilalog", label: "AquilaLog 기술 블로그", glyph: "journal" },
  { id: "pipeline", label: "데이터 검증 파이프라인", glyph: "verify" },
  { id: "homeserver", label: "자체 인프라 운영", glyph: "operate" },
  { id: "accessibility", label: "접근성 설계", glyph: "access" },
  { id: "gates", label: "품질 게이트", glyph: "gate" },
]

/**
 * hairline stat 리스트. 숫자는 지금 확인 가능한 값만 쓰고, 셀 수 없는 항목은 수치를 만들지 않고
 * 키워드로 둔다.
 */
export const COMPANY_STATS: CompanyStat[] = [
  { id: "services", value: "2", label: "운영 중인 공개 서비스" },
  { id: "stations", value: "2역", label: "공개 검증을 마친 파일럿 역" },
  { id: "ops", value: "자체 운영", label: "빌드 · 배포 · 모니터링" },
  { id: "account", value: "가입 없이", label: "제품 이용 조건" },
]

/** 비전 체크리스트. 지킬 수 있는 문장만 남긴다. */
export const COMPANY_PRINCIPLES = [
  "검증한 범위만 공개합니다",
  "모르는 것은 모른다고 표시합니다",
  "접근성을 기본값으로 둡니다",
  "배포 경로를 직접 소유합니다",
] as const

export const COMPANY_FOOTER_LINK_GROUPS = [
  {
    id: "product",
    title: "제품",
    links: [
      { label: "EasySubway", href: PRODUCT_URL },
      { label: "기술 블로그", href: BLOG_URL },
    ],
  },
  {
    id: "legal",
    title: "약관",
    links: [
      { label: "개인정보처리방침", href: `${BLOG_URL}/privacy` },
      { label: "이용약관", href: `${BLOG_URL}/terms` },
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

export const toCompanyNewsIndex = (position: number) => String(position + 1).padStart(2, "0")
