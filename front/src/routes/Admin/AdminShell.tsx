import styled from "@emotion/styled"
import dynamic from "next/dynamic"
import Link from "next/link"
import { type ReactNode } from "react"
import AppIcon, { type IconName } from "src/components/icons/AppIcon"
import ProfileImage from "src/components/ProfileImage"
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
  summary: string
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "hub",
    href: "/admin",
    label: "허브",
    icon: "spark",
    summary: "새 글 작성과 핵심 확인 작업을 먼저 정리합니다.",
  },
  {
    id: "dashboard",
    href: "/admin/dashboard",
    label: "운영 대시보드",
    icon: "service",
    summary: "읽기 전용 모니터링 패널과 우선 점검 항목을 확인합니다.",
  },
  {
    id: "posts",
    href: "/admin/posts",
    label: "글 관리",
    icon: "edit",
    summary: "원고, 임시저장, 공개 상태를 한곳에서 관리합니다.",
  },
  {
    id: "profile",
    href: "/admin/profile",
    label: "프로필",
    icon: "camera",
    summary: "프로필 사진과 소개 문구, 공개 링크를 다듬습니다.",
  },
  {
    id: "tools",
    href: "/admin/tools",
    label: "운영 도구",
    icon: "laptop",
    summary: "운영 스크립트와 진단 워크스페이스를 실행합니다.",
  },
]

const AdminUtilityBar = dynamic(() => import("./AdminUtilityBar"), {
  ssr: false,
  loading: () => <UtilityBarFallback aria-hidden="true" />,
})

const AdminShell = ({ currentSection, member, children }: AdminShellProps) => {
  const currentNav = NAV_ITEMS.find((item) => item.id === currentSection) ?? NAV_ITEMS[0]
  const utilityNavItems = NAV_ITEMS.map((item) => ({
    key: item.id,
    href: item.href,
    label: item.label,
    icon: item.icon,
    active: item.id === currentSection,
  }))
  const sidebarIdentityName = member.nickname?.trim() || "AquilaLog"
  const sidebarIdentityInitial = sidebarIdentityName.slice(0, 2).toUpperCase()
  const sidebarProfileImageSrc = (member.profileImageDirectUrl || member.profileImageUrl || "").trim()

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
          <SidebarStatusCard aria-label="현재 화면">
            <SidebarCardKicker>현재 화면</SidebarCardKicker>
            <SidebarCardTitle>{currentNav.label}</SidebarCardTitle>
            <SidebarCardSummary>{currentNav.summary}</SidebarCardSummary>
            <Link href="/editor/new" passHref legacyBehavior>
              <SidebarPrimaryAction title="새 글 작성">
                <AppIcon name="edit" />
                <span>새 글 작성</span>
              </SidebarPrimaryAction>
            </Link>
          </SidebarStatusCard>
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
                  <span className="navCopy">
                    <strong>{item.label}</strong>
                    <span>{item.summary}</span>
                  </span>
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
  border-radius: 28px;
  background: ${({ theme }) =>
    theme.scheme === "light"
      ? "linear-gradient(180deg, rgba(255, 255, 255, 0.97) 0%, rgba(246, 246, 247, 0.93) 100%)"
      : "linear-gradient(180deg, rgba(20, 20, 21, 0.97) 0%, rgba(16, 16, 17, 0.95) 100%)"};
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
  gap: 0.9rem;

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
  width: 3rem;
  height: 3rem;
  border-radius: 18px;
  display: grid;
  place-items: center;
  position: relative;
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};

  span {
    font-size: 0.88rem;
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

const SidebarStatusCard = styled.section`
  display: grid;
  gap: 0.44rem;
  padding: 1.02rem 1rem 1rem;
  border-radius: 24px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) =>
    theme.scheme === "light"
      ? "linear-gradient(135deg, rgba(250, 250, 250, 0.98) 0%, rgba(243, 244, 246, 0.94) 100%)"
      : "linear-gradient(135deg, rgba(26, 26, 27, 0.96) 0%, rgba(20, 20, 21, 0.94) 100%)"};
`

const SidebarCardKicker = styled.small`
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.02em;
`

const SidebarCardTitle = styled.strong`
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 1.08rem;
  font-weight: 820;
  letter-spacing: -0.03em;
`

const SidebarCardSummary = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.83rem;
  line-height: 1.5;
`

const SidebarNavSection = styled.section`
  display: grid;
  gap: 0.7rem;
  padding-top: 0.2rem;
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
    color: ${({ theme }) => theme.colors.gray11};
    background: ${({ theme }) => theme.colors.gray2};
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

  .navCopy span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1.45;
  }

  &[data-active="true"] {
    border-color: ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray1};
  }

  &[data-active="true"] .navIcon {
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray12};
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

const SidebarPrimaryAction = styled.a`
  margin-top: 0.48rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.46rem;
  width: 100%;
  min-height: 3.1rem;
  padding: 0.82rem 0.92rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 800;
  box-shadow: ${({ theme }) =>
    theme.scheme === "light"
      ? "0 10px 20px rgba(15, 23, 42, 0.05)"
      : "0 12px 24px rgba(0, 0, 0, 0.18)"};
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
