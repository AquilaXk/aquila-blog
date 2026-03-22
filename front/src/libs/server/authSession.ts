import { IncomingMessage } from "http"
import { queryKey } from "src/constants/queryKey"
import type { AuthMember } from "src/hooks/useAuthSession"
import { QueryClient } from "@tanstack/react-query"
import { serverApiFetch } from "./backend"

const hasAuthCookie = (req: IncomingMessage) => {
  const rawCookie = req.headers.cookie || ""
  if (!rawCookie) return false

  return rawCookie.includes("apiKey=") || rawCookie.includes("accessToken=")
}

export const fetchServerAuthSession = async (req: IncomingMessage): Promise<AuthMember | null | undefined> => {
  if (!hasAuthCookie(req)) return null

  try {
    const response = await serverApiFetch(req, "/member/api/v1/auth/me")
    if (response.status === 401) {
      // 쿠키가 남아 있더라도 401이면 서버 기준 비로그인 상태로 확정한다.
      // 클라이언트 재검증(auth/me)까지 이어지면 브라우저 콘솔에 401 노이즈가 반복될 수 있다.
      return null
    }
    if (!response.ok) return undefined
    return (await response.json()) as AuthMember
  } catch {
    // 쿠키는 있으나 SSR 시점 인증 확인이 실패한 경우(백엔드 일시 장애 등)에는
    // anonymous(null)로 확정하지 않고 unknown(undefined)으로 남겨 클라이언트에서 재검증한다.
    return undefined
  }
}

export const hydrateServerAuthSession = async (queryClient: QueryClient, req: IncomingMessage) => {
  const authMember = await fetchServerAuthSession(req)
  const shouldProbeOnClient = authMember !== null

  queryClient.setQueryData(queryKey.authMeProbe(), shouldProbeOnClient)
  if (authMember !== undefined) {
    queryClient.setQueryData(queryKey.authMe(), authMember)
  }
  return authMember
}
