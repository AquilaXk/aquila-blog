import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react"
import type { QueryClient } from "@tanstack/react-query"
import { apiFetch, getApiBaseUrl } from "src/apis/backend/client"
import { setAdminProfileCache, toAdminProfile } from "src/hooks/useAdminProfile"
import {
  buildImageOptimizationSummary,
  normalizeProfileImageUploadError,
  prepareProfileImageForUpload,
} from "src/libs/profileImageUpload"
import { saveProfileCardWithConflictRetry } from "src/libs/profileCardSave"

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null

type NoticeState = {
  tone: "idle" | "loading" | "success" | "error"
  text: string
}

type MemberMe = {
  id: number
  createdAt?: string
  modifiedAt?: string
  username: string
  nickname: string
  isAdmin?: boolean
  profileImageUrl?: string
  profileImageDirectUrl?: string
  profileRole?: string
  profileBio?: string
  aboutRole?: string
  aboutBio?: string
  aboutDetails?: string
  blogTitle?: string
  homeIntroTitle?: string
  homeIntroDescription?: string
}

type RunStudioCommand = (key: string, fn: () => Promise<JsonValue>) => Promise<void>

type UseEditorStudioProfileCommandsParams = {
  initialMember: MemberMe
  queryClient: QueryClient
  run: RunStudioCommand
  sessionMember?: MemberMe | null
  setLoadingKey: Dispatch<SetStateAction<string>>
  setMe: (member: any) => void
  setResult: Dispatch<SetStateAction<string>>
  pretty: (value: unknown) => string
  uploadWithConflictRetry: <T>(requestUpload: () => Promise<Response>) => Promise<Response>
}

export const useEditorStudioProfileCommands = ({
  initialMember,
  pretty,
  queryClient,
  run,
  sessionMember,
  setLoadingKey,
  setMe,
  setResult,
  uploadWithConflictRetry,
}: UseEditorStudioProfileCommandsParams) => {
  const member = sessionMember || initialMember
  const [profileImgInputUrl, setProfileImgInputUrl] = useState(() =>
    (initialMember.profileImageDirectUrl || initialMember.profileImageUrl || "").trim()
  )
  const [profileRoleInput, setProfileRoleInput] = useState(initialMember.profileRole || "")
  const [profileBioInput, setProfileBioInput] = useState(initialMember.profileBio || "")
  const [profileImageFileName, setProfileImageFileName] = useState("")
  const [profileImageNotice, setProfileImageNotice] = useState<NoticeState>({
    tone: "idle",
    text: "프로필 이미지는 공개 카드와 작성 미리보기에 함께 사용됩니다.",
  })
  const [profileNotice, setProfileNotice] = useState<NoticeState>({
    tone: "idle",
    text: "역할과 소개 문구를 저장하면 공개 작성자 카드에 반영됩니다.",
  })
  const profileImageFileInputRef = useRef<HTMLInputElement>(null)

  const applyProfileState = useCallback((nextMember: MemberMe) => {
    setProfileRoleInput(nextMember.profileRole || "")
    setProfileBioInput(nextMember.profileBio || "")
    setProfileImgInputUrl((nextMember.profileImageDirectUrl || nextMember.profileImageUrl || "").trim())
  }, [])

  const syncProfileState = useCallback((nextMember: MemberMe) => {
    setMe(nextMember)
    setAdminProfileCache(queryClient, toAdminProfile(nextMember))
    applyProfileState(nextMember)
  }, [applyProfileState, queryClient, setMe])

  const refreshAdminProfile = useCallback(async (memberId: number, fallback?: MemberMe) => {
    try {
      const detailed = await apiFetch<MemberMe>(`/member/api/v1/adm/members/${memberId}`)
      syncProfileState(detailed)
      return detailed
    } catch (error) {
      if (fallback) {
        syncProfileState(fallback)
        return fallback
      }
      throw error
    }
  }, [syncProfileState])

  const handleUploadMemberProfileImage = useCallback(async (selectedFile?: File) => {
    const file = selectedFile || profileImageFileInputRef.current?.files?.[0]
    if (!file) {
      setResult(pretty({ error: "업로드할 이미지 파일을 선택해주세요." }))
      return
    }

    if (!sessionMember?.id) {
      setResult(pretty({ error: "현재 관리자 정보를 확인할 수 없습니다." }))
      return
    }

    try {
      setLoadingKey("admMemberProfileImgUpdate")
      setProfileImageNotice({ tone: "loading", text: "프로필 이미지를 최적화하고 업로드하고 있습니다..." })
      const prepared = await prepareProfileImageForUpload(file)
      const requestUpload = async () => {
        const formData = new FormData()
        formData.append("file", prepared.file, prepared.file.name)
        return await fetch(
          `${getApiBaseUrl()}/member/api/v1/adm/members/${sessionMember.id}/profileImageFile`,
          {
            method: "POST",
            credentials: "include",
            body: formData,
          }
        )
      }

      setProfileImageNotice({ tone: "loading", text: "요청 충돌 여부를 확인하며 업로드 중입니다..." })
      const uploadResponse = await uploadWithConflictRetry(requestUpload)

      const uploadData = (await uploadResponse.json()) as MemberMe
      const uploadedUrl = (uploadData?.profileImageDirectUrl || uploadData?.profileImageUrl || "").trim()
      if (!uploadedUrl) {
        throw new Error("업로드 응답에 이미지 URL이 없습니다.")
      }

      syncProfileState(uploadData)
      setProfileImageNotice({
        tone: "success",
        text: `프로필 이미지가 저장되었습니다. ${buildImageOptimizationSummary(prepared)}`,
      })
      setResult(
        pretty({
          uploadedUrl,
          optimization: buildImageOptimizationSummary(prepared),
          member: uploadData,
        })
      )
    } catch (error) {
      const message = normalizeProfileImageUploadError(error)
      setProfileImageNotice({ tone: "error", text: `프로필 이미지 저장 실패: ${message}` })
      setResult(pretty({ error: message }))
    } finally {
      if (profileImageFileInputRef.current) {
        profileImageFileInputRef.current.value = ""
      }
      setLoadingKey("")
    }
  }, [pretty, sessionMember?.id, setLoadingKey, setResult, syncProfileState, uploadWithConflictRetry])

  const handleProfileImageSelected = useCallback((file: File | null, fileName: string) => {
    setProfileImageFileName(fileName)
    if (file) {
      void handleUploadMemberProfileImage(file)
    }
  }, [handleUploadMemberProfileImage])

  const handleUpdateMemberProfileCard = useCallback(async () => {
    if (!sessionMember?.id) {
      setResult(pretty({ error: "현재 관리자 정보를 확인할 수 없습니다." }))
      return
    }

    try {
      setLoadingKey("admMemberProfileCardUpdate")
      setProfileNotice({ tone: "loading", text: "역할과 소개 문구를 저장하고 있습니다..." })
      const updated = await saveProfileCardWithConflictRetry(() =>
        apiFetch<MemberMe>(`/member/api/v1/adm/members/${sessionMember.id}/profileCard`, {
          method: "PATCH",
          body: JSON.stringify({
            role: profileRoleInput.trim(),
            bio: profileBioInput.trim(),
            aboutRole: (sessionMember.aboutRole || "").trim(),
            aboutBio: (sessionMember.aboutBio || "").trim(),
            aboutDetails: (sessionMember.aboutDetails || "").trim(),
            blogTitle: (sessionMember.blogTitle || "").trim(),
            homeIntroTitle: (sessionMember.homeIntroTitle || "").trim(),
            homeIntroDescription: (sessionMember.homeIntroDescription || "").trim(),
          }),
        })
      )
      syncProfileState(updated)
      setProfileNotice({
        tone: "success",
        text: "역할과 소개 문구가 저장되었습니다. 입력창과 미리보기에 현재 저장값이 반영되었습니다.",
      })
      setResult(pretty(updated as unknown as JsonValue))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setProfileNotice({ tone: "error", text: `프로필 저장 실패: ${message}` })
      setResult(pretty({ error: message }))
    } finally {
      setLoadingKey("")
    }
  }, [
    pretty,
    profileBioInput,
    profileRoleInput,
    sessionMember,
    setLoadingKey,
    setResult,
    syncProfileState,
  ])

  const handleRefreshAdminProfile = useCallback(() => {
    void run("admMemberProfileRefresh", async () => {
      if (!member.id) throw new Error("현재 관리자 정보를 확인할 수 없습니다.")
      setProfileNotice({ tone: "loading", text: "현재 저장값을 다시 불러오는 중입니다..." })
      const refreshed = await refreshAdminProfile(member.id, member)
      if (!refreshed) throw new Error("현재 저장값을 불러오지 못했습니다.")
      setProfileNotice({
        tone: "success",
        text: "현재 저장값을 다시 불러왔습니다. 입력창과 미리보기가 최신 상태입니다.",
      })
      return refreshed as unknown as JsonValue
    })
  }, [member, refreshAdminProfile, run])

  return {
    applyProfileState,
    handleProfileImageSelected,
    handleRefreshAdminProfile,
    handleUpdateMemberProfileCard,
    handleUploadMemberProfileImage,
    member,
    profileBioInput,
    profileImageFileInputRef,
    profileImageFileName,
    profileImageNotice,
    profileImgInputUrl,
    profileNotice,
    profileRoleInput,
    refreshAdminProfile,
    setProfileBioInput,
    setProfileImageNotice,
    setProfileImgInputUrl,
    setProfileNotice,
    setProfileRoleInput,
  }
}
