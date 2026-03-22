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

const AUTH_ME_ANON_SUPPRESS_UNTIL_KEY = "auth:me:anon-probe-suppress-until:v1"
const AUTH_ME_ANON_SUPPRESS_TTL_MS = 5 * 60_000

const readAnonymousProbeSuppressed = () => {
  if (typeof window === "undefined") return false

  try {
    const raw = window.sessionStorage.getItem(AUTH_ME_ANON_SUPPRESS_UNTIL_KEY)
    if (!raw) return false

    const until = Number.parseInt(raw, 10)
    if (!Number.isFinite(until) || until <= Date.now()) {
      window.sessionStorage.removeItem(AUTH_ME_ANON_SUPPRESS_UNTIL_KEY)
      return false
    }

    return true
  } catch {
    return false
  }
}

const suppressAnonymousProbe = () => {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(
      AUTH_ME_ANON_SUPPRESS_UNTIL_KEY,
      String(Date.now() + AUTH_ME_ANON_SUPPRESS_TTL_MS)
    )
  } catch {
    // ignore storage permission/quota errors
  }
}

const clearAnonymousProbeSuppression = () => {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.removeItem(AUTH_ME_ANON_SUPPRESS_UNTIL_KEY)
  } catch {
    // ignore storage permission/quota errors
  }
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
  const cachedAnonymousProbePolicy = queryClient.getQueryData<boolean | undefined>(queryKey.authMeProbe())
  const shouldProbeAnonymousSnapshot = cachedAnonymousProbePolicy ?? !readAnonymousProbeSuppressed()
  const hasCachedSnapshot = cachedSnapshot !== undefined
  const hasCachedMemberSnapshot = cachedSnapshot != null
  const hasCachedAnonymousSnapshot = cachedSnapshot === null
  // SSR에서 "쿠키 없음"이 확정된 anonymous(null)은 재검증을 건너뛰어
  // 비로그인 사용자의 불필요한 401(auth/me) 반복을 줄인다.
  // 단, SSR 검증 실패(undefined)로 들어온 경우에는 클라이언트에서 재검증한다.
  const shouldFetchAuthMe =
    !hasCachedSnapshot || hasCachedMemberSnapshot || (hasCachedAnonymousSnapshot && shouldProbeAnonymousSnapshot)
  const shouldRefetchOnMount =
    shouldFetchAuthMe && (!hasCachedSnapshot || (hasCachedAnonymousSnapshot && shouldProbeAnonymousSnapshot))
  const staleTime = hasCachedMemberSnapshot ? 60_000 : hasCachedAnonymousSnapshot ? 5 * 60_000 : 0
  const query = useQuery({
    queryKey: queryKey.authMe(),
    queryFn: async () => {
      try {
        return await apiFetch<AuthMember>("/member/api/v1/auth/me")
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearStaleAuthCookies()
          suppressAnonymousProbe()
          return null
        }

        throw error
      }
    },
    enabled: isMounted && shouldFetchAuthMe,
    // 로그인 스냅샷은 짧게 재사용한다.
    // anonymous(null) 스냅샷은 probe 정책(true)일 때만 mount 재검증한다.
    staleTime,
    retry: false,
    refetchOnMount: shouldRefetchOnMount ? "always" : false,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    if (query.data === undefined) return
    queryClient.setQueryData(queryKey.authMeProbe(), query.data !== null)
    if (query.data) {
      clearAnonymousProbeSuppression()
    }
  }, [query.data, queryClient])

  const setMe = (member: AuthMember | null) => {
    queryClient.setQueryData(queryKey.authMe(), member)
    queryClient.setQueryData(queryKey.authMeProbe(), member !== null)
    if (member) {
      clearAnonymousProbeSuppression()
    }
  }

  const me =
    query.data ??
    (query.isError && hasCachedMemberSnapshot
      ? (cachedSnapshot as AuthMember)
      : null)
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
