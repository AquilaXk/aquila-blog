import { Theme } from "@emotion/react"
import { Colors, colors } from "./colors"
import { variables } from "./variables"
import { zIndexes } from "./zIndexes"
import type { BlogDesignType, SchemeType } from "src/types"

export type PublicDesignTokens = {
  pageBackgroundColor: string
  pageBackgroundImage: string
  surface: string
  surfaceElevated: string
  readableSurface: string
  operationSurface: string
  operationSurfaceElevated: string
  border: string
  borderStrong: string
  accent: string
  accentHover: string
  accentMuted: string
  shadow: string
}

declare module "@emotion/react" {
  export interface Theme {
    scheme: SchemeType
    blogDesign: BlogDesignType
    publicDesign: PublicDesignTokens
    colors: Colors
    zIndexes: typeof zIndexes
    variables: typeof variables
  }
}

type Options = {
  scheme: SchemeType
  blogDesign?: BlogDesignType
}

export const createPublicDesignTokens = (scheme: SchemeType): PublicDesignTokens => {
  const schemeColors = colors[scheme]

  return {
    pageBackgroundColor: scheme === "light" ? "#f7f7f5" : schemeColors.gray1,
    pageBackgroundImage: "none",
    surface: schemeColors.gray1,
    surfaceElevated: scheme === "light" ? "#f0f1f2" : schemeColors.gray3,
    readableSurface: scheme === "light" ? "#ffffff" : schemeColors.gray1,
    operationSurface: scheme === "light" ? schemeColors.gray1 : schemeColors.gray2,
    operationSurfaceElevated: scheme === "light" ? schemeColors.gray2 : schemeColors.gray3,
    border: scheme === "light" ? "#dfe1e5" : schemeColors.gray6,
    borderStrong: scheme === "light" ? "#c8ccd2" : schemeColors.gray7,
    accent: scheme === "light" ? "#155eef" : "#78a7ff",
    accentHover: scheme === "light" ? "#0d4ed8" : "#9bbdff",
    accentMuted: scheme === "light" ? "#edf4ff" : "#17243d",
    shadow: variables.ui.card.shadow,
  }
}

export const createTheme = (options: Options): Theme => ({
  scheme: options.scheme,
  blogDesign: options.blogDesign ?? "legacy",
  publicDesign: createPublicDesignTokens(options.scheme),
  colors: colors[options.scheme],
  variables: variables,
  zIndexes: zIndexes,
})
