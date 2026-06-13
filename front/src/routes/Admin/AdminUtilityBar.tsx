import styled from "@emotion/styled"
import Link from "next/link"
import { useRouter } from "next/router"
import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react"
import AppIcon, { type IconName } from "src/components/icons/AppIcon"
import { pushRoute } from "src/libs/router"
import {
  adminBorder,
  adminBorderStrong,
  adminFocusRing,
  adminGold,
  adminSurface,
  adminSurfaceAccent,
  adminSurfaceRaised,
  adminTextMuted,
  adminTextPrimary,
  adminTextSecondary,
} from "src/routes/Admin/adminColorTokens"

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
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
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
    setIsSearchOpen(false)
    void pushRoute(router, href)
  }

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextMatch = shortcutItems.find((item) => matchesShortcut(item, query))
    if (!nextMatch) return
    navigate(nextMatch.href)
  }

  const handleSearchToggle = () => {
    setIsSearchOpen((current) => !current)
  }

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Escape") return
    setQuery("")
    setIsSearchOpen(false)
  }

  useEffect(() => {
    if (!isSearchOpen) return
    searchInputRef.current?.focus()
  }, [isSearchOpen])

  return (
    <UtilityBar data-search-open={isSearchOpen ? "true" : "false"}>
      <CompactNav aria-label="관리자 바로가기">
        {navItems.map((item) => (
          <Link key={`compact-${item.key}`} href={item.href} passHref legacyBehavior>
            <CompactNavLink data-active={item.active ? "true" : "false"} title={item.label} aria-label={item.label}>
              <AppIcon name={item.icon} />
            </CompactNavLink>
          </Link>
        ))}
      </CompactNav>

      <SearchForm role="search" onSubmit={handleSearchSubmit} data-open={isSearchOpen ? "true" : "false"}>
        <SearchField>
          <span className="searchIcon" aria-hidden="true">
            <AppIcon name="search" />
          </span>
          <SearchInput
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="페이지 검색"
            aria-label="관리자 검색"
          />
        </SearchField>
      </SearchForm>

      <UtilityActions>
        <SearchToggleButton
          type="button"
          aria-label={isSearchOpen ? "관리자 검색 닫기" : "관리자 검색 열기"}
          aria-expanded={isSearchOpen}
          onClick={handleSearchToggle}
        >
          <AppIcon name="search" />
        </SearchToggleButton>
        <CurrentViewChip aria-label="현재 화면">
          <span>현재</span>
          <strong>{currentLabel}</strong>
        </CurrentViewChip>
      </UtilityActions>
    </UtilityBar>
  )
}

export default AdminUtilityBar

const UtilityBar = styled.header`
  position: sticky;
  top: var(--app-header-height, 73px);
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.72rem;
  min-height: 3.95rem;
  padding: 0.62rem 1.45rem;
  border-bottom: 1px solid ${adminBorder};
  background: ${adminSurfaceRaised};
  box-shadow: none;

  @media (max-width: 720px) {
    top: var(--app-header-height, 73px);
    position: sticky;
    align-items: center;
    gap: 0.48rem;
    padding: 0.58rem 0.82rem;

    &[data-search-open="true"] {
      margin-bottom: 3.15rem;
    }
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
    width: auto;
    flex: 1;
    min-width: 0;
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
  border-radius: 4px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border: 1px solid transparent;
  background: transparent;
  color: ${adminTextSecondary};
  text-decoration: none;

  &[data-active="true"] {
    border-color: ${adminBorderStrong};
    background: ${adminSurfaceAccent};
    color: ${adminGold};
  }
`

const SearchForm = styled.form`
  flex: 1;
  min-width: 0;

  @media (max-width: 720px) {
    display: none;
    position: absolute;
    top: calc(100% + 0.42rem);
    left: 0;
    right: 0;
    z-index: 2;

    &[data-open="true"] {
      display: block;
    }
  }
`

const SearchField = styled.div`
  position: relative;
  display: flex;
  align-items: center;

  .searchIcon {
    position: absolute;
    left: 0.9rem;
    color: ${adminTextMuted};
    display: inline-flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  @media (max-width: 720px) {
    border-radius: 999px;
    box-shadow: ${({ theme }) =>
      theme.scheme === "light"
        ? "0 14px 28px rgba(15, 23, 42, 0.12)"
        : "0 16px 30px rgba(0, 0, 0, 0.32)"};
  }
`

const SearchInput = styled.input`
  width: 100%;
  min-width: 0;
  height: 2.58rem;
  padding: 0 0.92rem 0 2.55rem;
  border: 1px solid ${adminBorder};
  border-radius: 999px;
  background: ${adminSurface};
  color: ${adminTextPrimary};
  font-size: 0.88rem;
  font-weight: 600;

  &::placeholder {
    color: ${adminTextMuted};
  }

  &:focus {
    outline: none;
    border-color: ${adminBorderStrong};
    box-shadow: ${({ theme }) => adminFocusRing(theme, 4)};
  }
`

const UtilityActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.52rem;

  @media (max-width: 720px) {
    justify-content: flex-start;
    flex-wrap: nowrap;
    flex-shrink: 0;
  }
`

const SearchToggleButton = styled.button`
  display: none;

  @media (max-width: 720px) {
    width: 2.75rem;
    height: 2.75rem;
    border: 1px solid ${adminBorder};
    border-radius: 4px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    background: ${adminSurfaceRaised};
    color: ${adminTextSecondary};
    cursor: pointer;

    &[aria-expanded="true"] {
      border-color: ${adminBorderStrong};
      background: ${adminSurfaceAccent};
      color: ${adminGold};
    }

    &:focus-visible {
      outline: none;
      box-shadow: ${({ theme }) => adminFocusRing(theme, 4)};
    }
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
  color: ${adminTextMuted};
  text-decoration: none;

  span {
    color: ${adminTextMuted};
    font-size: 0.7rem;
    font-weight: 700;
    white-space: nowrap;
  }

  strong {
    color: ${adminTextMuted};
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
