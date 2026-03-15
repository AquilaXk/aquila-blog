import { IncomingMessage } from "http"
import type { AuthMember } from "src/hooks/useAuthSession"
import { normalizeNextPath, toLoginPath } from "src/libs/router"
import { serverApiFetch } from "./backend"

type AdminGuardResult =
  | { ok: true; member: AuthMember }
  | { ok: false; destination: string }

export const guardAdminRequest = async (req: IncomingMessage): Promise<AdminGuardResult> => {
  const requestedPath = normalizeNextPath(req.url, "/admin")
  let response: Response

  try {
    response = await serverApiFetch(req, "/member/api/v1/auth/me")
  } catch {
    // 인증 확인 API 일시 오류 시 500으로 터뜨리지 않고 로그인 경로로 안전하게 유도한다.
    return { ok: false, destination: toLoginPath(requestedPath, "/admin") }
  }

  if (response.status === 401) {
    return { ok: false, destination: toLoginPath(requestedPath, "/admin") }
  }
  if (response.status === 403) {
    return { ok: false, destination: "/" }
  }

  if (!response.ok) {
    return { ok: false, destination: toLoginPath(requestedPath, "/admin") }
  }

  const member = (await response.json()) as AuthMember

  if (!member?.isAdmin) {
    return { ok: false, destination: "/" }
  }

  return { ok: true, member }
}
