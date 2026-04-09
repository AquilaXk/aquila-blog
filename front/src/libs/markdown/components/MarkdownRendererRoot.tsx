import styled from "@emotion/styled"
import {
  TABLE_MIN_COLUMN_WIDTH_PX,
  TABLE_MIN_ROW_HEIGHT_PX,
} from "src/libs/markdown/tableMetadata"
import { markdownContentTypography } from "src/libs/markdown/contentTypography"

const MarkdownRendererRoot = styled.div`
  margin-top: 1.65rem;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: visible;
  overflow-wrap: anywhere;
  word-break: break-word;
  ${({ theme }) => markdownContentTypography("&", theme)}

  h1,
  h2,
  h3,
  h4 {
    scroll-margin-top: 6.8rem;
  }

  figure {
    margin: 1.25rem 0;
  }

  .aq-image-frame {
    width: min(100%, var(--article-readable-width, 48rem));
    margin: 0 auto;
    position: relative;
    min-width: 0;
  }

  .aq-image-frame[data-width-mode="custom"] {
    width: min(100%, var(--aq-image-width));
  }

  .aq-image-frame img {
    display: block;
    width: 100%;
    max-width: 100%;
    height: auto;
    max-height: min(76vh, 880px);
    object-fit: contain;
    border-radius: 12px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  }

  .aq-image-frame[data-editable="true"] .aq-image-resize-handle {
    position: absolute;
    right: 0.85rem;
    bottom: 0.85rem;
    width: 2rem;
    height: 2rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => (theme.scheme === "dark" ? "rgba(15, 23, 42, 0.82)" : "rgba(255, 255, 255, 0.92)")};
    color: ${({ theme }) => theme.colors.gray12};
    cursor: ew-resize;
    box-shadow: 0 12px 28px rgba(2, 6, 23, 0.2);
    backdrop-filter: blur(8px);
  }

  .aq-image-frame[data-editable="true"] .aq-image-resize-handle span {
    display: inline-block;
    width: 0.95rem;
    height: 0.95rem;
    border-right: 2px solid currentColor;
    border-bottom: 2px solid currentColor;
    transform: rotate(0deg);
    opacity: 0.92;
  }

  .aq-image-frame[data-editable="true"] .aq-image-resize-handle:hover {
    transform: translateY(-1px);
  }

  .aq-image-frame figcaption {
    margin-top: 0.62rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.84rem;
    line-height: 1.56;
    text-align: center;
  }

  ul.contains-task-list,
  ol.contains-task-list {
    list-style: none;
    padding-left: 0.2rem;
  }

  li.task-list-item {
    list-style: none;
    display: flex;
    align-items: flex-start;
    gap: 0.52rem;
  }

  li.task-list-item input[type="checkbox"] {
    margin: 0.34rem 0 0;
    width: 0.95rem;
    height: 0.95rem;
    accent-color: ${({ theme }) => (theme.scheme === "dark" ? "#4493f8" : "#0969da")};
  }

  .aq-bookmark-card,
  .aq-file-card,
  .aq-embed-card,
  .aq-formula-card {
    width: min(100%, var(--article-readable-width, 48rem));
    margin: 1.25rem auto;
    border-radius: 16px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(17, 19, 24, 0.94)" : "rgba(255, 255, 255, 0.98)"};
    box-shadow: ${({ theme }) =>
      theme.scheme === "dark" ? "0 18px 38px rgba(2, 6, 23, 0.24)" : "0 18px 36px rgba(15, 23, 42, 0.06)"};
    overflow: hidden;
  }

  .aq-bookmark-card a,
  .aq-file-card a {
    display: flex;
    gap: 0.9rem;
    padding: 1rem 1.08rem;
    text-decoration: none;
  }

  .aq-link-card-thumb,
  .aq-embed-thumb {
    overflow: hidden;
    border-radius: 14px;
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(255, 255, 255, 0.05)" : "rgba(15, 23, 42, 0.04)"};
    aspect-ratio: 16 / 10;
  }

  .aq-link-card-thumb {
    width: min(11rem, 36%);
    flex-shrink: 0;
  }

  .aq-link-card-thumb img,
  .aq-embed-thumb img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .aq-link-card-copy,
  .aq-embed-copy {
    display: grid;
    gap: 0.34rem;
    min-width: 0;
  }

  .aq-link-card-copy small,
  .aq-embed-copy small {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .aq-bookmark-card strong,
  .aq-file-card strong,
  .aq-embed-card strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1rem;
    font-weight: 700;
  }

  .aq-bookmark-card span,
  .aq-file-card span,
  .aq-embed-caption,
  .aq-embed-fallback p {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.86rem;
    line-height: 1.55;
  }

  .aq-bookmark-card p,
  .aq-file-card p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.92rem;
    line-height: 1.65;
  }

  .aq-embed-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 1rem 1.08rem 0.72rem;
  }

  .aq-embed-header a {
    color: ${({ theme }) => theme.colors.blue8};
    font-size: 0.84rem;
    font-weight: 700;
    text-decoration: none;
  }

  .aq-embed-frame {
    padding: 0 1.08rem 0.92rem;
  }

  .aq-embed-frame iframe {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    border: 0;
    border-radius: 12px;
    background: ${({ theme }) => theme.colors.gray2};
  }

  .aq-embed-fallback {
    padding: 0 1.08rem 0.92rem;
  }

  .aq-embed-thumb {
    margin: 0 1.08rem 0.92rem;
  }

  .aq-embed-caption {
    margin: 0;
    padding: 0 1.08rem 1rem;
  }

  .aq-formula-card {
    padding: 1rem 1.08rem;
    text-align: center;
  }

  .aq-formula-render {
    width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 0.18rem;
  }

  .aq-formula-render .katex-display {
    margin: 0;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0.2rem 0 0.3rem;
  }

  .aq-formula-render .katex {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: clamp(1.02rem, 2vw, 1.28rem);
  }

  .katex {
    color: ${({ theme }) => theme.colors.gray12};
  }

  .katex-display {
    overflow-x: auto;
    overflow-y: hidden;
  }

  .aq-formula-fallback {
    display: inline-block;
    color: ${({ theme }) => theme.colors.gray12};
    font-family: "Times New Roman", Georgia, serif;
    font-size: clamp(1.05rem, 2vw, 1.35rem);
    line-height: 1.8;
    white-space: pre-wrap;
  }

  .aq-inline-color {
    color: var(--aq-inline-color, inherit);
    font-weight: 700;
  }

  .aq-code {
    border-radius: 14px;
    padding: 1.02rem 1.1rem;
    overflow-x: auto;
    background: ${({ theme }) =>
      theme.scheme === "dark"
        ? "linear-gradient(180deg, rgba(20, 26, 34, 0.98), rgba(15, 19, 27, 0.98))"
        : "linear-gradient(180deg, #f8fafc, #f3f5f8)"};
    border: 1px solid
      ${({ theme }) =>
        theme.scheme === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(17, 24, 39, 0.08)"};
    box-shadow: ${({ theme }) =>
      theme.scheme === "dark" ? "0 16px 36px rgba(2, 6, 23, 0.32)" : "0 16px 32px rgba(15, 23, 42, 0.06)"};
  }

  .aq-code-block {
    --aq-code-shell-padding-x: 0.72rem;
    --aq-code-gutter-width: 1.34rem;
    --aq-code-gutter-gap: 0.54rem;
    margin: 1.2rem 0;
    max-width: 100%;
    min-width: 0;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid
      ${({ theme }) =>
        theme.scheme === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(17, 24, 39, 0.08)"};
    box-shadow: ${({ theme }) =>
      theme.scheme === "dark" ? "0 18px 38px rgba(2, 6, 23, 0.34)" : "0 18px 36px rgba(15, 23, 42, 0.08)"};
  }

  .aq-code-toolbar {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 0.75rem;
    padding: 0.84rem 0.96rem 0.76rem;
    background: ${({ theme }) =>
      theme.scheme === "dark"
        ? "linear-gradient(180deg, #3a3f59, #363b54)"
        : "linear-gradient(180deg, #dee4ef, #d6dde8)"};
    border-bottom: 1px solid
      ${({ theme }) =>
        theme.scheme === "dark" ? "rgba(255, 255, 255, 0.06)" : "rgba(17, 24, 39, 0.08)"};
  }

  .aq-code-toolbar-left {
    display: inline-flex;
    align-items: center;
    gap: 0.7rem;
  }

  .aq-code-dot {
    width: 0.92rem;
    height: 0.92rem;
    border-radius: 999px;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
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
    color: ${({ theme }) => (theme.scheme === "dark" ? "#ff9d62" : "#7b4b2a")};
  }

  .aq-code-copy {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid
      ${({ theme }) =>
        theme.scheme === "dark" ? "rgba(255, 255, 255, 0.12)" : "rgba(17, 24, 39, 0.12)"};
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(255, 255, 255, 0.04)" : "rgba(255, 255, 255, 0.72)"};
    color: ${({ theme }) => (theme.scheme === "dark" ? "#d7dbe5" : "#334155")};
    border-radius: 10px;
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
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.9)"};
    border-color: ${({ theme }) =>
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
    color: ${({ theme }) => (theme.scheme === "dark" ? "#98c379" : "#15803d")};
    border-color: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(152, 195, 121, 0.35)" : "rgba(21, 128, 61, 0.22)"};
    background: ${({ theme }) =>
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
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "#2b2d3a" : "#f2f4f8"};
  }

  .aq-code-block .aq-code {
    width: max-content;
    margin: 0;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    padding: 1.05rem var(--aq-code-shell-padding-x) 3.55rem;
    min-width: 100%;
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "#2b2d3a" : "#f2f4f8"};
    color: ${({ theme }) => (theme.scheme === "dark" ? "#a9b7c6" : "#2f3747")};
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
    font-size: 0.875rem;
    line-height: 1.5;
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
    color: ${({ theme }) => (theme.scheme === "dark" ? "#6d768b" : "#90a0b7")};
    user-select: none;
  }

  .aq-pretty-pre code > [data-highlighted-line] {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(96, 165, 250, 0.11)" : "rgba(59, 130, 246, 0.1)"};
    border-radius: 6px;
  }

  .aq-pretty-pre code [data-highlighted-chars] {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(250, 204, 21, 0.2)" : "rgba(250, 204, 21, 0.25)"};
    border-radius: 4px;
    padding: 0.04em 0.2em;
  }

  figure[data-rehype-pretty-code-figure] code,
  figure[data-rehype-pretty-code-figure] code span {
    color: ${({ theme }) => (theme.scheme === "dark" ? "var(--shiki-dark)" : "var(--shiki-light)")};
    background-color: transparent !important;
  }

  figure[data-rehype-pretty-code-figure] {
    margin: 1rem 0;
    max-width: 100%;
    min-width: 0;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) =>
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
    border-left-color: ${({ theme }) => (theme.scheme === "dark" ? "#60a5fa" : "#3b82f6")};
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(96, 165, 250, 0.11)" : "rgba(59, 130, 246, 0.12)"};
  }

  figure[data-rehype-pretty-code-figure] [data-highlighted-chars] {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(250, 204, 21, 0.2)" : "rgba(250, 204, 21, 0.24)"};
    border-radius: 4px;
    padding: 0.06em 0.22em;
  }

  .aq-toggle {
    --aq-toggle-caret-size: 0.92rem;
    --aq-toggle-caret-hit: 1.34rem;
    --aq-toggle-gap: 0.52rem;
    --aq-toggle-summary-padding-x: 0;
    --aq-toggle-indent: calc(var(--aq-toggle-summary-padding-x) + var(--aq-toggle-caret-hit) + var(--aq-toggle-gap));
    margin: 0.98rem 0;
    position: relative;
  }

  .aq-mermaid {
    margin: 1rem 0;
    display: block;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    white-space: normal;
    padding: 0.2rem 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    scrollbar-width: thin;
  }

  .aq-mermaid[data-mermaid-wide="true"] {
    width: var(--aq-mermaid-wide-width, 100%);
    max-width: none;
    margin-left: calc(var(--aq-mermaid-bleed-left, 0px) * -1);
    margin-right: calc(var(--aq-mermaid-bleed-right, 0px) * -1);
    overflow: visible;
  }

  .aq-mermaid[data-mermaid-rendered="pending"] {
    min-height: 7.5rem;
  }

  .aq-mermaid[data-mermaid-rendered="pending"] > code {
    visibility: hidden;
  }

  .aq-mermaid-stage {
    display: flex;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    justify-content: center;
    align-items: flex-start;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .aq-mermaid[data-mermaid-wide="true"] .aq-mermaid-stage {
    max-width: none;
    overflow: visible;
  }

  .aq-mermaid-stage > svg {
    display: block;
    width: auto;
    max-width: 100%;
    height: auto;
    margin: 0 auto;
    background: transparent;
    overflow: visible;
  }

  .aq-mermaid-stage > svg foreignObject,
  .aq-mermaid-stage > svg .nodeLabel,
  .aq-mermaid-stage > svg .edgeLabel {
    overflow: visible;
  }

  .aq-mermaid-stage > svg .nodeLabel p,
  .aq-mermaid-stage > svg .edgeLabel p,
  .aq-mermaid-stage > svg .nodeLabel div,
  .aq-mermaid-stage > svg .edgeLabel div,
  .aq-mermaid-stage > svg .nodeLabel span,
  .aq-mermaid-stage > svg .edgeLabel span {
    margin: 0;
    line-height: 1.18;
    display: inline-block;
    box-sizing: border-box;
    padding-top: 0.08em;
    padding-bottom: 0.18em;
  }

  .aq-mermaid-error-state {
    border-radius: 12px;
    border: 1px solid ${({ theme }) => (theme.scheme === "dark" ? "rgba(217, 119, 6, 0.46)" : "rgba(217, 119, 6, 0.42)")};
    background: ${({ theme }) => (theme.scheme === "dark" ? "rgba(120, 53, 15, 0.16)" : "rgba(254, 243, 199, 0.88)")};
    padding: 0.88rem 0.94rem;
  }

  .aq-mermaid-error-title {
    color: ${({ theme }) => (theme.scheme === "dark" ? "#fde68a" : "#92400e")};
    font-size: 0.9rem;
    font-weight: 700;
    margin-bottom: 0.36rem;
  }

  .aq-mermaid-error-description {
    margin: 0 0 0.38rem;
    color: ${({ theme }) => (theme.scheme === "dark" ? "rgba(254, 240, 138, 0.92)" : "#7c2d12")};
    font-size: 0.84rem;
    line-height: 1.52;
  }

  .aq-mermaid-error-guidance {
    margin: 0 0 0.52rem;
    color: ${({ theme }) => (theme.scheme === "dark" ? "rgba(254, 240, 138, 0.86)" : "#9a3412")};
    font-size: 0.78rem;
    line-height: 1.5;
  }

  .aq-mermaid-error-guidance code {
    border-radius: 6px;
    border: 1px solid ${({ theme }) => (theme.scheme === "dark" ? "rgba(251, 191, 36, 0.3)" : "rgba(217, 119, 6, 0.32)")};
    background: ${({ theme }) => (theme.scheme === "dark" ? "rgba(120, 53, 15, 0.24)" : "rgba(255, 251, 235, 0.92)")};
    padding: 0.08rem 0.34rem;
    font-size: 0.74rem;
    color: ${({ theme }) => (theme.scheme === "dark" ? "#fde68a" : "#92400e")};
  }

  .aq-mermaid-error-details {
    margin-top: 0.34rem;
  }

  .aq-mermaid-error-details > summary {
    color: ${({ theme }) => (theme.scheme === "dark" ? "rgba(253, 230, 138, 0.94)" : "#b45309")};
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
    list-style: none;
  }

  .aq-mermaid-error-details > summary::-webkit-details-marker {
    display: none;
  }

  .aq-mermaid-error-code {
    display: block;
    white-space: pre-wrap;
    color: ${({ theme }) => (theme.scheme === "dark" ? "#fef3c7" : "#7c2d12")};
    font-size: 0.78rem;
    line-height: 1.5;
    border-radius: 8px;
    border: 1px solid ${({ theme }) => (theme.scheme === "dark" ? "rgba(251, 191, 36, 0.22)" : "rgba(217, 119, 6, 0.24)")};
    background: ${({ theme }) => (theme.scheme === "dark" ? "rgba(120, 53, 15, 0.18)" : "rgba(255, 251, 235, 0.82)")};
    margin-top: 0.34rem;
    padding: 0.48rem 0.58rem;
  }

  .aq-mermaid-expand-btn {
    margin: 0.45rem 0 0;
    min-height: 32px;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray11};
    padding: 0 0.75rem;
    font-size: 0.76rem;
    font-weight: 700;
    cursor: pointer;
  }

  .aq-mermaid[data-mermaid-expandable="true"] .aq-mermaid-expand-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  pre code .token.comment,
  pre code .token.prolog,
  pre code .token.doctype,
  pre code .token.cdata {
    color: ${({ theme }) => (theme.scheme === "dark" ? "#808b99" : "#6a7280")};
    font-style: italic;
  }

  pre code .token.punctuation {
    color: ${({ theme }) => (theme.scheme === "dark" ? "#a9b7c6" : "#495367")};
  }

  pre code .token.property,
  pre code .token.tag,
  pre code .token.constant,
  pre code .token.symbol,
  pre code .token.deleted {
    color: ${({ theme }) => (theme.scheme === "dark" ? "#cc7832" : "#b45309")};
  }

  pre code .token.boolean,
  pre code .token.number {
    color: ${({ theme }) => (theme.scheme === "dark" ? "#6897bb" : "#1d4ed8")};
  }

  pre code .token.selector,
  pre code .token.attr-name,
  pre code .token.string,
  pre code .token.char,
  pre code .token.builtin,
  pre code .token.inserted {
    color: ${({ theme }) => (theme.scheme === "dark" ? "#6aab73" : "#047857")};
  }

  pre code .token.operator,
  pre code .token.entity,
  pre code .token.url,
  pre code .token.variable {
    color: ${({ theme }) => (theme.scheme === "dark" ? "#9876aa" : "#7c3aed")};
  }

  pre code .token.atrule,
  pre code .token.attr-value,
  pre code .token.keyword,
  pre code .token.annotation,
  pre code .token.decorator {
    color: ${({ theme }) => (theme.scheme === "dark" ? "#cc7832" : "#1d4ed8")};
    font-weight: 600;
  }

  pre code .token.function,
  pre code .token.class-name {
    color: ${({ theme }) => (theme.scheme === "dark" ? "#ffc66d" : "#be185d")};
  }

  pre code .token.regex,
  pre code .token.important {
    color: ${({ theme }) => (theme.scheme === "dark" ? "#bbb529" : "#92400e")};
  }

  @media (max-width: 768px) {
    font-size: 1rem;
    line-height: 1.74;

    h1 {
      font-size: clamp(1.62rem, 7.4vw, 1.98rem);
    }

    h2 {
      font-size: clamp(1.36rem, 6.1vw, 1.64rem);
    }

    h3 {
      font-size: clamp(1.17rem, 5.1vw, 1.36rem);
    }

    p,
    li {
      font-size: 1rem;
      line-height: 1.72;
    }

    .aq-code code,
    pre code {
      font-size: 0.86rem;
      line-height: 1.54;
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

  .aq-toggle > summary {
    cursor: pointer;
    position: relative;
    display: block;
    list-style: none;
    padding: 0.1rem var(--aq-toggle-summary-padding-x) 0.1rem var(--aq-toggle-indent);
    color: var(--color-gray12);
    font-size: 1.01rem;
    font-weight: 580;
    line-height: 1.58;
  }

  .aq-toggle__title {
    display: block;
    min-width: 0;
  }

  .aq-toggle > summary::-webkit-details-marker {
    display: none;
  }

  .aq-toggle__caret {
    position: absolute;
    left: 0;
    top: 0.12rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--aq-toggle-caret-hit);
    height: var(--aq-toggle-caret-hit);
    color: var(--color-gray10);
  }

  .aq-toggle__caret::before {
    content: "";
    width: var(--aq-toggle-caret-size);
    height: var(--aq-toggle-caret-size);
    background: currentColor;
    clip-path: polygon(26% 18%, 82% 50%, 26% 82%);
    transform-origin: center;
    transition: transform 120ms ease;
  }

  .aq-toggle[open] .aq-toggle__caret::before {
    transform: rotate(90deg);
  }

  .aq-toggle__body {
    margin-top: 0.22rem;
    padding-left: var(--aq-toggle-indent);
  }

  .aq-toggle[open] > .aq-toggle__body:first-of-type {
    margin-top: 0;
  }

  .aq-toggle__body p,
  .aq-toggle__body li {
    line-height: 1.7;
  }

  .aq-table-shell {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    margin: 1rem 0;
  }

  .aq-table-scroll {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    border-radius: 16px;
    background: ${({ theme }) =>
      theme.scheme === "dark"
        ? "linear-gradient(180deg, rgba(18, 22, 29, 0.96), rgba(15, 18, 24, 0.96))"
        : "linear-gradient(180deg, #ffffff, #fbfcfe)"};
    box-shadow: ${({ theme }) =>
      theme.scheme === "dark"
        ? "0 18px 38px rgba(2, 6, 23, 0.28)"
        : "0 18px 38px rgba(15, 23, 42, 0.08)"};
    -webkit-overflow-scrolling: touch;
  }

  table,
  .aq-table {
    width: auto;
    min-width: 0;
    max-width: none;
    border-collapse: separate;
    border-spacing: 0;
    table-layout: fixed;
    margin: 0;
    border: 0;
    background: transparent;
  }

  table[data-overflow-mode="wide"],
  .aq-table.aq-table-wide {
    width: max-content;
    min-width: 100%;
    max-width: none;
  }

  thead th,
  .aq-table thead th {
    text-align: left !important;
    background: ${({ theme }) => theme.colors.gray3};
    font-weight: 700;
    border-bottom: 2px solid
      ${({ theme }) => (theme.scheme === "dark" ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.16)")};
  }

  th,
  td,
  .aq-table th,
  .aq-table td {
    padding: 0.78rem 0.92rem;
    border-right: 1px solid ${({ theme }) => theme.colors.gray6};
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
    vertical-align: top;
    min-width: max(${TABLE_MIN_COLUMN_WIDTH_PX}px, 10ch);
    min-height: ${TABLE_MIN_ROW_HEIGHT_PX}px;
    white-space: normal;
    overflow-wrap: break-word;
    word-break: normal;
  }

  th > *,
  td > *,
  .aq-table th > *,
  .aq-table td > * {
    min-width: 0;
    max-width: 100%;
    white-space: normal;
    overflow-wrap: break-word;
    word-break: normal;
  }

  tr td:last-child,
  tr th:last-child,
  .aq-table tr td:last-child,
  .aq-table tr th:last-child {
    border-right: 0;
  }

  tbody tr:last-child td,
  .aq-table tbody tr:last-child td,
  .aq-table tbody tr:last-child th {
    border-bottom: 0;
  }

  @media (max-width: 480px) {
    .aq-table-shell {
      margin: 0.9rem 0;
      width: 100%;
      max-width: 100%;
      min-width: 0;
    }

    .aq-table-scroll {
      width: 100%;
      max-width: 100%;
      min-width: 0;
      overflow-x: auto;
      overflow-y: hidden;
    }

    table,
    .aq-table,
    table.aq-table-responsive,
    .aq-table.aq-table-responsive {
      display: table;
      width: 100%;
      min-width: 100%;
      max-width: 100%;
      table-layout: fixed;
    }

    table[data-overflow-mode="wide"],
    .aq-table.aq-table-wide,
    table.aq-table-responsive[data-overflow-mode="wide"],
    .aq-table.aq-table-responsive.aq-table-wide {
      width: max-content;
      min-width: 100%;
      max-width: none;
    }

    table.aq-table-responsive > thead,
    .aq-table.aq-table-responsive > thead {
      display: table-header-group;
    }

    table.aq-table-responsive > tbody,
    .aq-table.aq-table-responsive > tbody {
      display: table-row-group;
      width: auto;
      min-width: max-content;
      max-width: none;
    }

    table.aq-table-responsive > tbody > tr,
    .aq-table.aq-table-responsive > tbody > tr {
      display: table-row;
      width: auto;
      min-width: max-content;
      max-width: none;
    }

    table.aq-table-responsive > tbody > tr > :is(td, th),
    .aq-table.aq-table-responsive > tbody > tr > :is(td, th) {
      box-sizing: border-box;
      width: auto;
      min-width: ${TABLE_MIN_COLUMN_WIDTH_PX}px;
      max-width: none;
    }

    table.aq-table-responsive > tbody > tr > :is(td, th) > *,
    .aq-table.aq-table-responsive > tbody > tr > :is(td, th) > * {
      min-width: 0;
      max-width: none;
    }
  }

  .aq-callout.aq-admonition {
    --ad-header-h: 52px;
    --ad-accent: ${({ theme }) => (theme.scheme === "dark" ? "#4cc9f0" : "#0b63a8")};
    --ad-header-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(76, 201, 240, 0.2)" : "#e9f4ff")};
    --ad-body-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(76, 201, 240, 0.12)" : "#f4f9ff")};
    --ad-border: ${({ theme }) => (theme.scheme === "dark" ? "rgba(76, 201, 240, 0.38)" : "#9cc4e8")};
    --ad-text: ${({ theme }) => (theme.scheme === "dark" ? "#e6edf6" : "#1f2937")};
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
    font-size: 1.22rem;
    font-weight: 600;
    line-height: 1;
  }

  .aq-callout.aq-admonition .aq-callout-title {
    color: var(--ad-accent);
    font-size: 1.02rem;
    font-weight: 700;
    line-height: 1.32;
    letter-spacing: -0.01em;
  }

  .aq-callout.aq-admonition .aq-page-icon-inline {
    display: none;
  }

  .aq-callout.aq-admonition .aq-markdown-text {
    color: var(--ad-text);
    font-size: 0.98rem;
    line-height: 1.6;
  }

  .aq-callout.aq-admonition-tip {
    --ad-accent: ${({ theme }) => (theme.scheme === "dark" ? "#f6ad55" : "#c46a10")};
    --ad-header-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(246, 173, 85, 0.2)" : "#fff1d8")};
    --ad-body-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(246, 173, 85, 0.12)" : "#fff8e8")};
    --ad-border: ${({ theme }) => (theme.scheme === "dark" ? "rgba(246, 173, 85, 0.36)" : "#e9c27d")};
  }

  .aq-callout.aq-admonition-info {
    --ad-accent: ${({ theme }) => (theme.scheme === "dark" ? "#4cc9f0" : "#0b63a8")};
    --ad-header-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(76, 201, 240, 0.2)" : "#e9f4ff")};
    --ad-body-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(76, 201, 240, 0.12)" : "#f4f9ff")};
    --ad-border: ${({ theme }) => (theme.scheme === "dark" ? "rgba(76, 201, 240, 0.38)" : "#9cc4e8")};
  }

  .aq-callout.aq-admonition-warning {
    --ad-accent: ${({ theme }) => (theme.scheme === "dark" ? "#fb7185" : "#b42344")};
    --ad-header-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(251, 113, 133, 0.2)" : "#fdecef")};
    --ad-body-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(251, 113, 133, 0.12)" : "#fff6f8")};
    --ad-border: ${({ theme }) => (theme.scheme === "dark" ? "rgba(251, 113, 133, 0.38)" : "#e8a8b8")};
  }

  .aq-callout.aq-admonition-outline {
    --ad-accent: ${({ theme }) => (theme.scheme === "dark" ? "#94a3b8" : "#475569")};
    --ad-header-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(148, 163, 184, 0.2)" : "#eef2f6")};
    --ad-body-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(148, 163, 184, 0.12)" : "#f8fafc")};
    --ad-border: ${({ theme }) => (theme.scheme === "dark" ? "rgba(148, 163, 184, 0.34)" : "#c7d1dd")};
  }

  .aq-callout.aq-admonition-example {
    --ad-accent: ${({ theme }) => (theme.scheme === "dark" ? "#4ade80" : "#166534")};
    --ad-header-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(74, 222, 128, 0.2)" : "#e8f7ef")};
    --ad-body-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(74, 222, 128, 0.12)" : "#f4fcf7")};
    --ad-border: ${({ theme }) => (theme.scheme === "dark" ? "rgba(74, 222, 128, 0.36)" : "#9fd9b4")};
  }

  .aq-callout.aq-admonition-summary {
    --ad-accent: ${({ theme }) => (theme.scheme === "dark" ? "#a78bfa" : "#5b4ab8")};
    --ad-header-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(167, 139, 250, 0.2)" : "#efecff")};
    --ad-body-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(167, 139, 250, 0.12)" : "#f7f5ff")};
    --ad-border: ${({ theme }) => (theme.scheme === "dark" ? "rgba(167, 139, 250, 0.38)" : "#bfb3eb")};
  }
`

export default MarkdownRendererRoot
