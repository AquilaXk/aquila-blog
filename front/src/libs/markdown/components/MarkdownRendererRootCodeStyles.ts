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
    --aq-code-gutter-width: 1.34rem;
    --aq-code-gutter-gap: 0.54rem;
    margin: 28px 0;
    max-width: 100%;
    min-width: 0;
    border-radius: 0;
    overflow: hidden;
    border: 1px solid #27334a;
    box-shadow: none;
  }

  .aq-code-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 11px 14px;
    background: #0f1728;
    border-bottom: 1px solid #27334a;
    color: #7895c9;
    font: 600 11px / 1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      "Courier New", monospace;
  }

  .aq-code-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .aq-code-copy {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    background: transparent;
    color: #7895c9;
    border-radius: 0;
    width: auto;
    min-width: 44px;
    min-height: 0;
    padding: 0;
    font: inherit;
    font-weight: 700;
    letter-spacing: 0.02em;
    cursor: pointer;
    text-transform: uppercase;
    transition: color 0.16s ease;
  }

  .aq-code-copy:hover {
    color: #a9c5ff;
  }

  .aq-code-copy.is-copied {
    color: ${ (theme.scheme === "dark" ? "#98c379" : "#15803d")};
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
    padding: 22px;
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
    color: #6d768b;
    user-select: none;
  }

  .aq-pretty-pre code > [data-highlighted-line] {
    background: rgba(96, 165, 250, 0.11);
    border-radius: 0;
  }

  .aq-pretty-pre code [data-highlighted-chars] {
    background: rgba(250, 204, 21, 0.2);
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
    color: #808b99;
    font-style: italic;
  }

  pre code .token.punctuation {
    color: #a9b7c6;
  }

  pre code .token.property,
  pre code .token.tag,
  pre code .token.constant,
  pre code .token.symbol,
  pre code .token.deleted {
    color: #cc7832;
  }

  pre code .token.boolean,
  pre code .token.number {
    color: #6897bb;
  }

  pre code .token.selector,
  pre code .token.attr-name,
  pre code .token.string,
  pre code .token.char,
  pre code .token.builtin,
  pre code .token.inserted {
    color: #6aab73;
  }

  pre code .token.operator,
  pre code .token.entity,
  pre code .token.url,
  pre code .token.variable {
    color: #9876aa;
  }

  pre code .token.atrule,
  pre code .token.attr-value,
  pre code .token.keyword,
  pre code .token.annotation,
  pre code .token.decorator {
    color: #cc7832;
    font-weight: 600;
  }

  pre code .token.function,
  pre code .token.class-name {
    color: #ffc66d;
  }

  pre code .token.regex,
  pre code .token.important {
    color: #bbb529;
  }

  @media (max-width: 820px) {
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
      --aq-code-gutter-width: 1.16rem;
      --aq-code-gutter-gap: 0.46rem;
    }

    .aq-code-copy {
      font-size: 0.74rem;
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
