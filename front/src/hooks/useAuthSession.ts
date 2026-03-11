import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ApiError, apiFetch } from "src/apis/backend/client"
import { queryKey } from "src/constants/queryKey"

const isClient = typeof window !== "undefined"

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
}

const useAuthSession = () => {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: queryKey.authMe(),
    queryFn: async () => {
      try {
        return await apiFetch<AuthMember>("/member/api/v1/auth/me")
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          return null
        }

        throw error
      }
    },
    enabled: isClient,
    staleTime: 0,
    retry: false,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  })

  const setMe = (member: AuthMember | null) => {
    queryClient.setQueryData(queryKey.authMe(), member)
  }

  const me = query.data ?? null
  const authStatus: AuthSessionStatus =
    !isClient
      ? "loading"
      : me
        ? "authenticated"
        : query.isLoading
          ? "loading"
          : query.isError
            ? "unavailable"
            : "anonymous"

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
