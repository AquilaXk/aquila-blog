import type { Theme } from "@emotion/react"

const adminLightThemeVariables = `
  color-scheme: light;
  --admin-app-bg: #ffffff;
  --admin-sidebar-bg: #f6f7fb;
  --admin-surface: #ffffff;
  --admin-surface-raised: #f3f5f9;
  --admin-surface-muted: #eef2f7;
  --admin-surface-accent: #f7f1e3;
  --admin-elevated-top: #ffffff;
  --admin-border: #e5e9f1;
  --admin-border-strong: #c8d1df;
  --admin-text-primary: #20242b;
  --admin-text-secondary: #4d5562;
  --admin-text-muted: #566273;
  --admin-primary: #b9954f;
  --admin-primary-hover: #9d7d3f;
  --admin-accent-text: #6f5524;
  --admin-primary-border: rgba(185, 149, 79, 0.36);
  --admin-primary-border-hover: rgba(185, 149, 79, 0.58);
  --admin-control-text: #101214;
  --admin-focus-ring: rgba(185, 149, 79, 0.18);
  --admin-focus-ring-strong: rgba(185, 149, 79, 0.26);
  --admin-action-group-surface: rgba(255, 255, 255, 0.88);
`

const adminDarkThemeVariables = `
  color-scheme: dark;
  --admin-app-bg: #121212;
  --admin-sidebar-bg: #181818;
  --admin-surface: #121212;
  --admin-surface-raised: #1b1b1b;
  --admin-surface-muted: #222222;
  --admin-surface-accent: #2d291a;
  --admin-elevated-top: #181818;
  --admin-border: #2f333a;
  --admin-border-strong: #4a5464;
  --admin-text-primary: #f5f6f8;
  --admin-text-secondary: #c8ced7;
  --admin-text-muted: #8f99a7;
  --admin-primary: #d0b46c;
  --admin-primary-hover: #e0c984;
  --admin-accent-text: #d0b46c;
  --admin-primary-border: rgba(208, 180, 108, 0.42);
  --admin-primary-border-hover: rgba(208, 180, 108, 0.62);
  --admin-control-text: #101214;
  --admin-focus-ring: rgba(208, 180, 108, 0.22);
  --admin-focus-ring-strong: rgba(208, 180, 108, 0.3);
  --admin-action-group-surface: rgba(18, 18, 18, 0.88);
`

export const adminSystemThemeVariables = (theme: Theme) =>
  theme.scheme === "dark" ? adminDarkThemeVariables : adminLightThemeVariables

export const adminAppBackground = "var(--admin-app-bg, #ffffff)"
export const adminTextPrimary = "var(--admin-text-primary, #20242b)"
export const adminTextSecondary = "var(--admin-text-secondary, #4d5562)"
export const adminTextMuted = "var(--admin-text-muted, #566273)"
export const adminBorder = "var(--admin-border, #e5e9f1)"
export const adminBorderStrong = "var(--admin-border-strong, #c8d1df)"
export const adminSurface = "var(--admin-surface, #ffffff)"
export const adminShellSurface = "var(--admin-sidebar-bg, #f6f7fb)"
export const adminSurfaceRaised = "var(--admin-surface-raised, #f3f5f9)"
export const adminSurfaceMuted = "var(--admin-surface-muted, #eef2f7)"
export const adminSurfaceAccent = "var(--admin-surface-accent, #f7f1e3)"
export const adminElevatedSurfaceTop = "var(--admin-elevated-top, #ffffff)"
export const adminElevatedBorderDark = "var(--admin-border, #e5e9f1)"
export const adminGold = "var(--admin-accent-text, #6f5524)"
export const adminTeal = "var(--admin-primary, #b9954f)"
export const adminTealHover = "var(--admin-primary-hover, #9d7d3f)"
export const adminControlText = "var(--admin-control-text, #101214)"
export const adminTealBorder = "var(--admin-primary-border, rgba(185, 149, 79, 0.36))"
export const adminTealBorderHover = "var(--admin-primary-border-hover, rgba(185, 149, 79, 0.58))"
export const adminGoldTintSubtle = "var(--admin-surface-accent, #f7f1e3)"
export const adminGoldTintFocus = "var(--admin-focus-ring, rgba(185, 149, 79, 0.18))"
export const adminGoldTintFocusStrong = "var(--admin-focus-ring-strong, rgba(185, 149, 79, 0.26))"
export const adminGoldTintLine = "var(--admin-primary-border, rgba(185, 149, 79, 0.36))"
export const adminActionGroupDarkSurface = "var(--admin-action-group-surface, rgba(18, 18, 18, 0.88))"
export const adminActionGroupLightSurface = "var(--admin-action-group-surface, rgba(255, 255, 255, 0.88))"

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
