import {
  gray,
  blue,
  red,
  green,
  grayDark,
  blueDark,
  redDark,
  greenDark,
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
  gray2: "#fbfcfe",
  gray3: "#f5f7fa",
  gray4: "#edf1f6",
  gray5: "#dfe5ec",
  gray6: "#d0d8e2",
  gray7: "#bec9d5",
  gray8: "#a8b5c4",
  gray9: "#7f8c9d",
  gray10: "#5b6472",
  gray11: "#3e4652",
  gray12: "#111827",
}

export const colors = {
  light: {
    ...indigo,
    ...gray,
    ...balancedLightGray,
    ...blue,
    ...red,
    ...green,
  },
  dark: {
    ...indigoDark,
    ...grayDark,
    ...nearBlackDarkGray,
    ...blueDark,
    ...redDark,
    ...greenDark,
  },
}
