import styled from "@emotion/styled"
import Link from "next/link"
import { useRouter } from "next/router"
import { useEffect, useState } from "react"
import { apiFetch } from "src/apis/backend/client"
import { isNavigationCancelledError } from "src/libs/router"

type MemberMe = {
  id: number
  username: string
  nickname?: string
  isAdmin?: boolean
}

const NavBar: React.FC = () => {
  const router = useRouter()
  const [me, setMe] = useState<MemberMe | null>(null)
  const [isAuthResolved, setIsAuthResolved] = useState(false)

  useEffect(() => {
    let mounted = true
    const shouldSkipAuthCheck = router.pathname === "/login" || router.pathname === "/signup"

    const loadMe = async () => {
      if (shouldSkipAuthCheck) {
        if (!mounted) return
        setMe(null)
        setIsAuthResolved(true)
        return
      }

      try {
        const member = await apiFetch<MemberMe>("/member/api/v1/auth/me")
        if (!mounted) return
        setMe(member)
      } catch {
        if (!mounted) return
        setMe(null)
      } finally {
        if (mounted) setIsAuthResolved(true)
      }
    }

    void loadMe()

    const onFocus = () => void loadMe()
    const onRouteDone = () => void loadMe()
    window.addEventListener("focus", onFocus)
    router.events.on("routeChangeComplete", onRouteDone)

    return () => {
      mounted = false
      window.removeEventListener("focus", onFocus)
      router.events.off("routeChangeComplete", onRouteDone)
    }
  }, [router.events, router.pathname])

  const primaryLinks = [{ id: 1, name: "About", to: "/about" }]

  const handleLogout = async () => {
    try {
      await apiFetch("/member/api/v1/auth/logout", { method: "DELETE" })
    } catch {
      // Even if API fails, clear local auth UI state to prevent stale header.
    } finally {
      setMe(null)
      if (router.pathname === "/admin") {
        const target = "/login?next=%2Fadmin"
        if (router.asPath !== target) {
          try {
            await router.replace(target)
          } catch (error) {
            if (!isNavigationCancelledError(error)) {
              console.error("logout redirect failed", error)
            }
          }
        }
      }
    }
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
      <div className="authArea">
        {!isAuthResolved && (
          <>
            <span className="authSkeleton short" />
            <span className="authSkeleton medium" />
          </>
        )}
        {isAuthResolved && !me && (
          <>
            <Link href="/login" className="navPill">
              Login
            </Link>
            <Link href="/signup" className="navPill">
              Signup
            </Link>
          </>
        )}
        {isAuthResolved && me?.isAdmin && (
          <Link href="/admin" className="navPill">
            Admin
          </Link>
        )}
        {isAuthResolved && me && (
          <>
            <span className="identity">{me.nickname || me.username}</span>
            <button type="button" onClick={handleLogout} className="logoutBtn">
              Logout
            </button>
          </>
        )}
      </div>
    </StyledWrapper>
  )
}

export default NavBar

const StyledWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 0.9rem;
  flex-shrink: 0;

  .primaryLinks {
    display: flex;
    flex-direction: row;
    align-items: center;

    li {
      display: block;
      color: ${({ theme }) => theme.colors.gray11};
    }
  }

  .authArea {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.55rem;
    min-width: 230px;
  }

  .navPill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 74px;
    height: 32px;
    padding: 0 0.72rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray7};
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.8rem;
    font-weight: 600;
  }

  .authSkeleton {
    display: inline-flex;
    height: 32px;
    border-radius: 999px;
    background: ${({ theme }) => theme.colors.gray4};
    opacity: 0.9;
  }

  .authSkeleton.short {
    width: 76px;
  }

  .authSkeleton.medium {
    width: 92px;
  }

  .identity {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.85rem;
    max-width: 130px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .logoutBtn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid ${({ theme }) => theme.colors.gray7};
    border-radius: 999px;
    min-width: 82px;
    height: 32px;
    padding: 0 0.62rem;
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
  }

  @media (max-width: 720px) {
    gap: 0.55rem;

    .authArea {
      min-width: 0;
      gap: 0.4rem;
    }

    .identity {
      display: none;
    }

    .navPill,
    .logoutBtn {
      min-width: 68px;
      height: 30px;
      font-size: 0.76rem;
    }
  }
`
