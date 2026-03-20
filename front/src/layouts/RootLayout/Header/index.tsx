import NavBar from "./NavBar"
import Logo from "./Logo"
import ThemeToggle from "./ThemeToggle"
import styled from "@emotion/styled"
import { zIndexes } from "src/styles/zIndexes"
import { useRouter } from "next/router"
import { useEffect, useRef, useState } from "react"

type Props = {
  fullWidth: boolean
}

const Header: React.FC<Props> = ({ fullWidth }) => {
  const router = useRouter()
  const isPostDetailRoute = router.pathname === "/posts/[id]"
  const [isHiddenByScroll, setIsHiddenByScroll] = useState(false)
  const hiddenByScroll = isPostDetailRoute && isHiddenByScroll
  const lastScrollYRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return

    if (!isPostDetailRoute) {
      setIsHiddenByScroll(false)
      return
    }

    lastScrollYRef.current = window.scrollY
    const minDelta = window.innerWidth <= 768 ? 12 : 8

    const handleScroll = () => {
      if (rafRef.current !== null) return

      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null
        const currentY = window.scrollY
        const previousY = lastScrollYRef.current
        const delta = currentY - previousY

        if (currentY <= 0) {
          setIsHiddenByScroll(false)
          lastScrollYRef.current = currentY
          return
        }

        if (delta > minDelta && currentY > 72) {
          setIsHiddenByScroll(true)
        } else if (currentY < previousY) {
          setIsHiddenByScroll(false)
        }

        lastScrollYRef.current = currentY
      })
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", handleScroll)
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [isPostDetailRoute])

  return (
    <StyledWrapper
      data-autohide={isPostDetailRoute}
      data-hidden={hiddenByScroll}
      style={
        hiddenByScroll
          ? {
              transform: "translateY(calc(-100% - 1px))",
              opacity: 0,
              pointerEvents: "none",
              borderBottomColor: "transparent",
            }
          : undefined
      }
    >
      <div data-full-width={fullWidth} className="container">
        <Logo />
        <div className="nav">
          <ThemeToggle />
          <NavBar />
        </div>
      </div>
    </StyledWrapper>
  )
}

export default Header

const StyledWrapper = styled.div`
  z-index: ${zIndexes.header};
  position: sticky;
  top: 0;
  background-color: ${({ theme }) => `${theme.colors.gray1}e6`};
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transform: translateY(0);
  opacity: 1;
  transition: transform 0.2s ease, opacity 0.2s ease, border-color 0.2s ease;
  will-change: transform, opacity;
  backface-visibility: hidden;

  .container {
    display: flex;
    padding-left: 1rem;
    padding-right: 1rem;
    gap: 0.75rem;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    max-width: 1180px;
    min-height: 3.65rem;
    margin: 0 auto;
    &[data-full-width="true"] {
      @media (min-width: 768px) {
        padding-left: 6rem;
        padding-right: 6rem;
      }
    }
    .nav {
      display: flex;
      gap: 0.36rem;
      align-items: center;
      flex-shrink: 0;
      min-width: 0;
    }
  }

  @media (max-width: 720px) {
    .container {
      padding-left: 0.62rem;
      padding-right: 0.62rem;
      gap: 0.45rem;

      > a {
        min-width: 0;
        max-width: 42vw;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .nav {
        gap: 0.18rem;
        max-width: calc(100vw - 8.8rem);
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }

      .nav::-webkit-scrollbar {
        display: none;
      }
    }
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`
