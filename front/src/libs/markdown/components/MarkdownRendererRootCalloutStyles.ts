import { css, type Theme } from "@emotion/react"
import { articleTypographyScale } from "src/libs/markdown/contentTypography"

export const markdownRendererRootCalloutStyles = (theme: Theme) => css`
  .aq-callout.aq-admonition {
    --ad-accent: ${theme.publicDesign.accent};
    --ad-body-bg: ${theme.publicDesign.readableSurface};
    --ad-border: ${theme.colors.gray6};
    --ad-text: ${theme.colors.gray12};
    position: relative;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    gap: 13px;
    border: 1px solid var(--ad-border);
    border-radius: 0;
    overflow: visible;
    padding: 19px 20px;
    margin: 30px 0;
    background: var(--ad-body-bg);
    color: var(--ad-text);
  }

  .aq-callout.aq-admonition > * {
    position: relative;
    z-index: 2;
  }

  .aq-callout.aq-admonition .aq-callout-box-text {
    grid-column: 2;
    margin-left: 0;
    padding: 0;
    color: var(--ad-text);
  }

  .aq-callout.aq-admonition .aq-callout-head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 0;
    margin: 0 0 5px;
    padding: 0;
    background: transparent;
    border-bottom: 0;
  }

  .aq-callout.aq-admonition .aq-callout-head[data-has-title="false"] {
    margin-bottom: 0;
  }

  .aq-callout.aq-admonition .aq-callout-emoji {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    margin-left: -47px;
    border: 1px solid currentColor;
    color: var(--ad-accent);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace;
    font-size: 12px;
    font-weight: 800;
    line-height: 1;
  }

  .aq-callout.aq-admonition .aq-callout-title {
    color: var(--ad-accent);
    font-size: ${articleTypographyScale.calloutTitleFontSize};
    font-weight: 750;
    line-height: ${articleTypographyScale.calloutTitleLineHeight};
    letter-spacing: 0;
  }

  .aq-callout.aq-admonition .aq-page-icon-inline {
    display: none;
  }

  .aq-callout.aq-admonition .aq-markdown-text {
    color: ${theme.colors.gray11};
    font-size: ${articleTypographyScale.bodyFontSize};
    line-height: ${articleTypographyScale.bodyLineHeight};
  }

  .aq-callout.aq-admonition-tip {
    --ad-accent: ${theme.colors.green10};
    --ad-body-bg: color-mix(in srgb, ${theme.colors.green10} 5%, ${theme.publicDesign.readableSurface});
    --ad-border: color-mix(in srgb, ${theme.colors.green10} 36%, ${theme.colors.gray6});
  }

  .aq-callout.aq-admonition-info {
    --ad-accent: ${theme.publicDesign.accent};
    --ad-body-bg: color-mix(in srgb, ${theme.publicDesign.accent} 5%, ${theme.publicDesign.readableSurface});
    --ad-border: color-mix(in srgb, ${theme.publicDesign.accent} 32%, ${theme.colors.gray6});
  }

  .aq-callout.aq-admonition-warning {
    --ad-accent: ${theme.colors.orange10};
    --ad-body-bg: color-mix(in srgb, ${theme.colors.orange10} 6%, ${theme.publicDesign.readableSurface});
    --ad-border: color-mix(in srgb, ${theme.colors.orange10} 42%, ${theme.colors.gray6});
  }

  .aq-callout.aq-admonition-outline {
    --ad-accent: ${ (theme.scheme === "dark" ? "#94a3b8" : "#475569")};
    --ad-body-bg: ${ (theme.scheme === "dark" ? "rgba(148, 163, 184, 0.08)" : theme.publicDesign.surfaceElevated)};
    --ad-border: ${ theme.colors.gray6};
  }

  .aq-callout.aq-admonition-example {
    --ad-accent: ${ (theme.scheme === "dark" ? "#4ade80" : "#166534")};
    --ad-body-bg: ${ (theme.scheme === "dark" ? "rgba(74, 222, 128, 0.08)" : "rgba(22, 101, 52, 0.04)")};
    --ad-border: ${ (theme.scheme === "dark" ? "rgba(74, 222, 128, 0.28)" : "rgba(22, 101, 52, 0.28)")};
  }

  .aq-callout.aq-admonition-summary {
    --ad-accent: ${theme.colors.gray12};
    --ad-body-bg: ${theme.publicDesign.surfaceElevated};
    --ad-border: ${theme.colors.gray7};
  }

  @media (max-width: 820px) {
    .aq-callout.aq-admonition {
      grid-template-columns: 28px minmax(0, 1fr);
      padding: 16px;
    }

    .aq-callout.aq-admonition .aq-callout-emoji {
      width: 26px;
      height: 26px;
      margin-left: -41px;
    }
  }
`
