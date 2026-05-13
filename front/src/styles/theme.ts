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
  border: string
  borderStrong: string
  accent: string
  accentMuted: string
  textMuted: string
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
      pageBackgroundColor: "#090909",
      pageBackgroundImage:
        "linear-gradient(#540e0e38,#0000 34%),repeating-linear-gradient(90deg,#b88a4c0e,#b88a4c0e 1px,#0000 1px,#0000 96px)",
      surface: "#111111",
      surfaceElevated: "#181715",
      border: "rgba(151, 125, 85, 0.28)",
      borderStrong: "rgba(190, 143, 75, 0.48)",
      accent: "#b88a4c",
      accentMuted: "rgba(184, 138, 76, 0.18)",
      textMuted: "#a7a29a",
      shadow: "0 18px 50px rgba(0, 0, 0, 0.42)",
    }
  }

  const schemeColors = colors[scheme]

  return {
    pageBackgroundColor: scheme === "light" ? "#f3f5f8" : schemeColors.gray1,
    pageBackgroundImage:
      scheme === "light"
        ? "radial-gradient(circle at 18% -12%,#2563eb06,transparent 26%),radial-gradient(circle at 88% 0%,#94a3b80a,transparent 22%)"
        : "none",
    surface: schemeColors.gray1,
    surfaceElevated: scheme === "light" ? schemeColors.gray2 : schemeColors.gray3,
    border: schemeColors.gray6,
    borderStrong: schemeColors.gray7,
    accent: schemeColors.accentControl,
    accentMuted: schemeColors.accentSurfaceSubtle,
    textMuted: schemeColors.gray10,
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
