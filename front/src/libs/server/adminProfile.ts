import { IncomingMessage } from "http"
import { AdminProfile } from "src/hooks/useAdminProfile"
import { serverApiFetch } from "./backend"

export const fetchServerAdminProfile = async (
  req: IncomingMessage
): Promise<AdminProfile | null> => {
  try {
    const response = await serverApiFetch(req, "/member/api/v1/members/adminProfile")
    if (!response.ok) return null
    return (await response.json()) as AdminProfile
  } catch {
    return null
  }
}
