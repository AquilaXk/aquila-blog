import styled from "@emotion/styled"
import {
  AdminInfoLinkCard,
  AdminInfoList,
  AdminInfoPanelCard,
  AdminPlainCard,
} from "src/routes/Admin/AdminSurfacePrimitives"
import {
  adminAppBackground,
  adminBorder,
  adminSurface,
  adminSurfaceRaised,
  adminTextPrimary,
  adminTextSecondary,
} from "src/routes/Admin/adminColorTokens"

export const Main = styled.main`
  min-height: 100vh;
  background: ${adminAppBackground};
`

export const Shell = styled.div`
  width: 100%;
  margin: 0;
  padding: 1.05rem 1.45rem 4.5rem;
  display: grid;
  gap: 8px;

  @media (max-width: 768px) {
    width: 100%;
    padding: 0.85rem 0.82rem 3rem;
    gap: 8px;
  }
`

export const HeroPanel = styled.section`
  display: grid;
  gap: 6px;
  padding: 0 0 9px;
  border-bottom: 1px solid ${adminBorder};

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
    color: ${adminTextPrimary};
    font-size: clamp(1.16rem, 2vw, 1.42rem);
    line-height: 1.1;
    letter-spacing: 0;
    font-weight: 800;
  }
  @media (max-width: 768px) {
    h1 {
      font-size: clamp(1.16rem, 6vw, 1.42rem);
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
  min-height: 38px;
  padding: 0 15px;
  border-radius: 4px;
  border: 1px solid ${adminBorder};
  background: ${adminSurface};
  color: ${adminTextPrimary};
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
  border-radius: 4px;
  border: 1px solid ${adminBorder};
  background: ${adminSurface};
  color: ${adminTextPrimary};
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
  border-radius: 2px;
  border: 1px solid ${adminBorder};
  background: ${adminSurface};
  box-shadow: none;

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
    border-radius: 2px;
  }
`

export const MetricIcon = styled.div`
  width: 42px;
  height: 42px;
  border-radius: 2px;
  display: grid;
  place-items: center;
  background: ${adminSurfaceRaised};
  color: ${adminTextSecondary};

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
    border-radius: 2px;
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
  align-items: flex-start;
  gap: 16px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid ${adminBorder};

  strong {
    display: block;
    color: ${adminTextPrimary};
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
  border-radius: 4px;
  background: ${adminSurfaceRaised};
  color: ${adminTextPrimary};
  text-decoration: none;
  font-size: 0.88rem;
  font-weight: 780;
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
