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


export const WorkspaceHero = styled(AdminWorkspaceHero)``

export const WorkspaceShell = styled.section`
  display: grid;
  grid-template-columns: 184px minmax(0, 1fr) 288px;
  gap: 0.85rem;
  align-items: start;

  @media (max-width: 1480px) {
    grid-template-columns: minmax(0, 1fr);
  }

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`

export const SectionRail = styled(AdminWorkspaceSectionNav)`
  @media (max-width: 1480px) {
    position: static;
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    padding-bottom: 0.2rem;
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

  @media (min-width: 1481px) {
    display: grid;
    gap: 0.24rem;
  }
`

export const SectionRailButton = styled(AdminWorkspaceSectionNavButton)`
  @media (max-width: 760px) {
    min-height: 36px;
    padding: 0 0.78rem;
    font-size: 0.8rem;
  }

  @media (min-width: 1481px) {
    width: 100%;
    min-height: 46px;
    justify-content: flex-start;
    padding: 0.78rem 0.94rem;
    border-radius: 16px;
  }
`

export const EditorColumn = styled.div`
  display: grid;
  gap: 0.68rem;
`

export const EditorPaneHeader = styled(AdminPaneHeader)`
  .titleRow {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
`

export const SectionStateBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1.8rem;
  padding: 0 0.62rem;
  border-radius: 999px;
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
    border-color: #6d6040;
    color: #d0b46c;
    background: #2d291a;
  }

  &[data-tone="synced"] {
    border-color: ${({ theme }) => theme.colors.green7};
    color: ${({ theme }) => theme.colors.green10};
    background: ${({ theme }) => theme.colors.green2};
  }
`

export const EditorSurface = styled(AdminSubtleCard)`
  padding: 0.96rem 1rem 1.02rem;
  display: grid;
  gap: 0.88rem;
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
  justify-items: center;
  gap: 0.58rem;
  padding: 0.92rem;
  border-radius: 18px;
  background: ${({ theme }) => theme.colors.gray2};
  border: 1px solid ${({ theme }) => theme.colors.gray7};

  .avatarPreview {
    width: 88px;
    height: 88px;
    border-radius: 999px;
    overflow: hidden;
  }

  .avatarMeta {
    display: grid;
    gap: 0.14rem;
    text-align: center;
  }

  .avatarMeta strong {
    color: ${({ theme }) => theme.colors.gray12};
  }

  .avatarMeta span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
  }
`

export const FieldSectionCard = styled.div`
  display: grid;
  gap: 0.82rem;
  padding: 1rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray1};

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
    font-size: 1.02rem;
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
  border-radius: 12px;
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
    box-shadow: 0 0 0 3px rgba(208, 180, 108, 0.18);
  }
`

export const TextArea = styled.textarea`
  width: 100%;
  min-height: 132px;
  border-radius: 14px;
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
    box-shadow: 0 0 0 3px rgba(208, 180, 108, 0.18);
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
  border-radius: 16px;
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
  border-radius: 16px;
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
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  background: ${({ theme }) => theme.colors.gray2};
`

export const SegmentButton = styled.button`
  min-height: 34px;
  padding: 0 0.82rem;
  border-radius: 999px;
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
