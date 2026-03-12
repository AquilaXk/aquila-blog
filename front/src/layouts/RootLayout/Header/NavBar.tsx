import styled from "@emotion/styled"
import Link from "next/link"
import { useRouter } from "next/router"
import useAuthSession from "src/hooks/useAuthSession"
import { isNavigationCancelledError } from "src/libs/router"

const NavBar: React.FC = () => {
  const router = useRouter()
  const { me, authStatus, logout } = useAuthSession()

  const primaryLinks = [{ id: 1, name: "About", to: "/about" }]

  const handleLogout = async () => {
    await logout()

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
        {authStatus === "loading" && (
          <>
            <span className="authSkeleton short" />
            <span className="authSkeleton medium" />
          </>
        )}
        {authStatus === "anonymous" && (
          <>
            <Link href="/login" className="navPill">
              Login
            </Link>
            <Link href="/signup" className="navPill">
              Signup
            </Link>
          </>
        )}
        {authStatus === "unavailable" && !me && <span className="authNotice">Auth unavailable</span>}
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
    gap: 0.28rem;

    li {
      display: block;
    }

    a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 32px;
      padding: 0 0.68rem;
      border-radius: 999px;
      border: 1px solid ${({ theme }) => theme.colors.gray7};
      background: ${({ theme }) => theme.colors.gray3};
      color: ${({ theme }) => theme.colors.gray11};
      font-size: 0.82rem;
      font-weight: 600;
      line-height: 1;
    }
  }

  .authArea {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.55rem;
    min-width: 0;
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

  .authNotice {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.78rem;
    white-space: nowrap;
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

    .primaryLinks {
      a {
        min-height: 30px;
        padding: 0 0.58rem;
        font-size: 0.76rem;
      }
    }

    .authArea {
      min-width: 0;
      gap: 0.4rem;
    }

    .identity {
      display: none;
    }

    .authNotice {
      font-size: 0.74rem;
    }

    .navPill,
    .logoutBtn {
      min-width: 68px;
      height: 30px;
      font-size: 0.76rem;
    }
  }
`
