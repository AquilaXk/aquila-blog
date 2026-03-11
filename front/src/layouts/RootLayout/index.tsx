import React, { ReactNode, useEffect, useState } from "react"
import { ThemeProvider } from "./ThemeProvider"
import useScheme from "src/hooks/useScheme"
import Header from "./Header"
import styled from "@emotion/styled"
import Scripts from "src/layouts/RootLayout/Scripts"
import useGtagEffect from "./useGtagEffect"
import { useRouter } from "next/router"

type Props = {
  children: ReactNode
}

const RootLayout = ({ children }: Props) => {
  const [scheme] = useScheme()
  const router = useRouter()
  const [isNavigating, setIsNavigating] = useState(false)
  useGtagEffect()

  useEffect(() => {
    let mounted = true

    const handleStart = () => {
      if (!mounted) return
      setIsNavigating(true)
    }

    const handleDone = () => {
      if (!mounted) return
      window.requestAnimationFrame(() => {
        if (mounted) setIsNavigating(false)
      })
    }

    router.events.on("routeChangeStart", handleStart)
    router.events.on("routeChangeComplete", handleDone)
    router.events.on("routeChangeError", handleDone)

    return () => {
      mounted = false
      router.events.off("routeChangeStart", handleStart)
      router.events.off("routeChangeComplete", handleDone)
      router.events.off("routeChangeError", handleDone)
    }
  }, [router.events])

  return (
    <ThemeProvider scheme={scheme}>
      <Scripts />
      {/* // TODO: replace react query */}
      {/* {metaConfig.type !== "Paper" && <Header />} */}
      <Header fullWidth={false} />
      <RouteProgress data-busy={isNavigating} aria-hidden="true" />
      <StyledMain data-busy={isNavigating}>{children}</StyledMain>
    </ThemeProvider>
  )
}

export default RootLayout

const StyledMain = styled.main`
  margin: 0 auto;
  width: 100%;
  max-width: 1120px;
  padding: 0 1rem;
  transition: opacity 0.24s ease, filter 0.24s ease;
  opacity: 1;
  filter: none;

  &[data-busy="true"] {
    opacity: 0.72;
    filter: saturate(0.96);
  }
`

const RouteProgress = styled.div`
  position: sticky;
  top: 3rem;
  z-index: 60;
  height: 2px;
  width: 100%;
  pointer-events: none;
  overflow: hidden;
  background: transparent;

  &::after {
    content: "";
    display: block;
    width: 32%;
    height: 100%;
    opacity: 0;
    background: linear-gradient(90deg, transparent, #3b82f6, transparent);
    transform: translateX(-130%);
  }

  &[data-busy="true"]::after {
    opacity: 1;
    animation: route-progress-slide 1s ease-in-out infinite;
  }

  @keyframes route-progress-slide {
    0% {
      transform: translateX(-130%);
    }
    100% {
      transform: translateX(420%);
    }
  }
`
