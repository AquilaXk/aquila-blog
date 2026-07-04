import type { Theme } from "@emotion/react"
import { colors, createPublicDesignTokens } from "src/styles"

// 패밀리룩 토큰 통합(#1218): 관리자 팔레트는 더 이상 자체 블루를 하드코딩하지 않고
// 공용 semantic 토큰(colors + publicDesign)에서 값을 파생한다. 라이트/다크 대칭은
// 공용 팔레트가 보장하며, 파스텔 tint는 color-mix로 포인트 블루에서 유도한다.
const lightColors = colors.light
const darkColors = colors.dark
const lightDesign = createPublicDesignTokens("light")
const darkDesign = createPublicDesignTokens("dark")

type SchemePalette = {
  colors: typeof lightColors
  design: typeof lightDesign
}

const buildAdminThemeVariables = (scheme: "light" | "dark", palette: SchemePalette) => {
  const { colors: c, design: d } = palette
  // 표면 계층(sidebar/raised/muted/elevated-top)은 라이트/다크에서 서로 다른 gray
  // 인덱스를 쓴다(다크는 gray가 어두울수록 낮은 인덱스라 방향이 뒤집힘). 기존 값을
  // 그대로 재현해 표면 깊이(elevation) 역전을 막는다.
  const isLight = scheme === "light"
  const surfaceRaised = isLight ? c.gray2 : c.gray3
  const surfaceMuted = isLight ? c.gray3 : c.gray2
  const surfaceElevatedTop = isLight ? c.gray1 : c.gray3
  const sidebar = isLight ? c.gray1 : c.gray2
  // 포인트 블루는 공용 publicDesign.accent(라이트 #155eef / 다크 #78a7ff)를 쓴다.
  // accentLink/accentControl(blue10/blue9)은 라이트 표면에서 WCAG AA 대비(<4.5)를
  // 만족하지 못해 접근성 회귀가 발생하므로 사용하지 않는다. 채운 컨트롤의 글자색은
  // 다크에서 accent가 밝은 블루라 어두운 글자(gray1)가 필요하므로 scheme별로 나눈다.
  const controlText = isLight ? c.accentControlText : c.gray1
  return `
  color-scheme: ${scheme};
  --admin-app-bg: ${d.pageBackgroundColor};
  --admin-sidebar-bg: ${sidebar};
  --admin-surface: ${d.surface};
  --admin-surface-raised: ${surfaceRaised};
  --admin-surface-muted: ${surfaceMuted};
  --admin-surface-accent: ${d.accentMuted};
  --admin-elevated-top: ${surfaceElevatedTop};
  --admin-border: ${c.gray6};
  --admin-border-strong: ${c.gray8};
  --admin-text-primary: ${c.gray12};
  --admin-text-secondary: ${c.gray11};
  --admin-text-muted: ${c.gray10};
  --admin-primary: ${d.accent};
  --admin-primary-hover: ${d.accentHover};
  --admin-accent-text: ${d.accent};
  --admin-primary-border: color-mix(in srgb, ${d.accent} 32%, transparent);
  --admin-primary-border-hover: color-mix(in srgb, ${d.accent} 52%, transparent);
  --admin-control-text: ${controlText};
  --admin-focus-ring: color-mix(in srgb, ${d.accent} 20%, transparent);
  --admin-focus-ring-strong: color-mix(in srgb, ${d.accent} 32%, transparent);
  --admin-action-group-surface: color-mix(in srgb, ${d.surface} 92%, transparent);
`
}

const adminLightThemeVariables = buildAdminThemeVariables("light", {
  colors: lightColors,
  design: lightDesign,
})

const adminDarkThemeVariables = buildAdminThemeVariables("dark", {
  colors: darkColors,
  design: darkDesign,
})

export const adminSystemThemeVariables = (theme: Theme) => `
  ${theme.scheme === "dark" ? adminDarkThemeVariables : adminLightThemeVariables}

  html[data-aquila-scheme-bootstrap-source="cookie"][data-aquila-scheme-bootstrap="dark"] &,
  html[data-aquila-scheme-bootstrap-source="system"][data-aquila-scheme-bootstrap="dark"] & {
    ${adminDarkThemeVariables}
  }

  html[data-aquila-scheme-bootstrap-source="cookie"][data-aquila-scheme-bootstrap="light"] &,
  html[data-aquila-scheme-bootstrap-source="system"][data-aquila-scheme-bootstrap="light"] & {
    ${adminLightThemeVariables}
  }
`

export const adminAppBackground = `var(--admin-app-bg, ${lightDesign.pageBackgroundColor})`
export const adminTextPrimary = `var(--admin-text-primary, ${lightColors.gray12})`
export const adminTextSecondary = `var(--admin-text-secondary, ${lightColors.gray11})`
export const adminTextMuted = `var(--admin-text-muted, ${lightColors.gray10})`
export const adminBorder = `var(--admin-border, ${lightColors.gray6})`
export const adminBorderStrong = `var(--admin-border-strong, ${lightColors.gray8})`
export const adminSurface = `var(--admin-surface, ${lightDesign.surface})`
export const adminShellSurface = `var(--admin-sidebar-bg, ${lightDesign.surface})`
export const adminSurfaceRaised = `var(--admin-surface-raised, ${lightColors.gray2})`
export const adminSurfaceMuted = `var(--admin-surface-muted, ${lightColors.gray3})`
export const adminSurfaceAccent = `var(--admin-surface-accent, ${lightDesign.accentMuted})`
export const adminElevatedSurfaceTop = `var(--admin-elevated-top, ${lightDesign.surface})`
export const adminElevatedBorderDark = `var(--admin-border, ${lightColors.gray6})`
export const adminAccentText = `var(--admin-accent-text, ${lightDesign.accent})`
export const adminGold = adminAccentText
export const adminTeal = `var(--admin-primary, ${lightDesign.accent})`
export const adminTealHover = `var(--admin-primary-hover, ${lightDesign.accentHover})`
export const adminControlText = `var(--admin-control-text, ${lightColors.accentControlText})`
export const adminTealBorder = `var(--admin-primary-border, color-mix(in srgb, ${lightDesign.accent} 32%, transparent))`
export const adminTealBorderHover = `var(--admin-primary-border-hover, color-mix(in srgb, ${lightDesign.accent} 52%, transparent))`
export const adminGoldTintSubtle = `var(--admin-surface-accent, ${lightDesign.accentMuted})`
export const adminGoldTintFocus = `var(--admin-focus-ring, color-mix(in srgb, ${lightDesign.accent} 20%, transparent))`
export const adminGoldTintFocusStrong = `var(--admin-focus-ring-strong, color-mix(in srgb, ${lightDesign.accent} 32%, transparent))`
export const adminGoldTintLine = `var(--admin-primary-border, color-mix(in srgb, ${lightDesign.accent} 32%, transparent))`
export const adminActionGroupDarkSurface = `var(--admin-action-group-surface, color-mix(in srgb, ${darkDesign.surface} 92%, transparent))`
export const adminActionGroupLightSurface = `var(--admin-action-group-surface, color-mix(in srgb, ${lightDesign.surface} 92%, transparent))`

export const usesDarkAdminSurface = (theme: Theme) => theme.scheme !== "light"

export const adminPrimaryText = (theme: Theme) =>
  adminTextPrimary

export const adminSecondaryText = (theme: Theme) =>
  adminTextSecondary

export const adminMutedText = (theme: Theme) =>
  adminTextMuted

export const adminCardBorder = (theme: Theme) =>
  adminBorder

export const adminStrongBorder = (theme: Theme) =>
  adminBorderStrong

export const adminPlainSurface = (theme: Theme) =>
  adminSurface

export const adminRaisedSurface = (theme: Theme) =>
  adminSurfaceRaised

export const adminMutedSurface = (theme: Theme) =>
  adminSurfaceMuted

export const adminAccentSurface = (theme: Theme) =>
  adminSurfaceAccent

export const adminWarningBadgeBorder = () => adminBorderStrong
export const adminWarningBadgeSurface = () => adminSurfaceAccent
export const adminWarningBadgeText = () => adminGold

export const adminFocusRing = (theme: Theme, width = 3) =>
  theme.scheme === "light"
    ? `0 0 0 ${width}px ${adminGoldTintFocus}`
    : `0 0 0 ${width}px ${adminGoldTintFocusStrong}`

export const adminActionGroupSurface = (theme: Theme) =>
  theme.scheme === "light" ? adminActionGroupLightSurface : adminActionGroupDarkSurface
