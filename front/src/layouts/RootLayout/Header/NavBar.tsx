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

    const loadMe = async () => {
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
    window.addEventListener("focus", onFocus)

    return () => {
      mounted = false
      window.removeEventListener("focus", onFocus)
    }
  }, [router.asPath])

  const guestLinks = [
    { id: 1, name: "About", to: "/about" },
    { id: 2, name: "Login", to: "/login" },
    { id: 3, name: "Signup", to: "/signup" },
  ]

  const memberLinks = [{ id: 1, name: "About", to: "/about" }]

  const links = me ? memberLinks : isAuthResolved ? guestLinks : [{ id: 1, name: "About", to: "/about" }]

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
      <ul>
        {links.map((link) => (
          <li key={link.id}>
            <Link href={link.to}>{link.name}</Link>
          </li>
        ))}
        {me?.isAdmin && (
          <li>
            <Link href="/admin">Admin</Link>
          </li>
        )}
        {me && (
          <>
            <li className="identity">{me.nickname || me.username}</li>
            <li>
              <button type="button" onClick={handleLogout} className="logoutBtn">
                Logout
              </button>
            </li>
          </>
        )}
      </ul>
    </StyledWrapper>
  )
}

export default NavBar

const StyledWrapper = styled.div`
  flex-shrink: 0;
  ul {
    display: flex;
    flex-direction: row;
    align-items: center;
    li {
      display: block;
      margin-left: 1rem;
      color: ${({ theme }) => theme.colors.gray11};
    }
  }

  .identity {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.85rem;
  }

  .logoutBtn {
    border: 1px solid ${({ theme }) => theme.colors.gray7};
    border-radius: 999px;
    padding: 0.22rem 0.55rem;
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.78rem;
    cursor: pointer;
  }
`
