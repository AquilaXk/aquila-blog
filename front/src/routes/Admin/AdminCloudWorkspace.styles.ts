import styled from "@emotion/styled"
import {
  adminAppBackground as appBackground,
  adminBorder as border,
  adminBorderStrong as borderStrong,
  adminControlText as controlText,
  adminGold as accentGold,
  adminSurface as surface,
  adminSurfaceAccent as surfaceAccent,
  adminSurfaceMuted as surfaceMuted,
  adminSurfaceRaised as surfaceRaised,
  adminTeal as accentTeal,
  adminTextMuted as textMuted,
  adminTextPrimary as textPrimary,
  adminTextSecondary as textSecondary,
} from "src/routes/Admin/adminColorTokens"
import { zIndexes } from "src/styles/zIndexes"

export const CloudMain = styled.main`
  display: grid;
  min-width: 0;
  color: ${textPrimary};
  background: ${appBackground};
  border: 0;
  border-radius: 0;
  overflow: hidden;
  box-shadow: none;
`

export const CloudWorkspace = styled.section`
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-height: calc(100vh - var(--app-header-height, 73px) - 3.95rem);

  &[data-detail-open="true"][data-detail-mode="inline"] {
    grid-template-columns: minmax(0, 5.7fr) minmax(20rem, 3fr);
  }

  &[data-detail-open="true"][data-detail-mode="drawer"] {
    grid-template-columns: minmax(0, 1fr);
  }

  @media (max-width: 1080px) {
    &[data-detail-open="true"][data-detail-mode] {
      grid-template-columns: minmax(0, 1fr);
    }
  }
`

export const CloudNavigationRail = styled.aside`
  display: grid;
  align-content: start;
  gap: 1.25rem;
  min-width: 0;
  padding: 1.25rem 1rem;
  border-right: 1px solid ${border};
  background: ${surfaceRaised};

  @media (max-width: 840px) {
    border-right: 0;
    border-bottom: 1px solid ${border};
    padding: 0.9rem;
  }
`

export const CloudNavGroup = styled.div`
  display: grid;
  gap: 0.18rem;
  min-width: 0;
`

export const CloudNavDivider = styled.hr`
  width: 100%;
  border: 0;
  border-top: 1px solid ${border};
  margin: 0.25rem 0;
`

export const CloudNavButton = styled.button`
  width: 100%;
  min-height: 2.3rem;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  border: 0;
  border-radius: 0;
  padding: 0.35rem 0.45rem;
  background: transparent;
  color: ${textPrimary};
  font-size: 0.9rem;
  font-weight: 760;
  text-align: left;
  cursor: pointer;

  span:first-of-type {
    width: 1.35rem;
    display: inline-grid;
    place-items: center;
    color: ${textMuted};
    font-size: 0.86rem;
  }

  small {
    color: ${accentGold};
    font-size: 0.76rem;
    font-weight: 850;
  }

  &[data-active="true"] {
    color: ${accentGold};
    background: ${surfaceAccent};
  }

  &:hover {
    background: ${surfaceMuted};
  }
`

export const StorageMeter = styled.div`
  display: grid;
  gap: 0.5rem;
  margin-top: auto;
  min-width: 0;
  padding-top: 0.75rem;

  strong {
    color: ${accentGold};
    font-size: 0.86rem;
    font-weight: 850;
  }

  p {
    margin: 0;
    color: ${textSecondary};
    font-size: 0.78rem;
    font-weight: 700;
  }

  span {
    display: block;
    height: 0.28rem;
    border-radius: 999px;
    background: linear-gradient(90deg, ${accentGold} 0 22%, ${surfaceMuted} 22% 100%);
  }
`

export const CloudContent = styled.div`
  display: grid;
  align-content: start;
  min-width: 0;
  background: ${surface};
`

export const CloudTitleBar = styled.header`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(18rem, 28rem);
  gap: 1rem;
  align-items: center;
  padding: 1rem 1.25rem 0.72rem;
  border-bottom: 1px solid ${border};

  h1 {
    margin: 0;
    color: ${textPrimary};
    font-size: 1.08rem;
    line-height: 1.2;
    font-weight: 850;
    letter-spacing: 0;
  }

  p {
    margin: 0.22rem 0 0;
    color: ${textMuted};
    font-size: 0.82rem;
    line-height: 1.45;
  }

  @media (max-width: 980px) {
    grid-template-columns: minmax(0, 1fr);
  }
`

export const CloudSearchField = styled.label`
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;

  svg {
    position: absolute;
    left: 0.86rem;
    color: ${textMuted};
    pointer-events: none;
  }
`

export const SearchInput = styled.input`
  width: 100%;
  min-height: 2.42rem;
  border: 0;
  border-radius: 2px;
  padding: 0 3.25rem 0 2.45rem;
  background: ${surfaceRaised};
  color: ${textPrimary};
  font-size: 0.86rem;
  font-weight: 700;

  &::placeholder {
    color: ${textMuted};
  }

  &:focus {
    outline: none;
    box-shadow: 0 0 0 3px var(--admin-focus-ring, rgba(185, 149, 79, 0.18));
  }
`

export const SearchDetail = styled.span`
  position: absolute;
  right: 0.85rem;
  color: ${textMuted};
  font-size: 0.75rem;
  font-weight: 750;
`

export const ActionBar = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  min-width: 0;
  padding: 0.65rem 1.25rem;
  border-bottom: 1px solid ${border};

  @media (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr);
  }
`

export const ActionGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  flex-wrap: wrap;

  &[data-align="end"] {
    justify-content: flex-end;
  }

  @media (max-width: 760px) {
    &[data-align="end"] {
      justify-content: flex-start;
    }
  }
`

export const UploadInput = styled.input`
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
`

export const PrimaryButton = styled.button`
  border: 0;
  border-radius: 5px;
  min-height: 2.25rem;
  padding: 0 0.82rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  background: ${accentTeal};
  color: ${controlText};
  font-size: 0.84rem;
  font-weight: 850;
  white-space: nowrap;
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.62;
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--admin-focus-ring, rgba(185, 149, 79, 0.18));
  }
`

export const SecondaryButton = styled.button`
  border: 0;
  border-radius: 5px;
  min-height: 2.25rem;
  padding: 0 0.82rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.38rem;
  background: ${surfaceMuted};
  color: ${textPrimary};
  font-size: 0.83rem;
  font-weight: 820;
  white-space: nowrap;
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    color: ${textMuted};
  }
`

export const IconButton = styled.button`
  width: 2.25rem;
  height: 2.25rem;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border: 1px solid ${border};
  border-radius: 5px;
  background: ${surface};
  color: ${textSecondary};
  cursor: pointer;

  &[data-active="true"] {
    color: ${accentGold};
    border-color: ${borderStrong};
    background: ${surfaceAccent};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.58;
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--admin-focus-ring, rgba(111, 149, 255, 0.22));
  }
`

export const ViewModeButton = styled.button`
  min-height: 2.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  flex-shrink: 0;
  border: 1px solid ${border};
  border-radius: 5px;
  padding: 0 0.64rem;
  background: ${surface};
  color: ${textSecondary};
  font-size: 0.8rem;
  font-weight: 820;
  white-space: nowrap;
  cursor: pointer;

  &[data-active="true"] {
    color: ${accentGold};
    border-color: ${borderStrong};
    background: ${surfaceAccent};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.58;
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--admin-focus-ring, rgba(111, 149, 255, 0.22));
  }
`

export const FilterGroup = styled.div`
  display: flex;
  gap: 0.32rem;
  align-items: center;
  flex-wrap: wrap;
`

export const GhostButton = styled.button`
  border: 1px solid transparent;
  border-radius: 5px;
  min-height: 2.25rem;
  padding: 0 0.7rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  background: ${surfaceMuted};
  color: ${textSecondary};
  font-size: 0.82rem;
  font-weight: 820;
  white-space: nowrap;
  cursor: pointer;

  &[data-active="true"] {
    border-color: ${borderStrong};
    background: ${surfaceAccent};
    color: ${accentGold};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.54;
  }
`

export const Notice = styled.p`
  margin: 0;
  max-width: 10rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${accentGold};
  font-size: 0.82rem;
  font-weight: 780;
`

export const FileTableScroll = styled.div`
  min-width: 0;
  overflow-x: auto;
`

export const FileTable = styled.table`
  width: 100%;
  min-width: 48rem;
  border-collapse: collapse;
  table-layout: fixed;
  color: ${textPrimary};

  th,
  td {
    border-bottom: 1px solid ${border};
    text-align: left;
    vertical-align: middle;
  }

  th {
    height: 2.4rem;
    padding: 0 0.7rem;
    color: ${textMuted};
    background: ${surfaceRaised};
    font-size: 0.75rem;
    font-weight: 800;
  }

  td {
    height: 4.15rem;
    padding: 0 0.7rem;
    color: ${textSecondary};
    font-size: 0.82rem;
    font-weight: 700;
  }

  tbody tr[data-selected="true"] {
    background: ${surfaceAccent};
  }

  tbody tr {
    transition: background 140ms ease, color 140ms ease;
  }

  tbody tr:hover,
  tbody tr:focus-within {
    background: ${surfaceMuted};
  }

  tbody tr td:first-of-type {
    border-left: 3px solid transparent;
  }

  tbody tr[data-selected="true"] td:first-of-type {
    border-left-color: #58a6ff;
  }

  th:nth-of-type(1),
  th:nth-of-type(2),
  td:nth-of-type(1),
  td:nth-of-type(2) {
    width: 2.65rem;
  }

  th:nth-of-type(3),
  td:nth-of-type(3) {
    width: auto;
  }

  th:nth-of-type(4),
  td:nth-of-type(4) {
    width: 5.8rem;
  }

  th:nth-of-type(5),
  td:nth-of-type(5) {
    width: 8.9rem;
  }
`

export const SelectBoxCell = styled.td`
  width: 2.75rem;
`

export const RowCheckbox = styled.input`
  width: 1rem;
  height: 1rem;
  accent-color: ${accentGold};
`

export const FavoriteButton = styled.button`
  width: 1.75rem;
  height: 1.75rem;
  border: 0;
  background: transparent;
  color: ${textMuted};
  cursor: pointer;
  font-size: 1.15rem;
`

export const FileTypeIcon = styled.span`
  min-width: 2.45rem;
  flex: 0 0 2.65rem;
  height: 1.58rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: ${surfaceRaised};
  color: ${accentGold};
  border: 1px solid ${border};
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &[data-selected="true"] {
    background: ${surfaceMuted};
    border-color: ${borderStrong};
    color: ${textPrimary};
  }
`

export const FileIdentity = styled.div`
  display: grid;
  grid-template-columns: 3rem minmax(0, 1fr);
  gap: 0.72rem;
  align-items: center;
  min-width: 0;
`

export const FileThumbnailFrame = styled.span`
  width: 3rem;
  height: 2.4rem;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid ${border};
  border-radius: 6px;
  background: ${surfaceRaised};
  color: ${accentGold};
  font-size: 0.68rem;
  font-weight: 900;

  &[data-kind="DOCUMENT"] {
    background: var(--admin-surface-accent, #edf3ff);
  }

  &[data-kind="VIDEO"] {
    background: ${surfaceMuted};
  }

  &[data-selected="true"] {
    border-color: ${borderStrong};
    box-shadow: inset 0 0 0 1px ${borderStrong};
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    background: ${surfaceMuted};
  }
`

export const FileNameStack = styled.div`
  display: grid;
  gap: 0.18rem;
  min-width: 0;
`

export const FileMetaLine = styled.span`
  display: flex;
  align-items: center;
  gap: 0.38rem;
  min-width: 0;
  color: ${textMuted};
  font-size: 0.74rem;
  font-weight: 760;

  > span:not([data-file-kind-badge]) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`

export const FileNameButton = styled.button`
  && {
    border-radius: 0;
  }

  border: 0;
  padding: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  background: transparent;
  color: ${textPrimary};
  cursor: pointer;
  font-size: 0.88rem;
  font-weight: 800;
  text-align: left;
  outline: none;

  strong {
    display: grid;
    grid-template-columns: minmax(0, auto) auto;
    justify-content: start;
    min-width: 0;
    max-width: 100%;
  }

  [data-filename-stem] {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  [data-filename-extension] {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  &:focus-visible {
    outline: none;
    color: ${accentGold};
    box-shadow: inset 0 -2px 0 #58a6ff;
  }
`

export const EmptyTableState = styled.div`
  display: grid;
  place-items: center;
  gap: 0.62rem;
  min-height: 20rem;
  padding: 1.25rem;
  color: ${textMuted};
  text-align: center;

  &::before {
    content: "";
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 999px;
    border: 1px solid ${border};
    background: linear-gradient(135deg, ${surfaceRaised}, ${surfaceMuted});
  }

  strong {
    color: ${textPrimary};
    font-size: 1rem;
  }
`

export const LoadingTableStatus = styled.div`
  display: grid;
  place-items: center;
  min-height: 12rem;
  color: ${textMuted};
  font-size: 0.86rem;
  font-weight: 800;
`

export const SkeletonRows = styled.div`
  display: grid;
  gap: 0.6rem;
  width: min(100%, 44rem);
`

export const SkeletonRow = styled.span`
  display: block;
  height: 0.78rem;
  border-radius: 999px;
  background: linear-gradient(90deg, ${surfaceRaised}, ${surfaceMuted}, ${surfaceRaised});
  background-size: 220% 100%;
  animation: admin-cloud-skeleton 1.2s ease-in-out infinite;

  &:nth-of-type(2) {
    width: 78%;
  }

  &:nth-of-type(3) {
    width: 58%;
  }

  @keyframes admin-cloud-skeleton {
    0% {
      background-position: 0% 50%;
    }

    100% {
      background-position: -220% 50%;
    }
  }
`

export const DetailPanel = styled.aside`
  display: grid;
  align-content: start;
  gap: 1rem;
  min-width: 0;
  padding: 1.35rem 1.25rem;
  border-left: 1px solid ${border};
  background: ${surface};

  &[data-mode="inline"] {
    grid-column: 2;
  }

  &[data-mode="drawer"] {
    position: fixed;
    top: var(--app-header-height, 73px);
    right: 0;
    bottom: 0;
    z-index: ${zIndexes.dialog};
    width: min(24rem, calc(100vw - 2rem));
    overflow: auto;
    box-shadow: none;
  }

  @media (max-width: 1080px) {
    position: fixed;
    top: var(--app-header-height, 73px);
    right: 0;
    bottom: 0;
    z-index: ${zIndexes.dialog};
    width: min(24rem, calc(100vw - 2rem));
    overflow: auto;
    box-shadow: none;
  }
`

export const DetailScrim = styled.button`
  display: none;

  &[data-mode="drawer"] {
    position: fixed;
    inset: var(--app-header-height, 73px) 0 0;
    z-index: ${zIndexes.dialog - 1};
    display: block;
    border: 0;
    padding: 0;
    background: rgba(0, 0, 0, 0.32);
  }

  @media (max-width: 1080px) {
    position: fixed;
    inset: var(--app-header-height, 73px) 0 0;
    z-index: ${zIndexes.dialog - 1};
    display: block;
    border: 0;
    padding: 0;
    background: rgba(0, 0, 0, 0.32);
  }
`

export const DetailHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;

  h2 {
    margin: 0;
    color: ${textPrimary};
    font-size: 1.08rem;
    font-weight: 860;
  }
`

export const DetailTabs = styled.div`
  display: flex;
  gap: 0.35rem;
  border-bottom: 1px solid ${border};
`

export const DetailTab = styled.button`
  border: 0;
  border-bottom: 2px solid transparent;
  padding: 0 0.15rem 0.45rem;
  background: transparent;
  color: ${textMuted};
  font-size: 0.84rem;
  font-weight: 850;
  cursor: pointer;

  &[data-active="true"] {
    color: ${accentGold};
    border-bottom-color: ${accentGold};
  }
`

export const DetailPreviewBox = styled.div`
  display: grid;
  align-items: start;
  min-height: 12.5rem;
  background: transparent;
  overflow: auto;
`

export const DetailSummary = styled.div`
  display: grid;
  grid-template-columns: 3.2rem minmax(0, 1fr);
  gap: 0.75rem;
  align-items: center;
  min-width: 0;
  padding: 0.75rem 0;
  border-bottom: 1px solid ${border};

  strong {
    display: block;
    color: ${textPrimary};
    font-size: 0.94rem;
    font-weight: 860;
    overflow-wrap: anywhere;
  }

  p {
    margin: 0.22rem 0 0;
    color: ${textMuted};
    font-size: 0.78rem;
    font-weight: 760;
  }
`

export const DetailMetaList = styled.dl`
  display: grid;
  grid-template-columns: 5rem minmax(0, 1fr);
  gap: 0.68rem 0.8rem;
  margin: 0;

  dt {
    display: flex;
    align-items: center;
    gap: 0.38rem;
    color: ${textMuted};
    font-size: 0.8rem;
    font-weight: 800;
  }

  dt span {
    width: 1.05rem;
    height: 1.05rem;
    display: inline-grid;
    place-items: center;
    color: ${accentGold};
    text-align: center;
  }

  dd {
    margin: 0;
    color: ${textPrimary};
    font-size: 0.82rem;
    font-weight: 780;
    overflow-wrap: anywhere;
  }
`

export const PreviewHeader = styled.div`
  display: grid;
  gap: 0.35rem;

  h3 {
    margin: 0;
    color: ${textPrimary};
    font-size: 0.96rem;
    font-weight: 850;
  }

  p {
    margin: 0;
    color: ${textMuted};
    font-size: 0.78rem;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
`

export const PreviewStage = styled.div`
  display: grid;
  gap: 0.75rem;
  width: 100%;
  min-height: 12rem;
  align-content: start;
  min-width: 0;
`

export const PdfCanvas = styled.canvas`
  width: 100%;
  height: auto;
  max-width: 100%;
  max-height: min(52vh, 34rem);
  display: block;
  border: 1px solid ${border};
  border-radius: 8px;
  background: ${surfaceRaised};
  object-fit: contain;
`

export const DocumentFallbackBox = styled.div`
  display: grid;
  gap: 0.65rem;
  place-items: center;
  min-height: 12rem;
  padding: 1.25rem;
  border: 1px solid ${border};
  border-radius: 8px;
  background: ${surfaceRaised};
  color: ${textSecondary};
  text-align: center;

  strong {
    color: ${textPrimary};
    font-size: 0.95rem;
    font-weight: 850;
  }

  p {
    margin: 0;
    max-width: 18rem;
    font-size: 0.78rem;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  a {
    border: 1px solid ${borderStrong};
    border-radius: 2px;
    padding: 0.45rem 0.7rem;
    background: ${surfaceMuted};
    color: ${textPrimary};
    font-size: 0.78rem;
    font-weight: 850;
    text-decoration: none;
  }
`

export const PhotoFrame = styled.div`
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  min-height: 12rem;
  overflow: hidden;
  border-radius: 8px;
  background: ${surfaceMuted};

  img {
    width: 100%;
    max-height: 18rem;
    object-fit: contain;
    background: transparent;
  }
`

export const PhotoFallback = styled.div`
  display: grid;
  place-items: center;
  min-height: 12rem;
  padding: 1rem;
  color: ${textSecondary};
  font-size: 0.82rem;
  font-weight: 780;
  text-align: center;
`

export const ToastViewport = styled.div<{ "data-tone": "success" | "error" }>`
  position: fixed;
  right: max(1rem, env(safe-area-inset-right));
  bottom: max(1rem, env(safe-area-inset-bottom));
  z-index: ${zIndexes.dialogHoverCard};
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.28rem 0.7rem;
  align-items: center;
  width: min(24rem, calc(100vw - 2rem));
  padding: 0.78rem 0.9rem;
  border: 1px solid
    ${({ theme, "data-tone": tone }) =>
      tone === "error" ? theme.colors.statusDangerBorder : theme.colors.statusSuccessBorder};
  border-radius: 8px;
  background: ${surfaceRaised};
  box-shadow: none;

  strong {
    color: ${textPrimary};
    font-size: 0.86rem;
    font-weight: 850;
  }

  span {
    grid-column: 1 / 2;
    min-width: 0;
    overflow: hidden;
    color: ${textMuted};
    font-size: 0.76rem;
    font-weight: 720;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button {
    grid-column: 2;
    grid-row: 1 / span 2;
    border: 0;
    background: transparent;
    color: ${textSecondary};
    font-size: 0.78rem;
    font-weight: 800;
    cursor: pointer;
  }
`

export const ConfirmBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${zIndexes.dialog};
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.36);
`

export const ConfirmDialog = styled.div`
  display: grid;
  gap: 0.95rem;
  width: min(26rem, 100%);
  padding: 1.15rem;
  border: 1px solid ${borderStrong};
  border-radius: 8px;
  background: ${surfaceRaised};
  box-shadow: none;

  > strong {
    color: ${textPrimary};
    font-size: 1rem;
    font-weight: 880;
  }

  p {
    display: grid;
    gap: 0.42rem;
    margin: 0;
    color: ${textMuted};
    font-size: 0.82rem;
    line-height: 1.55;
    font-weight: 720;
  }

  p span {
    color: ${textPrimary};
    font-weight: 850;
    overflow-wrap: anywhere;
  }

  > div {
    display: flex;
    justify-content: flex-end;
    gap: 0.45rem;
  }
`

export const VideoFrame = styled.div`
  display: grid;
  gap: 0.7rem;
  width: 100%;

  video {
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 8px;
    background: ${surfaceMuted};
  }
`

export const PlayerBar = styled.div`
  display: grid;
  gap: 0.55rem;
`

export const Timeline = styled.div`
  height: 0.45rem;
  border-radius: 999px;
  background: linear-gradient(90deg, ${accentGold} 0 34%, ${accentTeal} 34% 36%, ${surfaceMuted} 36% 100%);
`

export const InlineList = styled.div`
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;

  span {
    border: 1px solid ${border};
    border-radius: 2px;
    padding: 0.25rem 0.48rem;
    color: ${textSecondary};
    font-size: 0.72rem;
    font-weight: 760;
  }
`

export const QueuePanel = styled.section`
  position: fixed;
  right: max(1rem, env(safe-area-inset-right));
  bottom: max(1rem, env(safe-area-inset-bottom));
  z-index: ${zIndexes.header - 1};
  display: grid;
  gap: 0.55rem;
  width: min(25rem, calc(100vw - 2rem));
  max-height: min(24rem, calc(100vh - var(--app-header-height, 73px) - 2rem));
  padding: 0.78rem;
  border: 1px solid ${borderStrong};
  border-radius: 8px;
  background: ${surfaceRaised};
  box-shadow: none;

  @media (max-width: 760px) {
    right: 0.72rem;
    bottom: 0.72rem;
    width: calc(100vw - 1.44rem);
    max-height: min(22rem, calc(100vh - var(--app-header-height, 73px) - 1.44rem));
    padding: 0.68rem;
  }
`

export const QueueHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;

  h2 {
    margin: 0;
    color: ${textPrimary};
    font-size: 0.95rem;
    font-weight: 880;
  }

  p {
    margin: 0.16rem 0 0;
    color: ${textMuted};
    font-size: 0.74rem;
    font-weight: 700;
  }
`

export const QueueList = styled.ul`
  display: grid;
  gap: 0.25rem;
  max-height: 15rem;
  overflow: auto;
  margin: 0;
  padding: 0;
  list-style: none;
`

export const QueueItem = styled.li`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(3.7rem, auto) auto;
  gap: 0.5rem 0.75rem;
  align-items: center;
  min-width: 0;
  padding: 0.54rem 0.58rem;
  border: 0;
  border-radius: 6px;
  background: ${surface};

  strong {
    display: block;
    color: ${textPrimary};
    font-size: 0.8rem;
    font-weight: 820;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  p {
    margin: 0.16rem 0 0;
    color: ${textMuted};
    font-size: 0.72rem;
    font-weight: 700;
  }

  @media (max-width: 640px) {
    grid-template-columns: minmax(0, 1fr) auto;

    button {
      grid-column: 1 / -1;
      justify-self: start;
    }
  }
`

export const StatusPill = styled.span`
  justify-self: end;
  min-width: 3.55rem;
  max-width: 5.6rem;
  border-radius: 2px;
  padding: 0.22rem 0.45rem;
  background: ${surfaceAccent};
  color: ${accentGold};
  font-size: 0.7rem;
  font-weight: 850;
  text-align: center;
  white-space: nowrap;

  &[data-status="failed"] {
    background: ${({ theme }) => theme.colors.statusDangerSurface};
    color: ${({ theme }) => theme.colors.statusDangerText};
  }

  &[data-status="cancelled"] {
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray10};
  }

  &[data-status="done"] {
    background: ${({ theme }) => theme.colors.statusSuccessSurface};
    color: ${({ theme }) => theme.colors.statusSuccessText};
  }
`

export const ProgressTrack = styled.div`
  grid-column: 1 / -1;
  height: 0.28rem;
  overflow: hidden;
  border-radius: 999px;
  background: ${surfaceMuted};

  span {
    display: block;
    height: 100%;
    width: var(--progress, 0%);
    border-radius: inherit;
    background: linear-gradient(90deg, ${accentGold}, ${accentTeal});
    transition: width 180ms ease;
  }
`

export const EmptyState = styled.div`
  display: grid;
  place-items: center;
  gap: 0.45rem;
  min-height: 10rem;
  padding: 1.4rem;
  text-align: center;
  color: ${textMuted};

  strong {
    color: ${textPrimary};
    font-size: 0.94rem;
  }

  p {
    margin: 0;
    color: ${textMuted};
    font-size: 0.8rem;
    line-height: 1.5;
  }
`
