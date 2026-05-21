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

export const Main = styled.main`
  max-width: 1420px;
  margin: 0 auto;
  padding: 1.6rem 1rem 2.8rem;
  display: grid;
  gap: 1rem;

  @media (max-width: 760px) {
    padding-bottom: calc(2rem + env(safe-area-inset-bottom, 0px));
  }
`

export const BaseButton = styled.button`
  min-height: 38px;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0.7rem 0.96rem;
  font-size: 0.92rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.gray8};
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
    transform: translateY(-1px);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.72;
    transform: none;
  }
`

export const GhostButton = styled(BaseButton)`
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};

  &:hover:not(:disabled) {
    border-color: transparent;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray12};
    transform: none;
  }
`

export const PrimaryButton = styled(BaseButton)`
  border-color: ${({ theme }) => theme.colors.blue8};
  background: ${({ theme }) => theme.colors.blue3};
  color: ${({ theme }) => theme.colors.blue11};

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.blue9};
    background: ${({ theme }) => theme.colors.blue4};
    color: ${({ theme }) => theme.colors.blue12};
  }
`

export const PublishButton = styled(PrimaryButton)`
  border-color: ${({ theme }) => theme.colors.green8};
  background: ${({ theme }) => theme.colors.green3};
  color: ${({ theme }) => theme.colors.green11};

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.green9};
    background: ${({ theme }) => theme.colors.green4};
    color: ${({ theme }) => theme.colors.green12};
  }
`

export const MiniButton = styled(BaseButton)`
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.8rem;

  &:hover:not(:disabled) {
    border-color: transparent;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray12};
    transform: none;
  }
`

export const DangerButton = styled(MiniButton)`
  color: ${({ theme }) => theme.colors.red11};

  &:hover:not(:disabled) {
    background: transparent;
    color: ${({ theme }) => theme.colors.red11};
  }
`

export const PreviewAnchor = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  min-height: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.blue9};
  font-size: 0.8rem;
  font-weight: 700;
  text-decoration: none;
`

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

  @media (min-width: 1481px) {
    display: grid;
    gap: 0.24rem;
  }
`

export const SectionRailButton = styled(AdminWorkspaceSectionNavButton)`
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
    border-color: ${({ theme }) => theme.colors.blue7};
    color: ${({ theme }) => theme.colors.blue10};
    background: ${({ theme }) => theme.colors.blue2};
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
  border-radius: 22px;
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
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.blue4};
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
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.blue4};
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

export const LinkManagerHeader = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.8rem;
  align-items: center;

  > div {
    display: grid;
    gap: 0.16rem;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
  }

  @media (max-width: 760px) {
    flex-direction: column;
    align-items: flex-start;
  }
`

export const LinkCardList = styled.div`
  display: grid;
  gap: 0.72rem;
`

export const LinkRowCard = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: minmax(184px, 200px) minmax(0, 1fr) auto;
  gap: 0.72rem;
  padding: 0.9rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  background: ${({ theme }) => theme.colors.gray2};
  transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease;

  &[data-dragging="true"] {
    opacity: 0.78;
    transform: scale(0.995);
    border-color: ${({ theme }) => theme.colors.accentBorder};
  }

  &[data-drop-target="true"] {
    border-color: ${({ theme }) => theme.colors.blue8};
    background: ${({ theme }) => theme.colors.accentSurfaceSubtle};
  }

  &[data-drop-target="true"]::before {
    content: "";
    position: absolute;
    left: 0.72rem;
    right: 0.72rem;
    height: 3px;
    border-radius: 999px;
    background: ${({ theme }) => theme.colors.blue8};
    box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.2);
  }

  &[data-drop-target="true"][data-drop-position="before"]::before {
    top: -2px;
  }

  &[data-drop-target="true"][data-drop-position="after"]::before {
    bottom: -2px;
  }

  .linkActions {
    align-self: flex-start;
    justify-content: flex-end;
    gap: 0.38rem;
    min-width: 0;
  }

  .linkActionButtons {
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .linkActionButtons > * {
    white-space: nowrap;
  }

  @media (max-width: 1440px) {
    grid-template-columns: minmax(184px, 220px) minmax(0, 1fr);

    .linkActions {
      grid-column: 1 / -1;
      justify-content: flex-start;
    }

    .linkActionButtons {
      justify-content: flex-start;
    }
  }

  @media (max-width: 1080px) {
    grid-template-columns: 1fr;

    .linkActions {
      justify-content: flex-start;
    }
  }
`

export const DragHandleButton = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.34rem;
  min-height: 32px;
  padding: 0 0.72rem;
  border-radius: 999px;
  border: 1px dashed ${({ theme }) => theme.colors.gray6};
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.78rem;
  font-weight: 700;
  cursor: grab;
  user-select: none;

  @media (max-width: 900px) {
    display: none;
  }
`

export const IconPickerField = styled.div`
  position: relative;
  display: grid;
  gap: 0.46rem;
`

export const IconPickerButton = styled.button`
  min-height: 42px;
  padding: 0.7rem 0.82rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.62rem;
  align-items: center;
  color: ${({ theme }) => theme.colors.gray12};
`

export const IconPreview = styled.span<{ "data-compact"?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${({ ["data-compact"]: compact }) => (compact ? "2rem" : "2.4rem")};
  height: ${({ ["data-compact"]: compact }) => (compact ? "2rem" : "2.4rem")};
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 1rem;
`

export const IconPickerCopy = styled.span`
  display: grid;
  gap: 0.08rem;
  text-align: left;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.86rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.72rem;
  }
`

export const IconPickerPanel = styled.div`
  position: absolute;
  top: calc(100% + 0.36rem);
  left: 0;
  z-index: 10;
  width: min(100%, 280px);
  max-height: 280px;
  overflow: auto;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.34);
  padding: 0.4rem;
  display: grid;
  gap: 0.32rem;
`

export const IconOptionButton = styled.button`
  width: 100%;
  padding: 0.56rem;
  border-radius: 12px;
  border: 1px solid transparent;
  background: transparent;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.58rem;
  align-items: center;

  &[data-selected="true"] {
    border-color: ${({ theme }) => theme.colors.blue8};
    background: ${({ theme }) => theme.colors.blue3};
  }
`

export const IconOptionText = styled.span`
  display: grid;
  gap: 0.1rem;
  text-align: left;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.84rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.72rem;
  }
`

export const LinkInputs = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.72rem;
  min-width: 0;

  @media (max-width: 1440px) {
    grid-template-columns: 1fr;
  }

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`

export const PreviewRail = styled(AdminStickyRail)`
  top: calc(var(--app-header-height, 64px) + 0.8rem);

  @media (max-width: 1360px) {
    position: static;
    top: auto;
  }

  @media (max-width: 980px) {
    display: none;
  }
`

export const PreviewCardShell = styled(AdminRailCard)``

export const PreviewHeader = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.72rem;
  align-items: flex-start;

  > div {
    display: grid;
    gap: 0;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.98rem;
    font-weight: 780;
    letter-spacing: -0.02em;
  }

  @media (max-width: 760px) {
    flex-direction: column;
    align-items: flex-start;
  }
`

export const PreviewHeaderActions = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
`

export const PreviewToggleButton = styled.button`
  display: none;

  @media (max-width: 760px) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 34px;
    padding: 0 0.82rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray1};
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.8rem;
    font-weight: 700;
  }
`

export const PreviewBody = styled.div<{ "data-expanded"?: boolean }>`
  display: grid;

  @media (max-width: 760px) {
    display: ${({ ["data-expanded"]: expanded }) => (expanded ? "grid" : "none")};
  }
`

export const EditorActionDock = styled(AdminWorkspaceActionDock)``

export const DockSecondaryButton = styled(BaseButton)`
  min-height: 40px;
  padding: 0 1rem;
  border-radius: 999px;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
`

export const DockPrimaryButton = styled(PublishButton)`
  min-height: 40px;
  padding: 0 1rem;
  border-radius: 999px;
`

export const PreviewViewport = styled(AdminInfoPanelCard)`
  min-height: 196px;
  padding: 1rem;
`

export const PreviewProfileCard = styled.div`
  display: grid;
  gap: 0.68rem;

  .identityRow {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.82rem;
    align-items: center;
  }

  .identityCopy {
    display: grid;
    gap: 0.18rem;
  }

  .avatar {
    width: 72px;
    height: 72px;
    border-radius: 999px;
    overflow: hidden;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1rem;
    line-height: 1.3;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-weight: 700;
    font-size: 0.84rem;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.5;
    font-size: 0.9rem;
  }
`

export const PreviewAboutCard = styled.div`
  display: grid;
  gap: 0.68rem;

  header {
    display: grid;
    gap: 0.12rem;
  }

  header span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.76rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  header strong,
  h4 {
    color: ${({ theme }) => theme.colors.gray12};
    margin: 0;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.6;
  }

  .sections {
    display: grid;
    gap: 0.7rem;
  }

  section {
    display: grid;
    gap: 0.3rem;
  }

  ul {
    margin: 0;
    padding-left: 1rem;
    color: ${({ theme }) => theme.colors.gray11};
    display: grid;
    gap: 0.18rem;
  }
`

export const PreviewHomeCard = styled.div`
  display: grid;
  gap: 0.48rem;

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.76rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  strong,
  h4 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.58;
  }
`

export const PreviewLinksCard = styled.div`
  display: grid;
  gap: 0.82rem;

  section {
    display: grid;
    gap: 0.4rem;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.42rem;
  }

  li {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    color: ${({ theme }) => theme.colors.gray11};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.55;
  }
`

export const ToastStack = styled.div`
  position: fixed;
  right: 1rem;
  bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
  z-index: 1200;
  display: grid;
  gap: 0.5rem;
  max-width: min(360px, calc(100vw - 2rem));
`

export const ToastCard = styled.div`
  border-radius: 14px;
  padding: 0.78rem 0.9rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  line-height: 1.58;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);

  &[data-tone="success"] {
    border-color: ${({ theme }) => theme.colors.green8};
    background: ${({ theme }) => theme.colors.green3};
    color: ${({ theme }) => theme.colors.green11};
  }

  &[data-tone="error"] {
    border-color: ${({ theme }) => theme.colors.red8};
    background: ${({ theme }) => theme.colors.red3};
    color: ${({ theme }) => theme.colors.red11};
  }

  &[data-tone="loading"] {
    border-color: ${({ theme }) => theme.colors.blue8};
    background: ${({ theme }) => theme.colors.blue3};
    color: ${({ theme }) => theme.colors.blue11};
  }
`

export const ModalNotice = styled(ToastCard)`
  box-shadow: none;
`

export const AvatarFallback = styled.div`
  width: 100%;
  height: 100%;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: ${({ theme }) => theme.colors.gray4};
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 1.52rem;
  font-weight: 800;
`

export const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 2200;
  display: grid;
  place-items: center;
  background: rgba(6, 10, 16, 0.76);
  padding: 1rem;
`

export const ModalCard = styled.section`
  width: min(640px, 100%);
  max-height: min(92vh, 860px);
  overflow: auto;
  border-radius: 20px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.42);
  padding: 1rem;
  display: grid;
  gap: 0.9rem;
`

export const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.82rem;
  align-items: flex-start;

  h2 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0.34rem 0 0;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.58;
  }
`

export const ModalCloseButton = styled.button`
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  display: inline-flex;
  align-items: center;
  justify-content: center;
`

export const ModalConstraintList = styled.ul`
  margin: 0;
  padding-left: 1.1rem;
  display: grid;
  gap: 0.3rem;
  color: ${({ theme }) => theme.colors.gray11};
  line-height: 1.55;
`

export const ModalActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.48rem;
`

export const ModalEditorFrame = styled.div`
  --profile-draft-width: 100%;
  --profile-draft-height: 100%;
  --profile-draft-left: 0%;
  --profile-draft-top: 0%;

  position: relative;
  width: 100%;
  max-width: 360px;
  justify-self: center;
  aspect-ratio: 1 / 1;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  overflow: hidden;
  user-select: none;

  &[data-draggable="true"] {
    cursor: grab;
    touch-action: none;
  }

  &[data-dragging="true"] {
    cursor: grabbing;
  }

  img {
    position: absolute;
    display: block;
    pointer-events: none;
    user-select: none;
    touch-action: none;
    will-change: top, left, width, height;
  }
`

export const ModalSliderWrap = styled.div`
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.62rem;

  label {
    color: ${({ theme }) => theme.colors.gray11};
    font-weight: 700;
  }

  input {
    width: 100%;
  }

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-variant-numeric: tabular-nums;
    min-width: 3.4rem;
    text-align: right;
  }
`

export const ModalEmptyState = styled.div`
  padding: 1rem;
  border-radius: 16px;
  border: 1px dashed ${({ theme }) => theme.colors.gray6};
  color: ${({ theme }) => theme.colors.gray11};
  text-align: center;
`

export const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.48rem;
`
