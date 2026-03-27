import { QueryClient, useQuery } from "@tanstack/react-query"
import { apiFetch } from "src/apis/backend/client"
import { queryKey } from "src/constants/queryKey"
import type { ProfileWorkspaceResponse } from "src/libs/profileWorkspace"

export const setProfileWorkspaceCache = (
  queryClient: QueryClient,
  memberId: number,
  workspace: ProfileWorkspaceResponse | null
) => {
  queryClient.setQueryData(queryKey.adminProfileWorkspace(memberId), workspace)
}

export const useProfileWorkspace = (
  memberId: number | null | undefined,
  initialWorkspace: ProfileWorkspaceResponse | null = null
) => {
  const isBrowser = typeof window !== "undefined"

  return useQuery<ProfileWorkspaceResponse | null>({
    queryKey: queryKey.adminProfileWorkspace(memberId || 0),
    queryFn: async () => {
      if (!memberId) return null
      return await apiFetch<ProfileWorkspaceResponse>(`/member/api/v1/adm/members/${memberId}/profileWorkspace`)
    },
    enabled: isBrowser && Boolean(memberId),
    initialData: initialWorkspace,
    staleTime: initialWorkspace ? 60 * 1000 : 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: !initialWorkspace,
  })
}
