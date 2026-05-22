import { css, type Theme } from "@emotion/react"
import { articleTypographyScale } from "src/libs/markdown/contentTypography"

export const markdownRendererRootCalloutStyles = (theme: Theme) => css`
  .aq-callout.aq-admonition {
    --ad-header-h: 52px;
    --ad-accent: ${ (theme.scheme === "dark" ? "#4cc9f0" : "#0b63a8")};
    --ad-header-bg: ${ (theme.scheme === "dark" ? "rgba(76, 201, 240, 0.2)" : "#e9f4ff")};
    --ad-body-bg: ${ (theme.scheme === "dark" ? "rgba(76, 201, 240, 0.12)" : "#f4f9ff")};
    --ad-border: ${ (theme.scheme === "dark" ? "rgba(76, 201, 240, 0.38)" : "#9cc4e8")};
    --ad-text: ${ (theme.scheme === "dark" ? "#e6edf6" : "#1f2937")};
    position: relative;
    display: block;
    border: 1px solid var(--ad-border);
    border-left: 8px solid var(--ad-accent);
    border-radius: 8px;
    overflow: hidden;
    padding: 0;
    margin: 0.9rem 0;
    background: var(--ad-body-bg);
    color: var(--ad-text);
  }

  .aq-callout.aq-admonition > * {
    position: relative;
    z-index: 2;
  }

  .aq-callout.aq-admonition .aq-callout-box-text {
    margin-left: 0;
    padding: 0 24px 18px;
    color: var(--ad-text);
  }

  .aq-callout.aq-admonition .aq-callout-head {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    min-height: var(--ad-header-h);
    margin: 0 -24px 14px;
    padding: 0 24px;
    background: var(--ad-header-bg);
    border-bottom: 1px solid var(--ad-border);
  }

  .aq-callout.aq-admonition .aq-callout-head[data-has-title="false"] {
    margin-bottom: 12px;
  }

  .aq-callout.aq-admonition .aq-callout-emoji {
    color: var(--ad-accent);
    font-size: ${articleTypographyScale.bodyFontSize};
    font-weight: 600;
    line-height: ${articleTypographyScale.bodyLineHeight};
  }

  .aq-callout.aq-admonition .aq-callout-title {
    color: var(--ad-accent);
    font-size: ${articleTypographyScale.calloutTitleFontSize};
    font-weight: 700;
    line-height: ${articleTypographyScale.calloutTitleLineHeight};
    letter-spacing: 0;
  }

  .aq-callout.aq-admonition .aq-page-icon-inline {
    display: none;
  }

  .aq-callout.aq-admonition .aq-markdown-text {
    color: var(--ad-text);
    font-size: ${articleTypographyScale.bodyFontSize};
    line-height: ${articleTypographyScale.bodyLineHeight};
  }

  .aq-callout.aq-admonition-tip {
    --ad-accent: ${ (theme.scheme === "dark" ? "#f6ad55" : "#c46a10")};
    --ad-header-bg: ${ (theme.scheme === "dark" ? "rgba(246, 173, 85, 0.2)" : "#fff1d8")};
    --ad-body-bg: ${ (theme.scheme === "dark" ? "rgba(246, 173, 85, 0.12)" : "#fff8e8")};
    --ad-border: ${ (theme.scheme === "dark" ? "rgba(246, 173, 85, 0.36)" : "#e9c27d")};
  }

  .aq-callout.aq-admonition-info {
    --ad-accent: ${ (theme.scheme === "dark" ? "#4cc9f0" : "#0b63a8")};
    --ad-header-bg: ${ (theme.scheme === "dark" ? "rgba(76, 201, 240, 0.2)" : "#e9f4ff")};
    --ad-body-bg: ${ (theme.scheme === "dark" ? "rgba(76, 201, 240, 0.12)" : "#f4f9ff")};
    --ad-border: ${ (theme.scheme === "dark" ? "rgba(76, 201, 240, 0.38)" : "#9cc4e8")};
  }

  .aq-callout.aq-admonition-warning {
    --ad-accent: ${ (theme.scheme === "dark" ? "#fb7185" : "#b42344")};
    --ad-header-bg: ${ (theme.scheme === "dark" ? "rgba(251, 113, 133, 0.2)" : "#fdecef")};
    --ad-body-bg: ${ (theme.scheme === "dark" ? "rgba(251, 113, 133, 0.12)" : "#fff6f8")};
    --ad-border: ${ (theme.scheme === "dark" ? "rgba(251, 113, 133, 0.38)" : "#e8a8b8")};
  }

  .aq-callout.aq-admonition-outline {
    --ad-accent: ${ (theme.scheme === "dark" ? "#94a3b8" : "#475569")};
    --ad-header-bg: ${ (theme.scheme === "dark" ? "rgba(148, 163, 184, 0.2)" : "#eef2f6")};
    --ad-body-bg: ${ (theme.scheme === "dark" ? "rgba(148, 163, 184, 0.12)" : "#f8fafc")};
    --ad-border: ${ (theme.scheme === "dark" ? "rgba(148, 163, 184, 0.34)" : "#c7d1dd")};
  }

  .aq-callout.aq-admonition-example {
    --ad-accent: ${ (theme.scheme === "dark" ? "#4ade80" : "#166534")};
    --ad-header-bg: ${ (theme.scheme === "dark" ? "rgba(74, 222, 128, 0.2)" : "#e8f7ef")};
    --ad-body-bg: ${ (theme.scheme === "dark" ? "rgba(74, 222, 128, 0.12)" : "#f4fcf7")};
    --ad-border: ${ (theme.scheme === "dark" ? "rgba(74, 222, 128, 0.36)" : "#9fd9b4")};
  }

  .aq-callout.aq-admonition-summary {
    --ad-accent: ${ (theme.scheme === "dark" ? "#a78bfa" : "#5b4ab8")};
    --ad-header-bg: ${ (theme.scheme === "dark" ? "rgba(167, 139, 250, 0.2)" : "#efecff")};
    --ad-body-bg: ${ (theme.scheme === "dark" ? "rgba(167, 139, 250, 0.12)" : "#f7f5ff")};
    --ad-border: ${ (theme.scheme === "dark" ? "rgba(167, 139, 250, 0.38)" : "#bfb3eb")};
  }
`
