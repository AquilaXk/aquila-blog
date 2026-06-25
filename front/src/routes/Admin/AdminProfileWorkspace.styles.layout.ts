import styled from "@emotion/styled"
import {
  AdminInfoPanelCard,
  AdminPaneHeader,
  AdminRailCard,
  AdminStickyRail,
  AdminSubtleCard,
  AdminWorkspaceActionDock,
  AdminWorkspaceHero,
  AdminWorkspaceSectionNav,
  AdminWorkspaceSectionNavButton,
} from "src/routes/Admin/AdminSurfacePrimitives"
import {
  adminGold,
  adminFocusRing,
  adminWarningBadgeBorder,
  adminWarningBadgeSurface,
  adminWarningBadgeText,
} from "src/routes/Admin/adminColorTokens"


export const WorkspaceHero = styled(AdminWorkspaceHero)`
  padding: 0 0 2.1rem;
  border-bottom: 2px solid ${({ theme }) => theme.colors.gray12};

  > div {
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 3.75rem;
    align-items: start;
  }

  .settingsLabel {
    color: ${adminGold};
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1 {
    margin-top: 0.8rem;
    max-width: 46rem;
    font-size: clamp(2.4rem, 5vw, 3.4rem);
    line-height: 1.05;
    letter-spacing: -0.06em;
  }

  .settingsHeroDeck {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 1rem;
    line-height: 1.7;
  }

  @media (max-width: 900px) {
    padding-bottom: 1.4rem;

    > div {
      grid-template-columns: 1fr;
      gap: 1.25rem;
    }

    h1 {
      font-size: clamp(2rem, 10vw, 2.65rem);
    }
  }
`

export const WorkspaceShell = styled.section`
  display: grid;
  grid-template-columns: minmax(180px, 210px) minmax(0, 760px) minmax(220px, 288px);
  gap: clamp(1.25rem, 2.6vw, 3.125rem);
  align-items: start;

  @media (max-width: 1180px) {
    grid-template-columns: minmax(0, 1fr);
    gap: 1.2rem;
  }

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`

export const SectionRail = styled(AdminWorkspaceSectionNav)`
  gap: 0;
  border-top: 1px solid ${({ theme }) => theme.colors.gray12};

  @media (max-width: 1180px) {
    position: static;
    display: flex;
    gap: 0.38rem;
    overflow-x: auto;
    padding-bottom: 0.2rem;
    border-top: 0;
    scroll-snap-type: x proximity;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  @media (max-width: 760px) {
    flex-wrap: wrap;
    overflow-x: visible;
    padding-bottom: 0;
    scroll-snap-type: none;
  }

  @media (min-width: 1181px) {
    display: grid;
  }
`

export const SectionRailButton = styled(AdminWorkspaceSectionNavButton)`
  border-left: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray5};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray10};

  &[data-active="true"] {
    border-left: 0;
    border-bottom-color: ${({ theme }) => theme.colors.gray12};
    background: transparent;
    color: ${({ theme }) => theme.colors.gray12};
    font-weight: 850;
  }

  @media (max-width: 760px) {
    min-height: 36px;
    padding: 0 0.78rem;
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    font-size: 0.8rem;
  }

  @media (min-width: 1181px) {
    width: 100%;
    min-height: 47px;
    justify-content: flex-start;
    padding: 0.82rem 0;
    border-radius: 0;
  }
`

export const EditorColumn = styled.div`
  display: grid;
  gap: 0.68rem;
`

export const EditorPaneHeader = styled(AdminPaneHeader)`
  padding-bottom: 1rem;

  .settingsPanelLabel {
    color: ${adminGold};
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .titleRow {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  h2 {
    font-size: 1.88rem;
    line-height: 1.15;
    letter-spacing: -0.04em;
  }
`

export const SectionStateBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1.8rem;
  padding: 0 0.62rem;
  border-radius: 2px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  color: ${({ theme }) => theme.colors.gray10};
  background: ${({ theme }) => theme.colors.gray2};
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: -0.01em;

  &[data-tone="dirty"] {
    border-color: ${({ theme }) => theme.colors.orange7};
    color: ${({ theme }) => theme.colors.orange10};
    background: ${({ theme }) => theme.colors.orange2};
  }

  &[data-tone="published"] {
    border-color: ${adminWarningBadgeBorder()};
    color: ${adminWarningBadgeText()};
    background: ${adminWarningBadgeSurface()};
  }

  &[data-tone="synced"] {
    border-color: ${({ theme }) => theme.colors.green7};
    color: ${({ theme }) => theme.colors.green10};
    background: ${({ theme }) => theme.colors.green2};
  }
`

export const EditorSurface = styled(AdminSubtleCard)`
  max-width: 760px;
  padding: 0;
  display: grid;
  gap: 0.9rem;
`

export const SectionStack = styled.div`
  display: grid;
  gap: 1.1rem;

  > * + * {
    border-top: 1px solid ${({ theme }) => theme.colors.gray5};
    padding-top: 1.1rem;
  }
`

export const AvatarWorkspaceCard = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;
  padding: 1.35rem 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray5};
  background: transparent;
  border-radius: 0;

  .avatarPreview {
    width: 88px;
    height: 88px;
    border-radius: 999px;
    overflow: hidden;
  }

  .avatarMeta {
    display: grid;
    gap: 0.14rem;
    text-align: left;
  }

  .avatarMeta strong {
    color: ${({ theme }) => theme.colors.gray12};
  }

  .avatarMeta span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
  }

  @media (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr);
    justify-items: start;
  }
`

export const FieldSectionCard = styled.div`
  display: grid;
  gap: 0.82rem;
  padding: 1.35rem 0;
  border-radius: 0;
  border: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray5};
  background: transparent;

  @media (max-width: 760px) {
    padding: 0.9rem;
  }
`

export const SectionBlockHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.8rem;

  h3 {
    margin: 0;
    font-size: 0.95rem;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0.12rem 0 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
    line-height: 1.45;
  }

  @media (max-width: 760px) {
    flex-direction: column;
  }
`

export const FieldGrid = styled.div`
  display: grid;
  gap: 0.82rem;

  &[data-columns="2"] {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 900px) {
    &[data-columns="2"] {
      grid-template-columns: 1fr;
    }
  }
`

export const FieldBox = styled.label`
  display: grid;
  gap: 0.46rem;

  &[data-span="full"] {
    grid-column: 1 / -1;
  }
`

export const FieldLabel = styled.label`
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.8rem;
  font-weight: 800;
`

export const Input = styled.input`
  width: 100%;
  min-height: 42px;
  border-radius: 2px;
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  background: ${({ theme }) => theme.colors.gray3};
  color: ${({ theme }) => theme.colors.gray12};
  padding: 0.82rem 0.95rem;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;

  &::placeholder {
    color: ${({ theme }) => theme.colors.gray9};
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accentBorder};
    box-shadow: ${({ theme }) => adminFocusRing(theme)};
  }
`

export const TextArea = styled.textarea`
  width: 100%;
  min-height: 132px;
  border-radius: 2px;
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  background: ${({ theme }) => theme.colors.gray3};
  color: ${({ theme }) => theme.colors.gray12};
  padding: 0.92rem 1rem;
  resize: vertical;
  line-height: 1.6;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;

  &::placeholder {
    color: ${({ theme }) => theme.colors.gray9};
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accentBorder};
    box-shadow: ${({ theme }) => adminFocusRing(theme)};
  }
`

export const AboutSectionList = styled.div`
  display: grid;
  gap: 0.78rem;
`

export const AboutSectionCard = styled.div`
  display: grid;
  gap: 0.72rem;
  padding: 0.9rem;
  border-radius: 2px;
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  background: ${({ theme }) => theme.colors.gray2};
`

export const AboutProjectList = styled(AboutSectionList)``

export const AboutProjectCard = styled(AboutSectionCard)``

export const AboutSectionCardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.72rem;

  > div:first-of-type {
    display: grid;
    gap: 0.24rem;
  }

  > div:first-of-type span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.76rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  label {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.8rem;
  }

  @media (max-width: 760px) {
    flex-direction: column;
  }
`

export const ItemList = styled.div`
  display: grid;
  gap: 0.56rem;
`

export const ItemRow = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.58rem;
  align-items: center;

  .bullet {
    color: ${({ theme }) => theme.colors.gray10};
    font-weight: 900;
  }

  @media (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr);

    .bullet {
      display: none;
    }
  }
`

export const InlineActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.42rem;

  .reorderButton {
    @media (min-width: 901px) {
      display: none;
    }
  }
`

export const EmptyStateCard = styled.div`
  padding: 1rem;
  border-radius: 2px;
  border: 1px dashed ${({ theme }) => theme.colors.gray7};
  background: ${({ theme }) => theme.colors.gray2};
  display: grid;
  gap: 0.28rem;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.55;
  }
`

export const SegmentedControl = styled.div`
  display: inline-flex;
  gap: 0.36rem;
  padding: 0.25rem;
  border-radius: 2px;
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  background: ${({ theme }) => theme.colors.gray2};
`

export const SegmentButton = styled.button`
  min-height: 34px;
  padding: 0 0.82rem;
  border-radius: 2px;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray10};
  font-weight: 700;

  &[data-active="true"] {
    background: ${({ theme }) => theme.colors.gray1};
    color: ${({ theme }) => theme.colors.gray12};
  }
`

export { LinkManagerHeader, LinkCardList, LinkRowCard, DragHandleButton, IconPickerField, IconPickerButton, IconPreview, IconPickerCopy, IconPickerPanel, IconOptionButton, IconOptionText, LinkInputs } from "./AdminProfileWorkspace.styles.links"
