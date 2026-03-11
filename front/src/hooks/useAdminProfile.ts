import { useEffect, useState } from "react"
import { apiFetch } from "src/apis/backend/client"

export type AdminProfile = {
  username: string
  name: string
  nickname: string
  profileImageUrl: string
  profileRole?: string
  profileBio?: string
}

export const useAdminProfile = (initialProfile: AdminProfile | null = null) => {
  const [profile, setProfile] = useState<AdminProfile | null>(initialProfile)

  useEffect(() => {
    if (initialProfile) return

    let mounted = true

    const load = async () => {
      try {
        const data = await apiFetch<AdminProfile>("/member/api/v1/members/adminProfile")
        if (!mounted) return
        setProfile(data)
      } catch {
        if (!mounted) return
        setProfile(null)
      }
    }

    void load()

    return () => {
      mounted = false
    }
  }, [initialProfile])

  return profile
}
