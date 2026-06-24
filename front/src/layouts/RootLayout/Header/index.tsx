import NavBar from "./NavBar"
import Logo from "./Logo"
import styled from "@emotion/styled"
import { zIndexes } from "src/styles/zIndexes"
import { useRouter } from "next/router"
import { useEffect, useRef, useState } from "react"
import { FLUID_LAYOUT_MAX_PX } from "../layoutTiers"

type Props = {
  fullWidth: boolean
  showThemeToggle?: boolean
  blogTitle?: string
}

const Header: React.FC<Props> = ({ fullWidth, showThemeToggle = true, blogTitle }) => {
  const router = useRouter()
  const isPostDetailRoute = router.pathname === "/posts/[id]"
  const [isHiddenByScroll, setIsHiddenByScroll] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
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

  useEffect(() => {
    if (typeof window === "undefined") return
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const root = document.documentElement
    let lastHeight = 0

    const syncHeaderHeight = () => {
      const measured = Math.round(wrapper.getBoundingClientRect().height)
      if (measured <= 0) return
      if (measured === lastHeight) return
      lastHeight = measured
      root.style.setProperty("--app-header-height", `${measured}px`)
    }

    let rafId: number | null = null
    const scheduleSync = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        syncHeaderHeight()
      })
    }

    syncHeaderHeight()
    scheduleSync()

    const handleResize = () => scheduleSync()

    window.addEventListener("resize", handleResize, { passive: true })
    window.addEventListener("orientationchange", handleResize)

    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        scheduleSync()
      })
      observer.observe(wrapper)
    }

    const fontSet = document.fonts
    const handleFontLoadingDone = () => scheduleSync()
    if (fontSet) {
      if (typeof fontSet.addEventListener === "function") {
        fontSet.addEventListener("loadingdone", handleFontLoadingDone)
      }
      void fontSet.ready.then(() => {
        scheduleSync()
      }).catch(() => {})
    }

    return () => {
      window.removeEventListener("resize", handleResize)
      window.removeEventListener("orientationchange", handleResize)
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
      if (fontSet && typeof fontSet.removeEventListener === "function") {
        fontSet.removeEventListener("loadingdone", handleFontLoadingDone)
      }
      observer?.disconnect()
    }
  }, [])

  return (
    <StyledWrapper
      ref={wrapperRef}
      data-ui="app-header"
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
        <Logo blogTitle={blogTitle} />
        <div className="nav">
          <NavBar showThemeToggle={showThemeToggle} />
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
  background: var(--aq-header-bg);
  border-bottom: 1px solid var(--aq-border);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  transform: translateY(0);
  opacity: 1;
  transition: transform 0.2s ease, opacity 0.2s ease, border-color 0.2s ease;
  will-change: transform, opacity;
  backface-visibility: hidden;

  .container {
    display: grid;
    box-sizing: border-box;
    grid-template-columns: auto 1fr;
    padding-left: 0;
    padding-right: 0;
    gap: 2rem;
    align-items: center;
    width: min(calc(100% - 40px), 1240px);
    min-height: 4rem;
    margin: 0 auto;

    @media (max-width: ${FLUID_LAYOUT_MAX_PX}px) {
      width: min(calc(100% - 24px), 1240px);
      min-height: 3.6rem;
    }

    &[data-full-width="true"] {
      @media (min-width: 768px) {
        padding-left: 6rem;
        padding-right: 6rem;
      }
    }
    .nav {
      display: flex;
      gap: 0.4rem;
      align-items: center;
      justify-content: flex-end;
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
        gap: 0.26rem;
        max-width: calc(100vw - 7.8rem);
        overflow: hidden;
        justify-content: flex-end;
      }
    }
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`
