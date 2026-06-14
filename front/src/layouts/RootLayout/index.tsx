import React, { ReactNode, useEffect, useState } from "react"
import { ThemeProvider } from "./ThemeProvider"
import useScheme from "src/hooks/useScheme"
import Header from "./Header"
import styled from "@emotion/styled"
import Scripts from "src/layouts/RootLayout/Scripts"
import useGtagEffect from "./useGtagEffect"
import { useRouter } from "next/router"
import { useQuery } from "@tanstack/react-query"
import { CONFIG } from "site.config"
import type { AdminProfile } from "src/hooks/useAdminProfile"
import { isNavigationCancelledError, isRequestCancelledError } from "src/libs/router"
import {
  CONTENT_MAX_WIDTH_PX,
  DESKTOP_LOCK_MAX_PX,
  DESKTOP_LOCK_MIN_PX,
  DESKTOP_LOCK_WIDTH_PX,
  FLUID_LAYOUT_MAX_PX,
  WIDE_CONTENT_BREAKPOINT_PX,
  WIDE_CONTENT_MAX_PX,
} from "./layoutTiers"

const PUBLIC_ADMIN_PROFILE_QUERY_KEY = ["member", "adminProfile"] as const
const INITIAL_PROPS_CANCELLED_MESSAGE = "loading initial props cancelled"

type UsePublicAdminProfileOptions = {
  enabled: boolean
  refetchOnMount: boolean
  staleTimeMs?: number
}

const resolvePublicApiBaseUrl = () => {
  const publicUrl = process.env.NEXT_PUBLIC_BACKEND_URL
  return (publicUrl || "http://localhost:8080").replace(/\/+$/, "")
}

const fetchPublicAdminProfile = async (): Promise<AdminProfile | null> => {
  const response = await fetch(`${resolvePublicApiBaseUrl()}/member/api/v1/members/adminProfile`, {
    credentials: "include",
  })
  if (!response.ok) return null
  return (await response.json()) as AdminProfile
}

const usePublicAdminProfile = (
  initialProfile: AdminProfile | null,
  options: UsePublicAdminProfileOptions
): AdminProfile | null => {
  const hasSeedProfile = initialProfile != null
  const query = useQuery<AdminProfile | null>({
    queryKey: PUBLIC_ADMIN_PROFILE_QUERY_KEY,
    queryFn: fetchPublicAdminProfile,
    enabled: typeof window !== "undefined" && options.enabled,
    initialData: initialProfile ?? undefined,
    staleTime: options.staleTimeMs ?? (hasSeedProfile ? 5 * 60 * 1000 : 0),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: options.enabled && (options.refetchOnMount || !hasSeedProfile),
  })

  return query.data ?? initialProfile
}

type Props = {
  children: ReactNode
  initialAdminProfile?: AdminProfile | null
  initialAdminProfileShouldRefetch?: boolean
}

const RootLayout = ({
  children,
  initialAdminProfile = null,
  initialAdminProfileShouldRefetch = false,
}: Props) => {
  const [scheme] = useScheme()
  const { events, pathname } = useRouter()
  const isPublicBlogRoute = pathname === "/" || pathname === "/about" || pathname === "/posts/[id]"
  const isDedicatedEditorRoute = pathname === "/editor/[id]" || pathname === "/editor/new"
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/")
  const isFullBleedRoute = isDedicatedEditorRoute || isAdminRoute
  const isDesignAwareRoute = !isAdminRoute && pathname[1] !== "_" && pathname !== "/sitemap.xml"
  const adminProfile = usePublicAdminProfile(initialAdminProfile, {
    enabled: isDesignAwareRoute || initialAdminProfileShouldRefetch,
    refetchOnMount: isDesignAwareRoute,
    staleTimeMs: isDesignAwareRoute ? 0 : undefined,
  })
  const effectiveScheme = scheme
  const effectiveBlogDesign = "legacy"
  const headerBlogTitle = (isPublicBlogRoute && adminProfile?.blogTitle?.trim()) || CONFIG.blog.title
  const [isNavigating, setIsNavigating] = useState(false)
  useGtagEffect()

  useEffect(() => {
    let mounted = true

    const handleStart = (_url: string, options?: { shallow: boolean }) => {
      if (options?.shallow || !mounted) return
      setIsNavigating(true)
    }

    const handleDone = (_url?: string, options?: { shallow: boolean }) => {
      if (options?.shallow || !mounted) return
      requestAnimationFrame(() => {
        if (mounted) setIsNavigating(false)
      })
    }

    events.on("routeChangeStart", handleStart)
    events.on("routeChangeComplete", handleDone)
    events.on("routeChangeError", handleDone)

    return () => {
      mounted = false
      events.off("routeChangeStart", handleStart)
      events.off("routeChangeComplete", handleDone)
      events.off("routeChangeError", handleDone)
    }
  }, [events])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (process.env.NODE_ENV !== "production") return

    const isBenignRouteCancellationMessage = (value: unknown): boolean => {
      if (typeof value === "string") {
        return value.toLowerCase().includes(INITIAL_PROPS_CANCELLED_MESSAGE)
      }

      if (value instanceof Error) {
        return value.message.toLowerCase().includes(INITIAL_PROPS_CANCELLED_MESSAGE)
      }

      if (typeof value === "object" && value !== null && "message" in value) {
        const message = (value as { message?: unknown }).message
        if (typeof message === "string") {
          return message.toLowerCase().includes(INITIAL_PROPS_CANCELLED_MESSAGE)
        }
      }

      return false
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!isNavigationCancelledError(event.reason) && !isRequestCancelledError(event.reason)) return
      // Route competition can reject in-flight Next.js data loading; treat as expected cancellation.
      event.preventDefault()
    }

    const handleWindowError = (event: ErrorEvent) => {
      const reason = event.error ?? event.message
      if (
        !isNavigationCancelledError(reason) &&
        !isRequestCancelledError(reason) &&
        !isBenignRouteCancellationMessage(reason)
      ) {
        return
      }
      event.preventDefault()
    }

    const originalConsoleError = window.console.error.bind(window.console)
    const filteredConsoleError: typeof window.console.error = (...args) => {
      if (
        args.some(
          (arg) =>
            isNavigationCancelledError(arg) ||
            isRequestCancelledError(arg) ||
            isBenignRouteCancellationMessage(arg)
        )
      ) {
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
    <ThemeProvider scheme={effectiveScheme} blogDesign={effectiveBlogDesign}>
      <Scripts />
      {/* // TODO: replace react query */}
      {/* {metaConfig.type !== "Paper" && <Header />} */}
      <Header fullWidth={false} showThemeToggle={effectiveBlogDesign === "legacy"} blogTitle={headerBlogTitle} />
      <RouteProgress data-busy={isNavigating} aria-hidden="true" />
      <StyledMain $fullBleed={isFullBleedRoute}>{children}</StyledMain>
    </ThemeProvider>
  )
}

export default RootLayout

const StyledMain = styled.main<{ $fullBleed?: boolean }>`
  margin: 0 auto;
  box-sizing: border-box;
  width: ${({ $fullBleed }) => ($fullBleed ? "100%" : `min(100%, ${CONTENT_MAX_WIDTH_PX}px)`)};
  padding: ${({ $fullBleed }) => ($fullBleed ? "0" : "0 clamp(0.85rem, 1.6vw, 1.2rem)")};
  overflow-x: ${({ $fullBleed }) => ($fullBleed ? "clip" : "visible")};

  ${({ $fullBleed }) =>
    $fullBleed
      ? ""
      : `
        @media (max-width: ${WIDE_CONTENT_BREAKPOINT_PX}px) {
          width: min(100%, ${WIDE_CONTENT_MAX_PX}px);
        }

        /* Velog-like desktop width lock: fixed content rail before tablet/mobile fluid mode */
        @media (max-width: ${DESKTOP_LOCK_MAX_PX}px) and (min-width: ${DESKTOP_LOCK_MIN_PX}px) {
          width: min(100%, ${DESKTOP_LOCK_WIDTH_PX}px);
        }

        @media (max-width: ${FLUID_LAYOUT_MAX_PX}px) {
          width: 100%;
          padding-left: 1rem;
          padding-right: 1rem;
        }

        @media (max-width: 768px) {
          padding-left: 0.85rem;
          padding-right: 0.85rem;
        }
      `}
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
