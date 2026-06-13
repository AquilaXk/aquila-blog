import styled from "@emotion/styled"
import {
  adminGold,
  adminGoldTintLine,
  adminWarningBadgeBorder,
  adminWarningBadgeSurface,
} from "src/routes/Admin/adminColorTokens"

export const LinkManagerHeader = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.8rem;
  align-items: center;

  > div {
    display: grid;
    gap: 0.16rem;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
  }

  @media (max-width: 760px) {
    flex-direction: column;
    align-items: flex-start;
  }
`

export const LinkCardList = styled.div`
  display: grid;
  gap: 0.72rem;
`

export const LinkRowCard = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: minmax(184px, 200px) minmax(0, 1fr) auto;
  gap: 0.72rem;
  padding: 0.9rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  background: ${({ theme }) => theme.colors.gray2};
  transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease;

  &[data-dragging="true"] {
    opacity: 0.78;
    transform: scale(0.995);
    border-color: ${({ theme }) => theme.colors.accentBorder};
  }

  &[data-drop-target="true"] {
    border-color: ${adminWarningBadgeBorder()};
    background: ${adminWarningBadgeSurface()};
  }

  &[data-drop-target="true"]::before {
    content: "";
    position: absolute;
    left: 0.72rem;
    right: 0.72rem;
    height: 3px;
    border-radius: 999px;
    background: ${adminGold};
    box-shadow: 0 0 0 1px ${adminGoldTintLine};
  }

  &[data-drop-target="true"][data-drop-position="before"]::before {
    top: -2px;
  }

  &[data-drop-target="true"][data-drop-position="after"]::before {
    bottom: -2px;
  }

  .linkActions {
    align-self: flex-start;
    justify-content: flex-end;
    gap: 0.38rem;
    min-width: 0;
  }

  .linkActionButtons {
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .linkActionButtons > * {
    white-space: nowrap;
  }

  @media (max-width: 1440px) {
    grid-template-columns: minmax(184px, 220px) minmax(0, 1fr);

    .linkActions {
      grid-column: 1 / -1;
      justify-content: flex-start;
    }

    .linkActionButtons {
      justify-content: flex-start;
    }
  }

  @media (max-width: 1080px) {
    grid-template-columns: 1fr;

    .linkActions {
      justify-content: flex-start;
    }
  }
`

export const DragHandleButton = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.34rem;
  min-height: 32px;
  padding: 0 0.72rem;
  border-radius: 999px;
  border: 1px dashed ${({ theme }) => theme.colors.gray6};
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.78rem;
  font-weight: 700;
  cursor: grab;
  user-select: none;

  @media (max-width: 900px) {
    display: none;
  }
`

export const IconPickerField = styled.div`
  position: relative;
  display: grid;
  gap: 0.46rem;
`

export const IconPickerButton = styled.button`
  min-height: 42px;
  padding: 0.7rem 0.82rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.62rem;
  align-items: center;
  color: ${({ theme }) => theme.colors.gray12};
`

export const IconPreview = styled.span<{ "data-compact"?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${({ ["data-compact"]: compact }) => (compact ? "2rem" : "2.4rem")};
  height: ${({ ["data-compact"]: compact }) => (compact ? "2rem" : "2.4rem")};
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 1rem;
`

export const IconPickerCopy = styled.span`
  display: grid;
  gap: 0.08rem;
  text-align: left;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.86rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.72rem;
  }
`

export const IconPickerPanel = styled.div`
  position: absolute;
  top: calc(100% + 0.36rem);
  left: 0;
  z-index: 10;
  width: min(100%, 280px);
  max-height: 280px;
  overflow: auto;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.34);
  padding: 0.4rem;
  display: grid;
  gap: 0.32rem;
`

export const IconOptionButton = styled.button`
  width: 100%;
  padding: 0.56rem;
  border-radius: 12px;
  border: 1px solid transparent;
  background: transparent;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.58rem;
  align-items: center;

  &[data-selected="true"] {
    border-color: ${adminWarningBadgeBorder()};
    background: ${adminWarningBadgeSurface()};
  }
`

export const IconOptionText = styled.span`
  display: grid;
  gap: 0.1rem;
  text-align: left;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.84rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.72rem;
  }
`

export const LinkInputs = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.72rem;
  min-width: 0;

  @media (max-width: 1440px) {
    grid-template-columns: 1fr;
  }

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`
