import styled from "@emotion/styled"
import dynamic from "next/dynamic"
import Link from "next/link"
import { type ReactNode } from "react"
import AppIcon, { type IconName } from "src/components/icons/AppIcon"
import type { AuthMember } from "src/hooks/useAuthSession"

export type AdminShellSection = "hub" | "dashboard" | "posts" | "profile" | "tools"

type AdminShellProps = {
  currentSection: AdminShellSection
  member: AuthMember
  children: ReactNode
}

type NavItem = {
  id: AdminShellSection
  href: string
  label: string
  icon: IconName
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "hub",
    href: "/admin",
    label: "허브",
    icon: "spark",
  },
  {
    id: "dashboard",
    href: "/admin/dashboard",
    label: "운영 대시보드",
    icon: "service",
  },
  {
    id: "posts",
    href: "/admin/posts",
    label: "글 관리",
    icon: "edit",
  },
  {
    id: "profile",
    href: "/admin/profile",
    label: "프로필",
    icon: "camera",
  },
  {
    id: "tools",
    href: "/admin/tools",
    label: "운영 도구",
    icon: "laptop",
  },
]

const AdminUtilityBar = dynamic(() => import("./AdminUtilityBar"), {
  ssr: false,
  loading: () => <UtilityBarFallback aria-hidden="true" />,
})

const AdminShell = ({ currentSection, children }: AdminShellProps) => {
  const currentNav = NAV_ITEMS.find((item) => item.id === currentSection) ?? NAV_ITEMS[0]
  const utilityNavItems = NAV_ITEMS.map((item) => ({
    key: item.id,
    href: item.href,
    label: item.label,
    icon: item.icon,
    active: item.id === currentSection,
  }))

  return (
    <ShellFrame>
      <Sidebar>
        <SidebarTop>
          <BrandBlock>
            <BrandMark>
              <AppIcon name="service" />
            </BrandMark>
            <BrandCopy>
              <strong>AquilaLog</strong>
              <span>관리자</span>
            </BrandCopy>
          </BrandBlock>

          <SidebarNav aria-label="관리자 내비게이션">
            {NAV_ITEMS.map((item) => (
              <Link key={item.id} href={item.href} passHref legacyBehavior>
                <NavLink data-active={item.id === currentSection ? "true" : "false"} title={item.label}>
                  <span className="navIcon">
                    <AppIcon name={item.icon} />
                  </span>
                  <span className="navCopy">
                    <strong>{item.label}</strong>
                  </span>
                </NavLink>
              </Link>
            ))}
          </SidebarNav>
        </SidebarTop>

        <SidebarCard>
          <small>현재</small>
          <strong>{currentNav.label}</strong>
          <Link href="/editor/new" passHref legacyBehavior>
            <SidebarCardAction title="새 글 작성">
              <AppIcon name="edit" />
              <span>새 글 작성</span>
            </SidebarCardAction>
          </Link>
        </SidebarCard>
      </Sidebar>

      <ContentColumn>
        <AdminUtilityBar
          navItems={utilityNavItems}
          currentLabel={currentNav.label}
        />

        <Canvas>{children}</Canvas>
      </ContentColumn>
    </ShellFrame>
  )
}

export default AdminShell

const ShellFrame = styled.div`
  display: grid;
  grid-template-columns: minmax(14.5rem, 16rem) minmax(0, 1fr);
  gap: 1rem;
  min-height: calc(100vh - var(--app-header-height, 73px) - 1rem);
  padding: 1rem 0 2rem;

  @media (max-width: 1100px) {
    grid-template-columns: minmax(0, 1fr);
    padding-top: 0.85rem;
  }
`

const Sidebar = styled.aside`
  display: grid;
  align-content: space-between;
  gap: 1rem;
  min-width: 0;
  position: sticky;
  top: calc(var(--app-header-height, 73px) + 0.85rem);
  height: fit-content;
  padding: 1rem;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 28px;
  background: ${({ theme }) =>
    theme.scheme === "light"
      ? "linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(246, 249, 255, 0.92) 100%)"
      : "linear-gradient(180deg, rgba(21, 25, 31, 0.96) 0%, rgba(15, 18, 24, 0.94) 100%)"};
  box-shadow: ${({ theme }) =>
    theme.scheme === "light"
      ? "0 18px 40px rgba(15, 23, 42, 0.08)"
      : "0 20px 40px rgba(0, 0, 0, 0.22)"};

  @media (max-width: 1100px) {
    position: static;
    padding: 0.72rem 0.82rem;
    border-radius: 22px;
    display: none;
  }
`

const SidebarTop = styled.div`
  display: grid;
  gap: 1rem;

  @media (max-width: 1100px) {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }
`

const BrandBlock = styled.div`
  display: flex;
  align-items: center;
  gap: 0.78rem;

  @media (max-width: 1100px) {
    flex-shrink: 0;
  }
`

const BrandMark = styled.div`
  width: 3rem;
  height: 3rem;
  border-radius: 18px;
  display: grid;
  place-items: center;
  background: ${({ theme }) => theme.colors.blue8};
  color: #ffffff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);

  svg {
    font-size: 1.25rem;
  }
`

const BrandCopy = styled.div`
  display: grid;
  gap: 0.12rem;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1rem;
    font-weight: 800;
    letter-spacing: -0.03em;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
    font-weight: 600;
  }

  @media (max-width: 1100px) and (min-width: 768px) {
    display: none;
  }
`

const SidebarNav = styled.nav`
  display: grid;
  gap: 0.45rem;

  @media (max-width: 1100px) {
    grid-auto-flow: column;
    grid-auto-columns: minmax(3.25rem, max-content);
    overflow-x: auto;
    padding-bottom: 0.1rem;
    scrollbar-width: none;
    align-items: center;

    &::-webkit-scrollbar {
      display: none;
    }
  }
`

const NavLink = styled.a`
  display: flex;
  align-items: center;
  gap: 0.82rem;
  min-width: 0;
  padding: 0.82rem 0.88rem;
  border-radius: 18px;
  border: 1px solid transparent;
  color: inherit;
  text-decoration: none;
  transition:
    transform 140ms ease,
    border-color 140ms ease,
    background 140ms ease;

  .navIcon {
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 15px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    color: ${({ theme }) => theme.colors.blue9};
    background: ${({ theme }) =>
      theme.scheme === "light" ? "rgba(59, 130, 246, 0.1)" : "rgba(255, 255, 255, 0.05)"};
  }

  .navCopy {
    display: grid;
    min-width: 0;
    gap: 0.15rem;
  }

  .navCopy strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.95rem;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  &[data-active="true"] {
    border-color: ${({ theme }) => theme.colors.blue7};
    background: ${({ theme }) =>
      theme.scheme === "light" ? "rgba(59, 130, 246, 0.12)" : "rgba(59, 130, 246, 0.2)"};
  }

  &[data-active="true"] .navIcon {
    background: ${({ theme }) =>
      theme.scheme === "light" ? "rgba(59, 130, 246, 0.18)" : "rgba(59, 130, 246, 0.28)"};
  }

  &:hover {
    transform: translateY(-1px);
    border-color: ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) =>
      theme.scheme === "light" ? "rgba(255, 255, 255, 0.86)" : "rgba(31, 31, 31, 0.92)"};
  }

  @media (max-width: 1100px) {
    justify-content: center;
    padding: 0.72rem;
    min-width: 3.25rem;

    .navCopy {
      display: none;
    }
  }
`

const SidebarCard = styled.section`
  display: grid;
  gap: 0.38rem;
  padding: 1rem;
  border-radius: 22px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) =>
    theme.scheme === "light"
      ? "linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(96, 165, 250, 0.16) 100%)"
      : "linear-gradient(135deg, rgba(37, 99, 235, 0.2) 0%, rgba(30, 64, 175, 0.28) 100%)"};

  small {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.75rem;
    font-weight: 700;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1rem;
    font-weight: 800;
  }

  @media (max-width: 1100px) {
    display: none;
  }
`

const SidebarCardAction = styled.a`
  margin-top: 0.35rem;
  display: inline-flex;
  align-items: center;
  gap: 0.46rem;
  width: fit-content;
  padding: 0.72rem 0.92rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.blue8};
  background: ${({ theme }) => theme.colors.blue8};
  color: #ffffff;
  text-decoration: none;
  font-size: 0.86rem;
  font-weight: 800;

`

const ContentColumn = styled.div`
  display: grid;
  align-content: start;
  gap: 1rem;
  min-width: 0;
`

const UtilityBarFallback = styled.div`
  position: sticky;
  top: calc(var(--app-header-height, 73px) + 0.85rem);
  z-index: 5;
  height: 4.85rem;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 24px;
  background: ${({ theme }) =>
    theme.scheme === "light" ? "rgba(255, 255, 255, 0.84)" : "rgba(18, 18, 18, 0.84)"};
  box-shadow: ${({ theme }) =>
    theme.scheme === "light"
      ? "0 16px 36px rgba(15, 23, 42, 0.06)"
      : "0 18px 36px rgba(0, 0, 0, 0.2)"};

  @media (max-width: 720px) {
    top: calc(var(--app-header-height, 73px) + 0.65rem);
    height: 8.15rem;
  }
`

const Canvas = styled.div`
  min-width: 0;
`
