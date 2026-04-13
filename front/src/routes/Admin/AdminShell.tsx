import styled from "@emotion/styled"
import Link from "next/link"
import { useRouter } from "next/router"
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import ProfileImage from "src/components/ProfileImage"
import AppIcon, { type IconName } from "src/components/icons/AppIcon"
import type { AuthMember } from "src/hooks/useAuthSession"
import { pushRoute } from "src/libs/router"

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
  description: string
  icon: IconName
  keywords: string[]
}

type ShortcutItem = {
  href: string
  label: string
  description: string
  icon: IconName
  keywords: string[]
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "hub",
    href: "/admin",
    label: "관리자 허브",
    description: "오늘 해야 할 일과 우선순위 작업",
    icon: "spark",
    keywords: ["허브", "개요", "home", "운영"],
  },
  {
    id: "dashboard",
    href: "/admin/dashboard",
    label: "운영 대시보드",
    description: "모니터링과 서비스 상태",
    icon: "service",
    keywords: ["대시보드", "grafana", "상태", "monitoring", "모니터링"],
  },
  {
    id: "posts",
    href: "/admin/posts",
    label: "글 관리",
    description: "초안, 최근 수정, 글 목록",
    icon: "edit",
    keywords: ["글", "포스트", "posts", "draft", "임시저장"],
  },
  {
    id: "profile",
    href: "/admin/profile",
    label: "프로필 설정",
    description: "공개 프로필과 홈 소개 편집",
    icon: "camera",
    keywords: ["프로필", "소개", "about", "링크", "home intro"],
  },
  {
    id: "tools",
    href: "/admin/tools",
    label: "운영 도구",
    description: "진단, 실행, 최근 결과",
    icon: "laptop",
    keywords: ["도구", "진단", "실행", "queue", "mail"],
  },
]

const SECTION_NOTES: Record<AdminShellSection, { title: string; detail: string }> = {
  hub: {
    title: "운영 허브",
    detail: "글 작성과 우선 작업을 한 화면에서 출발합니다.",
  },
  dashboard: {
    title: "읽기 전용 모니터링",
    detail: "서비스 건강도와 운영 패널을 빠르게 스캔하는 용도입니다.",
  },
  posts: {
    title: "글 작업 공간",
    detail: "새 글 작성과 기존 글 관리를 한 흐름으로 이어갑니다.",
  },
  profile: {
    title: "프로필 워크스페이스",
    detail: "메인과 About에 노출되는 정보를 정리합니다.",
  },
  tools: {
    title: "운영 진단",
    detail: "메일, 큐, 보안 이벤트와 실행 결과를 점검합니다.",
  },
}

const SHORTCUT_ITEMS: ShortcutItem[] = [
  ...NAV_ITEMS.map(({ href, label, description, icon, keywords }) => ({ href, label, description, icon, keywords })),
  {
    href: "/editor/new",
    label: "새 글 작성",
    description: "새 에디터에서 바로 집필 시작",
    icon: "edit",
    keywords: ["새글", "작성", "editor", "draft"],
  },
]

const normalize = (value: string) => value.trim().toLowerCase()

const matchesShortcut = (item: ShortcutItem, query: string) => {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return true

  return [item.label, item.description, ...item.keywords]
    .map(normalize)
    .some((token) => token.includes(normalizedQuery))
}

const AdminShell = ({ currentSection, member, children }: AdminShellProps) => {
  const router = useRouter()
  const blurTimerRef = useRef<number | null>(null)
  const [query, setQuery] = useState("")
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const currentNote = SECTION_NOTES[currentSection]
  const displayName = member.nickname || member.username || "관리자"
  const displayInitial = displayName.slice(0, 2).toUpperCase()
  const profileSrc = member.profileImageDirectUrl || member.profileImageUrl || ""

  const searchResults = useMemo(
    () => SHORTCUT_ITEMS.filter((item) => matchesShortcut(item, query)).slice(0, 6),
    [query]
  )

  useEffect(() => {
    return () => {
      if (blurTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(blurTimerRef.current)
      }
    }
  }, [])

  const clearBlurTimer = () => {
    if (blurTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(blurTimerRef.current)
      blurTimerRef.current = null
    }
  }

  const closeSearch = () => {
    clearBlurTimer()
    setIsSearchOpen(false)
  }

  const navigate = (href: string) => {
    closeSearch()
    setQuery("")
    void pushRoute(router, href)
  }

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!searchResults.length) return
    navigate(searchResults[0].href)
  }

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
              <span>운영 워크스페이스</span>
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
                    <span>{item.description}</span>
                  </span>
                </NavLink>
              </Link>
            ))}
          </SidebarNav>
        </SidebarTop>

        <SidebarCard>
          <small>현재 작업 영역</small>
          <strong>{currentNote.title}</strong>
          <p>{currentNote.detail}</p>
          <Link href="/editor/new" passHref legacyBehavior>
            <SidebarCardAction title="새 글 작성">
              <AppIcon name="edit" />
              <span>새 글 작성</span>
            </SidebarCardAction>
          </Link>
        </SidebarCard>
      </Sidebar>

      <ContentColumn>
        <UtilityBar>
          <CompactNav aria-label="관리자 바로가기">
            {NAV_ITEMS.map((item) => (
              <Link key={`compact-${item.id}`} href={item.href} passHref legacyBehavior>
                <CompactNavLink data-active={item.id === currentSection ? "true" : "false"} title={item.label}>
                  <AppIcon name={item.icon} />
                </CompactNavLink>
              </Link>
            ))}
          </CompactNav>

          <SearchForm role="search" onSubmit={handleSearchSubmit}>
            <SearchField>
              <span className="searchIcon" aria-hidden="true">
                <AppIcon name="search" />
              </span>
              <SearchInput
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => {
                  clearBlurTimer()
                  setIsSearchOpen(true)
                }}
                onBlur={() => {
                  if (typeof window === "undefined") return
                  blurTimerRef.current = window.setTimeout(() => {
                    setIsSearchOpen(false)
                    blurTimerRef.current = null
                  }, 120)
                }}
                placeholder="페이지 이름, 작업 키워드 검색"
                aria-label="관리자 바로가기 검색"
              />
              {query ? (
                <SearchResetButton
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setQuery("")
                    setIsSearchOpen(true)
                  }}
                  aria-label="검색어 지우기"
                >
                  <AppIcon name="close" />
                </SearchResetButton>
              ) : null}
              {isSearchOpen && searchResults.length ? (
                <SearchPopover role="listbox" aria-label="관리자 검색 결과">
                  {searchResults.map((item) => (
                    <SearchResultButton
                      key={`${item.href}-${item.label}`}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => navigate(item.href)}
                    >
                      <span className="resultIcon">
                        <AppIcon name={item.icon} />
                      </span>
                      <span className="resultCopy">
                        <strong>{item.label}</strong>
                        <span>{item.description}</span>
                      </span>
                    </SearchResultButton>
                  ))}
                </SearchPopover>
              ) : null}
            </SearchField>
          </SearchForm>

          <UtilityActions>
            <Link href="/admin/tools" passHref legacyBehavior>
              <IconLink aria-label="운영 도구 바로가기">
                <AppIcon name="bell" />
              </IconLink>
            </Link>

            <Link href="/admin/profile" passHref legacyBehavior>
              <ProfileLink>
                <ProfileAvatar>
                  {profileSrc ? (
                    <ProfileImage src={profileSrc} alt={displayName} fillContainer />
                  ) : (
                    <ProfileFallback>{displayInitial}</ProfileFallback>
                  )}
                </ProfileAvatar>
                <ProfileMeta>
                  <strong>{displayName}</strong>
                  <span>{currentNote.title}</span>
                </ProfileMeta>
              </ProfileLink>
            </Link>
          </UtilityActions>
        </UtilityBar>

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

  .navCopy span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.77rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.83rem;
    line-height: 1.5;
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

const UtilityBar = styled.header`
  position: sticky;
  top: calc(var(--app-header-height, 73px) + 0.85rem);
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.9rem;
  padding: 0.9rem 1rem;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 24px;
  backdrop-filter: blur(18px);
  background: ${({ theme }) =>
    theme.scheme === "light" ? "rgba(255, 255, 255, 0.84)" : "rgba(18, 18, 18, 0.84)"};
  box-shadow: ${({ theme }) =>
    theme.scheme === "light"
      ? "0 16px 36px rgba(15, 23, 42, 0.06)"
      : "0 18px 36px rgba(0, 0, 0, 0.2)"};

  @media (max-width: 720px) {
    top: calc(var(--app-header-height, 73px) + 0.65rem);
    flex-direction: column;
    align-items: stretch;
  }
`

const CompactNav = styled.nav`
  display: none;

  @media (max-width: 1100px) {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    flex-shrink: 0;
  }

  @media (max-width: 720px) {
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
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 15px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border: 1px solid transparent;
  background: ${({ theme }) =>
    theme.scheme === "light" ? "rgba(243, 246, 250, 0.92)" : "rgba(31, 31, 31, 0.92)"};
  color: ${({ theme }) => theme.colors.gray11};
  text-decoration: none;

  &[data-active="true"] {
    border-color: ${({ theme }) => theme.colors.blue7};
    background: ${({ theme }) =>
      theme.scheme === "light" ? "rgba(59, 130, 246, 0.12)" : "rgba(59, 130, 246, 0.2)"};
    color: ${({ theme }) => theme.colors.blue9};
  }
`

const SearchForm = styled.form`
  flex: 1;
  min-width: 0;
`

const SearchField = styled.div`
  position: relative;
  display: flex;
  align-items: center;

  .searchIcon {
    position: absolute;
    left: 0.9rem;
    color: ${({ theme }) => theme.colors.gray10};
    display: inline-flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }
`

const SearchInput = styled.input`
  width: 100%;
  min-width: 0;
  height: 3rem;
  padding: 0 3rem 0 2.7rem;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 999px;
  background: ${({ theme }) =>
    theme.scheme === "light" ? "rgba(243, 246, 250, 0.92)" : "rgba(31, 31, 31, 0.92)"};
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.92rem;
  font-weight: 600;

  &::placeholder {
    color: ${({ theme }) => theme.colors.gray10};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue7};
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12);
  }
`

const SearchResetButton = styled.button`
  position: absolute;
  right: 0.65rem;
  width: 1.9rem;
  height: 1.9rem;
  border: 0;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray10};
  cursor: pointer;
`

const SearchPopover = styled.div`
  position: absolute;
  top: calc(100% + 0.55rem);
  left: 0;
  right: 0;
  display: grid;
  gap: 0.3rem;
  padding: 0.45rem;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 22px;
  background: ${({ theme }) => (theme.scheme === "light" ? "#ffffff" : theme.colors.gray2)};
  box-shadow: ${({ theme }) =>
    theme.scheme === "light"
      ? "0 18px 36px rgba(15, 23, 42, 0.1)"
      : "0 18px 36px rgba(0, 0, 0, 0.24)"};
`

const SearchResultButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.78rem;
  width: 100%;
  border: 0;
  border-radius: 18px;
  padding: 0.72rem 0.78rem;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;

  .resultIcon {
    width: 2.3rem;
    height: 2.3rem;
    border-radius: 14px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    background: ${({ theme }) =>
      theme.scheme === "light" ? "rgba(59, 130, 246, 0.12)" : "rgba(59, 130, 246, 0.2)"};
    color: ${({ theme }) => theme.colors.blue9};
  }

  .resultCopy {
    display: grid;
    min-width: 0;
    gap: 0.14rem;
  }

  .resultCopy strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.92rem;
    font-weight: 800;
  }

  .resultCopy span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.77rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &:hover {
    background: ${({ theme }) =>
      theme.scheme === "light" ? "rgba(59, 130, 246, 0.08)" : "rgba(59, 130, 246, 0.14)"};
  }
`

const UtilityActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.68rem;

  @media (max-width: 720px) {
    justify-content: space-between;
  }
`

const IconLink = styled.a`
  width: 3rem;
  height: 3rem;
  border-radius: 999px;
  display: grid;
  place-items: center;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) =>
    theme.scheme === "light" ? "rgba(255, 255, 255, 0.82)" : "rgba(31, 31, 31, 0.92)"};
  color: ${({ theme }) => theme.colors.gray12};
  text-decoration: none;
`

const ProfileLink = styled.a`
  display: flex;
  align-items: center;
  gap: 0.72rem;
  min-width: 0;
  padding: 0.38rem 0.42rem 0.38rem 0.38rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) =>
    theme.scheme === "light" ? "rgba(255, 255, 255, 0.82)" : "rgba(31, 31, 31, 0.92)"};
  color: inherit;
  text-decoration: none;
`

const ProfileAvatar = styled.div`
  position: relative;
  width: 2.65rem;
  height: 2.65rem;
  border-radius: 999px;
  overflow: hidden;
  flex-shrink: 0;
  background: ${({ theme }) => theme.colors.gray4};
`

const ProfileFallback = styled.div`
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.86rem;
  font-weight: 800;
`

const ProfileMeta = styled.div`
  display: grid;
  min-width: 0;
  gap: 0.08rem;
  padding-right: 0.2rem;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.88rem;
    font-weight: 800;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.74rem;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`

const Canvas = styled.div`
  min-width: 0;
`
