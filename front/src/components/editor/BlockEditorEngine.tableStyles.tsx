import styled from "@emotion/styled"
import {
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

type TableHandleIconKind = "table" | "row" | "column" | "more" | "plus" | "grip" | "grow"

export const TableHandleIcon = ({ kind }: { kind: TableHandleIconKind }) => {
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

export const TableHandleIconSvg = styled.svg`
  width: 0.95rem;
  height: 0.95rem;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
`

export const TableAxisRail = styled.div`
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

export const TableCornerHandle = styled.div`
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

export const TableColumnDragGuide = styled.div`
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

export const TableColumnResizeBoundaryHandle = styled.button`
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

export const TableAxisSelectionOutline = styled.div`
  position: fixed;
  z-index: 58;
  pointer-events: none;
  border: 2px solid rgba(59, 130, 246, 0.96);
  border-radius: 0.2rem;
  box-shadow: 0 0 0 1px rgba(30, 64, 175, 0.14);
`

export const TableCornerPreviewOutline = styled.div`
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

export const TableRowDragShadow = styled.div`
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

export const TableAxisReorderIndicator = styled.div`
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

export const TableQuickRailButton = styled.button`
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

  &[data-axis="row"]::after {
    inset: -0.5rem 0 -0.5rem -0.5rem;
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

export const TableHandleButton = styled(TableQuickRailButton)`
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

export const TableCornerGrowButton = styled(TableHandleButton)`
  cursor: nwse-resize;
  touch-action: none;

  &[data-active="true"] {
    background: ${({ theme }) =>
      theme.scheme === "dark" ? "rgba(37, 99, 235, 0.28)" : "rgba(59, 130, 246, 0.16)"};
    color: ${({ theme }) => (theme.scheme === "dark" ? "#ffffff" : "rgba(30, 64, 175, 0.96)")};
  }
`

export const TableCellMenuButton = styled(TableHandleButton)`
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

export const TableTrailingAddBar = styled.button`
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

export const FloatingTableMenu = styled.div`
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

  &[data-table-menu-kind="row"] {
    transform: translate(calc(-100% - 0.55rem), -0.55rem);
  }

`

export const TableOverflowCoachmark = styled.div`
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

export const TableOverflowCoachmarkBody = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.14rem;
`

export const TableOverflowCoachmarkTitle = styled.strong`
  font-size: 0.76rem;
  color: var(--color-gray12);
`

export const TableOverflowCoachmarkDescription = styled.span`
  font-size: 0.7rem;
  line-height: 1.35;
  color: var(--color-gray10);
`

export const TableOverflowCoachmarkAction = styled.button`
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

export const TableMenuHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.08rem;
`

export const TableMenuHeaderEyebrow = styled.span`
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => (theme.scheme === "dark" ? "rgba(148, 163, 184, 0.9)" : "rgba(71, 85, 105, 0.86)")};
`

export const TableMenuHeaderTitle = styled.strong`
  font-size: 0.82rem;
  color: var(--color-gray12);
`

export const TableMenuHeaderDescription = styled.span`
  font-size: 0.7rem;
  line-height: 1.45;
  color: var(--color-gray10);
`

export const TableMenuCompactSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.34rem;
`

export const TableMenuSectionTitle = styled.span`
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--color-gray10);
`

export const TableMenuCompactList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
`

export const TableMenuCompactAction = styled.button`
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

export const TableMenuSegmentedRow = styled.div`
  display: grid;
  gap: 0.34rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));

  &[data-columns="3"] {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
`

export const TableMenuSegmentedButton = styled.button`
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

export const TableMenuHint = styled.div`
  border-radius: 0.7rem;
  background: ${({ theme }) =>
    theme.scheme === "dark" ? "rgba(30, 41, 59, 0.46)" : "rgba(248, 250, 252, 0.96)"};
  color: var(--color-gray10);
  font-size: 0.7rem;
  line-height: 1.45;
  padding: 0.52rem 0.64rem;
`
