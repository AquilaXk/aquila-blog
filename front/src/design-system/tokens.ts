import type { Theme } from "@emotion/react"

export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extraBold: 800,
} as const

export const typeScale = {
  h1: { size: "2.5rem", line: 1.15, weight: fontWeight.extraBold },
  h2: { size: "1.75rem", line: 1.25, weight: fontWeight.bold },
  h3: { size: "1.25rem", line: 1.35, weight: fontWeight.bold },
  body: { size: "1rem", line: 1.7, weight: fontWeight.regular },
  small: { size: "0.875rem", line: 1.5, weight: fontWeight.medium },
  caption: { size: "0.75rem", line: 1.4, weight: fontWeight.semibold },
} as const

export const control = {
  sm: 36,
  md: 40,
  lg: 44,
} as const

export const breakpoint = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  xxl: 1440,
} as const

export const semanticColors = (theme: Theme) => ({
  canvas: theme.publicDesign.pageBackgroundColor,
  surface: theme.publicDesign.surface,
  surfaceRaised: theme.publicDesign.surfaceElevated,
  surfaceMuted: theme.colors.gray2,
  textPrimary: theme.colors.gray12,
  textSecondary: theme.colors.gray11,
  textMuted: theme.colors.gray10,
  border: theme.publicDesign.border,
  borderStrong: theme.publicDesign.borderStrong,
  accent: theme.colors.accentControl,
  accentHover: theme.colors.accentControlHover,
  accentText: theme.colors.accentControlText,
  accentLink: theme.colors.accentLink,
  accentSurface: theme.colors.accentSurfaceSubtle,
  danger: theme.colors.statusDangerText,
  dangerSurface: theme.colors.statusDangerSurface,
  success: theme.colors.statusSuccessText,
  successSurface: theme.colors.statusSuccessSurface,
})

export const designTokens = {
  space,
  radius,
  fontWeight,
  typeScale,
  control,
  breakpoint,
  semanticColors,
} as const
