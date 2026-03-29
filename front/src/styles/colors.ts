import {
  gray,
  blue,
  red,
  green,
  orange,
  grayDark,
  blueDark,
  redDark,
  greenDark,
  orangeDark,
  indigo,
  indigoDark,
} from "@radix-ui/colors"

export type Colors = typeof colors.light & typeof colors.dark

const nearBlackDarkGray = {
  gray1: "#0d0f12",
  gray2: "#12151a",
  gray3: "#171b21",
  gray4: "#1d222b",
  gray5: "#232932",
  gray6: "#2a3038",
  gray7: "#343c47",
  gray8: "#404a58",
  gray9: "#5a6678",
  gray10: "#a6adbb",
  gray11: "#c9d0da",
  gray12: "#f3f4f6",
}

const balancedLightGray = {
  gray1: "#ffffff",
  gray2: "#fcfdff",
  gray3: "#f4f7fb",
  gray4: "#e7edf4",
  gray5: "#d7e0ea",
  gray6: "#c8d2de",
  gray7: "#b5c1ce",
  gray8: "#9ca8b7",
  gray9: "#778396",
  gray10: "#566273",
  gray11: "#36414f",
  gray12: "#0f1724",
}

const semanticLight = {
  accentLink: blue.blue10,
  accentControl: blue.blue9,
  accentControlHover: blue.blue10,
  accentControlText: "#ffffff",
  accentSurfaceSubtle: blue.blue3,
  accentSurfaceStrong: blue.blue4,
  accentBorder: blue.blue8,
  statusSuccessSurface: green.green3,
  statusSuccessBorder: green.green7,
  statusSuccessText: green.green11,
  statusDangerSurface: red.red3,
  statusDangerBorder: red.red7,
  statusDangerText: red.red11,
}

const semanticDark = {
  accentLink: blueDark.blue10,
  accentControl: blueDark.blue9,
  accentControlHover: blueDark.blue10,
  accentControlText: "#f8fafc",
  accentSurfaceSubtle: "rgba(59, 130, 246, 0.12)",
  accentSurfaceStrong: "rgba(59, 130, 246, 0.18)",
  accentBorder: blueDark.blue8,
  statusSuccessSurface: "rgba(34, 197, 94, 0.14)",
  statusSuccessBorder: greenDark.green8,
  statusSuccessText: greenDark.green11,
  statusDangerSurface: "rgba(239, 68, 68, 0.14)",
  statusDangerBorder: redDark.red8,
  statusDangerText: redDark.red11,
}

export const colors = {
  light: {
    ...indigo,
    ...gray,
    ...balancedLightGray,
    ...blue,
    ...red,
    ...green,
    ...orange,
    ...semanticLight,
  },
  dark: {
    ...indigoDark,
    ...grayDark,
    ...nearBlackDarkGray,
    ...blueDark,
    ...redDark,
    ...greenDark,
    ...orangeDark,
    ...semanticDark,
  },
}
