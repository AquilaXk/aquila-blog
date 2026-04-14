import styled from "@emotion/styled"
import dynamic from "next/dynamic"
import Link from "next/link"
import { type ReactNode } from "react"
import AppIcon, { type IconName } from "src/components/icons/AppIcon"
import ProfileImage from "src/components/ProfileImage"
import { useAdminProfile } from "src/hooks/useAdminProfile"
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

const AdminShell = ({ currentSection, member, children }: AdminShellProps) => {
  const adminProfile = useAdminProfile()
  const currentNav = NAV_ITEMS.find((item) => item.id === currentSection) ?? NAV_ITEMS[0]
  const utilityNavItems = NAV_ITEMS.map((item) => ({
    key: item.id,
    href: item.href,
    label: item.label,
    icon: item.icon,
    active: item.id === currentSection,
  }))
  const sidebarIdentityName = (adminProfile?.blogTitle || "AquilaLog").trim()
  const sidebarIdentityInitial = sidebarIdentityName.slice(0, 2).toUpperCase()
  const sidebarProfileImageSrc = (
    adminProfile?.profileImageDirectUrl ||
    adminProfile?.profileImageUrl ||
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
          <SidebarSectionLabel>관리 메뉴</SidebarSectionLabel>
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
  gap: 1rem;
  align-content: start;
  min-width: 0;
  position: sticky;
  top: calc(var(--app-header-height, 73px) + 0.85rem);
  height: fit-content;
  padding: 1.05rem;
  border: 1px solid ${({ theme }) => theme.colors.gray4};
  border-radius: 24px;
  background: ${({ theme }) => theme.colors.gray1};

  @media (max-width: 1100px) {
    position: static;
    padding: 0.72rem 0.82rem;
    border-radius: 22px;
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
  padding: 0.1rem 0.1rem 0;

  @media (max-width: 1100px) {
    flex-shrink: 0;
  }
`

const BrandMark = styled.div`
  width: 3.25rem;
  height: 3.25rem;
  border-radius: 16px;
  display: grid;
  place-items: center;
  position: relative;
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};

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
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.18rem;
    font-weight: 800;
    letter-spacing: -0.03em;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
    font-weight: 700;
  }

  @media (max-width: 1100px) and (min-width: 768px) {
    display: none;
  }
`

const SidebarNavSection = styled.section`
  display: grid;
  gap: 0.7rem;
  padding-top: 0.25rem;
`

const SidebarSectionLabel = styled.small`
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  padding: 0 0.22rem;
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
  padding: 0.78rem 0.84rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray3};
  color: inherit;
  text-decoration: none;
  transition: border-color 140ms ease, background 140ms ease;

  .navIcon {
    width: 2.3rem;
    height: 2.3rem;
    border-radius: 13px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    color: ${({ theme }) => theme.colors.gray11};
    background: ${({ theme }) => theme.colors.gray2};
  }

  .navLabel {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.92rem;
    font-weight: 760;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }

  &[data-active="true"] {
    border-color: ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
  }

  &[data-active="true"] .navIcon {
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &:hover {
    border-color: ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
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
  min-height: 2.9rem;
  padding: 0.78rem 0.9rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  text-decoration: none;
  font-size: 0.88rem;
  font-weight: 760;

  &:hover {
    background: ${({ theme }) => theme.colors.gray3};
  }
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
