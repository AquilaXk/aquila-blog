import styled from "@emotion/styled"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/router"
import { useMemo, useState } from "react"
import NotificationBell from "src/layouts/RootLayout/Header/NotificationBell"
import useAuthSession from "src/hooks/useAuthSession"
import { normalizeNextPath, replaceRoute, toLoginPath } from "src/libs/router"

const AuthEntryModal = dynamic(() => import("src/components/auth/AuthEntryModal"), {
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
  const authState = authStatus === "authenticated" && me ? "authenticated" : authStatus

  const primaryLinks = [{ id: 1, name: "About", to: "/about" }]
  const nextPath = useMemo(() => {
    return normalizeNextPath(router.asPath)
  }, [router.asPath])

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

  return (
    <StyledWrapper>
      <ul className="primaryLinks">
        {primaryLinks.map((link) => (
          <li key={link.id}>
            <Link href={link.to}>{link.name}</Link>
          </li>
        ))}
      </ul>
      <div className="authArea" data-auth-state={authState}>
        {authStatus === "loading" && (
          <div className="authLoadingShell" aria-hidden="true">
            <span className="authSkeleton icon" />
            <span className="authSkeleton short" />
            <span className="authSkeleton medium" />
          </div>
        )}
        {authStatus === "anonymous" && (
          <button
            type="button"
            className="navPill"
            onMouseEnter={preloadAuthEntryModal}
            onFocus={preloadAuthEntryModal}
            onClick={() => setAuthModalOpen(true)}
          >
            Login
          </button>
        )}
        {authStatus === "unavailable" && !me && (
          <>
            <button type="button" className="navPill navPill--warning" onClick={() => void handleUnavailableAuthLogin()}>
              Login
            </button>
            <span className="authNotice">Auth check failed</span>
          </>
        )}
        {authStatus === "authenticated" && me && <NotificationBell enabled />}
        {authStatus === "authenticated" && me?.isAdmin && (
          <Link href="/admin" className="navPill">
            Admin
          </Link>
        )}
        {authStatus === "authenticated" && me && (
          <>
            <span className="identity">{me.nickname || me.username}</span>
            <button type="button" onClick={handleLogout} className="logoutBtn">
              Logout
            </button>
          </>
        )}
      </div>
      <AuthEntryModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        nextPath={nextPath}
        title="로그인"
        description="로그인 후 지금 보고 있는 화면으로 바로 돌아옵니다."
        visualTitle="환영합니다!"
        visualDescription="로그인하면 댓글 작성, 관리자 화면, 개인 기능을 같은 흐름 안에서 바로 이어서 사용할 수 있습니다."
      />
    </StyledWrapper>
  )
}

export default NavBar

const StyledWrapper = styled.div`
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
      min-height: 36px;
      padding: 0 0.46rem;
      border-radius: 8px;
      border: none;
      background: transparent;
      color: ${({ theme }) => theme.colors.gray11};
      font-size: 0.87rem;
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
    --auth-area-width: 19rem;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.42rem;
    width: var(--auth-area-width);
    min-width: var(--auth-area-width);
    max-width: var(--auth-area-width);
    min-height: 36px;
    flex: none;
    overflow: hidden;

    > * {
      flex-shrink: 0;
    }
  }

  .authLoadingShell {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.45rem;
    width: 100%;
  }

  .navPill,
  .logoutBtn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 36px;
    padding: 0 0.46rem;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.87rem;
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

  .authSkeleton {
    display: inline-flex;
    height: 14px;
    border-radius: 6px;
    background: ${({ theme }) => theme.colors.gray4};
    opacity: 0.75;
  }

  .authSkeleton.icon {
    width: 18px;
    height: 18px;
    border-radius: 999px;
  }

  .authSkeleton.short {
    width: 52px;
  }

  .authSkeleton.medium {
    width: 92px;
  }

  .identity {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.88rem;
    font-weight: 620;
    max-width: 104px;
    margin: 0 0.1rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .authNotice {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.76rem;
    white-space: nowrap;
  }

  @media (max-width: 980px) {
    .authArea {
      width: auto;
      min-width: 0;
      max-width: none;
      overflow: visible;
    }

    .authNotice {
      display: none;
    }
  }

  @media (max-width: 860px) {
    .authArea {
      gap: 0.32rem;
    }

    .identity {
      display: none;
    }
  }

  .navPill--warning {
    color: ${({ theme }) => theme.colors.blue10};
  }

  @media (max-width: 720px) {
    gap: 0.22rem;

    .primaryLinks {
      gap: 0;

      a {
        min-height: 34px;
        min-width: 52px;
        padding: 0 0.34rem;
        font-size: 0.82rem;
      }
    }

    .authArea {
      min-width: 0;
      gap: 0.26rem;
      width: auto;
    }

    .authNotice {
      font-size: 0.74rem;
    }

    .navPill,
    .logoutBtn {
      min-width: 0;
      min-height: 34px;
      font-size: 0.82rem;
      padding: 0 0.34rem;
    }

    .authSkeleton.short {
      width: 44px;
      height: 12px;
    }

    .authSkeleton.icon {
      width: 15px;
      height: 15px;
    }

    .authSkeleton.medium {
      width: 62px;
      height: 12px;
    }
  }
`
