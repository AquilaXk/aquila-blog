import styled from "@emotion/styled"

export const CloudMain = styled.main`
  display: grid;
  gap: 1rem;
  min-width: 0;
`

export const CloudHeader = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: end;
  padding: 1.35rem;
  border: 1px solid ${({ theme }) => theme.colors.gray4};
  border-radius: 22px;
  background: ${({ theme }) => theme.colors.gray1};

  @media (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr);
  }
`

export const HeaderCopy = styled.div`
  display: grid;
  gap: 0.45rem;

  h1 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: clamp(1.65rem, 3vw, 2.35rem);
    line-height: 1.08;
    letter-spacing: 0;
  }

  p {
    margin: 0;
    max-width: 48rem;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.98rem;
    line-height: 1.65;
  }
`

export const HeaderActions = styled.div`
  display: flex;
  gap: 0.55rem;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
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
  border-radius: 10px;
  min-height: 2.65rem;
  padding: 0 1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  background: #0f766e;
  color: white;
  font-size: 0.92rem;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
`

export const GhostButton = styled.button`
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 10px;
  min-height: 2.35rem;
  padding: 0 0.75rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.86rem;
  font-weight: 750;
  cursor: pointer;

  &[data-active="true"] {
    border-color: #0f766e;
    background: #ecfdf5;
    color: #115e59;
  }
`

export const CloudMetrics = styled.dl`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 0;

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`

export const MetricItem = styled.div`
  display: grid;
  gap: 0.28rem;
  min-width: 0;
  padding: 0.9rem 1rem;
  border: 1px solid ${({ theme }) => theme.colors.gray4};
  border-radius: 16px;
  background: ${({ theme }) => theme.colors.gray1};

  dt {
    color: ${({ theme }) => theme.colors.gray9};
    font-size: 0.76rem;
    font-weight: 750;
  }

  dd {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.15rem;
    font-weight: 850;
  }
`

export const WorkspaceGrid = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(21rem, 0.88fr);
  gap: 1rem;
  align-items: start;

  @media (max-width: 1120px) {
    grid-template-columns: minmax(0, 1fr);
  }
`

export const FileBrowserPanel = styled.div`
  display: grid;
  gap: 0.9rem;
  min-width: 0;
  padding: 1rem;
  border: 1px solid ${({ theme }) => theme.colors.gray4};
  border-radius: 18px;
  background: ${({ theme }) => theme.colors.gray1};
`

export const Toolbar = styled.div`
  display: grid;
  grid-template-columns: minmax(12rem, 1fr) auto;
  gap: 0.75rem;
  align-items: center;

  @media (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr);
  }
`

export const SearchInput = styled.input`
  width: 100%;
  min-height: 2.55rem;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 10px;
  padding: 0 0.85rem;
  background: white;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.94rem;

  &:focus {
    outline: 2px solid rgba(15, 118, 110, 0.22);
    border-color: #0f766e;
  }
`

export const FilterGroup = styled.div`
  display: flex;
  gap: 0.42rem;
  align-items: center;
  flex-wrap: wrap;
`

export const FileList = styled.div`
  display: grid;
  gap: 0.55rem;
`

export const FileRow = styled.article`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: center;
  min-width: 0;
  padding: 0.78rem;
  border: 1px solid ${({ theme }) => theme.colors.gray4};
  border-radius: 14px;
  background: white;

  &[data-selected="true"] {
    border-color: #0f766e;
    box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.1);
  }

  @media (max-width: 680px) {
    grid-template-columns: auto minmax(0, 1fr);
  }
`

export const KindBadge = styled.span`
  width: 2.65rem;
  height: 2.65rem;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: #f1f5f9;
  color: #0f172a;
  font-size: 0.74rem;
  font-weight: 900;
`

export const FileCopy = styled.div`
  min-width: 0;
  display: grid;
  gap: 0.22rem;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.94rem;
    overflow-wrap: anywhere;
  }

  span {
    color: ${({ theme }) => theme.colors.gray9};
    font-size: 0.78rem;
    line-height: 1.45;
  }
`

export const RowActions = styled.div`
  display: flex;
  gap: 0.4rem;
  justify-content: flex-end;

  @media (max-width: 680px) {
    grid-column: 1 / -1;
    justify-content: flex-start;
  }
`

export const PreviewPanel = styled.aside`
  display: grid;
  gap: 0.9rem;
  min-width: 0;
  position: sticky;
  top: calc(var(--app-header-height, 73px) + 1rem);
  padding: 1rem;
  border: 1px solid ${({ theme }) => theme.colors.gray4};
  border-radius: 18px;
  background: white;

  @media (max-width: 1120px) {
    position: static;
  }
`

export const PreviewHeader = styled.div`
  display: grid;
  gap: 0.35rem;

  h2 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.15rem;
    letter-spacing: 0;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray9};
    font-size: 0.82rem;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
`

export const PreviewStage = styled.div`
  display: grid;
  gap: 0.75rem;
  min-height: 18rem;
  align-content: start;
`

export const PdfCanvas = styled.canvas`
  width: 100%;
  max-height: 22rem;
  border: 1px solid ${({ theme }) => theme.colors.gray4};
  border-radius: 12px;
  background: #f8fafc;
`

export const PhotoFrame = styled.div`
  display: grid;
  gap: 0.65rem;

  img {
    width: 100%;
    max-height: 25rem;
    object-fit: contain;
    border-radius: 12px;
    background: #0f172a;
  }
`

export const ThumbnailStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.42rem;

  span {
    display: block;
    min-height: 3.4rem;
    border-radius: 10px;
    border: 1px solid ${({ theme }) => theme.colors.gray4};
    background: #f8fafc;
  }
`

export const VideoFrame = styled.div`
  display: grid;
  gap: 0.7rem;

  video {
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 12px;
    background: #020617;
  }
`

export const PlayerBar = styled.div`
  display: grid;
  gap: 0.55rem;
`

export const Timeline = styled.div`
  height: 0.55rem;
  border-radius: 999px;
  background: linear-gradient(90deg, #0f766e 0 34%, #f59e0b 34% 36%, #e2e8f0 36% 100%);
`

export const InlineList = styled.div`
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;

  span {
    border: 1px solid ${({ theme }) => theme.colors.gray4};
    border-radius: 999px;
    padding: 0.32rem 0.55rem;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.76rem;
    font-weight: 750;
  }
`

export const Notice = styled.p`
  margin: 0;
  color: #115e59;
  font-size: 0.84rem;
  font-weight: 750;
`

export const EmptyState = styled.div`
  min-height: 16rem;
  display: grid;
  place-items: center;
  text-align: center;
  color: ${({ theme }) => theme.colors.gray9};
  border: 1px dashed ${({ theme }) => theme.colors.gray5};
  border-radius: 14px;
  background: #f8fafc;
`
