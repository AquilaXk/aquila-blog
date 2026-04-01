import { IncomingMessage } from "http"
import { AdminProfile } from "src/hooks/useAdminProfile"
import { serverApiFetch } from "./backend"

type FetchServerAdminProfileOptions = {
  timeoutMs?: number
}

export const fetchServerAdminProfile = async (
  req: IncomingMessage,
  options: FetchServerAdminProfileOptions = {}
): Promise<AdminProfile | null> => {
  try {
    const response = await serverApiFetch(req, "/member/api/v1/members/adminProfile", {
      timeoutMs: options.timeoutMs,
    })
    if (!response.ok) return null
    return (await response.json()) as AdminProfile
  } catch {
    return null
  }
}
