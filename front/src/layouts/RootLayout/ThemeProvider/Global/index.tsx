import { Global as _Global, css, useTheme } from "@emotion/react"

import { ThemeProvider as _ThemeProvider } from "@emotion/react"
import { pretendard } from "src/assets"

export const Global = () => {
  const theme = useTheme()
  const bodyBackgroundColor = theme.scheme === "light" ? "#f3f5f8" : theme.colors.gray1
  const bodyBackgroundImage =
    theme.scheme === "light"
      ? "radial-gradient(circle at 18% -12%, rgba(37, 99, 235, 0.025), transparent 26%), radial-gradient(circle at 88% 0%, rgba(148, 163, 184, 0.04), transparent 22%)"
      : "none"

  return (
    <_Global
      styles={css`
        html {
          min-height: 100%;
          -webkit-text-size-adjust: 100%;
          text-size-adjust: 100%;
          overflow-x: visible;
          --article-readable-width: 48rem;
          --editor-split-readable-width: 42rem;
        }

        body {
          display: block;
          min-height: 100%;
          margin: 0;
          padding: 0;
          overflow-y: scroll;
          overflow-x: visible;
          color: ${theme.colors.gray12};
          background-color: ${bodyBackgroundColor};
          background-image: ${bodyBackgroundImage};
          font-family: ${pretendard.style.fontFamily};
          font-weight: ${pretendard.style.fontWeight};
          font-style: ${pretendard.style.fontStyle};
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          /* Pretendard local bundle has no italic face, so allow style synthesis only. */
          font-synthesis: style;
        }

        @media (max-width: 1199px) {
          html,
          body {
            overflow-x: clip;
          }
        }

        @media (min-width: 1200px) {
          html {
            scrollbar-gutter: stable;
          }

          [data-sticky-rail-safe="true"] {
            overflow: visible !important;
            overflow-x: visible !important;
          }
        }

        @supports not (overflow: clip) {
          @media (max-width: 1199px) {
            html,
            body {
              overflow-x: hidden;
            }
          }
        }

        ::selection {
          background: ${theme.colors.blue7};
          color: #fff;
        }

        * {
          color-scheme: ${theme.scheme};
          box-sizing: border-box;
        }

        h1,
        h2,
        h3,
        h4,
        h5,
        h6 {
          margin: 0;
          font-weight: inherit;
          font-style: inherit;
        }

        a {
          color: inherit;
          text-decoration: none;
          font: inherit;
          cursor: pointer;
        }

        ul {
          padding: 0;
        }

        button {
          border: 0;
          background: none;
          padding: 0;
          margin: 0;
          font: inherit;
          color: inherit;
          line-height: inherit;
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
        }

        button:disabled {
          cursor: not-allowed;
          opacity: 0.58;
        }

        a:focus-visible,
        button:focus-visible,
        [role="button"]:focus-visible,
        input:focus-visible,
        textarea:focus-visible,
        select:focus-visible {
          outline: 2px solid ${theme.colors.indigo8};
          outline-offset: 2px;
          border-radius: 0.5rem;
        }

        input {
          margin: 0;
          padding: 0;
          border: none;
          background: transparent;
          color: inherit;
          font: inherit;
          line-height: inherit;
          box-sizing: border-box;
        }

        // init textarea
        textarea {
          border: none;
          background-color: transparent;
          font-family: inherit;
          padding: 0;
          outline: none;
          resize: none;
          color: inherit;
        }

        hr {
          width: 100%;
          border: none;
          margin: 0;
          border-top: 1px solid ${theme.colors.gray6};
        }

        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }
      `}
    />
  )
}
