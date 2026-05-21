import styled from "@emotion/styled"
import {
  AdminInfoLinkCard,
  AdminInfoList,
  AdminInfoPanelCard,
  AdminPlainCard,
  AdminSectionTitleStack,
  AdminTextActionLink,
} from "src/routes/Admin/AdminSurfacePrimitives"

export const Main = styled.main`
  min-height: 100vh;
  background: ${({ theme }) =>
    theme.blogDesign === "grid" ? theme.publicDesign.operationSurface : theme.colors.gray2};
`

export const Shell = styled.div`
  width: min(1380px, calc(100% - 40px));
  margin: 0 auto;
  padding: 16px 0 72px;
  display: grid;
  gap: 10px;

  @media (max-width: 768px) {
    width: min(calc(100% - 24px), 1380px);
    padding-top: 6px;
    gap: 8px;
  }
`

export const HeroPanel = styled.section`
  display: grid;
  gap: 8px;
  padding: 0 0 12px;
  border-bottom: 1px solid ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.border : theme.colors.gray5)};

  @media (max-width: 820px) {
    gap: 6px;
    padding-bottom: 11px;
  }
`

export const HeroTop = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-end;

  @media (max-width: 700px) {
    flex-direction: column;
    align-items: stretch;
  }
`

export const HeroCopy = styled.div`
  display: grid;
  gap: 0;

  h1 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: clamp(1.52rem, 2.5vw, 2rem);
    line-height: 1.1;
    letter-spacing: -0.03em;
    font-weight: 800;
  }
  @media (max-width: 768px) {
    h1 {
      font-size: clamp(1.46rem, 7vw, 1.88rem);
    }
  }
`

export const PageEyebrow = styled.span`
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
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
  min-height: 38px;
  padding: 0 15px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.border : theme.colors.gray6)};
  background: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.operationSurface : theme.colors.gray1)};
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.84rem;
  font-weight: 800;

  &[data-tone="good"] {
    border-color: ${({ theme }) => theme.colors.green7};
    background: ${({ theme }) => theme.colors.accentSurfaceSubtle};
  }

  &[data-tone="warn"] {
    border-color: ${({ theme }) => theme.colors.orange7};
  }
`

export const HeaderLink = styled.a`
  display: inline-flex;
  align-items: center;
  min-height: 38px;
  padding: 0 15px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.border : theme.colors.gray6)};
  background: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.operationSurface : theme.colors.gray1)};
  color: ${({ theme }) => theme.colors.gray12};
  text-decoration: none;
  font-size: 0.84rem;
  font-weight: 780;
`

export const ServiceRail = styled.section`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13.5rem, 1fr));
  gap: 8px;

  @media (max-width: 720px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }
`

export const MetricCard = styled.article`
  display: grid;
  gap: 10px;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  padding: 12px;
  border-radius: 22px;
  border: 1px solid ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.border : theme.colors.gray6)};
  background: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.operationSurface : theme.colors.gray1)};
  box-shadow: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.shadow : "0 14px 30px rgba(15, 23, 42, 0.05)")};

  &[data-tone="good"] {
    border-color: ${({ theme }) => theme.colors.green7};
  }

  &[data-tone="warn"] {
    border-color: ${({ theme }) => theme.colors.orange7};
  }

  @media (max-width: 820px) {
    padding: 11px;
    gap: 9px;
  }

  @media (max-width: 720px) {
    gap: 7px;
    padding: 8px;
    border-radius: 16px;
  }
`

export const MetricIcon = styled.div`
  width: 42px;
  height: 42px;
  border-radius: 15px;
  display: grid;
  place-items: center;
  background: ${({ theme }) =>
    theme.blogDesign === "grid" ? theme.publicDesign.operationSurfaceElevated : theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray11};

  &[data-tone="good"] {
    background: ${({ theme }) =>
      theme.scheme === "light" ? "rgba(34, 197, 94, 0.1)" : "rgba(34, 197, 94, 0.18)"};
    color: ${({ theme }) => theme.colors.green7};
  }

  &[data-tone="warn"] {
    background: ${({ theme }) =>
      theme.scheme === "light" ? "rgba(249, 115, 22, 0.1)" : "rgba(249, 115, 22, 0.18)"};
    color: ${({ theme }) => theme.colors.orange7};
  }

  @media (max-width: 720px) {
    width: 30px;
    height: 30px;
    border-radius: 11px;
  }
`

export const MetricCopy = styled.div`
  display: grid;
  gap: 4px;
  min-width: 0;

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
    font-weight: 700;
    line-height: 1.4;
    word-break: keep-all;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.22rem;
    font-weight: 820;
    line-height: 1.24;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 820px) {
    strong {
      font-size: 1.08rem;
    }
  }

  @media (max-width: 720px) {
    gap: 2px;

    span {
      font-size: 0.68rem;
      line-height: 1.22;
    }

    strong {
      font-size: 0.92rem;
      line-height: 1.18;
    }
  }
`

export const PanelGrid = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(17.5rem, 0.8fr);
  gap: 16px;
  align-items: start;

  @media (max-width: 1180px) {
    grid-template-columns: 1fr;
  }

  @media (max-width: 720px) {
    gap: 10px;
  }
`

export const PanelCard = styled(AdminPlainCard)`
  border-radius: 16px;
  overflow: hidden;
  box-shadow: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.shadow : "0 12px 30px rgba(15, 23, 42, 0.06)")};
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
  align-items: flex-start;
  gap: 16px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.border : theme.colors.gray4)};

  strong {
    display: block;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.02rem;
    font-weight: 840;
    letter-spacing: -0.03em;
  }

  span {
    display: none;
  }

  @media (max-width: 720px) {
    gap: 10px;
    padding: 10px 12px 8px;

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
  border-radius: 999px;
  background: ${({ theme }) =>
    theme.blogDesign === "grid" ? theme.publicDesign.operationSurfaceElevated : theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  text-decoration: none;
  font-size: 0.88rem;
  font-weight: 780;
`

export const PanelBody = styled.div`
  background: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.operationSurface : theme.colors.gray1)};
`

export const SnapshotLeadBody = styled(PanelBody)`
  display: grid;
  gap: 10px;
  padding: 14px;

  ${AdminInfoPanelCard} {
    gap: 0.38rem;
    padding: 0.72rem;
    border-radius: 14px;
  }

  @media (max-width: 720px) {
    padding: 10px;
  }
`

export const PanelFrame = styled.iframe`
  display: block;
  width: 100%;
  height: 304px;
  border: 0;
  background: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.operationSurface : theme.colors.gray1)};
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

  ${AdminInfoLinkCard} {
    padding: 0.64rem 0.72rem;
    border-radius: 14px;
  }

  @media (max-width: 720px) {
    gap: 6px;
    padding: 9px;
  }
`

export const SectionHeader = styled(AdminSectionTitleStack)`
  h2 {
    font-size: 0.98rem;
  }
`

export const PrioritySection = styled(AdminPlainCard)`
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 18px;

  @media (max-width: 720px) {
    gap: 8px;
    padding: 12px;
  }
`

export const ContextGrid = styled.section`
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);

  @media (max-width: 1180px) {
    grid-template-columns: 1fr;
  }
`

export const ContextSection = styled(AdminPlainCard)`
  display: grid;
  gap: 12px;
  padding: 16px 18px;
  border-radius: 24px;
`

export const ContextLinkGrid = styled(AdminInfoList)`
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
`

export const ContextMonitoringLinkCard = styled(AdminInfoLinkCard)`
  min-height: 100%;
  align-items: flex-start;
  gap: 0.8rem;
  padding: 0.94rem 0.98rem;

  .copy {
    gap: 0.22rem;
  }

  .copy strong {
    font-size: 1rem;
    line-height: 1.18;
    overflow-wrap: normal;
    word-break: keep-all;
  }

  .copy span {
    line-height: 1.38;
    overflow-wrap: normal;
    word-break: keep-all;
  }
`

export const AdditionalPanelsSection = styled(AdminPlainCard)`
  padding: 14px 16px;
  border-radius: 24px;
`

export const AdditionalPanelsDisclosure = styled.details`
  display: grid;
  gap: 14px;
`

export const AdditionalPanelsSummary = styled.summary`
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;

  &::-webkit-details-marker {
    display: none;
  }

  div {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.98rem;
    font-weight: 820;
  }

  span,
  small {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
    font-weight: 700;
  }
`

export const AdditionalPanelsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`

export const PriorityTable = styled.table`
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    padding: 14px 10px;
    border-top: 1px solid ${({ theme }) => theme.colors.gray4};
    text-align: left;
    vertical-align: middle;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.84rem;
    line-height: 1.5;
  }

  thead th {
    border-top: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.75rem;
    font-weight: 780;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  @media (max-width: 720px) {
    thead {
      display: none;
    }

    tbody,
    tr,
    td {
      display: block;
      width: 100%;
    }

    tr {
      padding: 12px 0;
      border-top: 1px solid ${({ theme }) => theme.colors.gray4};
    }

    tbody tr:first-of-type {
      border-top: 0;
    }

    td {
      border-top: 0;
      padding: 6px 0;
    }
  }
`

export const PriorityCellCopy = styled.div`
  display: grid;
  gap: 2px;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.9rem;
    font-weight: 800;
  }
`

export const PrioritySummary = styled.div`
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0.32rem 0.72rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.78rem;
  font-weight: 760;
  line-height: 1.4;
  white-space: normal;

  &[data-tone="good"] {
    border-color: ${({ theme }) => theme.colors.green7};
    background: ${({ theme }) => theme.colors.accentSurfaceSubtle};
  }

  &[data-tone="warn"] {
    border-color: ${({ theme }) => theme.colors.orange7};
    background: ${({ theme }) => theme.colors.orange2};
  }
`

export const PriorityLink = styled(AdminTextActionLink)`
  min-height: 30px;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.8rem;
  font-weight: 780;
`

export const InsightLink = styled(AdminTextActionLink)`
  font-size: 0.82rem;
  font-weight: 780;
`
