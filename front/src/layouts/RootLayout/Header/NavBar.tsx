import styled from "@emotion/styled"
import Link from "next/link"
import { useRouter } from "next/router"
import { Suspense, lazy, useEffect, useState } from "react"
import ThemeToggle from "./ThemeToggle"

type Props = {
  showThemeToggle?: boolean
}

const primaryLinks = [
  ["notes", "Notes", "/"],
  ["topics", "Topics", "/#topics"],
  ["about", "About", "/about"],
] as const

const NotificationBell = lazy(() => import("./NotificationBell"))

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" strokeLinecap="round" />
  </svg>
)

const BellIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
    <path d="M10.35 20a1.8 1.8 0 0 0 3.3 0" strokeLinecap="round" />
    <path d="M5.2 16.2c1.1-1.1 1.95-2.54 1.95-5A4.85 4.85 0 0 1 12 6.35a4.85 4.85 0 0 1 4.85 4.85c0 2.46.85 3.9 1.95 5H5.2Z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const NavBar = ({ showThemeToggle = true }: Props) => {
  const router = useRouter()
  const [hasSessionCookie, setHasSessionCookie] = useState(false)

  useEffect(() => {
    setHasSessionCookie(document.cookie.includes("apiKey="))
  }, [])

  return (
    <StyledWrapper>
      <ul className="primaryLinks">
        {primaryLinks.map(([id, name, to]) => (
          <li key={id}>
            <Link
              href={to}
              data-ui="nav-control"
              data-active={
                (id === "notes" && router.pathname === "/") ||
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

        {hasSessionCookie ? (
          <div className="bellSlot">
            <Suspense fallback={null}>
              <NotificationBell enabled />
            </Suspense>
          </div>
        ) : (
          <button type="button" className="iconBtn bellSlot" aria-label="알림">
            <BellIcon />
          </button>
        )}

        <Link href="/admin" data-ui="nav-control" className="adminLink">
          Admin
        </Link>

        <button
          type="button"
          className="mobileMenuTrigger"
          data-ui="nav-control"
        >
          Menu
        </button>
      </div>
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
    border-radius: ${({ theme }) => theme.variables.ui.button.radius}px;
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

  .iconBtn {
    width: 36px;
    height: 36px;
    border: 1px solid transparent;
    background: transparent;
    display: grid;
    place-items: center;
    border-radius: ${({ theme }) => theme.variables.ui.button.radius}px;
    color: ${({ theme }) => theme.colors.gray10};
    cursor: pointer;

    &:hover {
      border-color: ${({ theme }) => theme.publicDesign.border};
      background: ${({ theme }) => theme.publicDesign.readableSurface};
      color: ${({ theme }) => theme.colors.gray12};
    }

    svg {
      width: 1.125rem;
      height: 1.125rem;
    }
  }

  .adminLink {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 36px;
    padding: 0 0.75rem;
    border: 1px solid ${({ theme }) => theme.colors.gray12};
    background: ${({ theme }) => theme.colors.gray12};
    color: ${({ theme }) => theme.colors.gray1};
    font-size: 0.75rem;
    font-weight: 750;
    border-radius: ${({ theme }) => theme.variables.ui.button.radius}px;
    text-decoration: none;
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
