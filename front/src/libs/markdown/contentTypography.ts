import { css } from "@emotion/react"

type ThemeLike = {
  colors: Record<string, string>
  scheme?: "light" | "dark"
}

export const markdownContentTypography = (selector: string, theme: ThemeLike) => css`
  ${selector} {
    color: ${theme.colors.gray12};
    line-height: 1.5;
    font-size: 1rem;
  }

  ${selector} h1,
  ${selector} h2,
  ${selector} h3,
  ${selector} h4 {
    line-height: 1.3;
    letter-spacing: 0;
    margin-top: 1.65rem;
    margin-bottom: 0.68rem;
    font-weight: 600;
  }

  ${selector} h1 {
    font-size: 1.875rem;
  }

  ${selector} h2 {
    font-size: 1.5rem;
  }

  ${selector} h3 {
    font-size: 1.25rem;
  }

  ${selector} h4 {
    font-size: 1rem;
  }

  ${selector} p {
    margin: 0.72rem 0;
    font-size: 1rem;
    line-height: 1.5;
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
    line-height: 1.5;
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
    border-radius: 0.42rem;
    padding: 0.14em 0.4em 0.16em;
    background: rgba(255, 255, 255, 0.075);
    color: #ff6b6b;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
    letter-spacing: -0.01em;
    font-size: 0.92em;
    line-height: inherit;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
      "Courier New", monospace;
  }
`
