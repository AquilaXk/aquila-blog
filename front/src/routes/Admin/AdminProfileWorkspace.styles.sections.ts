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
import { BaseButton, PublishButton } from "./AdminProfileWorkspace.styles.tokens"


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
