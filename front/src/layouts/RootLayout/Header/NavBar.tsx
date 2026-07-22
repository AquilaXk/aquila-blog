import styled from "@emotion/styled"
import { control, layoutBreakpoint } from "src/design-system/tokens"
import { useModalFocusTrap } from "src/design-system/useModalFocusTrap"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/router"
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import useAuthSession from "src/hooks/useAuthSession"
import { normalizeNextPath, replaceRoute, toLoginPath } from "src/libs/router"
import { waitForFeedSearchInputFocus } from "src/routes/Feed/feedSearchFocus"
import { zIndexes } from "src/styles/zIndexes"

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

const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true

  const tagName = target.tagName
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT"
}

const FEED_SEARCH_ROUTE_TIMEOUT_MS = 8_000
const SEARCH_SHORTCUT_HINT = "⌘K"

const reportFocusFeedSearchFailure = (error: unknown) => {
  console.error("[NavBar] failed to focus feed search input", error)
}

const waitForFocusTrapRestore = () =>
  new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve())
    })
  })

const NavBar = () => {
  const router = useRouter()
  const { me, authStatus, logout } = useAuthSession()
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null)
  const mobileMenuPanelRef = useRef<HTMLDivElement>(null)
  const authReturnFocusRef = useRef<HTMLElement | null>(null)
  const authModalOpenRef = useRef(authModalOpen)
  const isAuthenticated = authStatus === "authenticated"
  const isAdmin = authStatus === "authenticated" && Boolean(me?.isAdmin)
  const showLogin = authStatus !== "authenticated"
  const nextPath = normalizeNextPath(router.asPath)
  const [activeHash, setActiveHash] = useState<string | null>(null)
  const focusFeedSearchInFlightRef = useRef<Promise<void> | null>(null)

  authModalOpenRef.current = authModalOpen

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false)
  }, [])

  const { handleKeyDown: handleMobileMenuKeyDown } = useModalFocusTrap({
    open: mobileMenuOpen,
    onClose: closeMobileMenu,
    containerRef: mobileMenuPanelRef,
    returnFocusRef: mobileMenuButtonRef,
    paused: authModalOpen,
  })

  useEffect(() => {
    const syncHash = () => setActiveHash(window.location.hash.replace(/^#/, "").split("?")[0] || "")
    syncHash()
    window.addEventListener("hashchange", syncHash)
    return () => window.removeEventListener("hashchange", syncHash)
  }, [])

  useEffect(() => {
    if (!mobileMenuOpen) return
    const media = window.matchMedia(`(max-width: ${layoutBreakpoint.navCompact}px)`)
    const closeWhenDesktop = () => {
      if (!media.matches) setMobileMenuOpen(false)
    }
    closeWhenDesktop()
    media.addEventListener("change", closeWhenDesktop)
    return () => media.removeEventListener("change", closeWhenDesktop)
  }, [mobileMenuOpen])

  const focusFeedSearch = useCallback(() => {
    if (focusFeedSearchInFlightRef.current) {
      return focusFeedSearchInFlightRef.current
    }

    const run = (async () => {
      if (router.pathname !== "/") {
        await new Promise<void>((resolve, reject) => {
          let settled = false
          let timeoutId: ReturnType<typeof setTimeout> | undefined
          const cleanup = () => {
            if (timeoutId !== undefined) clearTimeout(timeoutId)
            router.events.off("routeChangeComplete", handleComplete)
            router.events.off("routeChangeError", handleError)
          }
          const settle = (action: () => void) => {
            if (settled) return
            settled = true
            cleanup()
            action()
          }
          const handleComplete = (url: string) => {
            const pathname = new URL(url, window.location.origin).pathname
            if (pathname === "/") {
              settle(() => resolve())
              return
            }
            settle(() => reject(new Error(`unexpected route after search navigation: ${url}`)))
          }
          const handleError = (error: Error) => {
            settle(() => reject(error))
          }

          router.events.on("routeChangeComplete", handleComplete)
          router.events.on("routeChangeError", handleError)
          timeoutId = setTimeout(() => {
            settle(() => reject(new Error("timed out waiting for feed search route")))
          }, FEED_SEARCH_ROUTE_TIMEOUT_MS)
          void router.push("/").catch((error: unknown) => {
            settle(() => reject(error instanceof Error ? error : new Error(String(error))))
          })
        })
      }

      if (authModalOpenRef.current) {
        throw new Error("feed search focus aborted: auth modal open")
      }

      const focused = await waitForFeedSearchInputFocus()
      if (!focused) {
        throw new Error("Failed to focus feed search input")
      }
      if (authModalOpenRef.current) {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
        }
        throw new Error("feed search focus aborted: auth modal open")
      }
    })()

    focusFeedSearchInFlightRef.current = run
    void run
      .finally(() => {
        if (focusFeedSearchInFlightRef.current === run) {
          focusFeedSearchInFlightRef.current = null
        }
      })
      .catch(() => {
        // call-site handlers report the rejection; absorb finally-chain rejection only
      })

    return run
  }, [router])

  const requestFocusFeedSearch = useCallback(() => {
    if (authModalOpen) return
    const wasMenuOpen = mobileMenuOpen
    setMobileMenuOpen(false)
    void (async () => {
      if (wasMenuOpen) {
        await waitForFocusTrapRestore()
      }
      await focusFeedSearch()
    })().catch(reportFocusFeedSearchFailure)
  }, [authModalOpen, focusFeedSearch, mobileMenuOpen])

  useEffect(() => {
    if (typeof window === "undefined") return

    const handleKeyDown = (event: KeyboardEvent) => {
      const isSearchShortcut =
        (event.metaKey || event.ctrlKey) &&
        (event.key.toLowerCase() === "k" || event.code === "KeyK")
      if (!isSearchShortcut) return
      if (authModalOpen || event.defaultPrevented || isTypingTarget(event.target)) return

      event.preventDefault()
      requestFocusFeedSearch()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [authModalOpen, requestFocusFeedSearch])

  const handleLogout = async () => {
    await logout()

    const isProtectedAuthoringRoute = router.pathname.startsWith("/admin") || router.pathname.startsWith("/editor")
    if (!isProtectedAuthoringRoute) return

    const fallbackPath = router.pathname.startsWith("/editor") ? "/editor/new" : "/admin"
    await replaceRoute(router, toLoginPath(nextPath, fallbackPath), { preferHardNavigation: true })
  }

  const mobileMenu =
    typeof document !== "undefined" && mobileMenuOpen
      ? createPortal(
          <MobileMenuLayer data-ui="mobile-nav-menu">
            <MobileMenuBackdrop role="presentation" onClick={closeMobileMenu} />
            <MobileMenuPanel
              ref={mobileMenuPanelRef}
              role="dialog"
              aria-modal="true"
              aria-label="메뉴"
              className="mobileMenuPanel"
              onKeyDown={handleMobileMenuKeyDown}
            >
              <button
                type="button"
                data-ui="mobile-nav-search"
                aria-keyshortcuts="Meta+K Control+K"
                onClick={requestFocusFeedSearch}
              >
                <span>검색</span>
                <kbd>{SEARCH_SHORTCUT_HINT}</kbd>
              </button>
              {primaryLinks.map(([, name, to]) => (
                <Link key={to} href={to} onClick={closeMobileMenu}>
                  {name}
                </Link>
              ))}
              {isAdmin ? (
                <Link href="/admin" onClick={closeMobileMenu}>
                  Admin
                </Link>
              ) : null}
              {showLogin ? (
                <button
                  type="button"
                  onClick={() => {
                    authReturnFocusRef.current = mobileMenuButtonRef.current
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
            </MobileMenuPanel>
          </MobileMenuLayer>,
          document.body
        )
      : null

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
        <button
          type="button"
          className="searchTrigger"
          aria-label="글과 태그 검색으로 이동"
          aria-keyshortcuts="Meta+K Control+K"
          onClick={requestFocusFeedSearch}
        >
          <SearchIcon />
          <span>글과 태그 검색</span>
          <kbd>⌘ K</kbd>
        </button>

        {showLogin ? (
          <button
            type="button"
            data-ui="nav-control"
            className="loginLink"
            onMouseEnter={preloadAuthEntryModal}
            onFocus={preloadAuthEntryModal}
            onClick={(event) => {
              authReturnFocusRef.current = event.currentTarget
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
          ref={mobileMenuButtonRef}
          type="button"
          className="mobileMenuButton"
          aria-label="메뉴"
          aria-expanded={mobileMenuOpen}
          aria-haspopup="dialog"
          onClick={() => setMobileMenuOpen((value) => !value)}
        >
          <MenuIcon />
        </button>
      </div>

      {mobileMenu}

      <AuthEntryModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        nextPath={nextPath}
        title="로그인"
        returnFocusRef={authReturnFocusRef}
      />
    </StyledWrapper>
  )
}

export default NavBar

const MobileMenuLayer = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${zIndexes.dropdownMenu};
  pointer-events: none;
`

const MobileMenuBackdrop = styled.div`
  position: fixed;
  top: var(--app-header-height, 58px);
  right: 0;
  bottom: 0;
  left: 0;
  z-index: ${zIndexes.dropdownMenu};
  background: color-mix(in srgb, var(--aq-text) 28%, transparent);
  pointer-events: auto;
`

const MobileMenuPanel = styled.div`
  position: fixed;
  top: calc(var(--app-header-height, 58px) + 8px);
  right: max(0.75rem, env(safe-area-inset-right, 0px));
  z-index: ${zIndexes.dropdownMenu};
  display: grid;
  width: min(220px, calc(100vw - 1.5rem));
  border: 1px solid var(--aq-border-strong);
  background: var(--aq-surface);
  padding: 6px;
  pointer-events: auto;

  a,
  button {
    display: flex;
    width: 100%;
    min-height: ${control.lg}px;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
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

  kbd {
    border: 1px solid var(--aq-border);
    background: var(--aq-surface-elevated);
    padding: 0.2rem 0.3rem;
    color: var(--aq-muted);
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 0.625rem;
    line-height: 1;
    font-weight: 600;
  }
`

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
    width: ${control.lg}px;
    height: ${control.lg}px;
    min-width: ${control.lg}px;
    min-height: ${control.lg}px;
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

  @media (max-width: ${layoutBreakpoint.navCompact}px) {
    .primaryLinks a {
      min-height: ${control.lg}px;
      padding: 0 12px;
    }

    .authArea {
      gap: 7px;
      min-height: ${control.lg}px;
    }

    .searchTrigger {
      height: ${control.lg}px;
      min-height: ${control.lg}px;
    }

    .loginLink,
    .adminLink,
    .logoutBtn {
      height: ${control.lg}px;
      min-height: ${control.lg}px;
    }

    .primaryLinks,
    .searchTrigger,
    .loginLink,
    .adminLink,
    .logoutBtn {
      display: none;
    }

    .mobileMenuButton {
      display: grid;
    }
  }
`
