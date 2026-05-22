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

