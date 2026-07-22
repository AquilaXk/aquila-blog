import { IncomingMessage } from "http"
import { QueryClient } from "@tanstack/react-query"
import { ApiError } from "src/apis/backend/client"
import { queryKey } from "src/constants/queryKey"
import type { AuthMember } from "src/hooks/useAuthSession"
import { serverApiFetchJson } from "./backend"

export const hasServerAuthCookie = (req: IncomingMessage) => {
  const rawCookie = req.headers.cookie || ""
  if (!rawCookie) return false

  return rawCookie.includes("apiKey=") || rawCookie.includes("accessToken=")
}

export const fetchServerAuthSession = async (req: IncomingMessage): Promise<AuthMember | null | undefined> => {
  if (!hasServerAuthCookie(req)) return null

  try {
    return await serverApiFetchJson<AuthMember>(req, "/member/api/v1/auth/me")
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      // 쿠키가 남아 있더라도 401이면 서버 기준 비로그인 상태로 확정한다.
      // 클라이언트 재검증(auth/me)까지 이어지면 브라우저 콘솔에 401 노이즈가 반복될 수 있다.
      return null
    }
    // 쿠키는 있으나 SSR 시점 인증 확인이 실패한 경우(백엔드 일시 장애 등)에는
    // anonymous(null)로 확정하지 않고 unknown(undefined)으로 남겨 클라이언트에서 재검증한다.
    return undefined
  }
}

export const fetchServerAdminSession = async (req: IncomingMessage): Promise<AuthMember | null | undefined> => {
  if (!hasServerAuthCookie(req)) return null

  try {
    const data = await serverApiFetchJson<AuthMember & { admin?: boolean }>(
      req,
      "/member/api/v1/auth/session"
    )
    return {
      ...data,
      isAdmin: data.isAdmin ?? data.admin ?? false,
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null
    }
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
