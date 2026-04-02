import { setCookie } from "cookies-next"
import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "src/apis/backend/client"
import type { ProfileCardLinkItem } from "src/constants/profileCardLinks"
import { queryKey } from "src/constants/queryKey"
import type { AboutSectionBlock } from "src/libs/profileWorkspace"

const ADMIN_PROFILE_SNAPSHOT_COOKIE = "admin_profile_snapshot_v1"
const ADMIN_PROFILE_SNAPSHOT_MAX_AGE_SECONDS = 60 * 30

export type AdminProfile = {
  username: string
  name: string
  nickname: string
  modifiedAt?: string
  profileImageUrl: string
  profileImageDirectUrl?: string
  profileRole?: string
  profileBio?: string
  aboutRole?: string
  aboutBio?: string
  aboutDetails?: string
  aboutSections?: AboutSectionBlock[]
  blogTitle?: string
  homeIntroTitle?: string
  homeIntroDescription?: string
  serviceLinks?: ProfileCardLinkItem[]
  contactLinks?: ProfileCardLinkItem[]
}

type AdminProfileLike = {
  username: string
  name?: string
  nickname?: string
  modifiedAt?: string
  profileImageUrl?: string
  profileImageDirectUrl?: string
  profileRole?: string
  profileBio?: string
  aboutRole?: string
  aboutBio?: string
  aboutDetails?: string
  aboutSections?: AboutSectionBlock[]
  blogTitle?: string
  homeIntroTitle?: string
  homeIntroDescription?: string
  serviceLinks?: ProfileCardLinkItem[]
  contactLinks?: ProfileCardLinkItem[]
}

export const toAdminProfile = (value: AdminProfileLike): AdminProfile => ({
  username: value.username,
  name: value.name || value.nickname || value.username,
  nickname: value.nickname || value.name || value.username,
  modifiedAt: value.modifiedAt,
  profileImageUrl: value.profileImageUrl || "",
  profileImageDirectUrl: value.profileImageDirectUrl,
  profileRole: value.profileRole,
  profileBio: value.profileBio,
  aboutRole: value.aboutRole,
  aboutBio: value.aboutBio,
  aboutDetails: value.aboutDetails,
  aboutSections: value.aboutSections || [],
  blogTitle: value.blogTitle,
  homeIntroTitle: value.homeIntroTitle,
  homeIntroDescription: value.homeIntroDescription,
  serviceLinks: value.serviceLinks || [],
  contactLinks: value.contactLinks || [],
})

export const setAdminProfileCache = (queryClient: QueryClient, profile: AdminProfile | null) => {
  queryClient.setQueryData(queryKey.adminProfile(), profile)
}

const persistAdminProfileSnapshotCookie = (profile: AdminProfile) => {
  setCookie(ADMIN_PROFILE_SNAPSHOT_COOKIE, JSON.stringify(toAdminProfile(profile)), {
    path: "/",
    sameSite: "lax",
    maxAge: ADMIN_PROFILE_SNAPSHOT_MAX_AGE_SECONDS,
    secure: typeof window !== "undefined" && window.location.protocol === "https:",
  })
}

export const useAdminProfile = (initialProfile: AdminProfile | null = null) => {
  const isBrowser = typeof window !== "undefined"
  const queryClient = useQueryClient()
  const cacheKey = queryKey.adminProfile()
  const cachedProfile = queryClient.getQueryData<AdminProfile | null>(cacheKey)
  const seededProfile = cachedProfile ?? initialProfile
  const hasSeedProfile = seededProfile != null

  const query = useQuery<AdminProfile | null>({
    queryKey: cacheKey,
    queryFn: async () => {
      try {
        const nextProfile = await apiFetch<AdminProfile>("/member/api/v1/members/adminProfile")
        persistAdminProfileSnapshotCookie(nextProfile)
        return nextProfile
      } catch {
        // 일시적인 네트워크 실패 시 기존 문구가 흔들리지 않도록 마지막 성공 캐시를 우선 유지한다.
        const cached = queryClient.getQueryData<AdminProfile | null>(cacheKey)
        if (cached !== undefined) return cached
        return initialProfile ?? null
      }
    },
    enabled: isBrowser,
    initialData: seededProfile ?? undefined,
    staleTime: hasSeedProfile ? 5 * 60 * 1000 : 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: !hasSeedProfile,
  })

  return query.data ?? initialProfile
}
