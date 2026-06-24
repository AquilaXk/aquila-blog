import styled from "@emotion/styled"
import Link from "next/link"
import { type ReactNode, useEffect } from "react"
import AppIcon, { type IconName } from "src/components/icons/AppIcon"
import ProfileImage from "src/components/ProfileImage"
import type { AuthMember } from "src/hooks/useAuthSession"
import { CONFIG } from "site.config"
import {
  adminAccentText,
  adminAppBackground,
  adminBorder,
  adminBorderStrong,
  adminControlText,
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
  id: AdminShellSection | "write"
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
    id: "write",
    href: "/editor/new",
    label: "새 글 작성",
    icon: "file",
  },
  {
    id: "cloud",
    href: "/admin/cloud",
    label: "클라우드",
    icon: "cloud",
  },
  {
    id: "tools",
    href: "/admin/tools",
    label: "운영 도구",
    icon: "laptop",
  },
  {
    id: "profile",
    href: "/admin/profile",
    label: "설정",
    icon: "camera",
  },
]

const SECTION_TITLES: Record<AdminShellSection, string> = {
  hub: "관리자 허브",
  dashboard: "운영 대시보드",
  posts: "글 관리",
  cloud: "클라우드",
  profile: "설정",
  tools: "운영 도구",
}

const AdminShell = ({ currentSection, member, profileSnapshot = null, children }: AdminShellProps) => {
  const sidebarIdentityName = (member.nickname || member.username || "관리자").trim()
  const sidebarIdentityInitial = sidebarIdentityName.slice(0, 2).toUpperCase()
  const sidebarProfileImageSrc = (
    member.profileImageDirectUrl ||
    member.profileImageUrl ||
    profileSnapshot?.profileImageDirectUrl ||
    profileSnapshot?.profileImageUrl ||
    ""
  ).trim()
  const brandTitle = (profileSnapshot?.blogTitle || member.blogTitle || CONFIG.blog.title || "AquilaLog").trim()
  const brandInitial = brandTitle.slice(0, 1).toUpperCase()
  const currentTitle = SECTION_TITLES[currentSection]

  useEffect(() => {
    if (!member?.isAdmin) return
    if (typeof window === "undefined") return

    const refreshSnapshot = () => {
      void window.fetch("/api/backend/member/api/v1/notifications/snapshot", {
        credentials: "include",
      }).catch(() => undefined)
    }
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
      cancelIdleCallback?: (handle: number) => void
    }
    const idleHandle = idleWindow.requestIdleCallback
      ? idleWindow.requestIdleCallback(refreshSnapshot, { timeout: 1_500 })
      : window.setTimeout(refreshSnapshot, 0)

    return () => {
      if (idleWindow.cancelIdleCallback && typeof idleHandle === "number") {
        idleWindow.cancelIdleCallback(idleHandle)
      } else {
        window.clearTimeout(idleHandle)
      }
    }
  }, [member?.isAdmin])

  return (
    <ShellFrame>
      <Sidebar>
        <BrandBlock>
          <BrandMark>
            <span>{brandInitial}</span>
          </BrandMark>
          <BrandCopy>
            <strong>{brandTitle}</strong>
            <span>Production UI</span>
          </BrandCopy>
        </BrandBlock>

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

        <SidebarProfile>
          <SidebarAvatar>
            {sidebarProfileImageSrc ? (
              <ProfileImage src={sidebarProfileImageSrc} alt={`${sidebarIdentityName} 프로필 이미지`} fillContainer />
            ) : (
              <span>{sidebarIdentityInitial}</span>
            )}
          </SidebarAvatar>
          <ProfileCopy>
            <strong>{sidebarIdentityName}</strong>
            <span>관리자</span>
          </ProfileCopy>
        </SidebarProfile>
      </Sidebar>

      <ContentColumn>
        <TopBar>
          <CompactNav aria-label="관리자 바로가기">
            {NAV_ITEMS.map((item) => (
              <Link key={`compact-${item.id}`} href={item.href} passHref legacyBehavior>
                <CompactNavLink data-active={item.id === currentSection ? "true" : "false"} title={item.label} aria-label={item.label}>
                  <AppIcon name={item.icon} />
                </CompactNavLink>
              </Link>
            ))}
          </CompactNav>
          <TopBarTitle>
            <span>ADMIN</span>
            <strong>{currentTitle}</strong>
          </TopBarTitle>
          <TopBarActions>
            <Link href="/" passHref legacyBehavior>
              <SecondaryTopAction>블로그 보기</SecondaryTopAction>
            </Link>
            <Link href="/editor/new" passHref legacyBehavior>
              <PrimaryTopAction>새 글</PrimaryTopAction>
            </Link>
          </TopBarActions>
        </TopBar>

        <Canvas>{children}</Canvas>
      </ContentColumn>
    </ShellFrame>
  )
}

export default AdminShell

const ShellFrame = styled.div`
  ${({ theme }) => adminSystemThemeVariables(theme)}
  display: grid;
  grid-template-columns: 13.5rem minmax(0, 1fr);
  gap: 0;
  width: 100%;
  margin: 0;
  min-height: 100vh;
  padding: 0;
  background: ${adminAppBackground};

  @media (max-width: 1100px) {
    grid-template-columns: minmax(0, 1fr);
    width: 100%;
  }
`

const Sidebar = styled.aside`
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 1.4rem;
  min-width: 0;
  position: sticky;
  top: 0;
  min-height: 100vh;
  height: 100vh;
  padding: 1.15rem 0.82rem 1rem;
  border: 0;
  border-right: 1px solid ${adminBorder};
  border-radius: 0;
  background: ${adminShellSurface};

  @media (max-width: 1100px) {
    position: static;
    display: none;
  }
`

const BrandBlock = styled.div`
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0 0.15rem;

  @media (max-width: 1100px) {
    flex-shrink: 0;
  }
`

const BrandMark = styled.div`
  width: 2.55rem;
  height: 2.55rem;
  border-radius: 2px;
  display: grid;
  place-items: center;
  position: relative;
  overflow: hidden;
  border: 1px solid ${adminBorderStrong};
  background: ${adminTextPrimary};
  color: ${adminShellSurface};

  span {
    font-size: 1rem;
    font-weight: 800;
    letter-spacing: 0;
  }
`

const BrandCopy = styled.div`
  display: grid;
  gap: 0.16rem;

  strong {
    color: ${adminTextPrimary};
    font-size: 0.96rem;
    font-weight: 800;
    letter-spacing: 0;
  }

  span {
    color: ${adminTextMuted};
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  @media (max-width: 1100px) and (min-width: 768px) {
    display: none;
  }
`

const SidebarNavSection = styled.section`
  display: grid;
  gap: 0.3rem;
  padding-top: 0.15rem;
`

const SidebarNav = styled.nav`
  display: grid;
  align-content: start;
  gap: 0.15rem;

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
  gap: 0.5rem;
  min-width: 0;
  min-height: 2.28rem;
  padding: 0.46rem 0.52rem;
  border-radius: 2px;
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
    font-size: 0.86rem;
    font-weight: 760;
    letter-spacing: 0;
    line-height: 1.2;
  }

  &[data-active="true"] {
    border-left-color: ${adminTeal};
    background: ${adminSurfaceAccent};
  }

  &[data-active="true"] .navIcon {
    background: transparent;
    color: ${adminTeal};
  }

  &:hover {
    background: ${adminSurfaceAccent};
    border-left-color: ${adminTealBorder};
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

const SidebarProfile = styled.div`
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
  padding: 0.82rem 0.15rem 0;
  border-top: 1px solid ${adminBorder};
`

const SidebarAvatar = styled.div`
  width: 2.28rem;
  height: 2.28rem;
  border-radius: 2px;
  display: grid;
  place-items: center;
  position: relative;
  overflow: hidden;
  flex: 0 0 auto;
  border: 1px solid ${adminBorder};
  background: ${adminSurfaceAccent};
  color: ${adminAccentText};

  span {
    font-size: 0.78rem;
    font-weight: 800;
  }

  img {
    border-radius: inherit;
  }
`

const ProfileCopy = styled.div`
  display: grid;
  gap: 0.08rem;
  min-width: 0;

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: ${adminTextPrimary};
    font-size: 0.82rem;
    font-weight: 800;
  }

  span {
    color: ${adminTextMuted};
    font-size: 0.72rem;
    font-weight: 700;
  }
`

const ContentColumn = styled.div`
  display: grid;
  align-content: start;
  gap: 0;
  min-width: 0;
  background: ${adminAppBackground};
`

const TopBar = styled.header`
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 4.25rem;
  padding: 0.72rem 1.45rem;
  border: 0;
  border-bottom: 1px solid ${adminBorder};
  border-radius: 0;
  background: ${adminSurface};
  box-shadow: none;

  @media (max-width: 720px) {
    align-items: flex-start;
    flex-wrap: wrap;
    padding: 0.72rem 0.82rem;
  }
`

const CompactNav = styled.nav`
  display: none;

  @media (max-width: 1100px) {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    width: 100%;
    overflow-x: auto;
    padding-bottom: 0.12rem;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }
`

const CompactNavLink = styled.a`
  width: 2.55rem;
  height: 2.55rem;
  border-radius: 2px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border: 1px solid transparent;
  background: transparent;
  color: ${adminTextSecondary};
  text-decoration: none;

  &[data-active="true"] {
    border-color: ${adminBorderStrong};
    background: ${adminSurfaceAccent};
    color: ${adminTeal};
  }
`

const TopBarTitle = styled.div`
  display: grid;
  gap: 0.05rem;
  min-width: 0;
  margin-right: auto;

  span {
    color: ${adminTextMuted};
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.08em;
  }

  strong {
    color: ${adminTextPrimary};
    font-size: 1.02rem;
    font-weight: 820;
    line-height: 1.2;
  }
`

const TopBarActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex: 0 0 auto;
`

const SecondaryTopAction = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.2rem;
  padding: 0 0.85rem;
  border: 1px solid ${adminBorder};
  border-radius: 2px;
  background: ${adminSurfaceRaised};
  color: ${adminTextPrimary};
  text-decoration: none;
  font-size: 0.82rem;
  font-weight: 780;
`

const PrimaryTopAction = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.2rem;
  padding: 0 0.95rem;
  border: 1px solid ${adminTealBorder};
  border-radius: 2px;
  background: ${adminTeal};
  color: ${adminControlText};
  text-decoration: none;
  font-size: 0.82rem;
  font-weight: 820;

  &:hover {
    background: ${adminTealHover};
  }
`

const Canvas = styled.div`
  min-width: 0;
`
