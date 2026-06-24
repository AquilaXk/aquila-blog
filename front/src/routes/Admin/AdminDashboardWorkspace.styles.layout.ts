import styled from "@emotion/styled"
import {
  AdminInfoLinkCard,
  AdminInfoList,
  AdminInfoPanelCard,
  AdminPlainCard,
} from "src/routes/Admin/AdminSurfacePrimitives"
import {
  adminAppBackground,
  adminAccentText,
  adminBorder,
  adminBorderStrong,
  adminControlText,
  adminSurface,
  adminSurfaceAccent,
  adminSurfaceRaised,
  adminTeal,
  adminTealBorder,
  adminTealHover,
  adminTextMuted,
  adminTextPrimary,
  adminTextSecondary,
} from "src/routes/Admin/adminColorTokens"

export const Main = styled.main`
  display: grid;
  gap: 2rem;
  align-items: start;
  min-width: 0;
  min-height: 100vh;
  padding: 2.55rem 2.125rem 4.375rem;
  background: ${adminAppBackground};

  @media (max-width: 768px) {
    padding: 1rem 0.82rem 2rem;
  }
`

export const Shell = styled.div`
  display: grid;
  gap: 1.5rem;
  width: 100%;
  min-width: 0;
  margin: 0;
`

export const HeroPanel = styled.section`
  display: grid;
  min-width: 0;
`

export const HeroTop = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: start;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`

export const HeroCopy = styled.div`
  display: grid;
  gap: 0.85rem;
  min-width: 0;

  > span {
    color: ${adminTeal};
    font-size: 0.62rem;
    font-weight: 820;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    color: ${adminTextPrimary};
    font-size: 2.125rem;
    line-height: 1.08;
    letter-spacing: 0;
    font-weight: 840;
    overflow-wrap: anywhere;
  }

  p {
    margin: 0;
    color: ${adminTextMuted};
    font-size: 1rem;
    font-weight: 500;
    line-height: 1.5;
  }

  @media (max-width: 768px) {
    h1 {
      font-size: 1.38rem;
    }
  }
`

export const HeroActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;

  @media (max-width: 700px) {
    justify-content: flex-start;
  }
`

export const StatusChip = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  padding: 0 0.78rem;
  border-radius: 2px;
  border: 1px solid ${adminBorder};
  background: ${adminSurfaceRaised};
  color: ${adminTextPrimary};
  font-size: 0.72rem;
  font-weight: 820;
  letter-spacing: 0.04em;

  &[data-tone="good"] {
    border-color: ${adminTealBorder};
    background: ${adminSurfaceAccent};
    color: ${adminTeal};
  }

  &[data-tone="warn"] {
    border-color: ${adminBorderStrong};
    color: ${adminAccentText};
  }
`

export const HeaderLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  padding: 0 0.9rem;
  border-radius: 2px;
  border: 1px solid ${adminBorder};
  background: ${adminSurfaceRaised};
  color: ${adminTextPrimary};
  text-decoration: none;
  font-size: 0.82rem;
  font-weight: 780;

  &[data-variant="primary"] {
    border-color: ${adminTealBorder};
    background: ${adminTeal};
    color: ${adminControlText};
    font-weight: 820;
  }

  &[data-variant="primary"]:hover {
    background: ${adminTealHover};
  }
`

export const ServiceRail = styled.section`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0;
  border: 1px solid ${adminBorder};
  background: ${adminSurface};

  @media (max-width: 1040px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 560px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`

export const MetricCard = styled.article`
  display: grid;
  gap: 0.48rem;
  min-width: 0;
  min-height: 9rem;
  align-content: center;
  padding: 1.25rem;
  border-right: 1px solid ${adminBorder};
  background: transparent;

  &:last-of-type {
    border-right: 0;
  }

  @media (max-width: 1040px) {
    &:nth-of-type(2n) {
      border-right: 0;
    }

    &:nth-of-type(-n + 2) {
      border-bottom: 1px solid ${adminBorder};
    }
  }

  @media (max-width: 560px) {
    min-height: 6.2rem;
    padding: 0.82rem;
    border-bottom: 1px solid ${adminBorder};

    &:nth-of-type(odd) {
      border-right: 1px solid ${adminBorder};
    }

    &:nth-last-of-type(-n + 2) {
      border-bottom: 0;
    }
  }
`

export const MetricCopy = styled.div`
  display: grid;
  gap: 0.48rem;
  min-width: 0;

  span {
    color: ${adminTextMuted};
    font-size: 0.63rem;
    font-weight: 820;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  strong {
    color: ${adminTextPrimary};
    font-size: 1.55rem;
    font-weight: 840;
    line-height: 1.05;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    color: ${adminTextSecondary};
    font-size: 0.78rem;
    font-weight: 500;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  @media (max-width: 720px) {
    strong {
      font-size: 1.12rem;
    }
  }
`

export const OpsGrid = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 20rem;
  gap: 1rem;
  align-items: start;
  min-width: 0;

  > [data-size="wide"] {
    grid-column: 1 / -1;
  }

  @media (max-width: 1120px) {
    grid-template-columns: 1fr;
  }
`

export const Chart = styled.div`
  min-height: 20rem;
  display: grid;
  align-items: end;
  padding: 1.25rem;
  background: ${adminSurface};
`

export const ChartBars = styled.div`
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  align-items: end;
  gap: 0.55rem;
  min-height: 16rem;
`

export const ChartBar = styled.i`
  display: block;
  min-height: 8%;
  border-radius: 2px 2px 0 0;
  background: ${adminTeal};

  &[data-tone="warn"] {
    background: ${adminAccentText};
  }

  &[data-tone="neutral"] {
    background: ${adminTextSecondary};
  }
`

export const StatusRows = styled.div`
  display: grid;
`

export const StatusRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: center;
  min-height: 4rem;
  padding: 0.72rem 1rem;
  border-bottom: 1px solid ${adminBorder};

  &:last-of-type {
    border-bottom: 0;
  }

  > span {
    display: flex;
    align-items: center;
    gap: 0.62rem;
    min-width: 0;
  }

  strong,
  small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: ${adminTextPrimary};
    font-size: 0.98rem;
    font-weight: 800;
  }

  small {
    color: ${adminTextMuted};
    font-size: 0.74rem;
    font-weight: 600;
    line-height: 1.35;
  }
`

export const StatusDot = styled.i`
  width: 0.48rem;
  height: 0.48rem;
  border-radius: 50%;
  flex: 0 0 auto;
  background: ${adminTeal};
  box-shadow: 0 0 0 4px rgba(17, 145, 112, 0.12);

  &[data-tone="warn"] {
    background: ${adminAccentText};
    box-shadow: 0 0 0 4px rgba(180, 83, 9, 0.14);
  }

  &[data-tone="neutral"] {
    background: ${adminTextSecondary};
    box-shadow: 0 0 0 4px rgba(91, 107, 129, 0.12);
  }
`

export const PanelCard = styled(AdminPlainCard)`
  border-radius: 2px;
  overflow: hidden;
  box-shadow: none;
`

export const LeadPanelCard = styled(PanelCard)`
  min-width: 0;
`

export const CompactPanelCard = styled(PanelCard)`
  min-width: 0;
`

export const PanelHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  min-height: 3.25rem;
  padding: 0 1rem;
  border-bottom: 1px solid ${adminBorder};

  h2,
  strong {
    display: block;
    margin: 0;
    color: ${adminTextPrimary};
    font-size: 0.98rem;
    font-weight: 820;
    letter-spacing: 0;
  }

  span {
    color: ${adminTextMuted};
    font-size: 0.76rem;
    font-weight: 700;
  }

  @media (max-width: 720px) {
    gap: 10px;
    padding: 10px 12px 8px;

    h2,
    strong {
      font-size: 0.92rem;
    }
  }
`

export const LaunchLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 68px;
  min-height: 38px;
  padding: 0 14px;
  border-radius: 4px;
  background: ${adminSurfaceRaised};
  color: ${adminTextPrimary};
  text-decoration: none;
  font-size: 0.88rem;
  font-weight: 780;
`

export const LogLines = styled.div`
  display: grid;
  padding: 0.35rem 1rem 1rem;
  background: ${adminSurface};
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
`

export const LogLine = styled.div`
  display: grid;
  grid-template-columns: 8rem minmax(0, 1fr);
  gap: 1rem;
  padding: 0.58rem 0;
  border-bottom: 1px solid ${adminBorder};
  color: ${adminTextPrimary};
  font-size: 0.78rem;
  line-height: 1.45;

  &:last-of-type {
    border-bottom: 0;
  }

  > span {
    color: ${adminTeal};
    font-weight: 800;
    white-space: nowrap;
  }

  &[data-tone="warn"] > span {
    color: ${adminAccentText};
  }

  &[data-tone="neutral"] > span {
    color: ${adminTextSecondary};
  }

  p {
    margin: 0;
    min-width: 0;
    font-weight: 760;
  }

  small {
    display: block;
    color: ${adminTextMuted};
    font-size: 0.72rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    gap: 0.18rem;
  }
`

export const PanelBody = styled.div`
  background: ${adminSurface};
`

export const SnapshotLeadBody = styled(PanelBody)`
  display: grid;
  gap: 10px;
  padding: 14px;

  @media (max-width: 720px) {
    padding: 10px;
  }
`

export const LeadMetaCard = styled(AdminInfoPanelCard)`
  gap: 0.38rem;
  padding: 0.72rem;
  border-radius: 2px;
`

export const PanelFrame = styled.iframe`
  display: block;
  width: 100%;
  height: 304px;
  border: 0;
  background: ${adminSurface};
`

export const CompactPanelBody = styled(PanelBody)`
  overflow: hidden;
`

export const CompactPanelSummary = styled.div`
  min-height: 86px;
  display: grid;
  align-content: space-between;
  gap: 8px;
  padding: 12px;

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
    line-height: 1.55;
  }
`

export const PanelFallback = styled.div`
  min-height: 210px;
  display: grid;
  place-items: center;
  gap: 8px;
  padding: 32px;
  text-align: center;

  strong {
    font-size: 1rem;
    font-weight: 820;
  }

  span {
    max-width: 28rem;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.9rem;
    line-height: 1.6;
  }
`

export const InsightRail = styled.aside`
  display: grid;
  gap: 10px;
  grid-template-columns: 1fr;

  @media (max-width: 720px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
`

export const LeadMetaGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;

  strong {
    display: -webkit-box;
    overflow: hidden;
    line-height: 1.45;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    word-break: break-word;
  }

  @media (max-width: 720px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
`

export const ActionList = styled(AdminInfoList)`
  grid-template-columns: 1fr;
  gap: 8px;
  padding: 12px;

  @media (max-width: 720px) {
    gap: 6px;
    padding: 9px;
  }
`

export const ActionListLinkCard = styled(AdminInfoLinkCard)`
  padding: 0.64rem 0.72rem;
  border-radius: 2px;
`
