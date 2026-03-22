import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { ApiError, apiFetch } from "src/apis/backend/client"
import { queryKey } from "src/constants/queryKey"
import type { ProfileCardLinkItem } from "src/constants/profileCardLinks"

const AUTH_ME_ANON_SUPPRESS_UNTIL_KEY = "auth:me:anon-probe-suppress-until:v1"
const AUTH_ME_ANON_SUPPRESS_TTL_MS = 5 * 60_000

const readAnonymousProbeSuppressed = () => {
  if (typeof window === "undefined") return false
  const until = Number(window.sessionStorage.getItem(AUTH_ME_ANON_SUPPRESS_UNTIL_KEY) || "0")
  if (!Number.isFinite(until) || until <= Date.now()) {
    window.sessionStorage.removeItem(AUTH_ME_ANON_SUPPRESS_UNTIL_KEY)
    return false
  }
  return true
}

const suppressAnonymousProbe = () => {
  if (typeof window === "undefined") return
  window.sessionStorage.setItem(
    AUTH_ME_ANON_SUPPRESS_UNTIL_KEY,
    String(Date.now() + AUTH_ME_ANON_SUPPRESS_TTL_MS)
  )
}

const clearAnonymousProbeSuppression = () => {
  if (typeof window === "undefined") return
  window.sessionStorage.removeItem(AUTH_ME_ANON_SUPPRESS_UNTIL_KEY)
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
  const serverProbeSnapshot = queryClient.getQueryData<boolean | undefined>(queryKey.authMeProbe())
  const cachedSnapshot = queryClient.getQueryData<AuthMember | null | undefined>(queryKey.authMe())
  const hasCachedSnapshot = cachedSnapshot !== undefined
  const hasCachedMemberSnapshot = cachedSnapshot != null
  const hasCachedAnonymousSnapshot = cachedSnapshot === null
  // SSR에서 "쿠키 없음"이 확정된 anonymous(null)은 재검증을 건너뛰어
  // 비로그인 사용자의 불필요한 401(auth/me) 반복을 줄인다.
  // 단, SSR 검증 실패(undefined)로 들어온 경우에는 클라이언트에서 재검증한다.
  const shouldFetchAuthMe = (() => {
    if (hasCachedMemberSnapshot) return true
    if (hasCachedAnonymousSnapshot && serverProbeSnapshot !== true) return false
    if (readAnonymousProbeSuppressed()) return false
    if (serverProbeSnapshot === false) return false
    if (serverProbeSnapshot === true) return true
    return !hasCachedSnapshot
  })()
  const query = useQuery({
    queryKey: queryKey.authMe(),
    queryFn: async () => {
      try {
        return await apiFetch<AuthMember>("/member/api/v1/auth/me")
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          suppressAnonymousProbe()
          return null
        }

        throw error
      }
    },
    enabled: isMounted && shouldFetchAuthMe,
    staleTime: hasCachedMemberSnapshot ? 60_000 : 0,
    retry: false,
    refetchOnMount: hasCachedMemberSnapshot ? "always" : false,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    if (!query.isSuccess) return

    queryClient.setQueryData(queryKey.authMeProbe(), query.data != null)
    if (query.data) {
      clearAnonymousProbeSuppression()
    }
  }, [query.isSuccess, query.data, queryClient])

  const setMe = (member: AuthMember | null) => {
    queryClient.setQueryData(queryKey.authMe(), member)
    queryClient.setQueryData(queryKey.authMeProbe(), member != null)
    if (member) {
      clearAnonymousProbeSuppression()
    }
  }

  const me =
    query.data ?? (query.isError && hasCachedMemberSnapshot ? (cachedSnapshot as AuthMember) : null)
  const isIdleAnonymous = !query.isFetching && hasCachedAnonymousSnapshot
  const hasResolvedSnapshot = query.status === "success" || query.data !== undefined || isIdleAnonymous
  const authStatus: AuthSessionStatus =
    me
        ? "authenticated"
        : query.isError
          ? "unavailable"
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
