import { css, type Theme } from "@emotion/react"
import { TABLE_MIN_COLUMN_WIDTH_PX } from "src/libs/markdown/tableMetadata"
import { articleTypographyScale } from "src/libs/markdown/contentTypography"

export const markdownRendererRootCodeStyles = (theme: Theme) => css`
  .aq-code {
    border-radius: 0;
    padding: 1.02rem 1.1rem;
    overflow-x: auto;
    background: #0f1728;
    border: 1px solid #27334a;
    box-shadow: none;
  }

  .aq-code-block {
    --aq-code-shell-padding-x: 0.72rem;
    --aq-code-gutter-width: 1.34rem;
    --aq-code-gutter-gap: 0.54rem;
    margin: 28px 0;
    max-width: 100%;
    min-width: 0;
    border-radius: 0;
    overflow: hidden;
    border: 1px solid
      ${
        theme.scheme === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(17, 24, 39, 0.08)"};
    box-shadow: none;
  }

  .aq-code-toolbar {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 0.75rem;
    min-height: 42px;
    padding: 0 14px;
    background: #0f1728;
    border-bottom: 1px solid #27334a;
  }

  .aq-code-toolbar-left {
    display: inline-flex;
    align-items: center;
    gap: 0.7rem;
  }

  .aq-code-dot {
    display: none;
  }

  .aq-code-dot-red {
    background: #ff5f56;
  }

  .aq-code-dot-yellow {
    background: #ffbd2e;
  }

  .aq-code-dot-green {
    background: #27c93f;
  }

  .aq-code-language {
    justify-self: end;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #7895c9;
  }

  .aq-code-copy {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid
      ${
        theme.scheme === "dark" ? "rgba(255, 255, 255, 0.12)" : "rgba(17, 24, 39, 0.12)"};
    background: ${
      theme.scheme === "dark" ? "rgba(255, 255, 255, 0.04)" : "rgba(255, 255, 255, 0.72)"};
    color: ${ (theme.scheme === "dark" ? "#d7dbe5" : "#334155")};
    border-radius: 0;
    width: 2.25rem;
    min-width: 2.25rem;
    height: 2.05rem;
    padding: 0;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
  }

  .aq-code-copy:hover {
    background: ${
      theme.scheme === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.9)"};
    border-color: ${
      theme.scheme === "dark" ? "rgba(255, 255, 255, 0.18)" : "rgba(17, 24, 39, 0.18)"};
  }

  .aq-code-copy svg {
    width: 1rem;
    height: 1rem;
  }

  .aq-code-copy-done {
    line-height: 1;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    font-size: 0.72rem;
    padding-top: 0.04rem;
  }

  .aq-code-copy-bottom {
    position: absolute;
    right: 0.74rem;
    bottom: 0.74rem;
    z-index: 1;
    box-shadow: 0 12px 24px rgba(15, 23, 42, 0.18);
  }

  .aq-code-copy-bottom.is-copied {
    color: ${ (theme.scheme === "dark" ? "#98c379" : "#15803d")};
    border-color: ${
      theme.scheme === "dark" ? "rgba(152, 195, 121, 0.35)" : "rgba(21, 128, 61, 0.22)"};
    background: ${
      theme.scheme === "dark" ? "rgba(152, 195, 121, 0.12)" : "rgba(220, 252, 231, 0.95)"};
    width: auto;
    min-width: 3.3rem;
    padding: 0 0.58rem;
  }

  .aq-code-body {
    position: relative;
  }

  .aq-code-shell {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    display: block;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    touch-action: pan-x;
    background: #0f1728;
  }

  .aq-code-block .aq-code {
    width: max-content;
    margin: 0;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    padding: 1.05rem var(--aq-code-shell-padding-x) 3.55rem;
    min-width: 100%;
    background: #0f1728;
    color: #dbe7ff;
  }

  .aq-code pre,
  .aq-code code,
  .aq-pretty-pre code,
  .aq-pretty-pre code > [data-line],
  figure[data-rehype-pretty-code-figure] pre code,
  figure[data-rehype-pretty-code-figure] [data-line] {
    white-space: pre;
    overflow-wrap: normal;
    word-break: normal;
  }

  .aq-code code,
  pre code {
    display: block;
    font-size: ${articleTypographyScale.codeFontSize};
    line-height: ${articleTypographyScale.codeLineHeight};
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New",
      monospace;
  }

  .aq-pretty-pre code {
    display: block;
    min-width: max-content;
    counter-reset: aq-line;
  }

  .aq-pretty-pre code [data-line] {
    display: block;
    position: relative;
    padding-left: calc(var(--aq-code-gutter-width) + var(--aq-code-gutter-gap));
  }

  .aq-pretty-pre code [data-line]::before {
    counter-increment: aq-line;
    content: counter(aq-line);
    position: absolute;
    left: 0;
    top: 0;
    width: var(--aq-code-gutter-width);
    text-align: right;
    color: ${ (theme.scheme === "dark" ? "#6d768b" : "#90a0b7")};
    user-select: none;
  }

  .aq-pretty-pre code > [data-highlighted-line] {
    background: ${
      theme.scheme === "dark" ? "rgba(96, 165, 250, 0.11)" : "rgba(59, 130, 246, 0.1)"};
    border-radius: 0;
  }

  .aq-pretty-pre code [data-highlighted-chars] {
    background: ${
      theme.scheme === "dark" ? "rgba(250, 204, 21, 0.2)" : "rgba(250, 204, 21, 0.25)"};
    border-radius: 0;
    padding: 0.04em 0.2em;
  }

  figure[data-rehype-pretty-code-figure] code,
  figure[data-rehype-pretty-code-figure] code span {
    color: ${ (theme.scheme === "dark" ? "var(--shiki-dark)" : "var(--shiki-light)")};
    background-color: transparent !important;
  }

  figure[data-rehype-pretty-code-figure] {
    margin: 1rem 0;
    max-width: 100%;
    min-width: 0;
    border-radius: 0;
    overflow: hidden;
    border: 1px solid ${ theme.colors.gray6};
    background: ${
      theme.scheme === "dark" ? "rgba(15, 23, 42, 0.62)" : "rgba(248, 250, 252, 0.92)"};
  }

  figure[data-rehype-pretty-code-figure] pre {
    margin: 0;
    max-width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding: 1rem 1.05rem;
    background: transparent;
  }

  figure[data-rehype-pretty-code-figure] pre code {
    display: block;
    min-width: max-content;
  }

  figure[data-rehype-pretty-code-figure] [data-line] {
    display: block;
    border-left: 2px solid transparent;
    padding: 0 0.36rem;
  }

  figure[data-rehype-pretty-code-figure] [data-highlighted-line] {
    border-left-color: ${ (theme.scheme === "dark" ? "#60a5fa" : "#3b82f6")};
    background: ${
      theme.scheme === "dark" ? "rgba(96, 165, 250, 0.11)" : "rgba(59, 130, 246, 0.12)"};
  }

  figure[data-rehype-pretty-code-figure] [data-highlighted-chars] {
    background: ${
      theme.scheme === "dark" ? "rgba(250, 204, 21, 0.2)" : "rgba(250, 204, 21, 0.24)"};
    border-radius: 4px;
    padding: 0.06em 0.22em;
  }


  pre code .token.comment,
  pre code .token.prolog,
  pre code .token.doctype,
  pre code .token.cdata {
    color: ${ (theme.scheme === "dark" ? "#808b99" : "#6a7280")};
    font-style: italic;
  }

  pre code .token.punctuation {
    color: ${ (theme.scheme === "dark" ? "#a9b7c6" : "#495367")};
  }

  pre code .token.property,
  pre code .token.tag,
  pre code .token.constant,
  pre code .token.symbol,
  pre code .token.deleted {
    color: ${ (theme.scheme === "dark" ? "#cc7832" : "#b45309")};
  }

  pre code .token.boolean,
  pre code .token.number {
    color: ${ (theme.scheme === "dark" ? "#6897bb" : "#1d4ed8")};
  }

  pre code .token.selector,
  pre code .token.attr-name,
  pre code .token.string,
  pre code .token.char,
  pre code .token.builtin,
  pre code .token.inserted {
    color: ${ (theme.scheme === "dark" ? "#6aab73" : "#047857")};
  }

  pre code .token.operator,
  pre code .token.entity,
  pre code .token.url,
  pre code .token.variable {
    color: ${ (theme.scheme === "dark" ? "#9876aa" : "#7c3aed")};
  }

  pre code .token.atrule,
  pre code .token.attr-value,
  pre code .token.keyword,
  pre code .token.annotation,
  pre code .token.decorator {
    color: ${ (theme.scheme === "dark" ? "#cc7832" : "#1d4ed8")};
    font-weight: 600;
  }

  pre code .token.function,
  pre code .token.class-name {
    color: ${ (theme.scheme === "dark" ? "#ffc66d" : "#be185d")};
  }

  pre code .token.regex,
  pre code .token.important {
    color: ${ (theme.scheme === "dark" ? "#bbb529" : "#92400e")};
  }

  @media (max-width: 768px) {
    .aq-code code,
    pre code {
      font-size: ${articleTypographyScale.codeFontSizeMobile};
      line-height: ${articleTypographyScale.codeLineHeightMobile};
    }

    .aq-callout.aq-admonition .aq-callout-title {
      font-size: ${articleTypographyScale.calloutTitleFontSizeMobile};
      line-height: ${articleTypographyScale.calloutTitleLineHeightMobile};
    }

    .aq-callout.aq-admonition .aq-callout-emoji,
    .aq-callout.aq-admonition .aq-markdown-text {
      font-size: ${articleTypographyScale.bodyFontSizeMobile};
      line-height: ${articleTypographyScale.bodyLineHeightMobile};
    }

    .aq-table-scroll {
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    table,
    .aq-table {
      width: 100%;
      min-width: 100%;
      max-width: 100%;
      table-layout: fixed;
    }

    table[data-overflow-mode="wide"],
    .aq-table.aq-table-wide {
      width: max-content;
      min-width: 100%;
      max-width: none;
    }

    table th,
    table td,
    .aq-table th,
    .aq-table td {
      white-space: normal;
      overflow-wrap: break-word;
      word-break: normal;
      font-size: 0.95rem;
      line-height: 1.58;
      padding: 0.66rem 0.72rem;
      min-width: max(${TABLE_MIN_COLUMN_WIDTH_PX}px, 10ch);
    }

    .aq-code-block {
      --aq-code-shell-padding-x: 0.58rem;
      --aq-code-gutter-width: 1.16rem;
      --aq-code-gutter-gap: 0.46rem;
    }

    .aq-code-toolbar {
      grid-template-columns: auto 1fr;
    }

    .aq-code-block .aq-code {
      padding-bottom: 3.2rem;
    }

    .aq-code-copy-bottom {
      right: 0.48rem;
      bottom: 0.48rem;
    }

    .aq-code-copy {
      width: 2.12rem;
      min-width: 2.12rem;
      height: 1.94rem;
      font-size: 0.74rem;
    }

    .aq-code-copy svg {
      width: 0.95rem;
      height: 0.95rem;
    }

    .aq-code-copy-bottom.is-copied {
      min-width: 3rem;
      padding: 0 0.52rem;
    }

    .aq-mermaid {
      padding-bottom: 0.24rem;
    }

    .aq-mermaid[data-mermaid-wide="true"] {
      width: 100%;
      max-width: 100%;
      margin-left: 0;
      margin-right: 0;
      overflow-x: auto;
    }
  }

`
