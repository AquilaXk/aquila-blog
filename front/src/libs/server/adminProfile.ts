import { IncomingMessage } from "http"
import { CONFIG } from "site.config"
import { AdminProfile } from "src/hooks/useAdminProfile"
import { serverApiFetch } from "./backend"

type FetchServerAdminProfileOptions = {
  timeoutMs?: number
}

const ADMIN_PROFILE_SNAPSHOT_COOKIE = "admin_profile_snapshot_v1"
const ADMIN_PROFILE_SNAPSHOT_MAX_STALE_MS = 1000 * 60 * 60 * 6

const readCookieValue = (req: IncomingMessage, key: string) => {
  const rawCookie = req.headers.cookie || ""
  if (!rawCookie) return null

  const pairs = rawCookie.split(";")
  for (const pair of pairs) {
    const [cookieKey, ...valueParts] = pair.trim().split("=")
    if (cookieKey !== key) continue
    const value = valueParts.join("=")
    return value ? decodeURIComponent(value) : null
  }

  return null
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

export const buildPersistedAdminProfileSnapshot = (profile: AdminProfile): AdminProfile => ({
  username: profile.username,
  name: profile.name,
  nickname: profile.nickname,
  modifiedAt: profile.modifiedAt,
  profileImageUrl: profile.profileImageUrl,
  profileImageDirectUrl: profile.profileImageDirectUrl,
  profileRole: profile.profileRole,
  profileBio: profile.profileBio,
  aboutRole: profile.aboutRole,
  aboutBio: profile.aboutBio,
  aboutDetails: profile.aboutDetails,
  aboutSections: profile.aboutSections || [],
  blogTitle: profile.blogTitle,
  homeIntroTitle: profile.homeIntroTitle,
  homeIntroDescription: profile.homeIntroDescription,
  serviceLinks: profile.serviceLinks || [],
  contactLinks: profile.contactLinks || [],
})

export const readAdminProfileSnapshotFromCookie = (req: IncomingMessage): AdminProfile | null => {
  const raw = readCookieValue(req, ADMIN_PROFILE_SNAPSHOT_COOKIE)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<AdminProfile>
    if (!parsed || typeof parsed !== "object" || typeof parsed.username !== "string") return null

    if (typeof parsed.modifiedAt === "string") {
      const modifiedAtMs = new Date(parsed.modifiedAt).getTime()
      if (!Number.isFinite(modifiedAtMs)) return null
      if (Date.now() - modifiedAtMs > ADMIN_PROFILE_SNAPSHOT_MAX_STALE_MS) return null
    }

    return buildPersistedAdminProfileSnapshot({
      username: parsed.username,
      name: parsed.name || parsed.nickname || parsed.username,
      nickname: parsed.nickname || parsed.name || parsed.username,
      modifiedAt: parsed.modifiedAt,
      profileImageUrl: parsed.profileImageUrl || CONFIG.profile.image,
      profileImageDirectUrl: parsed.profileImageDirectUrl,
      profileRole: parsed.profileRole,
      profileBio: parsed.profileBio,
      aboutRole: parsed.aboutRole,
      aboutBio: parsed.aboutBio,
      aboutDetails: parsed.aboutDetails,
      aboutSections: Array.isArray(parsed.aboutSections) ? parsed.aboutSections : [],
      blogTitle: parsed.blogTitle,
      homeIntroTitle: parsed.homeIntroTitle,
      homeIntroDescription: parsed.homeIntroDescription,
      serviceLinks: Array.isArray(parsed.serviceLinks) ? parsed.serviceLinks : [],
      contactLinks: Array.isArray(parsed.contactLinks) ? parsed.contactLinks : [],
    })
  } catch {
    return null
  }
}

export const resolvePublicAdminProfileSnapshot = (req: IncomingMessage) => {
  const cookieSnapshot = readAdminProfileSnapshotFromCookie(req)
  if (cookieSnapshot) {
    return {
      profile: cookieSnapshot,
      source: "cookie-snapshot" as const,
    }
  }

  return {
    profile: buildStaticAdminProfileSnapshot(),
    source: "static-snapshot" as const,
  }
}
