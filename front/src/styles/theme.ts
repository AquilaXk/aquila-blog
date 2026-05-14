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

export const createPublicDesignTokens = (scheme: SchemeType, blogDesign: BlogDesignType): PublicDesignTokens => {
  if (blogDesign === "grid") {
    return {
      pageBackgroundColor: "#101214",
      pageBackgroundImage: "repeating-linear-gradient(90deg,#ba51 1px,#0000 0 5em)",
      surface: "#171a1d",
      surfaceElevated: "#202328",
      readableSurface: "#121416f5",
      operationSurface: "#101214",
      operationSurfaceElevated: "#171a1d",
      border: "#6d5a3563",
      borderStrong: "#c2a35b8a",
      accent: "#c2a35b",
      accentMuted: "#2b2418",
      shadow: "0 20px 56px #0008",
    }
  }

  const schemeColors = colors[scheme]

  return {
    pageBackgroundColor: scheme === "light" ? "#f3f5f8" : schemeColors.gray1,
    pageBackgroundImage:
      scheme === "light"
        ? "radial-gradient(circle at 18% -12%,#2563eb06,#0000 26%),radial-gradient(circle at 88% 0,#94a3b80a,#0000 22%)"
        : "none",
    surface: schemeColors.gray1,
    surfaceElevated: scheme === "light" ? schemeColors.gray2 : schemeColors.gray3,
    readableSurface: scheme === "light" ? "#ffffff" : schemeColors.gray1,
    operationSurface: scheme === "light" ? schemeColors.gray1 : schemeColors.gray2,
    operationSurfaceElevated: scheme === "light" ? schemeColors.gray2 : schemeColors.gray3,
    border: schemeColors.gray6,
    borderStrong: schemeColors.gray7,
    accent: schemeColors.accentControl,
    accentMuted: schemeColors.accentSurfaceSubtle,
    shadow: variables.ui.card.shadow,
  }
}

export const createTheme = (options: Options): Theme => ({
  scheme: options.scheme,
  blogDesign: options.blogDesign ?? "legacy",
  publicDesign: createPublicDesignTokens(options.scheme, options.blogDesign ?? "legacy"),
  colors: colors[options.scheme],
  variables: variables,
  zIndexes: zIndexes,
})
