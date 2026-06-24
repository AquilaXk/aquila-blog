import styled from "@emotion/styled"
import {
  AdminRailCard,
  AdminSectionHeading,
  AdminTextActionButton,
  AdminWorkspaceHero,
  AdminWorkspaceHeroCopy,
} from "./AdminSurfacePrimitives"

export const AdminPostsWorkspaceMainSections = Symbol("AdminPostsWorkspaceMainSections")

export const Main = styled.main`
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 1.05rem 1.45rem 2.4rem;
  display: grid;
  gap: 1rem;

  @media (max-width: 767px) {
    gap: 0.9rem;
    padding: 0.85rem 0.82rem 2rem;
  }
`

export const HeroSection = styled(AdminWorkspaceHero)``

export const PostsHeroCopy = styled(AdminWorkspaceHeroCopy)`
  min-width: 0;

  h1 {
    max-width: 100%;
    overflow-wrap: anywhere;
  }
`

export const WorkspaceBody = styled.div`
  display: grid;
  gap: 1rem;
`

export const WorkspaceMain = styled.div`
  display: grid;
  gap: 1rem;
`

export const PrimaryCta = styled.button`
  border: 0;
  background: transparent;
  color: ${({ theme }) => (theme.scheme === "light" ? "#005fc4" : "#7cc4ff")};
  padding: 0;
  font-size: 1rem;
  font-weight: 800;
  cursor: pointer;
`

export const ListSection = styled.section`
  display: grid;
  gap: 0.8rem;
`

export const SectionHeading = styled(AdminSectionHeading)`
  h2 {
    font-size: 1.22rem;
    letter-spacing: -0.03em;
  }
`

export const ListMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
  }
`

export const GhostButton = styled(AdminTextActionButton)`
  font-size: 0.88rem;
  font-weight: 700;
`

export const MutedText = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.gray10};
  line-height: 1.55;
`

export const DeferredPanelPlaceholder = styled(AdminRailCard)<{ "data-size": "activity" }>`
  display: grid;
  gap: 0.3rem;
  padding: 0.92rem 1rem;
  border-radius: 2px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};
  min-height: 92px;

  strong {
    font-size: 0.9rem;
    letter-spacing: -0.01em;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
    line-height: 1.55;
  }
`

export const RecentActionPanel = styled(AdminRailCard)`
  gap: 0.72rem;
  padding: 0.92rem 1rem;
  border-radius: 2px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};

  .panelHead {
    display: grid;
    gap: 0.18rem;
  }

  .panelHead > strong {
    font-size: 0.9rem;
    letter-spacing: -0.01em;
  }
`

export const RecentActionList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.58rem;

  li {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.72rem;
    padding: 0.8rem 0.88rem;
    border-radius: 2px;
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    background: ${({ theme }) => theme.colors.gray1};
  }

  li[data-tone="error"] {
    border-color: ${({ theme }) => theme.colors.statusDangerBorder};
    background: ${({ theme }) => theme.colors.statusDangerSurface};
  }

  .copy {
    min-width: 0;
    display: grid;
    gap: 0.16rem;
  }

  .headline {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.48rem;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.86rem;
    font-weight: 800;
  }

  .stateLabel {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 0 0.56rem;
    border-radius: 2px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: -0.01em;
  }

  li[data-tone="error"] .stateLabel {
    border-color: ${({ theme }) => theme.colors.statusDangerBorder};
    background: ${({ theme }) => theme.colors.statusDangerSurface};
    color: ${({ theme }) => theme.colors.statusDangerText};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
    line-height: 1.5;
  }

  .time {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.74rem;
    font-weight: 700;
    white-space: nowrap;
  }

  @media (max-width: 767px) {
    li {
      display: grid;
    }

    .time {
      white-space: normal;
    }
  }
`
