import { IncomingMessage } from "http"
import type { AuthMember } from "src/hooks/useAuthSession"
import { serverApiFetch } from "./backend"

type AdminGuardResult =
  | { ok: true; member: AuthMember }
  | { ok: false; destination: string }

export const guardAdminRequest = async (req: IncomingMessage): Promise<AdminGuardResult> => {
  const response = await serverApiFetch(req, "/member/api/v1/auth/me")
  const requestedPath = req.url?.startsWith("/") ? req.url : "/admin"

  if (response.status === 401) {
    return { ok: false, destination: `/login?next=${encodeURIComponent(requestedPath || "/admin")}` }
  }

  if (!response.ok) {
    throw new Error(`Failed to verify admin session: ${response.status}`)
  }

  const member = (await response.json()) as AuthMember

  if (!member?.isAdmin) {
    return { ok: false, destination: "/" }
  }

  return { ok: true, member }
}
