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
const RootAdminProfileContext = React.createContext<AdminProfile | null>(null)

export const useRootAdminProfile = () => React.useContext(RootAdminProfileContext)

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
  // Enforce intentional light-only DOM/query scheme (PR 1275 / HIG P5-5).
  useScheme()
  const { pathname } = useRouter()
  const isPublicBlogRoute = pathname === "/" || pathname === "/about" || pathname === "/posts/[id]"
  const isDedicatedEditorRoute = pathname === "/editor/[id]" || pathname === "/editor/new"
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/")
  // 회사·제품 표면은 전용 호스트의 루트로 서빙되는 독립 랜딩이다. 블로그 헤더와 본문 폭 컨테이너를
  // 쓰지 않고 자기 헤더·풀블리드 섹션을 소유한다.
  const isStandaloneSurfaceRoute = pathname === "/company" || pathname === "/easysubway"
  const isFullBleedRoute = isDedicatedEditorRoute || isAdminRoute || isStandaloneSurfaceRoute
  // 독립 표면은 자기 <main>을 소유한다. 여기서도 <main>으로 감싸면 랜드마크가 중첩돼 보조기술이
  // 읽는 문서 구조가 무효화되고, 표면의 <header>/<footer>도 main 자손이 되어 banner/contentinfo
  // 역할을 잃는다. 이 라우트에서만 껍데기를 div로 내려 main을 하나로 유지한다.
  const LayoutShell = isStandaloneSurfaceRoute ? StandaloneShell : StyledMain
  const isDesignAwareRoute = pathname[1] !== "_" && pathname !== "/sitemap.xml"
  const adminProfile = usePublicAdminProfile(initialAdminProfile, {
    // 독립 표면은 관리자 프로필을 전혀 읽지 않는다. 여기서 켜 두면 blog 호스트 백엔드로 credentialed
    // XHR이 나가는데, 회사·제품 호스트에서는 그것이 cross-origin이고 edge에 그 origin을 허용하는
    // CORS가 없다 - 아무 화면 효과 없이 실패하는 요청만 남는다.
    enabled: !isStandaloneSurfaceRoute && (isDesignAwareRoute || initialAdminProfileShouldRefetch),
    refetchOnMount: isDesignAwareRoute,
    staleTimeMs: isDesignAwareRoute ? 0 : undefined,
  })
  const effectiveScheme = "light" // intentional light-only; do not wire dark/toggle
  const effectiveBlogDesign = isAdminRoute ? adminProfile?.blogDesign || "legacy" : "legacy"
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
      <RootAdminProfileContext.Provider value={adminProfile}>
        <Scripts />
        {isAdminRoute || isDedicatedEditorRoute || isStandaloneSurfaceRoute ? null : (
          <Header fullWidth={false} blogTitle={headerBlogTitle} />
        )}
        <LayoutShell $fullBleed={isFullBleedRoute}>{children}</LayoutShell>
      </RootAdminProfileContext.Provider>
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
      `}
`

/**
 * 같은 껍데기의 non-landmark 버전. 스타일을 복사하지 않고 `withComponent`로 태그만 바꾼다 - 복사하면
 * 한쪽 폭·overflow 규칙이 조용히 갈라진다.
 */
const StandaloneShell = StyledMain.withComponent("div")
