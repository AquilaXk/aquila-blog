import React, { ReactNode, useEffect } from "react"
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
import { FLUID_LAYOUT_MAX_PX } from "./layoutTiers"

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
  const { pathname } = useRouter()
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
  useGtagEffect()

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
      <StyledMain $fullBleed={isFullBleedRoute}>{children}</StyledMain>
    </ThemeProvider>
  )
}

export default RootLayout

const StyledMain = styled.main<{ $fullBleed?: boolean }>`
  margin: 0 auto;
  box-sizing: border-box;
  width: ${({ $fullBleed }) => ($fullBleed ? "100%" : "min(calc(100% - 40px), 1240px)")};
  padding: 0;
  overflow-x: ${({ $fullBleed }) => ($fullBleed ? "clip" : "visible")};

  ${({ $fullBleed }) =>
    $fullBleed
      ? ""
      : `
        @media (max-width: ${FLUID_LAYOUT_MAX_PX}px) {
          width: min(calc(100% - 24px), 1240px);
        }

        @media (max-width: 768px) {
          width: min(calc(100% - 24px), 1240px);
        }
      `}
`
