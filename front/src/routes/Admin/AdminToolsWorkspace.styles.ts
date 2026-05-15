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

export const Main = styled.main`
  max-width: 1440px;
  width: 100%;
  min-width: 0;
  margin: 0 auto;
  padding: 1.5rem 1rem 3rem;
  display: grid;
  gap: 1.25rem;
`

export const OpsOverview = styled(AdminWorkspaceHero)`
  display: grid;
  gap: 0.88rem;
  padding-bottom: 0.92rem;
`

export const OverviewHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;

  h1 {
    margin: 0;
    font-size: clamp(1.46rem, 2.8vw, 1.96rem);
    line-height: 1.1;
    letter-spacing: -0.03em;
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
  border-radius: 16px;
  border: 1px solid ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.border : theme.colors.gray6)};
  background: ${({ theme }) =>
    theme.blogDesign === "grid" ? theme.publicDesign.operationSurfaceElevated : theme.colors.gray2};
  padding: 1rem;
  cursor: pointer;

  &:hover {
    border-color: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.borderStrong : theme.colors.gray7)};
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
  border-radius: 16px;
  border: 1px solid ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.border : theme.colors.gray6)};
  background: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.operationSurface : theme.colors.gray1)};
  padding: 0.82rem 0.9rem;
  cursor: pointer;

  &:hover {
    border-color: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.borderStrong : theme.colors.gray7)};
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
  border-radius: 20px;
  background: ${({ theme }) =>
    theme.blogDesign === "grid" ? theme.publicDesign.operationSurfaceElevated : theme.colors.gray2};
  border: 1px solid ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.border : theme.colors.gray5)};
  content-visibility: auto;
  contain-intrinsic-size: 720px;

  &[data-emphasis="secondary"] {
    background: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.operationSurface : theme.colors.gray1)};
    border-color: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.border : theme.colors.gray4)};
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
  border-color: ${({ theme }) => theme.colors.indigo8};
  background: ${({ theme }) => theme.colors.indigo3};
  color: ${({ theme }) => theme.colors.indigo11};

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
  border-radius: 16px;
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
  border-radius: 14px;
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

export const InlineNotice = styled.p`
  margin: 0;
  padding: 0.8rem 0.88rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray3};
  color: ${({ theme }) => theme.colors.gray12};
  line-height: 1.6;

  &[data-tone="warning"] {
    border-color: ${({ theme }) => theme.colors.indigo8};
    background: ${({ theme }) => theme.colors.indigo3};
    color: ${({ theme }) => theme.colors.indigo11};
  }

  &[data-tone="danger"] {
    border-color: ${({ theme }) => theme.colors.statusDangerBorder};
    background: ${({ theme }) => theme.colors.statusDangerSurface};
    color: ${({ theme }) => theme.colors.statusDangerText};
  }

  &[data-tone="success"] {
    border-color: ${({ theme }) => theme.colors.statusSuccessBorder};
    background: ${({ theme }) => theme.colors.statusSuccessSurface};
    color: ${({ theme }) => theme.colors.statusSuccessText};
  }
`

export const SubtleMetaGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`

export const SubtleMetaItem = styled.div`
  display: grid;
  gap: 0.18rem;
  padding: 0.72rem 0.8rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.76rem;
    font-weight: 700;
  }

  strong {
    font-size: 0.9rem;
    overflow-wrap: anywhere;
  }
`

export const CompactList = styled.div`
  display: grid;
`

export const CompactListItem = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.82rem 0.95rem;
  border-top: 1px solid ${({ theme }) => theme.colors.gray5};

  &:first-of-type {
    border-top: 0;
  }

  div {
    min-width: 0;
    display: grid;
    gap: 0.16rem;
  }

  strong {
    font-size: 0.9rem;
  }

  span,
  small {
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  @media (max-width: 760px) {
    flex-direction: column;
  }
`

export const CompactCodeList = styled.div`
  display: grid;
  gap: 0.42rem;
  padding: 0 0.95rem 0.95rem;

  code {
    display: block;
    border-radius: 10px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    padding: 0.62rem 0.72rem;
    font-size: 0.82rem;
    overflow-wrap: anywhere;
  }
`

export const ExecutionLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 0.9rem;

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
`

export const ExecutionMain = styled.div`
  display: grid;
  gap: 0.9rem;
`

export const ExecutionRail = styled(AdminStickyRail)`
  gap: 0.9rem;
`

export const ActionGroupCard = styled(AdminRailCard)`
  gap: 0.8rem;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "light" ? "rgba(255, 255, 255, 0.82)" : "rgba(24, 24, 24, 0.86)"};
`

export const CardSectionHeading = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.8rem;

  h3,
  strong {
    display: block;
    margin: 0;
    font-size: 0.98rem;
    letter-spacing: -0.02em;
  }
`

export const ActionToneBadge = styled(AdminStatusPill)`
  background: ${({ theme }) => theme.colors.gray3};
  color: ${({ theme }) => theme.colors.gray11};

  &[data-tone="write"] {
    border-color: ${({ theme }) => theme.colors.accentBorder};
    background: ${({ theme }) => theme.colors.accentSurfaceSubtle};
    color: ${({ theme }) => theme.colors.accentLink};
  }

  &[data-tone="danger"] {
    border-color: ${({ theme }) => theme.colors.statusDangerBorder};
    background: ${({ theme }) => theme.colors.statusDangerSurface};
    color: ${({ theme }) => theme.colors.statusDangerText};
  }

  &[data-tone="read"] {
    color: ${({ theme }) => theme.colors.gray10};
  }
`

export const ActionList = styled.div`
  display: grid;
  gap: 0.55rem;
`

export const ActionRowButton = styled(AdminActionCardButton)``

export const ActionRowLink = styled.a`
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0.78rem 0.9rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.86rem;
  font-weight: 700;
  text-decoration: none;

  &:hover {
    border-color: ${({ theme }) => theme.colors.gray7};
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accentBorder};
    box-shadow: ${({ theme }) => adminInteractiveFocusRing(theme)};
  }
`

export const FieldStack = styled.div`
  display: grid;
  gap: 0.72rem;
`

export const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.82rem;

  .wide {
    grid-column: 1 / -1;
  }

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`

export const FieldBox = styled.div`
  display: grid;
  gap: 0.4rem;
`

export const FieldLabel = styled.label`
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.82rem;
  font-weight: 700;
`

export const Input = styled.input`
  width: 100%;
  min-height: 44px;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  padding: 0.82rem 0.92rem;
  font-size: 0.95rem;
`

export const TextArea = styled.textarea`
  width: 100%;
  min-height: 110px;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  padding: 0.82rem 0.92rem;
  font-size: 0.95rem;
  line-height: 1.6;
  resize: vertical;
`

export const PrimaryButton = styled.button`
  min-height: 42px;
  padding: 0 0.95rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.accentControl};
  background: ${({ theme }) => theme.colors.accentControl};
  color: ${({ theme }) => theme.colors.accentControlText};
  font-size: 0.84rem;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    opacity: 0.56;
    cursor: not-allowed;
  }
`

export const DangerPanel = styled.div`
  display: grid;
  gap: 0.9rem;
  padding: 0.96rem;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.statusDangerBorder};
  background: rgba(239, 68, 68, 0.06);
`

export const SandboxSection = styled.div`
  display: grid;
  gap: 0.65rem;
`

export const SandboxHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.8rem;

  h3 {
    margin: 0;
    font-size: 0.94rem;
  }
`

export const DangerActionRow = styled.div`
  display: grid;
  gap: 0.7rem;
  padding-top: 0.3rem;
  border-top: 1px solid ${({ theme }) => theme.colors.statusDangerBorder};
`

export const ConfirmDeleteRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.55rem;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.82rem;
  line-height: 1.5;

  input {
    width: 16px;
    height: 16px;
  }
`

export const DangerButton = styled.button`
  width: fit-content;
  min-height: 42px;
  padding: 0 0.95rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.statusDangerBorder};
  background: transparent;
  color: ${({ theme }) => theme.colors.statusDangerText};
  font-size: 0.84rem;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

export const ResultFilterRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
`

export const ResultFilterButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 36px;
  padding: 0 0.8rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.78rem;
  font-weight: 800;
  cursor: pointer;

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.74rem;
  }

  &[data-active="true"] {
    border-color: ${({ theme }) => theme.colors.accentBorder};
    background: ${({ theme }) => theme.colors.accentSurfaceSubtle};
    color: ${({ theme }) => theme.colors.accentLink};
  }
`

export const ResultsLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) 320px;
  gap: 0.9rem;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
  }
`

export const ResultPrimaryCard = styled.div`
  display: grid;
  gap: 0.8rem;
  padding: 0.96rem;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
`

export const ResultTop = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.8rem;

  small {
    display: block;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  strong {
    display: block;
    margin-top: 0.18rem;
    font-size: 1.08rem;
    letter-spacing: -0.02em;
  }
`

export const ResultBadgeRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.45rem;
`

export const ResultMetaGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`

export const ResultSummary = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.gray12};
  line-height: 1.65;
`

export const ResultHistoryCard = styled.div`
  display: grid;
  gap: 0.7rem;
  padding: 0.96rem;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
`

export const HistoryList = styled.div`
  display: grid;
  gap: 0.5rem;
`

export const HistoryButton = styled.button`
  text-align: left;
  display: grid;
  gap: 0.14rem;
  padding: 0.72rem 0.8rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};
  cursor: pointer;

  &[data-active="true"] {
    border-color: ${({ theme }) => theme.colors.accentBorder};
    background: ${({ theme }) => theme.colors.accentSurfaceSubtle};
  }

  span {
    font-size: 0.84rem;
    font-weight: 760;
  }

  small {
    color: ${({ theme }) => theme.colors.gray10};
  }
`

export const ResultPanel = styled.pre`
  margin: 0 0.95rem 0.95rem;
  min-height: 180px;
  padding: 0.95rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  overflow: auto;
  line-height: 1.6;
  font-size: 0.82rem;
`

export const EmptyResultState = styled.p`
  margin: 0;
  padding: 1rem;
  border-radius: 16px;
  border: 1px dashed ${({ theme }) => theme.colors.gray6};
  color: ${({ theme }) => theme.colors.gray10};
  line-height: 1.6;
`
