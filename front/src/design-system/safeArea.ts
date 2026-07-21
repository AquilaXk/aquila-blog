import { css } from "@emotion/react"

export const safeAreaInset = {
  top: "env(safe-area-inset-top, 0px)",
  right: "env(safe-area-inset-right, 0px)",
  bottom: "env(safe-area-inset-bottom, 0px)",
  left: "env(safe-area-inset-left, 0px)",
} as const

export const safeAreaMax = (edge: keyof typeof safeAreaInset, base: string) =>
  `max(${base}, ${safeAreaInset[edge]})`

export const modalSafeAreaPadding = css`
  padding-top: max(1rem, env(safe-area-inset-top, 0px));
  padding-right: max(1rem, env(safe-area-inset-right, 0px));
  padding-bottom: max(1rem, env(safe-area-inset-bottom, 0px));
  padding-left: max(1rem, env(safe-area-inset-left, 0px));
`

export const fixedBottomSafeArea = (base = "1.2rem") => css`
  bottom: max(${base}, env(safe-area-inset-bottom, 0px));
`

export const fixedHorizontalSafeArea = (base = "0.85rem") => css`
  left: max(${base}, env(safe-area-inset-left, 0px));
  right: max(${base}, env(safe-area-inset-right, 0px));
`
