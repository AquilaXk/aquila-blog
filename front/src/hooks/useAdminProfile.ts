import { useEffect, useState } from "react"
import { apiFetch } from "src/apis/backend/client"

export type AdminProfile = {
  username: string
  name: string
  nickname: string
  profileImageUrl: string
  profileImageDirectUrl?: string
  profileRole?: string
  profileBio?: string
}

export const useAdminProfile = (initialProfile: AdminProfile | null = null) => {
  const [profile, setProfile] = useState<AdminProfile | null>(initialProfile)

  useEffect(() => {
    if (initialProfile) {
      setProfile(initialProfile)
      return
    }

    let mounted = true

    const load = async () => {
      try {
        const data = await apiFetch<AdminProfile>("/member/api/v1/members/adminProfile")
        if (!mounted) return
        setProfile(data)
      } catch {
        if (!mounted) return
        // 공개 프로필 재조회가 일시 실패하더라도 마지막 정상값은 유지한다.
        setProfile((current) => current ?? initialProfile)
      }
    }

    void load()

    return () => {
      mounted = false
    }
  }, [initialProfile])

  return profile ?? initialProfile
}
