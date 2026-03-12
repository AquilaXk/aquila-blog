import React, { ReactNode } from "react"

type Props = {
  className?: string
  children?: ReactNode
}

export const Emoji = ({ className, children }: Props) => {
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        lineHeight: 1,
        flexShrink: 0,
        fontFamily:
          '"Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", sans-serif',
        textRendering: "optimizeLegibility",
      }}
    >
      {children}
    </span>
  )
}
