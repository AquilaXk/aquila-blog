import styled from "@emotion/styled"
import { articleTypographyScale, markdownContentTypography } from "src/libs/markdown/contentTypography"
import { getTableChromePalette, TABLE_SHARED_MARGIN_Y, TABLE_SHARED_RADIUS_PX } from "src/libs/markdown/tableChrome"
import {
  TABLE_MIN_COLUMN_WIDTH_PX,
  TABLE_MIN_ROW_HEIGHT_PX,
  TABLE_WIDE_COLUMN_MIN_WIDTH_PX,
} from "src/libs/markdown/tableMetadata"

export const EditorViewport = styled.div`
  position: relative;
  border: 0;
  border-radius: 0;
  background: transparent;
  overflow: visible;

  &[data-row-resize-hot="true"] {
    cursor: row-resize;
  }

  .aq-block-editor__content {
    min-width: 0;
    min-height: 32rem;
    padding: 1.1rem 0 1.8rem;
    outline: none;
    overflow-x: hidden;
  }

  ${({ theme }) => markdownContentTypography(".aq-block-editor__content", theme)}

  .aq-block-editor__content > * {
    width: 100%;
    max-width: var(--compose-pane-readable-width, var(--article-readable-width, 48rem));
    min-width: 0;
    margin-left: auto;
    margin-right: auto;
    border-radius: 0.9rem;
    transition:
      background-color 140ms ease,
      box-shadow 140ms ease,
      transform 140ms ease,
      opacity 140ms ease;
  }

  .aq-block-editor__content h1,
  .aq-block-editor__content h2,
  .aq-block-editor__content h3,
  .aq-block-editor__content h4 {
    text-align: left !important;
  }

  .aq-block-editor__content blockquote {
    width: 100%;
    max-width: var(--compose-pane-readable-width, var(--article-readable-width, 48rem));
    box-sizing: border-box;
    margin: 0.95rem auto;
    padding: 0.12rem 0 0.12rem 1rem;
    border-left: 4px solid ${({ theme }) => theme.colors.gray7};
    border-radius: 0;
    background: transparent !important;
    color: ${({ theme }) => theme.colors.gray11};
    box-shadow: none;
  }

  .aq-block-editor__content blockquote > :first-of-type {
    margin-top: 0;
  }

  .aq-block-editor__content blockquote > :last-child {
    margin-bottom: 0;
  }

  .aq-block-editor__content > blockquote[data-block-hovered="true"],
  .aq-block-editor__content > blockquote[data-block-selected="true"],
  .aq-block-editor__content > blockquote[data-block-dragging="true"] {
    background: transparent !important;
    box-shadow: none;
  }

  .aq-block-editor__content .aq-code-editor-content,
  .aq-block-editor__content .aq-code-editor-content > div {
    text-align: left;
    white-space: pre;
    overflow-wrap: normal;
    word-break: normal;
  }

  .aq-block-editor__content .aq-code-shell {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    touch-action: pan-x pan-y;
  }

  .aq-block-editor__content > *[data-block-hovered="true"] {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(59, 130, 246, 0.08)" : "rgba(59, 130, 246, 0.08)"};
    box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.18);
  }

  .aq-block-editor__content > *[data-block-selected="true"] {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(59, 130, 246, 0.12)" : "rgba(59, 130, 246, 0.1)"};
    box-shadow: none;
  }

  .aq-block-editor__content li[data-list-item="true"][data-block-hovered="true"],
  .aq-block-editor__content li[data-task-item="true"][data-block-hovered="true"] {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(59, 130, 246, 0.08)" : "rgba(59, 130, 246, 0.08)"};
    box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.18);
    border-radius: 10px;
  }

  .aq-block-editor__content li[data-list-item="true"][data-block-selected="true"],
  .aq-block-editor__content li[data-task-item="true"][data-block-selected="true"] {
    background: transparent;
    box-shadow: none;
    border-radius: 0;
  }

  .aq-block-editor__content > *[data-block-dragging="true"] {
    opacity: 0.34;
    transform: scale(0.994);
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(59, 130, 246, 0.14)" : "rgba(59, 130, 246, 0.12)"};
    box-shadow:
      inset 0 0 0 1px rgba(59, 130, 246, 0.28),
      0 0 0 1px rgba(59, 130, 246, 0.2);
    filter: saturate(0.9);
  }

  .aq-block-editor__content p.is-editor-empty:first-of-type::before {
    content: attr(data-placeholder);
    color: var(--color-gray10);
    float: left;
    height: 0;
    pointer-events: none;
  }

  .aq-block-editor__content ::selection {
    background: rgba(59, 130, 246, 0.24);
  }

  .aq-block-editor__content[data-keyboard-block-selection="true"] ::selection {
    background: transparent;
    color: inherit;
  }

  .aq-block-editor__content pre {
    overflow: auto;
    border-radius: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.03);
    color: var(--color-gray12);
    padding: 1rem 1.1rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
      "Courier New", monospace;
    font-size: ${articleTypographyScale.codeFontSize};
    line-height: ${articleTypographyScale.codeLineHeight};
  }

  .aq-block-editor__content code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
      "Courier New", monospace;
    font-size: ${articleTypographyScale.codeFontSize};
    line-height: ${articleTypographyScale.codeLineHeight};
    border-radius: 0.42rem;
    background: rgba(255, 255, 255, 0.075);
    color: #ff6b6b;
    padding: 0.14em 0.4em 0.16em;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
    letter-spacing: -0.01em;
  }

  .aq-block-editor__content pre code {
    font-size: inherit;
    line-height: inherit;
    border-radius: 0;
    background: transparent;
    color: inherit;
    padding: 0;
    box-shadow: none;
    letter-spacing: 0;
  }

  @media (max-width: 768px) {
    .aq-block-editor__content pre,
    .aq-block-editor__content code {
      font-size: ${articleTypographyScale.codeFontSizeMobile};
      line-height: ${articleTypographyScale.codeLineHeightMobile};
    }
  }

  .aq-block-editor__content ul[data-type="taskList"],
  .aq-block-editor__content ul[data-task-list="true"] {
    width: 100%;
    max-width: var(--compose-pane-readable-width, var(--article-readable-width, 48rem));
    list-style: none;
    padding-left: 0;
  }

  .aq-block-editor__content li[data-type="taskItem"],
  .aq-block-editor__content li[data-task-item="true"] {
    display: flex;
    align-items: flex-start;
    gap: 0.72rem;
    margin: 0.45rem 0;
    cursor: grab;
    border-radius: 0.8rem;
    transition:
      background-color 140ms ease,
      box-shadow 140ms ease;
  }

  .aq-block-editor__content li[data-type="taskItem"]:active,
  .aq-block-editor__content li[data-task-item="true"]:active {
    cursor: grabbing;
  }

  .aq-block-editor__content li[data-type="taskItem"]:hover,
  .aq-block-editor__content li[data-task-item="true"]:hover {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(59, 130, 246, 0.06)" : "rgba(59, 130, 246, 0.06)"};
    box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.14);
  }

  .aq-block-editor__content li[data-type="taskItem"] > label,
  .aq-block-editor__content li[data-task-item="true"] > label {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-top: 0.12rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .aq-block-editor__content li[data-type="taskItem"] > label input[type="checkbox"],
  .aq-block-editor__content li[data-task-item="true"] > label input[type="checkbox"] {
    margin: 0.22rem 0 0;
    width: 0.95rem;
    height: 0.95rem;
    accent-color: ${({ theme }) => (theme.scheme === "dark" ? "#4493f8" : "#0969da")};
  }

  .aq-block-editor__content li[data-type="taskItem"] > div,
  .aq-block-editor__content li[data-task-item="true"] > div {
    flex: 1;
    min-width: 0;
  }

  .aq-block-editor__content li[data-type="taskItem"] > div > :first-child,
  .aq-block-editor__content li[data-task-item="true"] > div > :first-child {
    margin-top: 0;
  }

  .aq-block-editor__content li[data-type="taskItem"] > div > :last-child,
  .aq-block-editor__content li[data-task-item="true"] > div > :last-child {
    margin-bottom: 0;
  }

  .aq-block-editor__content table {
    width: auto;
    min-width: 0;
    max-width: none;
    margin: 0;
    border-collapse: separate;
    border-spacing: 0;
    table-layout: fixed;
    background: transparent;
  }

  .aq-block-editor__content .tableWrapper > table {
    table-layout: fixed;
  }

  .aq-block-editor__content .tableWrapper {
    ${({ theme }) => {
      const tableChrome = getTableChromePalette(theme)
      return `
    display: block;
    position: relative;
    isolation: isolate;
    inline-size: fit-content;
    width: fit-content;
    max-width: 100%;
    max-inline-size: 100%;
    min-width: 0;
    box-sizing: border-box;
    overflow-x: auto;
    overflow-y: hidden;
    margin: ${TABLE_SHARED_MARGIN_Y} 0;
    border: 1px solid ${tableChrome.border};
    border-radius: ${TABLE_SHARED_RADIUS_PX}px;
    background: ${tableChrome.background};
    box-shadow: ${tableChrome.shadow};
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    overscroll-behavior-y: auto;
    touch-action: pan-x pan-y;
    transition:
      border-color 140ms ease,
      box-shadow 140ms ease,
      background 140ms ease;
      `
    }}
  }

  .aq-block-editor__content .tableWrapper:hover {
    ${({ theme }) => {
      const tableChrome = getTableChromePalette(theme)
      return `
    border-color: ${tableChrome.hoverBorder};
    box-shadow: ${tableChrome.shadow}, ${tableChrome.hoverRing};
      `
    }}
  }

  .aq-block-editor__content .tableWrapper[data-overflow-mode="wide"] {
    display: block;
    inline-size: 100%;
    width: 100%;
    max-width: 100%;
    max-inline-size: 100%;
  }

  .aq-block-editor__content .tableWrapper > table[data-overflow-mode="wide"] {
    width: max-content !important;
    min-width: 100% !important;
    max-width: none !important;
    table-layout: fixed !important;
  }

  .aq-block-editor__content th,
  .aq-block-editor__content td {
    border-right: 1px solid ${({ theme }) => theme.colors.gray6};
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
    padding: 0.78rem 0.92rem;
    text-align: left;
    vertical-align: top;
    position: relative;
    min-width: max(${TABLE_MIN_COLUMN_WIDTH_PX}px, 10ch);
    min-height: ${TABLE_MIN_ROW_HEIGHT_PX}px;
    white-space: normal;
    overflow-wrap: break-word;
    word-break: normal;
  }

  .aq-block-editor__content td {
    background: transparent;
  }

  .aq-block-editor__content th {
    ${({ theme }) => {
      const tableChrome = getTableChromePalette(theme)
      const headerColumnBackground =
        theme.scheme === "dark" ? "rgba(51, 65, 85, 0.46)" : "rgba(241, 245, 249, 0.96)"
      return `
    background: ${headerColumnBackground};
    color: ${theme.colors.gray12};
    font-weight: 700;
    box-shadow: inset 0 -1px 0 ${tableChrome.headerRule};
      `
    }}
  }

  .aq-block-editor__content thead th {
    ${({ theme }) => {
      const tableChrome = getTableChromePalette(theme)
      const headerRowBackground =
        theme.scheme === "dark" ? "rgba(71, 85, 105, 0.56)" : "rgba(226, 232, 240, 0.98)"
      return `
    background: ${headerRowBackground};
    border-bottom: 2px solid ${tableChrome.headerRule};
    box-shadow: inset 0 -1px 0 ${tableChrome.headerRule};
      `
    }}
  }

  .aq-block-editor__content tr > :is(th, td):last-child {
    border-right: 0;
  }

  .aq-block-editor__content .tableWrapper > table[data-overflow-mode="wide"] :is(th, td) {
    min-width: max(${TABLE_WIDE_COLUMN_MIN_WIDTH_PX}px, 12ch);
    white-space: normal;
    overflow-wrap: break-word;
    word-break: normal;
  }

  .aq-block-editor__content tbody tr:last-child > :is(td, th) {
    border-bottom: 0;
  }

  .aq-block-editor__content tr[data-row-resize-active="true"] > :is(td, th) {
    box-shadow: inset 0 -2px 0 rgba(96, 165, 250, 0.5);
  }

  .aq-block-editor__content .selectedCell::after {
    background: rgba(148, 163, 184, 0.12);
  }

  .aq-block-editor__content .column-resize-handle {
    display: none !important;
    pointer-events: none !important;
  }

  .aq-block-editor__content.resize-cursor {
    cursor: col-resize;
  }

  @media (max-width: 768px) {
    .aq-block-editor__content table {
      width: 100%;
      min-width: 100%;
      max-width: 100%;
      table-layout: fixed;
    }

    .aq-block-editor__content th,
    .aq-block-editor__content td {
      font-size: 0.95rem;
      line-height: 1.58;
      padding: 0.66rem 0.72rem;
      white-space: normal;
      overflow-wrap: break-word;
      word-break: normal;
    }

    .aq-block-editor__content .tableWrapper {
      margin: 0.9rem 0;
      max-inline-size: 100%;
    }
  }
`

export const BubbleToolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 0.35rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 0.9rem;
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(15, 18, 24, 0.96)" : "rgba(255, 255, 255, 0.98)"};
  box-shadow: ${({ theme }) =>
    theme.scheme === "dark" ? "0 10px 18px rgba(0, 0, 0, 0.16)" : "0 10px 18px rgba(15, 23, 42, 0.1)"};

  &[data-layout="table"] {
    max-width: min(92vw, 40rem);
  }
`

export const TextBubbleToolbar = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  padding: 0.38rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 0.95rem;
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(28, 28, 28, 0.98)" : "rgba(255, 255, 255, 0.98)"};
  box-shadow: ${({ theme }) =>
    theme.scheme === "dark" ? "0 16px 30px rgba(0, 0, 0, 0.26)" : "0 16px 30px rgba(15, 23, 42, 0.16)"};
  backdrop-filter: blur(10px);
`

export const TextBubbleIconButton = styled.button`
  min-width: 2.05rem;
  height: 2.05rem;
  padding: 0 0.46rem;
  border-radius: 0.62rem;
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.95rem;
  font-weight: 730;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color 140ms ease, color 140ms ease;

  svg {
    width: 1.02rem;
    height: 1.02rem;
  }

  &[data-active="true"] {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(148, 163, 184, 0.16)" : "rgba(15, 23, 42, 0.09)"};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &:hover {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(148, 163, 184, 0.1)" : "rgba(15, 23, 42, 0.06)"};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

export const TextBubbleDivider = styled.span`
  width: 1px;
  height: 1.35rem;
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(148, 163, 184, 0.22)" : "rgba(15, 23, 42, 0.16)"};
`

export const TextBubbleDisclosure = styled.details`
  position: relative;
  display: inline-flex;
  flex-direction: column;

  summary {
    list-style: none;
    min-width: 2.05rem;
    height: 2.05rem;
    padding: 0 0.46rem;
    border-radius: 0.62rem;
    border: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background-color 140ms ease, color 140ms ease;
  }

  summary[data-active="true"] {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(148, 163, 184, 0.16)" : "rgba(15, 23, 42, 0.09)"};
    color: ${({ theme }) => theme.colors.gray12};
  }

  summary:hover {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(148, 163, 184, 0.1)" : "rgba(15, 23, 42, 0.06)"};
    color: ${({ theme }) => theme.colors.gray12};
  }

  summary::-webkit-details-marker {
    display: none;
  }

  .body {
    position: absolute;
    top: calc(100% + 0.42rem);
    left: 0;
    z-index: 72;
    display: grid;
    gap: 0.35rem;
    min-width: 9rem;
    padding: 0.5rem;
    border-radius: 0.8rem;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(28, 28, 28, 0.98)" : "rgba(255, 255, 255, 0.99)"};
    box-shadow: ${({ theme }) =>
      theme.scheme === "dark" ? "0 16px 30px rgba(0, 0, 0, 0.26)" : "0 16px 30px rgba(15, 23, 42, 0.16)"};
  }
`

export const TextBubbleTextStyleTrigger = styled.span`
  font-size: 0.9rem;
  font-weight: 760;
  letter-spacing: -0.01em;
`

export const TextBubbleColorTrigger = styled.span`
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;

  span {
    font-size: 0.92rem;
    font-weight: 760;
    line-height: 1;
    letter-spacing: -0.01em;
  }

  i {
    width: 0.92rem;
    height: 0.15rem;
    border-radius: 999px;
    background: ${({ theme }) => theme.colors.gray8};
  }
`

export const TextBubbleColorSwatch = styled.span`
  display: inline-flex;
  width: 0.82rem;
  height: 0.82rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray3};

  &[data-empty="true"] {
    position: relative;
    background: transparent;
  }

  &[data-empty="true"]::after {
    content: "";
    position: absolute;
    inset: 0.35rem -0.08rem auto -0.08rem;
    height: 1.4px;
    background: ${({ theme }) => theme.colors.gray10};
    transform: rotate(-34deg);
    transform-origin: center;
  }
`

export const TextBubbleMenuButton = styled.button`
  min-height: 1.92rem;
  border-radius: 0.62rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(18, 21, 26, 0.52)" : "rgba(255, 255, 255, 0.98)"};
  color: var(--color-gray12);
  padding: 0 0.58rem;
  display: inline-flex;
  align-items: center;
  gap: 0.46rem;
  text-align: left;
  font-size: 0.76rem;

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-weight: 700;
  }

  strong {
    font-weight: 700;
  }

  &[data-active="true"] {
    border-color: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(59, 130, 246, 0.34)" : "rgba(37, 99, 235, 0.25)"};
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(37, 99, 235, 0.12)" : "rgba(37, 99, 235, 0.09)"};
  }

  &:hover {
    border-color: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(148, 163, 184, 0.3)" : "rgba(15, 23, 42, 0.22)"};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

export const FloatingBubbleToolbar = styled.div`
  position: fixed;
  z-index: 60;
  transform: translate(-50%, calc(-100% - 0.65rem));
  pointer-events: none;

  &[data-anchor="left"] {
    transform: translate(0, calc(-100% - 0.65rem));
  }

  > * {
    pointer-events: auto;
  }
`
