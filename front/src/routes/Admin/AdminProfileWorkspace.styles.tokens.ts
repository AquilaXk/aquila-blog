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
  adminBorder,
  adminBorderStrong,
  adminControlText,
  adminGold,
  adminSurfaceMuted,
  adminSurfaceRaised,
  adminTeal,
  adminTealBorder,
  adminTealBorderHover,
  adminTealHover,
  adminTextPrimary,
  adminTextSecondary,
} from "src/routes/Admin/adminColorTokens"

export const Main = styled.main`
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 1.05rem 1.45rem 2.8rem;
  display: grid;
  gap: 1rem;

  @media (max-width: 760px) {
    padding: 0.85rem 0.82rem calc(2rem + env(safe-area-inset-bottom, 0px));
  }
`

export const BaseButton = styled.button`
  min-height: 38px;
  border-radius: 4px;
  border: 1px solid ${adminBorder};
  background: ${adminSurfaceRaised};
  color: ${adminTextSecondary};
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
    border-color: ${adminBorderStrong};
    background: ${adminSurfaceMuted};
    color: ${adminTextPrimary};
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
  border-color: ${adminTealBorder};
  background: ${adminTeal};
  color: ${adminControlText};

  &:hover:not(:disabled) {
    border-color: ${adminTealBorderHover};
    background: ${adminTealHover};
    color: ${adminControlText};
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
  color: ${adminGold};
  font-size: 0.8rem;
  font-weight: 700;
  text-decoration: none;
`
