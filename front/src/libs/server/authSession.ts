import { IncomingMessage } from "http"
import { queryKey } from "src/constants/queryKey"
import type { AuthMember } from "src/hooks/useAuthSession"
import { QueryClient } from "@tanstack/react-query"
import { serverApiFetch } from "./backend"

export const fetchServerAuthSession = async (req: IncomingMessage): Promise<AuthMember | null> => {
  try {
    const response = await serverApiFetch(req, "/member/api/v1/auth/me")
    if (response.status === 401) return null
    if (!response.ok) return null
    return (await response.json()) as AuthMember
  } catch {
    return null
  }
}

export const hydrateServerAuthSession = async (queryClient: QueryClient, req: IncomingMessage) => {
  const authMember = await fetchServerAuthSession(req)
  queryClient.setQueryData(queryKey.authMe(), authMember)
  return authMember
}
