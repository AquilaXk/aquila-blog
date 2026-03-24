import React, { ReactNode, useEffect, useState } from "react"
import { ThemeProvider } from "./ThemeProvider"
import useScheme from "src/hooks/useScheme"
import Header from "./Header"
import styled from "@emotion/styled"
import Scripts from "src/layouts/RootLayout/Scripts"
import useGtagEffect from "./useGtagEffect"
import { useRouter } from "next/router"
import { isNavigationCancelledError } from "src/libs/router"
import {
  CONTENT_MAX_WIDTH_PX,
  DESKTOP_LOCK_MAX_PX,
  DESKTOP_LOCK_MIN_PX,
  DESKTOP_LOCK_WIDTH_PX,
  FLUID_LAYOUT_MAX_PX,
} from "./layoutTiers"

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

    const handleStart = (_url: string, options?: { shallow: boolean }) => {
      if (options?.shallow) return
      if (!mounted) return
      setIsNavigating(true)
    }

    const handleDone = (_url?: string, options?: { shallow: boolean }) => {
      if (options?.shallow) return
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

  useEffect(() => {
    if (typeof window === "undefined") return

    const isBenignRouteCancellationMessage = (value: unknown): boolean => {
      if (typeof value === "string") {
        return value.toLowerCase().includes("loading initial props cancelled")
      }

      if (value instanceof Error) {
        return value.message.toLowerCase().includes("loading initial props cancelled")
      }

      if (typeof value === "object" && value !== null && "message" in value) {
        const message = (value as { message?: unknown }).message
        if (typeof message === "string") {
          return message.toLowerCase().includes("loading initial props cancelled")
        }
      }

      return false
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!isNavigationCancelledError(event.reason)) return
      // Route competition can reject in-flight Next.js data loading; treat as expected cancellation.
      event.preventDefault()
    }

    const handleWindowError = (event: ErrorEvent) => {
      const reason = event.error ?? event.message
      if (!isNavigationCancelledError(reason) && !isBenignRouteCancellationMessage(reason)) return
      event.preventDefault()
    }

    const originalConsoleError = window.console.error.bind(window.console)
    const filteredConsoleError: typeof window.console.error = (...args) => {
      if (args.some((arg) => isNavigationCancelledError(arg) || isBenignRouteCancellationMessage(arg))) {
        return
      }
      originalConsoleError(...args)
    }

    window.console.error = filteredConsoleError
    window.addEventListener("unhandledrejection", handleUnhandledRejection)
    window.addEventListener("error", handleWindowError)
    return () => {
      window.console.error = originalConsoleError
      window.removeEventListener("unhandledrejection", handleUnhandledRejection)
      window.removeEventListener("error", handleWindowError)
    }
  }, [])

  return (
    <ThemeProvider scheme={scheme}>
      <Scripts />
      {/* // TODO: replace react query */}
      {/* {metaConfig.type !== "Paper" && <Header />} */}
      <Header fullWidth={false} />
      <RouteProgress data-busy={isNavigating} aria-hidden="true" />
      <StyledMain $isFeedRoute={router.pathname === "/"}>{children}</StyledMain>
    </ThemeProvider>
  )
}

export default RootLayout

const StyledMain = styled.main<{ $isFeedRoute: boolean }>`
  margin: 0 auto;
  box-sizing: border-box;
  width: min(100%, ${CONTENT_MAX_WIDTH_PX}px);
  padding: 0 clamp(0.85rem, 1.6vw, 1.2rem);

  /* Velog-like desktop width lock: fixed content rail before tablet/mobile fluid mode */
  @media (max-width: ${DESKTOP_LOCK_MAX_PX}px) and (min-width: ${DESKTOP_LOCK_MIN_PX}px) {
    width: min(100%, ${DESKTOP_LOCK_WIDTH_PX}px);
  }

  ${({ $isFeedRoute }) =>
    $isFeedRoute
      ? `
  @media (max-width: ${DESKTOP_LOCK_MAX_PX}px) and (min-width: 1201px) {
    width: min(100%, ${CONTENT_MAX_WIDTH_PX}px);
  }
`
      : ""}

  @media (max-width: ${FLUID_LAYOUT_MAX_PX}px) {
    width: 100%;
    padding-left: 1rem;
    padding-right: 1rem;
  }

  @media (max-width: 768px) {
    padding-left: 0.85rem;
    padding-right: 0.85rem;
  }
`

const RouteProgress = styled.div`
  position: fixed;
  left: 0;
  right: 0;
  top: 3.5rem;
  z-index: 50;
  height: 2px;
  pointer-events: none;
  overflow: hidden;
  background: transparent;

  &::after {
    content: "";
    display: block;
    width: 30%;
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
