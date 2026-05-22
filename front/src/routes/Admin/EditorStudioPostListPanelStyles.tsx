import styled from "@emotion/styled"

export const EditorStudioPostListPanelShell = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.gray1};
  padding: 0.82rem;
  margin: 0;
  min-width: 0;
  display: grid;
  gap: 0.62rem;

  @media (max-width: 720px) {
    &[data-mobile-visible="false"] {
      display: none;
    }
  }
`

export const ListHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.64rem;
  margin-bottom: 0.75rem;

  h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 720;
    color: ${({ theme }) => theme.colors.gray12};
  }

  span {
    font-size: 0.8rem;
    color: ${({ theme }) => theme.colors.gray11};
  }

  @media (max-width: 920px) {
    flex-direction: column;
  }
`

export const ListHeaderActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: flex-end;
  align-items: center;

  span {
    display: inline-flex;
    align-items: center;
    min-height: 34px;
    padding: 0 0.72rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.8rem;
    font-weight: 700;
    white-space: nowrap;
  }

  @media (max-width: 920px) {
    justify-content: flex-start;
  }

  @media (max-width: 720px) {
    width: 100%;

    span {
      width: 100%;
      margin-right: 0;
    }

    > button {
      width: 100%;
      justify-content: center;
    }
  }
`

export const ReadOnlyHint = styled.span`
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray11};
  min-height: 28px;
  padding: 0 0.58rem;
  font-size: 0.72rem;
  font-weight: 600;
`

export const ListEmpty = styled.div`
  margin: 0;
  min-height: 13.5rem;
  display: grid;
  place-items: center;
  text-align: center;
  padding: 0.8rem 1rem;
  border-radius: 10px;
  border: 1px dashed ${({ theme }) => theme.colors.gray6};
  color: ${({ theme }) => theme.colors.gray11};
  gap: 0.72rem;

  p {
    margin: 0;
    font-size: 0.86rem;
    line-height: 1.65;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
  }
`

export const SelectionStickyBar = styled.div`
  position: sticky;
  top: 0;
  z-index: 2;
  margin: 0 0 0.68rem;
  padding: 0.55rem 0.62rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.gray2};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.8rem;
  }

  > div {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  @media (max-width: 900px) {
    top: calc(var(--app-header-height, 56px) + 0.35rem);
  }
`

export const ListTableWrap = styled.div`
  width: 100%;
  overflow-x: auto;
  overflow-y: auto;
  max-height: 52vh;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 10px;
  overscroll-behavior: contain;

  @media (max-width: 1100px) {
    display: none;
  }
`

export const ListTable = styled.table`
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
  table-layout: fixed;

  th,
  td {
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
    padding: 0.5rem 0.45rem;
    text-align: left;
    font-size: 0.8rem;
    color: ${({ theme }) => theme.colors.gray12};
    vertical-align: middle;
  }

  th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: ${({ theme }) => theme.colors.gray2};
    font-size: 0.75rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-weight: 700;
  }

  tbody tr:last-of-type td {
    border-bottom: 0;
  }

  tbody tr {
    transition: background-color 0.18s ease, box-shadow 0.18s ease;
  }

  tbody tr:hover td {
    background: rgba(255, 255, 255, 0.02);
  }

  tbody tr[data-active="true"] td {
    background:
      linear-gradient(90deg, rgba(59, 130, 246, 0.14) 0, rgba(59, 130, 246, 0.04) 28px, rgba(255, 255, 255, 0.02) 28px);
  }

  .checkboxCell {
    width: 2rem;
    text-align: center;
    padding-left: 0.2rem;
    padding-right: 0.2rem;
  }

  th.idCell,
  td.idCell {
    width: 4.75rem;
    white-space: nowrap;
  }

  input[type="checkbox"] {
    width: 0.92rem;
    height: 0.92rem;
    cursor: pointer;
    accent-color: ${({ theme }) => theme.colors.blue9};
  }

  td.title {
    min-width: 0;
  }

  th.dateCell,
  td.dateCell {
    width: 112px;
    white-space: nowrap;
  }

  th.actionsCell,
  td.actionsCell {
    width: 132px;
    min-width: 132px;
  }

  @media (max-width: 1520px) {
    th.actionsCell,
    td.actionsCell {
      width: 124px;
      min-width: 124px;
    }
  }
`

export const TitleCell = styled.div`
  display: grid;
  gap: 0.36rem;
  max-width: 100%;
  min-width: 0;

  .titleMain {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    flex-wrap: wrap;
  }

  .text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: ${({ theme }) => theme.colors.gray12};
    font-weight: 700;
  }

  .meta {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.72rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .inlineVisibility {
    display: inline-flex;
  }
`

export const DeletedBadge = styled.span`
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.12rem 0.42rem;
  flex: 0 0 auto;
`

export const LoadedBadge = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.blue7};
  background: ${({ theme }) => theme.colors.blue3};
  color: ${({ theme }) => theme.colors.blue11};
  padding: 0 0.5rem;
  font-size: 0.7rem;
  font-weight: 800;
  line-height: 1;
  flex: 0 0 auto;
`

export const SortHeaderButton = styled.button`
  border: 0;
  background: transparent;
  padding: 0;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.74rem;
  font-weight: 700;
  cursor: pointer;
`

export const VisibilityBadge = styled.span`
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.16rem 0.46rem;
  font-size: 0.72rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  color: ${({ theme }) => theme.colors.gray11};
  background: ${({ theme }) => theme.colors.gray2};

  &[data-tone="PRIVATE"] {
    color: ${({ theme }) => theme.colors.gray11};
  }

  &[data-tone="PUBLIC_UNLISTED"] {
    color: ${({ theme }) => theme.colors.blue11};
    border-color: ${({ theme }) => theme.colors.blue7};
    background: ${({ theme }) => theme.colors.blue3};
  }

  &[data-tone="PUBLIC_LISTED"] {
    color: ${({ theme }) => theme.colors.green11};
    border-color: ${({ theme }) => theme.colors.green7};
    background: ${({ theme }) => theme.colors.green3};
  }
`

export const InlineActions = styled.div`
  display: grid;
  gap: 0.42rem;
  align-items: stretch;
`

export const MobileListCards = styled.div`
  display: none;
  margin-top: 0.65rem;

  @media (max-width: 1100px) {
    display: grid;
    gap: 0.6rem;
  }

  article {
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    border-radius: 10px;
    padding: 0.62rem;
    background: ${({ theme }) => theme.colors.gray2};
    display: grid;
    gap: 0.5rem;
    content-visibility: auto;
    contain-intrinsic-size: 1px 172px;
    transition: background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
  }

  article[data-active="true"] {
    border-color: ${({ theme }) => theme.colors.blue7};
    background: ${({ theme }) => theme.colors.blue3};
    box-shadow: none;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.45rem;
  }

  .metaLeading {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }

  .metaLeading input[type="checkbox"] {
    width: 1rem;
    height: 1rem;
    accent-color: ${({ theme }) => theme.colors.gray10};
  }

  h4 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.9rem;
    line-height: 1.45;
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  p {
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
  }

  .metaLine {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.42rem;

    .dot {
      margin: 0 0.26rem;
      opacity: 0.65;
    }
  }

  .mainAction {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.42rem;
  }

  .mainAction > button {
    width: 100%;
    justify-content: center;
  }

  .rowId {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
  }

  @media (max-width: 420px) {
    gap: 0.52rem;

    article {
      padding: 0.56rem;
    }

    p {
      align-items: flex-start;
      flex-wrap: wrap;
      justify-content: flex-start;
    }

    .mainAction {
      grid-template-columns: 1fr;
    }
  }
`

export const EditorStudioPostListInlineStatus = styled.div`
  margin-bottom: 0.85rem;
  padding: 0.62rem 0.72rem;
  border-radius: 8px;
  font-size: 0.82rem;
  line-height: 1.5;
  width: 100%;
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;

  &[data-tone="idle"] {
    color: ${({ theme }) => theme.colors.gray11};
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
  }

  &[data-tone="loading"] {
    color: ${({ theme }) => theme.colors.blue11};
    border: 1px solid ${({ theme }) => theme.colors.blue7};
    background: ${({ theme }) => theme.colors.blue3};
  }

  &[data-tone="success"] {
    color: ${({ theme }) => theme.colors.green11};
    border: 1px solid ${({ theme }) => theme.colors.green7};
    background: ${({ theme }) => theme.colors.green3};
  }

  &[data-tone="error"] {
    color: ${({ theme }) => theme.colors.red11};
    border: 1px solid ${({ theme }) => theme.colors.red7};
    background: ${({ theme }) => theme.colors.red3};
  }
`
