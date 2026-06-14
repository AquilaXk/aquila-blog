import { css, type Theme } from "@emotion/react"
import {
  TABLE_MIN_COLUMN_WIDTH_PX,
  TABLE_MIN_ROW_HEIGHT_PX,
} from "src/libs/markdown/tableMetadata"
import {
  getTableChromePalette,
  TABLE_SHARED_MARGIN_Y,
  TABLE_SHARED_RADIUS_PX,
} from "src/libs/markdown/tableChrome"

export const markdownRendererRootTableToggleStyles = (theme: Theme) => css`
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
    margin: ${TABLE_SHARED_MARGIN_Y} 0;
  }

  .aq-table-scroll {
    ${(() => {
      const tableChrome = getTableChromePalette(theme)
      return `
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    border: 1px solid ${tableChrome.border};
    border-radius: ${TABLE_SHARED_RADIUS_PX}px;
    background: ${tableChrome.background};
    box-shadow: ${tableChrome.shadow};
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    overscroll-behavior-y: auto;
    touch-action: pan-x;
      `
    })()}
  }

  .aq-table-shell[data-table-width-mode="explicit-normal"],
  .aq-table-scroll[data-table-width-mode="explicit-normal"] {
    width: fit-content;
    max-width: 100%;
    min-width: 0;
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
    ${(() => {
      const tableChrome = getTableChromePalette(theme)
      return `
    text-align: left;
    background: ${tableChrome.headerBackground};
    font-weight: 700;
    line-height: 1.52;
    padding-top: calc(0.78rem + 0.14rem);
    padding-bottom: calc(0.78rem - 0.14rem);
    border-bottom: 2px solid ${tableChrome.headerRule};
      `
    })()}
  }

  @media (min-width: 769px) {
    thead th,
    .aq-table thead th {
      line-height: 1.6;
      padding-top: calc(0.78rem + 0.32rem);
      padding-bottom: calc(0.78rem - 0.04rem);
    }
  }

  th,
  td,
  .aq-table th,
  .aq-table td {
    padding: 0.78rem 0.92rem;
    border-right: 1px solid ${ theme.colors.gray6};
    border-bottom: 1px solid ${ theme.colors.gray6};
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
      margin: calc(${TABLE_SHARED_MARGIN_Y} - 0.1rem) 0;
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

`
