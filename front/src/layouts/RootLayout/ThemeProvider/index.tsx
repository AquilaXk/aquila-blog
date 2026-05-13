import { ThemeProvider as _ThemeProvider } from "@emotion/react"
import { Global } from "./Global"
import { createTheme } from "src/styles"
import type { BlogDesignType, SchemeType } from "src/types"

type Props = {
  scheme: SchemeType
  blogDesign?: BlogDesignType
  children?: React.ReactNode
}

export const ThemeProvider = ({ scheme, blogDesign, children }: Props) => {
  const theme = createTheme({ scheme, blogDesign })

  return (
    <_ThemeProvider theme={theme}>
      <Global />
      {children}
    </_ThemeProvider>
  )
}
