/**
 * 마케팅 표면(회사 랜딩 · EasySubway 제품 랜딩) 전용 시그니처 팔레트.
 *
 * ## 정본(provenance)
 * - 원천 파일: `AquilaXk/easysubway` 저장소의 `tools/design/easysubway-color-system.json`
 * - 버전 `1` · blob sha `a4e3af298c70fed5290a3cb4c47b7d34e228715c` · 6662 B
 *   (2026-08-02 `gh api repos/AquilaXk/easysubway/contents/tools/design/easysubway-color-system.json` 실측)
 * - 같은 파일이 `AquilaXk/easysubway-mobile`에도 동일 크기로 존재한다. 제품 앱과 이 웹 표면이
 *   같은 브랜드 색을 쓰는 근거가 그 단일 원천이다.
 * - 값을 손으로 조정하지 않는다. 브랜드 색이 바뀌면 정본을 다시 받아 아래 `brand`/`brandNeutral`/
 *   `brandInk`를 그대로 갱신하고 sha를 함께 올린다.
 *
 * ## 적용 범위
 * 회사·제품 랜딩 표면만이다. 블로그·관리자 표면은 기존 Radix 팔레트를 그대로 쓴다 - 두 세계를
 * 한 번에 바꾸면 이 팔레트의 대비 실측 범위를 넘어선다.
 *
 * ## 왜 토큰 모듈인가
 * `front/scripts/check-design-colors.mjs`가 guarded UI 경로의 새 hex/rgb 리터럴을 막는다. 이 파일이
 * 그 게이트에 등록된 유일한 색 정의 지점이고, 표면 스타일은 여기서 내보낸 토큰만 참조한다.
 */

/**
 * 정본 `primitives`의 brand 스케일. 키는 정본의 숫자 스텝을 그대로 따른다.
 */
export const brand = {
  50: "#F8F9FF",
  100: "#F0F2FE",
  200: "#E2E5FD",
  300: "#CCD2FC",
  400: "#B4BCFB",
  500: "#949FE8",
  600: "#7480D2",
  700: "#5C6BC0",
  800: "#4A58A9",
  900: "#3B4890",
  950: "#1F2340",
} as const

/** 정본 `primitives`의 중립 면. */
export const brandNeutral = {
  white: "#FFFFFF",
  scaffold: "#F7F8FC",
  subtle: "#F0F2F7",
  border: "#E1E4EE",
} as const

/** 정본 `primitives`의 잉크. `content.primary`는 brand.950이라 별도 값이 없다. */
export const brandInk = {
  secondary: "#4D536B",
  muted: "#697089",
} as const

/**
 * 정본에 없는 파생 단계는 이 둘뿐이다. 정본은 라이트 표면 기준 시스템이라 다크 필드용 면이 없고,
 * 제품 표면은 brand.950 한 단계만으로는 섹션 명도 교대와 패널 깊이를 만들 수 없다.
 *
 * 파생 규칙(sRGB 선형 보간, 정본 스텝 사이만 채운다):
 * - `deep`   = mix(brand.950, #000, 30%)      → rgb(22, 25, 45)
 * - `raised` = mix(brand.950, brand.900, 25%) → rgb(38, 44, 84)
 *
 * 그 밖의 다크 면 색(구획선·보더·라인아트)은 brand.800/900/600을 그대로 쓴다 - 파생 단계를
 * 늘리지 않기 위한 선택이다.
 */
export const brandField = {
  deep: "#16192D",
  base: brand[950],
  raised: "#262C54",
} as const

/**
 * 라이트 마케팅 표면(회사 랜딩)의 시맨틱 토큰. 이름은 정본 `semantic` 키를 따른다.
 *
 * 대비 실측(2026-08-02 계산, axe 게이트로 재검증):
 * - `onAccent`(#FFFFFF) / `accent`(#5C6BC0) = 4.86:1 (정본 contrastPairs `primary-action-content`)
 * - `onAccent` / `accentPressed`(#4A58A9) = 6.44:1
 * - `onSignature`(#3B4890) / `signature`(#B4BCFB) = 4.58:1 (정본 `active-label-on-signature`)
 * - `onSignature` / `surfaceBrandStrong`(#E2E5FD) = 6.70:1
 * - `inkSecondary`(#4D536B) / `surface`(#FFFFFF) = 7.59:1
 * - `inkMuted`(#697089) / `surface` = 4.91:1, / `surfaceScaffold`(#F7F8FC) = 4.62:1
 *
 * 정본 `roleRestrictions`의 `content.muted`는 `surface.subtle` 위 사용을 허용하지 않는다
 * (#697089 / #F0F2F7 = 4.38:1). 그래서 흰 면·scaffold 밖에서는 `inkSecondary`를 쓴다.
 */
export const marketingLight = {
  surface: brandNeutral.white,
  surfaceScaffold: brandNeutral.scaffold,
  surfaceSubtle: brandNeutral.subtle,
  surfaceBrandChrome: brand[50],
  surfaceBrand: brand[100],
  surfaceBrandStrong: brand[200],
  /** 시그니처 면. 오너 페어링의 기준 색이며 그 위 텍스트는 항상 `onSignature`다. */
  signature: brand[400],
  onSignature: brand[900],
  border: brandNeutral.border,
  borderBrand: brand[300],
  borderStrong: brand[600],
  inkPrimary: brand[950],
  inkSecondary: brandInk.secondary,
  inkMuted: brandInk.muted,
  /** CTA·선택 상태. */
  accent: brand[700],
  accentPressed: brand[800],
  onAccent: brandNeutral.white,
  /** 본문 크기 링크·라벨. 흰 면에서 8.35:1. */
  accentText: brand[900],
  focus: brand[700],
  /** 1px stroke 라인아트·장식 그래픽 전용(정본 roleRestrictions `brand.500` = brand.graphic). */
  graphic: brand[500],
} as const

/**
 * 다크 마케팅 표면(제품 랜딩 + 회사 랜딩의 다크 타일·footer)의 시맨틱 토큰.
 *
 * 정본은 라이트 표면만 정의하므로 다크 텍스트 위계는 정본 primitives 중에서 골라 대비를 직접
 * 실측했다(axe 게이트로 재검증):
 * - `textPrimary`(#FFFFFF) / `base`(#1F2340) = 15.30:1, / `raised`(#262C54) = 13.37:1
 * - `textSecondary`(#E2E5FD) / `base` = 12.30:1, / `raised` = 10.74:1
 * - `textMuted`(#B4BCFB) / `base` = 8.40:1, / `raised` = 7.34:1
 * - `onAccent`(#FFFFFF) / `accent`(#5C6BC0) = 4.86:1
 * - `onSignature`(#3B4890) / `signature`(#B4BCFB) = 4.58:1
 *
 * 장식 대비는 낮게 유지한다: `lineArt`(#3B4890)는 `base` 위 1.83:1로 배경 라인아트가 본문을
 * 방해하지 않고, 포인트 한 선만 `lineArtAccent`(#7480D2, 4.20:1)로 올린다.
 *
 * focus ring은 이 표면에서 재정의하지 않는다. 전역 `--aq-focus-ring`(indigo8)이 다크 필드에서
 * 충분히 밝고, 정본의 `focus.default`(brand.700)는 `raised` 패널 위에서 2.75:1로 3:1을 못 넘긴다.
 */
export const marketingDark = {
  fieldDeep: brandField.deep,
  field: brandField.base,
  fieldRaised: brandField.raised,
  /** 구획선. 면보다 한 단계 밝은 인디고라 near-black hairline보다 톤이 붙는다. */
  hairline: brand[900],
  borderStrong: brand[800],
  textPrimary: brandNeutral.white,
  textSecondary: brand[200],
  textMuted: brand[400],
  accent: brand[700],
  accentPressed: brand[800],
  onAccent: brandNeutral.white,
  signature: brand[400],
  onSignature: brand[900],
  /** 배경 노선도 라인아트의 기본 선. 저대비가 목적이다. */
  lineArt: brand[900],
  /** 라인아트에서 단 하나만 올리는 인디고 포인트 선. */
  lineArtAccent: brand[600],
  graphic: brand[500],
} as const
