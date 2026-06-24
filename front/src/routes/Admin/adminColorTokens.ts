import type { Theme } from "@emotion/react"

const adminLightThemeVariables = `
  color-scheme: light;
  --admin-app-bg: #f3f5f8;
  --admin-sidebar-bg: #ffffff;
  --admin-surface: #ffffff;
  --admin-surface-raised: #fcfdff;
  --admin-surface-muted: #f4f7fb;
  --admin-surface-accent: #eef6ff;
  --admin-elevated-top: #ffffff;
  --admin-border: #c8d2de;
  --admin-border-strong: #9ca8b7;
  --admin-text-primary: #0f1724;
  --admin-text-secondary: #36414f;
  --admin-text-muted: #566273;
  --admin-primary: #0969da;
  --admin-primary-hover: #075bb5;
  --admin-accent-text: #0969da;
  --admin-primary-border: rgba(9, 105, 218, 0.32);
  --admin-primary-border-hover: rgba(9, 105, 218, 0.52);
  --admin-control-text: #ffffff;
  --admin-focus-ring: rgba(9, 105, 218, 0.2);
  --admin-focus-ring-strong: rgba(9, 105, 218, 0.32);
  --admin-action-group-surface: rgba(255, 255, 255, 0.92);
`

const adminDarkThemeVariables = `
  color-scheme: dark;
  --admin-app-bg: #121212;
  --admin-sidebar-bg: #181818;
  --admin-surface: #121212;
  --admin-surface-raised: #1f1f1f;
  --admin-surface-muted: #181818;
  --admin-surface-accent: rgba(122, 182, 255, 0.18);
  --admin-elevated-top: #1f1f1f;
  --admin-border: #363636;
  --admin-border-strong: #4f4f4f;
  --admin-text-primary: #f5f5f5;
  --admin-text-secondary: #d8d8d8;
  --admin-text-muted: #b2b2b2;
  --admin-primary: #7ab6ff;
  --admin-primary-hover: #9bcbff;
  --admin-accent-text: #7ab6ff;
  --admin-primary-border: rgba(122, 182, 255, 0.46);
  --admin-primary-border-hover: rgba(122, 182, 255, 0.66);
  --admin-control-text: #101214;
  --admin-focus-ring: rgba(122, 182, 255, 0.3);
  --admin-focus-ring-strong: rgba(122, 182, 255, 0.42);
  --admin-action-group-surface: rgba(18, 18, 18, 0.92);
`

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

export const adminAppBackground = "var(--admin-app-bg, #f3f5f8)"
export const adminTextPrimary = "var(--admin-text-primary, #0f1724)"
export const adminTextSecondary = "var(--admin-text-secondary, #36414f)"
export const adminTextMuted = "var(--admin-text-muted, #566273)"
export const adminBorder = "var(--admin-border, #c8d2de)"
export const adminBorderStrong = "var(--admin-border-strong, #9ca8b7)"
export const adminSurface = "var(--admin-surface, #ffffff)"
export const adminShellSurface = "var(--admin-sidebar-bg, #ffffff)"
export const adminSurfaceRaised = "var(--admin-surface-raised, #fcfdff)"
export const adminSurfaceMuted = "var(--admin-surface-muted, #f4f7fb)"
export const adminSurfaceAccent = "var(--admin-surface-accent, #eef6ff)"
export const adminElevatedSurfaceTop = "var(--admin-elevated-top, #ffffff)"
export const adminElevatedBorderDark = "var(--admin-border, #c8d2de)"
export const adminAccentText = "var(--admin-accent-text, #0969da)"
export const adminGold = adminAccentText
export const adminTeal = "var(--admin-primary, #0969da)"
export const adminTealHover = "var(--admin-primary-hover, #075bb5)"
export const adminControlText = "var(--admin-control-text, #ffffff)"
export const adminTealBorder = "var(--admin-primary-border, rgba(9, 105, 218, 0.32))"
export const adminTealBorderHover = "var(--admin-primary-border-hover, rgba(9, 105, 218, 0.52))"
export const adminGoldTintSubtle = "var(--admin-surface-accent, #eef6ff)"
export const adminGoldTintFocus = "var(--admin-focus-ring, rgba(9, 105, 218, 0.2))"
export const adminGoldTintFocusStrong = "var(--admin-focus-ring-strong, rgba(9, 105, 218, 0.32))"
export const adminGoldTintLine = "var(--admin-primary-border, rgba(9, 105, 218, 0.32))"
export const adminActionGroupDarkSurface = "var(--admin-action-group-surface, rgba(18, 18, 18, 0.92))"
export const adminActionGroupLightSurface = "var(--admin-action-group-surface, rgba(255, 255, 255, 0.92))"

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
