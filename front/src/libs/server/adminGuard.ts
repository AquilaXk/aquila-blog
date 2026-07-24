import { IncomingMessage } from "http"
import type { AuthMember } from "src/hooks/useAuthSession"
import { normalizeNextPath, toLoginPath } from "src/libs/router"
import { fetchServerAdminSession } from "./authSession"

type AdminGuardResult =
  | { ok: true; member: AuthMember }
  | { ok: false; destination: string }

const QA_ADMIN_MEMBER: AuthMember = {
  id: 1,
  username: "qa-admin",
  nickname: "QA Admin",
  isAdmin: true,
}

/** Playwright webServer sets this when backend is intentionally unreachable. */
const PLAYWRIGHT_BACKEND_ISOLATION_URL = "http://127.0.0.1:1"

const isPlaywrightBackendIsolationMode = () => {
  const raw = process.env.BACKEND_INTERNAL_URL?.trim()
  if (!raw) return false
  return raw.replace(/\/+$/, "") === PLAYWRIGHT_BACKEND_ISOLATION_URL
}

export const shouldBypassAdminGuardForQa = () => {
  const qaFlag =
    process.env.ADMIN_GUARD_QA_BYPASS === "true" || process.env.ENABLE_QA_ROUTES === "true"
  if (!qaFlag) return false

  // Real production must never honor QA flags alone (#1382).
  // Playwright `next start` still uses NODE_ENV=production, so allow only with the
  // backend isolation sentinel that the e2e harness sets.
  if (process.env.NODE_ENV === "production") {
    return isPlaywrightBackendIsolationMode()
  }

  return true
}

export const guardAdminRequest = async (req: IncomingMessage): Promise<AdminGuardResult> => {
  const requestedPath = normalizeNextPath(req.url, "/admin")
  let member: AuthMember | null | undefined

  try {
    member = await fetchServerAdminSession(req)
  } catch {
    // Playwright/QA의 SSR backend 단절 모드(BACKEND_INTERNAL_URL=127.0.0.1:1)에서는
    // admin route snapshot 검증을 위해 가드 우회를 허용한다.
    if (shouldBypassAdminGuardForQa()) {
      return { ok: true, member: QA_ADMIN_MEMBER }
    }

    // 인증 확인 API 일시 오류 시 500으로 터뜨리지 않고 로그인 경로로 안전하게 유도한다.
    return { ok: false, destination: toLoginPath(requestedPath, "/admin") }
  }

  if (member === null) {
    if (shouldBypassAdminGuardForQa()) {
      return { ok: true, member: QA_ADMIN_MEMBER }
    }
    return { ok: false, destination: toLoginPath(requestedPath, "/admin") }
  }

  if (!member) {
    if (shouldBypassAdminGuardForQa()) {
      return { ok: true, member: QA_ADMIN_MEMBER }
    }
    return { ok: false, destination: toLoginPath(requestedPath, "/admin") }
  }

  if (!member?.isAdmin) {
    return { ok: false, destination: "/" }
  }

  return { ok: true, member }
}
