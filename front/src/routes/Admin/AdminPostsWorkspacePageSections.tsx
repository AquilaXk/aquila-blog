import styled from "@emotion/styled"
import {
  AdminRailCard,
  AdminWorkspaceHero,
  AdminWorkspaceHeroCopy,
} from "./AdminSurfacePrimitives"

export const AdminPostsWorkspaceMainSections = Symbol("AdminPostsWorkspaceMainSections")

export const Main = styled.main`
  min-height: 100vh;
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 2.55rem 2.125rem 4.375rem;
  display: grid;
  align-content: start;
  gap: 1.5rem;
  background: ${({ theme }) => theme.colors.gray1};

  @media (max-width: 767px) {
    gap: 1rem;
    padding: 1rem 0.82rem 2rem;
  }
`

export const HeroSection = styled(AdminWorkspaceHero)`
  padding: 0;
  border: 0;
  background: transparent;
`

export const PostsHeroCopy = styled(AdminWorkspaceHeroCopy)`
  min-width: 0;

  h1 {
    max-width: 100%;
    overflow-wrap: anywhere;
  }

  > span {
    color: ${({ theme }) => theme.colors.blue11};
    font-size: 0.62rem;
    font-weight: 820;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 1rem;
    line-height: 1.5;
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
  border-radius: 2px;
  background: ${({ theme }) => theme.colors.blue11};
  color: ${({ theme }) => theme.colors.gray1};
  min-height: 38px;
  padding: 0 0.95rem;
  font-size: 0.82rem;
  font-weight: 800;
  cursor: pointer;
`

export const ListSection = styled.section`
  display: grid;
  gap: 0.9rem;
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
