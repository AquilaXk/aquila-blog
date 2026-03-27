import { IncomingMessage } from "http"
import type { ProfileWorkspaceResponse } from "src/libs/profileWorkspace"
import { serverApiFetch } from "./backend"

export const fetchServerProfileWorkspace = async (
  req: IncomingMessage,
  memberId: number
): Promise<ProfileWorkspaceResponse | null> => {
  try {
    const response = await serverApiFetch(req, `/member/api/v1/adm/members/${memberId}/profileWorkspace`)
    if (!response.ok) return null
    return (await response.json()) as ProfileWorkspaceResponse
  } catch {
    return null
  }
}
