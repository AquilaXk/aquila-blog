import { css } from "@emotion/react"

export const notionRendererStyles = css`
  /* // TODO: why render? */
  .notion-collection-page-properties {
    display: none !important;
  }
  .notion-page {
    padding: 0;
  }
  .notion-list {
    width: 100%;
  }

  .notion-callout.notion-admonition {
    --ad-header-h: 52px;
    --ad-accent: #10acc6;
    --ad-header-bg: #d8e8ee;
    --ad-body-bg: #eceff1;
    --ad-border: #dde2e7;
    --ad-text: #4e5e68;
    --ad-icon-bg: #10acc6;
    --ad-strip-w: 8px;
    --ad-icon-svg: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Ccircle cx='24' cy='24' r='21' fill='%2310acc6'/%3E%3Crect x='22' y='19' width='4' height='14' rx='2' fill='white'/%3E%3Ccircle cx='24' cy='13' r='3' fill='white'/%3E%3C/svg%3E");
    position: relative;
    display: block;
    border: 0;
    border-radius: 8px;
    overflow: hidden;
    padding: 0;
    background: linear-gradient(
      to right,
      var(--ad-accent) 0 var(--ad-strip-w),
      var(--ad-body-bg) var(--ad-strip-w) 100%
    );
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    color: var(--ad-text);
  }

  .notion-callout.notion-admonition::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    right: 0;
    height: var(--ad-header-h);
    background: linear-gradient(
      to right,
      transparent 0 var(--ad-strip-w),
      var(--ad-header-bg) var(--ad-strip-w) 100%
    );
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

  .notion-callout.notion-admonition::after {
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

  .notion-callout.notion-admonition > * {
    position: relative;
    z-index: 2;
  }

  .notion-callout.notion-admonition .notion-callout-text::before {
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

  .notion-callout.notion-admonition .notion-callout-text::after {
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

  .notion-callout.notion-admonition .notion-page-icon-inline {
    display: none;
  }

  .notion-callout.notion-admonition .notion-callout-text {
    margin-left: 0;
    padding: 64px 32px 18px 32px;
    color: var(--ad-text);
  }

  .notion-callout.notion-admonition .notion-text {
    color: var(--ad-text);
    font-size: 0.98rem;
    line-height: 1.6;
  }

  .notion-callout.notion-admonition .notion-text[data-admonition-heading="true"] {
    display: none;
  }

  .notion-callout.notion-admonition-tip {
    --ad-accent: #e08600;
    --ad-header-bg: #ebe2d4;
    --ad-body-bg: #ececec;
    --ad-icon-svg: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Ccircle cx='24' cy='24' r='21' fill='%23f39200'/%3E%3Cpath d='M24 10c-6 0-10 4.6-10 10.2 0 3.3 1.5 5.4 3.5 7.3 1.4 1.3 2.5 2.8 2.5 4.8h8c0-2 1.1-3.5 2.5-4.8 2-1.9 3.5-4 3.5-7.3C34 14.6 30 10 24 10z' fill='white'/%3E%3Crect x='20' y='33' width='8' height='3' rx='1.5' fill='white'/%3E%3Crect x='21' y='37' width='6' height='2.5' rx='1.25' fill='white'/%3E%3C/svg%3E");
  }

  .notion-callout.notion-admonition-info {
    --ad-accent: #1098b0;
    --ad-header-bg: #d8e8ee;
    --ad-body-bg: #eceff1;
    --ad-icon-svg: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Ccircle cx='24' cy='24' r='21' fill='%2310acc6'/%3E%3Crect x='22' y='19' width='4' height='14' rx='2' fill='white'/%3E%3Ccircle cx='24' cy='13' r='3' fill='white'/%3E%3C/svg%3E");
  }

  .notion-callout.notion-admonition-warning {
    --ad-accent: #c86a73;
    --ad-header-bg: #f0dee2;
    --ad-body-bg: #f1eaec;
    --ad-icon-svg: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Cpolygon points='24,4 45,41 3,41' fill='%23d96c77'/%3E%3Crect x='22' y='16' width='4' height='14' rx='2' fill='white'/%3E%3Ccircle cx='24' cy='34' r='2.5' fill='white'/%3E%3C/svg%3E");
  }

  .notion-callout.notion-admonition-outline {
    --ad-accent: #6e94ad;
    --ad-header-bg: #dfe8ef;
    --ad-body-bg: #e8eef3;
    --ad-icon-svg: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Crect x='7' y='5' width='34' height='38' rx='4' fill='%236e94ad'/%3E%3Crect x='13' y='14' width='22' height='2.8' rx='1.4' fill='white'/%3E%3Crect x='13' y='21' width='22' height='2.8' rx='1.4' fill='white'/%3E%3Crect x='13' y='28' width='16' height='2.8' rx='1.4' fill='white'/%3E%3Crect x='17' y='2.5' width='14' height='6' rx='3' fill='%235b7f96'/%3E%3C/svg%3E");
  }

  .notion-callout.notion-admonition-example {
    --ad-accent: #2d9b56;
    --ad-header-bg: #deefdf;
    --ad-body-bg: #eaf4eb;
    --ad-icon-svg: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Crect x='5' y='5' width='38' height='38' rx='8' fill='%232d9b56'/%3E%3Cpath d='M14 25.5l6.2 6.3L34.5 17.5' fill='none' stroke='white' stroke-width='4.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  }

  .notion-callout.notion-admonition-summary {
    --ad-accent: #7a6fb2;
    --ad-header-bg: #e5e2f0;
    --ad-body-bg: #edebf5;
    --ad-icon-svg: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Cpath d='M8 11h22v28H8z' fill='%237a6fb2'/%3E%3Cpath d='M18 8h22v28H18z' fill='%238a80c2'/%3E%3Cpath d='M23 16h12M23 22h12M23 28h8' stroke='white' stroke-width='2.4' stroke-linecap='round'/%3E%3C/svg%3E");
  }

  .notion-table-view,
  .notion-table,
  .notion-simple-table {
    border: none;
    border-radius: 12px;
    overflow: hidden;
    background: transparent;
  }

  .notion-simple-table {
    border-collapse: separate;
    border-spacing: 0;
    width: 100%;
    table-layout: auto;
  }

  .notion-simple-table td {
    border: 0;
    padding: 14px 18px;
    border-right: 1px solid var(--fg-color-1);
    border-bottom: 1px solid var(--fg-color-1);
    background: transparent;
    vertical-align: middle;
  }

  .notion-simple-table tr td:last-child {
    border-right: 0;
  }

  .notion-simple-table tr:last-child td {
    border-bottom: 0;
  }

  .notion-simple-table tr:first-child td {
    background: var(--bg-color-0);
    font-weight: 700;
    border-bottom: 2px solid rgba(0, 0, 0, 0.16);
  }

  .notion.dark-mode .notion-simple-table tr:first-child td {
    border-bottom-color: rgba(255, 255, 255, 0.22);
  }

  .notion-simple-table[data-page-link-table="true"] .notion-page-link {
    height: auto;
    align-items: flex-start;
  }

  .notion-simple-table[data-page-link-table="true"] .notion-link {
    display: block;
    width: 100%;
    white-space: normal;
    border-bottom: 0 none;
  }

  .notion-simple-table[data-page-link-table="true"] .notion-link:hover {
    border-bottom: 0 none;
  }

  .notion-simple-table[data-page-link-table="true"] .notion-page-title {
    display: flex;
    width: 100%;
    align-items: flex-start;
  }

  .notion-simple-table[data-page-link-table="true"] .notion-page-title-text {
    border-bottom: 0 !important;
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
    line-height: 1.45;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .notion-simple-table[data-page-link-table="true"] td {
    width: auto !important;
  }

  .notion-row .notion-column {
    min-width: 0;
  }

  .notion-column .notion-page-link {
    height: auto;
    align-items: flex-start;
  }

  .notion-column .notion-link {
    display: block;
    width: 100%;
    min-width: 0;
    white-space: normal;
    border-bottom: 0 none;
  }

  .notion-column .notion-link:hover {
    border-bottom: 0 none;
  }

  .notion-column .notion-page-title {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: flex-start;
  }

  .notion-column .notion-page-title-text {
    border-bottom: 0 !important;
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
    line-height: 1.45;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .notion-code,
  pre[class*="language-"] {
    border-radius: 12px;
  }

  .notion.dark-mode .notion-code,
  .notion.dark-mode pre[class*="language-"] {
    background-color: #1f232a;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .notion.dark-mode :not(pre) > code[class*="language-"] {
    background-color: #1f232a;
  }
`
