import styled from "@emotion/styled"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/router"
import { Suspense, lazy, useState } from "react"
import ThemeToggle from "./ThemeToggle"
import useAuthSession from "src/hooks/useAuthSession"
import { normalizeNextPath } from "src/libs/router"

type Props = {
  showThemeToggle?: boolean
}

const primaryLinks = [
  ["home", "Home", "/"],
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

const NavBar = ({ showThemeToggle = true }: Props) => {
  const router = useRouter()
  const { me, authStatus } = useAuthSession()
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const isAuthenticated = authStatus === "authenticated"
  const isAdmin = authStatus === "authenticated" && Boolean(me?.isAdmin)
  const showLogin = authStatus !== "authenticated"
  const nextPath = normalizeNextPath(router.asPath)

  return (
    <StyledWrapper>
      <ul className="primaryLinks">
        {primaryLinks.map(([id, name, to]) => (
          <li key={id}>
            <Link
              href={to}
              data-ui="nav-control"
              data-active={
                (id === "home" && router.pathname === "/") ||
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
        <button type="button" className="searchTrigger">
          <SearchIcon />
          <span>글과 태그 검색</span>
          <kbd>⌘ K</kbd>
        </button>

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

        <button
          type="button"
          className="mobileMenuTrigger"
          data-ui="nav-control"
        >
          Menu
        </button>
      </div>

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
      min-height: 36px;
      padding: 0 0.68rem;
      border-radius: 0;
      border: none;
      background: transparent;
      color: ${({ theme }) => theme.colors.gray11};
      font-size: 0.8125rem;
      font-weight: 650;
      line-height: 1;

      &:hover {
        color: ${({ theme }) => theme.colors.gray12};
        text-decoration: none;
      }

      &[data-active="true"] {
        color: ${({ theme }) => theme.colors.gray12};
        box-shadow: inset 0 -2px ${({ theme }) => theme.publicDesign.accent};
      }
    }
  }

  .authArea {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.44rem;
    min-width: 0;
    min-height: ${({ theme }) => theme.variables.navControl.height}px;

    > * {
      flex-shrink: 0;
    }
  }

  .searchTrigger {
    height: 36px;
    width: 212px;
    border: 1px solid ${({ theme }) => theme.publicDesign.border};
    background: ${({ theme }) => theme.publicDesign.readableSurface};
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.625rem;
    color: ${({ theme }) => theme.colors.gray9};
    border-radius: 0;
    cursor: pointer;

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
      border: 1px solid ${({ theme }) => theme.publicDesign.border};
      background: ${({ theme }) => theme.publicDesign.surfaceElevated};
      padding: 0.25rem 0.3rem;
      color: ${({ theme }) => theme.colors.gray10};
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 0.625rem;
      line-height: 1;
      font-weight: 600;
    }
  }

  .loginLink,
  .adminLink {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 36px;
    padding: 0 0.75rem;
    font-size: 0.75rem;
    font-weight: 750;
    border-radius: ${({ theme }) => theme.variables.ui.button.radius}px;
    text-decoration: none;
  }

  .loginLink {
    border: 1px solid ${({ theme }) => theme.publicDesign.border};
    background: ${({ theme }) => theme.publicDesign.readableSurface};
    color: ${({ theme }) => theme.colors.gray12};
    cursor: pointer;
  }

  .adminLink {
    border: 1px solid ${({ theme }) => theme.colors.gray12};
    background: ${({ theme }) => theme.colors.gray12};
    color: ${({ theme }) => theme.colors.gray1};
  }

  .mobileMenuTrigger {
    display: none;
    min-height: 36px;
    padding: 0 0.52rem;
    border-radius: ${({ theme }) => theme.variables.navControl.radius}px;
    border: none;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    align-items: center;
    justify-content: center;
    font-size: ${({ theme }) => theme.variables.navControl.fontSize}rem;
    font-weight: 630;
  }

  @media (max-width: 860px) {
    .searchTrigger,
    .bellSlot,
    .loginLink,
    .adminLink {
      display: none;
    }

    .primaryLinks {
      display: flex;
      gap: 0.18rem;
    }

    .authArea {
      gap: 0.28rem;
    }

    .mobileMenuTrigger {
      display: none;
    }
  }

  @media (max-width: 720px) {
    gap: 0.22rem;
  }
`
