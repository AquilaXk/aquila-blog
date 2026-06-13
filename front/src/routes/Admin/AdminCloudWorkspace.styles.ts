import styled from "@emotion/styled"
import {
  adminBorder as border,
  adminBorderStrong as borderStrong,
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

export const CloudMain = styled.main`
  display: grid;
  min-width: 0;
  color: ${textPrimary};
  background: ${surface};
  border: 1px solid ${border};
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.28);
`

export const CloudNoticeBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  min-height: 2.8rem;
  padding: 0.55rem 1rem;
  border-bottom: 1px solid ${border};
  background: #1d1e1b;
  color: ${textSecondary};
  font-size: 0.86rem;
  font-weight: 700;

  strong {
    color: ${accentGold};
    font-weight: 850;
  }

  @media (max-width: 760px) {
    justify-content: flex-start;
    text-align: left;
  }
`

export const CloudWorkspace = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(18rem, 21rem);
  min-height: calc(100vh - var(--app-header-height, 73px) - 7rem);

  @media (max-width: 1260px) {
    grid-template-columns: minmax(0, 1fr) minmax(17rem, 19rem);
  }

  @media (max-width: 980px) {
    grid-template-columns: minmax(0, 1fr);
  }
`

export const CloudNavigationRail = styled.aside`
  display: grid;
  align-content: start;
  gap: 1.25rem;
  min-width: 0;
  padding: 1.25rem 1rem;
  border-right: 1px solid ${border};
  background: #141514;

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
  border-radius: 8px;
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
    background: linear-gradient(90deg, ${accentGold} 0 22%, #3b3931 22% 100%);
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
  grid-template-columns: minmax(0, 1fr) minmax(18rem, 26rem);
  gap: 1rem;
  align-items: center;
  padding: 1.35rem 1.5rem 0.95rem;

  h1 {
    margin: 0;
    color: ${textPrimary};
    font-size: 1.32rem;
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
  border-radius: 999px;
  padding: 0 3.25rem 0 2.45rem;
  background: #22231f;
  color: ${textPrimary};
  font-size: 0.86rem;
  font-weight: 700;

  &::placeholder {
    color: ${textMuted};
  }

  &:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(208, 180, 108, 0.2);
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  min-width: 0;
  padding: 0.55rem 1.5rem 1rem;
  border-bottom: 1px solid ${border};

  @media (max-width: 760px) {
    align-items: stretch;
    flex-direction: column;
  }
`

export const ActionGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  flex-wrap: wrap;
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
  color: #f5f2e8;
  font-size: 0.84rem;
  font-weight: 850;
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.62;
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(63, 143, 134, 0.25);
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
  min-width: 46rem;
  border-collapse: collapse;
  color: ${textPrimary};

  th,
  td {
    border-bottom: 1px solid ${border};
    text-align: left;
    vertical-align: middle;
  }

  th {
    height: 2.25rem;
    padding: 0 0.7rem;
    color: ${textMuted};
    background: #1d1e1b;
    font-size: 0.75rem;
    font-weight: 800;
  }

  td {
    height: 3.1rem;
    padding: 0 0.7rem;
    color: ${textSecondary};
    font-size: 0.82rem;
    font-weight: 700;
  }

  tbody tr[data-selected="true"] {
    background: #242319;
  }

  tbody tr:hover {
    background: #20211f;
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
  color: #a0a8b4;
  cursor: pointer;
  font-size: 1.15rem;
`

export const FileTypeIcon = styled.span`
  width: 1.45rem;
  height: 1.2rem;
  display: inline-grid;
  place-items: center;
  border-radius: 4px;
  background: #3c756f;
  color: #f5f2e8;
  font-size: 0.63rem;
  font-weight: 900;
`

export const FileNameButton = styled.button`
  border: 0;
  padding: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.52rem;
  min-width: 0;
  max-width: 100%;
  background: transparent;
  color: ${textPrimary};
  cursor: pointer;
  font-size: 0.88rem;
  font-weight: 800;
  text-align: left;

  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`

export const RowActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.3rem;
`

export const EmptyTableState = styled.div`
  display: grid;
  place-items: center;
  gap: 0.7rem;
  min-height: 20rem;
  padding: 2rem;
  color: ${textMuted};
  text-align: center;

  strong {
    color: ${textPrimary};
    font-size: 1rem;
  }

  p {
    margin: 0;
    max-width: 26rem;
    color: ${textMuted};
    font-size: 0.84rem;
    line-height: 1.55;
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

  @media (max-width: 1260px) {
    grid-column: 2;
  }

  @media (max-width: 980px) {
    grid-column: 1;
    border-left: 0;
    border-top: 1px solid ${border};
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
  place-items: center;
  min-height: 12.5rem;
  border-radius: 2px;
  background: ${surfaceMuted};
  overflow: hidden;
`

export const DetailMetaList = styled.dl`
  display: grid;
  grid-template-columns: 5rem minmax(0, 1fr);
  gap: 0.68rem 0.8rem;
  margin: 0;

  dt {
    color: ${textMuted};
    font-size: 0.8rem;
    font-weight: 800;
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
`

export const PdfCanvas = styled.canvas`
  width: 100%;
  max-height: 18rem;
  border: 1px solid ${border};
  border-radius: 8px;
  background: #1b1c1a;
`

export const PhotoFrame = styled.div`
  display: grid;
  gap: 0.65rem;
  width: 100%;

  img {
    width: 100%;
    max-height: 18rem;
    object-fit: contain;
    border-radius: 8px;
    background: #090a09;
  }
`

export const ThumbnailStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.42rem;

  span {
    display: block;
    min-height: 2.7rem;
    border-radius: 6px;
    border: 1px solid ${border};
    background: #1b1c1a;
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
    background: #020617;
  }
`

export const PlayerBar = styled.div`
  display: grid;
  gap: 0.55rem;
`

export const Timeline = styled.div`
  height: 0.45rem;
  border-radius: 999px;
  background: linear-gradient(90deg, ${accentGold} 0 34%, ${accentTeal} 34% 36%, #3b3931 36% 100%);
`

export const InlineList = styled.div`
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;

  span {
    border: 1px solid ${border};
    border-radius: 999px;
    padding: 0.25rem 0.48rem;
    color: ${textSecondary};
    font-size: 0.72rem;
    font-weight: 760;
  }
`

export const QueuePanel = styled.section`
  position: fixed;
  right: 1.25rem;
  bottom: 1.25rem;
  z-index: 30;
  width: min(26rem, calc(100vw - 2rem));
  display: grid;
  gap: 0.72rem;
  padding: 0.9rem;
  border: 1px solid ${borderStrong};
  border-radius: 12px;
  background: rgba(23, 24, 23, 0.96);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.34);
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
  gap: 0.48rem;
  max-height: 18rem;
  overflow: auto;
  margin: 0;
  padding: 0;
  list-style: none;
`

export const QueueItem = styled.li`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.5rem 0.75rem;
  align-items: center;
  min-width: 0;
  padding: 0.62rem;
  border: 1px solid ${border};
  border-radius: 9px;
  background: ${surfaceRaised};

  strong {
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
`

export const StatusPill = styled.span`
  justify-self: end;
  min-width: 4.2rem;
  border-radius: 999px;
  padding: 0.22rem 0.48rem;
  background: ${surfaceAccent};
  color: ${accentGold};
  font-size: 0.7rem;
  font-weight: 850;
  text-align: center;

  &[data-status="failed"] {
    background: #321b20;
    color: #f87171;
  }

  &[data-status="cancelled"] {
    background: #252622;
    color: ${textMuted};
  }

  &[data-status="done"] {
    background: #16342f;
    color: #5eead4;
  }
`

export const ProgressTrack = styled.div`
  grid-column: 1 / -1;
  height: 0.28rem;
  overflow: hidden;
  border-radius: 999px;
  background: #3b3931;

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
