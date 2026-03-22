import styled from "@emotion/styled"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/router"
import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import useAuthSession from "src/hooks/useAuthSession"
import { normalizeNextPath, replaceRoute, toLoginPath } from "src/libs/router"
import { zIndexes } from "src/styles/zIndexes"

const AuthEntryModal = dynamic(() => import("src/components/auth/AuthEntryModal"), {
  ssr: false,
  loading: () => null,
})
const NotificationBell = dynamic(() => import("src/layouts/RootLayout/Header/NotificationBell"), {
  ssr: false,
  loading: () => null,
})

const preloadAuthEntryModal = () => {
  void import("src/components/auth/AuthEntryModal").then((module) => {
    module.preloadAuthEntryPanels?.("login")
  })
}

const NavBar: React.FC = () => {
  const router = useRouter()
  const { me, authStatus, logout } = useAuthSession()
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isClientMounted, setIsClientMounted] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const mobileMenuRef = useRef<HTMLDivElement | null>(null)
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null)

  const isAuthenticated = Boolean(me) && (authStatus === "authenticated" || authStatus === "unavailable")
  const isAdmin = Boolean(isAuthenticated && me?.isAdmin)
  const authState = isAuthenticated ? "authenticated" : authStatus

  const primaryLinks = useMemo(
    () => [
      { id: "about", name: "About", to: "/about" },
      ...(isAdmin ? [{ id: "admin", name: "Admin", to: "/admin" }] : []),
    ],
    [isAdmin]
  )

  const nextPath = useMemo(() => {
    return normalizeNextPath(router.asPath)
  }, [router.asPath])

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [router.asPath])

  useEffect(() => {
    setIsClientMounted(true)
  }, [])

  useEffect(() => {
    if (!mobileMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      const isInsideRoot = rootRef.current?.contains(target)
      const isInsideMenu = mobileMenuRef.current?.contains(target)
      const isInsideTrigger = menuTriggerRef.current?.contains(target)
      if (!isInsideRoot && !isInsideMenu && !isInsideTrigger) {
        setMobileMenuOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setMobileMenuOpen(false)
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleEscape)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [mobileMenuOpen])

  useEffect(() => {
    if (typeof document === "undefined") return
    if (!mobileMenuOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [mobileMenuOpen])

  const handleLogout = async () => {
    await logout()

    if (router.pathname.startsWith("/admin")) {
      const target = toLoginPath(nextPath, "/admin")
      if (router.asPath !== target) {
        await replaceRoute(router, target, { preferHardNavigation: true })
      }
    }
  }

  const handleUnavailableAuthLogin = async () => {
    const target = toLoginPath(nextPath)
    await replaceRoute(router, target, { preferHardNavigation: true })
  }

  const openLoginModal = () => {
    preloadAuthEntryModal()
    setAuthModalOpen(true)
  }

  const showImmediateLoginAction = authStatus === "loading" || authStatus === "anonymous"
  const showUnavailableAuthAction = authStatus === "unavailable" && !me

  return (
    <StyledWrapper ref={rootRef}>
      <ul className="primaryLinks">
        {primaryLinks.map((link) => (
          <li key={link.id}>
            <Link href={link.to} data-ui="nav-control">
              {link.name}
            </Link>
          </li>
        ))}
      </ul>

      <div className="authArea" data-auth-state={authState}>
        {showImmediateLoginAction && (
          <button
            type="button"
            className="navPill"
            data-ui="nav-control"
            onMouseEnter={preloadAuthEntryModal}
            onFocus={preloadAuthEntryModal}
            onClick={openLoginModal}
          >
            Login
          </button>
        )}

        {showUnavailableAuthAction && (
          <>
            <button
              type="button"
              className="navPill navPill--warning"
              data-ui="nav-control"
              onClick={() => void handleUnavailableAuthLogin()}
            >
              Login
            </button>
            <span className="authNotice">Auth check failed</span>
          </>
        )}

        {isAuthenticated && <NotificationBell enabled />}

        {isAuthenticated && (
          <button type="button" onClick={handleLogout} className="logoutBtn" data-ui="nav-control">
            Logout
          </button>
        )}

        <button
          ref={menuTriggerRef}
          type="button"
          className="mobileMenuTrigger"
          data-ui="nav-control"
          aria-label="헤더 메뉴 열기"
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((value) => !value)}
        >
          Menu
        </button>
      </div>

      {isClientMounted && mobileMenuOpen
        ? createPortal(
            <>
              <MobileMenuBackdrop type="button" aria-label="모바일 메뉴 닫기" onClick={() => setMobileMenuOpen(false)} />
              <MobileMenuPortal ref={mobileMenuRef} role="menu" aria-label="모바일 네비게이션">
                {primaryLinks.map((link) => (
                  <Link key={link.id} href={link.to} role="menuitem" onClick={() => setMobileMenuOpen(false)}>
                    {link.name}
                  </Link>
                ))}

                {(showImmediateLoginAction || showUnavailableAuthAction) && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMobileMenuOpen(false)
                      if (showUnavailableAuthAction) {
                        void handleUnavailableAuthLogin()
                      } else {
                        openLoginModal()
                      }
                    }}
                  >
                    Login
                  </button>
                )}

                {isAuthenticated && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMobileMenuOpen(false)
                      void handleLogout()
                    }}
                  >
                    Logout
                  </button>
                )}
              </MobileMenuPortal>
            </>,
            document.body
          )
        : null}

      <AuthEntryModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        nextPath={nextPath}
        title="로그인"
        description="로그인 후 지금 보고 있는 화면으로 바로 돌아옵니다."
      />
    </StyledWrapper>
  )
}

export default NavBar

const StyledWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.46rem;
  flex-shrink: 0;

  .primaryLinks {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.04rem;
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
      min-height: ${({ theme }) => theme.variables.navControl.height}px;
      padding: 0 0.46rem;
      border-radius: ${({ theme }) => theme.variables.navControl.radius}px;
      border: none;
      background: transparent;
      color: ${({ theme }) => theme.colors.gray11};
      font-size: ${({ theme }) => theme.variables.navControl.fontSize}rem;
      font-weight: 620;
      line-height: 1;

      &:hover {
        color: ${({ theme }) => theme.colors.gray12};
        text-decoration: underline;
        text-underline-offset: 3px;
        text-decoration-thickness: 1px;
      }
    }
  }

  .authArea {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.42rem;
    width: auto;
    min-width: 0;
    max-width: 100%;
    min-height: ${({ theme }) => theme.variables.navControl.height}px;
    flex: none;
    overflow: visible;

    > * {
      flex-shrink: 0;
    }
  }

  .navPill,
  .logoutBtn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: ${({ theme }) => theme.variables.navControl.height}px;
    padding: 0 0.46rem;
    border-radius: ${({ theme }) => theme.variables.navControl.radius}px;
    border: none;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: ${({ theme }) => theme.variables.navControl.fontSize}rem;
    font-weight: 630;
    cursor: pointer;
    line-height: 1;

    &:hover {
      color: ${({ theme }) => theme.colors.gray12};
      text-decoration: underline;
      text-underline-offset: 3px;
      text-decoration-thickness: 1px;
    }
  }

  .authNotice {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.76rem;
    white-space: nowrap;
  }

  .navPill--warning {
    color: ${({ theme }) => theme.colors.blue10};
  }

  .mobileMenuTrigger {
    display: none;
    min-height: ${({ theme }) => theme.variables.navControl.height}px;
    padding: 0 0.52rem;
    border-radius: ${({ theme }) => theme.variables.navControl.radius}px;
    border: none;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    align-items: center;
    justify-content: center;
    font-size: ${({ theme }) => theme.variables.navControl.fontSize}rem;
    font-weight: 630;
    line-height: 1;

    &:hover {
      color: ${({ theme }) => theme.colors.gray12};
      text-decoration: underline;
      text-underline-offset: 3px;
      text-decoration-thickness: 1px;
    }
  }

  @media (max-width: 980px) {
    .authNotice {
      display: none;
    }
  }

  @media (max-width: 860px) {
    .primaryLinks,
    .navPill,
    .logoutBtn {
      display: none;
    }

    .authArea {
      gap: 0.28rem;
    }

    .mobileMenuTrigger {
      display: inline-flex;
    }
  }

  @media (max-width: 720px) {
    gap: 0.22rem;

    .authArea {
      width: auto;
      min-width: 0;
      max-width: 100%;
      overflow: visible;
    }

  }
`

const MobileMenuBackdrop = styled.button`
  position: fixed;
  inset: 0;
  z-index: ${zIndexes.dropdownMenu + 2};
  border: 0;
  padding: 0;
  margin: 0;
  background: rgba(2, 6, 23, 0.5);
  cursor: default;
`

const MobileMenuPortal = styled.div`
  position: fixed;
  top: calc(var(--app-header-height, 56px) + 0.5rem + env(safe-area-inset-top, 0px));
  right: max(0.62rem, env(safe-area-inset-right, 0px));
  min-width: 10rem;
  display: grid;
  gap: 0.18rem;
  padding: 0.45rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  box-shadow: 0 20px 42px rgba(0, 0, 0, 0.46);
  z-index: ${zIndexes.dropdownMenu + 3};

  a,
  button {
    border: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    min-height: 36px;
    border-radius: 8px;
    padding: 0 0.66rem;
    font-size: 0.85rem;
    font-weight: 620;
    text-decoration: none;

    &:hover {
      color: ${({ theme }) => theme.colors.gray12};
      background: ${({ theme }) => theme.colors.gray3};
    }
  }
`
