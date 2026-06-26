import NavBar from "./NavBar"
import Logo from "./Logo"
import styled from "@emotion/styled"
import { useEffect, useRef } from "react"

type Props = {
  fullWidth: boolean
  showThemeToggle?: boolean
  blogTitle?: string
}

const Header: React.FC<Props> = ({ fullWidth, showThemeToggle = true, blogTitle }) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null)

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
    <StyledWrapper ref={wrapperRef} data-ui="app-header">
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
  z-index: 50;
  position: sticky;
  top: 0;
  background: var(--aq-header-bg);
  border-bottom: 1px solid var(--aq-border);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);

  .container {
    display: grid;
    box-sizing: border-box;
    grid-template-columns: auto 1fr;
    padding-left: 0;
    padding-right: 0;
    gap: 32px;
    align-items: center;
    width: min(calc(100% - 40px), 1240px);
    min-height: 64px;
    margin: 0 auto;

    @media (max-width: 820px) {
      width: min(calc(100% - 24px), 1240px);
      min-height: 58px;
      gap: 10px;
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

  @media (max-width: 820px) {
    .container {
      padding-left: 0;
      padding-right: 0;

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
`
