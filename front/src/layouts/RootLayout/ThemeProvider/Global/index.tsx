import { Global as _Global, css, useTheme } from "@emotion/react"

import { pretendard } from "src/assets"
import { colors, createPublicDesignTokens } from "src/styles"

const lightDesign = createPublicDesignTokens("light")
const darkDesign = createPublicDesignTokens("dark")
const lightColors = colors.light
const darkColors = colors.dark

export const Global = () => {
  const theme = useTheme()

  return (
    <_Global
      styles={css`
        html {
          min-height: 100%;
          color-scheme: ${theme.scheme};
          -webkit-text-size-adjust: 100%;
          text-size-adjust: 100%;
          overflow-x: visible;
          --article-readable-width: 48rem;
          --editor-split-readable-width: 42rem;
          --aq-page-bg: ${lightDesign.pageBackgroundColor};
          --aq-page-bg-image: ${lightDesign.pageBackgroundImage};
          --aq-surface: ${lightDesign.readableSurface};
          --aq-surface-elevated: ${lightDesign.surfaceElevated};
          --aq-border: ${lightDesign.border};
          --aq-border-strong: ${lightDesign.borderStrong};
          --aq-text: ${lightColors.gray12};
          --aq-text-secondary: ${lightColors.gray11};
          --aq-muted: ${lightColors.gray10};
          --aq-subtle: ${lightColors.gray9};
          --aq-header-bg: color-mix(in srgb, ${lightDesign.pageBackgroundColor} 92%, transparent);
          --aq-accent: ${lightDesign.accent};
          --aq-accent-muted: ${lightDesign.accentMuted};
          --aq-accent-link: ${lightColors.accentLink};
          --aq-on-accent: ${lightColors.accentControlText};
          --aq-focus-ring: ${lightColors.indigo8};
          --aq-feed-chip-bg: ${lightDesign.readableSurface};
          --aq-feed-hero-glow: ${lightDesign.accentMuted};
          --aq-card-cover-bg: linear-gradient(135deg, ${lightDesign.accentMuted}, ${lightColors.gray2}), ${lightDesign.readableSurface};
        }

        html[data-aquila-scheme="dark"] {
          --aq-page-bg: ${darkDesign.pageBackgroundColor};
          --aq-page-bg-image: ${darkDesign.pageBackgroundImage};
          --aq-surface: ${darkDesign.readableSurface};
          --aq-surface-elevated: ${darkDesign.surfaceElevated};
          --aq-border: ${darkDesign.border};
          --aq-border-strong: ${darkDesign.borderStrong};
          --aq-text: ${darkColors.gray12};
          --aq-text-secondary: ${darkColors.gray11};
          --aq-muted: ${darkColors.gray10};
          --aq-subtle: ${darkColors.gray9};
          --aq-header-bg: color-mix(in srgb, ${darkDesign.pageBackgroundColor} 92%, transparent);
          --aq-accent: ${darkDesign.accent};
          --aq-accent-muted: ${darkDesign.accentMuted};
          --aq-accent-link: ${darkColors.accentLink};
          --aq-on-accent: ${darkColors.gray1};
          --aq-focus-ring: ${darkColors.indigo8};
          --aq-feed-chip-bg: ${darkDesign.surfaceElevated};
          --aq-feed-hero-glow: ${darkDesign.accentMuted};
          --aq-card-cover-bg: linear-gradient(135deg, ${darkDesign.accentMuted}, ${darkColors.gray2}), ${darkDesign.readableSurface};
        }

        body {
          display: block;
          min-height: 100%;
          margin: 0;
          padding: 0;
          overflow-y: scroll;
          overflow-x: visible;
          color: var(--aq-text);
          background-color: var(--aq-page-bg);
          background-image: var(--aq-page-bg-image);
          font-family: ${pretendard.style.fontFamily};
          font-weight: ${pretendard.style.fontWeight};
          font-style: ${pretendard.style.fontStyle};
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          /* Pretendard first-visit bundle uses regular+bold only; allow weight/style synthesis for mid weights. */
          font-synthesis: weight style;
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
          border-top: 1px solid var(--aq-border);
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
