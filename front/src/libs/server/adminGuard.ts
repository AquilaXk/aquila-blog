import { IncomingMessage } from "http"
import type { AuthMember } from "src/hooks/useAuthSession"
import { normalizeNextPath, toLoginPath } from "src/libs/router"
import { serverApiFetch } from "./backend"

type AdminGuardResult =
  | { ok: true; member: AuthMember }
  | { ok: false; destination: string }

const QA_ADMIN_MEMBER: AuthMember = {
  id: 1,
  username: "qa-admin",
  nickname: "QA Admin",
  isAdmin: true,
}

const shouldBypassAdminGuardForQa = () => {
  if (process.env.ADMIN_GUARD_QA_BYPASS === "true") return true
  if (process.env.NODE_ENV === "production") return false
  return process.env.ENABLE_QA_ROUTES === "true"
}

export const guardAdminRequest = async (req: IncomingMessage): Promise<AdminGuardResult> => {
  const requestedPath = normalizeNextPath(req.url, "/admin")
  let response: Response

  try {
    response = await serverApiFetch(req, "/member/api/v1/auth/me")
  } catch {
    // Playwright/QA의 SSR backend 단절 모드(BACKEND_INTERNAL_URL=127.0.0.1:1)에서는
    // admin route snapshot 검증을 위해 가드 우회를 허용한다.
    if (shouldBypassAdminGuardForQa()) {
      return { ok: true, member: QA_ADMIN_MEMBER }
    }

    // 인증 확인 API 일시 오류 시 500으로 터뜨리지 않고 로그인 경로로 안전하게 유도한다.
    return { ok: false, destination: toLoginPath(requestedPath, "/admin") }
  }

  if (response.status === 401) {
    if (shouldBypassAdminGuardForQa()) {
      return { ok: true, member: QA_ADMIN_MEMBER }
    }
    return { ok: false, destination: toLoginPath(requestedPath, "/admin") }
  }
  if (response.status === 403) {
    return { ok: false, destination: "/" }
  }

  if (!response.ok) {
    if (shouldBypassAdminGuardForQa()) {
      return { ok: true, member: QA_ADMIN_MEMBER }
    }
    return { ok: false, destination: toLoginPath(requestedPath, "/admin") }
  }

  const member = (await response.json()) as AuthMember

  if (!member?.isAdmin) {
    return { ok: false, destination: "/" }
  }

  return { ok: true, member }
}
