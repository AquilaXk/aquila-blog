import styled from "@emotion/styled"
import {
  AdminInlineActionRow,
  AdminStatusPill,
  AdminSubtleCard,
  AdminTextActionButton,
} from "./AdminSurfacePrimitives"

export const ActionRow = styled(AdminInlineActionRow)``

export const PrimaryInlineButton = styled(AdminTextActionButton)`
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.92rem;
  font-weight: 800;
`

export const GhostButton = styled(AdminTextActionButton)`
  font-size: 0.88rem;
  font-weight: 700;
`

export const VisibilityBadge = styled(AdminStatusPill)<{ "data-tone": string }>`
  min-height: 28px;
  max-width: 100%;
  padding: 0 0.82rem;
  font-size: 0.78rem;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: ${({ theme, "data-tone": tone }) =>
    tone === "PRIVATE"
      ? theme.colors.gray11
      : tone === "PUBLIC_UNLISTED"
        ? theme.colors.orange9
        : theme.colors.green9};
  background: ${({ theme, "data-tone": tone }) =>
    tone === "PRIVATE"
      ? theme.colors.gray2
      : tone === "PUBLIC_UNLISTED"
        ? "rgba(249, 115, 22, 0.12)"
        : "rgba(34, 197, 94, 0.12)"};
  border-color: ${({ theme, "data-tone": tone }) =>
    tone === "PRIVATE"
      ? theme.colors.gray7
      : tone === "PUBLIC_UNLISTED"
        ? theme.colors.orange8
        : theme.colors.green8};
`

export const ListSkeleton = styled.div`
  .desktopRows {
    display: grid;
  }

  .headerRow,
  .row {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr) 144px 220px;
  }

  .headerRow {
    min-height: 49px;
    align-items: center;
    padding: 0 1rem;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray5};
  }

  .headerRow > span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
    font-weight: 700;
  }

  .row {
    padding: 0 1rem;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray5};
  }

  .row:last-of-type {
    border-bottom: none;
  }

  .cell {
    display: grid;
    align-content: center;
    gap: 0.34rem;
    min-height: 78px;
    padding: 0.95rem 0;
  }

  .actionCell {
    grid-auto-flow: column;
    align-items: center;
    justify-content: start;
    gap: 0.65rem;
  }

  .line {
    display: block;
    height: 12px;
    border-radius: 999px;
    background: ${({ theme }) =>
      theme.scheme === "light"
        ? "linear-gradient(90deg, rgba(148, 163, 184, 0.16), rgba(148, 163, 184, 0.28), rgba(148, 163, 184, 0.16))"
        : "linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.12), rgba(255,255,255,0.06))"};
  }

  .line.short {
    width: 4.5rem;
  }

  .line.medium {
    width: 8.5rem;
  }

  .line.wide {
    width: min(100%, 22rem);
  }

  .line.muted {
    opacity: 0.65;
  }

  .mobileCards {
    display: none;
  }

  @media (max-width: 900px) {
    .desktopRows {
      display: none;
    }

    .mobileCards {
      display: grid;
      gap: 0.75rem;
      padding: 0.95rem;
    }

    .mobileCards article {
      display: grid;
      gap: 0.55rem;
      padding: 0.95rem;
      border-radius: 14px;
      border: 1px solid ${({ theme }) => theme.colors.gray5};
      background: ${({ theme }) => theme.colors.gray1};
    }

    .mobileCards .metaRow,
    .mobileCards .actionRow {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.55rem;
    }
  }
`

export const ListEmptyState = styled.div`
  display: grid;
  gap: 0.45rem;
  padding: 1rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};

  strong {
    font-size: 1rem;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.55;
  }
`

export const ListCard = styled(AdminSubtleCard)`
  border-radius: 16px;
  overflow: hidden;
`

export const PostsDesktopTable = styled.table`
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    padding: 0.95rem 1rem;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray5};
    vertical-align: top;
  }

  th {
    text-align: left;
    font-size: 0.8rem;
    color: ${({ theme }) => theme.colors.gray10};
  }

  .idCell {
    width: 88px;
    white-space: nowrap;
    vertical-align: middle;
  }

  .dateCell {
    width: 144px;
    white-space: nowrap;
    vertical-align: middle;
  }

  .actionCell {
    width: 220px;
    vertical-align: middle;
  }

  tbody tr:last-of-type td {
    border-bottom: none;
  }

  @media (max-width: 900px) {
    display: none;
  }
`

export const TitleCell = styled.div`
  display: grid;
  gap: 0.38rem;

  .metaRow {
    display: flex;
    gap: 0.55rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .author {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
  }
`

export const TitleAnchor = styled.a`
  display: -webkit-box;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.96rem;
  font-weight: 800;
  line-height: 1.45;
  text-decoration: none;
  overflow: hidden;
  word-break: keep-all;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;

  &:hover {
    color: ${({ theme }) => theme.colors.gray12};
    text-decoration: underline;
    text-underline-offset: 0.16em;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.gray8};
    outline-offset: 3px;
    border-radius: 0.32rem;
  }
`

export const TitleText = styled.strong`
  display: -webkit-box;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.96rem;
  font-weight: 800;
  line-height: 1.45;
  overflow: hidden;
  word-break: keep-all;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
`

export const AuthorIdentity = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
`

export const AuthorAvatarFrame = styled.span`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 1.4rem;
  height: 1.4rem;
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.gray3};
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.66rem;
  font-weight: 800;
  line-height: 1;

  &[data-has-image="true"] {
    background: ${({ theme }) => theme.colors.gray4};
  }

  img {
    width: 100%;
    height: 100%;
  }
`

export const RowActions = styled(AdminInlineActionRow)``

export const RowPrimaryButton = styled(AdminTextActionButton)`
  display: inline-flex;
  min-width: 32px;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  padding: 0 0.18rem;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.86rem;
  font-weight: 800;

  &:disabled {
    opacity: 0.48;
    cursor: wait;
  }
`

export const RowSecondaryButton = styled(AdminTextActionButton)`
  display: inline-flex;
  min-width: 32px;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  padding: 0 0.18rem;
  font-size: 0.84rem;
  font-weight: 700;

  &:disabled {
    opacity: 0.48;
    cursor: wait;
  }
`

export const DangerTextButton = styled(AdminTextActionButton)`
  display: inline-flex;
  min-width: 32px;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  padding: 0 0.18rem;
  color: ${({ theme }) => theme.colors.red11};
  font-size: 0.86rem;
  font-weight: 700;

  &:disabled {
    opacity: 0.48;
    cursor: wait;
  }
`

export const MobileCardList = styled.div`
  display: none;

  @media (max-width: 900px) {
    display: grid;
    gap: 0.75rem;
    padding: 0.95rem;
  }

  article {
    display: grid;
    gap: 0.55rem;
    padding: 0.95rem;
    border-radius: 14px;
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    background: ${({ theme }) => theme.colors.gray1};
  }

  header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .id {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
    font-weight: 700;
  }

  strong {
    font-size: 0.98rem;
    line-height: 1.45;
  }

  .metaRow {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    flex-wrap: wrap;
  }

  .author,
  .date {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
  }

  .actions {
    display: flex;
    gap: 0.55rem;
    flex-wrap: wrap;
  }
`
