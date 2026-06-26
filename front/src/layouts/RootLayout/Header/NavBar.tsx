import styled from "@emotion/styled"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/router"
import { Suspense, lazy, useState } from "react"
import ThemeToggle from "./ThemeToggle"
import useAuthSession from "src/hooks/useAuthSession"
import { normalizeNextPath, replaceRoute, toLoginPath } from "src/libs/router"

type Props = {
  showThemeToggle?: boolean
}

const primaryLinks = [
  ["notes", "Notes", "/"],
  ["topics", "Topics", "/#topics"],
  ["about", "About", "/about"],
] as const

const NotificationBell = lazy(() => import("./NotificationBell"))
const AuthEntryModal = dynamic(() => import("src/components/auth/AuthEntryModal"), {
  ssr: false,
  loading: () => null,
})

const preloadAuthEntryModal = () => {
  void import("src/components/auth/AuthEntryModal").then((module) => {
    module.preloadAuthEntryPanels?.("login")
  })
}

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" strokeLinecap="round" />
  </svg>
)

const MenuIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
  </svg>
)

const NavBar = ({ showThemeToggle = true }: Props) => {
  const router = useRouter()
  const { me, authStatus, logout } = useAuthSession()
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const isAuthenticated = authStatus === "authenticated"
  const isAdmin = authStatus === "authenticated" && Boolean(me?.isAdmin)
  const showLogin = authStatus !== "authenticated"
  const nextPath = normalizeNextPath(router.asPath)
  const activeHash = router.asPath.split("#")[1]?.split("?")[0] || ""

  const handleLogout = async () => {
    await logout()

    const isProtectedAuthoringRoute = router.pathname.startsWith("/admin") || router.pathname.startsWith("/editor")
    if (!isProtectedAuthoringRoute) return

    const fallbackPath = router.pathname.startsWith("/editor") ? "/editor/new" : "/admin"
    await replaceRoute(router, toLoginPath(nextPath, fallbackPath), { preferHardNavigation: true })
  }

  return (
    <StyledWrapper>
      <ul className="primaryLinks">
        {primaryLinks.map(([id, name, to]) => (
          <li key={id}>
            <Link
              href={to}
              data-ui="nav-control"
              data-active={
                (id === "notes" && router.pathname === "/" && activeHash !== "topics") ||
                (id === "topics" && router.pathname === "/" && activeHash === "topics") ||
                (id === "about" && router.pathname === "/about")
                  ? "true"
                  : "false"
              }
            >
              {name}
            </Link>
          </li>
        ))}
      </ul>

      <div className="authArea">
        <Link
          href={{ pathname: "/", hash: "feed-search-input" }}
          className="searchTrigger"
          aria-label="글과 태그 검색으로 이동"
        >
          <SearchIcon />
          <span>글과 태그 검색</span>
          <kbd>⌘ K</kbd>
        </Link>

        {showThemeToggle ? <ThemeToggle /> : null}

        {showLogin ? (
          <button
            type="button"
            data-ui="nav-control"
            className="loginLink"
            onMouseEnter={preloadAuthEntryModal}
            onFocus={preloadAuthEntryModal}
            onClick={() => {
              preloadAuthEntryModal()
              setAuthModalOpen(true)
            }}
          >
            Login
          </button>
        ) : null}

        {isAuthenticated ? (
          <div className="bellSlot">
            <Suspense fallback={null}>
              <NotificationBell enabled />
            </Suspense>
          </div>
        ) : null}

        {isAdmin ? (
          <Link href="/admin" data-ui="nav-control" className="adminLink">
            Admin
          </Link>
        ) : null}

        {isAuthenticated ? (
          <button type="button" data-ui="nav-control" className="logoutBtn" onClick={() => void handleLogout()}>
            Logout
          </button>
        ) : null}

        <button
          type="button"
          className="mobileMenuButton"
          aria-label="메뉴 열기"
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((value) => !value)}
        >
          <MenuIcon />
        </button>
      </div>

      {mobileMenuOpen ? (
        <div className="mobileMenuPanel">
          {primaryLinks.map(([, name, to]) => (
            <Link key={to} href={to} onClick={() => setMobileMenuOpen(false)}>
              {name}
            </Link>
          ))}
          {isAdmin ? (
            <Link href="/admin" onClick={() => setMobileMenuOpen(false)}>
              Admin
            </Link>
          ) : null}
          {showLogin ? (
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false)
                preloadAuthEntryModal()
                setAuthModalOpen(true)
              }}
            >
              Login
            </button>
          ) : null}
          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false)
                void handleLogout()
              }}
            >
              Logout
            </button>
          ) : null}
        </div>
      ) : null}

      <AuthEntryModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        nextPath={nextPath}
        title="로그인"
      />
    </StyledWrapper>
  )
}

export default NavBar

const StyledWrapper = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 2rem;
  min-width: 0;
  width: 100%;

  .primaryLinks {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;

    li {
      display: block;
    }

    a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 34px;
      padding: 0 11px;
      border-radius: 0;
      border: none;
      background: transparent;
      color: var(--aq-muted);
      font-size: 0.8125rem;
      font-weight: 650;
      line-height: 1;

      &:hover {
        color: var(--aq-text);
        text-decoration: none;
      }

      &[data-active="true"] {
        color: var(--aq-text);
        box-shadow: inset 0 -2px var(--aq-accent);
      }
    }
  }

  .authArea {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 7px;
    min-width: 0;
    min-height: 36px;

    > * {
      flex-shrink: 0;
    }
  }

  .searchTrigger {
    height: 36px;
    width: 212px;
    border: 1px solid var(--aq-border);
    background: var(--aq-surface);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.625rem;
    color: var(--aq-muted);
    border-radius: 6px;
    cursor: pointer;
    text-decoration: none;

    svg {
      width: 0.9375rem;
      height: 0.9375rem;
    }

    span {
      flex: 1;
      min-width: 0;
      text-align: left;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 0.75rem;
      font-weight: 600;
    }

    kbd {
      border: 1px solid var(--aq-border);
      background: var(--aq-surface-elevated);
      padding: 0.25rem 0.3rem;
      color: var(--aq-muted);
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 0.625rem;
      line-height: 1;
      font-weight: 600;
    }
  }

  .loginLink,
  .adminLink,
  .logoutBtn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 36px;
    padding: 0 0.75rem;
    font-size: 0.75rem;
    font-weight: 750;
    border-radius: 6px;
    text-decoration: none;
  }

  .loginLink {
    border: 1px solid var(--aq-border);
    background: var(--aq-surface);
    color: var(--aq-text);
    cursor: pointer;
  }

  .adminLink {
    border: 1px solid var(--aq-text);
    background: var(--aq-text);
    color: var(--aq-page-bg);
  }

  .logoutBtn {
    border: 1px solid var(--aq-border);
    background: var(--aq-surface);
    color: var(--aq-text);
    cursor: pointer;
  }

  .mobileMenuButton {
    display: none;
    place-items: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--aq-muted);
    cursor: pointer;

    svg {
      width: 18px;
      height: 18px;
    }

    &:hover,
    &[aria-expanded="true"] {
      border-color: var(--aq-border);
      background: var(--aq-surface);
      color: var(--aq-text);
    }
  }

  .mobileMenuPanel {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 2;
    display: none;
    width: 180px;
    border: 1px solid var(--aq-border-strong);
    background: var(--aq-surface);
    padding: 6px;

    a,
    button {
      display: flex;
      width: 100%;
      min-height: 34px;
      align-items: center;
      border: 0;
      background: transparent;
      color: var(--aq-text);
      padding: 0 10px;
      text-align: left;
      text-decoration: none;
      font-size: 13px;
      font-weight: 650;
      cursor: pointer;
    }
  }

  @media (max-width: 820px) {
    .primaryLinks,
    .searchTrigger,
    .loginLink,
    .adminLink,
    .logoutBtn {
      display: none;
    }

    .authArea {
      gap: 7px;
    }

    .mobileMenuButton {
      display: grid;
    }

    .mobileMenuPanel {
      display: grid;
    }
  }
`
