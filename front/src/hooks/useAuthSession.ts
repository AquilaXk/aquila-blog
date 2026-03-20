import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { ApiError, apiFetch } from "src/apis/backend/client"
import { queryKey } from "src/constants/queryKey"
import type { ProfileCardLinkItem } from "src/constants/profileCardLinks"

const clearCookie = (name: string, domain?: string) => {
  if (typeof window === "undefined") return
  const domainPart = domain ? `; domain=${domain}` : ""
  document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax${domainPart}`
}

const clearStaleAuthCookies = () => {
  if (typeof window === "undefined") return

  clearCookie("apiKey")
  clearCookie("accessToken")

  const host = window.location.hostname.toLowerCase()
  if (host === "localhost" || host === "127.0.0.1") return

  const apexDomain = host.replace(/^www\./, "")
  clearCookie("apiKey", apexDomain)
  clearCookie("accessToken", apexDomain)
  clearCookie("apiKey", `.${apexDomain}`)
  clearCookie("accessToken", `.${apexDomain}`)
}

export type AuthSessionStatus = "loading" | "authenticated" | "anonymous" | "unavailable"

export type AuthMember = {
  id: number
  createdAt?: string
  modifiedAt?: string
  username: string
  nickname: string
  isAdmin?: boolean
  profileImageUrl?: string
  profileImageDirectUrl?: string
  profileRole?: string
  profileBio?: string
  homeIntroTitle?: string
  homeIntroDescription?: string
  serviceLinks?: ProfileCardLinkItem[]
  contactLinks?: ProfileCardLinkItem[]
}

const useAuthSession = () => {
  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => {
    setIsMounted(true)
  }, [])

  const queryClient = useQueryClient()
  const cachedSnapshot = queryClient.getQueryData<AuthMember | null | undefined>(queryKey.authMe())
  const hasCachedSnapshot = cachedSnapshot !== undefined
  const hasCachedMemberSnapshot = cachedSnapshot != null
  const hasCachedAnonymousSnapshot = cachedSnapshot === null
  // SSR hydration 직후에는 anonymous(null) 스냅샷도 클라이언트에서 재검증해
  // HttpOnly 쿠키/도메인 경계 차이로 누락된 세션을 복원한다.
  const shouldFetchAuthMe = !hasCachedSnapshot || hasCachedMemberSnapshot || hasCachedAnonymousSnapshot
  const shouldRefetchOnMount = shouldFetchAuthMe && (!hasCachedSnapshot || hasCachedAnonymousSnapshot)
  const staleTime = hasCachedMemberSnapshot ? 60_000 : hasCachedAnonymousSnapshot ? 5 * 60_000 : 0
  const query = useQuery({
    queryKey: queryKey.authMe(),
    queryFn: async () => {
      try {
        return await apiFetch<AuthMember>("/member/api/v1/auth/me")
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearStaleAuthCookies()
          return null
        }

        throw error
      }
    },
    enabled: isMounted && shouldFetchAuthMe,
    // 로그인 스냅샷은 짧게 재사용하고, anonymous(null) 스냅샷은 mount 시 재검증한다.
    staleTime,
    retry: false,
    refetchOnMount: shouldRefetchOnMount ? "always" : false,
    refetchOnWindowFocus: false,
  })

  const setMe = (member: AuthMember | null) => {
    queryClient.setQueryData(queryKey.authMe(), member)
  }

  const me = query.data ?? null
  const isIdleAnonymous = !query.isFetching && hasCachedAnonymousSnapshot
  const hasResolvedSnapshot = query.status === "success" || query.data !== undefined || isIdleAnonymous
  const authStatus: AuthSessionStatus =
    query.isError
      ? "unavailable"
      : me
        ? "authenticated"
        : hasResolvedSnapshot
          ? "anonymous"
          : "loading"

  const logout = async () => {
    try {
      await apiFetch("/member/api/v1/auth/logout", { method: "DELETE" })
    } catch {
      // 서버 응답과 무관하게 프론트 인증 상태는 즉시 비운다.
    } finally {
      setMe(null)
    }
  }

  return {
    me,
    authStatus,
    authUnavailable: authStatus === "unavailable",
    isAuthResolved: authStatus !== "loading",
    refresh: query.refetch,
    setMe,
    clearMe: () => setMe(null),
    logout,
  }
}

export default useAuthSession
