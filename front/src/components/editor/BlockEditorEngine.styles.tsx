import { keyframes } from "@emotion/react"
import styled from "@emotion/styled"
import { articleTypographyScale, markdownContentTypography } from "src/libs/markdown/contentTypography"
import { getTableChromePalette, TABLE_SHARED_MARGIN_Y, TABLE_SHARED_RADIUS_PX } from "src/libs/markdown/tableChrome"
import {
  TABLE_MIN_COLUMN_WIDTH_PX,
  TABLE_MIN_ROW_HEIGHT_PX,
  TABLE_WIDE_COLUMN_MIN_WIDTH_PX,
} from "src/libs/markdown/tableMetadata"
import {
  TABLE_ADD_BAR_VIEWPORT_PADDING_PX,
  TABLE_CELL_MENU_BUTTON_SIZE_PX,
  TABLE_EDGE_ADD_BUTTON_SIZE_PX,
} from "./tableAffordanceModel"
import { TABLE_OVERFLOW_COACHMARK_ESTIMATED_WIDTH_PX } from "./tableFloatingUiModel"

const TABLE_CORNER_BUTTON_SIZE_PX = 22
const TABLE_COLUMN_GRIP_WIDTH_PX = 40
const TABLE_COLUMN_GRIP_HEIGHT_PX = 22
const TABLE_ROW_GRIP_WIDTH_PX = 22
const TABLE_ROW_GRIP_HEIGHT_PX = 40
const TABLE_COLUMN_GRIP_BUTTON_WIDTH_PX = 26
const TABLE_COLUMN_GRIP_BUTTON_HEIGHT_PX = 16
const TABLE_ROW_GRIP_BUTTON_WIDTH_PX = 16
const TABLE_ROW_GRIP_BUTTON_HEIGHT_PX = 26
const TABLE_CORNER_CLUSTER_GAP_PX = 6

const Shell = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-width: 100%;
  gap: 0.8rem;
`

const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  gap: 0.9rem;
  padding: 0 0 0.7rem;
  overflow-x: clip;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  background: transparent;
`

const ToolbarActions = styled.div`
  display: inline-flex;
  flex: 1 1 100%;
  flex-wrap: wrap;
  align-items: center;
  width: 100%;
  max-width: 100%;
  gap: 0.25rem;
  min-width: 0;
`

const ToolbarGroup = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.14rem;
`

const ToolbarSeparator = styled.span`
  width: 1px;
  height: 1.7rem;
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(148, 163, 184, 0.18)" : "rgba(15, 23, 42, 0.12)"};
`

const ToolbarMoreDisclosure = styled.details`
  position: relative;
  display: inline-flex;
  flex-direction: column;

  summary {
    list-style: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 0.8rem;
    border: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 1.3rem;
    font-weight: 700;
    cursor: pointer;
    transition: background-color 160ms ease, color 160ms ease;
  }

  summary:hover {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(148, 163, 184, 0.08)" : "rgba(15, 23, 42, 0.05)"};
    color: var(--color-gray12);
  }

  summary::-webkit-details-marker {
    display: none;
  }

  .body {
    position: absolute;
    top: calc(100% + 0.55rem);
    right: 0;
    z-index: 30;
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
    min-width: 16rem;
    padding: 0.8rem;
    border-radius: 1rem;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(12, 16, 22, 0.96)" : "rgba(255, 255, 255, 0.98)"};
    box-shadow: ${({ theme }) =>
      theme.scheme === "dark"
        ? "0 18px 40px rgba(3, 7, 18, 0.32)"
        : "0 18px 40px rgba(15, 23, 42, 0.12)"};
  }
`

const ToolbarColorDisclosure = styled.details`
  position: relative;
  display: inline-flex;
  flex-direction: column;

  summary {
    list-style: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2.7rem;
    height: 2.4rem;
    padding: 0 0.45rem;
    border-radius: 0.8rem;
    border: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    cursor: pointer;
    transition: background-color 160ms ease, color 160ms ease;
  }

  summary[data-active="true"] {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(148, 163, 184, 0.14)" : "rgba(15, 23, 42, 0.08)"};
    color: ${({ theme }) => theme.colors.gray12};
    box-shadow: inset 0 -1.5px 0
      ${({ theme }) =>
        theme.scheme === "dark" ? "rgba(226, 232, 240, 0.32)" : "rgba(15, 23, 42, 0.22)"};
  }

  summary:hover {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(148, 163, 184, 0.08)" : "rgba(15, 23, 42, 0.05)"};
    color: var(--color-gray12);
  }

  summary::-webkit-details-marker {
    display: none;
  }

  .body {
    position: absolute;
    top: calc(100% + 0.55rem);
    right: 0;
    z-index: 32;
    display: grid;
    gap: 0.42rem;
    min-width: 10.5rem;
    padding: 0.72rem;
    border-radius: 1rem;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(12, 16, 22, 0.96)" : "rgba(255, 255, 255, 0.98)"};
    box-shadow: ${({ theme }) =>
      theme.scheme === "dark"
        ? "0 18px 40px rgba(3, 7, 18, 0.32)"
        : "0 18px 40px rgba(15, 23, 42, 0.12)"};
  }
`

const ColorTriggerIcon = styled.span`
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  min-width: 1.15rem;

  span {
    font-size: 0.96rem;
    font-weight: 760;
    line-height: 1;
    letter-spacing: -0.02em;
  }

  i {
    display: block;
    width: 1rem;
    height: 0.18rem;
    border-radius: 999px;
    background: ${({ theme }) => theme.colors.gray8};
  }

  &[data-active="true"] i {
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08);
  }
`

const ColorOptionButton = styled.button`
  min-height: 2rem;
  border-radius: 0.8rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(18, 21, 26, 0.42)" : "rgba(255, 255, 255, 0.96)"};
  color: var(--color-gray12);
  padding: 0 0.72rem;
  text-align: left;

  &[data-active="true"] {
    border-color: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(59, 130, 246, 0.32)" : "rgba(37, 99, 235, 0.24)"};
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(37, 99, 235, 0.12)" : "rgba(37, 99, 235, 0.08)"};
  }

  &:disabled {
    opacity: 0.44;
    cursor: not-allowed;
  }
`

const ColorOptionLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.78rem;
  font-weight: 700;
`

const ColorOptionSwatch = styled.span`
  display: inline-flex;
  width: 0.92rem;
  height: 0.92rem;
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
    inset: 0.38rem -0.05rem auto -0.05rem;
    height: 1.5px;
    background: ${({ theme }) => theme.colors.gray10};
    transform: rotate(-34deg);
    transform-origin: center;
  }
`

const ToolbarRibbonButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.5rem;
  height: 2.4rem;
  padding: 0 0.58rem;
  border: 0;
  border-radius: 0.8rem;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 1.02rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
  transition: background-color 160ms ease, color 160ms ease;

  svg {
    width: 1.2rem;
    height: 1.2rem;
  }

  &[data-tone="heading"] {
    min-width: 3.1rem;
    color: ${({ theme }) => theme.colors.gray10};
    font-family: Georgia, "Times New Roman", serif;
    font-size: 1rem;
    font-weight: 700;
  }

  &[data-active="true"] {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(148, 163, 184, 0.14)" : "rgba(15, 23, 42, 0.08)"};
    color: ${({ theme }) => theme.colors.gray12};
    box-shadow: inset 0 -1.5px 0
      ${({ theme }) =>
        theme.scheme === "dark" ? "rgba(226, 232, 240, 0.32)" : "rgba(15, 23, 42, 0.22)"};
  }

  &:hover {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(148, 163, 184, 0.08)" : "rgba(15, 23, 42, 0.05)"};
    color: var(--color-gray12);
  }

  &:disabled {
    opacity: 0.44;
    cursor: not-allowed;
  }
`

const ToolbarButton = styled.button`
  min-height: 2rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(18, 21, 26, 0.42)" : "rgba(255, 255, 255, 0.96)"};
  color: var(--color-gray11);
  font-size: 0.78rem;
  font-weight: 700;
  padding: 0 0.82rem;

  &[data-active="true"] {
    border-color: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(59, 130, 246, 0.32)" : "rgba(37, 99, 235, 0.24)"};
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(37, 99, 235, 0.12)" : "rgba(37, 99, 235, 0.08)"};
    color: ${({ theme }) => (theme.scheme === "dark" ? "#bfdbfe" : theme.colors.blue8)};
  }

  &[data-variant="subtle-danger"] {
    border-color: rgba(248, 113, 113, 0.14);
    color: #fda4af;
  }

  &[data-variant="danger"] {
    border-color: rgba(248, 113, 113, 0.22);
    background: rgba(127, 29, 29, 0.12);
    color: #fecdd3;
  }

  &:disabled {
    opacity: 0.48;
    cursor: not-allowed;
  }
`

const HiddenFileInput = styled.input`
  display: none;
`

const TablePresetSwatches = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
`

const TablePresetSwatch = styled.button`
  --table-swatch-color: #dbeafe;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: var(--table-swatch-color);
  padding: 0;

  &[data-active="true"] {
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.28);
    border-color: rgba(59, 130, 246, 0.42);
  }
`

const TableColorInput = styled.input`
  width: 2.2rem;
  height: 2rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 999px;
  background: transparent;
  padding: 0.22rem;
`

const slashMenuFadeInFromBottom = keyframes`
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.985);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
`

const slashMenuFadeInFromTop = keyframes`
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.985);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
`

const SlashMenu = styled.div`
  position: fixed;
  z-index: 70;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  width: min(38rem, calc(100vw - 1.5rem));
  padding: 0.45rem 0.45rem 0.35rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 1rem;
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(28, 28, 28, 0.98)" : "rgba(255, 255, 255, 0.98)"};
  box-shadow: ${({ theme }) =>
    theme.scheme === "dark" ? "0 18px 36px rgba(0, 0, 0, 0.22)" : "0 18px 36px rgba(15, 23, 42, 0.14)"};
  backdrop-filter: blur(12px);
  transform-origin: top left;
  animation: ${slashMenuFadeInFromBottom} 140ms cubic-bezier(0.2, 0.8, 0.2, 1);
  transition: left 120ms cubic-bezier(0.2, 0.8, 0.2, 1), top 120ms cubic-bezier(0.2, 0.8, 0.2, 1),
    box-shadow 140ms ease, border-color 140ms ease;
  will-change: left, top, transform, opacity;

  &[data-placement="top"] {
    transform-origin: bottom left;
    animation-name: ${slashMenuFadeInFromTop};
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const SlashQuerySummary = styled.div`
  display: inline-flex;
  align-items: center;
  min-height: 2.35rem;
  border-radius: 0.75rem;
  border: 0;
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(255, 255, 255, 0.04)" : "rgba(15, 23, 42, 0.04)"};
  padding: 0 0.75rem;

  span {
    color: var(--color-gray10);
    font-size: 0.92rem;
    font-weight: 600;
  }
`

const SlashMenuBody = styled.div`
  display: grid;
  gap: 0.4rem;
  max-height: min(62vh, 30rem);
  overflow-y: auto;
  padding: 0.1rem 0.1rem 0.15rem 0;

  scrollbar-width: thin;

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(148, 163, 184, 0.28)" : "rgba(100, 116, 139, 0.24)"};
  }
`

const SlashMenuSection = styled.section`
  display: grid;
  gap: 0.15rem;

  & + & {
    margin-top: 0.15rem;
    padding-top: 0.55rem;
    border-top: 1px solid ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(255, 255, 255, 0.04)" : "rgba(15, 23, 42, 0.05)"};
  }
`

const SlashMenuSectionLabel = styled.strong`
  display: inline-flex;
  align-items: center;
  min-height: 1.2rem;
  padding: 0 0.5rem;
  color: var(--color-gray10);
  font-size: 0.74rem;
  font-weight: 800;
`

const SlashActionList = styled.div`
  display: grid;
  gap: 0.3rem;
`

const SlashActionIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.8rem;
  height: 1.8rem;
  border-radius: 0;
  border: 0;
  background: transparent;
  color: var(--color-gray12);
  font-size: 0.92rem;
  font-weight: 700;
  letter-spacing: -0.02em;
`

const SlashActionMain = styled.span`
  display: grid;
  gap: 0.02rem;
  text-align: left;

  strong {
    font-size: 0.88rem;
    color: var(--color-gray12);
    font-weight: 700;
  }

  span {
    color: var(--color-gray10);
    font-size: 0.75rem;
    line-height: 1.35;
  }
`

const SlashActionTitleRow = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  flex-wrap: wrap;
`

const SlashActionHint = styled.span`
  color: var(--color-gray10);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: -0.01em;
`

const SlashActionButton = styled.button`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.55rem;
  min-height: 2.7rem;
  border-radius: 0.75rem;
  border: 0;
  background: transparent;
  padding: 0.45rem 0.55rem;
  text-align: left;
  transition: background-color 120ms ease, color 120ms ease;

  &:hover:not(:disabled),
  &:focus-visible:not(:disabled) {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(255, 255, 255, 0.05)" : "rgba(15, 23, 42, 0.04)"};
  }

  &[data-active="true"] {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(255, 255, 255, 0.07)" : "rgba(15, 23, 42, 0.06)"};
  }

  &[data-active="true"][data-input-mode="keyboard"] {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.07)"};
  }

  &[data-active="true"][data-input-mode="pointer"] {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(255, 255, 255, 0.07)" : "rgba(15, 23, 42, 0.06)"};
  }

  &[data-active="true"] [data-role="slash-action-icon"] {
    color: ${({ theme }) => theme.colors.gray12};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

const SlashEmptyState = styled.div`
  display: grid;
  place-items: center;
  min-height: 6rem;
  border-radius: 0.75rem;
  border: 0;
  color: var(--color-gray10);
  font-size: 0.8rem;
  font-weight: 600;
`

const EditorViewport = styled.div`
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
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(59, 130, 246, 0.12)" : "rgba(59, 130, 246, 0.1)"};
    box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.2);
    border-radius: 10px;
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

const BubbleToolbar = styled.div`
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

const TextBubbleToolbar = styled.div`
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

const TextBubbleIconButton = styled.button`
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

const TextBubbleDivider = styled.span`
  width: 1px;
  height: 1.35rem;
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(148, 163, 184, 0.22)" : "rgba(15, 23, 42, 0.16)"};
`

const TextBubbleDisclosure = styled.details`
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

const TextBubbleTextStyleTrigger = styled.span`
  font-size: 0.9rem;
  font-weight: 760;
  letter-spacing: -0.01em;
`

const TextBubbleColorTrigger = styled.span`
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

const TextBubbleColorSwatch = styled.span`
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

const TextBubbleMenuButton = styled.button`
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

const FloatingBubbleToolbar = styled.div`
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

type TableHandleIconKind = "table" | "row" | "column" | "more" | "plus" | "grip" | "grow"

const TableHandleIcon = ({ kind }: { kind: TableHandleIconKind }) => {
  if (kind === "grip") {
    return (
      <TableHandleIconSvg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="5" cy="4" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="11" cy="4" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="5" cy="8" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="11" cy="8" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="5" cy="12" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="11" cy="12" r="0.9" fill="currentColor" stroke="none" />
      </TableHandleIconSvg>
    )
  }

  if (kind === "more") {
    return (
      <TableHandleIconSvg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="3.5" cy="8" r="1.15" fill="currentColor" stroke="none" />
        <circle cx="8" cy="8" r="1.15" fill="currentColor" stroke="none" />
        <circle cx="12.5" cy="8" r="1.15" fill="currentColor" stroke="none" />
      </TableHandleIconSvg>
    )
  }

  if (kind === "plus") {
    return (
      <TableHandleIconSvg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <line x1="8" y1="3.25" x2="8" y2="12.75" />
        <line x1="3.25" y1="8" x2="12.75" y2="8" />
      </TableHandleIconSvg>
    )
  }

  if (kind === "grow") {
    return (
      <TableHandleIconSvg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <polyline points="9.5 3.5 12.5 3.5 12.5 6.5" />
        <line x1="12.5" y1="3.5" x2="8.25" y2="7.75" />
        <polyline points="6.5 12.5 3.5 12.5 3.5 9.5" />
        <line x1="3.5" y1="12.5" x2="7.75" y2="8.25" />
      </TableHandleIconSvg>
    )
  }

  if (kind === "table") {
    return (
      <TableHandleIconSvg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <rect x="2" y="2" width="5" height="5" rx="0.8" />
        <rect x="9" y="2" width="5" height="5" rx="0.8" />
        <rect x="2" y="9" width="5" height="5" rx="0.8" />
        <rect x="9" y="9" width="5" height="5" rx="0.8" />
      </TableHandleIconSvg>
    )
  }

  if (kind === "column") {
    return (
      <TableHandleIconSvg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <line x1="3" y1="2.5" x2="3" y2="13.5" />
        <line x1="8" y1="2.5" x2="8" y2="13.5" />
        <line x1="13" y1="2.5" x2="13" y2="13.5" />
      </TableHandleIconSvg>
    )
  }

  return (
    <TableHandleIconSvg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <line x1="2.5" y1="3" x2="13.5" y2="3" />
      <line x1="2.5" y1="8" x2="13.5" y2="8" />
      <line x1="2.5" y1="13" x2="13.5" y2="13" />
    </TableHandleIconSvg>
  )
}

const TableHandleIconSvg = styled.svg`
  width: 0.95rem;
  height: 0.95rem;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
`

const TableAxisRail = styled.div`
  position: fixed;
  z-index: 60;
  display: flex;
  align-items: center;
  pointer-events: auto;

  &[data-axis="column"] {
    justify-content: center;
    width: ${TABLE_COLUMN_GRIP_WIDTH_PX}px;
    height: ${TABLE_COLUMN_GRIP_HEIGHT_PX}px;
  }

  &[data-axis="row"] {
    justify-content: center;
    width: ${TABLE_ROW_GRIP_WIDTH_PX}px;
    height: ${TABLE_ROW_GRIP_HEIGHT_PX}px;
  }
`

const TableCornerHandle = styled.div`
  position: fixed;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${TABLE_CORNER_CLUSTER_GAP_PX}px;
  pointer-events: auto;

  &[data-compact="true"] {
    gap: 0;
  }
`

const TableColumnDragGuide = styled.div`
  position: fixed;
  z-index: 57;
  width: 2px;
  margin-left: -1px;
  pointer-events: none;
  border-radius: 999px;
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(96, 165, 250, 0.9)" : "rgba(37, 99, 235, 0.82)"};
  box-shadow: ${({ theme }) =>
    theme.scheme === "dark"
      ? "0 0 0 1px rgba(15, 23, 42, 0.36), 0 0 0 6px rgba(59, 130, 246, 0.16)"
      : "0 0 0 1px rgba(255, 255, 255, 0.72), 0 0 0 6px rgba(59, 130, 246, 0.12)"};
`

const TableColumnResizeBoundaryHandle = styled.button`
  position: fixed;
  z-index: 56;
  width: 18px;
  margin-left: -9px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: col-resize;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;

  &[data-edge="outer"] {
    z-index: 59;
    width: 24px;
    margin-left: -12px;
  }

  &::before {
    content: "";
    position: absolute;
    top: 10px;
    bottom: 10px;
    left: 50%;
    width: 2px;
    transform: translateX(-50%);
    border-radius: 999px;
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(191, 219, 254, 0.22)" : "rgba(37, 99, 235, 0.2)"};
    opacity: 0;
    transition:
      opacity 120ms ease,
      background-color 120ms ease,
      box-shadow 120ms ease;
  }

  &:hover::before,
  &:focus-visible::before {
    opacity: 1;
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(96, 165, 250, 0.62)" : "rgba(37, 99, 235, 0.56)"};
    box-shadow: ${({ theme }) =>
      theme.scheme === "dark"
        ? "0 0 0 1px rgba(15, 23, 42, 0.24)"
        : "0 0 0 1px rgba(255, 255, 255, 0.72)"};
  }
`

const TableAxisSelectionOutline = styled.div`
  position: fixed;
  z-index: 58;
  pointer-events: none;
  border: 2px solid rgba(59, 130, 246, 0.96);
  border-radius: 0.2rem;
  box-shadow: 0 0 0 1px rgba(30, 64, 175, 0.14);
`

const TableCornerPreviewOutline = styled.div`
  position: fixed;
  z-index: 58;
  pointer-events: none;
  border: 2px dashed rgba(59, 130, 246, 0.84);
  border-radius: 0.3rem;
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(37, 99, 235, 0.08)" : "rgba(219, 234, 254, 0.42)"};
  box-shadow: ${({ theme }) =>
    theme.scheme === "dark"
      ? "0 0 0 1px rgba(15, 23, 42, 0.28), 0 0 0 6px rgba(59, 130, 246, 0.12)"
      : "0 0 0 1px rgba(255, 255, 255, 0.78), 0 0 0 6px rgba(59, 130, 246, 0.1)"};
`

const TableRowDragShadow = styled.div`
  position: fixed;
  z-index: 60;
  pointer-events: none;
  border-radius: 0.35rem;
  border: 1px solid rgba(59, 130, 246, 0.32);
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(30, 41, 59, 0.82)" : "rgba(255, 255, 255, 0.92)"};
  box-shadow: ${({ theme }) =>
    theme.scheme === "dark" ? "0 18px 34px rgba(2, 6, 23, 0.42)" : "0 18px 32px rgba(15, 23, 42, 0.14)"};
  opacity: 0.94;
`

const TableAxisReorderIndicator = styled.div`
  position: fixed;
  z-index: 61;
  pointer-events: none;
  background: rgba(59, 130, 246, 0.96);
  border-radius: 999px;
  box-shadow: 0 0 0 1px rgba(191, 219, 254, 0.68);

  &[data-axis="row"] {
    min-height: 3px;
  }

  &[data-axis="column"] {
    min-width: 3px;
  }
`

const TableQuickRailButton = styled.button`
  all: unset;
  position: relative;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 999px;
  border: 1px solid ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(148, 163, 184, 0.2)" : "rgba(148, 163, 184, 0.28)"};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(15, 23, 42, 0.88)" : "rgba(255, 255, 255, 0.97)"};
  color: ${({ theme }) => (theme.scheme === "dark" ? "rgba(203, 213, 225, 0.86)" : "rgba(71, 85, 105, 0.82)")};
  box-shadow: ${({ theme }) =>
    theme.scheme === "dark" ? "0 5px 12px rgba(2, 6, 23, 0.22)" : "0 5px 12px rgba(15, 23, 42, 0.08)"};
  cursor: pointer;
  transition:
    background-color 120ms ease,
    border-color 120ms ease,
    color 120ms ease,
    box-shadow 120ms ease,
    transform 120ms ease;

  &[data-axis="column"] {
    width: ${TABLE_COLUMN_GRIP_BUTTON_WIDTH_PX}px;
    height: ${TABLE_COLUMN_GRIP_BUTTON_HEIGHT_PX}px;
  }

  &[data-axis="row"] {
    width: ${TABLE_ROW_GRIP_BUTTON_WIDTH_PX}px;
    height: ${TABLE_ROW_GRIP_BUTTON_HEIGHT_PX}px;
  }

  &[data-axis] svg {
    width: 0.72rem;
    height: 0.72rem;
  }

  pointer-events: auto;

  &::after {
    content: "";
    position: absolute;
    inset: -0.5rem;
  }

  &:hover,
  &:focus-visible {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(51, 65, 85, 0.64)" : "rgba(241, 245, 249, 0.98)"};
    border-color: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(203, 213, 225, 0.34)" : "rgba(100, 116, 139, 0.34)"};
    color: ${({ theme }) => (theme.scheme === "dark" ? "rgba(248, 250, 252, 0.96)" : "rgba(30, 41, 59, 0.92)")};
    box-shadow: ${({ theme }) =>
      theme.scheme === "dark" ? "0 7px 16px rgba(2, 6, 23, 0.26)" : "0 7px 16px rgba(15, 23, 42, 0.12)"};
    transform: translateY(-1px);
  }

  &[data-active="true"] {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(71, 85, 105, 0.88)" : "rgba(226, 232, 240, 0.96)"};
    border-color: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(226, 232, 240, 0.32)" : "rgba(100, 116, 139, 0.28)"};
    color: ${({ theme }) => (theme.scheme === "dark" ? "#ffffff" : "rgba(15, 23, 42, 0.94)")};
    box-shadow: ${({ theme }) =>
      theme.scheme === "dark" ? "0 7px 16px rgba(2, 6, 23, 0.28)" : "0 7px 16px rgba(15, 23, 42, 0.12)"};
  }

  &[data-compact="true"] {
    min-width: 30px;
    min-height: 30px;
    box-shadow: ${({ theme }) =>
      theme.scheme === "dark" ? "0 8px 18px rgba(2, 6, 23, 0.3)" : "0 8px 18px rgba(15, 23, 42, 0.12)"};
  }
`

const TableHandleButton = styled(TableQuickRailButton)`
  width: ${TABLE_CORNER_BUTTON_SIZE_PX}px;
  height: ${TABLE_CORNER_BUTTON_SIZE_PX}px;
  border: 0;
  border-radius: 0.4rem;
  background: transparent;
  color: ${({ theme }) => (theme.scheme === "dark" ? "rgba(148, 163, 184, 0.78)" : "rgba(100, 116, 139, 0.88)")};
  box-shadow: none;
  backdrop-filter: none;
  pointer-events: auto;

  &:hover,
  &:focus-visible {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(51, 65, 85, 0.42)" : "rgba(226, 232, 240, 0.82)"};
    border-color: transparent;
    color: ${({ theme }) => (theme.scheme === "dark" ? "#ffffff" : "rgba(30, 41, 59, 0.92)")};
    box-shadow: none;
  }

  &[data-compact="true"] {
    width: 30px;
    height: 30px;
    border-radius: 999px;
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(15, 23, 42, 0.88)" : "rgba(255, 255, 255, 0.98)"};
    border: 1px solid ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(148, 163, 184, 0.2)" : "rgba(148, 163, 184, 0.28)"};
    color: ${({ theme }) => (theme.scheme === "dark" ? "rgba(203, 213, 225, 0.9)" : "rgba(71, 85, 105, 0.82)")};
    box-shadow: ${({ theme }) =>
      theme.scheme === "dark" ? "0 8px 18px rgba(2, 6, 23, 0.3)" : "0 8px 18px rgba(15, 23, 42, 0.12)"};
  }
`

const TableCornerGrowButton = styled(TableHandleButton)`
  cursor: nwse-resize;
  touch-action: none;

  &[data-active="true"] {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(37, 99, 235, 0.28)" : "rgba(59, 130, 246, 0.16)"};
    color: ${({ theme }) => (theme.scheme === "dark" ? "#ffffff" : "rgba(30, 64, 175, 0.96)")};
  }
`

const TableCellMenuButton = styled(TableHandleButton)`
  position: fixed;
  z-index: 59;
  width: ${TABLE_CELL_MENU_BUTTON_SIZE_PX}px;
  height: ${TABLE_CELL_MENU_BUTTON_SIZE_PX}px;
  border-radius: 999px;

  &[data-compact="true"] {
    width: 32px;
    height: 32px;
  }
`

const TableTrailingAddBar = styled.button`
  all: unset;
  position: fixed;
  z-index: 59;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${TABLE_EDGE_ADD_BUTTON_SIZE_PX}px;
  height: ${TABLE_EDGE_ADD_BUTTON_SIZE_PX}px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(148, 163, 184, 0.2)" : "rgba(148, 163, 184, 0.28)"};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(15, 23, 42, 0.86)" : "rgba(255, 255, 255, 0.98)"};
  color: ${({ theme }) => (theme.scheme === "dark" ? "rgba(203, 213, 225, 0.86)" : "rgba(71, 85, 105, 0.82)")};
  box-shadow: ${({ theme }) =>
    theme.scheme === "dark" ? "0 8px 18px rgba(2, 6, 23, 0.26)" : "0 8px 18px rgba(15, 23, 42, 0.12)"};
  cursor: pointer;
  transition:
    background-color 120ms ease,
    border-color 120ms ease,
    color 120ms ease,
    box-shadow 120ms ease,
    transform 120ms ease;

  &:hover,
  &:focus-visible {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(51, 65, 85, 0.64)" : "rgba(241, 245, 249, 0.98)"};
    border-color: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(203, 213, 225, 0.34)" : "rgba(100, 116, 139, 0.34)"};
    color: ${({ theme }) => (theme.scheme === "dark" ? "rgba(248, 250, 252, 0.96)" : "rgba(30, 41, 59, 0.92)")};
    box-shadow: ${({ theme }) =>
      theme.scheme === "dark" ? "0 9px 18px rgba(2, 6, 23, 0.3)" : "0 9px 18px rgba(15, 23, 42, 0.12)"};
    transform: translateY(-1px);
  }
`

const FloatingTableMenu = styled.div`
  position: fixed;
  z-index: 65;
  width: min(16.75rem, calc(100vw - 2rem));
  display: flex;
  flex-direction: column;
  gap: 0.48rem;
  padding: 0.62rem;
  border-radius: 0.82rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(15, 18, 24, 0.96)" : "rgba(255, 255, 255, 0.98)"};
  box-shadow: ${({ theme }) =>
    theme.scheme === "dark" ? "0 12px 18px rgba(0, 0, 0, 0.16)" : "0 12px 18px rgba(15, 23, 42, 0.1)"};
`

const TableOverflowCoachmark = styled.div`
  position: fixed;
  z-index: 64;
  width: min(${TABLE_OVERFLOW_COACHMARK_ESTIMATED_WIDTH_PX}px, calc(100vw - 2rem));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 0.8rem;
  border-radius: 0.9rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(15, 18, 24, 0.98)" : "rgba(255, 255, 255, 0.985)"};
  box-shadow: ${({ theme }) =>
    theme.scheme === "dark" ? "0 12px 24px rgba(2, 6, 23, 0.32)" : "0 12px 24px rgba(15, 23, 42, 0.12)"};
`

const TableOverflowCoachmarkBody = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.14rem;
`

const TableOverflowCoachmarkTitle = styled.strong`
  font-size: 0.76rem;
  color: var(--color-gray12);
`

const TableOverflowCoachmarkDescription = styled.span`
  font-size: 0.7rem;
  line-height: 1.35;
  color: var(--color-gray10);
`

const TableOverflowCoachmarkAction = styled.button`
  flex: 0 0 auto;
  min-height: 1.95rem;
  padding: 0 0.78rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(96, 165, 250, 0.28)" : "rgba(59, 130, 246, 0.24)"};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(30, 41, 59, 0.88)" : "rgba(248, 250, 252, 0.98)"};
  color: ${({ theme }) => (theme.scheme === "dark" ? "rgba(241, 245, 249, 0.94)" : "rgba(30, 64, 175, 0.92)")};
  font-size: 0.74rem;
  font-weight: 800;
  transition:
    border-color 120ms ease,
    background-color 120ms ease,
    color 120ms ease;

  &:hover,
  &:focus-visible {
    border-color: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(147, 197, 253, 0.46)" : "rgba(59, 130, 246, 0.42)"};
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(29, 78, 216, 0.32)" : "rgba(219, 234, 254, 0.92)"};
  }
`

const TableMenuHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.08rem;
`

const TableMenuHeaderEyebrow = styled.span`
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => (theme.scheme === "dark" ? "rgba(148, 163, 184, 0.9)" : "rgba(71, 85, 105, 0.86)")};
`

const TableMenuHeaderTitle = styled.strong`
  font-size: 0.82rem;
  color: var(--color-gray12);
`

const TableMenuHeaderDescription = styled.span`
  font-size: 0.7rem;
  line-height: 1.45;
  color: var(--color-gray10);
`

const TableMenuCompactSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.34rem;
`

const TableMenuSectionTitle = styled.span`
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--color-gray10);
`

const TableMenuCompactList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
`

const TableMenuCompactAction = styled.button`
  min-height: 2rem;
  border-radius: 0.72rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(18, 21, 26, 0.72)" : "rgba(255, 255, 255, 0.96)"};
  color: var(--color-gray12);
  font-size: 0.76rem;
  font-weight: 700;
  text-align: left;
  padding: 0 0.72rem;
  transition:
    border-color 120ms ease,
    background-color 120ms ease,
    color 120ms ease;

  &[data-active="true"] {
    border-color: rgba(59, 130, 246, 0.42);
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(37, 99, 235, 0.18)" : "rgba(219, 234, 254, 0.96)"};
    color: ${({ theme }) => (theme.scheme === "dark" ? "#dbeafe" : "#1d4ed8")};
  }

  &[data-variant="danger"] {
    border-color: rgba(248, 113, 113, 0.2);
    background: rgba(127, 29, 29, 0.08);
    color: ${({ theme }) => (theme.scheme === "dark" ? "#fecaca" : "#b91c1c")};
  }
`

const TableMenuSegmentedRow = styled.div`
  display: grid;
  gap: 0.34rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));

  &[data-columns="3"] {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
`

const TableMenuSegmentedButton = styled.button`
  min-height: 2rem;
  border-radius: 0.68rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(18, 21, 26, 0.72)" : "rgba(255, 255, 255, 0.96)"};
  color: var(--color-gray11);
  font-size: 0.74rem;
  font-weight: 700;
  padding: 0 0.58rem;
  transition:
    border-color 120ms ease,
    background-color 120ms ease,
    color 120ms ease;

  &[data-active="true"] {
    border-color: rgba(59, 130, 246, 0.42);
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(37, 99, 235, 0.18)" : "rgba(219, 234, 254, 0.96)"};
    color: ${({ theme }) => (theme.scheme === "dark" ? "#dbeafe" : "#1d4ed8")};
  }
`

const TableMenuHint = styled.div`
  border-radius: 0.7rem;
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(30, 41, 59, 0.46)" : "rgba(248, 250, 252, 0.96)"};
  color: var(--color-gray10);
  font-size: 0.7rem;
  line-height: 1.45;
  padding: 0.52rem 0.64rem;
`

const BlockHandleRail = styled.div`
  position: absolute;
  z-index: 55;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 0.18rem;
  padding: 0.12rem;
  border-radius: 0.72rem;
  border: 1px solid ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(148, 163, 184, 0.2)" : "rgba(71, 85, 105, 0.14)"};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(15, 23, 42, 0.52)" : "rgba(255, 255, 255, 0.84)"};
  backdrop-filter: blur(6px);
  opacity: 0;
  transform: translate3d(-3px, 0, 0);
  pointer-events: none;
  transition:
    opacity 140ms ease,
    transform 140ms ease;

  &[data-visible="true"] {
    opacity: 1;
    transform: translate3d(0, 0, 0);
    pointer-events: auto;
  }
`

const BlockHandleButton = styled.button`
  all: unset;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.44rem;
  height: 1.44rem;
  border-radius: 0.42rem;
  border: 1px solid transparent;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.76rem;
  font-weight: 700;
  box-shadow: none;
  opacity: 0.8;
  cursor: pointer;
  transition:
    background-color 120ms ease,
    color 120ms ease,
    opacity 120ms ease,
    border-color 120ms ease;

  &[data-variant="drag"] {
    cursor: grab;
  }

  &:hover {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.06)"};
    border-color: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(148, 163, 184, 0.26)" : "rgba(71, 85, 105, 0.2)"};
    color: var(--color-gray12);
    opacity: 1;
  }

  &:focus-visible {
    outline: 2px solid rgba(59, 130, 246, 0.5);
    outline-offset: 1px;
  }
`

const BlockHandleGrip = styled.span`
  display: grid;
  grid-template-columns: repeat(2, 0.18rem);
  grid-auto-rows: 0.18rem;
  gap: 0.12rem;

  span {
    width: 0.18rem;
    height: 0.18rem;
    border-radius: 999px;
    background: currentColor;
    opacity: 0.78;
  }
`

const BlockHandlePlus = styled.span`
  position: relative;
  width: 0.82rem;
  height: 0.82rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  span {
    position: absolute;
    display: block;
    border-radius: 999px;
    background: currentColor;
  }

  span:first-of-type {
    width: 0.82rem;
    height: 1.6px;
  }

  span:last-of-type {
    width: 1.6px;
    height: 0.82rem;
  }
`

const DraggedBlockGhost = styled.div`
  position: fixed;
  z-index: 58;
  pointer-events: none;
  transform: translate3d(0, 0, 0);
  filter: drop-shadow(0 20px 30px rgba(15, 23, 42, 0.3));
`

const DraggedBlockGhostBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 1.55rem;
  margin: 0 0 0.32rem 0.18rem;
  padding: 0 0.56rem;
  border-radius: 999px;
  border: 1px solid rgba(59, 130, 246, 0.34);
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(17, 24, 39, 0.92)" : "rgba(248, 250, 252, 0.96)"};
  color: ${({ theme }) => theme.colors.blue4};

  span {
    font-size: 0.72rem;
    font-weight: 700;
  }

  strong {
    font-size: 0.72rem;
    font-weight: 700;
    color: ${({ theme }) => theme.colors.blue3};
  }
`

const DraggedBlockGhostCard = styled.div`
  overflow: hidden;
  border-radius: 1rem;
  border: 1px solid rgba(59, 130, 246, 0.28);
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(15, 23, 42, 0.9)" : "rgba(255, 255, 255, 0.96)"};
  box-shadow:
    0 0 0 1px rgba(59, 130, 246, 0.18),
    0 10px 22px rgba(15, 23, 42, 0.22);
  padding: 0.72rem 0.88rem;
  opacity: 0.92;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.82rem;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
`

const BlockDropIndicator = styled.div`
  position: fixed;
  z-index: 56;
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(37, 99, 235, 0.95), rgba(59, 130, 246, 0.98));
  box-shadow:
    0 0 0 1px rgba(37, 99, 235, 0.2),
    0 4px 10px rgba(37, 99, 235, 0.22);
  pointer-events: none;

  &::before,
  &::after {
    content: "";
    position: absolute;
    top: 50%;
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: rgba(59, 130, 246, 0.98);
    box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.28);
    transform: translateY(-50%);
  }

  &::before {
    left: -3px;
  }

  &::after {
    right: -3px;
  }
`

const BlockSelectionOverlay = styled.div`
  position: absolute;
  z-index: 2;
  pointer-events: none;
  border-radius: 0.95rem;
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(59, 130, 246, 0.12)" : "rgba(59, 130, 246, 0.1)"};
  box-shadow: none;
`

const MobileBlockActionBar = styled.div`
  position: fixed;
  z-index: 55;
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  padding: 0.5rem;
  border-radius: 0.9rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(15, 18, 24, 0.96)" : "rgba(255, 255, 255, 0.98)"};
  box-shadow: ${({ theme }) =>
    theme.scheme === "dark" ? "0 10px 18px rgba(0, 0, 0, 0.14)" : "0 10px 18px rgba(15, 23, 42, 0.1)"};
  transform: translateX(-50%);
`

const FloatingBlockMenu = styled.div`
  position: fixed;
  z-index: 65;
  width: min(30rem, calc(100vw - 2rem));
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.75rem;
  border-radius: 0.9rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(15, 18, 24, 0.96)" : "rgba(255, 255, 255, 0.98)"};
  box-shadow: ${({ theme }) =>
    theme.scheme === "dark" ? "0 14px 22px rgba(0, 0, 0, 0.15)" : "0 14px 22px rgba(15, 23, 42, 0.1)"};
`

const FloatingBlockMenuHeader = styled.strong`
  font-size: 0.88rem;
  color: var(--color-gray12);
`

const FloatingBlockMenuDivider = styled.div`
  height: 1px;
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(255, 255, 255, 0.06)" : "rgba(15, 23, 42, 0.08)"};
`

const FloatingBlockMenuGrid = styled.div`
  display: grid;
  gap: 0.45rem;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
`

const FloatingBlockMenuButton = styled.button`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
  min-height: 3rem;
  border-radius: 0.85rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(18, 21, 26, 0.72)" : "rgba(255, 255, 255, 0.96)"};
  color: var(--color-gray12);
  padding: 0.68rem 0.8rem;
  text-align: left;

  strong {
    font-size: 0.82rem;
  }

  span {
    color: var(--color-gray10);
    font-size: 0.72rem;
  }
`

const FloatingBlockActionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
`

const FloatingBlockActionButton = styled.button`
  min-height: 2.25rem;
  border-radius: 0.8rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(18, 21, 26, 0.72)" : "rgba(255, 255, 255, 0.96)"};
  color: var(--color-gray12);
  font-size: 0.8rem;
  font-weight: 700;
  text-align: left;
  padding: 0 0.8rem;

  &[data-active="true"] {
    border-color: rgba(59, 130, 246, 0.48);
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(37, 99, 235, 0.18)" : "rgba(219, 234, 254, 0.96)"};
    color: ${({ theme }) => (theme.scheme === "dark" ? "#dbeafe" : "#1d4ed8")};
  }

  &[data-variant="danger"] {
    border-color: rgba(248, 113, 113, 0.16);
    color: #fecaca;
    background: rgba(127, 29, 29, 0.1);
  }
`

const AuxDisclosure = styled.details`
  border: 0;
  border-top: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;

  > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    cursor: pointer;
    list-style: none;
    padding: 0.8rem 0;

    &::-webkit-details-marker {
      display: none;
    }
  }

  strong {
    font-size: 0.82rem;
    color: var(--color-gray11);
  }

  span {
    font-size: 0.76rem;
    color: var(--color-gray10);
  }

  .body {
    padding: 0 0 0.75rem;
  }
`

const QuickInsertBar = styled.div`
  display: grid;
  gap: 0.7rem;
  padding: 0.1rem 0 0.2rem;
`

const QuickInsertActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  min-width: 0;
  max-width: 100%;
  gap: 0.55rem;
`

const QuickInsertButton = styled.button`
  min-height: 2.4rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(148, 163, 184, 0.22)" : "rgba(71, 85, 105, 0.14)"};
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(17, 24, 39, 0.78)" : "rgba(255, 255, 255, 0.94)"};
  color: var(--color-gray12);
  font-size: 0.82rem;
  font-weight: 700;
  white-space: nowrap;
  padding: 0 0.95rem;
  transition:
    transform 120ms ease,
    border-color 120ms ease,
    background 120ms ease;

  &:hover:not(:disabled),
  &:focus-visible:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.blue7};
    transform: translateY(-1px);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`


export {
  Shell,
  Toolbar,
  ToolbarActions,
  ToolbarGroup,
  ToolbarSeparator,
  ToolbarMoreDisclosure,
  ToolbarColorDisclosure,
  ColorTriggerIcon,
  ColorOptionButton,
  ColorOptionLabel,
  ColorOptionSwatch,
  ToolbarRibbonButton,
  ToolbarButton,
  HiddenFileInput,
  TablePresetSwatches,
  TablePresetSwatch,
  TableColorInput,
  SlashMenu,
  SlashQuerySummary,
  SlashMenuBody,
  SlashMenuSection,
  SlashMenuSectionLabel,
  SlashActionList,
  SlashActionIcon,
  SlashActionMain,
  SlashActionTitleRow,
  SlashActionHint,
  SlashActionButton,
  SlashEmptyState,
  EditorViewport,
  BubbleToolbar,
  TextBubbleToolbar,
  TextBubbleIconButton,
  TextBubbleDivider,
  TextBubbleDisclosure,
  TextBubbleTextStyleTrigger,
  TextBubbleColorTrigger,
  TextBubbleColorSwatch,
  TextBubbleMenuButton,
  FloatingBubbleToolbar,
  TableHandleIcon,
  TableAxisRail,
  TableCornerHandle,
  TableColumnDragGuide,
  TableColumnResizeBoundaryHandle,
  TableAxisSelectionOutline,
  TableCornerPreviewOutline,
  TableRowDragShadow,
  TableAxisReorderIndicator,
  TableQuickRailButton,
  TableHandleButton,
  TableCornerGrowButton,
  TableCellMenuButton,
  TableTrailingAddBar,
  FloatingTableMenu,
  TableOverflowCoachmark,
  TableOverflowCoachmarkBody,
  TableOverflowCoachmarkTitle,
  TableOverflowCoachmarkDescription,
  TableOverflowCoachmarkAction,
  TableMenuHeader,
  TableMenuHeaderEyebrow,
  TableMenuHeaderTitle,
  TableMenuHeaderDescription,
  TableMenuCompactSection,
  TableMenuSectionTitle,
  TableMenuCompactList,
  TableMenuCompactAction,
  TableMenuSegmentedRow,
  TableMenuSegmentedButton,
  TableMenuHint,
  BlockHandleRail,
  BlockHandleButton,
  BlockHandleGrip,
  BlockHandlePlus,
  DraggedBlockGhost,
  DraggedBlockGhostBadge,
  DraggedBlockGhostCard,
  BlockDropIndicator,
  BlockSelectionOverlay,
  MobileBlockActionBar,
  FloatingBlockMenu,
  FloatingBlockMenuHeader,
  FloatingBlockMenuDivider,
  FloatingBlockMenuGrid,
  FloatingBlockMenuButton,
  FloatingBlockActionList,
  FloatingBlockActionButton,
  AuxDisclosure,
  QuickInsertBar,
  QuickInsertActions,
  QuickInsertButton,
}
