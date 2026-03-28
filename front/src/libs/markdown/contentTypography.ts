import { css } from "@emotion/react"

type ThemeLike = {
  colors: Record<string, string>
  scheme?: "light" | "dark"
}

export const markdownContentTypography = (selector: string, theme: ThemeLike) => css`
  ${selector} {
    color: ${theme.colors.gray12};
    line-height: 1.7;
    font-size: 1.125rem;
  }

  ${selector} h1,
  ${selector} h2,
  ${selector} h3,
  ${selector} h4 {
    line-height: 1.34;
    letter-spacing: -0.017em;
    margin-top: 1.65rem;
    margin-bottom: 0.68rem;
    font-weight: 760;
  }

  ${selector} h1 {
    font-size: clamp(1.88rem, 3vw, 2.3rem);
  }

  ${selector} h2 {
    font-size: clamp(1.5rem, 2.35vw, 1.84rem);
  }

  ${selector} h3 {
    font-size: clamp(1.2rem, 1.9vw, 1.42rem);
  }

  ${selector} h4 {
    font-size: 1.04rem;
  }

  ${selector} p {
    margin: 0.72rem 0;
    font-size: 1.125rem;
    line-height: 1.7;
    overflow-wrap: anywhere;
  }

  ${selector} a {
    color: ${theme.scheme === "dark" ? "#7ab6ff" : "#0969da"};
    text-decoration: underline;
    text-underline-offset: 0.16em;
    text-decoration-thickness: 0.08em;
    word-break: break-word;
  }

  ${selector} a:hover {
    color: ${theme.scheme === "dark" ? "#a8ceff" : "#0a58ca"};
  }

  ${selector} blockquote {
    margin: 0.95rem 0;
    padding: 0.12rem 0 0.12rem 1rem;
    border-left: 4px solid ${theme.colors.gray7};
    color: ${theme.colors.gray11};
    background: transparent;
  }

  ${selector} blockquote > :first-of-type {
    margin-top: 0;
  }

  ${selector} blockquote > :last-child {
    margin-bottom: 0;
  }

  ${selector} ul,
  ${selector} ol {
    margin: 0.68rem 0;
    padding-left: 1.28rem;
  }

  ${selector} li + li {
    margin-top: 0.22rem;
  }

  ${selector} li {
    line-height: 1.78;
    overflow-wrap: anywhere;
  }

  ${selector} hr {
    border: 0;
    border-top: 1px solid ${theme.colors.gray6};
    margin: 1rem 0;
  }

  ${selector} :not(pre) > code,
  ${selector} li > code,
  ${selector} p > code,
  ${selector} blockquote > code,
  ${selector} .aq-inline-code {
    border-radius: 6px;
    padding: 0.16rem 0.38rem;
    background: ${theme.colors.gray4};
    font-size: 0.9em;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
      "Courier New", monospace;
  }
`
