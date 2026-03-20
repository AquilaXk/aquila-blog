import styled from "@emotion/styled"

const MarkdownRendererRoot = styled.div`
  margin-top: 1.65rem;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: hidden;
  overflow-wrap: anywhere;
  word-break: break-word;
  color: ${({ theme }) => theme.colors.gray12};
  line-height: 1.7;
  font-size: 1.125rem;

  h1,
  h2,
  h3,
  h4 {
    line-height: 1.34;
    letter-spacing: -0.017em;
    margin-top: 1.65rem;
    margin-bottom: 0.68rem;
    font-weight: 760;
    scroll-margin-top: 6.8rem;
  }

  h1 {
    font-size: clamp(1.88rem, 3vw, 2.3rem);
  }

  h2 {
    font-size: clamp(1.5rem, 2.35vw, 1.84rem);
  }

  h3 {
    font-size: clamp(1.2rem, 1.9vw, 1.42rem);
  }

  h4 {
    font-size: 1.04rem;
  }

  p {
    margin: 0.72rem 0;
    font-size: 1.125rem;
    line-height: 1.7;
    overflow-wrap: anywhere;
  }

  a {
    color: ${({ theme }) => (theme.scheme === "dark" ? "#7ab6ff" : "#0969da")};
    text-decoration: underline;
    text-underline-offset: 0.16em;
    text-decoration-thickness: 0.08em;
    word-break: break-word;
  }

  a:hover {
    color: ${({ theme }) => (theme.scheme === "dark" ? "#a8ceff" : "#0a58ca")};
  }

  blockquote {
    margin: 0.95rem 0;
    padding: 0.12rem 0 0.12rem 1rem;
    border-left: 4px solid ${({ theme }) => theme.colors.gray7};
    color: ${({ theme }) => theme.colors.gray11};
    background: transparent;
  }

  blockquote > :first-of-type {
    margin-top: 0;
  }

  blockquote > :last-child {
    margin-bottom: 0;
  }

  figure {
    margin: 1.25rem 0;
  }

  .aq-image-frame {
    width: min(100%, 50rem);
    margin: 0 auto;
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

  .aq-image-frame figcaption {
    margin-top: 0.62rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.84rem;
    line-height: 1.56;
    text-align: center;
  }

  ul,
  ol {
    margin: 0.68rem 0;
    padding-left: 1.28rem;
  }

  li + li {
    margin-top: 0.22rem;
  }

  li {
    line-height: 1.78;
    overflow-wrap: anywhere;
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

  hr {
    border: 0;
    border-top: 1px solid ${({ theme }) => theme.colors.gray6};
    margin: 1rem 0;
  }

  .aq-inline-code {
    border-radius: 6px;
    padding: 0.16rem 0.38rem;
    background: ${({ theme }) => theme.colors.gray4};
    font-size: 0.9em;
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
    display: block;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "#2b2d3a" : "#f2f4f8"};
  }

  .aq-code-block .aq-code {
    width: max-content;
    margin: 0;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    padding: 1.05rem 1.18rem 3.55rem;
    min-width: 100%;
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "#2b2d3a" : "#f2f4f8"};
    color: ${({ theme }) => (theme.scheme === "dark" ? "#a9b7c6" : "#2f3747")};
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

  .aq-pretty-pre code > [data-line] {
    display: block;
    position: relative;
    padding-left: 3rem;
  }

  .aq-pretty-pre code > [data-line]::before {
    counter-increment: aq-line;
    content: counter(aq-line);
    position: absolute;
    left: 0;
    top: 0;
    width: 2.15rem;
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

  .aq-pretty-pre code,
  .aq-pretty-pre code span {
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
    margin: 0.9rem 0;
  }

  .aq-mermaid {
    margin: 1rem 0;
    display: block;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    white-space: normal;
    padding: 0.2rem 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    scrollbar-width: thin;
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
    overflow-x: hidden;
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

  .aq-mermaid-stage > svg .nodeLabel p,
  .aq-mermaid-stage > svg .edgeLabel p {
    margin: 0;
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
    line-height: 1.8;

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
      line-height: 1.76;
    }

    .aq-code code,
    pre code {
      font-size: 0.875rem;
      line-height: 1.5;
    }

    table {
      width: 100%;
      max-width: 100%;
      table-layout: fixed;
    }

    table th,
    table td {
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: break-word;
      font-size: 0.95rem;
      line-height: 1.58;
      padding: 0.66rem 0.72rem;
    }

    .aq-code-toolbar {
      grid-template-columns: auto 1fr;
    }

    .aq-code-block .aq-code {
      padding-left: 0.88rem;
      padding-right: 0.88rem;
      padding-bottom: 3.55rem;
    }

    .aq-code-copy-bottom {
      right: 0.66rem;
      bottom: 0.66rem;
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
  }

  .aq-toggle > summary {
    cursor: pointer;
    font-weight: 700;
    list-style: none;
    padding: 0;
  }

  .aq-toggle[open] > *:not(summary) {
    margin-top: 0.5rem;
  }

  .aq-toggle > summary::-webkit-details-marker {
    display: none;
  }

  .aq-toggle > summary::before {
    content: "▸";
    margin-right: 0.45rem;
  }

  .aq-toggle[open] > summary::before {
    content: "▾";
  }

  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    border-radius: 12px;
    overflow: hidden;
    margin: 1rem 0;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
  }

  thead th {
    background: ${({ theme }) => theme.colors.gray3};
    font-weight: 700;
    border-bottom: 2px solid
      ${({ theme }) => (theme.scheme === "dark" ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.16)")};
  }

  th,
  td {
    padding: 0.72rem 0.9rem;
    border-right: 1px solid ${({ theme }) => theme.colors.gray6};
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
    vertical-align: top;
  }

  tr td:last-child,
  tr th:last-child {
    border-right: 0;
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }

  .aq-callout.aq-admonition {
    --ad-header-h: 52px;
    --ad-accent: #10acc6;
    --ad-header-bg: #d8e8ee;
    --ad-body-bg: #eceff1;
    --ad-border: #dde2e7;
    --ad-text: #4e5e68;
    --ad-strip-w: 8px;
    --ad-icon-svg: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Ccircle cx='24' cy='24' r='21' fill='%2310acc6'/%3E%3Crect x='22' y='19' width='4' height='14' rx='2' fill='white'/%3E%3Ccircle cx='24' cy='13' r='3' fill='white'/%3E%3C/svg%3E");
    position: relative;
    display: block;
    border: 0;
    border-radius: 8px;
    overflow: hidden;
    padding: 0;
    margin: 0.9rem 0;
    background: linear-gradient(
      to right,
      var(--ad-accent) 0 var(--ad-strip-w),
      var(--ad-body-bg) var(--ad-strip-w) 100%
    );
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    color: var(--ad-text);
  }

  .aq-callout.aq-admonition::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    right: 0;
    height: var(--ad-header-h);
    background-image:
      linear-gradient(
        to right,
        transparent 0 var(--ad-strip-w),
        var(--ad-header-bg) var(--ad-strip-w) 100%
      ),
      linear-gradient(
        to right,
        transparent 0 var(--ad-strip-w),
        var(--ad-border) var(--ad-strip-w) 100%
      );
    background-repeat: no-repeat;
    background-size:
      100% calc(100% - 1px),
      100% 1px;
    background-position:
      left top,
      left bottom;
    z-index: 1;
    pointer-events: none;
  }

  .aq-callout.aq-admonition::after {
    content: "";
    position: absolute;
    left: var(--ad-strip-w);
    top: 0;
    right: 0;
    bottom: 0;
    border: 1px solid var(--ad-border);
    border-left: 0;
    border-radius: 0 8px 8px 0;
    z-index: 0;
    pointer-events: none;
  }

  .aq-callout.aq-admonition > * {
    position: relative;
    z-index: 2;
  }

  .aq-callout.aq-admonition .aq-callout-box-text {
    margin-left: 0;
    padding: 64px 32px 18px 32px;
    color: var(--ad-text);
  }

  .aq-callout.aq-admonition .aq-callout-box-text::before {
    content: attr(data-admonition-title);
    position: absolute;
    left: 58px;
    top: calc(var(--ad-header-h) / 2);
    transform: translateY(-50%);
    color: var(--ad-accent);
    font-size: 1.2rem;
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: 0;
  }

  .aq-callout.aq-admonition .aq-callout-box-text::after {
    content: "";
    position: absolute;
    left: 24px;
    top: calc(var(--ad-header-h) / 2);
    transform: translateY(-50%);
    width: 24px;
    height: 24px;
    background-image: var(--ad-icon-svg);
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
  }

  .aq-callout.aq-admonition .aq-page-icon-inline {
    display: none;
  }

  .aq-callout.aq-admonition .aq-markdown-text {
    color: var(--ad-text);
    font-size: 0.98rem;
    line-height: 1.6;
  }

  .aq-callout.aq-admonition .aq-markdown-text[data-admonition-heading="true"] {
    display: none;
  }

  .aq-callout.aq-admonition-tip {
    --ad-accent: #e08600;
    --ad-header-bg: #ebe2d4;
    --ad-body-bg: #ececec;
    --ad-icon-svg: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Ccircle cx='24' cy='24' r='21' fill='%23f39200'/%3E%3Cpath d='M24 10c-6 0-10 4.6-10 10.2 0 3.3 1.5 5.4 3.5 7.3 1.4 1.3 2.5 2.8 2.5 4.8h8c0-2 1.1-3.5 2.5-4.8 2-1.9 3.5-4 3.5-7.3C34 14.6 30 10 24 10z' fill='white'/%3E%3Crect x='20' y='33' width='8' height='3' rx='1.5' fill='white'/%3E%3Crect x='21' y='37' width='6' height='2.5' rx='1.25' fill='white'/%3E%3C/svg%3E");
  }

  .aq-callout.aq-admonition-info {
    --ad-accent: #1098b0;
    --ad-header-bg: #d8e8ee;
    --ad-body-bg: #eceff1;
    --ad-icon-svg: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Ccircle cx='24' cy='24' r='21' fill='%2310acc6'/%3E%3Crect x='22' y='19' width='4' height='14' rx='2' fill='white'/%3E%3Ccircle cx='24' cy='13' r='3' fill='white'/%3E%3C/svg%3E");
  }

  .aq-callout.aq-admonition-warning {
    --ad-accent: #c86a73;
    --ad-header-bg: #f0dee2;
    --ad-body-bg: #f1eaec;
    --ad-icon-svg: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Cpolygon points='24,4 45,41 3,41' fill='%23d96c77'/%3E%3Crect x='22' y='16' width='4' height='14' rx='2' fill='white'/%3E%3Ccircle cx='24' cy='34' r='2.5' fill='white'/%3E%3C/svg%3E");
  }

  .aq-callout.aq-admonition-outline {
    --ad-accent: #6e94ad;
    --ad-header-bg: #dfe8ef;
    --ad-body-bg: #e8eef3;
    --ad-icon-svg: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Crect x='7' y='5' width='34' height='38' rx='4' fill='%236e94ad'/%3E%3Crect x='13' y='14' width='22' height='2.8' rx='1.4' fill='white'/%3E%3Crect x='13' y='21' width='22' height='2.8' rx='1.4' fill='white'/%3E%3Crect x='13' y='28' width='16' height='2.8' rx='1.4' fill='white'/%3E%3Crect x='17' y='2.5' width='14' height='6' rx='3' fill='%235b7f96'/%3E%3C/svg%3E");
  }

  .aq-callout.aq-admonition-example {
    --ad-accent: #2d9b56;
    --ad-header-bg: #deefdf;
    --ad-body-bg: #eaf4eb;
    --ad-icon-svg: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Crect x='5' y='5' width='38' height='38' rx='8' fill='%232d9b56'/%3E%3Cpath d='M14 25.5l6.2 6.3L34.5 17.5' fill='none' stroke='white' stroke-width='4.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  }

  .aq-callout.aq-admonition-summary {
    --ad-accent: #7a6fb2;
    --ad-header-bg: #e5e2f0;
    --ad-body-bg: #edebf5;
    --ad-icon-svg: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Cpath d='M8 11h22v28H8z' fill='%237a6fb2'/%3E%3Cpath d='M18 8h22v28H18z' fill='%238a80c2'/%3E%3Cpath d='M23 16h12M23 22h12M23 28h8' stroke='white' stroke-width='2.4' stroke-linecap='round'/%3E%3C/svg%3E");
  }
`

export default MarkdownRendererRoot
