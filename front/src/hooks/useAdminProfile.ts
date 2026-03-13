import { QueryClient, useQuery } from "@tanstack/react-query"
import { apiFetch } from "src/apis/backend/client"
import type { ProfileCardLinkItem } from "src/constants/profileCardLinks"
import { queryKey } from "src/constants/queryKey"

export type AdminProfile = {
  username: string
  name: string
  nickname: string
  profileImageUrl: string
  profileImageDirectUrl?: string
  profileRole?: string
  profileBio?: string
  homeIntroTitle?: string
  homeIntroDescription?: string
  serviceLinks?: ProfileCardLinkItem[]
  contactLinks?: ProfileCardLinkItem[]
}

type AdminProfileLike = {
  username: string
  name?: string
  nickname?: string
  profileImageUrl?: string
  profileImageDirectUrl?: string
  profileRole?: string
  profileBio?: string
  homeIntroTitle?: string
  homeIntroDescription?: string
  serviceLinks?: ProfileCardLinkItem[]
  contactLinks?: ProfileCardLinkItem[]
}

export const toAdminProfile = (value: AdminProfileLike): AdminProfile => ({
  username: value.username,
  name: value.name || value.nickname || value.username,
  nickname: value.nickname || value.name || value.username,
  profileImageUrl: value.profileImageUrl || "",
  profileImageDirectUrl: value.profileImageDirectUrl,
  profileRole: value.profileRole,
  profileBio: value.profileBio,
  homeIntroTitle: value.homeIntroTitle,
  homeIntroDescription: value.homeIntroDescription,
  serviceLinks: value.serviceLinks || [],
  contactLinks: value.contactLinks || [],
})

export const setAdminProfileCache = (queryClient: QueryClient, profile: AdminProfile | null) => {
  queryClient.setQueryData(queryKey.adminProfile(), profile)
}

export const useAdminProfile = (initialProfile: AdminProfile | null = null) => {
  const query = useQuery<AdminProfile | null>({
    queryKey: queryKey.adminProfile(),
    queryFn: async () => await apiFetch<AdminProfile>("/member/api/v1/members/adminProfile"),
    initialData: initialProfile,
    staleTime: initialProfile ? 60 * 1000 : 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: !initialProfile,
  })

  return query.data ?? initialProfile
}
