import styled from "@emotion/styled"
import Link from "next/link"
import { useRouter } from "next/router"
import { type FormEvent, useMemo, useState } from "react"
import AppIcon, { type IconName } from "src/components/icons/AppIcon"
import { pushRoute } from "src/libs/router"

type UtilityNavItem = {
  key: string
  href: string
  label: string
  icon: IconName
  active: boolean
}

type Props = {
  navItems: UtilityNavItem[]
  currentLabel: string
}

type ShortcutItem = {
  href: string
  label: string
  icon: IconName
}

const normalize = (value: string) => value.trim().toLowerCase()

const matchesShortcut = (item: ShortcutItem, query: string) => {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return true

  return [item.label, item.href]
    .map(normalize)
    .some((token) => token.includes(normalizedQuery))
}

const AdminUtilityBar = ({ navItems, currentLabel }: Props) => {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const shortcutItems = useMemo<ShortcutItem[]>(
    () => [
      ...navItems.map(({ href, label, icon }) => ({ href, label, icon })),
      {
        href: "/editor/new",
        label: "새 글 작성",
        icon: "edit",
      },
    ],
    [navItems]
  )

  const navigate = (href: string) => {
    setQuery("")
    void pushRoute(router, href)
  }

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextMatch = shortcutItems.find((item) => matchesShortcut(item, query))
    if (!nextMatch) return
    navigate(nextMatch.href)
  }

  return (
    <UtilityBar>
      <CompactNav aria-label="관리자 바로가기">
        {navItems.map((item) => (
          <Link key={`compact-${item.key}`} href={item.href} passHref legacyBehavior>
            <CompactNavLink data-active={item.active ? "true" : "false"} title={item.label}>
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
            placeholder="페이지 검색"
            aria-label="관리자 검색"
          />
        </SearchField>
      </SearchForm>

      <UtilityActions>
        <CurrentViewChip aria-label="현재 화면">
          <span>현재</span>
          <strong>{currentLabel}</strong>
        </CurrentViewChip>

        <Link href="/admin/profile" passHref legacyBehavior>
          <SettingsLink>
            <span>프로필 설정</span>
          </SettingsLink>
        </Link>
      </UtilityActions>
    </UtilityBar>
  )
}

export default AdminUtilityBar

const UtilityBar = styled.header`
  position: sticky;
  top: calc(var(--app-header-height, 73px) + 0.85rem);
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.72rem;
  padding: 0.72rem 0.85rem;
  border: 1px solid ${({ theme }) => theme.colors.gray4};
  border-radius: 20px;
  backdrop-filter: blur(18px);
  background: ${({ theme }) =>
    theme.scheme === "light" ? "rgba(255, 255, 255, 0.78)" : "rgba(18, 18, 18, 0.76)"};
  box-shadow: ${({ theme }) =>
    theme.scheme === "light"
      ? "0 10px 24px rgba(15, 23, 42, 0.05)"
      : "0 12px 28px rgba(0, 0, 0, 0.18)"};

  @media (max-width: 720px) {
    top: calc(var(--app-header-height, 73px) + 0.65rem);
    flex-direction: column;
    align-items: stretch;
  }
`

const CompactNav = styled.nav`
  display: none;

  @media (max-width: 880px) {
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
  height: 2.75rem;
  padding: 0 0.92rem 0 2.55rem;
  border: 1px solid ${({ theme }) => theme.colors.gray4};
  border-radius: 999px;
  background: ${({ theme }) =>
    theme.scheme === "light" ? "rgba(243, 246, 250, 0.82)" : "rgba(24, 24, 24, 0.82)"};
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.88rem;
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

const UtilityActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.52rem;

  @media (max-width: 720px) {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
`

const CurrentViewChip = styled.div`
  display: flex;
  align-items: center;
  gap: 0.48rem;
  min-width: 0;
  padding: 0 0.1rem;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray10};
  text-decoration: none;

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.7rem;
    font-weight: 700;
    white-space: nowrap;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
    font-weight: 740;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (max-width: 980px) {
    display: none;
  }
`

const SettingsLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 0.42rem;
  min-height: 2.75rem;
  padding: 0 0.72rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  text-decoration: none;

  span {
    white-space: nowrap;
    font-size: 0.82rem;
    font-weight: 760;
  }

  &:hover {
    background: ${({ theme }) => theme.colors.gray2};
    border-color: ${({ theme }) => theme.colors.gray6};
    color: ${({ theme }) => theme.colors.blue9};
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue7};
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12);
  }
`
