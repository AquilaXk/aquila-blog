import type { Theme } from "@emotion/react"

export const adminTextPrimary = "#f3f1ea"
export const adminTextSecondary = "#c8c1ae"
export const adminTextMuted = "#918b7d"
export const adminBorder = "#34322d"
export const adminBorderStrong = "#6d6040"
export const adminSurface = "#171817"
export const adminShellSurface = "#151614"
export const adminSurfaceRaised = "#20211f"
export const adminSurfaceMuted = "#242520"
export const adminSurfaceAccent = "#2d291a"
export const adminElevatedSurfaceTop = "#1b1c1a"
export const adminElevatedBorderDark = "#30322e"
export const adminGold = "#d0b46c"
export const adminTeal = "#3f8f86"
export const adminTealHover = "#347b73"
export const adminControlText = "#f8fffc"
export const adminTealBorder = "rgba(63, 143, 134, 0.58)"
export const adminTealBorderHover = "rgba(63, 143, 134, 0.72)"
export const adminGoldTintSubtle = "rgba(208, 180, 108, 0.14)"
export const adminGoldTintFocus = "rgba(208, 180, 108, 0.18)"
export const adminGoldTintFocusStrong = "rgba(208, 180, 108, 0.24)"
export const adminGoldTintLine = "rgba(208, 180, 108, 0.2)"
export const adminActionGroupDarkSurface = "rgba(24, 24, 24, 0.86)"
export const adminActionGroupLightSurface = "rgba(255, 255, 255, 0.82)"

export const usesDarkAdminSurface = (theme: Theme) => theme.blogDesign === "grid" || theme.scheme !== "light"

export const adminPrimaryText = (theme: Theme) =>
  usesDarkAdminSurface(theme) ? adminTextPrimary : theme.colors.gray12

export const adminSecondaryText = (theme: Theme) =>
  usesDarkAdminSurface(theme) ? adminTextSecondary : theme.colors.gray11

export const adminMutedText = (theme: Theme) =>
  usesDarkAdminSurface(theme) ? adminTextMuted : theme.colors.gray10

export const adminCardBorder = (theme: Theme) =>
  theme.blogDesign === "grid"
    ? theme.publicDesign.border
    : usesDarkAdminSurface(theme)
      ? adminBorder
      : theme.colors.gray5

export const adminStrongBorder = (theme: Theme) =>
  usesDarkAdminSurface(theme) ? adminBorderStrong : theme.colors.gray7

export const adminPlainSurface = (theme: Theme) =>
  theme.blogDesign === "grid"
    ? theme.publicDesign.operationSurface
    : usesDarkAdminSurface(theme)
      ? adminSurface
      : theme.colors.gray1

export const adminRaisedSurface = (theme: Theme) =>
  theme.blogDesign === "grid"
    ? theme.publicDesign.operationSurfaceElevated
    : usesDarkAdminSurface(theme)
      ? adminSurfaceRaised
      : theme.colors.gray2

export const adminMutedSurface = (theme: Theme) =>
  usesDarkAdminSurface(theme) ? adminSurfaceMuted : theme.colors.gray3

export const adminAccentSurface = (theme: Theme) =>
  usesDarkAdminSurface(theme) ? adminSurfaceAccent : theme.colors.accentSurfaceSubtle

export const adminWarningBadgeBorder = () => adminBorderStrong
export const adminWarningBadgeSurface = () => adminSurfaceAccent
export const adminWarningBadgeText = () => adminGold

export const adminFocusRing = (theme: Theme, width = 3) =>
  theme.scheme === "light"
    ? `0 0 0 ${width}px ${adminGoldTintFocus}`
    : `0 0 0 ${width}px ${adminGoldTintFocusStrong}`

export const adminActionGroupSurface = (theme: Theme) =>
  theme.blogDesign === "grid"
    ? theme.publicDesign.operationSurfaceElevated
    : theme.scheme === "light"
      ? adminActionGroupLightSurface
      : adminActionGroupDarkSurface
