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

