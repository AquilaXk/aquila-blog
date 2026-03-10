import styled from "@emotion/styled"
import Link from "next/link"
import { useEffect, useState } from "react"
import { apiFetch } from "src/apis/backend/client"

type MemberMe = {
  isAdmin?: boolean
}

const NavBar: React.FC = () => {
  const [showAdmin, setShowAdmin] = useState(false)

  useEffect(() => {
    let mounted = true

    const loadMe = async () => {
      try {
        const me = await apiFetch<MemberMe>("/member/api/v1/auth/me")
        if (!mounted) return
        setShowAdmin(Boolean(me?.isAdmin))
      } catch {
        if (!mounted) return
        setShowAdmin(false)
      }
    }

    void loadMe()

    return () => {
      mounted = false
    }
  }, [])

  const links = [
    { id: 1, name: "About", to: "/about" },
    { id: 2, name: "Login", to: "/login" },
    { id: 3, name: "Signup", to: "/signup" },
  ]
  return (
    <StyledWrapper className="">
      <ul>
        {links.map((link) => (
          <li key={link.id}>
            <Link href={link.to}>{link.name}</Link>
          </li>
        ))}
        {showAdmin && (
          <li>
            <Link href="/admin">Admin</Link>
          </li>
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
    li {
      display: block;
      margin-left: 1rem;
      color: ${({ theme }) => theme.colors.gray11};
    }
  }
`
