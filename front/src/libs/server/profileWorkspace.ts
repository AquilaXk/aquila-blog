import { IncomingMessage } from "http"
import type { ProfileWorkspaceResponse } from "src/libs/profileWorkspace"
import { serverApiFetchJson } from "./backend"

export const fetchServerProfileWorkspace = async (
  req: IncomingMessage,
  memberId: number
): Promise<ProfileWorkspaceResponse | null> => {
  try {
    return await serverApiFetchJson<ProfileWorkspaceResponse>(
      req,
      `/member/api/v1/adm/members/${memberId}/profileWorkspace`
    )
  } catch {
    return null
  }
}
