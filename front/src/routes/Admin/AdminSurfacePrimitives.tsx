import type { Theme } from "@emotion/react"
import styled from "@emotion/styled"

export const adminElevatedSurface = (theme: Theme) =>
  theme.scheme === "light"
    ? "linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(246, 249, 255, 0.94) 100%)"
    : "linear-gradient(180deg, rgba(23, 28, 36, 0.96) 0%, rgba(17, 20, 27, 0.94) 100%)"

export const adminElevatedBorder = (theme: Theme) => theme.colors.gray5

export const adminElevatedShadow = (theme: Theme) =>
  theme.scheme === "light" ? "0 18px 42px rgba(15, 23, 42, 0.06)" : "0 20px 44px rgba(0, 0, 0, 0.2)"

export const adminInteractiveFocusRing = (theme: Theme) =>
  theme.scheme === "light" ? "0 0 0 3px rgba(59, 130, 246, 0.18)" : "0 0 0 3px rgba(96, 165, 250, 0.28)"

export const AdminElevatedCard = styled.section`
  border-radius: 24px;
  border: 1px solid ${({ theme }) => adminElevatedBorder(theme)};
  background: ${({ theme }) => adminElevatedSurface(theme)};
  box-shadow: ${({ theme }) => adminElevatedShadow(theme)};
`

export const AdminPlainCard = styled.section`
  border-radius: 20px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
`

export const AdminSubtleCard = styled.section`
  border-radius: 20px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};
`

export const AdminRailCard = styled(AdminSubtleCard)`
  display: grid;
  gap: 0.78rem;
  padding: 0.92rem;
`

export const AdminStickyRail = styled.aside`
  position: sticky;
  top: calc(var(--app-header-height, 64px) + 0.8rem);
  align-self: start;
  display: grid;
  gap: 0.82rem;
`

export const AdminSectionHeading = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 0.8rem;

  @media (max-width: 760px) {
    flex-direction: column;
    align-items: stretch;
  }
`

export const AdminSectionTitleStack = styled.div`
  min-width: 0;
  display: grid;
  gap: 0.2rem;

  h2,
  h3 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.05rem;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
    line-height: 1.55;
  }
`

export const AdminPaneHeader = styled.div`
  display: grid;
  gap: 0.22rem;
  padding-bottom: 0.95rem;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray5};

  h2 {
    margin: 0;
    font-size: clamp(1.24rem, 2vw, 1.5rem);
    line-height: 1.2;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.86rem;
    line-height: 1.55;
  }
`

export const AdminWorkspaceHero = styled(AdminElevatedCard)`
  display: grid;
  gap: 0.9rem;
  padding: 1.15rem 1.1rem;
`

export const AdminWorkspaceHeroLabel = styled.span`
  display: inline-flex;
  width: fit-content;
  min-height: 28px;
  align-items: center;
  padding: 0 0.72rem;
  border-radius: 999px;
  background: ${({ theme }) =>
    theme.scheme === "light" ? "rgba(59, 130, 246, 0.12)" : "rgba(59, 130, 246, 0.18)"};
  color: ${({ theme }) => theme.colors.blue9};
  font-size: 0.74rem;
  font-weight: 800;
`

export const AdminWorkspaceHeroLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: center;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`

export const AdminWorkspaceHeroCopy = styled.div`
  display: grid;
  gap: 0.42rem;

  h1 {
    margin: 0;
    font-size: clamp(1.65rem, 3vw, 2.1rem);
    line-height: 1.04;
    letter-spacing: -0.04em;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0;
    max-width: 36rem;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.55;
  }
`

export const AdminWorkspaceHeroActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.65rem;

  @media (max-width: 900px) {
    justify-content: flex-start;
  }
`

export const AdminWorkspaceSectionNav = styled(AdminStickyRail)`
  top: calc(var(--app-header-height, 64px) + 1rem);
  gap: 0.55rem;

  @media (max-width: 1180px) {
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
`

export const AdminWorkspaceSectionNavStatus = styled(AdminRailCard)`
  gap: 0.22rem;
  padding: 0.88rem 0.96rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};

  small {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.03em;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.92rem;
    font-weight: 780;
    letter-spacing: -0.02em;
  }

  &[data-jumping="true"] {
    border-color: ${({ theme }) => theme.colors.accentBorder};
    background: ${({ theme }) => theme.colors.accentSurfaceSubtle};
  }

  @media (max-width: 1180px) {
    min-width: 12.5rem;
    flex: 0 0 auto;
    scroll-snap-align: start;
  }
`

export const AdminWorkspaceSectionNavButton = styled.button`
  position: relative;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.42rem;
  min-height: 42px;
  padding: 0 0.9rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.84rem;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: ${({ theme }) => adminInteractiveFocusRing(theme)};
  }

  &[data-active="true"] {
    color: ${({ theme }) => theme.colors.gray12};
    border-color: ${({ theme }) => theme.colors.accentBorder};
    background: ${({ theme }) => theme.colors.accentSurfaceSubtle};
  }

  &[data-freshness="fresh"] {
    border-color: ${({ theme }) => theme.colors.statusSuccessBorder};
  }

  &[data-freshness="aging"] {
    border-color: ${({ theme }) => theme.colors.orange7};
  }

  &[data-freshness="stale"] {
    border-color: ${({ theme }) => theme.colors.gray7};
  }

  &[data-freshness]::before {
    content: "";
    position: absolute;
    left: 0;
    top: 7px;
    bottom: 7px;
    width: 3px;
    border-radius: 999px;
    background: ${({ theme }) => theme.colors.gray7};
  }

  &[data-freshness="fresh"]::before {
    background: ${({ theme }) => theme.colors.statusSuccessBorder};
  }

  &[data-freshness="aging"]::before {
    background: ${({ theme }) => theme.colors.orange8};
  }

  &[data-freshness="stale"]::before {
    background: ${({ theme }) => theme.colors.gray8};
  }

  &[data-tone="danger"] {
    border-color: ${({ theme }) => theme.colors.statusDangerBorder};
    color: ${({ theme }) => theme.colors.statusDangerText};
  }

  @media (max-width: 1180px) {
    scroll-snap-align: start;
  }
`

export const AdminWorkspaceActionDock = styled.div`
  display: grid;
  justify-items: stretch;
`

export const AdminWorkspaceActionDockInner = styled.div`
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.65rem;
  padding: 0.7rem 0.9rem;
  border-radius: 20px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};

  @media (max-width: 760px) {
    justify-content: space-between;
  }
`

export const AdminInfoList = styled.div`
  display: grid;
  gap: 0.6rem;
`

export const AdminInfoLinkCard = styled.a<{ $withIcon?: boolean }>`
  display: grid;
  grid-template-columns: ${({ $withIcon = true }) => ($withIcon ? "auto minmax(0, 1fr)" : "minmax(0, 1fr)")};
  gap: ${({ $withIcon = true }) => ($withIcon ? "0.7rem" : "0.18rem")};
  align-items: center;
  padding: 0.82rem 0.88rem;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "light" ? "rgba(255, 255, 255, 0.84)" : "rgba(31, 31, 31, 0.88)"};
  color: inherit;
  text-decoration: none;
  min-width: 0;
  transition:
    border-color 0.18s ease,
    transform 0.18s ease,
    box-shadow 0.18s ease;

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: ${({ theme }) => adminInteractiveFocusRing(theme)};
  }

  .iconWrap {
    display: ${({ $withIcon = true }) => ($withIcon ? "grid" : "none")};
    width: 2.35rem;
    height: 2.35rem;
    border-radius: 14px;
    place-items: center;
    background: ${({ theme }) =>
      theme.scheme === "light" ? "rgba(59, 130, 246, 0.1)" : "rgba(59, 130, 246, 0.18)"};
    color: ${({ theme }) => theme.colors.blue9};
  }

  .copy {
    min-width: 0;
    display: grid;
    gap: 0.12rem;
  }

  .copy strong,
  > strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.86rem;
    font-weight: 780;
    overflow-wrap: anywhere;
  }

  .copy span,
  > span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.75rem;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
`

export const AdminInfoStatusList = styled.div`
  display: grid;
  gap: 0.55rem;
`

export const AdminInfoStatusItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.72rem;
  padding: 0.74rem 0.82rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "light" ? "rgba(255, 255, 255, 0.82)" : "rgba(31, 31, 31, 0.88)"};

  &[data-tone="good"] {
    border-color: ${({ theme }) => theme.colors.green7};
  }

  &[data-tone="warn"] {
    border-color: ${({ theme }) => theme.colors.orange7};
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.76rem;
    font-weight: 700;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.82rem;
    font-weight: 780;
    text-align: right;
  }
`

export const AdminInfoPanelCard = styled.div`
  display: grid;
  gap: 0.68rem;
  padding: 0.92rem;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
`

export const AdminStatusPill = styled.span<{ $size?: "sm" | "md" }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: ${({ $size = "md" }) => ($size === "sm" ? "28px" : "32px")};
  padding: ${({ $size = "md" }) => ($size === "sm" ? "0 0.62rem" : "0 0.72rem")};
  border-radius: ${({ $size = "md" }) => ($size === "sm" ? "10px" : "999px")};
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray11};
  font-size: ${({ $size = "md" }) => ($size === "sm" ? "0.76rem" : "0.78rem")};
  font-weight: 800;
  line-height: 1;

  &[data-tone="neutral"] {
    border-color: ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray10};
  }

  &[data-tone="accent"] {
    border-color: ${({ theme }) => theme.colors.accentBorder};
    background: ${({ theme }) => theme.colors.accentSurfaceSubtle};
    color: ${({ theme }) => theme.colors.accentLink};
  }

  &[data-tone="success"] {
    border-color: ${({ theme }) => theme.colors.statusSuccessBorder};
    background: ${({ theme }) => theme.colors.statusSuccessSurface};
    color: ${({ theme }) => theme.colors.statusSuccessText};
  }

  &[data-tone="warn"] {
    border-color: ${({ theme }) => theme.colors.orange7};
    background: ${({ theme }) => theme.colors.orange2};
    color: ${({ theme }) => theme.colors.orange10};
  }

  &[data-tone="danger"] {
    border-color: ${({ theme }) => theme.colors.statusDangerBorder};
    background: ${({ theme }) => theme.colors.statusDangerSurface};
    color: ${({ theme }) => theme.colors.statusDangerText};
  }
`

export const AdminInlineActionRow = styled.div`
  display: flex;
  gap: 0.55rem;
  align-items: center;
  flex-wrap: wrap;
`

export const AdminTextActionButton = styled.button`
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 0.36rem;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.84rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    color 0.18s ease,
    box-shadow 0.18s ease;

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => adminInteractiveFocusRing(theme)};
  }

  &:disabled {
    opacity: 0.56;
    cursor: not-allowed;
  }

  &[data-tone="primary"] {
    color: ${({ theme }) => theme.colors.blue9};
    font-weight: 800;
  }

  &[data-tone="danger"] {
    color: ${({ theme }) => theme.colors.red11};
  }
`

export const AdminTextActionLink = styled.a`
  display: inline-flex;
  align-items: center;
  min-height: 0;
  border-radius: 0.36rem;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.84rem;
  font-weight: 700;
  text-decoration: none;
  transition:
    color 0.18s ease,
    box-shadow 0.18s ease;

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => adminInteractiveFocusRing(theme)};
  }

  &[data-tone="primary"] {
    color: ${({ theme }) => theme.colors.blue9};
    font-weight: 800;
  }

  &[data-tone="danger"] {
    color: ${({ theme }) => theme.colors.red11};
  }
`

export const AdminActionCardButton = styled.button`
  text-align: left;
  display: grid;
  gap: 0.16rem;
  padding: 0.82rem 0.88rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    box-shadow 0.18s ease;

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: ${({ theme }) => adminInteractiveFocusRing(theme)};
  }

  &:disabled {
    opacity: 0.56;
    cursor: not-allowed;
  }

  span {
    font-size: 0.88rem;
    font-weight: 760;
  }

  small {
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.55;
  }
`
