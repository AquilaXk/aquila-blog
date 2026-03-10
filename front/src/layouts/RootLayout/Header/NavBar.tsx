import styled from "@emotion/styled"
import Link from "next/link"
import { useRouter } from "next/router"
import { useEffect, useState } from "react"
import { apiFetch } from "src/apis/backend/client"

type MemberMe = {
  id: number
  username: string
  isAdmin?: boolean
}

const NavBar: React.FC = () => {
  const router = useRouter()
  const [me, setMe] = useState<MemberMe | null>(null)

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

  const links = me ? memberLinks : guestLinks

  return (
    <StyledWrapper className="">
      <ul>
        {links.map((link) => (
          <li key={link.id}>
            <Link href={link.to}>{link.name}</Link>
          </li>
        ))}
        {me?.isAdmin && (
          <li>
            <Link href="/admin#post-write">Write</Link>
          </li>
        )}
        {me?.isAdmin && (
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
