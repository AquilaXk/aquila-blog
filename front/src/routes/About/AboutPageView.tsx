import type { ReactNode } from "react"
import { StyledWrapper } from "./AboutPage.styles"

type AboutPageViewProps = {
  children: ReactNode
}

export const AboutPageView = ({ children }: AboutPageViewProps) => (
  <StyledWrapper>
    <article className="about-content">{children}</article>
  </StyledWrapper>
)
