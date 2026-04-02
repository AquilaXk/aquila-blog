import { IncomingMessage } from "http"
import { CONFIG } from "site.config"
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

export const hasServerAuthCookie = (req: IncomingMessage) => {
  const rawCookie = req.headers.cookie || ""
  if (!rawCookie) return false

  return rawCookie.includes("apiKey=") || rawCookie.includes("accessToken=")
}

export const buildStaticAdminProfileSnapshot = (): AdminProfile => ({
  username: CONFIG.profile.name,
  name: CONFIG.profile.name,
  nickname: CONFIG.profile.name,
  profileImageUrl: CONFIG.profile.image,
  profileImageDirectUrl: CONFIG.profile.image,
  profileRole: CONFIG.profile.role,
  profileBio: CONFIG.profile.bio,
  aboutRole: CONFIG.profile.role,
  aboutBio: CONFIG.profile.bio,
  blogTitle: CONFIG.blog.title,
  homeIntroTitle: CONFIG.blog.homeIntroTitle,
  homeIntroDescription: CONFIG.blog.homeIntroDescription,
})
