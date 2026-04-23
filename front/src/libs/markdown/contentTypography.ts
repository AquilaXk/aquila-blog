import { css } from "@emotion/react"

type ThemeLike = {
  colors: Record<string, string>
  scheme?: "light" | "dark"
}

export const articleTypographyScale = {
  postTitleFontSize: "2.75rem",
  postTitleLineHeight: "52px",
  postTitleFontSizeMobile: "2.5rem",
  postTitleLineHeightMobile: "48px",
  h1FontSize: "2rem",
  h1LineHeight: "40px",
  h1FontSizeMobile: "1.875rem",
  h1LineHeightMobile: "39px",
  h2FontSize: "1.625rem",
  h2LineHeight: "36px",
  h2FontSizeMobile: "1.5rem",
  h2LineHeightMobile: "31.2px",
  h3FontSize: "1.375rem",
  h3LineHeight: "31px",
  h3FontSizeMobile: "1.25rem",
  h3LineHeightMobile: "26px",
  h4FontSize: "1.125rem",
  h4LineHeight: "27px",
  h4FontSizeMobile: "1rem",
  h4LineHeightMobile: "24px",
  bodyFontSize: "1.0625rem",
  bodyLineHeight: "28px",
  bodyFontSizeMobile: "1rem",
  bodyLineHeightMobile: "24px",
  codeFontSize: "0.9375rem",
  codeLineHeight: "23px",
  codeFontSizeMobile: "0.85rem",
  codeLineHeightMobile: "20.4px",
  calloutTitleFontSize: "1.0625rem",
  calloutTitleLineHeight: "28px",
  calloutTitleFontSizeMobile: "1rem",
  calloutTitleLineHeightMobile: "24px",
} as const

export const markdownContentTypography = (selector: string, theme: ThemeLike) => css`
  ${selector} {
    color: ${theme.colors.gray12};
    line-height: ${articleTypographyScale.bodyLineHeight};
    font-size: ${articleTypographyScale.bodyFontSize};
  }

  ${selector} h1,
  ${selector} h2,
  ${selector} h3,
  ${selector} h4 {
    letter-spacing: 0;
    margin-top: 1.65rem;
    margin-bottom: 0.68rem;
    font-weight: 600;
  }

  ${selector} h1 {
    font-size: ${articleTypographyScale.h1FontSize};
    line-height: ${articleTypographyScale.h1LineHeight};
  }

  ${selector} h2 {
    font-size: ${articleTypographyScale.h2FontSize};
    line-height: ${articleTypographyScale.h2LineHeight};
  }

  ${selector} h3 {
    font-size: ${articleTypographyScale.h3FontSize};
    line-height: ${articleTypographyScale.h3LineHeight};
  }

  ${selector} h4 {
    font-size: ${articleTypographyScale.h4FontSize};
    line-height: ${articleTypographyScale.h4LineHeight};
  }

  ${selector} p {
    margin: 0.72rem 0;
    font-size: ${articleTypographyScale.bodyFontSize};
    line-height: ${articleTypographyScale.bodyLineHeight};
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
    line-height: ${articleTypographyScale.bodyLineHeight};
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
    font-size: ${articleTypographyScale.codeFontSize};
    line-height: ${articleTypographyScale.codeLineHeight};
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
      "Courier New", monospace;
  }

  @media (max-width: 768px) {
    ${selector} {
      line-height: ${articleTypographyScale.bodyLineHeightMobile};
      font-size: ${articleTypographyScale.bodyFontSizeMobile};
    }

    ${selector} h1 {
      font-size: ${articleTypographyScale.h1FontSizeMobile};
      line-height: ${articleTypographyScale.h1LineHeightMobile};
    }

    ${selector} h2 {
      font-size: ${articleTypographyScale.h2FontSizeMobile};
      line-height: ${articleTypographyScale.h2LineHeightMobile};
    }

    ${selector} h3 {
      font-size: ${articleTypographyScale.h3FontSizeMobile};
      line-height: ${articleTypographyScale.h3LineHeightMobile};
    }

    ${selector} h4 {
      font-size: ${articleTypographyScale.h4FontSizeMobile};
      line-height: ${articleTypographyScale.h4LineHeightMobile};
    }

    ${selector} p,
    ${selector} li {
      font-size: ${articleTypographyScale.bodyFontSizeMobile};
      line-height: ${articleTypographyScale.bodyLineHeightMobile};
    }

    ${selector} :not(pre) > code,
    ${selector} li > code,
    ${selector} p > code,
    ${selector} blockquote > code,
    ${selector} .aq-inline-code {
      font-size: ${articleTypographyScale.codeFontSizeMobile};
      line-height: ${articleTypographyScale.codeLineHeightMobile};
    }
  }
`
