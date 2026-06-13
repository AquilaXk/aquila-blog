import styled from "@emotion/styled"
import {
  AdminActionCardButton,
  AdminInlineActionRow,
  AdminRailCard,
  AdminSectionHeading,
  AdminSectionTitleStack,
  AdminStickyRail,
  AdminStatusPill,
  AdminTextActionButton,
  AdminWorkspaceHero,
  adminInteractiveFocusRing,
} from "src/routes/Admin/AdminSurfacePrimitives"
import {
  adminBorder,
  adminBorderStrong,
  adminSurface,
  adminSurfaceRaised,
  adminWarningBadgeBorder,
  adminWarningBadgeSurface,
  adminWarningBadgeText,
} from "src/routes/Admin/adminColorTokens"

export const Main = styled.main`
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 1.05rem 1.45rem 2.6rem;
  display: grid;
  gap: 1.25rem;
`

export const OpsOverview = styled(AdminWorkspaceHero)`
  display: grid;
  gap: 0.58rem;
  padding-bottom: 0.58rem;
`

export const OverviewHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;

  h1 {
    margin: 0;
    font-size: clamp(1.16rem, 2vw, 1.42rem);
    line-height: 1.1;
    letter-spacing: 0;
  }

  @media (max-width: 960px) {
    flex-direction: column;
  }
`

export const OverviewMeta = styled.div`
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.6rem;
`

export const MetaCaption = styled.div`
  display: grid;
  gap: 0.16rem;
  text-align: right;

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  strong {
    font-size: 0.88rem;
    color: ${({ theme }) => theme.colors.gray12};
  }
`

export const OverviewContent = styled.div`
  display: grid;
  grid-template-columns: minmax(280px, 1.05fr) minmax(0, 1.4fr);
  gap: 0.9rem;

  @media (max-width: 1180px) {
    grid-template-columns: 1fr;
  }
`

export const FeaturedStatusCard = styled.button`
  text-align: left;
  display: grid;
  gap: 0.55rem;
  border-radius: 2px;
  border: 1px solid ${adminBorder};
  background: ${adminSurfaceRaised};
  padding: 1rem;
  cursor: pointer;

  &:hover {
    border-color: ${adminBorderStrong};
  }
`

export const CardEyebrow = styled.span`
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.04em;
`

export const CardMainLine = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;

  strong {
    font-size: clamp(1.3rem, 2.4vw, 1.75rem);
    letter-spacing: -0.03em;
  }
`

export const CardDetail = styled.span`
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.86rem;
  line-height: 1.6;
`

export const StatusCardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13.5rem, 1fr));
  gap: 0.8rem;
`

export const StatusCardButton = styled.button`
  text-align: left;
  display: grid;
  gap: 0.22rem;
  border-radius: 2px;
  border: 1px solid ${adminBorder};
  background: ${adminSurface};
  padding: 0.82rem 0.9rem;
  cursor: pointer;

  &:hover {
    border-color: ${adminBorderStrong};
  }

  small {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.74rem;
    font-weight: 700;
    word-break: keep-all;
  }

  strong {
    font-size: 1rem;
    line-height: 1.35;
    word-break: keep-all;
  }
`

export const SectionTitleBlock = styled(AdminSectionTitleStack)`
  h2,
  h3 {
    font-size: 1.05rem;
  }
`

export const CalmMessage = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.gray10};
  line-height: 1.6;
`

export const WorkspaceShell = styled.div`
  display: grid;
  gap: 0.95rem;
  align-items: start;
`

export const WorkspaceColumn = styled.div`
  display: grid;
  gap: 0.85rem;
`

export const WorkspaceSection = styled.section`
  display: grid;
  gap: 0.82rem;
  padding: 0.92rem;
  border-radius: 2px;
  background: ${adminSurfaceRaised};
  border: 1px solid ${adminBorder};
  content-visibility: auto;
  contain-intrinsic-size: 720px;

  &[data-emphasis="secondary"] {
    background: ${adminSurface};
    border-color: ${adminBorder};
  }

  &[data-tone="danger"] {
    background: linear-gradient(180deg, ${({ theme }) => theme.colors.gray2} 0%, rgba(239, 68, 68, 0.08) 100%);
    border-color: ${({ theme }) => theme.colors.statusDangerBorder};
  }
`

export const SectionHeading = styled(AdminSectionHeading)`
  align-items: flex-start;
`

export const StatusBadge = styled(AdminStatusPill)`
  min-height: 34px;
  padding: 0 0.78rem;
  border-color: ${adminWarningBadgeBorder()};
  background: ${adminWarningBadgeSurface()};
  color: ${adminWarningBadgeText()};

  &[data-tone="success"] {
    border-color: ${({ theme }) => theme.colors.statusSuccessBorder};
    background: ${({ theme }) => theme.colors.statusSuccessSurface};
    color: ${({ theme }) => theme.colors.statusSuccessText};
  }

  &[data-tone="danger"] {
    border-color: ${({ theme }) => theme.colors.statusDangerBorder};
    background: ${({ theme }) => theme.colors.statusDangerSurface};
    color: ${({ theme }) => theme.colors.statusDangerText};
  }
`

export const FreshnessBadge = styled(AdminStatusPill)`
  min-height: 26px;
  padding: 0 0.58rem;

  &[data-tone="fresh"] {
    border-color: ${({ theme }) => theme.colors.statusSuccessBorder};
    background: ${({ theme }) => theme.colors.statusSuccessSurface};
    color: ${({ theme }) => theme.colors.statusSuccessText};
  }

  &[data-tone="aging"] {
    border-color: ${({ theme }) => theme.colors.orange7};
    background: ${({ theme }) => theme.colors.orange2};
    color: ${({ theme }) => theme.colors.orange10};
  }

  &[data-tone="stale"] {
    border-color: ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray10};
  }
`

export const SubSectionHeading = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 1rem;

  strong {
    font-size: 1rem;
    font-weight: 800;
    color: ${({ theme }) => theme.colors.gray12};
  }

  small {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
    font-weight: 700;
  }
`

export const DetailsPanel = styled.details`
  border-radius: 2px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};

  &[open] {
    padding-bottom: 0.2rem;
  }
`

export const DetailsSummary = styled.summary`
  list-style: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.8rem;
  padding: 0.84rem 0.95rem;
  cursor: pointer;

  &::-webkit-details-marker {
    display: none;
  }

  span {
    font-size: 0.9rem;
    font-weight: 760;
  }

  small {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
    font-weight: 700;
  }
`

export const DiagnosticsTabs = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
`

export const DiagnosticsTabButton = styled.button`
  min-height: 38px;
  padding: 0 0.82rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;

  &[data-active="true"] {
    color: ${({ theme }) => theme.colors.gray12};
    border-color: ${({ theme }) => theme.colors.accentBorder};
    background: ${({ theme }) => theme.colors.accentSurfaceSubtle};
  }
`

export const DiagnosticPanel = styled.div`
  display: grid;
  gap: 0.9rem;
`

export const DiagnosticHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.9rem;

  strong {
    display: block;
    font-size: 1rem;
    letter-spacing: -0.02em;
  }

  span {
    display: block;
    margin-top: 0.22rem;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.55;
  }

  @media (max-width: 760px) {
    flex-direction: column;
  }
`

export const ActionRow = styled(AdminInlineActionRow)`
  gap: 0.5rem;
`

export const QuietButton = styled(AdminTextActionButton)`
  font-size: 0.82rem;
  font-weight: 700;

  &:disabled {
    opacity: 0.56;
    cursor: not-allowed;
  }
`

export const MetricGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.7rem;

  @media (max-width: 960px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`

export const MetricCard = styled.div`
  display: grid;
  gap: 0.22rem;
  padding: 0.82rem 0.88rem;
  border-radius: 2px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};

  small {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  strong {
    font-size: 1rem;
    overflow-wrap: anywhere;
  }
`
