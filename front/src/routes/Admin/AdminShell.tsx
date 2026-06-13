import styled from "@emotion/styled"
import dynamic from "next/dynamic"
import Link from "next/link"
import { type ReactNode } from "react"
import AppIcon, { type IconName } from "src/components/icons/AppIcon"
import ProfileImage from "src/components/ProfileImage"
import type { AuthMember } from "src/hooks/useAuthSession"
import {
  adminAppBackground,
  adminBorder,
  adminBorderStrong,
  adminControlText,
  adminGold,
  adminShellSurface,
  adminSurface,
  adminSurfaceAccent,
  adminSurfaceRaised,
  adminTeal,
  adminTealBorder,
  adminTealHover,
  adminSystemThemeVariables,
  adminTextMuted,
  adminTextPrimary,
  adminTextSecondary,
} from "src/routes/Admin/adminColorTokens"

type AdminShellProfileSnapshot = Pick<
  AuthMember,
  "blogTitle" | "profileImageDirectUrl" | "profileImageUrl"
>

export type AdminShellSection = "hub" | "dashboard" | "posts" | "cloud" | "profile" | "tools"

type AdminShellProps = {
  currentSection: AdminShellSection
  member: AuthMember
  profileSnapshot?: AdminShellProfileSnapshot | null
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
    id: "cloud",
    href: "/admin/cloud",
    label: "클라우드",
    icon: "cloud",
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

const AdminShell = ({ currentSection, member, profileSnapshot = null, children }: AdminShellProps) => {
  const currentNav = NAV_ITEMS.find((item) => item.id === currentSection) ?? NAV_ITEMS[0]
  const utilityNavItems = NAV_ITEMS.map((item) => ({
    key: item.id,
    href: item.href,
    label: item.label,
    icon: item.icon,
    active: item.id === currentSection,
  }))
  const sidebarIdentityName = (profileSnapshot?.blogTitle || member.blogTitle || "AquilaLog").trim()
  const sidebarIdentityInitial = sidebarIdentityName.slice(0, 2).toUpperCase()
  const sidebarProfileImageSrc = (
    profileSnapshot?.profileImageDirectUrl ||
    profileSnapshot?.profileImageUrl ||
    member.profileImageDirectUrl ||
    member.profileImageUrl ||
    ""
  ).trim()

  return (
    <ShellFrame>
      <Sidebar>
        <SidebarTop>
          <BrandBlock>
            <BrandMark>
              {sidebarProfileImageSrc ? (
                <ProfileImage
                  src={sidebarProfileImageSrc}
                  alt={`${sidebarIdentityName} 프로필 이미지`}
                  fillContainer
                />
              ) : (
                <span>{sidebarIdentityInitial}</span>
              )}
            </BrandMark>
            <BrandCopy>
              <strong>{sidebarIdentityName}</strong>
              <span>관리자</span>
            </BrandCopy>
          </BrandBlock>
          <Link href="/editor/new" passHref legacyBehavior>
            <SidebarPrimaryAction title="새 글 작성">
              <AppIcon name="edit" />
              <span>새 글 작성</span>
            </SidebarPrimaryAction>
          </Link>
        </SidebarTop>

        <SidebarNavSection>
          <SidebarNav aria-label="관리자 내비게이션">
            {NAV_ITEMS.map((item) => (
              <Link key={item.id} href={item.href} passHref legacyBehavior>
                <NavLink data-active={item.id === currentSection ? "true" : "false"} title={item.label}>
                  <span className="navIcon">
                    <AppIcon name={item.icon} />
                  </span>
                  <strong className="navLabel">{item.label}</strong>
                </NavLink>
              </Link>
            ))}
          </SidebarNav>
        </SidebarNavSection>
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
  ${adminSystemThemeVariables}
  display: grid;
  grid-template-columns: 17.5rem minmax(0, 1fr);
  gap: 0;
  width: 100vw;
  margin-left: calc(50% - 50vw);
  min-height: calc(100vh - var(--app-header-height, 73px) - 1rem);
  padding: 0;
  background: ${adminAppBackground};

  @media (max-width: 1100px) {
    grid-template-columns: minmax(0, 1fr);
    width: 100%;
    margin-left: 0;
  }
`

const Sidebar = styled.aside`
  display: grid;
  gap: 0.65rem;
  align-content: start;
  min-width: 0;
  position: sticky;
  top: var(--app-header-height, 73px);
  min-height: calc(100vh - var(--app-header-height, 73px));
  height: fit-content;
  padding: 1.05rem 1.25rem 1.15rem;
  border: 0;
  border-right: 1px solid ${adminBorder};
  border-radius: 0;
  background: ${adminShellSurface};

  @media (max-width: 1100px) {
    position: static;
    display: none;
  }
`

const SidebarTop = styled.div`
  display: grid;
  gap: 0.8rem;

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
  padding: 0.1rem 0 0.35rem;

  @media (max-width: 1100px) {
    flex-shrink: 0;
  }
`

const BrandMark = styled.div`
  width: 2.95rem;
  height: 2.95rem;
  border-radius: 2px;
  display: grid;
  place-items: center;
  position: relative;
  overflow: hidden;
  border: 1px solid ${adminBorderStrong};
  background: ${adminSurfaceAccent};
  color: ${adminGold};

  span {
    font-size: 0.9rem;
    font-weight: 800;
    letter-spacing: -0.04em;
  }
`

const BrandCopy = styled.div`
  display: grid;
  gap: 0.16rem;

  strong {
    color: ${adminTextPrimary};
    font-size: 1.18rem;
    font-weight: 800;
    letter-spacing: -0.03em;
  }

  span {
    color: ${adminTextMuted};
    font-size: 0.8rem;
    font-weight: 700;
  }

  @media (max-width: 1100px) and (min-width: 768px) {
    display: none;
  }
`

const SidebarNavSection = styled.section`
  display: grid;
  gap: 0.3rem;
  padding-top: 0.1rem;
`

const SidebarNav = styled.nav`
  display: grid;
  gap: 0.08rem;

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
  gap: 0.62rem;
  min-width: 0;
  min-height: 2.38rem;
  padding: 0.38rem 0.55rem;
  border-radius: 0;
  border: 0;
  border-left: 3px solid transparent;
  color: inherit;
  text-decoration: none;
  transition: border-color 140ms ease, background 140ms ease;

  .navIcon {
    width: 1.55rem;
    height: 1.55rem;
    border-radius: 0;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    color: ${adminTextSecondary};
    background: transparent;
  }

  .navLabel {
    color: ${adminTextPrimary};
    font-size: 0.92rem;
    font-weight: 760;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }

  &[data-active="true"] {
    border-left-color: ${adminGold};
    background: ${adminSurfaceAccent};
  }

  &[data-active="true"] .navIcon {
    background: transparent;
    color: ${adminGold};
  }

  &:hover {
    background: ${adminSurfaceRaised};
  }

  @media (max-width: 1100px) {
    justify-content: center;
    padding: 0.72rem;
    min-width: 3.25rem;

    .navLabel {
      display: none;
    }
  }
`

const SidebarPrimaryAction = styled.a`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.46rem;
  width: 100%;
  min-height: 2.38rem;
  padding: 0.56rem 0.72rem;
  border-radius: 2px;
  border: 1px solid ${adminTealBorder};
  background: ${adminTeal};
  color: ${adminControlText};
  text-decoration: none;
  font-size: 0.88rem;
  font-weight: 760;

  &:hover {
    background: ${adminTealHover};
  }
`

const ContentColumn = styled.div`
  display: grid;
  align-content: start;
  gap: 0;
  min-width: 0;
  background: ${adminAppBackground};
`

const UtilityBarFallback = styled.div`
  position: sticky;
  top: calc(var(--app-header-height, 73px) + 0.85rem);
  z-index: 5;
  height: 4.85rem;
  border: 0;
  border-bottom: 1px solid ${adminBorder};
  border-radius: 0;
  background: ${adminSurface};
  box-shadow: none;

  @media (max-width: 720px) {
    top: calc(var(--app-header-height, 73px) + 0.65rem);
    height: 8.15rem;
  }
`

const Canvas = styled.div`
  min-width: 0;
`
