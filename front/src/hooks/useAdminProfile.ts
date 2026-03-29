import { QueryClient, useQuery } from "@tanstack/react-query"
import { apiFetch } from "src/apis/backend/client"
import type { ProfileCardLinkItem } from "src/constants/profileCardLinks"
import { queryKey } from "src/constants/queryKey"
import type { AboutSectionBlock } from "src/libs/profileWorkspace"

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

export const useAdminProfile = (initialProfile: AdminProfile | null = null) => {
  const isBrowser = typeof window !== "undefined"
  const query = useQuery<AdminProfile | null>({
    queryKey: queryKey.adminProfile(),
    queryFn: async () => {
      try {
        return await apiFetch<AdminProfile>("/member/api/v1/members/adminProfile")
      } catch {
        // 운영에서 adminProfile 조회 실패 시에도 화면은 기본 프로필로 안전하게 유지한다.
        return initialProfile ?? null
      }
    },
    enabled: isBrowser,
    initialData: initialProfile,
    staleTime: initialProfile ? 60 * 1000 : 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: !initialProfile,
  })

  return query.data ?? initialProfile
}
