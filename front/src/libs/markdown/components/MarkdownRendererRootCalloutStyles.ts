import { css, type Theme } from "@emotion/react"
import { articleTypographyScale } from "src/libs/markdown/contentTypography"

export const markdownRendererRootCalloutStyles = (theme: Theme) => css`
  .aq-callout.aq-admonition {
    --ad-accent: ${ (theme.scheme === "dark" ? "#7dd3fc" : "#155eef")};
    --ad-body-bg: ${ (theme.scheme === "dark" ? "rgba(125, 211, 252, 0.08)" : "rgba(21, 94, 239, 0.04)")};
    --ad-border: ${ (theme.scheme === "dark" ? "rgba(125, 211, 252, 0.28)" : "rgba(21, 94, 239, 0.3)")};
    --ad-text: ${ (theme.scheme === "dark" ? "#e6edf6" : "#1f2937")};
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
    color: var(--ad-text);
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
    --ad-accent: ${ (theme.scheme === "dark" ? "#86efac" : "#12805c")};
    --ad-body-bg: ${ (theme.scheme === "dark" ? "rgba(134, 239, 172, 0.08)" : "rgba(18, 128, 92, 0.04)")};
    --ad-border: ${ (theme.scheme === "dark" ? "rgba(134, 239, 172, 0.28)" : "rgba(18, 128, 92, 0.3)")};
  }

  .aq-callout.aq-admonition-info {
    --ad-accent: ${ (theme.scheme === "dark" ? "#4cc9f0" : "#0b63a8")};
    --ad-body-bg: ${ (theme.scheme === "dark" ? "rgba(76, 201, 240, 0.08)" : "rgba(21, 94, 239, 0.04)")};
    --ad-border: ${ (theme.scheme === "dark" ? "rgba(76, 201, 240, 0.28)" : "rgba(21, 94, 239, 0.3)")};
  }

  .aq-callout.aq-admonition-warning {
    --ad-accent: ${ (theme.scheme === "dark" ? "#fbbf24" : "#a15c00")};
    --ad-body-bg: ${ (theme.scheme === "dark" ? "rgba(251, 191, 36, 0.08)" : "rgba(161, 92, 0, 0.05)")};
    --ad-border: ${ (theme.scheme === "dark" ? "rgba(251, 191, 36, 0.32)" : "rgba(161, 92, 0, 0.34)")};
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
    --ad-accent: ${ (theme.scheme === "dark" ? "#a78bfa" : "#5b4ab8")};
    --ad-body-bg: ${theme.publicDesign.surfaceElevated};
    --ad-border: ${theme.colors.gray7};
  }
`
